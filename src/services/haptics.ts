// ─── HAPTIC FEEDBACK SERVICE ───────────────────────────────
// Centralized wrapper around expo-haptics for consistent tactile
// feedback across the application. Every function is a safe async
// call that silently catches errors so the app works seamlessly on
// platforms without haptic support (web, older Android, simulators).

import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '../store/settingsStore';

/**
 * Light tap -- subtle acknowledgement for standard button presses,
 * toggles, and selection actions.
 */
export async function lightTap(): Promise<void> {
  try {
    if (!useSettingsStore.getState().hapticEnabled) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch {
    // Haptics unsupported on this platform -- fail silently.
  }
}

/**
 * Medium tap -- confirmatory feedback for meaningful actions such as
 * adding a transaction or switching modes.
 */
export async function mediumTap(): Promise<void> {
  try {
    if (!useSettingsStore.getState().hapticEnabled) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch {
    // Haptics unsupported on this platform -- fail silently.
  }
}

/**
 * Heavy tap -- strong tactile pulse for destructive or high-impact
 * actions (delete, submit payment, finalize sale).
 */
export async function heavyTap(): Promise<void> {
  try {
    if (!useSettingsStore.getState().hapticEnabled) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  } catch {
    // Haptics unsupported on this platform -- fail silently.
  }
}

/**
 * Success notification -- distinct "success" pattern for completed
 * operations (transaction saved, budget created, sale recorded).
 */
export async function successNotification(): Promise<void> {
  try {
    if (!useSettingsStore.getState().hapticEnabled) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    // Haptics unsupported on this platform -- fail silently.
  }
}

/**
 * Warning notification -- cautionary pulse for approaching limits,
 * low stock alerts, or near-due subscriptions.
 */
export async function warningNotification(): Promise<void> {
  try {
    if (!useSettingsStore.getState().hapticEnabled) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    // Haptics unsupported on this platform -- fail silently.
  }
}

/**
 * Error notification -- sharp feedback for validation failures,
 * network errors, or blocked actions.
 */
export async function errorNotification(): Promise<void> {
  try {
    if (!useSettingsStore.getState().hapticEnabled) return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch {
    // Haptics unsupported on this platform -- fail silently.
  }
}

/**
 * Selection changed -- tiny tick for scroll pickers, segmented
 * controls, and list reordering.
 */
export async function selectionChanged(): Promise<void> {
  try {
    if (!useSettingsStore.getState().hapticEnabled) return;
    await Haptics.selectionAsync();
  } catch {
    // Haptics unsupported on this platform -- fail silently.
  }
}
