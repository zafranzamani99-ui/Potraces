import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableWithoutFeedback, Keyboard, AppState, Linking, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { RootSiblingParent } from 'react-native-root-siblings';
import RootNavigator from './src/navigation/RootNavigator';
import { COLORS, SPACING, TYPOGRAPHY } from './src/constants';
import { useIsDark } from './src/hooks/useCalm';
import { ToastProvider } from './src/context/ToastContext';
import { supabase, getAuthSession } from './src/services/supabase';
import { syncAll, pullOrderLinkOrders, subscribeToOrderLinkOrders, getCachedProfileId, clearProfileCache } from './src/services/sellerSync';
import { useAuthStore } from './src/store/authStore';
import { registerPushNotifications, registerAndroidNotificationChannels } from './src/services/pushNotifications';
import * as Notifications from 'expo-notifications';
import { globalShowToast } from './src/context/ToastContext';
import { useSellerStore } from './src/store/sellerStore';
import { useAppStore } from './src/store/appStore';
import { useSettingsStore, clearBusinessLocalData } from './src/store/settingsStore';
import { navigationRef } from './src/navigation/navigationRef';
import { openQuickAdd } from './src/components/common/QuickAddExpense';
import { logQuickExpense, undoQuickExpense } from './src/services/quickLog';
import BiometricGate from './src/components/common/BiometricGate';
import ErrorBoundary from './src/components/common/ErrorBoundary';
import ForcedUpdateGate from './src/components/common/ForcedUpdateGate';
import PersonalSyncManager from './src/components/common/PersonalSyncManager';
import TapToPayProvider from './src/components/common/TapToPayProvider';
import { checkStorageIntegrity, clearCorruptedStores } from './src/services/storageIntegrity';
import { usePersonalStore } from './src/store/personalStore';
import { ensurePermissionAndScheduleAll, scheduleBehavior as scheduleSubBehavior } from './src/services/subscriptionNotifications';
import { maybeRunSpendingAlertCheck } from './src/services/spendingAlerts';
import { recordFirstRun, maybeRequestReview } from './src/services/reviewPrompt';
import { syncPersonal } from './src/services/personalSync';
import { runReceiptDrain } from './src/services/receiptQueueDrainer';
import { snapshotAll } from './src/services/storageBackup';
import { withBackoff } from './src/services/syncBackoff';
import NetInfo from '@react-native-community/netinfo';
import { prefetchWalletLogos } from './src/utils/prefetchAssets';
import { useWalletStore } from './src/store/walletStore';
import { useDebtStore } from './src/store/debtStore';
import { autoReconcileWallets } from './src/utils/walletReconcile';
import { useTombstoneStore } from './src/store/tombstoneStore';
import { maybeCheckStorage } from './src/utils/storageMonitor';
import { configureGoogleSignIn } from './src/services/googleAuth';
import { checkForcedUpdate, UpdateStatus } from './src/services/appConfig';
import * as Sentry from '@sentry/react-native';

// Crash + error reporting. The DSN comes from env (EXPO_PUBLIC_SENTRY_DSN) so it
// can be set per-build via EAS secrets; init() no-ops entirely when the DSN is
// absent, so dev/local builds report nothing. ErrorBoundary already forwards
// caught React errors via Sentry.captureException — they activate once init runs.
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    enabled: !__DEV__,
    sendDefaultPii: false, // never attach PII / money data by default
  });
}

// Debounced auto-sync — pushes to Supabase ~1.5s after any data mutation
let _autoSyncTimeout: ReturnType<typeof setTimeout> | null = null;
let _unsubAutoSync: (() => void) | null = null;
let _unsubSubSched: (() => void) | null = null;
let _lastForegroundSync = 0;

