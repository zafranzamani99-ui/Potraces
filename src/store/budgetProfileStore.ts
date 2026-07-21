/**
 * budgetProfileStore — the small, persisted "what Echo remembers about your money" profile that
 * feeds the budget planner: your take-home, your locked-in must-pays (rent, car, study loan…),
 * and the budget model you last chose. Isolated + AsyncStorage-persisted so Echo never asks you
 * the same questions twice. Deliberately separate from settingsStore (keeps a central store untouched).
 *
 * SYNC (M2, 2026-07-22): this profile syncs to `personal_budget_profile` as a single-row LWW
 * blob keyed by user_id. `updatedAt` (epoch ms, persisted) is the LWW key: every USER setter
 * bumps it, and personalSync pushes it as client_edit_at / adopts the remote blob when the
 * remote client_edit_at is newer. `applySyncedProfile` writes a pulled remote profile WITHOUT
 * bumping updatedAt — a sync apply is not a user edit, so it must never win LWW or force a
 * re-push loop.
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
  /**
   * Epoch ms of the last USER edit on this device (null = never edited here).
   * LWW key for cloud sync — bumped by every setter below, NOT by applySyncedProfile.
   */
  updatedAt: number | null;
  setTakeHome: (v: number | null) => void;
  upsertCommitment: (c: BudgetCommitment) => void;
  removeCommitment: (id: string) => void;
  setModelId: (id: string | null) => void;
  /** Sync-only: adopt a pulled remote profile verbatim (carries the REMOTE edit time). */
  applySyncedProfile: (p: {
    takeHome: number | null;
    commitments: BudgetCommitment[];
    modelId: string | null;
    updatedAt: number | null;
  }) => void;
}

export const useBudgetProfileStore = create<BudgetProfileState>()(
  persist(
    (set) => ({
      takeHome: null,
      commitments: [],
      modelId: null,
      updatedAt: null,
      setTakeHome: (takeHome) => set({ takeHome, updatedAt: Date.now() }),
      upsertCommitment: (c) =>
        set((s) => ({
          commitments: [...s.commitments.filter((x) => x.id !== c.id), c],
          updatedAt: Date.now(),
        })),
      removeCommitment: (id) =>
        set((s) => ({
          commitments: s.commitments.filter((x) => x.id !== id),
          updatedAt: Date.now(),
        })),
      setModelId: (modelId) => set({ modelId, updatedAt: Date.now() }),
      applySyncedProfile: ({ takeHome, commitments, modelId, updatedAt }) =>
        set({ takeHome, commitments, modelId, updatedAt }),
    }),
    {
      name: 'budget-profile-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
