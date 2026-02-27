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
          products: [],
          sales: [],
          suppliers: [],
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
