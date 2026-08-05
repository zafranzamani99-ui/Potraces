/**
 * Unit test for driveBackupLogic — the pure decisions behind the Google Drive
 * receipt auto-backup:
 *   • stable remote file naming (one Drive file per receipt)
 *   • source selection prefers the ORIGINAL archived PDF over the photo
 *   • jpg fallback when no PDF exists; null when there's nothing to back up
 *   • the "already backed up" skip that keeps re-runs from duplicating uploads
 *
 * Run:  npx tsx scripts/test-drive-dedupe.ts
 */
import {
  receiptDriveFileName, pickDriveBackupSource, shouldSkipDriveBackup,
} from '../src/services/driveBackupLogic';

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`  ${cond ? '✓' : '✗'} ${label}`);
  if (!cond) failures++;
}

console.log('receiptDriveFileName — stable naming per receipt');
check('pdf kind', receiptDriveFileName('abc123', 'pdf') === 'receipt-abc123.pdf');
check('jpg kind', receiptDriveFileName('abc123', 'jpg') === 'receipt-abc123.jpg');
check(
  'different receipts differ',
  receiptDriveFileName('a', 'pdf') !== receiptDriveFileName('b', 'pdf'),
);

console.log('pickDriveBackupSource — original PDF preferred');
{
  const src = pickDriveBackupSource({
    pdfUri: 'receipts/original.pdf',
    imageUri: 'receipts/photo.jpg',
  });
  check('picks the PDF path', src?.path === 'receipts/original.pdf');
  check('kind is pdf', src?.kind === 'pdf');
  check('mime is application/pdf', src?.mimeType === 'application/pdf');
}

console.log('pickDriveBackupSource — jpg fallback');
{
  const src = pickDriveBackupSource({ imageUri: 'receipts/photo.jpg' });
  check('picks the photo path', src?.path === 'receipts/photo.jpg');
  check('kind is jpg', src?.kind === 'jpg');
  check('mime is image/jpeg', src?.mimeType === 'image/jpeg');
}

console.log('pickDriveBackupSource — PDF only');
{
  const src = pickDriveBackupSource({ pdfUri: 'receipts/original.pdf' });
  check('picks the PDF', src?.path === 'receipts/original.pdf' && src?.kind === 'pdf');
}

console.log('pickDriveBackupSource — nothing to back up');
check('neither set → null', pickDriveBackupSource({}) === null);
check('explicit nulls → null', pickDriveBackupSource({ imageUri: null, pdfUri: null }) === null);
check('empty strings → null', pickDriveBackupSource({ imageUri: '', pdfUri: '' }) === null);

console.log('shouldSkipDriveBackup — skip only with a confirmed Drive copy');
check('no entry → false', shouldSkipDriveBackup(undefined) === false);
check('entry without driveFileId → false', shouldSkipDriveBackup({}) === false);
check('entry with driveFileId → true', shouldSkipDriveBackup({ driveFileId: 'drive-id-1' }) === true);
check('empty driveFileId → false', shouldSkipDriveBackup({ driveFileId: '' }) === false);

console.log(`\n${failures === 0 ? '✅ all driveBackupLogic tests passed' : `❌ ${failures} assertion(s) failed`}`);
process.exit(failures === 0 ? 0 : 1);
