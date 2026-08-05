/**
 * "Save to Drive" — upload a receipt PDF to the signed-in Google user's Drive.
 *
 * Thin delegate to googleDrive.uploadToDrive (no folderId → the file lands in
 * the user's Drive root, same as the original standalone implementation).
 * Kept as its own module because ReceiptDetail.tsx imports this signature;
 * the NEEDS_REAUTH sentinel is translated back to the original user-facing
 * message so the screen's error toast stays readable.
 */
import { uploadToDrive } from './googleDrive';

export async function uploadReceiptToDrive(opts: {
  fileUri: string;
  name: string;
  mimeType: string;
}): Promise<void> {
  try {
    await uploadToDrive(opts);
  } catch (e: any) {
    if (e?.message === 'NEEDS_REAUTH') {
      throw new Error('Sign in with Google to use Save to Drive');
    }
    throw e;
  }
}
