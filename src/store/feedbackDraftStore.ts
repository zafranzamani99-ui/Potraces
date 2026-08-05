import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Unsent "Report a bug / idea" draft. Persisted to disk so a report survives the
// sign-in round-trip (tap Send while signed out, go to the Account screen, come
// back) AND a low-memory process kill during Google/Apple OAuth. Written on
// change, cleared only on a successful submit. One slot, last-write-wins.

export type FeedbackType = 'bug' | 'idea';

export interface FeedbackDraft {
  type: FeedbackType;
  body: string;
  screenshotUris?: string[]; // up to 3
}

interface FeedbackDraftState {
  draft: FeedbackDraft | null;
  setDraft: (d: FeedbackDraft) => void;
  clearDraft: () => void;
}

export const useFeedbackDraftStore = create<FeedbackDraftState>()(
  persist(
    (set) => ({
      draft: null,
      setDraft: (draft) => set({ draft }),
      clearDraft: () => set({ draft: null }),
    }),
    { name: 'feedback-draft', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
