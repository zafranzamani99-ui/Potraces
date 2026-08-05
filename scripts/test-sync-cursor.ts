/**
 * Sync cursor tests — personalSyncCursor (pure Stage-3 cursor-pull rules).
 *
 * Locks the contract that makes a cursor pull safe (docs/INCREMENTAL_SYNC_PLAN.md):
 *   - cursorSince: inclusive overlap lower bound; null (= FULL pull) for missing,
 *     unparseable, or >80d-stale watermarks (the periodic reconcile net)
 *   - maxSeenUpdatedAt: newest server stamp across pulled rows; null when empty
 *   - advanceWatermark: takes the NEWER of stored vs seen — never backward,
 *     never from device time; empty cycles keep the stored watermark
 *
 * Pure module only (no RN / store / Supabase). Run: npm run test:synccursor
 */
import {
  CURSOR_OVERLAP_MS,
  FORCE_FULL_AFTER_MS,
  cursorSince,
  maxSeenUpdatedAt,
  advanceWatermark,
} from '../src/services/personalSyncCursor';

const failures: string[] = [];
let passed = 0;
const check = (name: string, cond: boolean) => { if (cond) passed++; else failures.push(name); };

const NOW = Date.parse('2026-08-04T12:00:00.000Z');
const WM = '2026-08-04T10:00:00.000Z'; // 2h before NOW

// ─── cursorSince ─────────────────────────────────────────────────────────────
check('null watermark → full pull', cursorSince(null, NOW) === null);
check('undefined watermark → full pull', cursorSince(undefined, NOW) === null);
check('unparseable watermark → full pull', cursorSince('not-a-date', NOW) === null);

const since = cursorSince(WM, NOW);
check('valid watermark → overlap-adjusted lower bound',
  since === new Date(Date.parse(WM) - CURSOR_OVERLAP_MS).toISOString());
check('overlap is inclusive of the watermark (bound < watermark)',
  !!since && Date.parse(since) < Date.parse(WM));

check('stale watermark (>80d) → full pull (reconcile net)',
  cursorSince(new Date(NOW - FORCE_FULL_AFTER_MS - 1000).toISOString(), NOW) === null);
check('fresh-enough watermark (<80d) → cursor pull',
  cursorSince(new Date(NOW - FORCE_FULL_AFTER_MS + 1000).toISOString(), NOW) !== null);

// ─── maxSeenUpdatedAt ────────────────────────────────────────────────────────
check('empty page set → null', maxSeenUpdatedAt([]) === null);
check('max across rows (incl. out-of-order)',
  maxSeenUpdatedAt([
    { updated_at: '2026-08-04T09:00:00.000Z' },
    { updated_at: '2026-08-04T11:30:00.000Z' },
    { updated_at: '2026-08-04T10:15:00.000Z' },
  ]) === '2026-08-04T11:30:00.000Z');
check('PostgREST microsecond+offset format parses',
  maxSeenUpdatedAt([
    { updated_at: '2026-08-04T09:00:00.123456+00:00' },
    { updated_at: '2026-08-04T09:00:01.000000+00:00' },
  ]) === new Date('2026-08-04T09:00:01.000Z').toISOString());
check('rows without updated_at are skipped',
  maxSeenUpdatedAt([{ updated_at: null }, {} as any, { updated_at: '2026-08-04T09:00:00.000Z' }]) === '2026-08-04T09:00:00.000Z');

// ─── advanceWatermark ────────────────────────────────────────────────────────
check('advances to seen when newer',
  advanceWatermark(WM, '2026-08-04T11:00:00.000Z') === '2026-08-04T11:00:00.000Z');
check('NEVER goes backward (seen older than stored)',
  advanceWatermark(WM, '2026-08-04T09:00:00.000Z') === WM);
check('empty cycle keeps the stored watermark',
  advanceWatermark(WM, null) === WM);
check('no stored → adopts seen (first watermark after a full pull)',
  advanceWatermark(null, '2026-08-04T11:00:00.000Z') === '2026-08-04T11:00:00.000Z');
check('no stored + nothing seen → null',
  advanceWatermark(null, null) === null);
check('unparseable stored is replaced by valid seen',
  advanceWatermark('junk', '2026-08-04T11:00:00.000Z') === '2026-08-04T11:00:00.000Z');
check('monotonic under interleaved cycles',
  advanceWatermark(
    advanceWatermark(WM, '2026-08-04T11:00:00.000Z'),
    '2026-08-04T10:30:00.000Z',
  ) === '2026-08-04T11:00:00.000Z');

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('FAILURES:\n - ' + failures.join('\n - '));
  process.exit(1);
}
