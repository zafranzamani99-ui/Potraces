/**
 * Effective-tier recompute — the pure decision behind premiumStore.tier.
 * Contract: docs/plans/premium-grants-and-rewards.md ("App work"):
 * gate off (beta) → local tier wins bit-for-bit; gate on → higher rank of local
 * vs server, and the server tier only counts while premiumUntil is live.
 * Pure module (type-only import) so tsx can run it.
 * Run: npx tsx scripts/test-entitlement-recompute.ts
 */
import { effectiveTier } from '../src/constants/tiers';

const failures: string[] = [];
let passed = 0;
const check = (name: string, cond: boolean) => { if (cond) passed++; else failures.push(name); };

const now = new Date('2026-07-26T00:00:00Z');
const future = new Date('2026-09-01T00:00:00Z');
const past = new Date('2026-01-01T00:00:00Z');

// ── Gate OFF (open beta): local wins, server fields irrelevant ──
check('gate off: local free + live server premium → free',
  effectiveTier('free', 'premium', future, false, now) === 'free');
check('gate off: local pro + live server premium → pro',
  effectiveTier('pro', 'premium', future, false, now) === 'pro');
check('gate off: local premium + server free → premium',
  effectiveTier('premium', 'free', future, false, now) === 'premium');
check('gate off: local basic + null until → basic',
  effectiveTier('basic', 'pro', null, false, now) === 'basic');

// ── Gate ON: higher rank of local vs server ──
check('gate on: local free + server pro → pro',
  effectiveTier('free', 'pro', future, true, now) === 'pro');
check('gate on: local premium + server basic → premium (local higher)',
  effectiveTier('premium', 'basic', future, true, now) === 'premium');
check('gate on: local basic + server premium → premium (server higher)',
  effectiveTier('basic', 'premium', future, true, now) === 'premium');
check('gate on: local pro + server free → pro',
  effectiveTier('pro', 'free', future, true, now) === 'pro');
check('gate on: equal ranks → same tier',
  effectiveTier('pro', 'pro', future, true, now) === 'pro');

// ── Gate ON: expired / missing server grant is ignored ──
check('gate on: server pro EXPIRED → local free',
  effectiveTier('free', 'pro', past, true, now) === 'free');
check('gate on: server premium EXPIRED, local basic → basic',
  effectiveTier('basic', 'premium', past, true, now) === 'basic');
check('gate on: server pro, until null → local free',
  effectiveTier('free', 'pro', null, true, now) === 'free');
check('gate on: server free, until live → local basic (no phantom downgrade)',
  effectiveTier('basic', 'free', future, true, now) === 'basic');

// ── Boundary + input shapes ──
check('gate on: until == now is NOT live (ends_at > now strictly)',
  effectiveTier('free', 'pro', now, true, now) === 'free');
check('gate on: ISO string until accepted',
  effectiveTier('free', 'pro', future.toISOString(), true, now) === 'pro');
check('gate on: garbage until string treated as no grant',
  effectiveTier('free', 'pro', 'not-a-date', true, now) === 'free');

if (failures.length) { console.error('FAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`entitlement-recompute OK (${passed} checks)`);
process.exit(0);
