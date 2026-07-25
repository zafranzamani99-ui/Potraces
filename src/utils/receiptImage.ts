import * as FileSystem from 'expo-file-system/legacy';

/**
 * Receipt image path helpers.
 *
 * iOS rewrites the app's sandbox container path on every install/update, so an
 * absolute `file:///.../Documents/receipts/x.jpg` persisted today is dead after
 * the next build. We persist a RELATIVE path (`receipts/x.jpg`) and rebuild the
 * absolute URI at render time against the current documentDirectory.
 */

/**
 * Strip an absolute Documents URI down to a path relative to documentDirectory.
 * e.g. 'file:///.../Documents/receipts/x.jpg' → 'receipts/x.jpg'.
 * Remote (http/https) and already-relative values pass through unchanged.
 */
export function toRelativeReceiptPath(uri: string): string {
  if (!uri) return uri;
  if (/^https?:\/\//i.test(uri)) return uri;
  // Strip the REAL documentDirectory prefix so this works on every platform
  // (iOS '…/Documents/', Android '…/files/', etc.), not just iOS.
  const docDir = FileSystem.documentDirectory ?? '';
  if (docDir && uri.startsWith(docDir)) return uri.slice(docDir.length);
  // Legacy fallback for older iOS absolute paths captured before this change.
  const marker = '/Documents/';
  const idx = uri.indexOf(marker);
  if (idx !== -1) return uri.slice(idx + marker.length);
  return uri;
}

/**
 * Rebuild a displayable URI from a stored (relative) receipt path.
 * - undefined → undefined
 * - http(s) remote → as-is
 * - relative → prefixed with the current documentDirectory
 * - absolute file:// → SELF-HEALED: a path from an OLD sandbox container (iOS rewrites
 *   the container UUID on every install/update) is rebased onto the current
 *   documentDirectory via its '/Documents/' suffix, instead of going stale.
 */
export function resolveReceiptImageUri(stored?: string): string | undefined {
  if (!stored) return undefined;
  if (/^https?:\/\//i.test(stored)) return stored;
  if (stored.startsWith('file://') || stored.startsWith('/')) {
    const docDir = FileSystem.documentDirectory ?? '';
    if (docDir && stored.startsWith(docDir)) return stored; // current container
    const marker = '/Documents/';
    const idx = stored.indexOf(marker);
    if (idx !== -1 && docDir) return `${docDir}${stored.slice(idx + marker.length)}`;
    return stored;
  }
  return `${FileSystem.documentDirectory}${stored}`;
}
