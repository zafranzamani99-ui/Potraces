/**
 * Unit test for cloudBackupLogic — pure retry/dedupe/partition rules behind
 * the cloud-backup durable queue (Drive file, Sheets rows, iCloud file).
 * Locks the contract the AsyncStorage wrapper (cloudBackupQueue.ts) relies on:
 *   • shouldAttemptJob gates on the retry cap AND the inter-attempt cooldown
 *   • recordAttempt bumps attempts and sets/clears lastError
 *   • upsertJob dedupes on kind + dedupeKey (never duplicates pending work)
 *   • partitionDrained routes done / exhausted / retryable jobs correctly
 *     and replaces an older failed entry for the same work
 * Deterministic: every function takes explicit timestamps; no I/O.
 *
 * Run:  npx tsx scripts/test-backup-queue.ts
 */
import {
  BackupJob,
  BACKUP_QUEUE_MAX_ATTEMPTS, BACKUP_QUEUE_COOLDOWN_MS,
  shouldAttemptJob, recordAttempt, isJobExhausted, upsertJob, partitionDrained, newlyFailedJobs,
} from '../src/services/cloudBackupLogic';

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`  ${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failures++;
}

const NOW = 1_800_000_000_000; // fixed epoch ms — all fixtures derive from it.

let seq = 0;
function job(overrides: Partial<BackupJob> = {}): BackupJob {
  seq++;
  return {
    id: `job-${seq}`,
    kind: 'drive-file',
    dedupeKey: `key-${seq}`,
    payload: {},
    addedAt: NOW,
    attempts: 0,
    lastAttemptAt: null,
    ...overrides,
  };
}

console.log('shouldAttemptJob');
{
  const fresh = job();
  check('first attempt (lastAttemptAt null) → true', shouldAttemptJob(fresh, NOW) === true);

  const recent = job({ attempts: 1, lastAttemptAt: NOW - BACKUP_QUEUE_COOLDOWN_MS + 1 });
  check('cooldown not elapsed → false', shouldAttemptJob(recent, NOW) === false);

  const cooled = job({ attempts: 1, lastAttemptAt: NOW - BACKUP_QUEUE_COOLDOWN_MS });
  check('cooldown elapsed (exactly COOLDOWN_MS) → true', shouldAttemptJob(cooled, NOW) === true);

  const exhausted = job({ attempts: BACKUP_QUEUE_MAX_ATTEMPTS, lastAttemptAt: null });
  check('exhausted (attempts = MAX, never attempted timestamp) → false', shouldAttemptJob(exhausted, NOW) === false);

  const exhaustedCooled = job({ attempts: BACKUP_QUEUE_MAX_ATTEMPTS, lastAttemptAt: NOW - 10 * BACKUP_QUEUE_COOLDOWN_MS });
  check('exhausted beats elapsed cooldown → false', shouldAttemptJob(exhaustedCooled, NOW) === false);
}

console.log('recordAttempt');
{
  const j = job();
  const a1 = recordAttempt(j, NOW, 'network down');
  check('attempts increments 0 → 1', a1.attempts === 1);
  check('lastAttemptAt set to now', a1.lastAttemptAt === NOW);
  check('lastError recorded', a1.lastError === 'network down');
  check('original job untouched (immutable)', j.attempts === 0 && j.lastAttemptAt === null);

  const a2 = recordAttempt(a1, NOW + 1000);
  check('attempts increments 1 → 2', a2.attempts === 2);
  check('omitted error clears lastError', a2.lastError === undefined);

  const maxed = recordAttempt(job({ attempts: BACKUP_QUEUE_MAX_ATTEMPTS - 1 }), NOW, 'boom');
  check('reaching MAX makes isJobExhausted true', isJobExhausted(maxed) === true);
  check('one below MAX is not exhausted', isJobExhausted(a2) === false);
}

console.log('upsertJob');
{
  const a = job({ kind: 'drive-file', dedupeKey: 'backup.zip' });
  const dupe = job({ kind: 'drive-file', dedupeKey: 'backup.zip' }); // same work, new id
  const otherKind = job({ kind: 'icloud-file', dedupeKey: 'backup.zip' }); // same key, other kind
  const otherKey = job({ kind: 'drive-file', dedupeKey: 'other.zip' });

  const list = upsertJob([], a);
  check('appends to empty list', list.length === 1 && list[0].id === a.id);

  const afterDupe = upsertJob(list, dupe);
  check('same kind + dedupeKey is a no-op', afterDupe.length === 1);
  check('dedupe returns the SAME list reference (unchanged)', afterDupe === list);

  const afterKind = upsertJob(list, otherKind);
  check('different kind with same dedupeKey is allowed', afterKind.length === 2);

  const afterKey = upsertJob(afterKind, otherKey);
  check('same kind with different dedupeKey is allowed', afterKey.length === 3);
}

console.log('partitionDrained');
{
  const done = job({ dedupeKey: 'done' });
  const exhausted = job({
    dedupeKey: 'exhausted',
    attempts: BACKUP_QUEUE_MAX_ATTEMPTS,
    lastAttemptAt: NOW,
    lastError: 'still broken',
  });
  const retryable = job({ dedupeKey: 'retryable', attempts: 1, lastAttemptAt: NOW, lastError: 'flaky' });
  const untouched = job({ dedupeKey: 'untouched' });

  const { remaining, failed } = partitionDrained(
    [done, exhausted, retryable, untouched],
    [done.id],
    [],
  );
  check('done job removed from pending', !remaining.some((j) => j.id === done.id));
  check('done job NOT added to failed', !failed.some((j) => j.id === done.id));
  check('exhausted job moved to failed', failed.some((j) => j.id === exhausted.id));
  check('exhausted job removed from pending', !remaining.some((j) => j.id === exhausted.id));
  check('errored-but-retryable job stays pending', remaining.some((j) => j.id === retryable.id));
  check('untouched job stays pending', remaining.some((j) => j.id === untouched.id));
  check('remaining count = 2', remaining.length === 2);
  check('failed count = 1', failed.length === 1);

  // An older failed entry for the same work is replaced, not duplicated.
  const staleFail = job({ kind: exhausted.kind, dedupeKey: exhausted.dedupeKey, lastError: 'old failure' });
  const second = partitionDrained([exhausted], [], [staleFail]);
  check('existing failed entry for same kind+dedupeKey is replaced', second.failed.length === 1);
  check('replacement carries the NEW failure state', second.failed[0].id === exhausted.id && second.failed[0].lastError === 'still broken');

  // A failed entry for DIFFERENT work is preserved.
  const otherFail = job({ dedupeKey: 'unrelated-failure' });
  const third = partitionDrained([exhausted], [], [otherFail]);
  check('unrelated failed entries are preserved', third.failed.length === 2);
}

console.log('newlyFailedJobs');
{
  // Telemetry contract: only jobs parked in the failed list by THIS drain
  // are "newly failed" — re-drains of an already-failed job must not
  // re-report (matched by job id, which survives attempts + the retry
  // round-trip).
  const parked = job({ dedupeKey: 'a', attempts: BACKUP_QUEUE_MAX_ATTEMPTS, lastError: 'boom' });
  const parkedToo = job({ dedupeKey: 'b', attempts: BACKUP_QUEUE_MAX_ATTEMPTS, lastError: 'boom' });

  check('empty failed list → nothing newly failed', newlyFailedJobs([], []).length === 0);
  check('newly parked job is newly failed', newlyFailedJobs([parked], []).length === 1);

  const first = newlyFailedJobs([parked, parkedToo], [parked]);
  check('job already on the failed list (same id) is NOT re-reported', first.length === 1 && first[0].id === parkedToo.id);

  // retryFailedBackupJobs clears the failed list before re-queuing, so a
  // re-park after a manual retry reports again — a fresh permanent failure.
  const afterRetry = newlyFailedJobs([parked], []);
  check('re-park after manual retry (failed list was cleared) reports again', afterRetry.length === 1);
}

console.log(`\n${failures === 0 ? '✅ all cloudBackupLogic tests passed' : `❌ ${failures} assertion(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
