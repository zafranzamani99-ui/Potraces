import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Alert, BackHandler, TouchableOpacity } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { navigationRef } from './navigationRef';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useAppStore } from '../store/appStore';
import { useSettingsStore } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
import { useCalm } from '../hooks/useCalm';
import AuthScreen from '../screens/auth/AuthScreen';
import OtpVerificationScreen from '../screens/auth/OtpVerificationScreen';
import { requestOtp, signOut, getAuthSession } from '../services/supabase';
import { clearProfileCache } from '../services/sellerSync';
import PersonalNavigator from './PersonalNavigator';
import BusinessNavigator from './BusinessNavigator';
import PersonalReports from '../screens/personal/Reports';
import BusinessReports from '../screens/business/Reports';
import SubscriptionList from '../screens/personal/SubscriptionList';
import BudgetPlanning from '../screens/personal/BudgetPlanning';
import SupplierList from '../screens/business/SupplierList';
import TransactionsList from '../screens/personal/TransactionsList';
import DebtTracking from '../screens/shared/DebtTracking';
import ReceiptScanner from '../screens/shared/ReceiptScanner';
import ReceiptHistory from '../screens/shared/ReceiptHistory';
import ReceiptDetail from '../screens/shared/ReceiptDetail';
import Onboarding from '../screens/shared/Onboarding';
import WalletManagement from '../screens/personal/WalletManagement';
import ImportFromStatement from '../screens/personal/ImportFromStatement';
import ImportFromCsv from '../screens/personal/ImportFromCsv';
import AccountOverview from '../screens/personal/AccountOverview';
import SavingsTracker from '../screens/personal/SavingsTracker';
import MoneyChat from '../screens/personal/MoneyChat';
import Goals from '../screens/personal/Goals';
import FinancialPulse from '../screens/personal/FinancialPulse';
import { useBusinessStore } from '../store/businessStore';
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
import NoteEditor from '../screens/notes/NoteEditor';

const Stack = createNativeStackNavigator();

// Reusable header options for any pushed screen that needs a "< back" button
// which falls back to resetting to the correct mode's main screen when there's
// no back stack. Replaces the ~25-line boilerplate that was duplicated across
// every Stack.Screen below. New screens should use this helper directly:
//   <Stack.Screen name="Foo" component={Foo} options={makeBackHeader(C, mode, 'Title')} />
function makeBackHeader(
  C: typeof import('../constants').CALM,
  mode: 'personal' | 'business',
  title: string,
) {
  return ({ navigation }: any) => ({
    headerShown: true,
    headerTitle: title,
    headerStyle: { backgroundColor: C.background },
    headerTintColor: C.textPrimary,
    headerTitleStyle: { fontWeight: '600' as const, fontSize: 18 },
    headerLeft: () => (
      <TouchableOpacity
        onPress={() => {
          if (navigation.canGoBack()) navigation.goBack();
          else navigation.reset({
            index: 0,
            routes: [{ name: mode === 'personal' ? 'PersonalMain' : 'BusinessMain' }],
          });
        }}
        style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
        accessibilityLabel="Go back"
      >
        <Feather name="arrow-left" size={22} color={C.textPrimary} />
      </TouchableOpacity>
    ),
  });
}

