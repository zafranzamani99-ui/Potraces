import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { startOfMonth } from 'date-fns';
import { PremiumState } from '../types';
import { FREE_TIER } from '../constants/premium';

export const usePremiumStore = create<PremiumState>()(
  persist(
    (set, get) => ({
      tier: 'free',
      subscribedAt: null,
      scanCount: 0,
      scanResetDate: startOfMonth(new Date()),

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
        if (state.scanResetDate < currentMonthStart) {
          set({
            scanCount: 0,
            scanResetDate: currentMonthStart,
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
    }),
    {
      name: 'premium-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        tier: state.tier,
        subscribedAt: state.subscribedAt instanceof Date ? state.subscribedAt.toISOString() : state.subscribedAt,
        scanCount: state.scanCount,
        scanResetDate: state.scanResetDate instanceof Date ? state.scanResetDate.toISOString() : state.scanResetDate,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.subscribedAt = state.subscribedAt ? new Date(state.subscribedAt as any) : null;
          state.scanResetDate = new Date(state.scanResetDate as any);
        }
      },
    }
  )
);
