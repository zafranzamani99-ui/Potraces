/**
 * Pushes the user's avatar choice to user_profiles — the shared copy other
 * people see (e.g. the Collectz roster). The settings-store avatar is
 * device-local; this keeps the server copy fresh.
 *
 * Triggers: a debounced settingsStore subscription (any avatar change — preset
 * pick, Google sign-in photo, clear). Free users included: an avatar is
 * identity, not backup. Silent + best-effort.
 */
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { supabasePersonal as supabase } from './supabase'; // personal client (user_profiles)
import { useSettingsStore } from '../store/settingsStore';

const AVATARS_BUCKET = 'avatars';

/**
 * Publish a locally-picked avatar photo (e.g. a Memoji sticker) to the public
 * `avatars` bucket so OTHER users' rosters can render it, returning the public
 * https URL (or null — offline / signed-out / upload failure keeps the avatar
 * device-local, which the sync guard below already handles).
 * Resize→PNG keeps Memoji transparency (JPEG would flatten it onto white);
 * timestamped filename = a fresh URL per change, so neither the CDN's 1-hour
 * edge cache nor RN's Image cache can ever serve a stale avatar.
 */
export async function uploadAvatarPhoto(localUri: string): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return null;
  try {
    const png = await manipulateAsync(localUri, [{ resize: { width: 512 } }], {
      format: SaveFormat.PNG,
    });
    const path = `${userId}/avatar-${Date.now()}.png`;
    const formData = new FormData();
    formData.append('', { uri: png.uri, name: 'avatar.png', type: 'image/png' } as any);
    const { error } = await supabase.storage
      .from(AVATARS_BUCKET)
      .upload(path, formData, { upsert: true, contentType: 'multipart/form-data' });
    if (error) return null;
    // Best-effort: sweep older avatar files out of my folder (each change
    // uploads a new timestamped file; without this they'd accumulate).
    supabase.storage.from(AVATARS_BUCKET).list(userId).then(({ data }) => {
      const stale = (data ?? [])
        .map((f) => `${userId}/${f.name}`)
        .filter((p) => p !== path);
      if (stale.length) supabase.storage.from(AVATARS_BUCKET).remove(stale).catch(() => {});
    }).catch(() => {});
    return supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path).data.publicUrl ?? null;
  } catch {
    return null;
  }
}

export async function pushAvatarProfile(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return;
  const { avatarId, avatarUri } = useSettingsStore.getState();
  // Only http(s) URLs are shareable (Google photo, or an uploadAvatarPhoto
  // public URL). A file:// path would be a dead link in other people's rosters
  // — it stays device-local (upload failed / offline) and others see the
  // preset/initial fallback until the next successful publish.
  const shareableUri = avatarUri && /^https?:\/\//i.test(avatarUri) ? avatarUri : null;
  await supabase.from('user_profiles').upsert({
    user_id: userId,
    avatar_id: avatarId,
    avatar_uri: shareableUri,
    updated_at: new Date().toISOString(),
  });
}

// Only react when the avatar fields ACTUALLY change (settingsStore fires on
// every settings write). Debounced so sign-in + restore bursts = one upload.
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let lastId: string | null | undefined;
let lastUri: string | null | undefined;
useSettingsStore.subscribe((s) => {
  if (s.avatarId === lastId && s.avatarUri === lastUri) return;
  lastId = s.avatarId;
  lastUri = s.avatarUri;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushAvatarProfile().catch(() => {});
  }, 2000);
});
