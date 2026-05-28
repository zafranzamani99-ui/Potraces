import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── AsyncStorage Size Monitoring ────────────────────────────────────────────
// Android has a ~6MB default limit for AsyncStorage. This utility measures
// current usage and warns when the app approaches the limit.

const STORAGE_CHECK_KEY = '@storageMonitor_lastCheckedAt';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // once per day

/** 67% of 6MB — emit a console warning */
const WARN_THRESHOLD_BYTES = 4 * 1024 * 1024; // 4MB

/** 83% of 6MB — surface a user-visible warning */
const ALERT_THRESHOLD_BYTES = 5 * 1024 * 1024; // 5MB

export interface StorageUsageReport {
  totalBytes: number;
  keys: { key: string; bytes: number }[];
}

/**
 * Measure the byte size of every key in AsyncStorage.
 * Returns keys sorted largest-first.
 */
export async function checkStorageUsage(): Promise<StorageUsageReport> {
  const allKeys = await AsyncStorage.getAllKeys();
  if (allKeys.length === 0) return { totalBytes: 0, keys: [] };

  const pairs = await AsyncStorage.multiGet(allKeys as string[]);
  const keys: { key: string; bytes: number }[] = [];
  let totalBytes = 0;

  for (const [key, value] of pairs) {
    // UTF-16 in JS but stored as UTF-8 in SQLite — approximate with string length
    // which is close enough for threshold comparisons.
    const bytes = (value?.length ?? 0) * 2; // conservative: assume 2 bytes per char
    keys.push({ key: key!, bytes });
    totalBytes += bytes;
  }

  // Sort largest first
  keys.sort((a, b) => b.bytes - a.bytes);

  return { totalBytes, keys };
}

/**
 * Run the daily storage check. Returns the report if a check was performed,
 * or null if skipped (checked recently). Pass `showToast` to surface a
 * user-visible warning when storage is critically full.
 */
export async function maybeCheckStorage(
  showToast?: (message: string, type: 'info' | 'error') => void,
): Promise<StorageUsageReport | null> {
  try {
    // Throttle: only check once per day
    const lastRaw = await AsyncStorage.getItem(STORAGE_CHECK_KEY);
    if (lastRaw) {
      const lastChecked = parseInt(lastRaw, 10);
      if (!isNaN(lastChecked) && Date.now() - lastChecked < CHECK_INTERVAL_MS) {
        return null; // checked recently
      }
    }

    const report = await checkStorageUsage();

    // Record check timestamp
    await AsyncStorage.setItem(STORAGE_CHECK_KEY, String(Date.now()));

    const totalMB = (report.totalBytes / (1024 * 1024)).toFixed(1);

    if (report.totalBytes >= ALERT_THRESHOLD_BYTES) {
      console.warn(
        `[storageMonitor] CRITICAL: AsyncStorage at ${totalMB}MB / 6MB`,
        report.keys.slice(0, 5).map((k) => `${k.key}: ${(k.bytes / 1024).toFixed(0)}KB`),
      );
      showToast?.(
        `Storage nearly full (${totalMB}MB) — consider archiving old data`,
        'error',
      );
    } else if (report.totalBytes >= WARN_THRESHOLD_BYTES) {
      console.warn(
        `[storageMonitor] WARNING: AsyncStorage at ${totalMB}MB / 6MB`,
        report.keys.slice(0, 5).map((k) => `${k.key}: ${(k.bytes / 1024).toFixed(0)}KB`),
      );
    } else if (__DEV__) {
      console.log(`[storageMonitor] OK: ${totalMB}MB used`);
    }

    return report;
  } catch (e: any) {
    if (__DEV__) console.warn('[storageMonitor] check failed:', e?.message);
    return null;
  }
}
