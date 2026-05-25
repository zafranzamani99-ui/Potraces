import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { startOfMonth } from 'date-fns';
import { usePersonalStore } from './personalStore';
import { useBusinessStore } from './businessStore';
import { useDebtStore } from './debtStore';
import { useCRMStore } from './crmStore';
import { useAppStore } from './appStore';
import { useWalletStore } from './walletStore';
import { usePremiumStore } from './premiumStore';
import { useStallStore } from './stallStore';
import { useSellerStore, clearSellerCaches } from './sellerStore';
import { useCategoryStore } from './categoryStore';
import { useFreelancerStore } from './freelancerStore';
import { usePartTimeStore } from './partTimeStore';
import { useOnTheRoadStore } from './onTheRoadStore';
import { useMixedStore } from './mixedStore';
import { useAuthStore } from './authStore';
import { useNotesStore } from './notesStore';
import { useLearningStore } from './learningStore';
import { usePlaybookStore } from './playbookStore';
import { useAIInsightsStore } from './aiInsightsStore';
import { useReceiptStore } from './receiptStore';
import { useSavingsStore } from './savingsStore';
import { clearBusinessDataRemote, signOut } from '../services/supabase';
import { clearProfileCache } from '../services/sellerSync';
import { DEFAULT_PAYMENT_METHODS } from '../constants/taxCategories';
import { DEFAULT_COST_CATEGORIES } from '../constants';
import { CategoryOption } from '../types';

/**
 * Clear all business-mode data from local state + AsyncStorage. LOCAL ONLY —
 * never touches remote. Used on sign-out (so the next user on a shared device
 * can't see the previous seller's orders/products/customers) and could back
 * the destructive clear-data flow. Resets the tombstone arrays too, otherwise
 * a stale deleted-id could delete the next user's remote rows on first sync.
 */
