import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Payment dedupe store ────────────────────────────────────────────────────
// Same-payment collision protection for logging, NOT long-term history. A single
// payment can reach the log by two paths — a shared payment-success screenshot
// (Share-to-Log) and (later) an Apple/DuitNow auto-log — and each path keys the
// same transaction the same way (refId, else amount+time+payee). Recording the
// key here lets logQuickExpense drop the second arrival instead of double-logging
// + double-deducting the wallet. A short TTL is enough: the window where the same
// payment arrives twice is minutes-to-hours, not weeks. Kept tiny (key→epoch-ms).

const DEDUPE_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours

interface PaymentDedupeState {
  /** Map of dedupe key → first-seen timestamp (epoch ms) */
  _keys: Record<string, number>;
  /** Record a key as logged. No-op on empty. */
  add: (key: string) => void;
  /** True if the key was seen within the TTL (expired keys read as absent). */
  has: (key: string) => boolean;
  /** Drop keys older than the TTL. Returns how many were removed. */
  prune: () => number;
}

export const usePaymentDedupeStore = create<PaymentDedupeState>()(
  persist(
    (set, get) => ({
      _keys: {},

      add: (key) => {
        if (!key) return;
        set((state) => (state._keys[key] ? state : { _keys: { ...state._keys, [key]: Date.now() } }));
      },

      has: (key) => {
        if (!key) return false;
        const ts = get()._keys[key];
        return ts != null && Date.now() - ts < DEDUPE_TTL_MS;
      },

      prune: () => {
        const cutoff = Date.now() - DEDUPE_TTL_MS;
        const cur = get()._keys;
        const next: Record<string, number> = {};
        let removed = 0;
        for (const [k, ts] of Object.entries(cur)) {
          if (ts >= cutoff) next[k] = ts;
          else removed += 1;
        }
        if (removed > 0) set({ _keys: next });
        return removed;
      },
    }),
    {
      name: 'payment-dedupe-store',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
