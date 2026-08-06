// Share & Earn Pro — client for the social-post reward engine.
// Spec: AUGUST.md "Earn Pro hub + Share & Earn Pro reward"; rules source of
// truth: src/utils/shareRewardRules.ts; backend: migration
// 20260806110000_share_reward_submissions.sql + the share-reward-submit edge
// function. Review is manual (admin Rewards tab); approval grants through the
// shared entitlement ledger, so the reward pops the same RewardModal as
// referral/milestone grants on the next launch.
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { clientForMode } from './supabase';
import { useAppStore } from '../store/appStore';
import {
  validatePostUrl,
  type SharePlatform,
  type ShareRewardTier,
} from '../utils/shareRewardRules';

export type { SharePlatform, ShareRewardTier };

const PROOFS_BUCKET = 'share-reward-proofs';

// Same client discipline as entitlements.ts — rewards belong to the account
// the user is currently acting as.
const client = () => clientForMode(useAppStore.getState().mode);

// ── submit ─────────────────────────────────────────────────────────────────

export type ShareSubmitResult =
  | { ok: true }
  | { ok: false; reason: string };

/** Submit a post for review. Local validation first (same rules as the edge
 *  function), then a best-effort proof-screenshot upload, then the function
 *  call. Reasons map 1:1 to t.shareEarn.reason_*: invalid_url /
 *  wrong_platform / already_submitted / account_too_new / year_cap_reached /
 *  auth_required / network. A failed screenshot upload never blocks the
 *  submission (it is optional proof). */
export async function submitShareReward(input: {
  platform: SharePlatform;
  postUrl: string;
  screenshotUri?: string | null;
}): Promise<ShareSubmitResult> {
  const verdict = validatePostUrl(input.platform, input.postUrl);
  if (!verdict.ok) return { ok: false, reason: verdict.reason };

  try {
    const supabase = client();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { ok: false, reason: 'auth_required' };

    // Optional proof screenshot (compressed JPEG under "<uid>/", mirroring
    // the beta-feedback upload). Best-effort: the post URL is the valuable part.
    let screenshotPath: string | null = null;
    if (input.screenshotUri) {
      try {
        const jpg = await manipulateAsync(input.screenshotUri, [{ resize: { width: 1280 } }], {
          format: SaveFormat.JPEG,
          compress: 0.7,
        });
        const path = `${session.user.id}/share-${Date.now()}.jpg`;
        const formData = new FormData();
        formData.append('', { uri: jpg.uri, name: 'proof.jpg', type: 'image/jpeg' } as any);
        const { error: upErr } = await supabase.storage
          .from(PROOFS_BUCKET)
          .upload(path, formData, { upsert: true, contentType: 'multipart/form-data' });
        if (!upErr) screenshotPath = path;
      } catch {
        // upload failed — submit without proof
      }
    }

    const { data, error } = await supabase.functions.invoke('share-reward-submit', {
      body: { platform: input.platform, post_url: input.postUrl.trim(), screenshot_path: screenshotPath },
    });
    if (error) {
      // Domain failures come back as non-2xx, so supabase-js hands us a
      // FunctionsHttpError whose message is only "non-2xx status code" — the
      // real reason is in the response body (same pattern as collectzService).
      let reason: string | null = null;
      const ctx = (error as { context?: { status?: number; json?: () => Promise<unknown> } }).context;
      if (ctx?.json) {
        try {
          const parsed = (await ctx.json()) as { reason?: string } | null;
          if (parsed && typeof parsed.reason === 'string') reason = parsed.reason;
        } catch {
          // body not JSON / already consumed
        }
      }
      // No body reason: a gateway-level 401/403 (expired token) means sign-in.
      if (!reason && (ctx?.status === 401 || ctx?.status === 403)) reason = 'auth_required';
      return { ok: false, reason: reason ?? 'network' };
    }
    if (data?.ok) return { ok: true };
    return { ok: false, reason: typeof data?.reason === 'string' ? data.reason : 'network' };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

// ── my submissions ─────────────────────────────────────────────────────────

export interface MyShareReward {
  id: string;
  platform: SharePlatform;
  post_url: string;
  status: 'pending' | 'approved' | 'rejected';
  awarded_tier: ShareRewardTier | null;
  awarded_days: number | null;
  created_at: string;
}

/** The signed-in user's own submissions (owner-read RLS), newest first.
 *  Null when signed out / unreachable — the pane shows its sign-in /
 *  unavailable state instead of zeros. */
export async function fetchMyShareRewards(): Promise<MyShareReward[] | null> {
  try {
    const supabase = client();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const { data, error } = await supabase
      .from('share_reward_submissions')
      .select('id, platform, post_url, status, awarded_tier, awarded_days, created_at')
      .order('created_at', { ascending: false });
    if (error) return null;
    return (data ?? []) as MyShareReward[];
  } catch {
    return null;
  }
}