export async function clearBusinessLocalData(): Promise<void> {
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
    products: [], orders: [], seasons: [], ingredientCosts: [],
    customUnits: [], sellerCustomers: [], seenOnlineOrderIds: [],
    costTemplates: [], recurringCosts: [],
    costCategories: DEFAULT_COST_CATEGORIES, costCategoriesSeeded: false,
    stockAdjustments: [], productOrder: [],
    _deletedProductIds: [], _deletedOrderIds: [], _deletedSeasonIds: [],
    _deletedCustomerIds: [], _deletedCostIds: [], _deletedCostCategoryIds: [],
  });
  useStallStore.setState({
    sessions: [], activeSessionId: null, products: [], regularCustomers: [],
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

  // Module-level derived caches survive the store reset above — clear them too.
  clearSellerCaches();

  await Promise.all([
    'business-storage', 'seller-storage', 'stall-storage', 'freelancer-storage',
    'parttime-storage', 'ontheroad-storage', 'mixed-storage', 'crm-storage',
  ].map((k) => AsyncStorage.removeItem(k).catch(() => {})));
}

export interface PaymentQr {
  uri: string;
  label: string;
}

export type ThemePreference = 'light' | 'dark' | 'system';
export type AppLanguage = 'en' | 'ms';

interface SettingsState {
  userName: string;
  currency: string;
  hapticEnabled: boolean;
  notificationsEnabled: boolean;
  businessModeEnabled: boolean;
  defaultMode: 'personal' | 'business';
  themePreference: ThemePreference;
  language: AppLanguage;
  paymentQrs: PaymentQr[];
  businessPaymentQrs: PaymentQr[];
  customPaymentMethods: CategoryOption[];
  paymentMethodOverrides: Record<string, Partial<CategoryOption> & { hidden?: boolean }>;
  hasCompletedOnboarding: boolean;
  gettingStartedDismissed: boolean;
  dismissedHints: string[];
  biometricLockEnabled: boolean;
  biometricLockTimeoutMin: number;
  walletEchoHidden: boolean;
  setWalletEchoHidden: (value: boolean) => void;
  /** Show "archive" tab on the Debts/Splits screens. Default: false (off). */
  debtsShowArchive: boolean;
  setDebtsShowArchive: (value: boolean) => void;
  /** Show reminder/request buttons on debt cards. Default: false (off). */
  debtsShowReminder: boolean;
  setDebtsShowReminder: (value: boolean) => void;
  budgetEchoHidden: boolean;
  setBudgetEchoHidden: (value: boolean) => void;
  commitmentEchoHidden: boolean;
  setCommitmentEchoHidden: (value: boolean) => void;
  personalSyncEnabled: boolean;
  lastPersonalSyncAt: Date | null;
  setPersonalSyncEnabled: (value: boolean) => void;
  setLastPersonalSyncAt: (value: Date | null) => void;
  spendingAlertsEnabled: boolean;
  setSpendingAlertsEnabled: (value: boolean) => void;
  quickAddConfirm: boolean;
  setQuickAddConfirm: (value: boolean) => void;
  getPaymentMethods: () => CategoryOption[];
  addCustomPaymentMethod: (method: CategoryOption) => void;
  removeCustomPaymentMethod: (id: string) => void;
  updatePaymentMethodOverride: (id: string, overrides: Partial<CategoryOption> & { hidden?: boolean }) => void;
  setUserName: (name: string) => void;
  setCurrency: (currency: string) => void;
  setHapticEnabled: (enabled: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setBusinessModeEnabled: (enabled: boolean) => void;
  setDefaultMode: (mode: 'personal' | 'business') => void;
  setThemePreference: (pref: ThemePreference) => void;
  setLanguage: (lang: AppLanguage) => void;
  addPaymentQr: (uri: string, label: string, mode?: 'personal' | 'business') => void;
  removePaymentQr: (index: number, mode?: 'personal' | 'business') => void;
  replacePaymentQr: (index: number, uri: string, label?: string, mode?: 'personal' | 'business') => void;
  updatePaymentQrLabel: (index: number, label: string, mode?: 'personal' | 'business') => void;
  getPaymentQrs: (mode: 'personal' | 'business') => PaymentQr[];
  setHasCompletedOnboarding: (value: boolean) => void;
  setGettingStartedDismissed: (value: boolean) => void;
  dismissHint: (id: string) => void;
  setBiometricLockEnabled: (value: boolean) => void;
  setBiometricLockTimeoutMin: (value: number) => void;
  clearAllData: () => Promise<void>;
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
      themePreference: 'light',
      language: 'en',
      paymentQrs: [],
      businessPaymentQrs: [],
      customPaymentMethods: [],
      paymentMethodOverrides: {},
      hasCompletedOnboarding: false,
      gettingStartedDismissed: false,
      dismissedHints: [],
      biometricLockEnabled: false,
      biometricLockTimeoutMin: 5,
      walletEchoHidden: true,
      setWalletEchoHidden: (walletEchoHidden) => set({ walletEchoHidden }),
      debtsShowArchive: false,
      setDebtsShowArchive: (debtsShowArchive) => set({ debtsShowArchive }),
      debtsShowReminder: true,
      setDebtsShowReminder: (debtsShowReminder) => set({ debtsShowReminder }),
      budgetEchoHidden: true,
      setBudgetEchoHidden: (budgetEchoHidden) => set({ budgetEchoHidden }),
      commitmentEchoHidden: false,
      setCommitmentEchoHidden: (commitmentEchoHidden) => set({ commitmentEchoHidden }),
      personalSyncEnabled: false,
      lastPersonalSyncAt: null,
      spendingAlertsEnabled: true,
      quickAddConfirm: false,

      setPersonalSyncEnabled: (personalSyncEnabled) => set({ personalSyncEnabled }),
      setLastPersonalSyncAt: (lastPersonalSyncAt) => set({ lastPersonalSyncAt }),
      setSpendingAlertsEnabled: (spendingAlertsEnabled) => set({ spendingAlertsEnabled }),
      setQuickAddConfirm: (quickAddConfirm) => set({ quickAddConfirm }),

      getPaymentMethods: () => {
        const { customPaymentMethods, paymentMethodOverrides } = get();
        const defaults = DEFAULT_PAYMENT_METHODS
          .filter((m) => !paymentMethodOverrides[m.id]?.hidden)
          .map((m) => ({ ...m, ...paymentMethodOverrides[m.id] }));
        return [...defaults, ...customPaymentMethods];
      },
      addCustomPaymentMethod: (method) => set((s) => ({
        customPaymentMethods: [...s.customPaymentMethods, method],
      })),
      removeCustomPaymentMethod: (id) => set((s) => ({
        customPaymentMethods: s.customPaymentMethods.filter((m) => m.id !== id),
      })),
      updatePaymentMethodOverride: (id, overrides) => set((s) => ({
        paymentMethodOverrides: { ...s.paymentMethodOverrides, [id]: { ...s.paymentMethodOverrides[id], ...overrides } },
      })),
      setUserName: (userName) => set({ userName }),
      setCurrency: (currency) => set({ currency }),
      setHapticEnabled: (hapticEnabled) => set({ hapticEnabled }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      setBusinessModeEnabled: (businessModeEnabled) => set({ businessModeEnabled }),
      setDefaultMode: (defaultMode) => set({ defaultMode }),
      setThemePreference: (themePreference) => set({ themePreference }),
      setLanguage: (language) => set({ language }),
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
      setGettingStartedDismissed: (gettingStartedDismissed) => set({ gettingStartedDismissed }),
      setBiometricLockEnabled: (biometricLockEnabled) => set({ biometricLockEnabled }),
      setBiometricLockTimeoutMin: (biometricLockTimeoutMin) => set({ biometricLockTimeoutMin }),
      dismissHint: (id) => set((s) => ({
        dismissedHints: s.dismissedHints.includes(id) ? s.dismissedHints : [...s.dismissedHints, id],
      })),

      clearAllData: async () => {
        // 1. Reset every persisted store in-memory.
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

        useNotesStore.setState({
          pages: [],
          activePageId: null,
          isFirstWrite: true,
        });

        useLearningStore.setState({
          categoryPatterns: [],
          personAliases: [],
          walletPreferences: [],
          typeCorrections: [],
          skippedKeywords: {},
        });

        usePlaybookStore.setState({
          playbooks: [],
          echoMemory: [],
        });

        useAIInsightsStore.setState({
          spendingMirrorText: null,
          spendingMirrorGeneratedAt: null,
          spendingMirrorMonthKey: null,
          isGenerating: false,
          breathingRooms: [],
          freshStartDismissedMonth: null,
          reportNarratives: {},
          chatMessages: [],
          conversations: [],
        });

        useReceiptStore.setState({
          receipts: [],
          draft: null,
          _deletedReceiptIds: [],
        });

        useSavingsStore.setState({
          accounts: [],
          sortBy: 'manual',
          accountOrder: [],
          lastOpenedValue: null,
          _deletedSavingsIds: [],
        });

        useAppStore.setState({ mode: 'personal' });

        set({
          userName: '',
          currency: 'RM',
          hapticEnabled: true,
          notificationsEnabled: true,
          businessModeEnabled: false,
          defaultMode: 'personal',
          themePreference: 'light',
          language: 'en',
          paymentQrs: [],
          businessPaymentQrs: [],
          customPaymentMethods: [],
          paymentMethodOverrides: {},
          hasCompletedOnboarding: false,
          gettingStartedDismissed: false,
          dismissedHints: [],
        });

        // 2. Delete remote business data + auth user (best-effort).
        try {
          await clearBusinessDataRemote();
        } catch {
          // Personal-only users won't have remote data — ignore.
        }

        // 3. Sign out of Supabase so the session can't rehydrate the user.
        try {
          await signOut();
        } catch {
          // Already signed out — ignore.
        }
        useAuthStore.getState().reset();
        clearProfileCache();

        // 4. Wipe FileSystem assets (payment QRs + scanned receipts).
        const docDir = FileSystem.documentDirectory;
        if (docDir) {
          await Promise.all([
            FileSystem.deleteAsync(`${docDir}payment-qrs/`, { idempotent: true }).catch(() => {}),
            FileSystem.deleteAsync(`${docDir}receipts/`, { idempotent: true }).catch(() => {}),
          ]);
        }

        // 5. Nuke AsyncStorage so nothing rehydrates on next launch.
        //    This is the single most important step — without it, every store's
        //    persisted snapshot would resurrect on the next app start.
        try {
          await AsyncStorage.clear();
        } catch {
          // Fall back to removing every known key explicitly if .clear() fails.
          await Promise.all([
            'settings-storage',
            'personal-storage',
            'business-storage',
            'stall-storage',
            'seller-storage',
            'category-storage',
            'debt-storage',
            'crm-storage',
            'freelancer-storage',
            'parttime-storage',
            'ontheroad-storage',
            'mixed-storage',
            'wallet-storage',
            'premium-storage',
            'notes-storage',
            'learning-storage',
            'playbook-storage',
            'ai-insights-storage',
            'receipt-storage',
            'savings-storage',
            'app-storage',
            'auth-storage',
          ].map((k) => AsyncStorage.removeItem(k).catch(() => {})));
        }
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
        if (!state.customPaymentMethods) state.customPaymentMethods = [];
        if (!state.paymentMethodOverrides) state.paymentMethodOverrides = {};
        // Rehydrate sync timestamp (stored as ISO)
        const rawSync = (state as any).lastPersonalSyncAt;
        if (rawSync && typeof rawSync === 'string') {
          const d = new Date(rawSync);
          state.lastPersonalSyncAt = isNaN(d.getTime()) ? null : d;
        } else if (!rawSync) {
          state.lastPersonalSyncAt = null;
        }
        if (typeof state.personalSyncEnabled !== 'boolean') {
          state.personalSyncEnabled = false;
        }
      },
    }
  )
);
