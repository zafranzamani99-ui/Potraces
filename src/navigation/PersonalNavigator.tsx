import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../constants';
import GRADIENTS from '../constants/gradients';
import CustomTabBar from '../components/navigation/CustomTabBar';

import PersonalDashboard from '../screens/personal/Dashboard';
import ExpenseEntry from '../screens/personal/ExpenseEntry';
import ReceiptScanner from '../screens/shared/ReceiptScanner';
import BudgetPlanning from '../screens/personal/BudgetPlanning';
import Settings from '../screens/shared/Settings';

const Tab = createBottomTabNavigator();

const PersonalNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      tabBar={(props) => (
        <CustomTabBar
          {...props}
          accentColor={COLORS.personal}
          centerButtonGradient={GRADIENTS.primary.colors as [string, string]}
        />
      )}
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }: { color: string; size: number }) => {
          let iconName: keyof typeof Feather.glyphMap = 'circle';

          switch (route.name) {
            case 'Dashboard':
              iconName = 'home';
              break;
            case 'BudgetPlanning':
              iconName = 'pie-chart';
              break;
            case 'ExpenseEntry':
              iconName = 'plus-circle';
              break;
            case 'ReceiptScanner':
              iconName = 'camera';
              break;
            case 'Settings':
              iconName = 'settings';
              break;
          }

          return <Feather name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: COLORS.personal,
        tabBarInactiveTintColor: COLORS.textTertiary,
        tabBarShowLabel: false,
        headerStyle: {
          backgroundColor: COLORS.personal,
          ...SHADOWS.md,
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: TYPOGRAPHY.weight.bold as '700',
          fontSize: TYPOGRAPHY.size.lg,
        },
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={PersonalDashboard}
        options={{ title: 'Home' }}
      />
      <Tab.Screen
        name="BudgetPlanning"
        component={BudgetPlanning}
        options={{ title: 'Budget' }}
      />
      <Tab.Screen
        name="ExpenseEntry"
        component={ExpenseEntry}
        options={{ title: 'Add' }}
      />
      <Tab.Screen
        name="ReceiptScanner"
        component={ReceiptScanner}
        options={{ title: 'Scan' }}
      />
      <Tab.Screen
        name="Settings"
        component={Settings}
        options={{ title: 'Settings' }}
      />
    </Tab.Navigator>
  );
};

export default PersonalNavigator;
