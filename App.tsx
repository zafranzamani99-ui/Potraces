import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableWithoutFeedback, Keyboard, AppState, Linking, Platform, Appearance, NativeModules, NativeEventEmitter } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { RootSiblingParent } from 'react-native-root-siblings';
import RootNavigator from './src/navigation/RootNavigator';
import { COLORS, SPACING, TYPOGRAPHY } from './src/constants';
import { useIsDark } from './src/hooks/useCalm';
import { ToastProvider } from './src/context/ToastContext';
import { RewardModalProvider } from './src/context/RewardModalContext';
import { supabaseBusiness, supabasePersonal, getAuthSession } from './src/services/supabase';
import { isAuthFlowInFlight } from './src/services/authFlow';
import { syncAll, pullOrderLinkOrders, subscribeToOrderLinkOrders, getCachedProfileId, clearProfileCache } from './src/services/sellerSync';
import { useAuthStore } from './src/store/authStore';
import { registerPushNotifications, registerPersonalDeviceToken, registerAndroidNotificationChannels, registerBroadcastDevice } from './src/services/pushNotifications';
import * as Notifications from 'expo-notifications';
import { globalShowToast } from './src/context/ToastContext';
import { useSellerStore } from './src/store/sellerStore';
import { useAppStore } from './src/store/appStore';
import { useSettingsStore, clearBusinessLocalData } from './src/store/settingsStore';
import { navigationRef } from './src/navigation/navigationRef';
import { openQuickAdd } from './src/components/common/QuickAddExpense';
import { logQuickExpense, undoQuickExpense } from './src/services/quickLog';
import {
  logPaymentFromShare,
  reconcileSharedPayments,
  flushPendingReceiptReview,
  openSharedReceiptById,
  openSharedTextReceiptById,
} from './src/services/shareToLog';
import { writeMetroHostFromBundleUrl } from './src/utils/shareExtBridge';
import { drainQuickLogInbox, subscribeQuickLogInbox } from './src/services/quickLogInbox';
import { refreshQuickLogConfigured } from './src/services/quickLogKey';
import './src/services/quickLogCategories'; // side-effect: keeps the Shortcut's live category list fresh
import './src/services/profileSync'; // side-effect: keeps the shared avatar profile fresh
import { parseAmountLoose } from './src/utils/parseAmountLoose';
import BiometricGate from './src/components/common/BiometricGate';
import ErrorBoundary from './src/components/common/ErrorBoundary';
import ForcedUpdateGate from './src/components/common/ForcedUpdateGate';
import PersonalSyncManager from './src/components/common/PersonalSyncManager';
import { initBilling } from './src/services/billing';
import { refreshEntitlement, claimStagedReferral, stagePendingReferral, maybeShowRewardsIntro } from './src/services/entitlements';
import { usePremiumStore } from './src/store/premiumStore';
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
import { useNotificationStore, BroadcastRow } from './src/store/notificationStore';
import { flushInlineThreadsToHistory } from './src/store/echoInlineStore';
import QuickLogPromoModal from './src/components/common/QuickLogPromoModal';
import { en } from './src/i18n/en';
import { ms } from './src/i18n/ms';
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

// Pull active broadcasts from the announcements table into the local inbox.
// Idempotent (mergeBroadcasts dedupes by id), so it's safe to call on launch and
// again whenever a broadcast push arrives or is tapped — that's how a broadcast
// sent while the app is running still lands in the bell.
async function refreshBroadcasts() {
  try {
    const { data } = await supabasePersonal
      .from('announcements')
      .select('id,title,body,created_at')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(50);
    if (data && data.length) useNotificationStore.getState().mergeBroadcasts(data as BroadcastRow[]);
  } catch {
    /* best-effort */
  }
}

