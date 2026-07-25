/**
 * "Save to Drive" — upload a receipt PDF to the signed-in Google user's Drive
 * via the Drive v3 multipart endpoint. Uses the access token from the native
 * Google sign-in (drive.file scope, requested in googleAuth.configure).
 *
 * Hermes can't stream binary bodies reliably, so the media part is sent as a
 * base64 string with Content-Transfer-Encoding: base64 — the simple multipart
 * body is one string.
 */
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { getGoogleAccessToken } from './googleAuth';

export async function uploadReceiptToDrive(opts: {
  fileUri: string;
  name: string;
  mimeType: string;
}): Promise<void> {
  const token = await getGoogleAccessToken();
  if (!token) throw new Error('Sign in with Google to use Save to Drive');

  const base64 = await readAsStringAsync(opts.fileUri, { encoding: EncodingType.Base64 });

  const boundary = `potraces_drive_${Date.now().toString(36)}`;
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify({ name: opts.name, mimeType: opts.mimeType }) +
    `\r\n--${boundary}\r\n` +
    `Content-Type: ${opts.mimeType}\r\n` +
    'Content-Transfer-Encoding: base64\r\n\r\n' +
    base64 +
    `\r\n--${boundary}--`;

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(
      `Google Drive upload failed (HTTP ${res.status})${detail ? `: ${detail.slice(0, 180)}` : ''}`
    );
  }
}
