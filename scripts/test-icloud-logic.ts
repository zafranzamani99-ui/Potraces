/**
 * Unit test for icloudBackupLogic — the pure decisions behind the iCloud
 * receipt auto-backup:
 *   • stable remote paths (one iCloud file per receipt, same naming as Drive)
 *   • the "already backed up" skip that keeps re-runs from re-uploading
 *   • manifest build/parse round-trip + tolerance for malformed content
 *   • the restore plan (only manifest entries with a LOCAL receipt record)
 *
 * Run:  npx tsx scripts/test-icloud-logic.ts
 */
import {
  ICLOUD_MANIFEST_PATH,
  buildIcloudManifest,
  icloudReceiptRemotePath,
  parseIcloudManifest,
  planIcloudRestore,
  shouldSkipIcloudBackup,
} from '../src/services/icloudBackupLogic';

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`  ${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failures++;
}

console.log('icloudReceiptRemotePath — stable naming per receipt');
check(
  'pdf kind',
  icloudReceiptRemotePath('abc123', 'pdf') === 'Potraces/Receipts/receipt-abc123.pdf',
);
check(
  'jpg kind',
  icloudReceiptRemotePath('abc123', 'jpg') === 'Potraces/Receipts/receipt-abc123.jpg',
);
check(
  'different receipts differ',
  icloudReceiptRemotePath('a', 'pdf') !== icloudReceiptRemotePath('b', 'pdf'),
);

console.log('shouldSkipIcloudBackup — skip only with a confirmed iCloud copy');
check('no entry → false', shouldSkipIcloudBackup(undefined) === false);
check('entry without icloudPath → false', shouldSkipIcloudBackup({}) === false);
check('entry with icloudPath → true', shouldSkipIcloudBackup({ icloudPath: 'Potraces/Receipts/receipt-a.pdf' }) === true);
check('empty icloudPath → false', shouldSkipIcloudBackup({ icloudPath: '' }) === false);

console.log('manifest — build/parse round-trip');
{
  const entries = [
    { id: 'a', path: icloudReceiptRemotePath('a', 'pdf'), backedUpAt: 111 },
    { id: 'b', path: icloudReceiptRemotePath('b', 'jpg'), backedUpAt: 222 },
  ];
  const parsed = parseIcloudManifest(buildIcloudManifest(entries, 999));
  check('parses', parsed !== null);
  check('version 1', parsed?.version === 1);
  check('updatedAt kept', parsed?.updatedAt === 999);
  check('all entries kept', parsed?.receipts.length === 2);
  check('entry fields kept', parsed?.receipts[0].id === 'a' && parsed?.receipts[0].backedUpAt === 111);
}

console.log('manifest — parse tolerance');
check('bad JSON → null', parseIcloudManifest('{not json') === null);
check('non-object → null', parseIcloudManifest('"hello"') === null);
check('missing receipts → null', parseIcloudManifest('{"version":1}') === null);
{
  const parsed = parseIcloudManifest(
    JSON.stringify({ updatedAt: 'junk', receipts: [{ id: 'a', path: 'p', backedUpAt: 'junk' }, { bad: true }, null] }),
  );
  check('junk entries dropped, good kept', parsed?.receipts.length === 1);
  check('non-number backedUpAt → 0', parsed?.receipts[0].backedUpAt === 0);
  check('non-number updatedAt → 0', parsed?.updatedAt === 0);
}

console.log('planIcloudRestore — only receipts present on this device');
{
  const manifest = [
    { id: 'a', path: icloudReceiptRemotePath('a', 'pdf'), backedUpAt: 1 },
    { id: 'b', path: icloudReceiptRemotePath('b', 'jpg'), backedUpAt: 2 },
    { id: 'c', path: icloudReceiptRemotePath('c', 'jpg'), backedUpAt: 3 },
  ];
  const plan = planIcloudRestore(manifest, new Set(['a', 'c']));
  check('two items planned', plan.length === 2);
  check('unknown receipt skipped', !plan.some((p) => p.receiptId === 'b'));
  check('remote path carried', plan[0].remotePath === icloudReceiptRemotePath('a', 'pdf'));
  check('empty local set → empty plan', planIcloudRestore(manifest, new Set()).length === 0);
}

check('manifest path is the container root file', ICLOUD_MANIFEST_PATH === 'Potraces/manifest.json');

console.log(`\n${failures === 0 ? '✅ all icloudBackupLogic tests passed' : `❌ ${failures} assertion(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
