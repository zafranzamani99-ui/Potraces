/**
 * budgetProfileStore — the small, persisted "what Echo remembers about your money" profile that
 * feeds the budget planner: your take-home, your locked-in must-pays (rent, car, study loan…),
 * and the budget model you last chose. Isolated + AsyncStorage-persisted so Echo never asks you
 * the same questions twice. Deliberately separate from settingsStore (keeps a central store untouched).
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface BudgetCommitment {
  id: string;
  label: string;
  monthly: number;
}

interface BudgetProfileState {
  takeHome: number | null;
  commitments: BudgetCommitment[];
  modelId: string | null;
  setTakeHome: (v: number | null) => void;
  upsertCommitment: (c: BudgetCommitment) => void;
  removeCommitment: (id: string) => void;
  setModelId: (id: string | null) => void;
}

export const useBudgetProfileStore = create<BudgetProfileState>()(
  persist(
    (set) => ({
      takeHome: null,
      commitments: [],
      modelId: null,
      setTakeHome: (takeHome) => set({ takeHome }),
      upsertCommitment: (c) =>
        set((s) => ({ commitments: [...s.commitments.filter((x) => x.id !== c.id), c] })),
      removeCommitment: (id) => set((s) => ({ commitments: s.commitments.filter((x) => x.id !== id) })),
      setModelId: (modelId) => set({ modelId }),
    }),
    {
      name: 'budget-profile-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
