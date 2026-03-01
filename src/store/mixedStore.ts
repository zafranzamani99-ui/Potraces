import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MixedModeDetails, BusinessTransaction } from '../types';
import { useBusinessStore } from './businessStore';
import { startOfMonth, endOfMonth, subMonths, isWithinInterval, format } from 'date-fns';

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

function getMixedTxns(start: Date, end: Date): BusinessTransaction[] {
  return useBusinessStore.getState().businessTransactions.filter((t) =>
    isWithinInterval(toDate(t.date), { start, end })
  );
}

interface MixedState {
  mixedDetails: MixedModeDetails;
  lastUsedStream: string | null;

  setMixedDetails: (details: MixedModeDetails) => void;
  updateMixedDetails: (updates: Partial<MixedModeDetails>) => void;
  addStream: (label: string) => void;
  removeStream: (label: string) => void;
  renameStream: (oldLabel: string, newLabel: string) => void;
  setLastUsedStream: (label: string) => void;

  getCurrentMonthTotal: () => number;
  getCurrentMonthCosts: () => number;
  getCurrentMonthNet: () => number;
  getIncomeByStream: () => Record<string, number>;
  getMonthlyBreakdown: (months: number) => Array<{
    month: string;
    total: number;
    byStream: Record<string, number>;
    costs: number;
  }>;
  getStreamConsistency: () => Array<{ stream: string; monthsActive: number; total: number }>;
  getMostConsistentStream: () => string | null;
  getSixMonthAverageTotal: () => number;
}

export const useMixedStore = create<MixedState>()(
  persist(
    (set, get) => ({
      mixedDetails: {
        streams: [],
        hasRoadCosts: false,
        setupComplete: false,
      },
      lastUsedStream: null,

      setMixedDetails: (details) => set({ mixedDetails: details }),

      updateMixedDetails: (updates) =>
        set((state) => ({
          mixedDetails: { ...state.mixedDetails, ...updates },
        })),

      addStream: (label) =>
        set((state) => {
          const trimmed = label.trim();
          if (!trimmed) return state;
          if (state.mixedDetails.streams.length >= 8) return state;
          const exists = state.mixedDetails.streams.some(
            (s) => s.toLowerCase() === trimmed.toLowerCase()
          );
          if (exists) return state;
          return {
            mixedDetails: {
              ...state.mixedDetails,
              streams: [...state.mixedDetails.streams, trimmed],
            },
          };
        }),

      removeStream: (label) =>
        set((state) => ({
          mixedDetails: {
            ...state.mixedDetails,
            streams: state.mixedDetails.streams.filter((s) => s !== label),
          },
          lastUsedStream: state.lastUsedStream === label ? null : state.lastUsedStream,
        })),

      renameStream: (oldLabel, newLabel) => {
        const trimmed = newLabel.trim();
        if (!trimmed) return;
        set((state) => ({
          mixedDetails: {
            ...state.mixedDetails,
            streams: state.mixedDetails.streams.map((s) =>
              s === oldLabel ? trimmed : s
            ),
          },
          lastUsedStream: state.lastUsedStream === oldLabel ? trimmed : state.lastUsedStream,
        }));
        // Update all linked business transactions
        const store = useBusinessStore.getState();
        const updated = store.businessTransactions.map((t) =>
          t.streamLabel === oldLabel ? { ...t, streamLabel: trimmed } : t
        );
        useBusinessStore.setState({ businessTransactions: updated });
      },

      setLastUsedStream: (label) => set({ lastUsedStream: label }),

      getCurrentMonthTotal: () => {
        const now = new Date();
        const txns = getMixedTxns(startOfMonth(now), endOfMonth(now));
        return txns
          .filter((t) => t.type === 'income' || t.roadTransactionType === 'earning')
          .filter((t) => t.roadTransactionType !== 'cost')
          .reduce((sum, t) => sum + t.amount, 0);
      },

      getCurrentMonthCosts: () => {
        if (!get().mixedDetails.hasRoadCosts) return 0;
        const now = new Date();
        const txns = getMixedTxns(startOfMonth(now), endOfMonth(now));
        return txns
          .filter((t) => t.roadTransactionType === 'cost')
          .reduce((sum, t) => sum + t.amount, 0);
      },

      getCurrentMonthNet: () => {
        const state = get();
        return state.getCurrentMonthTotal() - state.getCurrentMonthCosts();
      },

      getIncomeByStream: () => {
        const now = new Date();
        const txns = getMixedTxns(startOfMonth(now), endOfMonth(now));
        const groups: Record<string, number> = {};
        for (const t of txns) {
          if (t.roadTransactionType === 'cost') continue;
          if (t.type !== 'income' && t.roadTransactionType !== 'earning') continue;
          const key = t.streamLabel || 'untagged';
          groups[key] = (groups[key] || 0) + t.amount;
        }
        return groups;
      },

      getMonthlyBreakdown: (months) => {
        const now = new Date();
        const hasRoadCosts = get().mixedDetails.hasRoadCosts;
        const result: Array<{ month: string; total: number; byStream: Record<string, number>; costs: number }> = [];

        for (let i = months - 1; i >= 0; i--) {
          const d = subMonths(now, i);
          const ms = startOfMonth(d);
          const me = endOfMonth(d);
          const txns = getMixedTxns(ms, me);

          const byStream: Record<string, number> = {};
          let total = 0;
          let costs = 0;

          for (const t of txns) {
            if (t.roadTransactionType === 'cost') {
              if (hasRoadCosts) costs += t.amount;
              continue;
            }
            if (t.type === 'income' || t.roadTransactionType === 'earning') {
              const key = t.streamLabel || 'untagged';
              byStream[key] = (byStream[key] || 0) + t.amount;
              total += t.amount;
            }
          }

          result.push({ month: format(d, 'MMM'), total, byStream, costs });
        }

        return result;
      },

      getStreamConsistency: () => {
        const breakdown = get().getMonthlyBreakdown(6);
        const streamMap: Record<string, { monthsActive: number; total: number }> = {};

        for (const m of breakdown) {
          for (const [stream, amount] of Object.entries(m.byStream)) {
            if (!streamMap[stream]) {
              streamMap[stream] = { monthsActive: 0, total: 0 };
            }
            if (amount > 0) {
              streamMap[stream].monthsActive++;
            }
            streamMap[stream].total += amount;
          }
        }

        return Object.entries(streamMap)
          .map(([stream, data]) => ({ stream, ...data }))
          .sort((a, b) => b.monthsActive - a.monthsActive || b.total - a.total);
      },

      getMostConsistentStream: () => {
        const consistency = get().getStreamConsistency();
        if (consistency.length === 0) return null;
        return consistency[0].stream;
      },

      getSixMonthAverageTotal: () => {
        const breakdown = get().getMonthlyBreakdown(6);
        const monthsWithData = breakdown.filter((m) => m.total > 0);
        if (monthsWithData.length === 0) return 0;
        return monthsWithData.reduce((sum, m) => sum + m.total, 0) / monthsWithData.length;
      },
    }),
    {
      name: 'mixed-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        mixedDetails: state.mixedDetails,
        lastUsedStream: state.lastUsedStream,
      }),
    }
  )
);
