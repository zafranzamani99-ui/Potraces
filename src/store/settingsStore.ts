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

interface SettingsState {
  userName: string;
  currency: string;
  hapticEnabled: boolean;
  notificationsEnabled: boolean;
  businessModeEnabled: boolean;
  defaultMode: 'personal' | 'business';
  setUserName: (name: string) => void;
  setCurrency: (currency: string) => void;
  setHapticEnabled: (enabled: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setBusinessModeEnabled: (enabled: boolean) => void;
  setDefaultMode: (mode: 'personal' | 'business') => void;
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

      setUserName: (userName) => set({ userName }),
      setCurrency: (currency) => set({ currency }),
      setHapticEnabled: (hapticEnabled) => set({ hapticEnabled }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      setBusinessModeEnabled: (businessModeEnabled) => set({ businessModeEnabled }),
      setDefaultMode: (defaultMode) => set({ defaultMode }),

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
        });
      },
    }),
    {
      name: 'settings-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
