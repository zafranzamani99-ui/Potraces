import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import RootNavigator from './src/navigation/RootNavigator';
import { COLORS, SPACING, TYPOGRAPHY } from './src/constants';
import { ToastProvider } from './src/context/ToastContext';

export default function App() {
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 100);
    return () => clearTimeout(timer);
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
        <Text style={styles.loadingText}>Loading FinFlow...</Text>
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
