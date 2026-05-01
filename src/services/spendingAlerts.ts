import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePersonalStore } from '../store/personalStore';
import { useSettingsStore } from '../store/settingsStore';

const LAST_RUN_KEY = 'spending-alerts-last-run';
const DAILY_MS = 24 * 60 * 60 * 1000;

const THRESHOLD_PCT = 1.5;   // > 150% of 4-week avg
const THRESHOLD_AMT = 20;    // and > RM20 absolute diff

interface CategoryStat {
  category: string;
  thisWeekSpend: number;
  trailingAvg: number;
  pctOfAvg: number;
  diff: number;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Compute category spend stats for current week vs 4-week avg. */
export function computeSpendingStats(): CategoryStat[] {
  const txs = usePersonalStore.getState().transactions.filter((t) => t.type === 'expense');
  const now = new Date();
  const thisWeekStart = startOfDay(new Date(now.getTime() - 7 * DAILY_MS));
  const trailingStart = startOfDay(new Date(now.getTime() - 5 * 7 * DAILY_MS));
  const trailingEnd = thisWeekStart;

  const thisWeek = new Map<string, number>();
  const trailing = new Map<string, number>();

  for (const t of txs) {
    const d = t.date instanceof Date ? t.date : new Date(t.date as any);
    if (isNaN(d.getTime())) continue;
    const cat = t.category || 'other';
    if (d >= thisWeekStart && d <= now) {
      thisWeek.set(cat, (thisWeek.get(cat) ?? 0) + t.amount);
    } else if (d >= trailingStart && d < trailingEnd) {
      trailing.set(cat, (trailing.get(cat) ?? 0) + t.amount);
    }
  }

  const stats: CategoryStat[] = [];
  for (const [cat, spend] of thisWeek) {
    const avg = (trailing.get(cat) ?? 0) / 4;
    const pct = avg > 0 ? spend / avg : Infinity;
    stats.push({
      category: cat,
      thisWeekSpend: spend,
      trailingAvg: avg,
      pctOfAvg: pct,
      diff: spend - avg,
    });
  }
  return stats;
}

/** Returns categories that exceed both thresholds. */
export function findSpendingAlerts(): CategoryStat[] {
  return computeSpendingStats().filter(
    (s) => s.trailingAvg > 0 && s.pctOfAvg > THRESHOLD_PCT && s.diff > THRESHOLD_AMT,
  );
}

/** Run the daily check: at most once per 24h; only if the feature is on. */
export async function maybeRunSpendingAlertCheck(): Promise<void> {
  const { spendingAlertsEnabled } = useSettingsStore.getState() as any;
  if (!spendingAlertsEnabled) return;

  try {
    const lastRunRaw = await AsyncStorage.getItem(LAST_RUN_KEY);
    const lastRun = lastRunRaw ? Number(lastRunRaw) : 0;
    if (Date.now() - lastRun < DAILY_MS) return;

    const alerts = findSpendingAlerts();
    if (alerts.length === 0) {
      await AsyncStorage.setItem(LAST_RUN_KEY, String(Date.now()));
      return;
    }

    // Compose a single friendly notification summarizing up to 3 categories.
    const top = alerts
      .sort((a, b) => b.diff - a.diff)
      .slice(0, 3)
      .map((s) => `${s.category} (+RM ${s.diff.toFixed(0)})`)
      .join(', ');

    // Permission is sticky if the user already granted for subscriptions.
    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted') {
      await AsyncStorage.setItem(LAST_RUN_KEY, String(Date.now()));
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'spending above usual',
        body: `this week's ${top} is higher than your 4-week average.`,
        data: { type: 'spending_alert' },
      },
      trigger: null,
    });

    await AsyncStorage.setItem(LAST_RUN_KEY, String(Date.now()));
  } catch {
    // best-effort
  }
}
