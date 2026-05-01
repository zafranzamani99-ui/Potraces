/**
 * Local notifications for recurring bills.
 *
 * We use expo-notifications to schedule ONE local notification per active
 * subscription, firing N days before nextBillingDate at 09:00 device time.
 *
 * Call sites:
 *   - App.tsx startup: ensurePermissionAndScheduleAll()
 *   - personalStore.addSubscription / updateSubscription / deleteSubscription:
 *     call scheduleForSubscription / cancelForSubscription after the state write.
 *
 * Android gotcha: Xiaomi/Oppo/Huawei OEM skins aggressively kill scheduled
 * notifications. Users should whitelist the app in battery optimizer. A note
 * is shown in Settings.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Subscription } from '../types';
import { useSettingsStore } from '../store/settingsStore';

const DEFAULT_DAYS_BEFORE = 3;
const NOTIFY_HOUR = 9;   // 09:00 device time
const NOTIFY_MINUTE = 0;
const ID_PREFIX = 'pt-sub-';

function notificationIdFor(subId: string): string {
  return `${ID_PREFIX}${subId}`;
}

export function scheduleBehavior(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/** Request permission if not already granted. Returns true on success. */
export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return true;
    const req = await Notifications.requestPermissionsAsync();
    return req.status === 'granted';
  } catch {
    return false;
  }
}

/**
 * Compute the trigger date: nextBillingDate minus `daysBefore`, at 09:00.
 * Returns null if the trigger would already be in the past.
 */
function triggerDateFor(sub: Subscription, daysBefore = DEFAULT_DAYS_BEFORE): Date | null {
  const billing = sub.nextBillingDate instanceof Date
    ? sub.nextBillingDate
    : new Date(sub.nextBillingDate as any);
  if (isNaN(billing.getTime())) return null;
  const trigger = new Date(billing.getTime());
  trigger.setDate(trigger.getDate() - daysBefore);
  trigger.setHours(NOTIFY_HOUR, NOTIFY_MINUTE, 0, 0);
  return trigger.getTime() > Date.now() ? trigger : null;
}

export async function cancelForSubscription(subId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationIdFor(subId));
  } catch {
    // best-effort; id may not exist
  }
}

export async function scheduleForSubscription(sub: Subscription): Promise<void> {
  // Clear any existing schedule first
  await cancelForSubscription(sub.id);

  if (!sub.isActive || sub.isPaused) return;
  const daysBefore = Math.max(0, sub.reminderDays ?? DEFAULT_DAYS_BEFORE);
  const trigger = triggerDateFor(sub, daysBefore);
  if (!trigger) return;

  const currency = useSettingsStore.getState().currency ?? 'RM';
  const title = `${sub.name} is due soon`;
  const body = `${currency} ${sub.amount.toFixed(2)} due on ${formatDueDate(sub.nextBillingDate)}.`;

  try {
    await Notifications.scheduleNotificationAsync({
      identifier: notificationIdFor(sub.id),
      content: { title, body, data: { subscriptionId: sub.id } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
    });
  } catch (err) {
    if (__DEV__) console.warn('[subscriptionNotifications] schedule failed:', err);
  }
}

export async function scheduleAll(subs: Subscription[]): Promise<void> {
  // Cancel everything first to avoid duplicates from stale schedules
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((s) => s.identifier.startsWith(ID_PREFIX))
        .map((s) => Notifications.cancelScheduledNotificationAsync(s.identifier))
    );
  } catch {}

  for (const sub of subs) {
    await scheduleForSubscription(sub);
  }
}

export async function ensurePermissionAndScheduleAll(subs: Subscription[]): Promise<void> {
  const granted = await ensureNotificationPermission();
  if (!granted) return;
  await scheduleAll(subs);

  // Android: ensure a channel exists so notifications render correctly.
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('bills', {
        name: 'Bill reminders',
        importance: Notifications.AndroidImportance.DEFAULT,
        vibrationPattern: [0, 250, 250, 250],
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
      });
    } catch {}
  }
}

function formatDueDate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d as any);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}
