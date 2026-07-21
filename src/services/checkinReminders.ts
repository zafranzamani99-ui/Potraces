// ─── DAILY CHECK-IN REMINDERS ──────────────────────────────
// Local notifications for Echo's daily check-in: the user picks one or more
// times in Settings → Money Setup, and Potraces nudges them to log at each.
// Times are 24h "HH:mm" strings in settingsStore.echoCheckinTimes.
//
// Scheduling is idempotent: every sync cancels ALL previously scheduled
// check-in notifications (found via content.data.type) and re-schedules from
// the current list — no drift between the store and the OS schedule.

import * as Notifications from 'expo-notifications';

export const CHECKIN_NOTIFICATION_TYPE = 'echo_checkin';

/** "HH:mm" → { hour, minute } (null on junk so a bad value can't schedule). */
function parseTime(t: string): { hour: number; minute: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return null;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** "HH:mm" → "9:00 PM" for chips/labels. */
export function formatCheckinTime(t: string): string {
  const parsed = parseTime(t);
  if (!parsed) return t;
  const ampm = parsed.hour >= 12 ? 'PM' : 'AM';
  const h = parsed.hour % 12 || 12;
  return `${h}:${String(parsed.minute).padStart(2, '0')} ${ampm}`;
}

/**
 * Bring the OS schedule in line with the setting. Cancels every existing
 * check-in notification, then schedules a daily repeat per time when enabled.
 * Returns false when notification permission is missing (caller may hint).
 */
export async function syncCheckinReminders(enabled: boolean, times: string[]): Promise<boolean> {
  try {
    // Sweep existing check-in schedules (never touches bills/spending alerts).
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => (n.content.data as { type?: string } | null)?.type === CHECKIN_NOTIFICATION_TYPE)
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );

    if (!enabled || times.length === 0) return true;

    // Permission is sticky if already granted for bills/spending alerts.
    let perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted' && perm.canAskAgain) {
      perm = await Notifications.requestPermissionsAsync();
    }
    if (perm.status !== 'granted') return false;

    await Promise.all(
      times.map((t) => {
        const parsed = parseTime(t);
        if (!parsed) return Promise.resolve(null);
        return Notifications.scheduleNotificationAsync({
          content: {
            title: 'Potraces',
            body: 'How did today go? Take 30 seconds to log your spending.',
            data: { type: CHECKIN_NOTIFICATION_TYPE },
            sound: 'default',
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DAILY,
            hour: parsed.hour,
            minute: parsed.minute,
          },
        });
      }),
    );
    return true;
  } catch {
    return false; // best-effort — settings UI stays usable offline/denied
  }
}
