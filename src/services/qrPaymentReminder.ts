import * as Notifications from 'expo-notifications';

/**
 * Phase 3 — optional local nudge for the bank-standee reality.
 *
 * When no PSP is configured and the buyer pays a Maybank/CIMB/TNG standee, the
 * app CANNOT know (no webhook). If the seller opened the QR sheet and dismissed
 * it without confirming, and the order is still unpaid, this fires a single
 * local notification ~10 min later: "did the RM X payment for order #N arrive?"
 *
 * LOCAL notifications only — no server involvement. We do NOT read the seller's
 * bank notifications/SMS (iOS forbids it; out of scope permanently).
 */
const REMINDER_DELAY_SECONDS = 10 * 60;
const idFor = (orderId: string) => `qr-unpaid-reminder-${orderId}`;

export async function scheduleUnpaidQrReminder(p: {
  orderId: string;
  title: string;
  body: string;
}): Promise<void> {
  try {
    // Replace any existing reminder for this order.
    await Notifications.cancelScheduledNotificationAsync(idFor(p.orderId)).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: idFor(p.orderId),
      content: {
        title: p.title,
        body: p.body,
        sound: 'default',
        data: { type: 'payment_received', orderId: p.orderId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: REMINDER_DELAY_SECONDS,
      },
    });
  } catch {
    // Permissions off / unsupported — a missing nudge is harmless.
  }
}

export async function cancelUnpaidQrReminder(orderId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(idFor(orderId));
  } catch {
    /* ignore */
  }
}
