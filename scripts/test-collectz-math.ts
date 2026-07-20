/**
 * Unit test for collectzMath — the share/progress math behind Collectz.
 * Locks the rules that must hold for real money:
 *   • equal splits are cent-exact — shares always sum back to the total
 *   • remainder cents go to the earliest roster entries (matches the
 *     effectiveShares() mirror in supabase/functions/collectz-join)
 *   • reserves never pay and never count toward the divisor
 *   • custom amounts win over the scheme default (the RM45/team-leader case)
 *   • custom-with-any-null means the target total is unknown (null), never NaN
 *
 * Run:  npx tsx scripts/test-collectz-math.ts
 */
import { computeShares, computeProgress, CollectzShareRow } from '../src/services/collectzMath';

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`  ${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failures++;
}
function close(label: string, actual: number | null, expected: number | null, eps = 0.005) {
  const ok = actual === null || expected === null ? actual === expected : Math.abs(actual - expected) <= eps;
  console.log(`  ${ok ? '✓' : '✗'} ${label} (≈ ${expected})`);
  if (!ok) { console.log(`      got: ${actual}`); failures++; }
}

const p = (id: string, slot: 'active' | 'reserve' = 'active', share: number | null = null, status = 'unpaid'): CollectzShareRow =>
  ({ id, slot, share_amount: share, status });

// ── equal: RM180 ÷ 3 — the cent-remainder case ─────────────────────────────
console.log('\nequal split, RM180 / 3');
{
  const session = { scheme: 'equal' as const, total_amount: 180, default_share: null };
  const roster = [p('a'), p('b'), p('c')];
  const shares = computeShares(session, roster);
  const vals = roster.map((r) => shares.get(r.id)!);
  const sum = vals.reduce((a, b) => a + b, 0);
  close('sum equals total', sum, 180);
  close('first entry gets the remainder cent', vals[0], 60.0);
  check('all three equal when it divides cleanly', vals.every((v) => v === 60));
}

// ── equal: RM100 ÷ 3 — 33.34 / 33.33 / 33.33 ───────────────────────────────
console.log('\nequal split, RM100 / 3');
{
  const session = { scheme: 'equal' as const, total_amount: 100, default_share: null };
  const roster = [p('a'), p('b'), p('c')];
  const shares = computeShares(session, roster);
  const vals = roster.map((r) => shares.get(r.id)!);
  close('sum equals total', vals.reduce((a, b) => a + b, 0), 100);
  close('a gets 33.34', vals[0], 33.34);
  close('b gets 33.33', vals[1], 33.33);
  close('c gets 33.33', vals[2], 33.33);
}

// ── equal with reserves: RM180 ÷ 20 actives (the futsal case) ──────────────
console.log('\nequal split, reserves excluded');
{
  const session = { scheme: 'equal' as const, total_amount: 180, default_share: null };
  const roster = [...Array.from({ length: 20 }, (_, i) => p(`p${i}`)), p('res1', 'reserve'), p('res2', 'reserve')];
  const shares = computeShares(session, roster);
  close('each active pays 9.00', shares.get('p0')!, 9);
  check('reserves are not in the map', !shares.has('res1') && !shares.has('res2'));
  close('sum over actives equals total', [...shares.values()].reduce((a, b) => a! + b!, 0)!, 180);
}

// ── flat: RM17/player (the badminton case) ──────────────────────────────────
console.log('\nflat per-person');
{
  const session = { scheme: 'flat' as const, total_amount: null, default_share: 17 };
  const roster = [p('a'), p('b'), p('w', 'reserve')];
  const shares = computeShares(session, roster);
  close('a pays 17', shares.get('a')!, 17);
  check('reserve excluded', !shares.has('w'));
  const prog = computeProgress(session, roster);
  close('target is 2 × 17', prog.target, 34);
}

// ── custom: per-team via leader (RM45 leader, RM0 members) ──────────────────
console.log('\ncustom per-person amounts (team-leader case)');
{
  const session = { scheme: 'custom' as const, total_amount: 180, default_share: null };
  const roster = [
    p('leader1', 'active', 45), p('m1', 'active', 0), p('m2', 'active', 0),
    p('leader2', 'active', 45), p('m3', 'active', 0),
  ];
  const shares = computeShares(session, roster);
  close('leader pays 45', shares.get('leader1')!, 45);
  close('member pays 0', shares.get('m1')!, 0);
  const prog = computeProgress(session, roster);
  close('target sums custom amounts', prog.target, 90);
}

// ── progress: confirmed vs target ───────────────────────────────────────────
console.log('\nprogress rollup');
{
  const session = { scheme: 'flat' as const, total_amount: null, default_share: 17 };
  const roster = [p('a', 'active', null, 'confirmed'), p('b', 'active', null, 'pending'), p('c', 'active', null, 'unpaid')];
  const prog = computeProgress(session, roster);
  check('counts actives', prog.activeCount === 3);
  check('counts confirmed', prog.confirmedCount === 1);
  close('confirmed amount', prog.confirmed, 17);
  close('target', prog.target, 51);
}

// ── edge cases ──────────────────────────────────────────────────────────────
console.log('\nedge cases');
{
  const noAmounts = { scheme: 'custom' as const, total_amount: null, default_share: null };
  const prog = computeProgress(noAmounts, [p('a'), p('b')]);
  check('custom with null amounts → target null, not NaN', prog.target === null);
  check('empty roster → zeroes', computeProgress(noAmounts, []).activeCount === 0);
  const noTotal = computeShares({ scheme: 'equal', total_amount: null, default_share: null }, [p('a')]);
  check('equal without total → null share', noTotal.get('a') === null);
}

// ── share-lock: a locked (explicit) share survives roster edits ─────────────
console.log('\nshare-lock (confirm-time freeze)');
{
  const session = { scheme: 'equal' as const, total_amount: 100, default_share: null };
  const before = [p('a'), p('b'), p('c')];
  const sharesBefore = computeShares(session, before);
  // Simulate confirmParticipant's lock: 'a' confirmed → share_amount written
  const lockedA = sharesBefore.get('a')!; // 33.34
  // Later the organizer removes 'c' — the equal split recomputes for b…
  const after = [p('a', 'active', lockedA, 'confirmed'), p('b')];
  const sharesAfter = computeShares(session, after);
  close('locked share unchanged after removal', sharesAfter.get('a')!, lockedA);
  check('recomputed share differs (only unlocked rows move)', sharesAfter.get('b')! !== sharesBefore.get('b')!);
  // Progress with the locked row must not double-count or drift
  const prog = computeProgress(session, after);
  close('confirmed sum uses the locked share', prog.confirmed, lockedA);
}

console.log(failures === 0 ? '\nAll collectz math checks passed ✓' : `\n${failures} check(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
