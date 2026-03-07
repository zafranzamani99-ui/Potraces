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
  hasCompletedOnboarding: boolean;
  setUserName: (name: string) => void;
  setCurrency: (currency: string) => void;
  setHapticEnabled: (enabled: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setBusinessModeEnabled: (enabled: boolean) => void;
  setDefaultMode: (mode: 'personal' | 'business') => void;
  addPaymentQr: (uri: string, label: string) => void;
  removePaymentQr: (index: number) => void;
  replacePaymentQr: (index: number, uri: string, label?: string) => void;
  updatePaymentQrLabel: (index: number, label: string) => void;
  setHasCompletedOnboarding: (value: boolean) => void;
  clearAllData: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      userName: '',
      currency: 'RM',
      hapticEnabled: true,
      notificationsEnabled: true,
      businessModeEnabled: false,
      defaultMode: 'personal',
      paymentQrs: [],
      hasCompletedOnboarding: false,

      setUserName: (userName) => set({ userName }),
      setCurrency: (currency) => set({ currency }),
      setHapticEnabled: (hapticEnabled) => set({ hapticEnabled }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      setBusinessModeEnabled: (businessModeEnabled) => set({ businessModeEnabled }),
      setDefaultMode: (defaultMode) => set({ defaultMode }),
      addPaymentQr: (uri, label) => set((s) => ({
        paymentQrs: s.paymentQrs.length < 2 ? [...s.paymentQrs, { uri, label }] : s.paymentQrs,
      })),
      removePaymentQr: (index) => set((s) => ({
        paymentQrs: s.paymentQrs.filter((_, i) => i !== index),
      })),
      replacePaymentQr: (index, uri, label) => set((s) => ({
        paymentQrs: s.paymentQrs.map((q, i) => i === index ? { uri, label: label ?? q.label } : q),
      })),
      updatePaymentQrLabel: (index, label) => set((s) => ({
        paymentQrs: s.paymentQrs.map((q, i) => i === index ? { ...q, label } : q),
      })),
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
          hasCompletedOnboarding: false,
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
      },
    }
  )
);
