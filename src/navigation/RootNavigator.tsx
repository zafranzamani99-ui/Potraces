import React from 'react';
import { TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, CardStyleInterpolators, TransitionSpecs } from '@react-navigation/stack';
import { Feather } from '@expo/vector-icons';
import { useAppStore } from '../store/appStore';
import { COLORS } from '../constants';
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
            headerStyle: { backgroundColor: COLORS.personal },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' as const, fontSize: 18 },
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
                <Feather name="arrow-left" size={24} color="#fff" />
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
            headerStyle: { backgroundColor: COLORS.business },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' as const, fontSize: 18 },
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
                <Feather name="arrow-left" size={24} color="#fff" />
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
            headerStyle: { backgroundColor: COLORS.personal },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' as const, fontSize: 18 },
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
                <Feather name="arrow-left" size={24} color="#fff" />
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="SubscriptionList"
          component={SubscriptionList}
          options={({ navigation }) => ({
            headerShown: true,
            headerTitle: 'Subscriptions',
            headerStyle: { backgroundColor: COLORS.personal },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' as const, fontSize: 18 },
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
                <Feather name="arrow-left" size={24} color="#fff" />
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
            headerStyle: { backgroundColor: COLORS.business },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' as const, fontSize: 18 },
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
                <Feather name="arrow-left" size={24} color="#fff" />
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
            headerStyle: { backgroundColor: mode === 'personal' ? COLORS.personal : COLORS.business },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' as const, fontSize: 18 },
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
                <Feather name="arrow-left" size={24} color="#fff" />
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
            headerStyle: { backgroundColor: mode === 'personal' ? COLORS.personal : COLORS.business },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' as const, fontSize: 18 },
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
                <Feather name="arrow-left" size={24} color="#fff" />
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
            headerStyle: { backgroundColor: COLORS.personal },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' as const, fontSize: 18 },
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
                <Feather name="arrow-left" size={24} color="#fff" />
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
            headerStyle: { backgroundColor: COLORS.personal },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' as const, fontSize: 18 },
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
                <Feather name="arrow-left" size={24} color="#fff" />
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
            headerStyle: { backgroundColor: COLORS.personal },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' as const, fontSize: 18 },
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
                <Feather name="arrow-left" size={24} color="#fff" />
              </TouchableOpacity>
            ),
          })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
