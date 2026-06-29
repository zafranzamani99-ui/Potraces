import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { usePersonalStore } from './personalStore';
import { useBusinessStore } from './businessStore';
import { useDebtStore } from './debtStore';
import { useCRMStore } from './crmStore';
import { useAppStore } from './appStore';
import { useWalletStore } from './walletStore';
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
import { clearBusinessDataRemote, clearPersonalDataRemote, signOut } from '../services/supabase';
import { purgeBackups, PERSONAL_BACKUP_KEYS } from '../services/storageBackup';
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
  /**
   * Decoded EMVCo payload of a DuitNow *static* QR (captured via scan / paste).
   * When present, the app can re-render this QR with an exact amount embedded
   * (tag 54). Absent on plain photo-uploaded QRs — those behave exactly as before.
   */
  payload?: string;
  /** QR network, set on capture. 'duitnow' when validated, else 'unknown'. */
  network?: 'duitnow' | 'unknown';
  /** Merchant name decoded from the payload (tag 59), for display/confirmation. */
  merchantName?: string;
}

/** Optional decoded fields attached to a captured (scanned/pasted) QR. */
type PaymentQrMeta = Partial<Pick<PaymentQr, 'payload' | 'network' | 'merchantName'>>;

export type ThemePreference = 'light' | 'dark' | 'system';
export type AppLanguage = 'en' | 'ms';

