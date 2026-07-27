// Entitlements — client for the server-side premium grant ledger
// ("membership book"): redeem codes, referral rewards, Collectz milestone.
// Contract: docs/plans/premium-grants-and-rewards.md + migration
// 20260726000000_premium_grants_and_rewards.sql.
//
// FAIL-SOFT discipline: a transient failure (offline, signed out, 5xx) NEVER
// downgrades the user — only a definitive server response reconciles the store
// (including tier 'free' once the launch gate is on).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clientForMode } from './supabase';
import { useAppStore } from '../store/appStore';
import { useSettingsStore } from '../store/settingsStore';
import { usePremiumStore } from '../store/premiumStore';
import { getDeviceId } from '../utils/deviceId';
import { globalShowToast } from '../context/ToastContext';
import { en } from '../i18n/en';
import { ms } from '../i18n/ms';
import type { PremiumTier } from '../types';

const TIERS: PremiumTier[] = ['free', 'basic', 'pro', 'premium'];
const asTier = (v: unknown): PremiumTier =>
  TIERS.includes(v as PremiumTier) ? (v as PremiumTier) : 'free';

const tr = () => (useSettingsStore.getState().language === 'ms' ? ms : en);

// Same client discipline as referrals.ts — entitlements follow the account the
// user is currently acting as.
const client = () => clientForMode(useAppStore.getState().mode);

// ── my_entitlement ─────────────────────────────────────────────────────────

/** One call per launch / sign-in / foreground: activity ping + lazy qualify on
 *  the server, then reconcile the effective tier. Never throws; a transient
 *  failure leaves the current tier untouched. */
export async function refreshEntitlement(): Promise<void> {
  try {
    const supabase = client();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return; // signed out — nothing to reconcile
    const deviceId = await getDeviceId();
    const { data, error } = await supabase.rpc('my_entitlement', { p_device_id: deviceId });
    if (error || !data?.ok) return; // transient — keep the current state
    usePremiumStore.getState().reconcileEntitlement({
      tier: asTier(data.tier),
      premiumUntil: data.premium_until ? new Date(data.premium_until) : null,
      gateOn: data.gate_on === true,
    });
  } catch {
    // fail-soft
  }
}

// ── redeem_code ────────────────────────────────────────────────────────────

export type RedeemResult =
  | { ok: true; tier: PremiumTier; days: number; premiumUntil: Date | null }
  | { ok: false; reason: string };

/** Redeem an admin-minted gift code. Reasons map 1:1 to the RPC contract
 *  (invalid_code / code_disabled / code_expired / code_exhausted /
 *  already_redeemed / campaign_already_used / rate_limited) plus the local
 *  'auth_required' / 'network'. */
