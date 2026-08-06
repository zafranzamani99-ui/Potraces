/**
 * Entitlement merge — the server-wins lock behind premiumStore.tier.
 * Contract: src/services/entitlementPolicy.ts header (the five rules):
 * server overrides local for signed-in users once the gate is on; fail-open on
 * the cached snapshot (+ grace past expiry) when unreachable; gate off /
 * signed out / never verified → local behavior unchanged.
 * Pure module (type-only imports) so tsx can run it.
 * Run: npx tsx scripts/test-entitlement-merge.ts
 */
import {
  resolveEffectiveTier,
  parseServerEntitlement,
  EXPIRED_SNAPSHOT_GRACE_MS,
  type ServerEntitlementSnapshot,
} from '../src/services/entitlementPolicy';

const failures: string[] = [];
let passed = 0;
const check = (name: string, cond: boolean) => { if (cond) passed++; else failures.push(name); };

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const now = new Date('2026-08-06T00:00:00Z');
const future = new Date(now.getTime() + 30 * DAY);

/** Snapshot factory — defaults: gate ON, definitive answer at `now`, no entitlement. */
const mk = (over: Partial<ServerEntitlementSnapshot>): ServerEntitlementSnapshot => ({
  tier: 'free',
  source: 'none',
  expiresAt: null,
  gateOn: true,
  fetchedAt: now,
  ...over,
});

check('grace constant is 7 days', EXPIRED_SNAPSHOT_GRACE_MS === 7 * DAY);

// ── 1. THE LOCK: server overrides local (gate ON, definitive answer) ──
check('server free beats a flipped local premium → free',
  resolveEffectiveTier('premium', mk({}), now) === 'free');
check('server free beats local basic → free',
  resolveEffectiveTier('basic', mk({}), now) === 'free');
check('live server pro raises local free → pro',
  resolveEffectiveTier('free', mk({ tier: 'pro', source: 'grant', expiresAt: future }), now) === 'pro');
check('live server pro beats a HIGHER local premium → pro (server is truth, both ways)',
  resolveEffectiveTier('premium', mk({ tier: 'pro', source: 'grant', expiresAt: future }), now) === 'pro');
check('explicit source none beats local pro → free',
  resolveEffectiveTier('pro', mk({ tier: 'free', source: 'none' }), now) === 'free');
check('cached server free still enforced 90 days later (offline-forever keeps the lock)',
  resolveEffectiveTier('premium', mk({ fetchedAt: new Date(now.getTime() - 90 * DAY) }), now) === 'free');

// ── 2. FAIL-OPEN: beta / never verified / no snapshot → local tier ──
check('gate OFF: local premium stands with a server-free snapshot (dev unlock works)',
  resolveEffectiveTier('premium', mk({ gateOn: false }), now) === 'premium');
check('gate OFF: local free with a live server grant → free (beta unchanged, grants wait for launch)',
  resolveEffectiveTier('free', mk({ gateOn: false, tier: 'pro', source: 'grant', expiresAt: future }), now) === 'free');
check('null snapshot (signed-out shape) → local premium unchanged',
  resolveEffectiveTier('premium', null, now) === 'premium');
check('fetchedAt null (never verified) → local pro stands',
  resolveEffectiveTier('pro', mk({ fetchedAt: null }), now) === 'pro');
check('garbage fetchedAt → treated as never verified → local pro stands',
  resolveEffectiveTier('pro', mk({ fetchedAt: 'not-a-date' }), now) === 'pro');

// ── 3. CACHED PAID SNAPSHOT: live, grace, genuinely expired ──
const paidPro = mk({ tier: 'pro', source: 'grant', expiresAt: new Date(now.getTime() - HOUR) });
check('expired 1h ago, unreachable → still honored (inside grace)',
  resolveEffectiveTier('free', paidPro, now) === 'pro');
check('expiry == now is NOT live, but grace covers it',
  resolveEffectiveTier('free', mk({ tier: 'pro', source: 'grant', expiresAt: now }), now) === 'pro');
check('expired grace-1h ago → still honored',
  resolveEffectiveTier('free', mk({ tier: 'pro', source: 'grant', expiresAt: new Date(now.getTime() - EXPIRED_SNAPSHOT_GRACE_MS + HOUR) }), now) === 'pro');
check('expired grace+1h ago → genuinely over → free',
  resolveEffectiveTier('free', mk({ tier: 'pro', source: 'grant', expiresAt: new Date(now.getTime() - EXPIRED_SNAPSHOT_GRACE_MS - HOUR) }), now) === 'free');
