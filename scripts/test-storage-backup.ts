/**
 * Storage-backup core tests — storageBackupCore (pure backup rules).
 *
 * Covers the file-based backup engine's decision logic:
 *   - backup file naming round-trip (+ rejection of .tmp / garbage names)
 *   - looksHealthy / countRecords blob gates
 *   - planRotation GFS-lite retention (7 daily + 4 weekly + 3 monthly, exact sets)
 *   - planPrerestorePrune (newest KEEP_PRERESTORE only)
 *   - classifyOwner identity matrix (incl. the local→account trap fix)
 *   - compareVersions / isTooNew (newer-app restore hard-block)
 *   - validateBackupPayload / parseBackupPayload structural validation
 *
 * Pure module only (no RN / AsyncStorage / expo-file-system). Run: npm run test:backup
 */
import {
  BACKUP_VERSION,
  KEEP_DAILY,
  KEEP_MONTHLY,
  KEEP_PRERESTORE,
  KEEP_WEEKLY,
  backupFileName,
  classifyOwner,
  compareVersions,
  countRecords,
  isTooNew,
  looksHealthy,
  parseBackupFileName,
  parseBackupPayload,
  planPrerestorePrune,
  planRotation,
  validateBackupPayload,
  type BackupFilePayload,
} from '../src/services/storageBackupCore';

const failures: string[] = [];
let passed = 0;
const check = (name: string, cond: boolean) => { if (cond) passed++; else failures.push(name); };

const setEq = (a: Set<string>, b: string[]) =>
  a.size === b.length && b.every((x) => a.has(x));

// Consecutive day-stamps from start..end inclusive (UTC arithmetic, formatting-only).
function dayRange(start: string, end: string): string[] {
  const out: string[] = [];
  let t = Date.parse(`${start}T00:00:00Z`);
  const stop = Date.parse(`${end}T00:00:00Z`);
  while (t <= stop) {
    out.push(new Date(t).toISOString().slice(0, 10));
    t += 24 * 3600 * 1000;
  }
  return out;
}

// ─── File naming ─────────────────────────────────────────────────────────────
check('name round-trip daily', parseBackupFileName(backupFileName('2026-08-04'))?.stamp === '2026-08-04');
check('name round-trip daily kind', parseBackupFileName(backupFileName('2026-08-04'))?.kind === 'daily');
check('name round-trip prerestore', parseBackupFileName(backupFileName('2026-08-04', 'prerestore'))?.kind === 'prerestore');
check('name rejects .tmp', parseBackupFileName('backup-2026-08-04.json.gz.tmp') === null);
check('name rejects garbage', parseBackupFileName('notes.txt') === null);
check('name rejects bad date', parseBackupFileName('backup-2026-8-4.json.gz') === null);
check('name rejects export-suffix', parseBackupFileName('potraces-backup-2026-08-04.json.gz') === null);

// ─── Blob gates ──────────────────────────────────────────────────────────────
const goodBlob = JSON.stringify({ state: { transactions: [{ id: 'a' }, { id: 'b' }], budgets: [{ id: 'c' }] }, version: 0 });
check('healthy blob', looksHealthy(goodBlob));
check('unhealthy null', !looksHealthy(null));
check('unhealthy short', !looksHealthy('{}'));
check('unhealthy non-json', !looksHealthy('not json at all, really'));
check('unhealthy scalar', !looksHealthy('12345678901234567890123'));
check('countRecords sums top-level arrays', countRecords(goodBlob) === 3);
check('countRecords missing state', countRecords(JSON.stringify({ version: 0 })) === 0);
check('countRecords garbage', countRecords('nope') === 0);

// ─── Rotation ────────────────────────────────────────────────────────────────
check('rotation keeps everything ≤7 days', setEq(planRotation(dayRange('2026-08-01', '2026-08-05')), dayRange('2026-08-01', '2026-08-05')));

// 10 consecutive days: everything is kept — 7 daily, then the weekly tier takes
// each older week-bucket's earliest (08-03, 08-01), and the monthly tier scoops
// up the one remainder (08-02, earliest of August among what's left). Tiers fill
// from the remainder of the tier above, so sparse history is kept whole.
check(
  'rotation 10 days keeps all (daily + weekly + monthly cascade)',
  setEq(planRotation(dayRange('2026-08-01', '2026-08-10')), dayRange('2026-08-01', '2026-08-10')),
);

// 65 days across 3 months: exact GFS-lite set (weekday math: 2026-08-04 = Tuesday).
check(
  'rotation 65 days = 7 daily + 4 weekly + 2 monthly',
  setEq(planRotation(dayRange('2026-06-01', '2026-08-04')), [
    '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04',
    '2026-07-27', '2026-07-20', '2026-07-13', '2026-07-06', // earliest day of each of the 4 prior weeks
    '2026-07-01', '2026-06-01', // earliest remaining day of July + June
  ]),
);

