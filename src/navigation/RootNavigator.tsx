import React from 'react';
import { TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, CardStyleInterpolators, TransitionSpecs } from '@react-navigation/stack';
import { Feather } from '@expo/vector-icons';
import { useAppStore } from '../store/appStore';
import { COLORS, CALM } from '../constants';
import PersonalNavigator from './PersonalNavigator';
import BusinessNavigator from './BusinessNavigator';
import PersonalReports from '../screens/personal/Reports';
import BusinessReports from '../screens/business/Reports';
import SubscriptionList from '../screens/personal/SubscriptionList';
import SupplierList from '../screens/business/SupplierList';
import TransactionsList from '../screens/personal/TransactionsList';
import DebtTracking from '../screens/shared/DebtTracking';
import ReceiptScanner from '../screens/shared/ReceiptScanner';
import WalletManagement from '../screens/personal/WalletManagement';
import AccountOverview from '../screens/personal/AccountOverview';
import SavingsTracker from '../screens/personal/SavingsTracker';
import MoneyChat from '../screens/personal/MoneyChat';
import Goals from '../screens/personal/Goals';
import FinancialPulse from '../screens/personal/FinancialPulse';
import BusinessSetup from '../screens/business/Setup';
import LogIncome from '../screens/business/LogIncome';
import ClientList from '../screens/business/ClientList';
import RiderCostsScreen from '../screens/business/RiderCosts';
import IncomeStreamsScreen from '../screens/business/IncomeStreams';
import SellerNewOrder from '../screens/seller/NewOrder';
import SellerProducts from '../screens/seller/Products';
import SeasonSummary from '../screens/seller/SeasonSummary';
import PastSeasons from '../screens/seller/PastSeasons';
import SellerOrderList from '../screens/seller/OrderList';
import StallSessionSetup from '../screens/stall/SessionSetup';
import StallCloseSession from '../screens/stall/CloseSession';
import StallSessionSummary from '../screens/stall/SessionSummary';
import StallProducts from '../screens/stall/StallProducts';

const Stack = createStackNavigator();

const RootNavigator: React.FC = () => {
  const mode = useAppStore((state) => state.mode);

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          // Add smooth iOS-style transitions
          cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
          gestureEnabled: true,
          gestureDirection: 'horizontal',
          transitionSpec: {
            open: TransitionSpecs.TransitionIOSSpec,
            close: TransitionSpecs.TransitionIOSSpec,
          },
        }}
      >
        {mode === 'personal' ? (
          <Stack.Screen name="PersonalMain" component={PersonalNavigator} />
        ) : (
          <Stack.Screen name="BusinessMain" component={BusinessNavigator} />
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
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
