/**
 * Pushes the user's avatar choice to user_profiles — the shared copy other
 * people see (e.g. the Collectz roster). The settings-store avatar is
 * device-local; this keeps the server copy fresh.
 *
 * Triggers: a debounced settingsStore subscription (any avatar change — preset
 * pick, Google sign-in photo, clear). Free users included: an avatar is
 * identity, not backup. Silent + best-effort.
 */
import { supabasePersonal as supabase } from './supabase'; // personal client (user_profiles)
import { useSettingsStore } from '../store/settingsStore';

export async function pushAvatarProfile(): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return;
  const { avatarId, avatarUri } = useSettingsStore.getState();
  await supabase.from('user_profiles').upsert({
    user_id: userId,
    avatar_id: avatarId,
    avatar_uri: avatarUri,
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
