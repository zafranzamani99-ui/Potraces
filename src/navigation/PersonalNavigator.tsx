import React from 'react';
import { Platform } from 'react-native';
import { createBottomTabNavigator, BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, TYPOGRAPHY } from '../constants';
import { useCalm } from '../hooks/useCalm';
import { useT } from '../i18n';
import { useAIInsightsStore } from '../store/aiInsightsStore';
import LiquidGlassNavBar from '../components/navigation/LiquidGlassNavBar';

import PersonalDashboard from '../screens/personal/Dashboard';
import NotesHome from '../screens/notes/NotesHome';
import MoneyChat from '../screens/personal/MoneyChat';
import BudgetPlanning from '../screens/personal/BudgetPlanning';
import Settings from '../screens/shared/Settings';

// iOS 26 + Xcode 26 build → use the REAL system tab bar (UITabBarController via
// react-native-bottom-tabs), which renders Apple's genuine Liquid Glass — lensing
// bubble and all. A custom GlassView bar can only approximate it (Apple doesn't
// expose the system bar's magnifier to custom views), so where the real thing is
// available we use the real thing. Everywhere else: the JS bar (blur fallback).
const USE_NATIVE_TABS = Platform.OS === 'ios' && isLiquidGlassAvailable();

const Tab = createBottomTabNavigator();
const NativeTab = createNativeBottomTabNavigator();

// ── Native-tabs helpers ────────────────────────────────────────────────────

// The native tab bar renders no headers; give each tab that needs one its own
// tiny native stack with the same header treatment the JS navigator applied.
function makeHeaderScreen(Screen: React.ComponentType<any>, titleKey: 'budget' | 'notes' | 'echo' | 'settings') {
  const Stack = createNativeStackNavigator();
  const Wrapped: React.FC = () => {
    const C = useCalm();
    const t = useT();
    return (
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: C.background },
          headerTintColor: C.textPrimary,
          headerTitleStyle: {
            fontWeight: TYPOGRAPHY.weight.semibold as any,
            fontSize: TYPOGRAPHY.size.lg,
          },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: C.background },
        }}
      >
        <Stack.Screen name="Content" component={Screen} options={{ title: t.tabs[titleKey] }} />
      </Stack.Navigator>
    );
  };
  return Wrapped;
}

// MoneyChat distinguishes its tab mount from its root-stack (quick action) mount
// via BottomTabBarHeightContext — the native navigator doesn't provide it, so we
// do, with the system bar's real height (49pt + safe-area inset).
const SystemTabBarHeight: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const insets = useSafeAreaInsets();
  return (
    <BottomTabBarHeightContext.Provider value={49 + insets.bottom}>
      {children}
    </BottomTabBarHeightContext.Provider>
  );
};

const BudgetTab = makeHeaderScreen(BudgetPlanning, 'budget');
const NotesTab = makeHeaderScreen(NotesHome, 'notes');
const EchoTab = makeHeaderScreen(
  () => (
    <SystemTabBarHeight>
      <MoneyChat />
    </SystemTabBarHeight>
  ),
  'echo',
);
const SettingsTab = makeHeaderScreen(Settings, 'settings');

// ── Navigators ─────────────────────────────────────────────────────────────

