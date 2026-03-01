import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PartTimeJobDetails, BusinessTransaction } from '../types';
import { useBusinessStore } from './businessStore';
import { startOfMonth, endOfMonth, subMonths, isWithinInterval, format } from 'date-fns';

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

interface PartTimeState {
  jobDetails: PartTimeJobDetails;

  setJobDetails: (details: PartTimeJobDetails) => void;
  updateJobDetails: (updates: Partial<PartTimeJobDetails>) => void;

  getCurrentMonthMainIncome: () => number;
  getCurrentMonthSideIncome: () => number;
  getCurrentMonthTotal: () => number;
  getSideIncomePercentage: () => number;
  getMonthlyBreakdown: (months: number) => Array<{ month: string; main: number; side: number }>;
  getAverageSidePercentage: () => number;
  isPayDayPassed: () => boolean;
  isMainJobLoggedThisMonth: () => boolean;
}

function getMonthIncome(stream: 'main' | 'side', start: Date, end: Date): number {
  const txns = useBusinessStore.getState().businessTransactions;
  return txns
    .filter(
      (t) =>
        t.type === 'income' &&
        t.incomeStream === stream &&
        isWithinInterval(toDate(t.date), { start, end })
    )
    .reduce((sum, t) => sum + t.amount, 0);
}

export const usePartTimeStore = create<PartTimeState>()(
  persist(
    (set, get) => ({
      jobDetails: {
        jobName: '',
        setupComplete: false,
      },

      setJobDetails: (details) => set({ jobDetails: details }),

      updateJobDetails: (updates) =>
        set((state) => ({
          jobDetails: { ...state.jobDetails, ...updates },
        })),

      getCurrentMonthMainIncome: () => {
        const now = new Date();
        return getMonthIncome('main', startOfMonth(now), endOfMonth(now));
      },

      getCurrentMonthSideIncome: () => {
        const now = new Date();
        return getMonthIncome('side', startOfMonth(now), endOfMonth(now));
      },

      getCurrentMonthTotal: () => {
        const state = get();
        return state.getCurrentMonthMainIncome() + state.getCurrentMonthSideIncome();
      },

      getSideIncomePercentage: () => {
        const state = get();
        const total = state.getCurrentMonthTotal();
        if (total === 0) return 0;
        return (state.getCurrentMonthSideIncome() / total) * 100;
      },

      getMonthlyBreakdown: (months) => {
        const now = new Date();
        const result: Array<{ month: string; main: number; side: number }> = [];

        for (let i = months - 1; i >= 0; i--) {
          const d = subMonths(now, i);
          const ms = startOfMonth(d);
          const me = endOfMonth(d);
          result.push({
            month: format(d, 'MMM'),
            main: getMonthIncome('main', ms, me),
            side: getMonthIncome('side', ms, me),
          });
        }

        return result;
      },

      getAverageSidePercentage: () => {
        const breakdown = get().getMonthlyBreakdown(6);
        const monthsWithData = breakdown.filter((m) => m.main + m.side > 0);
        if (monthsWithData.length === 0) return 0;

        const percentages = monthsWithData.map((m) => {
          const total = m.main + m.side;
          return total > 0 ? (m.side / total) * 100 : 0;
        });

        return percentages.reduce((a, b) => a + b, 0) / percentages.length;
      },

      isPayDayPassed: () => {
        const { jobDetails } = get();
        if (!jobDetails.payDay) return false;
        const now = new Date();
        const dayOfMonth = now.getDate();
        // Handle months shorter than payDay (e.g. payDay 31 in February)
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const effectivePayDay = Math.min(jobDetails.payDay, daysInMonth);
        return dayOfMonth > effectivePayDay;
      },

      isMainJobLoggedThisMonth: () => {
        return get().getCurrentMonthMainIncome() > 0;
      },
    }),
    {
      name: 'parttime-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        jobDetails: state.jobDetails,
      }),
    }
  )
);
