# Premium Grants, Redeem Codes & Referral Rewards — Implementation Spec

## ⏩ RESUME HERE (status as of 2026-07-27)

**v1 deployed; v2 (milestone-5 + reward modals) coded, not yet deployed.** If you are a new session picking this up:
1. Read this whole file first — it is the design contract.
2. v1 is LIVE: migration `20260726000000` applied to production (verified via `migration list`), admin Rewards tab + `r.html` live (Vercel), all app code on `main`. Still pending from v1: the smoke script has **never been executed** against the live DB, and no app build carries the entitlements client yet.
3. v2 changes (2026-07-27, owner decisions): Collectz milestone 3 → **5** joins; friend welcome 30d → **15d**; referrer now paid **30d per batch of 3** settled friends (was 30d each); new `seen_at` / `new_rewards` channel in `my_entitlement()` so surprise grants pop a floating success modal exactly once; one-time invite-only intro modal; CollectzHome top-right buttons (how-it-works + reward explainers via RewardModal 'info'). Code: migration `supabase/migrations/20260727000000_rewards_milestone5_seen.sql`, smoke updated (batch-of-3 + 5 joiners + `new_rewards` asserts), `src/context/RewardModalContext.tsx` + `src/components/common/RewardModal.tsx`, i18n keys, App.tsx wiring.
4. Remaining work = the deploy runbook at the bottom of this file, in order: `supabase db push` (applies the v2 migration + sets milestone=5 live), then the smoke script (must end `SMOKE OK`), then the app build.

---

Status: implementation complete, pending deployment. DB layer: `supabase/migrations/20260726000000_premium_grants_and_rewards.sql` (applied = source of truth).
Design discussion origin: redeem codes (admin-minted, plan + duration + expiry, fully customizable), invite-friends rewards, Collectz share rewards — all three are **one primitive**: a row in the server-side grant ledger ("membership book").

## Locked decisions (owner-approved)

| Decision | Value | Where it's tunable |
|---|---|---|
| Beta stays open (no gating) until launch | `premium_gate_on=false` | `app_config` via `admin_set_gate()` |
| Free days never burn during beta | grants start at `premium_gate_start` (default `2026-09-01T00:00:00+08:00`) | same |
| Stacking | sequential per tier — days truly add up; highest active tier wins | fixed in `grant_premium()` |
| Codes for existing store subscribers | allowed, additive | fixed |
| Referral reward | double-sided: referee **15d** instantly; referrer **30d per batch of 3** settled friends (changed from 30d/30d per friend on 2026-07-27) | `reward_welcome_days`, `reward_referrer_days`, `reward_referrer_batch_count`, `reward_tier` |
| Referrer cap | 12 batch payouts / rolling 365d | `reward_cap_per_year` |
| Qualification | verified email + account ≥7d + ≥3 distinct active days (server-tracked) | `qualify_*` |
| Claim window | account age < 14d (stops cross-entry farming between existing users) | `claim_window_days` |
| Collectz | milestone-first: 5 qualified collectz-sourced joins → one-time 30d (raised from 3 on 2026-07-27) | `milestone_collectz_*` |
| Redeem brute-force guard | 5 failed attempts / 15 min → locked out | `redeem_max_attempts`, `redeem_attempt_window_min` |
| Codes are NEVER sold | free grants only (App Store 3.1.1) | policy, not code |

## Architecture

```
admin.html ──rpc──> admin_create_redeem_codes / admin_set_gate / admin_referral_funnel ...
app ────────rpc──> redeem_code(code) · claim_referral(code, device, source, session)
app ────────rpc──> my_entitlement(device)   ← one call per launch: activity ping + lazy qualify + state
app ────────rpc──> referral_progress()      ← Invite screen
                    │
                    ▼
        entitlement_grants (ledger; grant_premium() is the only writer)
```

- `my_entitlement()` returns `{ok, server_time, gate_on, gate_start, tier, premium_until, new_rewards}`.
  **`gate_on=false` → client behaves exactly as today (beta).** Grants still accrue.
  `new_rewards` (added 2026-07-27): unseen surprise grants (`referral_reward`, `collectz_milestone`,
  `admin_manual`, `beta_promise`), collected and marked `seen_at` in the same call — the app pops its
  floating reward modal exactly once per grant. Self-initiated grants (welcome, redeem, iap) are born
  seen so they never double-message.
