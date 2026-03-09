import React from 'react';
import { TouchableOpacity, Easing } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from './navigationRef';
import { createStackNavigator, CardStyleInterpolators, StackCardStyleInterpolator } from '@react-navigation/stack';
import { Feather } from '@expo/vector-icons';
import { useAppStore } from '../store/appStore';
import { useSettingsStore } from '../store/settingsStore';
import { CALM } from '../constants';
import PersonalNavigator from './PersonalNavigator';
import BusinessNavigator from './BusinessNavigator';
import PersonalReports from '../screens/personal/Reports';
import BusinessReports from '../screens/business/Reports';
import SubscriptionList from '../screens/personal/SubscriptionList';
import SupplierList from '../screens/business/SupplierList';
import TransactionsList from '../screens/personal/TransactionsList';
import DebtTracking from '../screens/shared/DebtTracking';
import ReceiptScanner from '../screens/shared/ReceiptScanner';
import Onboarding from '../screens/shared/Onboarding';
import WalletManagement from '../screens/personal/WalletManagement';
import AccountOverview from '../screens/personal/AccountOverview';
import SavingsTracker from '../screens/personal/SavingsTracker';
import MoneyChat from '../screens/personal/MoneyChat';
import Goals from '../screens/personal/Goals';
import FinancialPulse from '../screens/personal/FinancialPulse';
import BusinessSetup from '../screens/business/Setup';
import Settings from '../screens/shared/Settings';
import LogIncome from '../screens/business/LogIncome';
import ClientList from '../screens/business/ClientList';
import RiderCostsScreen from '../screens/business/RiderCosts';
import IncomeStreamsScreen from '../screens/business/IncomeStreams';
import SellerNewOrder from '../screens/seller/NewOrder';
import SellerProducts from '../screens/seller/Products';
import SeasonSummary from '../screens/seller/SeasonSummary';
import PastSeasons from '../screens/seller/PastSeasons';
import SellerCosts from '../screens/seller/CostManagement';
import SellerCustomersScreen from '../screens/seller/Customers';
import SellerOrderList from '../screens/seller/OrderList';
import SellerTransactions from '../screens/seller/Transactions';
import StallSessionSetup from '../screens/stall/SessionSetup';
import StallCloseSession from '../screens/stall/CloseSession';
import StallSessionSummary from '../screens/stall/SessionSummary';
import StallProducts from '../screens/stall/StallProducts';
import FreelancerClientDetail from '../screens/business/freelancer/ClientDetail';
import FreelancerAddPayment from '../screens/business/freelancer/AddPayment';
import FreelancerReports from '../screens/business/freelancer/FreelancerReports';
import FreelancerClientListScreen from '../screens/business/freelancer/ClientList';

// Part-time screens
import PartTimeSetup from '../screens/business/parttime/PartTimeSetup';
import PartTimeAddIncome from '../screens/business/parttime/AddIncome';
import PartTimeIncomeHistory from '../screens/business/parttime/IncomeHistory';
import PartTimeReports from '../screens/business/parttime/PartTimeReports';

// On-the-road screens
import OnTheRoadSetup from '../screens/business/ontheroad/OnTheRoadSetup';
import OnTheRoadAddEarnings from '../screens/business/ontheroad/AddEarnings';
import OnTheRoadAddCost from '../screens/business/ontheroad/AddCost';
import OnTheRoadCostHistory from '../screens/business/ontheroad/CostHistory';
import OnTheRoadReports from '../screens/business/ontheroad/OnTheRoadReports';

// Mixed screens
import MixedSetup from '../screens/business/mixed/MixedSetup';
import MixedAddIncome from '../screens/business/mixed/AddIncome';
import MixedAddCost from '../screens/business/mixed/AddCost';
import MixedStreamHistory from '../screens/business/mixed/StreamHistory';
import MixedReports from '../screens/business/mixed/MixedReports';

const Stack = createStackNavigator();

// Smooth crossfade with subtle scale for mode toggle
const forCrossFade: StackCardStyleInterpolator = ({ current }) => ({
  cardStyle: {
    opacity: current.progress.interpolate({
      inputRange: [0, 0.5, 0.9, 1],
      outputRange: [0, 0.25, 0.7, 1],
    }),
    transform: [
      {
        scale: current.progress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.94, 1],
        }),
      },
    ],
  },
  overlayStyle: {
    opacity: current.progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 0.5],
    }),
  },
});

const modeTransitionSpec = {
  open: {
    animation: 'timing' as const,
    config: {
      duration: 300,
      easing: Easing.out(Easing.cubic),
    },
  },
  close: {
    animation: 'timing' as const,
    config: {
      duration: 250,
      easing: Easing.in(Easing.cubic),
    },
  },
};

