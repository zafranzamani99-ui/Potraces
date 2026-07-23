import React from 'react';
import { Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeBottomTabNavigator } from '@bottom-tabs/react-navigation';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Feather } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY } from '../constants';
import { useCalm } from '../hooks/useCalm';
import { useT } from '../i18n';
import LiquidGlassNavBar from '../components/navigation/LiquidGlassNavBar';
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
import StallManage from '../screens/stall/StallManage';

// Notes
import NotesHome from '../screens/notes/NotesHome';

// Legacy screens (still used as fallback)
import POS from '../screens/business/POS';
import CRM from '../screens/business/CRM';
import ProductsLegacy from '../screens/business/Inventory';

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

// iOS 26 + Xcode 26 build → use the REAL system tab bar (UITabBarController via
// react-native-bottom-tabs), which renders Apple's genuine Liquid Glass — exactly
// like PersonalNavigator does. Everywhere else (Android / iOS < 26): the JS glass
// bar (LiquidGlassNavBar, blur fallback). Keeping both in lockstep with personal is
// why business now matches personal instead of showing the JS pill + drag-scrub.
const USE_NATIVE_TABS = Platform.OS === 'ios' && isLiquidGlassAvailable();

const Tab = createBottomTabNavigator();
const NativeTab = createNativeBottomTabNavigator();

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
  StallManage: 'sliders',
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
  Products: 'package',
  POS: 'shopping-cart',
  CRM: 'user-check',
};

// ── Native-tabs header wrapper (mirrors PersonalNavigator.makeHeaderScreen) ──
// The native tab bar renders no headers, so each header-bearing tab gets its own
// tiny native stack with the same header treatment the JS navigator applies.
function makeHeaderBiz(Screen: React.ComponentType<any>, getTitle: (t: any) => string) {
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
        <Stack.Screen name="Content" component={Screen} options={{ title: getTitle(t) }} />
      </Stack.Navigator>
    );
  };
  return Wrapped;
}

// Header-bearing tab screens wrapped ONCE at module level (stable identity → no
// remount on every render). Titles read `t` inside the wrapper so they stay
// language-reactive. Dashboards (headerShown:false in the JS path) are used raw.
const OrdersTab = makeHeaderBiz(OrderList, (t) => t.tabs.orders);
const NewOrderTab = makeHeaderBiz(NewOrder, (t) => t.tabs.newOrder);
const CustomersTab = makeHeaderBiz(SellerCustomers, (t) => t.tabs.customers);
const ManageTab = makeHeaderBiz(SellerManage, (t) => t.tabs.manage);
const HistoryTab = makeHeaderBiz(SessionHistory, (t) => t.tabs.history);
const SellTab = makeHeaderBiz(SellScreen, (t) => t.tabs.sell);
const RegularsTab = makeHeaderBiz(RegularCustomers, (t) => t.tabs.regulars);
const StallManageTab = makeHeaderBiz(StallManage, (t) => t.tabs.manage);
const FreelancerClientsTab = makeHeaderBiz(FreelancerClientList, (t) => t.tabs.clients);
const NotesTab = makeHeaderBiz(NotesHome, (t) => t.tabs.notes);
const SettingsTab = makeHeaderBiz(Settings, (t) => t.tabs.settings);
const ProductsTab = makeHeaderBiz(ProductsLegacy, () => 'Products');
const PosTab = makeHeaderBiz(POS, () => 'POS');
const CrmTab = makeHeaderBiz(CRM, () => 'CRM');

// One row per native tab. `filled` is the focused SF Symbol variant (omitted where
// the symbol has no .fill).
type NativeTabDef = {
  name: string;
  comp: React.ComponentType<any>;
  title: string;
  sf: string;
  filled?: string;
};