interface SettingsState {
  userName: string;
  currency: string;
  hapticEnabled: boolean;
  notificationsEnabled: boolean;
  echoDailyCheckin: boolean;
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
  lastSyncedUserId: string | null;
  setPersonalSyncEnabled: (value: boolean) => void;
  setLastPersonalSyncAt: (value: Date | null) => void;
  setLastSyncedUserId: (value: string | null) => void;
  spendingAlertsEnabled: boolean;
  setSpendingAlertsEnabled: (value: boolean) => void;
  quickAddConfirm: boolean;
  setQuickAddConfirm: (value: boolean) => void;
  /** Per-device opt-in for accepting card payments via Tap to Pay (iOS pilot). */
  tapToPayEnabled: boolean;
  setTapToPayEnabled: (value: boolean) => void;
  /** One-time: the user has seen/dismissed the "download Malay voice" nudge in Echo. */
  malayVoicePromptSeen: boolean;
  setMalayVoicePromptSeen: (value: boolean) => void;
  /** Bumped after the Malay voice model is installed → the voice hook re-probes installed locales. */
  voiceModelEpoch: number;
  bumpVoiceModelEpoch: () => void;
  /** One-time: the user has seen the "Malay voice uses the cloud to transcribe" disclosure. */
  voiceCloudNoticeSeen: boolean;
  setVoiceCloudNoticeSeen: (value: boolean) => void;
  /** Opt-in: transcribe Malay voice via the cloud (works on any phone; no on-device model download). */
  malayCloudVoice: boolean;
  setMalayCloudVoice: (value: boolean) => void;
  /** Stage 2 (real-time words-as-you-speak via streaming STT). Requires the @soniox native module + a
   *  rebuild; inert until that's wired. Default off; gated behind an on-device accuracy A/B. */
  malayLiveStreaming: boolean;
  setMalayLiveStreaming: (value: boolean) => void;
  getPaymentMethods: () => CategoryOption[];
  addCustomPaymentMethod: (method: CategoryOption) => void;
  removeCustomPaymentMethod: (id: string) => void;
  updatePaymentMethodOverride: (id: string, overrides: Partial<CategoryOption> & { hidden?: boolean }) => void;
  setUserName: (name: string) => void;
  setCurrency: (currency: string) => void;
  setHapticEnabled: (enabled: boolean) => void;
  setEchoDailyCheckin: (enabled: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setBusinessModeEnabled: (enabled: boolean) => void;
  setDefaultMode: (mode: 'personal' | 'business') => void;
  setThemePreference: (pref: ThemePreference) => void;
  setLanguage: (lang: AppLanguage) => void;
  addPaymentQr: (uri: string, label: string, mode?: 'personal' | 'business', meta?: PaymentQrMeta) => void;
  removePaymentQr: (index: number, mode?: 'personal' | 'business') => void;
  replacePaymentQr: (index: number, uri: string, label?: string, mode?: 'personal' | 'business', meta?: PaymentQrMeta) => void;
  updatePaymentQrLabel: (index: number, label: string, mode?: 'personal' | 'business') => void;
  getPaymentQrs: (mode: 'personal' | 'business') => PaymentQr[];
  setHasCompletedOnboarding: (value: boolean) => void;
  setGettingStartedDismissed: (value: boolean) => void;
  dismissHint: (id: string) => void;
  setBiometricLockEnabled: (value: boolean) => void;
  setBiometricLockTimeoutMin: (value: number) => void;
  /** Wipe ALL personal data (local + cloud). Never touches business data. */
  clearPersonalData: () => Promise<void>;
  clearBusinessData: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      userName: '',
      currency: 'RM',
      hapticEnabled: true,
      notificationsEnabled: true,
      echoDailyCheckin: false,
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
      lastSyncedUserId: null,
      spendingAlertsEnabled: true,
      quickAddConfirm: false,
      tapToPayEnabled: false,
      malayVoicePromptSeen: false,
      voiceModelEpoch: 0,
      voiceCloudNoticeSeen: false,
      malayCloudVoice: false,
      malayLiveStreaming: false,

      setPersonalSyncEnabled: (personalSyncEnabled) => set({ personalSyncEnabled }),
      setLastPersonalSyncAt: (lastPersonalSyncAt) => set({ lastPersonalSyncAt }),
      setLastSyncedUserId: (lastSyncedUserId) => set({ lastSyncedUserId }),
      setSpendingAlertsEnabled: (spendingAlertsEnabled) => set({ spendingAlertsEnabled }),
      setQuickAddConfirm: (quickAddConfirm) => set({ quickAddConfirm }),
      setTapToPayEnabled: (tapToPayEnabled) => set({ tapToPayEnabled }),
      setMalayVoicePromptSeen: (malayVoicePromptSeen) => set({ malayVoicePromptSeen }),
      bumpVoiceModelEpoch: () => set((s) => ({ voiceModelEpoch: s.voiceModelEpoch + 1 })),
      setVoiceCloudNoticeSeen: (voiceCloudNoticeSeen) => set({ voiceCloudNoticeSeen }),
      setMalayCloudVoice: (malayCloudVoice) => set({ malayCloudVoice }),
      setMalayLiveStreaming: (malayLiveStreaming) => set({ malayLiveStreaming }),

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
      setEchoDailyCheckin: (echoDailyCheckin) => set({ echoDailyCheckin }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      setBusinessModeEnabled: (businessModeEnabled) => set({ businessModeEnabled }),
      setDefaultMode: (defaultMode) => set({ defaultMode }),
      setThemePreference: (themePreference) => set({ themePreference }),
      setLanguage: (language) => set({ language }),
      addPaymentQr: (uri, label, mode, meta) => set((s) => {
        const key = mode === 'business' ? 'businessPaymentQrs' : 'paymentQrs';
        const arr = s[key] || [];
        return { [key]: arr.length < 2 ? [...arr, { uri, label, ...(meta || {}) }] : arr };
      }),
      removePaymentQr: (index, mode) => set((s) => {
        const key = mode === 'business' ? 'businessPaymentQrs' : 'paymentQrs';
        return { [key]: (s[key] || []).filter((_, i) => i !== index) };
      }),
      // Replacing with a plain photo (no meta) intentionally drops any stale
      // payload/network/merchantName — it's a different QR now.
      replacePaymentQr: (index, uri, label, mode, meta) => set((s) => {
        const key = mode === 'business' ? 'businessPaymentQrs' : 'paymentQrs';
        return { [key]: (s[key] || []).map((q, i) => i === index ? { uri, label: label ?? q.label, ...(meta || {}) } : q) };
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

      clearPersonalData: async () => {
        // Wipes ALL personal data (local + cloud) and NOTHING business. Business
        // stores, the Supabase session, and the auth user are left intact — a
        // business user who deletes their personal data keeps their shop and stays
        // signed in. Premium (a paid, account-level entitlement) is preserved.

        // 1. Reset every PERSONAL store in-memory.
        usePersonalStore.setState({
          transactions: [],
          subscriptions: [],
          budgets: [],
          goals: [],
        });
        useDebtStore.setState({
          debts: [],
          splits: [],
          contacts: [],
        });
        useWalletStore.setState({
          wallets: [],
          transfers: [],
          selectedWalletId: null,
        });
        useSavingsStore.setState({
          accounts: [],
          sortBy: 'manual',
          accountOrder: [],
          lastOpenedValue: null,
          _deletedSavingsIds: [],
        });
        useCategoryStore.setState({
          customExpenseCategories: [],
          customIncomeCategories: [],
          expenseCategoryOverrides: {},
          incomeCategoryOverrides: {},
          expenseCategoryOrder: [],
          incomeCategoryOrder: [],
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

        // Purge local rolling backups of personal stores too — otherwise deleted
        // data survives in bak:* snapshots and the deletion right is incomplete.
        await purgeBackups(PERSONAL_BACKUP_KEYS);

        // Personal-only settings + a fresh-start reset so the app returns to the
        // first-run Onboarding screen — RootNavigator renders Onboarding
        // reactively while hasCompletedOnboarding is false, exactly like a fresh
        // install. Business QRs, theme, language, currency, and the
        // business-mode flag are all preserved.
        set({
          paymentQrs: [],
          personalSyncEnabled: false,
          lastPersonalSyncAt: null,
          lastSyncedUserId: null,
          userName: '',
          hasCompletedOnboarding: false,
          gettingStartedDismissed: false,
          dismissedHints: [],
        });
        // Open in personal mode (the install default). Business data is untouched
        // and reappears the moment the user switches back to business mode.
        useAppStore.setState({ mode: 'personal' });

        // 2. Delete this user's PERSONAL cloud rows (best-effort). Keeps the auth
        //    user + any business data. No session (personal-only, never signed
        //    in) is a no-op.
        try {
          await clearPersonalDataRemote();
        } catch {
          // Offline / no session — local is wiped; remote prunes on the next wipe.
        }

        // 3. Delete personal FileSystem assets (scanned receipts). Payment-QR
        //    image files share a directory with business QRs, so we only drop the
        //    personal QR references (above) and leave that shared dir untouched.
        const docDir = FileSystem.documentDirectory;
        if (docDir) {
          await FileSystem.deleteAsync(`${docDir}receipts/`, { idempotent: true }).catch(() => {});
        }

        // 4. Remove ONLY the personal persisted keys so nothing rehydrates.
        //    Business keys (business/seller/stall/crm/...), auth-storage, and
        //    premium-storage are deliberately kept. settings-storage is kept too
        //    (it holds business QRs + theme/language) — its personal fields were
        //    already cleared via set() above.
        await Promise.all([
          'personal-storage',
          'wallet-storage',
          'savings-storage',
          'category-storage',
          'debt-storage',
          'notes-storage',
          'learning-storage',
          'playbook-storage',
          'ai-insights-storage',
          'receipt-storage',
        ].map((k) => AsyncStorage.removeItem(k).catch(() => {})));
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
        if (typeof state.tapToPayEnabled !== 'boolean') {
          state.tapToPayEnabled = false;
        }
      },
    }
  )
);