export async function redeemCode(code: string): Promise<RedeemResult> {
  try {
    const supabase = client();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { ok: false, reason: 'auth_required' };
    const { data, error } = await supabase.rpc('redeem_code', { p_code: code });
    if (error) {
      return { ok: false, reason: error.message?.includes('auth_required') ? 'auth_required' : 'network' };
    }
    if (data?.ok) {
      // Reflect the new grant in the effective tier right away (best-effort).
      void refreshEntitlement();
      return {
        ok: true,
        tier: asTier(data.tier),
        days: typeof data.days === 'number' ? data.days : 0,
        premiumUntil: data.premium_until ? new Date(data.premium_until) : null,
      };
    }
    return { ok: false, reason: typeof data?.reason === 'string' ? data.reason : 'invalid_code' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

// ── claim_referral ─────────────────────────────────────────────────────────

export type ReferralSource = 'link' | 'collectz';

export interface PendingReferral {
  code: string;
  source: ReferralSource;
  /** Collectz share_code when source='collectz', else null. */
  session: string | null;
}

export type ClaimResult =
  | { ok: true; welcomeTier: PremiumTier; welcomeDays: number }
  | { ok: false; reason: string };

/** A new (≤14d) account claims a referrer's code. Reasons per the RPC contract:
 *  invalid_code / self_referral / same_device / already_referred /
 *  account_too_old, plus local 'auth_required' / 'network'. */
export async function claimReferral({ code, source, session }: PendingReferral): Promise<ClaimResult> {
  try {
    const supabase = client();
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (!authSession) return { ok: false, reason: 'auth_required' };
    const deviceId = await getDeviceId();
    const { data, error } = await supabase.rpc('claim_referral', {
      p_code: code,
      p_device_id: deviceId,
      p_source: source,
      p_session: session,
    });
    if (error) {
      return { ok: false, reason: error.message?.includes('auth_required') ? 'auth_required' : 'network' };
    }
    if (data?.ok) {
      void refreshEntitlement();
      return {
        ok: true,
        welcomeTier: asTier(data.welcome_tier),
        welcomeDays: typeof data.welcome_days === 'number' ? data.welcome_days : 0,
      };
    }
    return { ok: false, reason: typeof data?.reason === 'string' ? data.reason : 'invalid_code' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

// ── referral_progress ──────────────────────────────────────────────────────

export interface ReferralProgress {
  code: string | null;
  pending: number;
  qualified: number;
  rewarded: number;
  rejected: number;
  rewardDaysEach: number;
  daysEarned: number;
  capPerYear: number;
  capUsed: number;
  milestoneNeeded: number;
  milestoneHave: number;
  milestoneDone: boolean;
}

/** Invite screen data. Null when signed out / unreachable — the screen shows
 *  its sign-in / unavailable state instead of zeros. */
export async function fetchReferralProgress(): Promise<ReferralProgress | null> {
  try {
    const supabase = client();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const { data, error } = await supabase.rpc('referral_progress');
    if (error || !data?.ok) return null;
    const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : 0);
    return {
      code: typeof data.code === 'string' && data.code ? data.code : null,
      pending: num(data.pending),
      qualified: num(data.qualified),
      rewarded: num(data.rewarded),
      rejected: num(data.rejected),
      rewardDaysEach: num(data.reward_days_each),
      daysEarned: num(data.days_earned),
      capPerYear: num(data.cap_per_year),
      capUsed: num(data.cap_used),
      milestoneNeeded: num(data.milestone_needed),
      milestoneHave: num(data.milestone_have),
      milestoneDone: data.milestone_done === true,
    };
  } catch {
    return null;
  }
}

// ── Pending-referral staging ───────────────────────────────────────────────
// A referral can arrive before there's an account (deep link on a fresh
// install, clipboard token, onboarding entry). It waits here; claimStagedReferral
// fires it once signed in. Exactly-once: staging clears on ANY definitive
// server answer (ok or a real rejection — e.g. account_too_old); a transient
// failure keeps it for the next launch/sign-in.
const PENDING_REFERRAL_KEY = 'potraces.pendingReferral';

export async function stagePendingReferral(ref: PendingReferral): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_REFERRAL_KEY, JSON.stringify(ref));
  } catch {
    // best-effort
  }
}

export async function peekPendingReferral(): Promise<PendingReferral | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_REFERRAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingReferral> | null;
    if (!parsed || typeof parsed.code !== 'string' || !parsed.code.trim()) return null;
    return {
      code: parsed.code.trim(),
      source: parsed.source === 'collectz' ? 'collectz' : 'link',
      session: typeof parsed.session === 'string' && parsed.session ? parsed.session : null,
    };
  } catch {
    return null;
  }
}

export async function clearPendingReferral(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_REFERRAL_KEY);
  } catch {
    // best-effort
  }
}

/** Claim whatever referral is staged (deep link / clipboard / onboarding).
 *  Success surfaces a toast; failures stay silent (invalid/self log in dev).
 *  No-op when nothing is staged or there's no session yet. */
export async function claimStagedReferral(): Promise<void> {
  const ref = await peekPendingReferral();
  if (!ref) return;
  const result = await claimReferral(ref);
  if (!result.ok && (result.reason === 'network' || result.reason === 'auth_required')) {
    return; // transient — keep it staged for the next attempt
  }
  await clearPendingReferral();
  if (result.ok) {
    const msg = tr().rewards.claimSuccess
      .replace('{days}', String(result.welcomeDays))
      .replace('{tier}', result.welcomeTier.charAt(0).toUpperCase() + result.welcomeTier.slice(1));
    globalShowToast(msg, 'success');
  } else if (__DEV__ && (result.reason === 'invalid_code' || result.reason === 'self_referral')) {
    console.warn('[referral] staged claim rejected:', result.reason);
  }
}
