import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { startOfMonth, differenceInDays } from 'date-fns';
import { PremiumState } from '../types';
import { FREE_TIER, TRIAL_DAYS } from '../constants/premium';

export const usePremiumStore = create<PremiumState>()(
  persist(
    (set, get) => ({
      tier: 'free',
      subscribedAt: null,
      scanCount: 0,
      scanResetDate: startOfMonth(new Date()),
      aiCallsCount: 0,
      aiCallsResetDate: startOfMonth(new Date()),
      trialStartDate: null,

      subscribe: () =>
        set({
          tier: 'premium',
          subscribedAt: new Date(),
        }),

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
        state.startTrialIfNeeded();
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

      canCreateWallet: (currentCount: number) => {
        const state = get();
        if (state.tier === 'premium') return true;
        return currentCount < FREE_TIER.maxWallets;
      },

      canCreateBudget: (currentCount: number) => {
        const state = get();
        if (state.tier === 'premium') return true;
        return currentCount < FREE_TIER.maxBudgets;
      },

      canScanReceipt: () => {
        const state = get();
        state.resetScanCountIfNeeded();
        if (state.tier === 'premium') return true;
        return get().scanCount < FREE_TIER.maxScansPerMonth;
      },

      getRemainingScans: () => {
        const state = get();
        state.resetScanCountIfNeeded();
        if (state.tier === 'premium') return Infinity;
        return Math.max(0, FREE_TIER.maxScansPerMonth - get().scanCount);
      },

      canUseAI: () => {
        const state = get();
        if (state.tier === 'premium') return true;
        if (state.isInTrial()) return true;
        state.resetAiCallsIfNeeded();
        return get().aiCallsCount < FREE_TIER.maxAiCallsPerMonth;
      },

      getRemainingAiCalls: () => {
        const state = get();
        if (state.tier === 'premium') return Infinity;
        if (state.isInTrial()) return Infinity;
        state.resetAiCallsIfNeeded();
        return Math.max(0, FREE_TIER.maxAiCallsPerMonth - get().aiCallsCount);
      },

      isInTrial: () => {
        const state = get();
        if (state.tier === 'premium') return false;
        if (!state.trialStartDate) return false;
        const daysSinceStart = differenceInDays(new Date(), state.trialStartDate);
        return daysSinceStart < TRIAL_DAYS;
      },

      startTrialIfNeeded: () => {
        const state = get();
        if (state.tier === 'premium') return;
        if (state.trialStartDate) return;
        set({ trialStartDate: new Date() });
      },
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
        trialStartDate: state.trialStartDate instanceof Date ? state.trialStartDate.toISOString() : state.trialStartDate,
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
        state.trialStartDate = sd(state.trialStartDate);
      },
    }
  )
);
