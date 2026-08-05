// ─── MONTHLY STATEMENT REMINDER ─────────────────────────────
// One local notification at 10:00 on the 1st of the month: "did you miss
// anything? import your statement" — the monthly safety-net nudge
// (docs/plans/import-reconciliation-design.md §9).
//
// There is no reliable monthly repeat trigger across iOS/Android, so this
// schedules ONE one-shot DATE trigger and re-arms on every sync (settings
// toggle, check-in syncs, each successful statement import). Idempotent like
// the check-in reminders: every sync cancels ALL previously scheduled
// statement reminders (found via content.data.type) before re-scheduling.

import * as Notifications from 'expo-notifications';
import { useSettingsStore } from '../store/settingsStore';
import { en } from '../i18n/en';
import { ms } from '../i18n/ms';
import { nextStatementReminderDate } from '../utils/statementReminder';

export const STATEMENT_REMINDER_TYPE = 'statement_reminder';

// Re-export so app code can pull the helper from the service; the unit test
// imports the RN-free util directly.
export { nextStatementReminderDate };

/**
 * Bring the OS schedule in line with the setting. Cancels every existing
 * statement reminder, then schedules the next one-shot when enabled.
 * Returns false when notification permission is missing (caller may hint).
 */
export async function syncStatementReminder(enabled: boolean): Promise<boolean> {
  try {
    // Sweep existing statement reminders (never touches bills/spending alerts).
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((n) => (n.content.data as { type?: string } | null)?.type === STATEMENT_REMINDER_TYPE)
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
    );

    if (!enabled) return true;

    // Permission is sticky if already granted for bills/spending alerts.
    let perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted' && perm.canAskAgain) {
      perm = await Notifications.requestPermissionsAsync();
    }
    if (perm.status !== 'granted') return false;

    const tr = useSettingsStore.getState().language === 'ms' ? ms : en;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: tr.notifications.statementReminderTitle,
        body: tr.notifications.statementReminderBody,
        data: { type: STATEMENT_REMINDER_TYPE },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: nextStatementReminderDate(new Date()),
      },
    });
    return true;
  } catch {
    return false; // best-effort — settings UI stays usable offline/denied
  }
}
