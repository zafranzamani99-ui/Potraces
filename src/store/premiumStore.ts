import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { startOfMonth } from 'date-fns';
import { PremiumState, PremiumTier } from '../types';
import { canCreate, remainingOf, TIER_LIMITS } from '../constants/premium';

// Gates read the ACTIVE tier's row in TIER_LIMITS (src/constants/tiers.ts). No more
// free-vs-premium branching — a single table drives all four tiers, and the paywall's
// selected tier flows in via setTier(). Grandfathering is automatic: canCreate() blocks
// the next create when a legacy user is already over a (now-lowered) cap, never deleting.
export const usePremiumStore = create<PremiumState>()(
  persist(
    (set, get) => ({
      tier: 'free',
      subscribedAt: null,
      scanCount: 0,
      scanResetDate: startOfMonth(new Date()),
      aiCallsCount: 0,
      aiCallsResetDate: startOfMonth(new Date()),

      // Local unlock (billing not wired). subscribe() = top tier for back-compat; the
      // paywall calls setTier(selectedTier) — that's the seam RevenueCat plugs into.
      subscribe: () => set({ tier: 'premium', subscribedAt: new Date() }),

      setTier: (tier: PremiumTier) =>
        set({ tier, subscribedAt: tier === 'free' ? null : new Date() }),

      unsubscribe: () =>
        set({
          tier: 'free',
          subscribedAt: null,
        }),

      incrementScanCount: () =>
        set((state) => ({
          scanCount: state.scanCount + 1,
        })),

      resetScanCountIfNeeded: () => {
        const state = get();
        const currentMonthStart = startOfMonth(new Date());
        const resetDate = state.scanResetDate instanceof Date
          ? state.scanResetDate
          : new Date(state.scanResetDate);
        if (isNaN(resetDate.getTime()) || resetDate < currentMonthStart) {
          set({
            scanCount: 0,
            scanResetDate: currentMonthStart,
          });
        }
      },

      incrementAiCalls: () => {
        const state = get();
        state.resetAiCallsIfNeeded();
        set((s) => ({ aiCallsCount: s.aiCallsCount + 1 }));
      },

      resetAiCallsIfNeeded: () => {
        const state = get();
        const currentMonthStart = startOfMonth(new Date());
        const resetDate = state.aiCallsResetDate instanceof Date
          ? state.aiCallsResetDate
          : new Date(state.aiCallsResetDate);
        if (isNaN(resetDate.getTime()) || resetDate < currentMonthStart) {
          set({
            aiCallsCount: 0,
            aiCallsResetDate: currentMonthStart,
          });
        }
      },

      // ── Count gates ──
      canCreateWallet: (currentCount: number) => canCreate(get().tier, 'maxWallets', currentCount),
      canCreateBudget: (currentCount: number) => canCreate(get().tier, 'maxBudgets', currentCount),
      canCreateSavingsAccount: (currentCount: number) => canCreate(get().tier, 'maxSavingsAccounts', currentCount),
      canCreateGoal: (currentCount: number) => canCreate(get().tier, 'maxGoals', currentCount),
      canCreateSharedSub: (currentCount: number) => canCreate(get().tier, 'maxSharedSubs', currentCount),

      // ── Metered gates (reset the monthly window first) ──
      canScanReceipt: () => {
        get().resetScanCountIfNeeded();
        return canCreate(get().tier, 'maxScansPerMonth', get().scanCount);
      },

      getRemainingScans: () => {
        get().resetScanCountIfNeeded();
        return remainingOf(get().tier, 'maxScansPerMonth', get().scanCount);
      },

      canUseAI: () => {
        get().resetAiCallsIfNeeded();
        return canCreate(get().tier, 'maxAiCallsPerMonth', get().aiCallsCount);
      },

      getRemainingAiCalls: () => {
        get().resetAiCallsIfNeeded();
        return remainingOf(get().tier, 'maxAiCallsPerMonth', get().aiCallsCount);
      },

      // ── Capability gates ──
      hasCloudBackup: () => TIER_LIMITS[get().tier].cloudBackup,
      hasAskEcho: () => TIER_LIMITS[get().tier].askEchoPerScreen,
      hasPhotoIcon: () => TIER_LIMITS[get().tier].photoCategoryIcons,
    }),
    {
      name: 'premium-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        tier: state.tier,
        subscribedAt: state.subscribedAt instanceof Date ? state.subscribedAt.toISOString() : state.subscribedAt,
        scanCount: state.scanCount,
        scanResetDate: state.scanResetDate instanceof Date ? state.scanResetDate.toISOString() : state.scanResetDate,
        aiCallsCount: state.aiCallsCount,
        aiCallsResetDate: state.aiCallsResetDate instanceof Date ? state.aiCallsResetDate.toISOString() : state.aiCallsResetDate,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const sd = (v: any) => {
          if (!v) return null;
          const d = v instanceof Date ? v : new Date(v);
          return isNaN(d.getTime()) ? null : d;
        };
        state.subscribedAt = sd(state.subscribedAt);
        state.scanResetDate = sd(state.scanResetDate) ?? startOfMonth(new Date());
        state.aiCallsResetDate = sd(state.aiCallsResetDate) ?? startOfMonth(new Date());
        // Legacy persisted tiers ('free' | 'premium') remain valid values in the new
        // 4-tier union, so no migration is needed — an existing premium user stays premium.
      },
    }
  )
);
