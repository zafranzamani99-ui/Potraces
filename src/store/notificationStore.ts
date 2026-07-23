// ─── Notification inbox: a local, per-device store ──────────────────────────
// Single source of truth for the in-app notification center. Fed by three
// sources (see App.tsx): app-update notices (appConfig latestVersion), admin
// broadcasts (Supabase `announcements` table), and captured push notifications.
// Read/deleted state is local — this store never syncs (fits the beta cloud lock).
// createdAt is epoch-ms, so no Date partialize/reviver is needed.
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type NotificationType = 'update' | 'broadcast' | 'push' | 'transaction';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: number; // epoch ms
  read: boolean;
  data?: Record<string, unknown>;
}

/** Shape of an `announcements` row as read from Supabase. */
export interface BroadcastRow {
  id: string;
  title: string;
  body: string;
  created_at: string; // ISO
}

interface NotificationState {
  items: AppNotification[];
  // Broadcast ids the user deleted locally — so a re-fetch never resurrects them.
  // ponytail: unbounded, but admin broadcasts are rare; prune with items if it ever matters.
  dismissedIds: string[];
  /** Add/update one notification. Dedupes by id, keeps an existing read flag. */
  addNotification: (n: Omit<AppNotification, 'read'> & { read?: boolean }) => void;
  /** Merge broadcast rows from Supabase; local read state wins, dismissed ids skipped. */
  mergeBroadcasts: (rows: BroadcastRow[]) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  /** Delete one; broadcasts also get tombstoned into dismissedIds. */
  remove: (id: string) => void;
  clearAll: () => void;
  /** Auto-clear READ items older than `ageMs` (unread are always kept). */
  pruneOlderThan: (ageMs: number) => void;
}

const byNewest = (a: AppNotification, b: AppNotification) => b.createdAt - a.createdAt;

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      items: [],
      dismissedIds: [],

      addNotification: (n) =>
        set((s) => {
          if (s.dismissedIds.includes(n.id)) return s;
          const existing = s.items.find((i) => i.id === n.id);
          const read = existing ? existing.read : n.read ?? false;
          const others = s.items.filter((i) => i.id !== n.id);
          return { items: [{ ...n, read }, ...others].sort(byNewest) };
        }),

      mergeBroadcasts: (rows) =>
        set((s) => {
          const dismissed = new Set(s.dismissedIds);
          const byId = new Map(s.items.map((i) => [i.id, i]));
          for (const r of rows) {
            if (dismissed.has(r.id)) continue;
            const prev = byId.get(r.id);
            byId.set(r.id, {
              id: r.id,
              type: 'broadcast',
              title: r.title,
              body: r.body,
              createdAt: new Date(r.created_at).getTime(),
              read: prev ? prev.read : false,
            });
          }
          return { items: Array.from(byId.values()).sort(byNewest) };
        }),

      markRead: (id) =>
        set((s) => ({ items: s.items.map((i) => (i.id === id && !i.read ? { ...i, read: true } : i)) })),

      markAllRead: () =>
        set((s) =>
          s.items.some((i) => !i.read)
            ? { items: s.items.map((i) => (i.read ? i : { ...i, read: true })) }
            : s,
        ),

      remove: (id) =>
        set((s) => {
          const item = s.items.find((i) => i.id === id);
          const tombstone = item?.type === 'broadcast' && !s.dismissedIds.includes(id);
          return {
            items: s.items.filter((i) => i.id !== id),
            dismissedIds: tombstone ? [...s.dismissedIds, id] : s.dismissedIds,
          };
        }),

      clearAll: () =>
        set((s) => {
          const broadcastIds = s.items.filter((i) => i.type === 'broadcast').map((i) => i.id);
          return {
            items: [],
            dismissedIds: Array.from(new Set([...s.dismissedIds, ...broadcastIds])),
          };
        }),

      pruneOlderThan: (ageMs) =>
        set((s) => {
          const cutoff = Date.now() - ageMs;
          return { items: s.items.filter((i) => !i.read || i.createdAt >= cutoff) };
        }),
    }),
    {
      name: 'notification-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ items: s.items, dismissedIds: s.dismissedIds }),
    },
  ),
);