const rotated = planRotation(dayRange('2026-01-01', '2026-08-04'));
check('rotation never exceeds 7+4+3', rotated.size <= KEEP_DAILY + KEEP_WEEKLY + KEEP_MONTHLY);
check('rotation dedupes input', planRotation(['2026-08-01', '2026-08-01', '2026-08-02']).size === 2);
check('rotation keeps newest day', rotated.has('2026-08-04'));

// ─── Prerestore pruning ──────────────────────────────────────────────────────
check('prerestore keeps newest 2', setEq(planPrerestorePrune(['2026-08-01', '2026-08-04', '2026-08-03', '2026-08-02']), ['2026-08-04', '2026-08-03']));
check('prerestore under limit keeps all', setEq(planPrerestorePrune(['2026-08-01']), ['2026-08-01']));
check('prerestore limit constant sane', KEEP_PRERESTORE >= 1 && KEEP_PRERESTORE <= 3);

// ─── Ownership ───────────────────────────────────────────────────────────────
check('owner null → legacy', classifyOwner(null, 'u1') === 'legacy');
check('owner empty → legacy', classifyOwner('', 'u1') === 'legacy');
check('owner same account', classifyOwner('u1', 'u1') === 'same');
check('owner local==local', classifyOwner('local', 'local') === 'same');
check('owner local→account allowed-with-warning', classifyOwner('local', 'u1') === 'local-to-account');
check('owner different account blocked', classifyOwner('u2', 'u1') === 'mismatch');
check('owner account→signed-out blocked', classifyOwner('u1', 'local') === 'mismatch');

// ─── Version guards ──────────────────────────────────────────────────────────
check('compareVersions numeric segments', compareVersions('1.2.0', '1.10.0') === -1);
check('compareVersions equal', compareVersions('1.2.0', '1.2.0') === 0);
check('compareVersions newer', compareVersions('2.0', '1.9.9') === 1);
check('compareVersions unparsable → 0', compareVersions('abc', '1.0.0') === 0);
check('tooNew backupVersion bump', isTooNew({ backupVersion: BACKUP_VERSION + 1, appVersion: null }, null));
check('tooNew newer app', isTooNew({ backupVersion: BACKUP_VERSION, appVersion: '2.0.0' }, '1.5.0'));
check('not tooNew older app', !isTooNew({ backupVersion: BACKUP_VERSION, appVersion: '1.0.0' }, '1.5.0'));
check('not tooNew same app', !isTooNew({ backupVersion: BACKUP_VERSION, appVersion: '1.5.0' }, '1.5.0'));
check('not tooNew unknown versions (legacy fail-open)', !isTooNew({ backupVersion: BACKUP_VERSION, appVersion: null }, null));

// ─── Payload validation ──────────────────────────────────────────────────────
const goodPayload: BackupFilePayload = {
  backupVersion: BACKUP_VERSION,
  kind: 'daily',
  appVersion: '1.0.0',
  userId: 'u1',
  createdAt: '2026-08-04T01:02:03.000Z',
  recordCounts: { 'personal-storage': 3 },
  stores: { 'personal-storage': goodBlob },
};
check('validate good payload', validateBackupPayload(goodPayload));
check('parse round-trip', parseBackupPayload(JSON.stringify(goodPayload))?.userId === 'u1');
check('validate rejects missing stores', !validateBackupPayload({ ...goodPayload, stores: undefined }));
check('validate rejects non-string blob', !validateBackupPayload({ ...goodPayload, stores: { x: 1 } }));
check('validate rejects bad kind', !validateBackupPayload({ ...goodPayload, kind: 'weekly' }));
check('validate rejects bad recordCounts', !validateBackupPayload({ ...goodPayload, recordCounts: [] }));
check('validate rejects bad userId type', !validateBackupPayload({ ...goodPayload, userId: 42 }));
check('validate accepts null optionals', validateBackupPayload({ ...goodPayload, appVersion: null, userId: null }));
check('validate accepts prerestore/export kinds', validateBackupPayload({ ...goodPayload, kind: 'prerestore' }) && validateBackupPayload({ ...goodPayload, kind: 'export' }));
check('parse garbage → null', parseBackupPayload('not json') === null);
check('parse valid JSON wrong shape → null', parseBackupPayload('[1,2,3]') === null);

// ─── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('FAILURES:\n - ' + failures.join('\n - '));
  process.exit(1);
}