function App() {
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [update, setUpdate] = React.useState<UpdateStatus | null>(null);
  // Quick-log promo — one-shot, fires after the 3rd manual log (when the user
  // has felt the friction quick-logging removes). Skipped if already set up.
  const [promoVisible, setPromoVisible] = React.useState(false);
  const mode = useAppStore((s) => s.mode);
  const isDark = useIsDark();
  const themePreference = useSettingsStore((s) => s.themePreference);

  // Native UIKit chrome (the iOS 26 system tab bar, native-stack headers) follows
  // the OS appearance, not our in-app theme — sync the override so both match.
  // 'system' clears the override back to the device setting.
  React.useEffect(() => {
    Appearance.setColorScheme(themePreference === 'system' ? null : themePreference);
  }, [themePreference]);

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
      // RevenueCat billing — no-op until API keys are set (keeps the local unlock in dev).
      initBilling().catch(() => {});

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

      // Check existing auth sessions — business + personal are independent.
      const [bizSession, perSession] = await Promise.all([
        getAuthSession(supabaseBusiness),
        getAuthSession(supabasePersonal),
      ]);
      const authStore = useAuthStore.getState();
      if (bizSession) {
        authStore.setBusinessAuth({ isAuthenticated: true, userId: bizSession.user.id });
      } else if (authStore.business.isAuthenticated) {
        authStore.resetBusiness(); // stale local business auth — session gone
      }
      if (perSession) {
        authStore.setPersonalAuth({ isAuthenticated: true, userId: perSession.user.id });
      } else if (authStore.personal.isAuthenticated) {
        authStore.resetPersonal(); // stale local personal auth — session gone
      }

      // Apply default mode on launch (only if authenticated + verified for business)
      const { defaultMode, businessModeEnabled } = useSettingsStore.getState();
      if (businessModeEnabled && defaultMode === 'business' && bizSession && useAuthStore.getState().business.isVerified) {
        useAppStore.getState().setMode('business');
      }

      // Server entitlement (premium grants/rewards) — one call per launch, after
      // the mode pick so it reads the ACTIVE account. Fail-soft. The one-time
      // rewards intro follows so it never stacks on an "earned" modal.
      refreshEntitlement()
        .catch(() => {})
        .then(() => maybeShowRewardsIntro())
        .catch(() => {});
      // A referral staged from a deep link / clipboard / onboarding is claimed once
      // there's a session (no-op while signed out — it stays staged).
      claimStagedReferral().catch(() => {});

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

      // Sync + push for any authenticated business session (anonymous or verified)
      if (bizSession) {
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

  // Business auth listener — keeps the business slot + seller sync in step with
  // the business Supabase session only.
  React.useEffect(() => {
    const { data: { subscription } } = supabaseBusiness.auth.onAuthStateChange((event, session) => {
      const auth = useAuthStore.getState();
      if (event === 'SIGNED_IN' && session) {
        // Stand down while AuthScreen is mid sign-in/sign-up: it writes the auth state
        // itself (incl. provider/phone/isVerified) and, on sign-up, seeds the OTP verify
        // screen FIRST. Flipping isAuthenticated here fires the instant the session is
        // created — seconds before requestOtp() returns — which strands the user on
        // BusinessSetup until the verify screen finally appears.
        if (!isAuthFlowInFlight()) {
          auth.setBusinessAuth({ isAuthenticated: true, userId: session.user.id });
        }
        // Trigger sync so data loads immediately after re-login.
        const store = useSellerStore.getState();
        store.setSyncing(true);
        const { products, orders, seasons, sellerCustomers } = store;
        syncAll(products, orders, seasons, sellerCustomers)
          .then(() => pullOrderLinkOrders())
          .catch(() => {})
          .finally(() => useSellerStore.getState().setSyncing(false));
        // Server entitlement for the account that just signed in. Fail-soft.
        refreshEntitlement()
          .catch(() => {})
          .then(() => maybeShowRewardsIntro())
          .catch(() => {});
      } else if (event === 'SIGNED_OUT') {
        auth.resetBusiness();
        usePremiumStore.getState().resetServerEntitlement();
        clearProfileCache();
        // Clear business-mode local data so a forced/expired sign-out (not just
        // the explicit Settings one) can't leave the previous seller's data for
        // the next user on a shared device. Personal data is untouched — it has
        // its own independent session now.
        clearBusinessLocalData().catch(() => {});
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Personal auth listener — keeps the personal slot + personal cloud backup in
  // step with the personal Supabase session only.
  React.useEffect(() => {
    const { data: { subscription } } = supabasePersonal.auth.onAuthStateChange((event, session) => {
      const auth = useAuthStore.getState();
      if (event === 'SIGNED_IN' && session) {
        auth.setPersonalAuth({ isAuthenticated: true, userId: session.user.id });
        // Pull/push personal data immediately, only if the user opted into backup.
        if (useSettingsStore.getState().personalSyncEnabled) syncPersonal().catch(() => {});
        // Server entitlement + any referral staged before this account existed.
        refreshEntitlement()
          .catch(() => {})
          .then(() => maybeShowRewardsIntro())
          .catch(() => {});
        claimStagedReferral().catch(() => {});
      } else if (event === 'SIGNED_OUT') {
        auth.resetPersonal();
        usePremiumStore.getState().resetServerEntitlement();
        // Personal sync can't run without a session.
        useSettingsStore.getState().setPersonalSyncEnabled(false);
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
        const { isAuthenticated, isVerified } = useAuthStore.getState().business;
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
        supabaseBusiness.auth.startAutoRefresh();
        supabasePersonal.auth.startAutoRefresh();
        // Spending alerts — daily cadence, no-op if disabled or recent.
        maybeRunSpendingAlertCheck().catch(() => {});
        // Server entitlement refresh on foreground (same fail-soft call as launch).
        refreshEntitlement().catch(() => {});
        // Retry any queued receipt scans.
        withBackoff('receiptDrain', runReceiptDrain).catch(() => {});

        const now = Date.now();
        if (now - _lastForegroundSync < 10000) return; // Skip if synced within 10s
        _lastForegroundSync = now;
        const { isAuthenticated, isVerified } = useAuthStore.getState().business;
        if (!isAuthenticated || !isVerified) return;
        const { products, orders, seasons, sellerCustomers } = useSellerStore.getState();
        withBackoff('sellerSync', () =>
          syncAll(products, orders, seasons, sellerCustomers),
        ).catch(() => {});
      } else {
        // Backgrounded / inactive: stop the refresh timers (Supabase RN guidance).
        supabaseBusiness.auth.stopAutoRefresh();
        supabasePersonal.auth.stopAutoRefresh();
        // Archive any open Ask-Echo (inline) threads into the main Echo history —
        // the last reliable signal before a kill; threads are in-memory otherwise.
        flushInlineThreadsToHistory();
      }
    });
    return () => sub.remove();
  }, []);

  // Quick-log promo trigger — after the 3rd manual transaction, one time ever.
  const promoTxnCount = usePersonalStore((s) => s.transactions.length);
  const promoSeen = useSettingsStore((s) => s.quickLogPromoSeen);
  const promoConfigured = useSettingsStore((s) => s.quickLogConfigured);
  React.useEffect(() => {
    if (promoVisible || promoSeen || promoConfigured) return;
    if (promoTxnCount >= 3) {
      setPromoVisible(true);
      useSettingsStore.getState().setQuickLogPromoSeen(true);
    }
  }, [promoTxnCount, promoVisible, promoSeen, promoConfigured]);

  const handlePromoSetUp = React.useCallback(() => {
    setPromoVisible(false);
    if (navigationRef.isReady()) {
      (navigationRef as any).navigate('QuickLogSetup');
    }
  }, []);

  // Drain any entries the Back Tap Shortcut logged while the app was closed.
  // Gated on a signed-in (FREE) personal account: Quick Log only needs the
  // session, not paid Cloud Backup. Gating (vs. always-on) avoids holding a
  // realtime websocket open for every user who never uses the feature
  // (concurrent-connection quota at scale). Sign-in/out re-runs the effect,
  // so the subscription attaches/detaches live.
  const quickLogSignedIn = useAuthStore((s) => s.personal.isAuthenticated);
  React.useEffect(() => {
    if (!quickLogSignedIn) return;
    const run = () => { drainQuickLogInbox().catch(() => {}); };
    run(); // cold start / just enabled
    // Keep the PERSONAL user's device token registered (quick-log pushes are
    // sent to the personal account; the seller path registers business only).
    // Silent: never prompts — QuickLogSetup owns the contextual prompt.
    registerPersonalDeviceToken().catch(() => {});
    // Cache "auto-log set up" from the server so Echo & screens know without
    // a round-trip (survives reinstall/sign-in — the key is account-scoped).
    refreshQuickLogConfigured();
    let graceTimer: ReturnType<typeof setTimeout> | null = null;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') {
        run();
        // Back Tap race: when the Shortcut runs OVER the open app, we return
        // to 'active' before its POST lands — sweep again so the new entry
        // appears on the visible screen without a reopen.
        if (graceTimer) clearTimeout(graceTimer);
        graceTimer = setTimeout(run, 2500);
      }
    });
    // A quick-log push arriving while the app is foregrounded means a row just
    // landed — drain immediately so the list updates in place.
    const recvSub = Notifications.addNotificationReceivedListener((n) => {
      const data = n.request.content.data as { type?: string } | undefined;
      if (data?.type === 'quick_log') { run(); return; }
      // Broadcast arriving while the app is open → pull it from the announcements
      // table into the inbox (same id as the launch fetch, so no duplicate).
      if (data?.type === 'broadcast') { refreshBroadcasts(); return; }
      // Share-to-log outcomes are recorded in the inbox at log time (shareToLog.ts),
      // reliably and on both platforms — don't double-insert from the foreground push. The
      // "Receipt found" nudge is transient (reconcile opens the scanner) — don't inbox it.
      if (data?.type === 'share_logged' || data?.type === 'share_receipt' || data?.type === 'share_receipt_text') return;
      // Persist any other foreground push into the in-app inbox.
      const c = n.request.content;
      useNotificationStore.getState().addNotification({
        id: n.request.identifier || `push-${Date.now()}`,
        type: 'push',
        title: c.title || '',
        body: c.body || '',
        createdAt: Date.now(),
        data: (data as Record<string, unknown>) ?? undefined,
      });
    });
    // Primary live-update: realtime INSERT events on the inbox — works even
    // when notifications are denied and no AppState transition fires.
    const unsubRealtime = subscribeQuickLogInbox(run);
    return () => {
      sub.remove();
      recvSub.remove();
      unsubRealtime();
      if (graceTimer) clearTimeout(graceTimer);
    };
  }, [quickLogSignedIn]);

  // Deep link / Back Tap / Apple Shortcut: log or open Quick Add from outside.
  //   potraces://add                                  → open Quick Add (expense)
  //   potraces://income                               → open Quick Add (income)
  //   potraces://add?amount=35.50&category=entertainment&date=2026-04-07
  //                                                   → log it directly (with Undo)
  //   potraces://add?amount=20&type=income&note=gig   → log income directly
  //   potraces://quick-add                            → legacy alias (open, expense)
  //   potraces://collectz/{CODE}                      → open the Collectz join screen
  //   https://jejakbaki.my/collectz/{CODE}            → same (universal link; also ?c={CODE})
  //   .../collectz/{CODE}?r={REFCODE}                 → join + stage the referral (source=collectz)
  //   https://jejakbaki.my/r/{CODE} / potraces://r/{CODE}
  //                                                   → stage an invite code, claim after sign-in
  // A Shortcut collects amount/category/date with native prompts, then hands the
  // values here. With an amount we log straight away (the Shortcut already
  // confirmed the details) and show an Undo toast; without one we just open the
  // sheet. Switches to personal mode first so it works from business / cold start.
  React.useEffect(() => {
    const handleUrl = ({ url }: { url: string }) => {
      if (!url) return;
      const rest = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
      const [pathRaw, queryRaw = ''] = rest.split('?');
      const segs = pathRaw.split('/').filter(Boolean);
      const head = segs[0]?.toLowerCase() || '';

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

      // Collectz join link (custom scheme or jejakbaki.my universal link).
      // Like the quick-add links below, NOT gated on auth/onboarding — the
      // join screen handles a signed-out user itself. Personal mode first:
      // Collectz lives on the personal account.
      const isWebCollectz =
        (head === 'jejakbaki.my' || head === 'www.jejakbaki.my') &&
        segs[1]?.toLowerCase() === 'collectz';
      if (head === 'collectz' || isWebCollectz) {
        const code = (segs[isWebCollectz ? 2 : 1] || params.c || '').trim();
        if (!code) return;
        // Invite code carried on a Collectz link (?r=) — stage it with the session
        // code so the organizer's referral is attributed when the joiner claims.
        const ref = (params.r || '').trim();
        if (ref) {
          void stagePendingReferral({ code: ref, source: 'collectz', session: code })
            .then(() => claimStagedReferral());
        }
        if (useAppStore.getState().mode !== 'personal') {
          useAppStore.getState().setMode('personal');
        }
        // The navigator can still be mounting on a cold start — retry briefly
        // instead of dropping the link (same race as push taps, below).
        let tries = 0;
        const go = () => {
          tries += 1;
          if (navigationRef.isReady()) {
            (navigationRef as any).navigate('CollectzJoin', { code });
          } else if (tries < 8) {
            setTimeout(go, 300);
          }
        };
        setTimeout(go, 300);
        return;
      }

      // Invite link (custom scheme or jejakbaki.my universal link) — stage the
      // code; claimStagedReferral claims it now if signed in, else after sign-in.
      const isWebInvite =
        (head === 'jejakbaki.my' || head === 'www.jejakbaki.my') &&
        segs[1]?.toLowerCase() === 'r';
      if (head === 'r' || isWebInvite) {
        const code = (segs[isWebInvite ? 2 : 1] || '').trim();
        if (code) {
          void stagePendingReferral({ code, source: 'link', session: null })
            .then(() => claimStagedReferral());
        }
        return;
      }

      // Share-to-Log (legacy deep-link path): iOS blocks a share extension from launching the
      // host app, so the extension does the work itself + the app reconciles the app-group on
      // foreground. This branch is kept as a harmless fallback if a `potraces://share` ever
      // does arrive (e.g. Android/future). Must be before the isAdd guard.
      if (head === 'share') {
        if (useAppStore.getState().mode !== 'personal') {
          useAppStore.getState().setMode('personal');
        }
        try {
          const payload = JSON.parse(params.payload ?? '{}') as { image?: string | null };
          void logPaymentFromShare(payload.image ?? null);
        } catch {
          void logPaymentFromShare(null);
        }
        return;
      }

      const isAdd = ['add', 'quick-add', 'quickadd', 'add-income', 'add-expense', 'income', 'log'].includes(head);
      if (!isAdd) return;

      const wantsIncome =
        head === 'income' || head === 'add-income' ||
        (params.type || '').toLowerCase() === 'income' || 'income' in params;

      if (useAppStore.getState().mode !== 'personal') {
        useAppStore.getState().setMode('personal');
      }

      const amountStr = params.amount ?? params.amt ?? '';
      // Locale-tolerant: comma-decimal keyboards must not 10× the amount.
      const amount = parseAmountLoose(amountStr);

      if (amountStr && amount !== null) {
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

  // Android Share-to-Log bridge. expo-share-extension is iOS-only; on Android the
  // native ShareModule catches a SEND image/* intent, copies it to cache, and
  // exposes it two ways (mirrors Linking's getInitialURL vs 'url' event): a cold
  // start reads getInitialShare(), a warm share arrives on the PotracesShareImage
  // event (MainActivity is singleTask → onNewIntent). Both feed the same pipeline.
  React.useEffect(() => {
    if (Platform.OS !== 'android') return;
    const mod = (NativeModules as any).PotracesShare;
    if (!mod) return;
    mod.getInitialShare?.()
      .then((uri: string | null) => { if (uri) void logPaymentFromShare(uri); })
      .catch(() => {});
    const emitter = new NativeEventEmitter(mod);
    const sub = emitter.addListener('PotracesShareImage', (uri: string) => {
      if (uri) void logPaymentFromShare(uri);
    });
    return () => sub.remove();
  }, []);

  // iOS Share-to-Log reconcile. iOS blocks a share extension from launching the host
  // app, so the extension stages the shared screenshot in the app-group container and
  // the app processes it here — on launch and every time it returns to the foreground.
  React.useEffect(() => {
    if (Platform.OS !== 'ios') return;
    // DEV: record this app's Metro host on every foreground so the share extension (a
    // separate process) finds the SAME Metro on any network/machine — no hardcoded IP
    // (see src/utils/shareExtBridge.ts).
    const recordMetroHost = () => { if (__DEV__) void writeMetroHostFromBundleUrl(); };
    recordMetroHost();
    // A shared RECEIPT is detected during reconcile and opens the review screen; if
    // navigation wasn't ready yet (cold launch), it's stashed — flush it after reconcile.
    void reconcileSharedPayments().then(flushPendingReceiptReview);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        recordMetroHost();
        void reconcileSharedPayments().then(flushPendingReceiptReview);
      }
    });
    return () => sub.remove();
  }, []);

  // Push notification tap → navigate (order / quick-log / collectz)
  React.useEffect(() => {
    let handledId: string | null = null;
    const handleResponse = (response: Notifications.NotificationResponse, delay: number) => {
      const id = response.notification.request.identifier;
      if (handledId === id) return; // cold-start check + live listener overlap
      handledId = id;
      const data = response.notification.request.content.data as
        { type?: string; orderId?: string; sessionId?: string; rid?: string; tid?: string } | undefined;
      if (data?.type === 'broadcast') {
        // Broadcast tap → pull it into the inbox, then open the Notifications screen.
        refreshBroadcasts();
        setTimeout(() => {
          if (navigationRef.isReady()) {
            (navigationRef as any).navigate('Notifications');
          }
        }, delay);
        return;
      }
      if (data?.type === 'echo_checkin') {
        // Daily check-in reminder → Echo chat, where the check-in greeting
        // (today's tally + rhythm note) fires on open.
        useAppStore.getState().setMode('personal');
        setTimeout(() => {
          if (navigationRef.isReady()) {
            (navigationRef as any).navigate('MoneyChat');
          }
        }, delay);
        return;
      }
      if (data?.type === 'quick_log' || data?.type === 'share_logged') {
        // Switch to personal mode (RootNavigator re-renders to PersonalNavigator)
        // and open the full transactions list, where the new entry is visible.
        // Share-to-Log's "Logged RM…" notification tap lands here too.
        useAppStore.getState().setMode('personal');
        setTimeout(() => {
          if (navigationRef.isReady()) {
            (navigationRef as any).navigate('TransactionsList');
          }
        }, delay);
        return;
      }
      if (data?.type === 'share_receipt') {
        // TAP of a "Receipt found" notification → open the scanner for THAT receipt (by rid),
        // but only if it's still within 24h. This is the ONLY entry point that scans a shared
        // receipt when notifications are on — a plain app open never reaches here, so receipts
        // are tap-only (see shareToLog.reconcileSharedPayments).
        useAppStore.getState().setMode('personal');
        const rid = data.rid;
        setTimeout(() => { void openSharedReceiptById(rid); }, delay);
        return;
      }
      if (data?.type === 'share_receipt_text') {
        // Same tap-to-review contract, but for a shared TEXT/PDF receipt: the scanner opens
        // prefilled from the stashed rows (no image, no OCR) instead of a photo.
        useAppStore.getState().setMode('personal');
        const tid = data.tid;
        setTimeout(() => { void openSharedTextReceiptById(tid); }, delay);
        return;
      }
      if ((data?.type === 'new_order' || data?.type === 'payment_received') && data.orderId) {
        // Switch to business mode and navigate to order
        useAppStore.getState().setMode('business');
        // Delay to let mode switch + navigator mount
        setTimeout(() => {
          if (navigationRef.isReady()) {
            (navigationRef as any).navigate('SellerOrderList', { orderId: data.orderId });
          }
        }, delay);
        return;
      }
      // Collectz (personal mode): EVERY collectz push lands at the bell. The
      // push is mirrored into the inbox first — foreground receives already
      // mirror via the recv listener, but a tap from background/killed would
      // otherwise leave the bell empty. From the bell, NotificationDetail's
      // "View session" CTA deep-links onward.
      if (data?.type?.startsWith('collectz_')) {
        useAppStore.getState().setMode('personal');
        const c = response.notification.request.content;
        useNotificationStore.getState().addNotification({
          id: response.notification.request.identifier || `push-${Date.now()}`,
          type: 'push',
          title: c.title || '',
          body: c.body || '',
          createdAt: Date.now(),
          data: (data as Record<string, unknown>) ?? undefined,
        });
        setTimeout(() => {
          if (navigationRef.isReady()) {
            (navigationRef as any).navigate('Notifications');
          }
        }, delay);
        return;
      }
    };
    const sub = Notifications.addNotificationResponseReceivedListener((r) => handleResponse(r, 300));
    // Cold start: when the app is LAUNCHED by tapping a notification, the tap
    // fires before the listener above exists — fetch it explicitly. Longer
    // delay: the navigator is still mounting on a cold launch.
    Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) handleResponse(r, 900);
      // Clear the OS-persisted "last response" so it can't re-fire on a FUTURE cold launch.
      // getLastNotificationResponseAsync is sticky — it re-returns the same tapped notification
      // every launch until superseded — which made an old "Couldn't read" (share_failed) tap
      // auto-open Quick Add on every open. Native-backed in expo-notifications 0.32.17; .catch
      // guards older prebuilt binaries.
      Notifications.clearLastNotificationResponseAsync().catch(() => {});
    }).catch(() => {});
    return () => sub.remove();
  }, []);

  // Forced-update / kill-switch gate — fail-open (see services/appConfig.ts).
  React.useEffect(() => {
    checkForcedUpdate().then((u) => {
      setUpdate(u);
      // Soft "update available" → an inbox notice (id keyed by version, can't dupe).
      if (u.updateAvailable && u.latestVersion) {
        const tr = useSettingsStore.getState().language === 'ms' ? ms : en;
        useNotificationStore.getState().addNotification({
          id: `update-${u.latestVersion}`,
          type: 'update',
          title: tr.notifications.updateTitle,
          body: tr.notifications.updateBody,
          createdAt: Date.now(),
          data: u.storeUrl ? { storeUrl: u.storeUrl } : undefined,
        });
      }
    }).catch(() => {});
    // Notification inbox: auto-clear read items >60 days, then pull active
    // broadcasts (best-effort; RLS returns nothing when not signed in).
    useNotificationStore.getState().pruneOlderThan(60 * 24 * 60 * 60 * 1000);
    refreshBroadcasts();
  }, []);

  // Ask for notifications + register this device for admin broadcasts once
  // onboarding is complete. Keyed on the persisted flag (NOT the Onboarding
  // screen): on a fresh install the first run uses the OLD embedded bundle and
  // the OTA applies only on the next launch — by then onboarding is already
  // done, so a prompt fired from Onboarding would never run. This also reaches
  // testers who onboarded before this shipped. Account-free; stays silent (no
  // visible prompt) once permission is already granted or denied.
  const broadcastOnboarded = useSettingsStore((s) => s.hasCompletedOnboarding);
  React.useEffect(() => {
    if (broadcastOnboarded) registerBroadcastDevice({ promptIfNeeded: true }).catch(() => {});
  }, [broadcastOnboarded]);

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
                    <RewardModalProvider>
                      <StatusBar style={isDark ? 'light' : 'dark'} />
                      <BiometricGate>
                        <PersonalSyncManager />
                        <TapToPayProvider>
                          <>
                            <RootNavigator />
                            <QuickLogPromoModal
                              visible={promoVisible}
                              onClose={() => setPromoVisible(false)}
                              onSetUp={handlePromoSetUp}
                            />
                          </>
                        </TapToPayProvider>
                      </BiometricGate>
                    </RewardModalProvider>
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
