import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Durable Tombstone Store ─────────────────────────────────────────────────
// Survives the push/clear cycle so that pulled remote items whose IDs are here
// are never resurrected into local state. Tombstones older than 30 days are
// pruned on startup — by then every device should have synced at least once.

const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface TombstoneState {
  /** Map of deleted item ID → deletion timestamp (epoch ms) */
  _tombstones: Record<string, number>;

  /** Record a durable tombstone for one or more IDs */
  addTombstones: (ids: string[]) => void;

  /** Remove tombstones older than 30 days */
  pruneExpired: () => number;

  /** Check whether a given ID is tombstoned */
  isTombstoned: (id: string) => boolean;

  /** Return the full set of tombstoned IDs (for merge filtering) */
  allTombstonedIds: () => Set<string>;
}

export const useTombstoneStore = create<TombstoneState>()(
  persist(
    (set, get) => ({
      _tombstones: {},

      addTombstones: (ids) => {
        if (ids.length === 0) return;
        const now = Date.now();
        set((state) => {
          const next = { ...state._tombstones };
          for (const id of ids) {
            // Don't overwrite an existing tombstone — keep the original deletion time
            if (!next[id]) next[id] = now;
          }
          return { _tombstones: next };
        });
      },

      pruneExpired: () => {
        const cutoff = Date.now() - TOMBSTONE_TTL_MS;
        const current = get()._tombstones;
        const entries = Object.entries(current);
        const expired = entries.filter(([, ts]) => ts < cutoff);
        if (expired.length === 0) return 0;

        const next: Record<string, number> = {};
        for (const [id, ts] of entries) {
          if (ts >= cutoff) next[id] = ts;
        }
        set({ _tombstones: next });
        return expired.length;
      },

      isTombstoned: (id) => id in get()._tombstones,

      allTombstonedIds: () => new Set(Object.keys(get()._tombstones)),
    }),
    {
      name: 'tombstone-store',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