const RootNavigator: React.FC = () => {
  const mode = useAppStore((state) => state.mode);
  const hasCompletedOnboarding = useSettingsStore((s) => s.hasCompletedOnboarding);

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
          gestureEnabled: true,
        }}
      >
        {!hasCompletedOnboarding ? (
          <Stack.Screen
            name="Onboarding"
            component={Onboarding}
            options={{
              gestureEnabled: false,
              cardStyleInterpolator: () => ({}),
            }}
          />
        ) : mode === 'personal' ? (
          <Stack.Screen
            name="PersonalMain"
            component={PersonalNavigator}
            options={{
              cardStyleInterpolator: forCrossFade,
              transitionSpec: modeTransitionSpec,
              gestureEnabled: false,
            }}
          />
        ) : (
          <Stack.Screen
            name="BusinessMain"
            component={BusinessNavigator}
            options={{
              cardStyleInterpolator: forCrossFade,
              transitionSpec: modeTransitionSpec,
              gestureEnabled: false,
            }}
          />
        )}
        <Stack.Screen
          name="PersonalReports"
          component={PersonalReports}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Reports',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: mode === 'personal' ? 'PersonalMain' : 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="BusinessReports"
          component={BusinessReports}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Reports',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: mode === 'personal' ? 'PersonalMain' : 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="TransactionsList"
          component={TransactionsList}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'All Transactions',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: mode === 'personal' ? 'PersonalMain' : 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="SubscriptionList"
          component={SubscriptionList}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Commitments',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: mode === 'personal' ? 'PersonalMain' : 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="SupplierList"
          component={SupplierList}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Suppliers',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: mode === 'personal' ? 'PersonalMain' : 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="DebtTracking"
          component={DebtTracking}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Debts & Splits',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: mode === 'personal' ? 'PersonalMain' : 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="ReceiptScanner"
          component={ReceiptScanner}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Scan Receipt',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: mode === 'personal' ? 'PersonalMain' : 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="WalletManagement"
          component={WalletManagement}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Manage Wallets',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: mode === 'personal' ? 'PersonalMain' : 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="AccountOverview"
          component={AccountOverview}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Account Overview',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: mode === 'personal' ? 'PersonalMain' : 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="SavingsTracker"
          component={SavingsTracker}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Savings & Investments',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: mode === 'personal' ? 'PersonalMain' : 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="MoneyChat"
          component={MoneyChat}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Money Chat',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: mode === 'personal' ? 'PersonalMain' : 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="Goals"
          component={Goals}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'My Goals',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: mode === 'personal' ? 'PersonalMain' : 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="FinancialPulse"
          component={FinancialPulse}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Financial Pulse',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: mode === 'personal' ? 'PersonalMain' : 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="BusinessSetup"
          component={BusinessSetup}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="LogIncome"
          component={LogIncome}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Log Income',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="ClientList"
          component={ClientList}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Clients',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="RiderCosts"
          component={RiderCostsScreen}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Costs',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="IncomeStreams"
          component={IncomeStreamsScreen}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Income Streams',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="SellerNewOrder"
          component={SellerNewOrder}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'New Order',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="SellerOrderList"
          component={SellerOrderList}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Orders',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="SellerTransactions"
          component={SellerTransactions}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Transactions',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="SellerProducts"
          component={SellerProducts}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Products',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="SellerCosts"
          component={SellerCosts}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Costs',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="SellerCustomersStack"
          component={SellerCustomersScreen}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Customers',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="SeasonSummary"
          component={SeasonSummary}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Season',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="Settings"
          component={Settings}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Settings',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="SellerSettings"
          component={Settings}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Settings',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="PastSeasons"
          component={PastSeasons}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Seasons',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="StallSessionSetup"
          component={StallSessionSetup}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'New Session',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="StallCloseSession"
          component={StallCloseSession}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Close Session',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="StallSessionSummary"
          component={StallSessionSummary}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Session Summary',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="StallProducts"
          component={StallProducts}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Products',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="FreelancerClientList"
          component={FreelancerClientListScreen}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Clients',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="FreelancerClientDetail"
          component={FreelancerClientDetail}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Client',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="FreelancerAddPayment"
          component={FreelancerAddPayment}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Log Payment',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="FreelancerReports"
          component={FreelancerReports}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Reports',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="PartTimeSetup"
          component={PartTimeSetup}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Job Details',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="PartTimeAddIncome"
          component={PartTimeAddIncome}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Log Income',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="PartTimeIncomeHistory"
          component={PartTimeIncomeHistory}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Income History',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="PartTimeReports"
          component={PartTimeReports}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Reports',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="OnTheRoadSetup"
          component={OnTheRoadSetup}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Road Details',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="OnTheRoadAddEarnings"
          component={OnTheRoadAddEarnings}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Log Earnings',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="OnTheRoadAddCost"
          component={OnTheRoadAddCost}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Log Cost',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="OnTheRoadCostHistory"
          component={OnTheRoadCostHistory}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Costs',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="OnTheRoadReports"
          component={OnTheRoadReports}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Reports',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="MixedSetup"
          component={MixedSetup}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Stream Setup',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="MixedAddIncome"
          component={MixedAddIncome}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Log Income',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="MixedAddCost"
          component={MixedAddCost}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Log Cost',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="MixedStreamHistory"
          component={MixedStreamHistory}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'History',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="MixedReports"
          component={MixedReports}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Reports',
            headerStyle: { backgroundColor: CALM.background },
            headerTintColor: CALM.textPrimary,
            headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
            presentation: 'card',
            headerLeft: () => (
              <TouchableOpacity
                onPress={() => {
                  if (navigation.canGoBack()) {
                    navigation.goBack();
                  } else {
                    navigation.reset({
                      index: 0,
                      routes: [{ name: 'BusinessMain' }],
                    });
                  }
                }}
                style={{ marginLeft: 16 }}
                accessibilityLabel="Go back"
              >
                <Feather name="arrow-left" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            ),
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
