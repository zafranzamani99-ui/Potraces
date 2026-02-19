import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator, CardStyleInterpolators, TransitionSpecs } from '@react-navigation/stack';
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
          options={{
            headerShown: true,
            headerTitle: 'Reports',
            headerStyle: { backgroundColor: COLORS.personal },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' as const, fontSize: 18 },
            presentation: 'card', // Slide from right
          }}
        />
        <Stack.Screen
          name="BusinessReports"
          component={BusinessReports}
          options={{
            headerShown: true,
            headerTitle: 'Reports',
            headerStyle: { backgroundColor: COLORS.business },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' as const, fontSize: 18 },
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="TransactionsList"
          component={TransactionsList}
          options={{
            headerShown: true,
            headerTitle: 'All Transactions',
            headerStyle: { backgroundColor: COLORS.personal },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' as const, fontSize: 18 },
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="SubscriptionList"
          component={SubscriptionList}
          options={{
            headerShown: true,
            headerTitle: 'Subscriptions',
            headerStyle: { backgroundColor: COLORS.personal },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' as const, fontSize: 18 },
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="SupplierList"
          component={SupplierList}
          options={{
            headerShown: true,
            headerTitle: 'Suppliers',
            headerStyle: { backgroundColor: COLORS.business },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' as const, fontSize: 18 },
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="DebtTracking"
          component={DebtTracking}
          options={{
            headerShown: true,
            headerTitle: 'Debts & Splits',
            headerStyle: { backgroundColor: mode === 'personal' ? COLORS.personal : COLORS.business },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' as const, fontSize: 18 },
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="ReceiptScanner"
          component={ReceiptScanner}
          options={{
            headerShown: true,
            headerTitle: 'Scan Receipt',
            headerStyle: { backgroundColor: mode === 'personal' ? COLORS.personal : COLORS.business },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' as const, fontSize: 18 },
            presentation: 'card',
          }}
        />
        <Stack.Screen
          name="WalletManagement"
          component={WalletManagement}
          options={{
            headerShown: true,
            headerTitle: 'Manage Wallets',
            headerStyle: { backgroundColor: COLORS.personal },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' as const, fontSize: 18 },
            presentation: 'card',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
