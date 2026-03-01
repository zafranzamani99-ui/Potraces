import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OnTheRoadDetails, CostCategory, BusinessTransaction } from '../types';
import { useBusinessStore } from './businessStore';
import { startOfMonth, endOfMonth, subMonths, isWithinInterval, format } from 'date-fns';

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

function getRoadTxns(start: Date, end: Date): BusinessTransaction[] {
  return useBusinessStore.getState().businessTransactions.filter(
    (t) =>
      t.roadTransactionType &&
      isWithinInterval(toDate(t.date), { start, end })
  );
}

interface OnTheRoadState {
  roadDetails: OnTheRoadDetails;

  setRoadDetails: (details: OnTheRoadDetails) => void;
  updateRoadDetails: (updates: Partial<OnTheRoadDetails>) => void;

  getCurrentMonthEarnings: () => number;
  getCurrentMonthCosts: () => number;
  getCurrentMonthNet: () => number;
  getCostPercentage: () => number;
  getCostsByCategory: () => Record<string, number>;
  getMonthlyBreakdown: (months: number) => Array<{
    month: string;
    earned: number;
    costs: number;
    net: number;
  }>;
  getSixMonthAverageNet: () => number;
  getSixMonthAverageCostPercentage: () => number;
  getEarningsByPlatform: () => Record<string, number>;
  getHighestCostCategory: () => { category: string; amount: number } | null;
}

export const useOnTheRoadStore = create<OnTheRoadState>()(
  persist(
    (set, get) => ({
      roadDetails: {
        description: '',
        vehicleType: 'motorcycle',
        setupComplete: false,
      },

      setRoadDetails: (details) => set({ roadDetails: details }),

      updateRoadDetails: (updates) =>
        set((state) => ({
          roadDetails: { ...state.roadDetails, ...updates },
        })),

      getCurrentMonthEarnings: () => {
        const now = new Date();
        const txns = getRoadTxns(startOfMonth(now), endOfMonth(now));
        return txns
          .filter((t) => t.roadTransactionType === 'earning')
          .reduce((sum, t) => sum + t.amount, 0);
      },

      getCurrentMonthCosts: () => {
        const now = new Date();
        const txns = getRoadTxns(startOfMonth(now), endOfMonth(now));
        return txns
          .filter((t) => t.roadTransactionType === 'cost')
          .reduce((sum, t) => sum + t.amount, 0);
      },

      getCurrentMonthNet: () => {
        const state = get();
        return state.getCurrentMonthEarnings() - state.getCurrentMonthCosts();
      },

      getCostPercentage: () => {
        const state = get();
        const earnings = state.getCurrentMonthEarnings();
        if (earnings === 0) return 0;
        return (state.getCurrentMonthCosts() / earnings) * 100;
      },

      getCostsByCategory: () => {
        const now = new Date();
        const txns = getRoadTxns(startOfMonth(now), endOfMonth(now));
        const groups: Record<string, number> = {};
        for (const t of txns) {
          if (t.roadTransactionType !== 'cost') continue;
          const key = t.costCategory === 'other' && t.costCategoryOther
            ? t.costCategoryOther
            : t.costCategory || 'other';
          groups[key] = (groups[key] || 0) + t.amount;
        }
        return groups;
      },

      getMonthlyBreakdown: (months) => {
        const now = new Date();
        const result: Array<{ month: string; earned: number; costs: number; net: number }> = [];

        for (let i = months - 1; i >= 0; i--) {
          const d = subMonths(now, i);
          const ms = startOfMonth(d);
          const me = endOfMonth(d);
          const txns = getRoadTxns(ms, me);
          const earned = txns
            .filter((t) => t.roadTransactionType === 'earning')
            .reduce((sum, t) => sum + t.amount, 0);
          const costs = txns
            .filter((t) => t.roadTransactionType === 'cost')
            .reduce((sum, t) => sum + t.amount, 0);
          result.push({
            month: format(d, 'MMM'),
            earned,
            costs,
            net: earned - costs,
          });
        }

        return result;
      },

      getSixMonthAverageNet: () => {
        const breakdown = get().getMonthlyBreakdown(6);
        const monthsWithData = breakdown.filter((m) => m.earned + m.costs > 0);
        if (monthsWithData.length === 0) return 0;
        return monthsWithData.reduce((sum, m) => sum + m.net, 0) / monthsWithData.length;
      },

      getSixMonthAverageCostPercentage: () => {
        const breakdown = get().getMonthlyBreakdown(6);
        const monthsWithData = breakdown.filter((m) => m.earned > 0);
        if (monthsWithData.length === 0) return 0;
        const percentages = monthsWithData.map((m) => (m.costs / m.earned) * 100);
        return percentages.reduce((a, b) => a + b, 0) / percentages.length;
      },

      getEarningsByPlatform: () => {
        const now = new Date();
        const txns = getRoadTxns(startOfMonth(now), endOfMonth(now));
        const groups: Record<string, number> = {};
        for (const t of txns) {
          if (t.roadTransactionType !== 'earning' || !t.platform) continue;
          groups[t.platform] = (groups[t.platform] || 0) + t.amount;
        }
        return groups;
      },

      getHighestCostCategory: () => {
        const costs = get().getCostsByCategory();
        const entries = Object.entries(costs);
        if (entries.length === 0) return null;
        entries.sort((a, b) => b[1] - a[1]);
        return { category: entries[0][0], amount: entries[0][1] };
      },
    }),
    {
      name: 'ontheroad-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        roadDetails: state.roadDetails,
      }),
    }
  )
);