- `_lazy_qualify()` runs inside `my_entitlement()`: qualifies the caller's own pending referral
  (pays the referrer every time their settled-friend count completes a batch of
  `reward_referrer_batch_count`), and pays the caller's Collectz milestone when reached. No cron.
- Codes are stored canonical uppercase-no-dashes (`BETA7K4Q9M2X`); display grouped `BETA-7K4Q-9M2X`.
  Input normalized server-side: strip non-alnum, uppercase.

## RPC contracts

### `redeem_code(p_code text) → json`
- `{ok:true, tier, days, premium_until}`
- `{ok:false, reason}` — `invalid_code` (generic, unknown codes), `code_disabled`, `code_expired`,
  `code_exhausted`, `already_redeemed`, `campaign_already_used` (one code per user per campaign), `rate_limited`.
- Raises `auth_required` (28000) when signed out.

### `claim_referral(p_code text, p_device_id text, p_source text, p_session text) → json`
- `p_source`: `'link' | 'collectz'`; `p_session`: collectz share_code when source=collectz, else null.
- `{ok:true, welcome_tier, welcome_days}`
- Reasons: `invalid_code`, `self_referral`, `same_device`, `already_referred`, `account_too_old`.

### `my_entitlement(p_device_id text) → json` — see above.
### `referral_progress() → json`
`{ok, code, pending, qualified, rewarded, rejected, welcome_days, reward_days_each, batch_size, batch_progress, days_earned, cap_per_year, cap_used, milestone_needed, milestone_have, milestone_done, milestone_days}`

### Admin (all raise 42501 unless `is_admin()`)
- `admin_create_redeem_codes(tier, days, count, campaign, max_uses, expires_at, note) → {ok, campaign, codes[]}`
- `admin_list_redeem_codes(campaign|null) → [{code, campaign, tier, days, max_uses, use_count, expires_at, disabled_at, created_by, note, created_at, status}]` status ∈ live/disabled/expired/exhausted
- `admin_list_redemptions(code) → [{user_id, email, redeemed_at, grant_id}]`
- `admin_set_redeem_code_disabled(code, disabled) → {ok}`
- `admin_grant_premium(user_id, tier, days, note) → {ok, grant_id}` (manual award, no code)
- `admin_revoke_grant(grant_id) → {ok}`
- `admin_set_gate(gate_on|null, gate_start|null) → {ok, gate_on, gate_start}`
- `admin_referral_funnel() → {ok, totals:{...}, referrers:[...]}`

## App work (RN / Expo SDK 54)

Contract for the effective tier — **zero changes at the ~32 gate call sites**:
`premiumStore` keeps `tier` as the *effective* value but adds `localTier` (what local unlock / future
RevenueCat says), `serverTier`, `premiumUntil`, `gateOn`. One internal `recompute()`:
- `gateOn=false` → `tier = localTier` (beta unchanged)
- `gateOn=true` → `tier = highestRank(localTier, serverTier-if-premiumUntil>now)`
`setTier()` (billing/local unlock) sets `localTier`; `reconcileEntitlement()` sets server fields.
Both call `recompute()` and run `enforceBackupEntitlement(prev, next)` on effective transitions.
Persist the new fields; rehydrate legacy `tier` → `localTier`. Export a pure
`effectiveTier(local, serverTier, until, gateOn)` helper for the tsx test script.

Pieces:
1. `src/services/entitlements.ts` (new) — `refreshEntitlement()`, `redeemCode()`, `claimReferral()`,
   `fetchReferralProgress()`. Fail-soft: transient errors never downgrade the user.
2. `App.tsx` — call `refreshEntitlement()` on startup + SIGNED_IN + app foreground; on SIGNED_OUT reset
   server fields. Deep-link parsing (existing manual parser ~App.tsx:497): accept `?r=CODE` on
   `/collectz/{code}` links and new `/r/{CODE}` universal links; stage `{code, source, session}` in
   AsyncStorage (`potraces.pendingReferral`), claim after auth. Boot: read clipboard once
   (expo-clipboard, already a dep) for token `POTRACES-REF:CODE` or `POTRACES-REF:CODE:collectz:SHARE`
   → stage it, show a confirm prompt (never auto-claim silently).
