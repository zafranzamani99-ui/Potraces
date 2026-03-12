import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { startOfMonth } from 'date-fns';
import { usePersonalStore } from './personalStore';
import { useBusinessStore } from './businessStore';
import { useDebtStore } from './debtStore';
import { useCRMStore } from './crmStore';
import { useAppStore } from './appStore';
import { useWalletStore } from './walletStore';
import { usePremiumStore } from './premiumStore';
import { useStallStore } from './stallStore';
import { useSellerStore } from './sellerStore';
import { useCategoryStore } from './categoryStore';
import { useFreelancerStore } from './freelancerStore';
import { usePartTimeStore } from './partTimeStore';
import { useOnTheRoadStore } from './onTheRoadStore';
import { useMixedStore } from './mixedStore';
import { useAuthStore } from './authStore';
import { clearBusinessDataRemote, signOut } from '../services/supabase';
import { clearProfileCache } from '../services/sellerSync';

export interface PaymentQr {
  uri: string;
  label: string;
}

interface SettingsState {
  userName: string;
  currency: string;
  hapticEnabled: boolean;
  notificationsEnabled: boolean;
  businessModeEnabled: boolean;
  defaultMode: 'personal' | 'business';
  paymentQrs: PaymentQr[];
  businessPaymentQrs: PaymentQr[];
  hasCompletedOnboarding: boolean;
  setUserName: (name: string) => void;
  setCurrency: (currency: string) => void;
  setHapticEnabled: (enabled: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setBusinessModeEnabled: (enabled: boolean) => void;
  setDefaultMode: (mode: 'personal' | 'business') => void;
  addPaymentQr: (uri: string, label: string, mode?: 'personal' | 'business') => void;
  removePaymentQr: (index: number, mode?: 'personal' | 'business') => void;
  replacePaymentQr: (index: number, uri: string, label?: string, mode?: 'personal' | 'business') => void;
  updatePaymentQrLabel: (index: number, label: string, mode?: 'personal' | 'business') => void;
  getPaymentQrs: (mode: 'personal' | 'business') => PaymentQr[];
  setHasCompletedOnboarding: (value: boolean) => void;
  clearAllData: () => void;
  clearBusinessData: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      userName: '',
      currency: 'RM',
      hapticEnabled: true,
      notificationsEnabled: true,
      businessModeEnabled: false,
      defaultMode: 'personal',
      paymentQrs: [],
      businessPaymentQrs: [],
      hasCompletedOnboarding: false,

      setUserName: (userName) => set({ userName }),
      setCurrency: (currency) => set({ currency }),
      setHapticEnabled: (hapticEnabled) => set({ hapticEnabled }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      setBusinessModeEnabled: (businessModeEnabled) => set({ businessModeEnabled }),
      setDefaultMode: (defaultMode) => set({ defaultMode }),
      addPaymentQr: (uri, label, mode) => set((s) => {
        const key = mode === 'business' ? 'businessPaymentQrs' : 'paymentQrs';
        const arr = s[key] || [];
        return { [key]: arr.length < 2 ? [...arr, { uri, label }] : arr };
      }),
      removePaymentQr: (index, mode) => set((s) => {
        const key = mode === 'business' ? 'businessPaymentQrs' : 'paymentQrs';
        return { [key]: (s[key] || []).filter((_, i) => i !== index) };
      }),
      replacePaymentQr: (index, uri, label, mode) => set((s) => {
        const key = mode === 'business' ? 'businessPaymentQrs' : 'paymentQrs';
        return { [key]: (s[key] || []).map((q, i) => i === index ? { uri, label: label ?? q.label } : q) };
      }),
      updatePaymentQrLabel: (index, label, mode) => set((s) => {
        const key = mode === 'business' ? 'businessPaymentQrs' : 'paymentQrs';
        return { [key]: (s[key] || []).map((q, i) => i === index ? { ...q, label } : q) };
      }),
      getPaymentQrs: (mode) => {
        const s = get();
        return mode === 'business' ? s.businessPaymentQrs : s.paymentQrs;
      },
      setHasCompletedOnboarding: (hasCompletedOnboarding) => set({ hasCompletedOnboarding }),

      clearAllData: () => {
        usePersonalStore.setState({
          transactions: [],
          subscriptions: [],
          budgets: [],
          goals: [],
        });

        useBusinessStore.setState({
          incomeType: null,
          businessSetupComplete: false,
          businessTransactions: [],
          clients: [],
          riderCosts: [],
          incomeStreams: [],
          transfers: [],
          products: [],
          sales: [],
          suppliers: [],
        });

        useStallStore.setState({
          sessions: [],
          activeSessionId: null,
          products: [],
          regularCustomers: [],
        });

        useSellerStore.setState({
          products: [],
          orders: [],
          seasons: [],
          ingredientCosts: [],
          customUnits: [],
          sellerCustomers: [],
          seenOnlineOrderIds: [],
          costTemplates: [],
          recurringCosts: [],
        });

        useCategoryStore.setState({
          customExpenseCategories: [],
          customIncomeCategories: [],
          expenseCategoryOverrides: {},
          incomeCategoryOverrides: {},
          expenseCategoryOrder: [],
          incomeCategoryOrder: [],
        });

        useDebtStore.setState({
          debts: [],
          splits: [],
          contacts: [],
        });

        useCRMStore.setState({
          customers: [],
          orders: [],
        });

        useFreelancerStore.setState({
          clients: [],
        });

        usePartTimeStore.setState({
          jobDetails: { jobName: '', setupComplete: false },
        });

        useOnTheRoadStore.setState({
          roadDetails: { description: '', vehicleType: 'motorcycle', setupComplete: false },
        });

        useMixedStore.setState({
          mixedDetails: { streams: [], hasRoadCosts: false, setupComplete: false },
          lastUsedStream: null,
        });

        useWalletStore.setState({
          wallets: [],
          transfers: [],
          selectedWalletId: null,
        });

        usePremiumStore.setState({
          tier: 'free',
          subscribedAt: null,
          scanCount: 0,
          scanResetDate: startOfMonth(new Date()),
        });

        useAppStore.setState({ mode: 'personal' });

        set({
          userName: '',
          currency: 'RM',
          hapticEnabled: true,
          notificationsEnabled: true,
          businessModeEnabled: false,
          defaultMode: 'personal',
          paymentQrs: [],
          businessPaymentQrs: [],
          hasCompletedOnboarding: false,
        });
      },

      clearBusinessData: async () => {
        // 1. Clear local business stores (in-memory)
        useBusinessStore.setState({
          incomeType: null,
          businessSetupComplete: false,
          businessTransactions: [],
          clients: [],
          riderCosts: [],
          incomeStreams: [],
          transfers: [],
          products: [],
          sales: [],
          suppliers: [],
        });

        useSellerStore.setState({
          products: [],
          orders: [],
          seasons: [],
          ingredientCosts: [],
          customUnits: [],
          sellerCustomers: [],
          seenOnlineOrderIds: [],
          costTemplates: [],
          recurringCosts: [],
        });

        useStallStore.setState({
          sessions: [],
          activeSessionId: null,
          products: [],
          regularCustomers: [],
        });

        useFreelancerStore.setState({ clients: [] });
        usePartTimeStore.setState({ jobDetails: { jobName: '', setupComplete: false } });
        useOnTheRoadStore.setState({
          roadDetails: { description: '', vehicleType: 'motorcycle', setupComplete: false },
        });
        useMixedStore.setState({
          mixedDetails: { streams: [], hasRoadCosts: false, setupComplete: false },
          lastUsedStream: null,
        });
        useCRMStore.setState({ customers: [], orders: [] });

        // 1b. Force-remove AsyncStorage keys so rehydration can't restore old data
        await Promise.all([
          AsyncStorage.removeItem('business-storage'),
          AsyncStorage.removeItem('seller-storage'),
          AsyncStorage.removeItem('stall-storage'),
          AsyncStorage.removeItem('freelancer-storage'),
          AsyncStorage.removeItem('parttime-storage'),
          AsyncStorage.removeItem('ontheroad-storage'),
          AsyncStorage.removeItem('mixed-storage'),
          AsyncStorage.removeItem('crm-storage'),
          AsyncStorage.removeItem('auth-storage'),
        ]);

        // 2. Delete remote data + auth user
        try {
          await clearBusinessDataRemote();
        } catch {
          // continue even if remote clear fails
        }

        // 3. Sign out
        try {
          await signOut();
        } catch {
          // continue even if sign out fails
        }

        // 4. Reset auth store + clear profile cache
        useAuthStore.getState().reset();
        clearProfileCache();

        // 5. Switch to personal mode
        useAppStore.setState({ mode: 'personal' });
        set({
          businessModeEnabled: false,
          defaultMode: 'personal',
          businessPaymentQrs: [],
        });
      },
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Migrate old paymentQrUri/paymentQrUris → paymentQrs
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const raw = state as any;
        // Migrate from single string
        if (raw.paymentQrUri && (!state.paymentQrs || state.paymentQrs.length === 0)) {
          state.paymentQrs = [{ uri: raw.paymentQrUri, label: 'QR 1' }];
          delete raw.paymentQrUri;
        }
        // Migrate from string array
        if (raw.paymentQrUris && Array.isArray(raw.paymentQrUris) && raw.paymentQrUris.length > 0 && (!state.paymentQrs || state.paymentQrs.length === 0)) {
          state.paymentQrs = raw.paymentQrUris.map((uri: string, i: number) => ({ uri, label: `QR ${i + 1}` }));
          delete raw.paymentQrUris;
        }
        // Ensure businessPaymentQrs exists
        if (!state.businessPaymentQrs) {
          state.businessPaymentQrs = [];
        }
      },
    }
  )
);
