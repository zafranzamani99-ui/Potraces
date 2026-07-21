/**
 * Quick-Log key — per-user secret that authenticates the Back Tap Shortcut to
 * the `quick-log` edge function. We store only the SHA-256 hex hash server-side
 * (quick_log_keys); the raw key is shown to the user once, to paste into the
 * Shortcut. See docs/superpowers/specs/2026-07-05-background-quick-log-design.md.
 */
import * as Crypto from 'expo-crypto';
import { supabasePersonal as supabase } from './supabase'; // personal client (quick-log keys)
import { useSettingsStore } from '../store/settingsStore';
import { encodeQuickLogKey } from '../utils/quickLogKeyFormat';

/** 24-char Crockford base32 body with a QLOG- prefix, from expo-crypto randomness. */
export function generateQuickLogKey(): string {
  return encodeQuickLogKey(Crypto.getRandomBytes(24));
}

/** SHA-256 → lowercase hex (default HEX encoding). MUST match the Deno function. */
export async function hashKey(key: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, key.trim());
}

async function currentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/**
 * Mint + store a new key and return the RAW key (shown once). Grace-period
 * rotation: older keys are NOT revoked here — the edge function retires them
 * on the new key's first successful use. So regenerating never breaks an
 * installed Shortcut mid-transition (previously each rotation cost the user
 * one lost entry when the Shortcut still held the old key). Explicit
 * revokeQuickLogKey() remains the kill-switch for a leaked key.
 */
export async function registerQuickLogKey(): Promise<string> {
  const userId = await currentUserId();
  if (!userId) throw new Error('not-signed-in');
  const key = generateQuickLogKey();
  const key_hash = await hashKey(key);
  const { error } = await supabase.from('quick_log_keys')
    .insert({ user_id: userId, key_hash });
  if (error) throw error;
  useSettingsStore.getState().setQuickLogConfigured(true);
  return key;
}

export async function getQuickLogKeyStatus(): Promise<{ hasActiveKey: boolean }> {
  const userId = await currentUserId();
  if (!userId) return { hasActiveKey: false };
  const { count, error } = await supabase.from('quick_log_keys')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('revoked', false);
  // supabase-js resolves (never rejects) on network failures — without this
  // throw, an offline check reads as "no key" and poisons the cached
  // quickLogConfigured flag for a user whose Back Tap works fine.
  if (error) throw error;
  return { hasActiveKey: (count ?? 0) > 0 };
}

export async function revokeQuickLogKey(): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  const { error } = await supabase.from('quick_log_keys').update({ revoked: true })
    .eq('user_id', userId).eq('revoked', false);
  if (error) throw error;
  useSettingsStore.getState().setQuickLogConfigured(false);
}

/**
 * Refresh the cached "auto-log set up" flag from the server (best-effort).
 * Called at app start and after sign-in so Echo & screens know without a
 * round-trip. Signed-out → flag cleared (the key belongs to an account).
 */
export async function refreshQuickLogConfigured(): Promise<void> {
  try {
    const { hasActiveKey } = await getQuickLogKeyStatus();
    useSettingsStore.getState().setQuickLogConfigured(hasActiveKey);
  } catch {
    // offline — keep the last cached value
  }
}
