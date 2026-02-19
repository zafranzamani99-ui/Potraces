import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../constants';
import GRADIENTS from '../constants/gradients';
import CustomTabBar from '../components/navigation/CustomTabBar';

import BusinessDashboard from '../screens/business/Dashboard';
import POS from '../screens/business/POS';
import CRM from '../screens/business/CRM';
import Inventory from '../screens/business/Inventory';
import Settings from '../screens/shared/Settings';

const Tab = createBottomTabNavigator();

const BusinessNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      tabBar={(props) => (
        <CustomTabBar
          {...props}
          accentColor={COLORS.business}
          centerButtonGradient={GRADIENTS.businessHero.colors as [string, string]}
        />
      )}
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }: { color: string; size: number }) => {
          let iconName: keyof typeof Feather.glyphMap = 'circle';

          switch (route.name) {
            case 'Dashboard':
              iconName = 'home';
              break;
            case 'Inventory':
              iconName = 'package';
              break;
            case 'POS':
              iconName = 'shopping-cart';
              break;
            case 'CRM':
              iconName = 'user-check';
              break;
            case 'Settings':
              iconName = 'settings';
              break;
          }

          return <Feather name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: COLORS.business,
        tabBarInactiveTintColor: COLORS.textTertiary,
        tabBarShowLabel: false,
        headerStyle: {
          backgroundColor: COLORS.business,
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
        component={BusinessDashboard}
        options={{ title: 'Home' }}
      />
      <Tab.Screen
        name="Inventory"
        component={Inventory}
        options={{ title: 'Inventory' }}
      />
      <Tab.Screen
        name="POS"
        component={POS}
        options={{ title: 'POS' }}
      />
      <Tab.Screen
        name="CRM"
        component={CRM}
        options={{ title: 'CRM' }}
      />
      <Tab.Screen
        name="Settings"
        component={Settings}
        options={{ title: 'Settings' }}
      />
    </Tab.Navigator>
  );
};

export default BusinessNavigator;
