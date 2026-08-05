/**
 * Pure decision logic for the Google Drive receipt auto-backup: what the
 * remote file is called, which local artifact gets uploaded, and when a
 * receipt can be skipped.
 *
 * This module is intentionally free of react-native / expo imports so it can
 * be unit-tested in plain Node (scripts/test-drive-dedupe.ts). The store /
 * file-system side lives in driveBackup.ts — this file owns only the rules:
 *   • stable remote naming (one Drive file per receipt)
 *   • source selection — the ORIGINAL archived PDF is preferred over the
 *     photo/raster (backup keeps the original artifact; no PDF generation)
 *   • the "already backed up" skip so re-runs don't upload duplicates
 */

export type DriveBackupKind = 'pdf' | 'jpg';

/** Stable Drive file name for a receipt — re-runs target the same name. */
export function receiptDriveFileName(receiptId: string, kind: DriveBackupKind): string {
  return `receipt-${receiptId}.${kind}`;
}

/**
 * Which local artifact to back up. Prefers the ORIGINAL archived PDF
 * (pdfUri); falls back to the photo/raster (imageUri). Null when the receipt
 * has neither — nothing to back up.
 */
export function pickDriveBackupSource(
  receipt: { imageUri?: string | null; pdfUri?: string | null },
): { path: string; kind: DriveBackupKind; mimeType: string } | null {
  if (receipt.pdfUri) {
    return { path: receipt.pdfUri, kind: 'pdf', mimeType: 'application/pdf' };
  }
  if (receipt.imageUri) {
    return { path: receipt.imageUri, kind: 'jpg', mimeType: 'image/jpeg' };
  }
  return null;
}

/** True when the receipt already has a confirmed Drive copy — skip re-upload. */
export function shouldSkipDriveBackup(remoteEntry: { driveFileId?: string } | undefined): boolean {
  return !!remoteEntry?.driveFileId;
}