function App() {
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [update, setUpdate] = React.useState<UpdateStatus | null>(null);
  const mode = useAppStore((s) => s.mode);
  const isDark = useIsDark();

  React.useEffect(() => {
    let cancelled = false;
    let unsubOrderLink: (() => void) | null = null;

    const waitForStore = (store: any) =>
      new Promise<void>((resolve) => {
        if (store.persist.hasHydrated()) { resolve(); return; }
        const unsub = store.persist.onFinishHydration(() => { unsub(); resolve(); });
      });

    const init = async () => {
      // Configure Google Sign-In SDK (synchronous, no credentials needed at this point)
      configureGoogleSignIn();

      // Kick off logo pre-decode in parallel — does not block startup
      prefetchWalletLogos();

      // Check AsyncStorage integrity BEFORE hydration so a corrupted blob
      // can be handled gracefully instead of silently wiping data.
      try {
        const report = await checkStorageIntegrity();
        if (report.corrupted.length > 0) {
          if (__DEV__) console.warn('[Storage] corrupted blobs detected:', report.corrupted);
          // Non-blocking for now: clear the bad keys so stores can hydrate clean.
          // TODO: surface a UI prompt that offers cloud restore once personal sync ships.
          await clearCorruptedStores(report.corrupted);
        }
      } catch {
        // best-effort
      }

      // Wait for store hydration
      await Promise.all([
        waitForStore(useSellerStore),
        waitForStore(useSettingsStore),
        waitForStore(useAuthStore),
        waitForStore(usePersonalStore),
        waitForStore(useWalletStore),
        waitForStore(useDebtStore),
        waitForStore(useTombstoneStore),
      ]);

      // Local rolling safety net: snapshot the money/data stores once per day so a
      // bad write (sync bug, crash, migration) is never an unrecoverable loss again.
      // Non-blocking, best-effort. See src/services/storageBackup.ts.
      snapshotAll().catch(() => {});


      // Reconcile wallet balances after all stores have hydrated.
      // Catches drift from CF-02 (crash between cross-store mutations)
      // and CF-10 (multi-device sync overwriting balances).
      try {
        autoReconcileWallets();
      } catch {
        // best-effort — don't block startup
      }

      // Check existing auth session
      const session = await getAuthSession();
      const authStore = useAuthStore.getState();
      if (session) {
        authStore.setAuthenticated(true);
        authStore.setUserId(session.user.id);
      } else if (authStore.isAuthenticated) {
        // Stale local auth — session no longer valid
        authStore.reset();
      }

      // Apply default mode on launch (only if authenticated for business)
      const { defaultMode, businessModeEnabled } = useSettingsStore.getState();
      if (businessModeEnabled && defaultMode === 'business' && session && authStore.isVerified) {
        useAppStore.getState().setMode('business');
      }

      if (!cancelled) setIsLoading(false);

      // Async storage size check — once per day, after a short delay so it
      // doesn't compete with startup rendering. Warns if approaching 6MB limit.
      setTimeout(() => {
        maybeCheckStorage((msg, type) => globalShowToast(msg, type)).catch(() => {});
      }, 3000);

      // Record first-run timestamp for the review-prompt gate.
      recordFirstRun().catch(() => {});

      // Ensure Android notification channels exist for ALL notification types
      // (seller orders + personal spending alerts / bills / QR reminders) so
      // personal local notifications render with the right importance/sound.
      // Independent of permission; no-op off Android.
      registerAndroidNotificationChannels().catch(() => {});

      // Schedule local bill reminders for active subscriptions.
      try {
        scheduleSubBehavior();
        const subs = usePersonalStore.getState().subscriptions.filter((s) => s.isActive);
        if (subs.length > 0) {
          await ensurePermissionAndScheduleAll(subs);
        }
      } catch {
        // best-effort
      }

      // Debounced re-schedule on subscription list changes (add/update/delete).
      let subReschedTimer: ReturnType<typeof setTimeout> | null = null;
      _unsubSubSched?.();
      _unsubSubSched = usePersonalStore.subscribe((state, prev) => {
        if (state.subscriptions === prev.subscriptions) return;
        if (subReschedTimer) clearTimeout(subReschedTimer);
        subReschedTimer = setTimeout(() => {
          const active = usePersonalStore.getState().subscriptions.filter((s) => s.isActive);
          ensurePermissionAndScheduleAll(active).catch(() => {});
        }, 1000);
      });

      // After any new transaction, consider requesting a store review.
      // The service enforces its own gates (10+ tx, 2-day install, 90-day cooldown).
      const initialTxCount = usePersonalStore.getState().transactions.length;
      let lastTxCount = initialTxCount;
      usePersonalStore.subscribe((state) => {
        const count = state.transactions.length;
        if (count > lastTxCount) {
          lastTxCount = count;
          maybeRequestReview().catch(() => {});
        } else {
          lastTxCount = count;
        }
      });

      // Sync + push for any authenticated session (anonymous or verified)
      if (session) {
        try {
          useSellerStore.getState().setSyncing(true);
          try {
            const { products, orders, seasons, sellerCustomers } = useSellerStore.getState();
            await syncAll(products, orders, seasons, sellerCustomers);
          } finally {
            useSellerStore.getState().setSyncing(false);
          }

          // Pull any order_link orders placed while app was closed
          await pullOrderLinkOrders();

          // Register push notifications (saves token to Supabase) WITHOUT
          // firing a cold OS permission prompt at session startup. Returning
          // users who already granted still get their token + channel
          // registered; new users are prompted later from a contextual moment
          // (first order created) via registerPushNotifications({ promptIfNeeded: true }).
          registerPushNotifications({ promptIfNeeded: false }).catch(() => {});

          // Auto-sync: push to Supabase ~1.5s after any data mutation
          _unsubAutoSync?.();
          _unsubAutoSync = useSellerStore.subscribe((state, prev) => {
            if (
              state.orders === prev.orders &&
              state.products === prev.products &&
              state.seasons === prev.seasons &&
              state.sellerCustomers === prev.sellerCustomers &&
              state.ingredientCosts === prev.ingredientCosts &&
              state.recurringCosts === prev.recurringCosts &&
              state.costTemplates === prev.costTemplates
            ) return;
            if (_autoSyncTimeout) clearTimeout(_autoSyncTimeout);
            _autoSyncTimeout = setTimeout(() => {
              const s = useSellerStore.getState();
              syncAll(s.products, s.orders, s.seasons, s.sellerCustomers).catch(() => {});
            }, 1500);
          });

          // Subscribe to new order_link orders in real time (in-app alert when foregrounded)
          const profileId = getCachedProfileId();
          if (profileId && !cancelled) {
            unsubOrderLink = subscribeToOrderLinkOrders(profileId, (row) => {
              useSellerStore.getState().addOrderLinkOrder(row);
              // Only show in-app toast if notifications are enabled
              if (useSettingsStore.getState().notificationsEnabled) {
                const name = (row.customer_name as string | null) ?? 'Pelanggan';
                const amt = row.total_amount != null ? ` · RM ${Number(row.total_amount).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '';
                globalShowToast(`Pesanan baru dari ${name}${amt}`, 'info');
              }
            });
          }
        } catch {
          // Sync errors are non-fatal
        }
      }
    };

    init();
    return () => {
      cancelled = true;
      unsubOrderLink?.();
      _unsubAutoSync?.();
      _unsubSubSched?.();
      if (_autoSyncTimeout) clearTimeout(_autoSyncTimeout);
    };
  }, []);

  // Auth state change listener — sync authStore with Supabase session
  React.useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const auth = useAuthStore.getState();
      if (event === 'SIGNED_IN' && session) {
        auth.setAuthenticated(true);
        auth.setUserId(session.user.id);
        // Trigger sync so data loads immediately after re-login.
        const store = useSellerStore.getState();
        store.setSyncing(true);
        const { products, orders, seasons, sellerCustomers } = store;
        syncAll(products, orders, seasons, sellerCustomers)
          .then(() => pullOrderLinkOrders())
          .catch(() => {})
          .finally(() => useSellerStore.getState().setSyncing(false));
      } else if (event === 'SIGNED_OUT') {
        auth.reset();
        clearProfileCache();
        // Disable personal sync — it can't run without a session.
        useSettingsStore.getState().setPersonalSyncEnabled(false);
        // Clear business-mode local data so a forced/expired sign-out (not just
        // the explicit Settings one) can't leave the previous seller's data for
        // the next user on a shared device. Personal data is left intact — its
        // sync is opt-in, so it may be the only copy.
        clearBusinessLocalData().catch(() => {});
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Net connectivity recovery — trigger sync when offline → online.
  React.useEffect(() => {
    let wasOffline = false;
    const unsub = NetInfo.addEventListener((st) => {
      const online = !!st.isConnected && st.isInternetReachable !== false;
      if (online && wasOffline) {
        wasOffline = false;
        // Personal opt-in sync — skipped if under backoff, retries with exponential delay
        withBackoff('personalSync', syncPersonal).catch(() => {});
        // Drain any receipt scans that were queued while offline
        withBackoff('receiptDrain', runReceiptDrain).catch(() => {});
        // Seller sync if authenticated
        const { isAuthenticated, isVerified } = useAuthStore.getState();
        if (isAuthenticated && isVerified) {
          const { products, orders, seasons, sellerCustomers } = useSellerStore.getState();
          withBackoff('sellerSync', () =>
            syncAll(products, orders, seasons, sellerCustomers),
          ).catch(() => {});
        }
      } else if (!online) {
        wasOffline = true;
      }
    });
    return () => unsub();
  }, []);

  // Re-sync whenever the app comes back to the foreground (only if authenticated)
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        // Keep the Supabase session refresh timer alive while foregrounded so the
        // rotating refresh token can't lapse on an idle device (which would make
        // sync silently stop). Supabase RN requires start/stop tied to AppState.
        supabase.auth.startAutoRefresh();
        // Spending alerts — daily cadence, no-op if disabled or recent.
        maybeRunSpendingAlertCheck().catch(() => {});
        // Retry any queued receipt scans.
        withBackoff('receiptDrain', runReceiptDrain).catch(() => {});

        const now = Date.now();
        if (now - _lastForegroundSync < 10000) return; // Skip if synced within 10s
        _lastForegroundSync = now;
        const { isAuthenticated, isVerified } = useAuthStore.getState();
        if (!isAuthenticated || !isVerified) return;
        const { products, orders, seasons, sellerCustomers } = useSellerStore.getState();
        withBackoff('sellerSync', () =>
          syncAll(products, orders, seasons, sellerCustomers),
        ).catch(() => {});
      } else {
        // Backgrounded / inactive: stop the refresh timer (Supabase RN guidance).
        supabase.auth.stopAutoRefresh();
      }
    });
    return () => sub.remove();
  }, []);

  // Deep link / Back Tap / Apple Shortcut: log or open Quick Add from outside.
  //   potraces://add                                  → open Quick Add (expense)
  //   potraces://income                               → open Quick Add (income)
  //   potraces://add?amount=35.50&category=entertainment&date=2026-04-07
  //                                                   → log it directly (with Undo)
  //   potraces://add?amount=20&type=income&note=gig   → log income directly
  //   potraces://quick-add                            → legacy alias (open, expense)
  // A Shortcut collects amount/category/date with native prompts, then hands the
  // values here. With an amount we log straight away (the Shortcut already
  // confirmed the details) and show an Undo toast; without one we just open the
  // sheet. Switches to personal mode first so it works from business / cold start.
  React.useEffect(() => {
    const handleUrl = ({ url }: { url: string }) => {
      if (!url) return;
      const rest = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
      const [pathRaw, queryRaw = ''] = rest.split('?');
      const head = pathRaw.split('/').filter(Boolean)[0]?.toLowerCase() || '';
      const isAdd = ['add', 'quick-add', 'quickadd', 'add-income', 'add-expense', 'income', 'log'].includes(head);
      if (!isAdd) return;

      const params: Record<string, string> = {};
      queryRaw.split('&').forEach((pair) => {
        if (!pair) return;
        const eq = pair.indexOf('=');
        const k = (eq >= 0 ? pair.slice(0, eq) : pair).toLowerCase();
        const v = eq >= 0 ? pair.slice(eq + 1) : '';
        try {
          params[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
        } catch {
          params[k] = v;
        }
      });

      const wantsIncome =
        head === 'income' || head === 'add-income' ||
        (params.type || '').toLowerCase() === 'income' || 'income' in params;

      if (useAppStore.getState().mode !== 'personal') {
        useAppStore.getState().setMode('personal');
      }

      const amountStr = params.amount ?? params.amt ?? '';
      const amount = parseFloat(amountStr.replace(/[^0-9.]/g, ''));

      if (amountStr && !Number.isNaN(amount) && amount > 0) {
        // Shortcut already collected the details → log directly, offer Undo.
        let date: Date | undefined;
        const rawDate = params.date || params.day;
        if (rawDate) {
          const d = new Date(rawDate);
          if (!Number.isNaN(d.getTime())) date = d;
        }
        setTimeout(() => {
          const result = logQuickExpense({
            amount,
            type: wantsIncome ? 'income' : 'expense',
            category: params.category || params.cat,
            wallet: params.wallet || params.account || params.method || params.from,
            date,
            note: params.note || params.description || params.desc,
          });
          if (result) {
            const dir = result.type === 'income' ? 'came in' : 'went out';
            const via = result.walletName ? ` · ${result.walletName}` : '';
            globalShowToast(
              `RM ${result.amount.toFixed(2)} ${dir}${via}`,
              'success',
              { label: 'Undo', onPress: () => undoQuickExpense(result) },
            );
          }
        }, 350);
      } else {
        // No amount → open the Quick Add sheet for manual entry.
        setTimeout(() => openQuickAdd(wantsIncome ? 'income' : 'expense'), 300);
      }
    };
    // Handle app opened via deep link (cold start)
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl({ url });
    });
    // Handle deep link while app is open
    const sub = Linking.addEventListener('url', handleUrl);
    return () => sub.remove();
  }, []);

  // Push notification tap → navigate to order
  React.useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { type?: string; orderId?: string } | undefined;
      if ((data?.type === 'new_order' || data?.type === 'payment_received') && data.orderId) {
        // Switch to business mode and navigate to order
        useAppStore.getState().setMode('business');
        // Small delay to let mode switch + navigator mount
        setTimeout(() => {
          if (navigationRef.isReady()) {
            (navigationRef as any).navigate('SellerOrderList', { orderId: data.orderId });
          }
        }, 300);
      }
    });
    return () => sub.remove();
  }, []);

  // Forced-update / kill-switch gate — fail-open (see services/appConfig.ts).
  React.useEffect(() => {
    checkForcedUpdate().then(setUpdate).catch(() => {});
  }, []);

  if (update?.required) {
    return (
      <SafeAreaProvider>
        <ForcedUpdateGate storeUrl={update.storeUrl} message={update.message} />
      </SafeAreaProvider>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading Potraces...</Text>
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <RootSiblingParent>
        <SafeAreaProvider>
          <KeyboardProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                <View style={{ flex: 1 }}>
                  <ToastProvider>
                    <StatusBar style={isDark ? 'light' : 'dark'} />
                    <BiometricGate>
                      <PersonalSyncManager />
                      <TapToPayProvider>
                        <RootNavigator />
                      </TapToPayProvider>
                    </BiometricGate>
                  </ToastProvider>
                </View>
              </TouchableWithoutFeedback>
            </GestureHandlerRootView>
          </KeyboardProvider>
        </SafeAreaProvider>
      </RootSiblingParent>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: SPACING.lg,
    fontSize: TYPOGRAPHY.size.base,
    color: COLORS.textSecondary,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: COLORS.danger,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  errorTitle: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: '#fff',
    marginBottom: SPACING.lg,
  },
  errorText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: '#fff',
    textAlign: 'center',
  },
});

// Wrap with Sentry only when active so there is zero overhead without a DSN.
export default SENTRY_DSN ? Sentry.wrap(App) : App;
