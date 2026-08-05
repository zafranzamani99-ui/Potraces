/**
 * Low-level Google API client for the cloud-backup features (Drive receipt
 * backups, Sheets transaction sync).
 *
 * Every request goes through googleApiFetch(): it attaches the access token
 * from the native Google sign-in (drive.file scope, requested in
 * googleAuth.configure), recovers from Android's stale-token cache on HTTP 401
 * (clear + retry once), and backs off on 403/429 rate limits. It does NOT
 * throw on non-ok responses — the one exception is the NEEDS_REAUTH sentinel
 * when no native Google session exists; callers inspect `res.status` for
 * everything else.
 *
 * Folder provisioning ("Potraces" and "Potraces/Receipts") is find-or-create,
 * with the resulting IDs cached in backupStore so a backup run doesn't
 * re-query Drive every time. Cached IDs are verified before reuse — a folder
 * the user deleted or trashed is re-provisioned.
 *
 * Hermes can't stream binary bodies reliably, so uploadToDrive() sends the
 * media part as a base64 string with Content-Transfer-Encoding: base64 — the
 * multipart body is one string. Receipt files are small (~150 KB JPEGs, small
 * PDFs), so no resumable upload is needed.
 */
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { getGoogleAccessToken, clearGoogleTokenCache } from './googleAuth';
import { useBackupStore } from '../store/backupStore';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Single quotes break a Drive q= clause — escape them before interpolating. */
function escapeQueryValue(value: string): string {
  return value.replace(/'/g, "\\'");
}

/**
 * Authenticated fetch against a Google API. Throws Error('NEEDS_REAUTH') when
 * no native Google session/token exists; otherwise NEVER throws on HTTP
 * status — the Response is returned for the caller to inspect.
 */
export async function googleApiFetch(url: string, init?: RequestInit): Promise<Response> {
  let token = await getGoogleAccessToken();
  if (!token) throw new Error('NEEDS_REAUTH');

  const send = (t: string) =>
    fetch(url, {
      ...init,
      headers: {
        ...(init?.headers as Record<string, string> | undefined),
        Authorization: `Bearer ${t}`,
      },
    });

  let res = await send(token);

  // Android's native SDK caches tokens and will happily hand back a dead one —
  // clear the cache and retry ONCE with a fresh token.
  if (res.status === 401) {
    await clearGoogleTokenCache(token);
    token = await getGoogleAccessToken();
    if (!token) throw new Error('NEEDS_REAUTH');
    res = await send(token);
  }

  // Rate-limited (or transient 403) — truncated exponential backoff, then hand
  // the failing response back for the caller to judge.
  for (let attempt = 0; attempt < 3 && (res.status === 403 || res.status === 429); attempt++) {
    await sleep(2 ** attempt * 1000 + Math.random() * 1000);
    res = await send(token);
  }

  return res;
}

/** True when the cached folder ID still exists in Drive and isn't trashed. */
async function isUsableFolder(id: string | null): Promise<boolean> {
  if (!id) return false;
  const res = await googleApiFetch(`${DRIVE_API}/files/${id}?fields=id,trashed`);
  if (res.status === 404) return false;
  if (!res.ok) {
    // Transient failure — don't silently re-provision duplicates; surface it.
    const detail = await res.text().catch(() => '');
    throw new Error(`Drive folder verify failed (HTTP ${res.status})${detail ? `: ${detail.slice(0, 180)}` : ''}`);
  }
  const meta = await res.json();
  return !meta.trashed;
}

async function findFolderByName(name: string, parentId?: string): Promise<string | null> {
  let q = `name='${escapeQueryValue(name)}' and mimeType='${FOLDER_MIME}' and trashed=false`;
  if (parentId) q += ` and '${parentId}' in parents`;
  const res = await googleApiFetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Drive folder lookup failed (HTTP ${res.status})${detail ? `: ${detail.slice(0, 180)}` : ''}`);
  }
  const json = await res.json();
  return json.files?.[0]?.id ?? null;
}

async function createFolder(name: string, parentId?: string): Promise<string> {
  const res = await googleApiFetch(DRIVE_API + '/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Drive folder create failed (HTTP ${res.status})${detail ? `: ${detail.slice(0, 180)}` : ''}`);
  }
  const json = await res.json();
  return json.id;
}

/**
 * Find-or-create the visible backup folders "Potraces" and "Potraces/Receipts".
 * Cached IDs from backupStore are verified before reuse (404 or trashed →
 * re-provisioned); fresh IDs are persisted back to the store.
 */
export async function ensureDriveFolders(): Promise<{ rootId: string; receiptsId: string }> {
  const backup = useBackupStore.getState();

  const rootId = (await isUsableFolder(backup.driveFolderId))
    ? backup.driveFolderId!
    : (await findFolderByName('Potraces')) ?? (await createFolder('Potraces'));

  const receiptsId = (await isUsableFolder(backup.receiptsFolderId))
    ? backup.receiptsFolderId!
    : (await findFolderByName('Receipts', rootId)) ?? (await createFolder('Receipts', rootId));

  backup.setDriveFolderIds(rootId, receiptsId);
  return { rootId, receiptsId };
}

/**
 * Multipart-upload a local file to Drive, returning the new file ID.
 * `folderId` (optional) is set as the file's parent; omit it to land in the
 * user's Drive root. Throws on non-ok with the status + a detail snippet.
 */
export async function uploadToDrive(opts: {
  fileUri: string;
  name: string;
  mimeType: string;
  folderId?: string;
}): Promise<string> {
  const base64 = await readAsStringAsync(opts.fileUri, { encoding: EncodingType.Base64 });

  const metadata: Record<string, any> = { name: opts.name, mimeType: opts.mimeType };
  if (opts.folderId) metadata.parents = [opts.folderId];

  const boundary = `potraces_drive_${Date.now().toString(36)}`;
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\n` +
    `Content-Type: ${opts.mimeType}\r\n` +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    base64 +
    `\r\n--${boundary}--`;

  const res = await googleApiFetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `Google Drive upload failed (HTTP ${res.status})${detail ? `: ${detail.slice(0, 180)}` : ''}`
    );
  }
  const json = await res.json();
  return json.id;
}

/** First file with this exact name (optionally inside a folder), or null. */
export async function findDriveFileByName(name: string, folderId?: string): Promise<string | null> {
  let q = `name='${escapeQueryValue(name)}' and trashed=false`;
  if (folderId) q += ` and '${folderId}' in parents`;
  const res = await googleApiFetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)`);
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Drive file lookup failed (HTTP ${res.status})${detail ? `: ${detail.slice(0, 180)}` : ''}`);
  }
  const json = await res.json();
  return json.files?.[0]?.id ?? null;
}
