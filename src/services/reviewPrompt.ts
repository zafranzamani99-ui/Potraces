import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePersonalStore } from '../store/personalStore';

const FIRST_RUN_KEY = 'review-first-run-at';
const LAST_PROMPT_KEY = 'review-last-prompt-at';

const MIN_DAYS_INSTALLED = 2;
const MIN_TRANSACTIONS = 10;
const COOLDOWN_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Call once on app start to anchor the "days installed" clock. */
export async function recordFirstRun(): Promise<void> {
  try {
    const existing = await AsyncStorage.getItem(FIRST_RUN_KEY);
    if (!existing) await AsyncStorage.setItem(FIRST_RUN_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

/** Fire the review prompt if all gates pass. Call from a "delight" moment
 *  (after saving a receipt, hitting a milestone, logging a 10th+ tx, etc). */
export async function maybeRequestReview(): Promise<void> {
  try {
    const available = await StoreReview.isAvailableAsync();
    if (!available) return;

    const lastRaw = await AsyncStorage.getItem(LAST_PROMPT_KEY);
    if (lastRaw) {
      const last = Number(lastRaw);
      if (!isNaN(last) && Date.now() - last < COOLDOWN_DAYS * DAY_MS) return;
    }

    const firstRaw = await AsyncStorage.getItem(FIRST_RUN_KEY);
    const firstRun = firstRaw ? Number(firstRaw) : Date.now();
    if (Date.now() - firstRun < MIN_DAYS_INSTALLED * DAY_MS) return;

    const txCount = usePersonalStore.getState().transactions.length;
    if (txCount < MIN_TRANSACTIONS) return;

    await AsyncStorage.setItem(LAST_PROMPT_KEY, String(Date.now()));

    // OS respects its own cooldown; safe to call.
    const hasAction = await StoreReview.hasAction();
    if (hasAction) {
      await StoreReview.requestReview();
    }
  } catch {
    // best-effort
  }
}
