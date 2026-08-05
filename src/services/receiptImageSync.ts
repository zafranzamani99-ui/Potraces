// Personal receipt image sync — uploads/downloads the receipt photo for the
// PERSONAL account. Binds `supabase` to the personal client so every storage
// call routes to the personal project. Mirrors the seller receipt-image flow
// (src/services/sellerSync.ts L120-230) but for personal-mode receipts.
//
// Storage layout: bucket 'receipt-images', object path
//   `${userId}/personal/${localId}.jpg`
// (owner-RLS from migration 20260528000000). We persist only the BUCKET PATH on
// the receipt (remoteImagePath) — never a signed/public URL, which expires.
import { supabasePersonal as supabase } from './supabase';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { toRelativeReceiptPath } from '../utils/receiptImage';

const BUCKET = 'receipt-images';
const RECEIPT_DIR = `${FileSystem.documentDirectory}receipts/`;

/**
 * Delete EVERY receipt-image object under `<userId>/personal/` — called when
 * personal cloud data is wiped WITHOUT deleting the account (toggle-off-wipe,
 * data-only clear). Row deletes alone orphan the photos in the bucket; the
 * deletion right must cover them too. Best-effort, never throws.
 */
export async function removeAllPersonalReceiptImages(userId: string): Promise<void> {
  try {
    const prefix = `${userId}/personal`;
    for (;;) {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(prefix, { limit: 1000 });
      if (error || !data || data.length === 0) return;
      const paths = data.map((e) => `${prefix}/${e.name}`);
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove(paths);
      if (rmErr) return;
      if (data.length < 1000) return;
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Compress + upload a local receipt image to Supabase Storage.
 * Returns the storage OBJECT PATH (`${userId}/personal/${localId}.jpg`) on
 * success, or null on any failure. Best-effort — NEVER throws (it runs inside
 * the sync push loop where a failure must just be retried next cycle).
 */
export async function uploadReceiptImage(
  localUri: string,
  userId: string,
  localId: string,
): Promise<string | null> {
  try {
    const compressed = await manipulateAsync(
      localUri,
      [{ resize: { width: 1200 } }],
      { compress: 0.7, format: SaveFormat.JPEG },
    );

    const path = `${userId}/personal/${localId}.jpg`;

    const formData = new FormData();
    formData.append('', {
      uri: compressed.uri,
      name: 'receipt.jpg',
      type: 'image/jpeg',
    } as any); // RN FormData type limitation

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, formData, { upsert: true, contentType: 'multipart/form-data' });

    if (error) return null;
    return path;
  } catch {
    return null;
  }
}

/**
 * Ensure a local copy of a remote receipt image exists on this device.
 * If the file is already present it's returned as-is (idempotent); otherwise it
 * is downloaded via a short-lived signed URL into `${documentDirectory}receipts/`.
 * Returns a RELATIVE receipt path (`receipts/<localId>.jpg`) on success, or null
 * on any failure. Best-effort — NEVER throws.
 */
export async function ensureLocalReceiptImage(
  remotePath: string,
  localId: string,
): Promise<string | null> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(RECEIPT_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(RECEIPT_DIR, { intermediates: true });
    }

    const target = `${RECEIPT_DIR}${localId}.jpg`;
    const existing = await FileSystem.getInfoAsync(target);
    if (existing.exists) return toRelativeReceiptPath(target);

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(remotePath, 60);
    if (error || !data?.signedUrl) return null;

    const res = await FileSystem.downloadAsync(data.signedUrl, target);
    if (res.status !== 200) {
      // Remove a partial/failed download so a later retry starts clean.
      try { await FileSystem.deleteAsync(target, { idempotent: true }); } catch {}
      return null;
    }
    return toRelativeReceiptPath(target);
  } catch {
    return null;
  }
}
