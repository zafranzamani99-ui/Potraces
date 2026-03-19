import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Feather } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY } from '../constants';
import { useCalm } from '../hooks/useCalm';
import { useT } from '../i18n';
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
import SellerCustomers from '../screens/seller/Customers';
import SellerManage from '../screens/seller/Manage';

// Stall screens
import StallDashboard from '../screens/stall/Dashboard';
import SellScreen from '../screens/stall/SellScreen';
import SessionHistory from '../screens/stall/SessionHistory';
import RegularCustomers from '../screens/stall/RegularCustomers';

// Notes
import NotesHome from '../screens/notes/NotesHome';

// Legacy screens (still used as fallback)
import POS from '../screens/business/POS';
import CRM from '../screens/business/CRM';
import Inventory from '../screens/business/Inventory';

// Income-type-specific screens used as tabs
import ClientList from '../screens/business/ClientList';
import RiderCostsScreen from '../screens/business/RiderCosts';
import IncomeStreamsScreen from '../screens/business/IncomeStreams';
import LogIncome from '../screens/business/LogIncome';

// Freelancer screens
import FreelancerDashboard from '../screens/business/freelancer/FreelancerDashboard';
import FreelancerClientList from '../screens/business/freelancer/ClientList';

// Part-time screens
import PartTimeDashboard from '../screens/business/parttime/PartTimeDashboard';

// On-the-road screens
import OnTheRoadDashboard from '../screens/business/ontheroad/OnTheRoadDashboard';

// Mixed screens
import MixedDashboard from '../screens/business/mixed/MixedDashboard';

const Tab = createBottomTabNavigator();

const ICON_MAP: Record<string, keyof typeof Feather.glyphMap> = {
  Dashboard: 'home',
  SellerHome: 'home',
  SellerOrders: 'file-text',
  SellerNewOrder: 'plus-circle',
  SellerCustomers: 'users',
  SellerManage: 'sliders',
  // Stall
  StallDashboard: 'home',
  StallSell: 'shopping-bag',
  StallHistory: 'calendar',
  StallRegulars: 'heart',
  Clients: 'users',
  FreelancerHome: 'home',
  FreelancerClients: 'users',
  PartTimeHome: 'home',
  OnTheRoadHome: 'home',
  MixedHome: 'home',
  LogIncome: 'plus-circle',
  Costs: 'tool',
  Streams: 'layers',
  Notes: 'edit-3',
  Reports: 'bar-chart-2',
  Settings: 'settings',
  // Legacy
  Inventory: 'package',
  POS: 'shopping-cart',
  CRM: 'user-check',
};

const BusinessNavigator: React.FC = () => {
  const C = useCalm();
  const t = useT();
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
            <Tab.Screen name="SellerHome" component={SellerDashboard} options={{ title: t.tabs.home, headerShown: false }} />
            <Tab.Screen name="SellerOrders" component={OrderList} options={{ title: t.tabs.orders }} />
            <Tab.Screen name="SellerNewOrder" component={NewOrder} options={{ title: t.tabs.newOrder }} />
            <Tab.Screen name="SellerCustomers" component={SellerCustomers} options={{ title: t.tabs.customers }} />
            <Tab.Screen name="SellerManage" component={SellerManage} options={{ title: t.tabs.manage }} />
          </>
        );

      case 'stall':
        return (
          <>
            <Tab.Screen name="StallDashboard" component={StallDashboard} options={{ title: t.tabs.home, headerShown: false }} />
            <Tab.Screen name="StallHistory" component={SessionHistory} options={{ title: t.tabs.history }} />
            <Tab.Screen name="StallSell" component={SellScreen} options={{ title: t.tabs.sell }} />
            <Tab.Screen name="StallRegulars" component={RegularCustomers} options={{ title: t.tabs.regulars }} />
            <Tab.Screen name="Settings" component={Settings} options={{ title: t.tabs.settings }} />
          </>
        );

      case 'freelance':
        return (
          <>
            <Tab.Screen name="FreelancerHome" component={FreelancerDashboard} options={{ title: t.tabs.home, headerShown: false }} />
            <Tab.Screen name="FreelancerClients" component={FreelancerClientList} options={{ title: t.tabs.clients }} />
            <Tab.Screen name="Notes" component={NotesHome} options={{ title: t.tabs.notes }} />
            <Tab.Screen name="Settings" component={Settings} options={{ title: t.tabs.settings }} />
          </>
        );

      case 'rider':
        return (
          <>
            <Tab.Screen name="OnTheRoadHome" component={OnTheRoadDashboard} options={{ title: t.tabs.home, headerShown: false }} />
            <Tab.Screen name="Notes" component={NotesHome} options={{ title: t.tabs.notes }} />
            <Tab.Screen name="Settings" component={Settings} options={{ title: t.tabs.settings }} />
          </>
        );

      case 'parttime':
        return (
          <>
            <Tab.Screen name="PartTimeHome" component={PartTimeDashboard} options={{ title: t.tabs.home, headerShown: false }} />
            <Tab.Screen name="Notes" component={NotesHome} options={{ title: t.tabs.notes }} />
            <Tab.Screen name="Settings" component={Settings} options={{ title: t.tabs.settings }} />
          </>
        );

      case 'mixed':
        return (
          <>
            <Tab.Screen name="MixedHome" component={MixedDashboard} options={{ title: t.tabs.home, headerShown: false }} />
            <Tab.Screen name="Notes" component={NotesHome} options={{ title: t.tabs.notes }} />
            <Tab.Screen name="Settings" component={Settings} options={{ title: t.tabs.settings }} />
          </>
        );

      default:
        // Fallback — legacy tabs for users who haven't set up yet
        return (
          <>
            <Tab.Screen name="Dashboard" component={BusinessDashboard} options={{ title: t.tabs.home, headerShown: false }} />
            <Tab.Screen name="Inventory" component={Inventory} options={{ title: 'Products' }} />
            <Tab.Screen name="POS" component={POS} options={{ title: 'POS' }} />
            <Tab.Screen name="CRM" component={CRM} options={{ title: 'CRM' }} />
            <Tab.Screen name="Settings" component={Settings} options={{ title: t.tabs.settings }} />
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
        />
      )}
      screenOptions={({ route }) => ({
        lazy: false,
        freezeOnBlur: true,
        tabBarIcon: ({ color, size }: { color: string; size: number }) =>
          getIcon(route.name, color, size),
        tabBarActiveTintColor: COLORS.business,
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
      {renderTabs()}
    </Tab.Navigator>
  );
};

export default BusinessNavigator;
