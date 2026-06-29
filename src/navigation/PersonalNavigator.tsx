import React from 'react';
import { Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY } from '../constants';
import { useCalm } from '../hooks/useCalm';
import { useT } from '../i18n';
import CustomTabBar from '../components/navigation/CustomTabBar';

import PersonalDashboard from '../screens/personal/Dashboard';
import NotesHome from '../screens/notes/NotesHome';
import MoneyChat from '../screens/personal/MoneyChat';
import BudgetPlanning from '../screens/personal/BudgetPlanning';
import Settings from '../screens/shared/Settings';

const Tab = createBottomTabNavigator();

const PersonalNavigator: React.FC = () => {
  const C = useCalm();
  const t = useT();
  return (
    <Tab.Navigator
      tabBar={(props) => (
        <CustomTabBar
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

export default PersonalNavigator;
