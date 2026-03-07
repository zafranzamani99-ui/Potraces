import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableWithoutFeedback, Keyboard, AppState } from 'react-native';
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
import { globalShowToast } from './src/context/ToastContext';
import { useSellerStore } from './src/store/sellerStore';

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
      if (!cancelled) setIsLoading(false);

      // Fire-and-forget sync after UI is ready
      try {
        const { products, orders, seasons, sellerCustomers } = useSellerStore.getState();
        await syncAll(products, orders, seasons, sellerCustomers);

        // Pull any order_link orders placed while app was closed
        await pullOrderLinkOrders();

        // Register push notifications (saves token to Supabase)
        registerPushNotifications().catch(() => {});

        // Subscribe to new order_link orders in real time (in-app alert when foregrounded)
        const profileId = getCachedProfileId();
        if (profileId && !cancelled) {
          unsubOrderLink = subscribeToOrderLinkOrders(profileId, (row) => {
            useSellerStore.getState().addOrderLinkOrder(row);
            const name = (row.customer_name as string | null) ?? 'Pelanggan';
            globalShowToast(`Pesanan baru dari ${name}`, 'info');
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
    };
  }, []);

  // Re-sync whenever the app comes back to the foreground
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        try {
          const { products, orders, seasons, sellerCustomers } = useSellerStore.getState();
          syncAll(products, orders, seasons, sellerCustomers);
        } catch {
          // Non-fatal
        }
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
