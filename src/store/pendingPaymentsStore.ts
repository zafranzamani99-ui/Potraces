import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Pending QR payments — charges shown to a buyer via a PSP-issued QR that are
 * waiting for the provider's webhook to confirm. Only used when a QR provider
 * is configured (Phase 2). The webhook flips these to paid server-side; the app
 * resolves them by polling payment_events on focus (see qrPaymentResolver).
 *
 * Persisted so a charge that's still waiting survives a quick app restart; a
 * stale entry older than MAX_AGE_MS is pruned on read (a buyer who walked away).
 */
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

export interface PendingCharge {
  /** Provider charge id (preferred) or the app refId — the resolver matches either. */
  id: string;
  /** The order/sale ref the charge was created for. */
  refId: string;
  amountCents: number;
  /** ISO timestamp. */
  createdAt: string;
  label?: string;
  mode: 'stall' | 'seller';
}

interface PendingPaymentsState {
  pending: PendingCharge[];
  addPending: (charge: PendingCharge) => void;
  /** Remove by charge id OR refId (the webhook may reference either). */
  resolvePending: (idOrRef: string) => void;
  /** Drop entries older than MAX_AGE_MS; returns the live list. */
  prune: () => PendingCharge[];
  clear: () => void;
}

export const usePendingPaymentsStore = create<PendingPaymentsState>()(
  persist(
    (set, get) => ({
      pending: [],
      addPending: (charge) =>
        set((s) => ({
          pending: [...s.pending.filter((p) => p.id !== charge.id), charge],
        })),
      resolvePending: (idOrRef) =>
        set((s) => ({
          pending: s.pending.filter((p) => p.id !== idOrRef && p.refId !== idOrRef),
        })),
      prune: () => {
        const now = Date.now();
        const live = get().pending.filter((p) => now - new Date(p.createdAt).getTime() < MAX_AGE_MS);
        if (live.length !== get().pending.length) set({ pending: live });
        return live;
      },
      clear: () => set({ pending: [] }),
    }),
    {
      name: 'pending-payments-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
