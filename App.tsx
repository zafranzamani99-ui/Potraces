import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableWithoutFeedback, Keyboard, AppState, Linking } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import RootNavigator from './src/navigation/RootNavigator';
import { COLORS, SPACING, TYPOGRAPHY } from './src/constants';
import { ToastProvider } from './src/context/ToastContext';
import { supabase, getAuthSession } from './src/services/supabase';
import { syncAll, pullOrderLinkOrders, subscribeToOrderLinkOrders, getCachedProfileId, clearProfileCache } from './src/services/sellerSync';
import { useAuthStore } from './src/store/authStore';
import { registerPushNotifications } from './src/services/pushNotifications';
import * as Notifications from 'expo-notifications';
import { globalShowToast } from './src/context/ToastContext';
import { useSellerStore } from './src/store/sellerStore';
import { useAppStore } from './src/store/appStore';
import { useSettingsStore } from './src/store/settingsStore';
import { navigationRef } from './src/navigation/navigationRef';
import { openQuickAdd } from './src/components/common/QuickAddExpense';

// Debounced auto-sync — pushes to Supabase ~1.5s after any data mutation
let _autoSyncTimeout: ReturnType<typeof setTimeout> | null = null;
let _unsubAutoSync: (() => void) | null = null;
let _lastForegroundSync = 0;

export default function App() {
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const mode = useAppStore((s) => s.mode);

  React.useEffect(() => {
    let cancelled = false;
    let unsubOrderLink: (() => void) | null = null;

    const waitForStore = (store: any) =>
      new Promise<void>((resolve) => {
        if (store.persist.hasHydrated()) { resolve(); return; }
        const unsub = store.persist.onFinishHydration(() => { unsub(); resolve(); });
      });

    const init = async () => {
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
                const amt = row.total_amount != null ? ` · RM ${Number(row.total_amount).toFixed(2)}` : '';
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
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Re-sync whenever the app comes back to the foreground (only if authenticated)
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const now = Date.now();
        if (now - _lastForegroundSync < 10000) return; // Skip if synced within 10s
        _lastForegroundSync = now;
        const { isAuthenticated, isVerified } = useAuthStore.getState();
        if (!isAuthenticated || !isVerified) return;
        const { products, orders, seasons, sellerCustomers } = useSellerStore.getState();
        syncAll(products, orders, seasons, sellerCustomers).catch(() => {});
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
    <SafeAreaProvider>
      <KeyboardProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
            <View style={{ flex: 1 }}>
              <ToastProvider>
                <StatusBar style="auto" />
                <RootNavigator />
              </ToastProvider>
            </View>
          </TouchableWithoutFeedback>
        </GestureHandlerRootView>
      </KeyboardProvider>
    </SafeAreaProvider>
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
