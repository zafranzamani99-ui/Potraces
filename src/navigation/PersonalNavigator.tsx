import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY } from '../constants';
import { useCalm } from '../hooks/useCalm';
import { useT } from '../i18n';
import CustomTabBar from '../components/navigation/CustomTabBar';

import PersonalDashboard from '../screens/personal/Dashboard';
import ExpenseEntry from '../screens/personal/ExpenseEntry';
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
        lazy: false,
        freezeOnBlur: true,
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
        headerStyle: {
          backgroundColor: C.background,
        },
        headerTintColor: C.textPrimary,
        headerTitleStyle: {
          fontWeight: TYPOGRAPHY.weight.semibold as '600',
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
