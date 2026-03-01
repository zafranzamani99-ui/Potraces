import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FreelancerClient, BusinessTransaction } from '../types';
import { useBusinessStore } from './businessStore';
import { startOfMonth, endOfMonth, subMonths, isWithinInterval, differenceInDays } from 'date-fns';

interface FreelancerState {
  clients: FreelancerClient[];

  addClient: (client: Omit<FreelancerClient, 'id' | 'createdAt'>) => FreelancerClient;
  updateClient: (id: string, updates: Partial<FreelancerClient>) => void;
  deleteClient: (id: string) => void;

  getClientPayments: (clientId: string) => BusinessTransaction[];
  getClientAverageGap: (clientId: string) => number | null;
  getClientLastPayment: (clientId: string) => BusinessTransaction | null;
  getSixMonthAverage: () => number;
  getActiveClients: () => FreelancerClient[];
  getQuietClients: () => FreelancerClient[];
}

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

export const useFreelancerStore = create<FreelancerState>()(
  persist(
    (set, get) => ({
      clients: [],

      addClient: (client) => {
        const newClient: FreelancerClient = {
          ...client,
          id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({ clients: [newClient, ...state.clients] }));
        return newClient;
      },

      updateClient: (id, updates) =>
        set((state) => ({
          clients: state.clients.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        })),

      deleteClient: (id) => {
        // Remove clientId from all linked business transactions
        const bizState = useBusinessStore.getState();
        useBusinessStore.setState({
          businessTransactions: bizState.businessTransactions.map((t) =>
            t.clientId === id ? { ...t, clientId: undefined } : t
          ),
        });
        // Remove client
        set((state) => ({
          clients: state.clients.filter((c) => c.id !== id),
        }));
      },

      getClientPayments: (clientId) => {
        const txns = useBusinessStore.getState().businessTransactions;
        return txns
          .filter((t) => t.clientId === clientId && t.type === 'income')
          .sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime());
      },

      getClientAverageGap: (clientId) => {
        const payments = get().getClientPayments(clientId);
        if (payments.length < 2) return null;

        let totalGap = 0;
        for (let i = 0; i < payments.length - 1; i++) {
          totalGap += differenceInDays(
            toDate(payments[i].date),
            toDate(payments[i + 1].date)
          );
        }
        return Math.round(totalGap / (payments.length - 1));
      },

      getClientLastPayment: (clientId) => {
        const payments = get().getClientPayments(clientId);
        return payments.length > 0 ? payments[0] : null;
      },

      getSixMonthAverage: () => {
        const txns = useBusinessStore.getState().businessTransactions;
        const now = new Date();
        let total = 0;
        let monthsWithData = 0;

        for (let i = 0; i < 6; i++) {
          const ms = startOfMonth(subMonths(now, i));
          const me = endOfMonth(subMonths(now, i));
          const monthIncome = txns
            .filter(
              (t) =>
                t.type === 'income' &&
                isWithinInterval(toDate(t.date), { start: ms, end: me })
            )
            .reduce((sum, t) => sum + t.amount, 0);
          if (monthIncome > 0) monthsWithData++;
          total += monthIncome;
        }

        return monthsWithData > 0 ? total / monthsWithData : 0;
      },

      getActiveClients: () => {
        const state = get();
        const now = new Date();
        const cutoff = subMonths(now, 3); // 90 days approx

        return state.clients.filter((client) => {
          const lastPayment = state.getClientLastPayment(client.id);
          if (!lastPayment) return false;
          return toDate(lastPayment.date).getTime() >= cutoff.getTime();
        });
      },

      getQuietClients: () => {
        const state = get();
        const now = new Date();
        const cutoff = subMonths(now, 3);

        return state.clients.filter((client) => {
          const lastPayment = state.getClientLastPayment(client.id);
          if (!lastPayment) return true; // never paid = quiet
          return toDate(lastPayment.date).getTime() < cutoff.getTime();
        });
      },
    }),
    {
      name: 'freelancer-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        clients: state.clients,
      }),
    }
  )
);
