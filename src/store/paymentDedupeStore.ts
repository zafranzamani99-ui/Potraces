import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Payment dedupe store ────────────────────────────────────────────────────
// Same-payment collision protection for logging, NOT long-term history. A single
// payment can reach the log by two paths — a shared payment-success screenshot
// (Share-to-Log) and (later) an Apple/DuitNow auto-log — and each path keys the
// same transaction the same way (refId, else amount+time+payee). Recording the
// key + the transaction it produced lets logQuickExpense drop a second arrival
// ONLY while that transaction still exists. If the user deletes the transaction
// and re-shares the same screenshot, the key is stale — re-logging is allowed.
// A short TTL is enough: the window where the same payment arrives twice is
// minutes-to-hours, not weeks. Kept tiny (key→{ts,txId}).

const DEDUPE_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

interface DedupeEntry {
  /** First-seen timestamp (epoch ms). */
  ts: number;
  /** The transaction this key logged — checked for existence before blocking a repeat. */
  txId?: string;
}

interface PaymentDedupeState {
  _keys: Record<string, DedupeEntry>;
  /** Record a key as logged, with the transaction id it produced. No-op on empty key. */
  add: (key: string, txId?: string) => void;
  /** True if the key was seen within the TTL (expired keys read as absent). */
  has: (key: string) => boolean;
  /** The transaction id recorded for a key if within the TTL, else undefined. */
  txIdFor: (key: string) => string | undefined;
  /** Drop a key (e.g. its transaction was deleted → allow re-logging). */
  remove: (key: string) => void;
  /** Drop keys older than the TTL. Returns how many were removed. */
  prune: () => number;
}

export const usePaymentDedupeStore = create<PaymentDedupeState>()(
  persist(
    (set, get) => ({
      _keys: {},

      add: (key, txId) => {
        if (!key) return;
        set((state) => ({ _keys: { ...state._keys, [key]: { ts: Date.now(), txId } } }));
      },

      has: (key) => {
        if (!key) return false;
        const e = get()._keys[key];
        return e != null && Date.now() - e.ts < DEDUPE_TTL_MS;
      },

      txIdFor: (key) => {
        if (!key) return undefined;
        const e = get()._keys[key];
        if (e == null || Date.now() - e.ts >= DEDUPE_TTL_MS) return undefined;
        return e.txId;
      },

      remove: (key) => {
        if (!key || !get()._keys[key]) return;
        set((state) => {
          const next = { ...state._keys };
          delete next[key];
          return { _keys: next };
        });
      },

      prune: () => {
        const cutoff = Date.now() - DEDUPE_TTL_MS;
        const cur = get()._keys;
        const next: Record<string, DedupeEntry> = {};
        let removed = 0;
        for (const [k, e] of Object.entries(cur)) {
          if (e.ts >= cutoff) next[k] = e;
          else removed += 1;
        }
        if (removed > 0) set({ _keys: next });
        return removed;
      },
    }),
    {
      name: 'payment-dedupe-store',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // v0 stored key → timestamp (number); v1 stores key → { ts, txId }.
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as { _keys?: Record<string, unknown> } | undefined;
        if (version < 1 && state?._keys) {
          const next: Record<string, DedupeEntry> = {};
          for (const [k, v] of Object.entries(state._keys)) {
            next[k] = typeof v === 'number' ? { ts: v } : (v as DedupeEntry);
          }
          state._keys = next;
        }
        return state as PaymentDedupeState;
      },
    },
  ),
);
