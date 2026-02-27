import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../constants';
import GRADIENTS from '../constants/gradients';
import CustomTabBar from '../components/navigation/CustomTabBar';
import { useBusinessStore } from '../store/businessStore';

// Shared screens
import BusinessDashboard from '../screens/business/Dashboard';
import Settings from '../screens/shared/Settings';
import BusinessReports from '../screens/business/Reports';

// Seller screens
import SellerDashboard from '../screens/seller/Dashboard';
import OrderList from '../screens/seller/OrderList';
import NewOrder from '../screens/seller/NewOrder';
import Products from '../screens/seller/Products';
import PastSeasons from '../screens/seller/PastSeasons';

// Legacy screens (still used as fallback)
import POS from '../screens/business/POS';
import CRM from '../screens/business/CRM';
import Inventory from '../screens/business/Inventory';

// Income-type-specific screens used as tabs
import ClientList from '../screens/business/ClientList';
import RiderCostsScreen from '../screens/business/RiderCosts';
import IncomeStreamsScreen from '../screens/business/IncomeStreams';
import LogIncome from '../screens/business/LogIncome';

const Tab = createBottomTabNavigator();

const ICON_MAP: Record<string, keyof typeof Feather.glyphMap> = {
  Dashboard: 'home',
  SellerHome: 'home',
  SellerOrders: 'clipboard',
  SellerNewOrder: 'plus-circle',
  SellerProducts: 'package',
  SellerSeasons: 'calendar',
  Clients: 'users',
  LogIncome: 'plus-circle',
  Costs: 'tool',
  Streams: 'layers',
  Reports: 'bar-chart-2',
  Settings: 'settings',
  // Legacy
  Inventory: 'package',
  POS: 'shopping-cart',
  CRM: 'user-check',
};

const BusinessNavigator: React.FC = () => {
  const incomeType = useBusinessStore((s) => s.incomeType);

  const getIcon = (routeName: string, color: string, size: number) => {
    const iconName = ICON_MAP[routeName] || 'circle';
    return <Feather name={iconName} size={size} color={color} />;
  };

  const renderTabs = () => {
    switch (incomeType) {
      case 'seller':
        return (
          <>
            <Tab.Screen name="SellerHome" component={SellerDashboard} options={{ title: 'Home' }} />
            <Tab.Screen name="SellerOrders" component={OrderList} options={{ title: 'Orders' }} />
            <Tab.Screen name="SellerNewOrder" component={NewOrder} options={{ title: 'New Order' }} />
            <Tab.Screen name="SellerProducts" component={Products} options={{ title: 'Products' }} />
            <Tab.Screen name="SellerSeasons" component={PastSeasons} options={{ title: 'Seasons' }} />
          </>
        );

      case 'freelance':
        return (
          <>
            <Tab.Screen name="Dashboard" component={BusinessDashboard} options={{ title: 'Home' }} />
            <Tab.Screen name="Clients" component={ClientList} options={{ title: 'Clients' }} />
            <Tab.Screen name="LogIncome" component={LogIncome} options={{ title: 'Log' }} />
            <Tab.Screen name="Reports" component={BusinessReports} options={{ title: 'Reports' }} />
            <Tab.Screen name="Settings" component={Settings} options={{ title: 'Settings' }} />
          </>
        );

      case 'rider':
        return (
          <>
            <Tab.Screen name="Dashboard" component={BusinessDashboard} options={{ title: 'Home' }} />
            <Tab.Screen name="Costs" component={RiderCostsScreen} options={{ title: 'Costs' }} />
            <Tab.Screen name="LogIncome" component={LogIncome} options={{ title: 'Log' }} />
            <Tab.Screen name="Reports" component={BusinessReports} options={{ title: 'Reports' }} />
            <Tab.Screen name="Settings" component={Settings} options={{ title: 'Settings' }} />
          </>
        );

      case 'parttime':
        return (
          <>
            <Tab.Screen name="Dashboard" component={BusinessDashboard} options={{ title: 'Home' }} />
            <Tab.Screen name="Streams" component={IncomeStreamsScreen} options={{ title: 'Streams' }} />
            <Tab.Screen name="LogIncome" component={LogIncome} options={{ title: 'Log' }} />
            <Tab.Screen name="Reports" component={BusinessReports} options={{ title: 'Reports' }} />
            <Tab.Screen name="Settings" component={Settings} options={{ title: 'Settings' }} />
          </>
        );

      case 'mixed':
        return (
          <>
            <Tab.Screen name="Dashboard" component={BusinessDashboard} options={{ title: 'Home' }} />
            <Tab.Screen name="Streams" component={IncomeStreamsScreen} options={{ title: 'Streams' }} />
            <Tab.Screen name="LogIncome" component={LogIncome} options={{ title: 'Log' }} />
            <Tab.Screen name="Reports" component={BusinessReports} options={{ title: 'Reports' }} />
            <Tab.Screen name="Settings" component={Settings} options={{ title: 'Settings' }} />
          </>
        );

      default:
        // Fallback — legacy tabs for users who haven't set up yet
        return (
          <>
            <Tab.Screen name="Dashboard" component={BusinessDashboard} options={{ title: 'Home' }} />
            <Tab.Screen name="Inventory" component={Inventory} options={{ title: 'Inventory' }} />
            <Tab.Screen name="POS" component={POS} options={{ title: 'POS' }} />
            <Tab.Screen name="CRM" component={CRM} options={{ title: 'CRM' }} />
            <Tab.Screen name="Settings" component={Settings} options={{ title: 'Settings' }} />
          </>
        );
    }
  };

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
        tabBarIcon: ({ color, size }: { color: string; size: number }) =>
          getIcon(route.name, color, size),
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
      {renderTabs()}
    </Tab.Navigator>
  );
};

export default BusinessNavigator;