const NativePersonalNavigator: React.FC = () => {
  const t = useT();
  const C = useCalm();
  const pendingCount = useAIInsightsStore((s) => s.pendingActions.length);
  // Theme-aware accent: CALM dark uses a lighter olive (#A4A843) that stays
  // legible on the dark glass; COLORS.personal (#4F5104) would vanish there.
  const accent = C.accent;
  return (
    <NativeTab.Navigator>
      <NativeTab.Screen
        name="Dashboard"
        component={PersonalDashboard}
        options={{
          title: t.tabs.home,
          tabBarActiveTintColor: accent,
          tabBarIcon: ({ focused }) => ({ sfSymbol: focused ? 'house.fill' : 'house' }),
        }}
      />
      <NativeTab.Screen
        name="BudgetPlanning"
        component={BudgetTab}
        options={{
          title: t.tabs.budget,
          tabBarActiveTintColor: accent,
          tabBarIcon: ({ focused }) => ({ sfSymbol: focused ? 'chart.pie.fill' : 'chart.pie' }),
        }}
      />
      <NativeTab.Screen
        name="Notes"
        component={NotesTab}
        options={{
          title: t.tabs.notes,
          tabBarActiveTintColor: accent,
          tabBarIcon: () => ({ sfSymbol: 'pencil' }),
        }}
      />
      <NativeTab.Screen
        name="MoneyChat"
        component={EchoTab}
        options={{
          title: t.tabs.echo,
          tabBarActiveTintColor: accent,
          tabBarIcon: ({ focused }) => ({ sfSymbol: focused ? 'bolt.fill' : 'bolt' }),
          tabBarBadge: pendingCount > 0 ? String(pendingCount > 9 ? '9+' : pendingCount) : undefined,
        }}
      />
      <NativeTab.Screen
        name="Settings"
        component={SettingsTab}
        options={{
          title: t.tabs.settings,
          tabBarActiveTintColor: accent,
          tabBarIcon: ({ focused }) => ({ sfSymbol: focused ? 'gearshape.fill' : 'gearshape' }),
        }}
      />
    </NativeTab.Navigator>
  );
};

const JsPersonalNavigator: React.FC = () => {
  const C = useCalm();
  const t = useT();
  return (
    <Tab.Navigator
      tabBar={(props) => (
        <LiquidGlassNavBar
          {...props}
          accentColor={COLORS.personal}
        />
      )}
      screenOptions={({ route }) => ({
        lazy: true,
        // Android: freezing/unfreezing a tab on blur forces a heavy re-render on
        // re-focus, dropping the first touches so scroll needs 2-3 taps to start.
        // Keep it on iOS (memory) but off on Android. (scroll-responsiveness fix)
        freezeOnBlur: Platform.OS === 'ios',
        tabBarIcon: ({ color, size }: { color: string; size: number }) => {
          let iconName: keyof typeof Feather.glyphMap = 'circle';

          switch (route.name) {
            case 'Dashboard':
              iconName = 'home';
              break;
            case 'BudgetPlanning':
              iconName = 'sliders';
              break;
            case 'Notes':
              iconName = 'edit-3';
              break;
            case 'MoneyChat':
              iconName = 'zap';
              break;
            case 'Settings':
              iconName = 'settings';
              break;
          }

          return <Feather name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: COLORS.personal,
        tabBarInactiveTintColor: C.textMuted,
        tabBarShowLabel: false,
        animation: 'fade',
        headerStyle: {
          backgroundColor: C.background,
        },
        headerTintColor: C.textPrimary,
        headerTitleStyle: {
          fontWeight: TYPOGRAPHY.weight.semibold,
          fontSize: TYPOGRAPHY.size.lg,
        },
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={PersonalDashboard}
        options={{ title: t.tabs.home, headerShown: false }}
      />
      <Tab.Screen
        name="BudgetPlanning"
        component={BudgetPlanning}
        options={{ title: t.tabs.budget }}
      />
      <Tab.Screen
        name="Notes"
        component={NotesHome}
        options={{ title: t.tabs.notes }}
      />
      <Tab.Screen
        name="MoneyChat"
        component={MoneyChat}
        options={{ title: t.tabs.echo }}
      />
      <Tab.Screen
        name="Settings"
        component={Settings}
        options={{ title: t.tabs.settings }}
      />
    </Tab.Navigator>
  );
};

const PersonalNavigator: React.FC = () =>
  USE_NATIVE_TABS ? <NativePersonalNavigator /> : <JsPersonalNavigator />;

export default PersonalNavigator;
