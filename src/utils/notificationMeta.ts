// ─── Notification presentation helpers ──────────────────────────────────────
// Shared by the inbox list (Notifications.tsx) and the detail screen
// (NotificationDetail.tsx) so the icon / tint / source label / relative time
// never drift between the two views. Pure mappings + a couple of i18n-aware
// formatters (they take the translation object rather than calling useT so this
// module stays hook-free and importable anywhere).
import { Feather } from '@expo/vector-icons';
import { CALM } from '../constants';
import type { NotificationType } from '../store/notificationStore';

/** Minimal shape both views can satisfy. */
type NotificationLike = { type: NotificationType; data?: Record<string, unknown> };

/** Feather icon per notification type (fallback when a transaction has no direction). */
export const TYPE_ICON: Record<NotificationType, keyof typeof Feather.glyphMap> = {
  update: 'download',
  broadcast: 'volume-2',
  push: 'bell',
  transaction: 'credit-card',
};

/** Accent colour per notification type. */
export const typeTint = (type: NotificationType, C: typeof CALM): string =>
  type === 'update' ? C.accent : type === 'broadcast' ? C.bronze : C.deepOlive;

/**
 * The type we PRESENT as — folds legacy captured pushes that carry
 * `data.type === 'share_logged'` into the 'transaction' bucket, so items logged
 * before the dedicated type existed still group + render as transactions.
 */
export function effectiveType(n: NotificationLike): NotificationType {
  if (n.type === 'transaction') return 'transaction';
  if (n.data?.type === 'share_logged') return 'transaction';
  return n.type;
}

/** True for logged-transaction notifications (share-to-log). */
export const isTransaction = (n: NotificationLike): boolean => effectiveType(n) === 'transaction';

/** True for Collectz pushes (data.type = 'collectz_*') — they keep store type
 *  'push' but present with their own icon, tint and source label. */
export const isCollectz = (n: NotificationLike): boolean =>
  typeof n.data?.type === 'string' && n.data.type.startsWith('collectz_');

/** Icon for a notification — directional arrow for transactions, type icon otherwise. */
export function iconFor(n: NotificationLike): keyof typeof Feather.glyphMap {
  if (isCollectz(n)) return 'users';
  const et = effectiveType(n);
  if (et === 'transaction') {
    return n.data?.direction === 'in' ? 'arrow-down-left' : 'arrow-up-right';
  }
  return TYPE_ICON[et];
}

/** Tint for a notification. Transactions follow the app rule: olive for income,
 *  text-primary for expense (no green/red). Others use the per-type accent. */
export function tintFor(n: NotificationLike, C: typeof CALM): string {
  if (isCollectz(n)) return C.accent;
  const et = effectiveType(n);
  if (et === 'transaction') {
    return n.data?.direction === 'in' ? C.positive : C.textPrimary;
  }
  return typeTint(et, C);
}

type RelTimeStrings = { justNow: string; minutesAgo: string; hoursAgo: string; daysAgo: string };

/** "just now" / "5m ago" / "7h ago" / "3d ago" from an epoch-ms timestamp. */
export function relTime(ts: number, t: { notifications: RelTimeStrings }): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return t.notifications.justNow;
  if (mins < 60) return t.notifications.minutesAgo.replace('{n}', String(mins));
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t.notifications.hoursAgo.replace('{n}', String(hrs));
  return t.notifications.daysAgo.replace('{n}', String(Math.floor(hrs / 24)));
}

type SourceStrings = {
  sourceUpdate: string;
  sourceBroadcast: string;
  sourcePush: string;
  sourceTransaction: string;
  sourceCollectz: string;
};

/** Human-readable "from" label per type (Transaction / System update / Announcement / Alert). */
export function sourceLabel(n: NotificationLike, t: { notifications: SourceStrings }): string {
  if (isCollectz(n)) return t.notifications.sourceCollectz;
  switch (effectiveType(n)) {
    case 'transaction':
      return t.notifications.sourceTransaction;
    case 'update':
      return t.notifications.sourceUpdate;
    case 'broadcast':
      return t.notifications.sourceBroadcast;
    default:
      return t.notifications.sourcePush;
  }
}
