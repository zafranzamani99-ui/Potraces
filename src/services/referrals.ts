import { supabase } from './supabase';

const BASE_URL = 'https://jejakbaki.my/r';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
function generateCode(): string {
  const arr = new Uint8Array(6);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  let code = '';
  for (const b of arr) code += CHARS[b % CHARS.length];
  return code;
}

/** Fetch (or create) the current user's referral code. Returns null if
 *  not authenticated. Idempotent — safe to call on every launch. */
export async function getOrCreateReferralCode(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  const userId = session.user.id;

  const { data: existing, error: readErr } = await supabase
    .from('user_profiles')
    .select('referral_code')
    .eq('user_id', userId)
    .maybeSingle();
  if (readErr && readErr.code !== 'PGRST116') return null;
  if (existing?.referral_code) return existing.referral_code;

  // Try insert with a fresh code — retry on unique violation up to 5 times.
  for (let i = 0; i < 5; i++) {
    const code = generateCode();
    const { error } = await supabase
      .from('user_profiles')
      .insert({ user_id: userId, referral_code: code });
    if (!error) return code;
    // 23505 = unique_violation
    if ((error as any).code !== '23505') return null;
  }
  return null;
}

/** Build the share URL for a given code. */
export function referralUrl(code: string): string {
  return `${BASE_URL}/${encodeURIComponent(code)}`;
}

/** Short share message body. */
export function referralMessage(code: string): string {
  return `Try Potraces — a Malaysian finance app with wallets, receipts, and Mak Cik-friendly UI. Use my code ${code}: ${referralUrl(code)}`;
}
