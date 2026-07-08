import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { newId } from '../utils/id';

export interface CalcHistoryEntry {
  id: string;
  expression: string;
  result: number;
  at: string; // ISO timestamp
}

interface CalculatorState {
  history: CalcHistoryEntry[];
  addEntry: (expression: string, result: number) => void;
  clearHistory: () => void;
  removeEntry: (id: string) => void;
}

const MAX_HISTORY = 50;

export const useCalculatorStore = create<CalculatorState>()(
  persist(
    (set) => ({
      history: [],
      addEntry: (expression, result) =>
        set((state) => ({
          history: [
            { id: newId(), expression, result, at: new Date().toISOString() },
            ...state.history,
          ].slice(0, MAX_HISTORY),
        })),
      clearHistory: () => set({ history: [] }),
      removeEntry: (id) =>
        set((state) => ({ history: state.history.filter((h) => h.id !== id) })),
    }),
    {
      name: 'calculator-history',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