/** Wraps business mode with auth gating + setup gating. */
const AuthGatedBusiness: React.FC = () => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isVerified = useAuthStore((s) => s.isVerified);
  const businessSetupComplete = useBusinessStore((s) => s.businessSetupComplete);
  const incomeType = useBusinessStore((s) => s.incomeType);
  const [otpCode, setOtpCode] = useState<string | null>(null);
  const [otpPhone, setOtpPhone] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const lastOtpAtRef = useRef(0);

  // Validate session on state change — reset stale auth state if no real Supabase session
  useEffect(() => {
    if (isAuthenticated && !isVerified) {
      getAuthSession().then((session) => {
        if (!session) {
          useAuthStore.getState().reset();
        }
      });
    }
  }, [isAuthenticated, isVerified]);

  // Auto-request OTP if authenticated but not verified and no code yet (with cooldown)
  useEffect(() => {
    if (isAuthenticated && !isVerified && !otpCode) {
      const now = Date.now();
      if (now - lastOtpAtRef.current < 30_000) return;
      const phone = useAuthStore.getState().phone;
      if (phone) {
        lastOtpAtRef.current = now;
        setOtpError(null);
        requestOtp(phone).then((otp) => {
          setOtpCode(otp.code);
          setOtpPhone(phone);
        }).catch((err) => {
          if (__DEV__) console.warn('[OTP request failed]', err?.message || err);
          if (err?.message?.includes('Not authenticated')) {
            useAuthStore.getState().reset();
          } else {
            setOtpError(err?.message || 'Failed to request verification code');
          }
          lastOtpAtRef.current = 0;
        });
      }
    }
  }, [isAuthenticated, isVerified, otpCode]);

  const handleVerificationNeeded = useCallback((code: string, phone: string) => {
    setOtpCode(code);
    setOtpPhone(phone);
  }, []);

  const handleAuthenticated = useCallback(() => {
    // Already verified — will re-render as BusinessNavigator
  }, []);

  const handleVerified = useCallback(() => {
    setOtpCode(null);
  }, []);

  const handleOtpBack = useCallback(() => {
    // Invalidate server-side cache immediately — don't depend on SIGNED_OUT event
    // which won't fire if signOut fails offline.
    clearProfileCache();
    signOut().catch((err) => {
      if (__DEV__) console.warn('[signOut] failed:', err?.message || err);
    });
    useAuthStore.getState().reset();
    setOtpCode(null);
    setOtpPhone('');
  }, []);

  if (!isAuthenticated) {
    return (
      <AuthScreen
        onVerificationNeeded={handleVerificationNeeded}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  if (!isVerified || otpCode) {
    return (
      <OtpVerificationScreen
        code={otpCode || ''}
        phone={otpPhone}
        onVerified={handleVerified}
        onBack={handleOtpBack}
        initialError={otpError}
      />
    );
  }

  // Show setup screen if business setup not complete
  if (!businessSetupComplete || !incomeType) {
    return <BusinessSetup />;
  }

  return <BusinessNavigator />;
};

const RootNavigator: React.FC = () => {
  const mode = useAppStore((state) => state.mode);
  const hasCompletedOnboarding = useSettingsStore((s) => s.hasCompletedOnboarding);
  const C = useCalm();
  useEffect(() => {
    const onBackPress = () => {
      if (navigationRef.current?.canGoBack()) return false;
      Alert.alert('Exit Potraces?', undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Exit', style: 'destructive', onPress: () => BackHandler.exitApp() },
      ]);
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, []);

  const navTheme = {
    ...(C.background === '#121212' ? DarkTheme : DefaultTheme),
    colors: {
      ...(C.background === '#121212' ? DarkTheme : DefaultTheme).colors,
      background: C.background,
      card: C.surface,
      text: C.textPrimary,
      border: C.border,
      primary: C.accent,
    },
  };

  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'ios_from_right',
          gestureEnabled: true,
        }}
      >
        {!hasCompletedOnboarding ? (
          <Stack.Screen
            name="Onboarding"
            component={Onboarding}
            options={{
              gestureEnabled: false,
              animation: 'none',
            }}
          />
        ) : mode === 'personal' ? (
          <Stack.Screen
            name="PersonalMain"
            component={PersonalNavigator}
            options={{
              animation: 'fade',
              animationDuration: 300,
              gestureEnabled: false,
            }}
          />
        ) : (
          <Stack.Screen
            name="BusinessMain"
            component={AuthGatedBusiness}
            options={{
              animation: 'fade',
              animationDuration: 300,
              gestureEnabled: false,
            }}
          />
        )}
        <Stack.Screen
          name="PersonalReports"
          component={PersonalReports}
          options={makeBackHeader(C, mode, 'Reports')}
        />
        <Stack.Screen
          name="BusinessReports"
          component={BusinessReports}
          options={makeBackHeader(C, mode, 'Reports')}
        />
        <Stack.Screen
          name="TransactionsList"
          component={TransactionsList}
          options={makeBackHeader(C, mode, 'All Transactions')}
        />
        <Stack.Screen
          name="SubscriptionList"
          component={SubscriptionList}
          options={makeBackHeader(C, mode, 'Commitments')}
        />
        <Stack.Screen
          name="BudgetPlanning"
          component={BudgetPlanning}
          options={makeBackHeader(C, mode, 'Budgets')}
        />
        <Stack.Screen
          name="SupplierList"
          component={SupplierList}
          options={makeBackHeader(C, mode, 'Suppliers')}
        />
        <Stack.Screen
          name="DebtTracking"
          component={DebtTracking}
          options={makeBackHeader(C, mode, 'Debts & Splits')}
        />
        <Stack.Screen
          name="ReceiptScanner"
          component={ReceiptScanner}
          options={makeBackHeader(C, mode, 'Save Receipt')}
        />
        <Stack.Screen
          name="ReceiptHistory"
          component={ReceiptHistory}
          options={makeBackHeader(C, mode, 'Receipts')}
        />
        <Stack.Screen
          name="ReceiptDetail"
          component={ReceiptDetail}
          options={makeBackHeader(C, mode, 'Receipt')}
        />
        <Stack.Screen
          name="ImportFromStatement"
          component={ImportFromStatement}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ImportFromCsv"
          component={ImportFromCsv}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="WalletManagement"
          component={WalletManagement}
          options={makeBackHeader(C, mode, 'Manage Wallets')}
        />
        <Stack.Screen
          name="AccountOverview"
          component={AccountOverview}
          options={makeBackHeader(C, mode, 'Account Overview')}
        />
        <Stack.Screen
          name="SavingsTracker"
          component={SavingsTracker}
          options={makeBackHeader(C, mode, 'Savings & Investments')}
        />
        <Stack.Screen
          name="MoneyChat"
          component={MoneyChat}
          options={makeBackHeader(C, mode, 'Money Chat')}
        />
        <Stack.Screen
          name="Goals"
          component={Goals}
          options={makeBackHeader(C, mode, 'My Goals')}
        />
        <Stack.Screen
          name="FinancialPulse"
          component={FinancialPulse}
          options={makeBackHeader(C, mode, 'Financial Pulse')}
        />
        <Stack.Screen
          name="LogIncome"
          component={LogIncome}
          options={makeBackHeader(C, mode, 'Log Income')}
        />
        <Stack.Screen
          name="ClientList"
          component={ClientList}
          options={makeBackHeader(C, mode, 'Clients')}
        />
        <Stack.Screen
          name="RiderCosts"
          component={RiderCostsScreen}
          options={makeBackHeader(C, mode, 'Costs')}
        />
        <Stack.Screen
          name="IncomeStreams"
          component={IncomeStreamsScreen}
          options={makeBackHeader(C, mode, 'Income Streams')}
        />
        <Stack.Screen
          name="SellerNewOrder"
          component={SellerNewOrder}
          options={makeBackHeader(C, mode, 'New Order')}
        />
        <Stack.Screen
          name="SellerOrderList"
          component={SellerOrderList}
          options={makeBackHeader(C, mode, 'Orders')}
        />
        <Stack.Screen
          name="SellerTransactions"
          component={SellerTransactions}
          options={makeBackHeader(C, mode, 'Transactions')}
        />
        <Stack.Screen
          name="SellerProducts"
          component={SellerProducts}
          options={makeBackHeader(C, mode, 'Products')}
        />
        <Stack.Screen
          name="SellerCosts"
          component={SellerCosts}
          options={makeBackHeader(C, mode, 'Costs')}
        />
        <Stack.Screen
          name="SeasonSummary"
          component={SeasonSummary}
          options={makeBackHeader(C, mode, 'Season')}
        />
        <Stack.Screen
          name="Settings"
          component={Settings}
          options={makeBackHeader(C, mode, 'Settings')}
        />
        <Stack.Screen
          name="SellerSettings"
          component={Settings}
          options={makeBackHeader(C, mode, 'Settings')}
        />
        <Stack.Screen
          name="PastSeasons"
          component={PastSeasons}
          options={makeBackHeader(C, mode, 'Seasons')}
        />
        <Stack.Screen
          name="StallSessionSetup"
          component={StallSessionSetup}
          options={makeBackHeader(C, mode, 'New Session')}
        />
        <Stack.Screen
          name="StallCloseSession"
          component={StallCloseSession}
          options={makeBackHeader(C, mode, 'Close Session')}
        />
        <Stack.Screen
          name="StallSessionSummary"
          component={StallSessionSummary}
          options={makeBackHeader(C, mode, 'Session Summary')}
        />
        <Stack.Screen
          name="StallProducts"
          component={StallProducts}
          options={makeBackHeader(C, mode, 'Products')}
        />
        <Stack.Screen
          name="FreelancerClientList"
          component={FreelancerClientListScreen}
          options={makeBackHeader(C, mode, 'Clients')}
        />
        <Stack.Screen
          name="FreelancerClientDetail"
          component={FreelancerClientDetail}
          options={makeBackHeader(C, mode, 'Client')}
        />
        <Stack.Screen
          name="FreelancerAddPayment"
          component={FreelancerAddPayment}
          options={makeBackHeader(C, mode, 'Log Payment')}
        />
        <Stack.Screen
          name="FreelancerReports"
          component={FreelancerReports}
          options={makeBackHeader(C, mode, 'Reports')}
        />
        <Stack.Screen
          name="PartTimeSetup"
          component={PartTimeSetup}
          options={makeBackHeader(C, mode, 'Job Details')}
        />
        <Stack.Screen
          name="PartTimeAddIncome"
          component={PartTimeAddIncome}
          options={makeBackHeader(C, mode, 'Log Income')}
        />
        <Stack.Screen
          name="PartTimeIncomeHistory"
          component={PartTimeIncomeHistory}
          options={makeBackHeader(C, mode, 'Income History')}
        />
        <Stack.Screen
          name="PartTimeReports"
          component={PartTimeReports}
          options={makeBackHeader(C, mode, 'Reports')}
        />
        <Stack.Screen
          name="OnTheRoadSetup"
          component={OnTheRoadSetup}
          options={makeBackHeader(C, mode, 'Road Details')}
        />
        <Stack.Screen
          name="OnTheRoadAddEarnings"
          component={OnTheRoadAddEarnings}
          options={makeBackHeader(C, mode, 'Log Earnings')}
        />
        <Stack.Screen
          name="OnTheRoadAddCost"
          component={OnTheRoadAddCost}
          options={makeBackHeader(C, mode, 'Log Cost')}
        />
        <Stack.Screen
          name="OnTheRoadCostHistory"
          component={OnTheRoadCostHistory}
          options={makeBackHeader(C, mode, 'Costs')}
        />
        <Stack.Screen
          name="OnTheRoadReports"
          component={OnTheRoadReports}
          options={makeBackHeader(C, mode, 'Reports')}
        />
        <Stack.Screen
          name="MixedSetup"
          component={MixedSetup}
          options={makeBackHeader(C, mode, 'Stream Setup')}
        />
        <Stack.Screen
          name="MixedAddIncome"
          component={MixedAddIncome}
          options={makeBackHeader(C, mode, 'Log Income')}
        />
        <Stack.Screen
          name="MixedAddCost"
          component={MixedAddCost}
          options={makeBackHeader(C, mode, 'Log Cost')}
        />
        <Stack.Screen
          name="MixedStreamHistory"
          component={MixedStreamHistory}
          options={makeBackHeader(C, mode, 'History')}
        />
        <Stack.Screen
          name="MixedReports"
          component={MixedReports}
          options={makeBackHeader(C, mode, 'Reports')}
        />
        <Stack.Screen
          name="NoteEditor"
          component={NoteEditor}
          options={{ headerShown: false }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default RootNavigator;