3. Onboarding (`src/screens/shared/Onboarding.tsx`) — skippable "Have an invite code?" step; prefill
   from staged referral; claims via `claim_referral` (server enforces the 14-day window).
4. Settings — two additions: **Redeem code** (input → `redeem_code`, success alert shows tier/days/
   until; map reason codes to friendly EN+BM copy) and **Invite friends** screen (progress from
   `referral_progress()`, share via existing `src/services/referrals.ts`, "enter a code" for eligible
   new accounts, milestone progress line).
5. `src/services/collectzService.ts` — share URL builders append `?r={code}` (reuse
   `getOrCreateReferralCode()`; the collectz deep-link/Open-in-app flow then carries it).
6. `src/types/index.ts` — extend `PremiumState`; i18n `en.ts`/`ms.ts` new `rewards`/`redeem` keys.
7. `scripts/test-entitlement-recompute.ts` — pure-logic test, run with tsx like other scripts/test-*.

## Admin page work (`site/admin.html` — one new tab "Rewards")

Follow the existing tab pattern (Beta feedback / Waitlist / Broadcast), same Supabase client, gate
already handled by `is_admin()`. All data via the admin RPCs above (no direct table access).

- **Create codes**: tier select, days, count, campaign prefix, max uses, expiry datetime-local, note.
  On success show generated codes grouped (`BETA-7K4Q-9M2X`), copy-all + CSV download.
- **Codes table**: code (grouped, click-to-copy), campaign, tier, days, uses/max, expiry, status badge
  (live/disabled/expired/exhausted), created_by, note; actions: disable/enable, view redemptions
  (modal listing user emails + timestamps).
- **Gate card**: current gate_on + gate_start; set date; flip on with a confirm dialog warning that
  it's the launch switch and grants' starts are already baked.
- **Referral funnel**: totals strip + per-referrer table from `admin_referral_funnel()`.

## Site work

- `site/r.html` (new) — invite landing for `/r/{CODE}` (path via vercel rewrite, `?c=` fallback):
  "A friend invited you to Potraces", big code + copy, Get-the-app CTA → `/beta.html`; on CTA tap copy
  clipboard token `POTRACES-REF:{CODE}`; bilingual EN/BM, `noindex`, per-page CSP like other pages.
- `vercel.json` — add rewrite `/r/:path*` → `/r.html`.
- `site/collectz.html` — preserve `?r=CODE`: append to the `potraces://collectz/{SHARE}` and universal
  links; on "Get the app"/"Open in app" CTA tap copy token `POTRACES-REF:{CODE}:collectz:{SHARE}`.
- `site/privacy.html` — one disclosure line: clipboard is read once at launch, only to detect an
  invite token; install referrer may be used on Android later.

## Fraud guards (shipped)

Rate-limited redemption + unguessable codes; one redemption per user per campaign; one referral per
referred account ever; new-accounts-only claiming; same-device rejection (`referral_account_signals`,
device id already sent as `x-device-id`); qualification delay (verified + age + 3 active days);
yearly referrer cap; one-time milestone (partial unique index); admin funnel for eyeballing abuse.
No clawbacks. No IP tracking (PDPA).

## Deferred (documented, not built)

Waitlist→app code bridge (`pending_referrals`, `claim_waitlist_code` — see
`docs/research/referral-install-rewards-plan.md` D1/D4); Play Install Referrer (only works for Play
Store installs — add at Play launch); `ip_hash`; RevenueCat webhook writing `source='iap'` grants;
batch grant for the beta-installers 1-month promise (`source='beta_promise'` reserved).

## Deploy & launch runbook

1. `supabase db push` (applies the migration) — then run `supabase/smoke/20260726_grants_smoke.sql`.
2. Site deploys automatically via Vercel on merge (admin.html, r.html, collectz.html, vercel.json).
3. App: new build (TestFlight / APK) with the entitlements client.
4. Launch day: admin page → Rewards tab → set `premium_gate_on=true` (and fix `premium_gate_start` if
   the date moved — move it BEFORE flipping on; existing grants keep their baked start dates).
