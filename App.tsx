import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableWithoutFeedback, Keyboard, AppState, Linking } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import RootNavigator from './src/navigation/RootNavigator';
import { COLORS, SPACING, TYPOGRAPHY } from './src/constants';
import { ToastProvider } from './src/context/ToastContext';
import { ensureAnonSession } from './src/services/supabase';
import { syncAll, pullOrderLinkOrders, subscribeToOrderLinkOrders, getCachedProfileId } from './src/services/sellerSync';
import { registerPushNotifications } from './src/services/pushNotifications';
import * as Notifications from 'expo-notifications';
import { globalShowToast } from './src/context/ToastContext';
import { useSellerStore } from './src/store/sellerStore';
import { useAppStore } from './src/store/appStore';
import { useSettingsStore } from './src/store/settingsStore';
import { navigationRef } from './src/navigation/navigationRef';
import QuickAddExpense, { openQuickAdd } from './src/components/common/QuickAddExpense';

// Debounced auto-sync — pushes to Supabase ~1.5s after any data mutation
let _autoSyncTimeout: ReturnType<typeof setTimeout> | null = null;
let _unsubAutoSync: (() => void) | null = null;

export default function App() {
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let unsubOrderLink: (() => void) | null = null;

    const waitForHydration = () =>
      new Promise<void>((resolve) => {
        if (useSellerStore.persist.hasHydrated()) { resolve(); return; }
        const unsub = useSellerStore.persist.onFinishHydration(() => { unsub(); resolve(); });
      });

    const init = async () => {
      // Wait for both auth and store hydration before syncing
      await Promise.allSettled([ensureAnonSession(), waitForHydration()]);

      // Apply default mode on launch
      const { defaultMode, businessModeEnabled } = useSettingsStore.getState();
      if (businessModeEnabled && defaultMode === 'business') {
        useAppStore.getState().setMode('business');
      }

      if (!cancelled) setIsLoading(false);

      // Fire-and-forget sync after UI is ready
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
            state.sellerCustomers === prev.sellerCustomers
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
    };

    init();
    return () => {
      cancelled = true;
      unsubOrderLink?.();
      _unsubAutoSync?.();
      if (_autoSyncTimeout) clearTimeout(_autoSyncTimeout);
    };
  }, []);

  // Re-sync whenever the app comes back to the foreground
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
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
            navigationRef.navigate('SellerOrderList' as never, { orderId: data.orderId } as never);
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
                <QuickAddExpense />
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
