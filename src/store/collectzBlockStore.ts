import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Collectz Block Store ────────────────────────────────────────────────────
// Client-side block list for Collectz (Apple 1.2 UGC: users must be able to
// block abusive people). Blocking is local + instant — a blocked person's name
// and content are masked everywhere you'd otherwise see them, and they can be
// unblocked from the same menu. Keyed by the person's account `user_id` when
// they have one, else by session + normalized name for offline roster entries.

/** Stable block key for a participant. Prefer account id; fall back to name. */
export const blockKey = (
  sessionId: string,
  p: { user_id?: string | null; name?: string | null },
): string =>
  p.user_id ? `u:${p.user_id}` : `s:${sessionId}:${(p.name ?? '').trim().toLowerCase()}`;

interface CollectzBlockState {
  /** key → blocked-at epoch ms */
  _blocked: Record<string, number>;
  isBlocked: (key: string) => boolean;
  block: (key: string) => void;
  unblock: (key: string) => void;
}

export const useCollectzBlockStore = create<CollectzBlockState>()(
  persist(
    (set, get) => ({
      _blocked: {},
      isBlocked: (key) => !!get()._blocked[key],
      block: (key) =>
        set((s) => (s._blocked[key] ? s : { _blocked: { ...s._blocked, [key]: Date.now() } })),
      unblock: (key) =>
        set((s) => {
          if (!s._blocked[key]) return s;
          const next = { ...s._blocked };
          delete next[key];
          return { _blocked: next };
        }),
    }),
    { name: 'collectz-blocks', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
