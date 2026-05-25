/**
 * Detect AsyncStorage corruption for persisted Zustand stores.
 *
 * Called from App.tsx BEFORE stores hydrate. If any persisted blob fails to
 * parse, the store would normally crash or reset silently. This utility:
 *   1. Detects which stores have corrupted JSON.
 *   2. Returns the list for the app to decide how to recover.
 *   3. Does NOT delete anything automatically — the user decides.
 *
 * Recovery options (handled by the caller):
 *   - If signed in + cloud sync available: pull from Supabase (preferred).
 *   - Else: show user a choice "Start fresh" (destructive) or "Retry" (leave
 *     it; maybe a reinstall will help).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PERSISTED_STORE_KEYS = [
  'personal-storage',
  'wallet-storage',
  'debt-storage',
  'settings-storage',
  'seller-storage',
  'stall-storage',
  'category-storage',
  'premium-storage',
  'app-storage',
  'business-storage',
  'savings-storage',
  'playbook-storage',
  'learning-storage',
  'auth-storage',
  'ai-insights-storage',
  'receipt-storage',
  'freelancer-storage',
  'parttime-storage',
  'ontheroad-storage',
  'mixed-storage',
  'crm-storage',
  'notes-storage',
] as const;

export type StoreKey = typeof PERSISTED_STORE_KEYS[number];

export interface IntegrityReport {
  checked: StoreKey[];
  corrupted: StoreKey[];
  empty: StoreKey[];
}

/**
 * Check every known Zustand-persisted store key.
 * A blob is "corrupted" if it exists but JSON.parse throws.
 */
export async function checkStorageIntegrity(): Promise<IntegrityReport> {
  const corrupted: StoreKey[] = [];
  const empty: StoreKey[] = [];

  for (const key of PERSISTED_STORE_KEYS) {
    let raw: string | null = null;
    try {
      raw = await AsyncStorage.getItem(key);
    } catch {
      // Unable to read — treat as corrupted for safety
      corrupted.push(key);
      continue;
    }

    if (raw == null || raw === '') {
      empty.push(key);
      continue;
    }

    try {
      JSON.parse(raw);
    } catch {
      corrupted.push(key);
    }
  }

  return {
    checked: [...PERSISTED_STORE_KEYS],
    corrupted,
    empty,
  };
}

/**
 * Destructively clear the specified store blobs.
 * Use only when the user explicitly agrees to "start fresh."
 */
export async function clearCorruptedStores(keys: StoreKey[]): Promise<void> {
  for (const key of keys) {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      // best-effort; if a single key fails, keep going
    }
  }
}