function nativeTabsFor(incomeType: string | null | undefined, t: any): NativeTabDef[] {
  switch (incomeType) {
    case 'seller':
      return [
        { name: 'SellerHome', comp: SellerDashboard, title: t.tabs.home, sf: 'house', filled: 'house.fill' },
        { name: 'SellerOrders', comp: OrdersTab, title: t.tabs.orders, sf: 'doc.text', filled: 'doc.text.fill' },
        { name: 'SellerNewOrder', comp: NewOrderTab, title: t.tabs.newOrder, sf: 'plus.circle', filled: 'plus.circle.fill' },
        { name: 'SellerCustomers', comp: CustomersTab, title: t.tabs.customers, sf: 'person.2', filled: 'person.2.fill' },
        { name: 'SellerManage', comp: ManageTab, title: t.tabs.manage, sf: 'slider.horizontal.3' },
      ];
    case 'stall':
      return [
        { name: 'StallDashboard', comp: StallDashboard, title: t.tabs.home, sf: 'house', filled: 'house.fill' },
        { name: 'StallHistory', comp: HistoryTab, title: t.tabs.history, sf: 'calendar' },
        { name: 'StallSell', comp: SellTab, title: t.tabs.sell, sf: 'bag', filled: 'bag.fill' },
        { name: 'StallRegulars', comp: RegularsTab, title: t.tabs.regulars, sf: 'heart', filled: 'heart.fill' },
        { name: 'StallManage', comp: StallManageTab, title: t.tabs.manage, sf: 'slider.horizontal.3' },
      ];
    case 'freelance':
      return [
        { name: 'FreelancerHome', comp: FreelancerDashboard, title: t.tabs.home, sf: 'house', filled: 'house.fill' },
        { name: 'FreelancerClients', comp: FreelancerClientsTab, title: t.tabs.clients, sf: 'person.2', filled: 'person.2.fill' },
        { name: 'Notes', comp: NotesTab, title: t.tabs.notes, sf: 'pencil' },
        { name: 'Settings', comp: SettingsTab, title: t.tabs.settings, sf: 'gearshape', filled: 'gearshape.fill' },
      ];
    case 'rider':
      return [
        { name: 'OnTheRoadHome', comp: OnTheRoadDashboard, title: t.tabs.home, sf: 'house', filled: 'house.fill' },
        { name: 'Notes', comp: NotesTab, title: t.tabs.notes, sf: 'pencil' },
        { name: 'Settings', comp: SettingsTab, title: t.tabs.settings, sf: 'gearshape', filled: 'gearshape.fill' },
      ];
    case 'parttime':
      return [
        { name: 'PartTimeHome', comp: PartTimeDashboard, title: t.tabs.home, sf: 'house', filled: 'house.fill' },
        { name: 'Notes', comp: NotesTab, title: t.tabs.notes, sf: 'pencil' },
        { name: 'Settings', comp: SettingsTab, title: t.tabs.settings, sf: 'gearshape', filled: 'gearshape.fill' },
      ];
    case 'mixed':
      return [
        { name: 'MixedHome', comp: MixedDashboard, title: t.tabs.home, sf: 'house', filled: 'house.fill' },
        { name: 'Notes', comp: NotesTab, title: t.tabs.notes, sf: 'pencil' },
        { name: 'Settings', comp: SettingsTab, title: t.tabs.settings, sf: 'gearshape', filled: 'gearshape.fill' },
      ];
    default:
      return [
        { name: 'Dashboard', comp: BusinessDashboard, title: t.tabs.home, sf: 'house', filled: 'house.fill' },
        { name: 'Products', comp: ProductsTab, title: 'Products', sf: 'shippingbox', filled: 'shippingbox.fill' },
        { name: 'POS', comp: PosTab, title: 'POS', sf: 'cart', filled: 'cart.fill' },
        { name: 'CRM', comp: CrmTab, title: 'CRM', sf: 'person.crop.circle.badge.checkmark' },
        { name: 'Settings', comp: SettingsTab, title: t.tabs.settings, sf: 'gearshape', filled: 'gearshape.fill' },
      ];
  }
}

// ── Native path (iOS 26): the genuine system Liquid Glass tab bar ──
const NativeBusinessNavigator: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const incomeType = useBusinessStore((s) => s.incomeType);
  // Business identity is bronze (COLORS.business = warm bronze), not personal's olive.
  // Use the theme-aware C.bronze so the active tab reads legibly on the glass in both
  // light and dark (the raw #B2780A is too dark on the dark glass — same reason personal
  // uses C.accent rather than the raw COLORS.personal).
  const accent = C.bronze;
  const tabs = nativeTabsFor(incomeType, t);
  return (
    <NativeTab.Navigator>
      {tabs.map((tb) => (
        <NativeTab.Screen
          key={tb.name}
          name={tb.name}
          component={tb.comp}
          options={{
            title: tb.title,
            tabBarActiveTintColor: accent,
            // Return typed `any`: sf/filled are validated SF Symbol names at runtime,
            // but the lib types sfSymbol as its literal-union, which a plain string won't satisfy.
            tabBarIcon: ({ focused }): any => ({ sfSymbol: focused && tb.filled ? tb.filled : tb.sf }),
          }}
        />
      ))}
    </NativeTab.Navigator>
  );
};

// ── JS path (Android / iOS < 26): the LiquidGlassNavBar blur fallback ──
const JsBusinessNavigator: React.FC = () => {
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
            <Tab.Screen name="StallManage" component={StallManage} options={{ title: t.tabs.manage }} />
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
            <Tab.Screen name="Products" component={ProductsLegacy} options={{ title: 'Products' }} />
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
        <LiquidGlassNavBar
          {...props}
          accentColor={COLORS.business}
          activeColor={C.bronze}
        />
      )}
      screenOptions={({ route }) => ({
        lazy: true,
        // Android: freezing/unfreezing a tab on blur forces a heavy re-render on
        // re-focus, dropping the first touches so scroll needs 2-3 taps to start.
        // Keep it on iOS (memory) but off on Android. (scroll-responsiveness fix)
        freezeOnBlur: Platform.OS === 'ios',
        tabBarIcon: ({ color, size }: { color: string; size: number }) =>
          getIcon(route.name, color, size),
        tabBarActiveTintColor: COLORS.business,
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
      {renderTabs()}
    </Tab.Navigator>
  );
};

const BusinessNavigator: React.FC = () =>
  USE_NATIVE_TABS ? <NativeBusinessNavigator /> : <JsBusinessNavigator />;

export default BusinessNavigator;
