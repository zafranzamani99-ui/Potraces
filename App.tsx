import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableWithoutFeedback, Keyboard, AppState, Linking, Platform } from 'react-native';
import { requestTrackingPermissionsAsync, getTrackingPermissionsAsync } from 'expo-tracking-transparency';
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
import { registerPushNotifications } from './src/services/pushNotifications';
import * as Notifications from 'expo-notifications';
import { globalShowToast } from './src/context/ToastContext';
import { useSellerStore } from './src/store/sellerStore';
import { useAppStore } from './src/store/appStore';
import { useSettingsStore, clearBusinessLocalData } from './src/store/settingsStore';
import { navigationRef } from './src/navigation/navigationRef';
import { openQuickAdd } from './src/components/common/QuickAddExpense';
import BiometricGate from './src/components/common/BiometricGate';
import PersonalSyncManager from './src/components/common/PersonalSyncManager';
import { checkStorageIntegrity, clearCorruptedStores } from './src/services/storageIntegrity';
import { usePersonalStore } from './src/store/personalStore';
import { ensurePermissionAndScheduleAll, scheduleBehavior as scheduleSubBehavior } from './src/services/subscriptionNotifications';
import { maybeRunSpendingAlertCheck } from './src/services/spendingAlerts';
import { recordFirstRun, maybeRequestReview } from './src/services/reviewPrompt';
import { syncPersonal } from './src/services/personalSync';
import { runReceiptDrain } from './src/services/receiptQueueDrainer';
import { withBackoff } from './src/services/syncBackoff';
import NetInfo from '@react-native-community/netinfo';
import { prefetchWalletLogos } from './src/utils/prefetchAssets';

// Debounced auto-sync — pushes to Supabase ~1.5s after any data mutation
let _autoSyncTimeout: ReturnType<typeof setTimeout> | null = null;
let _unsubAutoSync: (() => void) | null = null;
let _unsubSubSched: (() => void) | null = null;
let _lastForegroundSync = 0;

export default function App() {
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
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
      ]);

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

      // Record first-run timestamp for the review-prompt gate.
      recordFirstRun().catch(() => {});

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

      // iOS ATT: request tracking permission after onboarding (once, non-blocking).
      // Only meaningful on iOS 14.5+; harmless no-op elsewhere.
      if (Platform.OS === 'ios' && useSettingsStore.getState().hasCompletedOnboarding) {
        try {
          const current = await getTrackingPermissionsAsync();
          if (current.status === 'undetermined') {
            await requestTrackingPermissionsAsync();
          }
        } catch {
          // ignore — App Store requires the prompt; if system denies we fall through
        }
      }

      // Sync + push for any authenticated session (anonymous or verified)
      if (session) {
        try {
          const { products, orders, seasons, sellerCustomers } = useSellerStore.getState();
          await syncAll(products, orders, seasons, sellerCustomers);

          // Pull any order_link orders placed while app was closed
          await pullOrderLinkOrders();

          // Register push notifications (saves token to Supabase)
          registerPushNotifications().catch(() => {});

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
      }
    });
    return () => sub.remove();
  }, []);

  // Deep link: potraces://quick-add → open quick expense modal
  React.useEffect(() => {
    const handleUrl = ({ url }: { url: string }) => {
      if (url?.includes('quick-add')) openQuickAdd();
    };
    // Handle app opened via deep link
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
      if (data?.type === 'new_order' && data.orderId) {
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
                    <RootNavigator />
                  </BiometricGate>
                </ToastProvider>
              </View>
            </TouchableWithoutFeedback>
          </GestureHandlerRootView>
        </KeyboardProvider>
      </SafeAreaProvider>
    </RootSiblingParent>
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