check('expired far past grace, local premium flipped → free (lock holds)',
  resolveEffectiveTier('premium', mk({ tier: 'pro', source: 'grant', expiresAt: new Date(now.getTime() - 30 * DAY) }), now) === 'free');
check('paid with null expiry (lifetime purchase seam) → honored',
  resolveEffectiveTier('free', mk({ tier: 'premium', source: 'purchase', expiresAt: null }), now) === 'premium');
check('paid with garbage expiry → honored (fail-open on malformed cache)',
  resolveEffectiveTier('free', mk({ tier: 'pro', source: 'grant', expiresAt: 'junk' }), now) === 'pro');
check('ISO string expiry accepted (post-rehydrate shape)',
  resolveEffectiveTier('free', mk({ tier: 'basic', source: 'grant', expiresAt: future.toISOString() }), now) === 'basic');
check('purchase source merges like a grant',
  resolveEffectiveTier('free', mk({ tier: 'premium', source: 'purchase', expiresAt: future }), now) === 'premium');

// ── 4. parseServerEntitlement: validation + normalization ──
const rx = new Date('2026-08-06T01:00:00Z');

const edge = parseServerEntitlement(
  { ok: true, tier: 'pro', source: 'grant', expiresAt: future.toISOString(), gateOn: true, serverTime: 'x' }, rx);
check('edge payload parses: tier/source/expiry/gate/receive-time',
  !!edge && edge.tier === 'pro' && edge.source === 'grant' && edge.gateOn === true
  && edge.expiresAt?.getTime() === future.getTime() && edge.fetchedAt === rx);

const rpc = parseServerEntitlement(
  { ok: true, tier: 'pro', premium_until: future.toISOString(), gate_on: true }, rx);
check('my_entitlement RPC shape parses: snake_case, source derived grant',
  !!rpc && rpc.tier === 'pro' && rpc.source === 'grant' && rpc.gateOn === true
  && rpc.expiresAt?.getTime() === future.getTime());

const free = parseServerEntitlement({ ok: true, tier: 'free', premium_until: null, gate_on: false }, rx);
check('free RPC payload normalizes to none/no-expiry',
  !!free && free.tier === 'free' && free.source === 'none' && free.expiresAt === null && free.gateOn === false);

check('ok:false rejected', parseServerEntitlement({ ok: false, tier: 'pro' }, rx) === null);
check('ok missing rejected', parseServerEntitlement({ tier: 'pro' }, rx) === null);
check('unknown tier rejected', parseServerEntitlement({ ok: true, tier: 'diamond' }, rx) === null);
check('garbage expiry on a PAID tier rejected (transient → keep cache)',
  parseServerEntitlement({ ok: true, tier: 'pro', source: 'grant', expiresAt: 'junk', gateOn: true }, rx) === null);
check('non-object rejected', parseServerEntitlement('nope', rx) === null);
check('null rejected', parseServerEntitlement(null, rx) === null);
check('contradiction tier=free + source=purchase normalizes to free/none',
  (() => { const p = parseServerEntitlement({ ok: true, tier: 'free', source: 'purchase', expiresAt: future.toISOString() }, rx);
    return !!p && p.tier === 'free' && p.source === 'none' && p.expiresAt === null; })());
check('contradiction tier=pro + source=none normalizes to free/none',
  (() => { const p = parseServerEntitlement({ ok: true, tier: 'pro', source: 'none', expiresAt: future.toISOString() }, rx);
    return !!p && p.tier === 'free' && p.source === 'none' && p.expiresAt === null; })());

// ── 5. Round-trip: wire response → snapshot → effective tier ──
check('round-trip: parsed live grant snapshot resolves pro for a free device',
  (() => { const p = parseServerEntitlement({ ok: true, tier: 'pro', source: 'grant', expiresAt: future.toISOString(), gateOn: true }, rx);
    return !!p && resolveEffectiveTier('free', { tier: p.tier, source: p.source, expiresAt: p.expiresAt, gateOn: p.gateOn, fetchedAt: p.fetchedAt }, now) === 'pro'; })());
check('round-trip: parsed free snapshot locks a flipped local premium',
  (() => { const p = parseServerEntitlement({ ok: true, tier: 'free', source: 'none', expiresAt: null, gateOn: true }, rx);
    return !!p && resolveEffectiveTier('premium', { tier: p.tier, source: p.source, expiresAt: p.expiresAt, gateOn: p.gateOn, fetchedAt: p.fetchedAt }, now) === 'free'; })());

if (failures.length) { console.error('FAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`entitlement-merge OK (${passed} checks)`);
process.exit(0);
