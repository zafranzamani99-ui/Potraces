import { supabaseBusiness } from './supabase';
import { useAuthStore } from '../store/authStore';

// Lazy-load native module — crashes in Expo Go if imported statically
let GoogleSignin: any = null;
let _statusCodes: any = {};

try {
  const mod = require('@react-native-google-signin/google-signin');
  GoogleSignin = mod.GoogleSignin;
  _statusCodes = mod.statusCodes;
} catch {
  // Native module not available (Expo Go)
}

export const statusCodes = _statusCodes;

const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

export function configureGoogleSignIn() {
  if (!GoogleSignin) return;
  if (!WEB_CLIENT_ID) {
    console.warn('[googleAuth] EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set — Google Sign-In will fail.');
    return;
  }
  GoogleSignin.configure({
    webClientId: WEB_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID,
    offlineAccess: false,
    // drive.file — lets "Save to Drive" write receipt PDFs into the user's own
    // Google Drive (only files the app itself created).
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
}

export async function signInWithGoogle(client = supabaseBusiness): Promise<{ userId: string }> {
  if (!GoogleSignin) throw new Error('Google Sign-In not available (dev build required)');
  if (!WEB_CLIENT_ID) throw new Error('Google Sign-In is not configured (missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID).');
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  const idToken = response.data?.idToken;
  if (!idToken) throw new Error('No ID token from Google');

  const { data, error } = await client.auth.signInWithIdToken({
    provider: 'google',
    token: idToken,
  });
  if (error) throw error;
  return { userId: data.user.id };
}

export async function signOutGoogle() {
  if (!GoogleSignin) return;
  try { await GoogleSignin.signOut(); } catch {}
}

/**
 * Drive-only connect — for Apple/phone/email accounts. Runs the NATIVE Google
 * sign-in purely to obtain the Drive access token: NO Supabase call, so the
 * app account (provider, data, session) is untouched. The native SDK keeps its
 * own session, so afterwards getGoogleAccessToken() succeeds and "Save to
 * Drive" works for non-Google accounts too.
 */
export async function connectGoogleDrive(): Promise<void> {
  if (!GoogleSignin) throw new Error('Google Sign-In not available (dev build required)');
  if (!WEB_CLIENT_ID) throw new Error('Google Sign-In is not configured (missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID).');
  await GoogleSignin.hasPlayServices();
  await GoogleSignin.signIn();
}

/** True when a native Google session exists — i.e. Drive calls will work. */
export async function hasGoogleDriveAccess(): Promise<boolean> {
  return (await getGoogleAccessToken()) != null;
}

/**
 * Email of the native Google session's account, for pinning cloud backups to a
 * specific Google account (shown in settings). Null when no native session.
 */
export async function getConnectedGoogleEmail(): Promise<string | null> {
  if (!GoogleSignin) return null;
  try {
    const current = await GoogleSignin.getCurrentUser();
    return current?.user?.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Full Drive disconnect — revokes the app's grant and signs out the native
 * session. App account (Supabase session) is untouched; Drive/Sheets backups
 * stop until the user reconnects.
 */
export async function disconnectGoogle(): Promise<void> {
  if (!GoogleSignin) return;
  try { await GoogleSignin.revokeAccess(); } catch {}
  try { await GoogleSignin.signOut(); } catch {}
}

/**
 * Access token from the last native Google sign-in, for calling Google APIs
 * (Drive upload). Null when the native module is missing, nobody is signed in
 * natively, or token retrieval fails for any reason.
 */
export async function getGoogleAccessToken(): Promise<string | null> {
  if (!GoogleSignin) return null;
  try {
    const tokens = await GoogleSignin.getTokens();
    return tokens?.accessToken ?? null;
  } catch {
    return null;
  }
}

/**
 * Drop a specific cached access token from the native SDK. Android caches
 * tokens and will happily hand back a dead one — googleApiFetch calls this on
 * HTTP 401 so the next getGoogleAccessToken() fetches a fresh token. No-op
 * when the native module is missing; failures are swallowed (the retried
 * request will surface any real problem).
 */
export async function clearGoogleTokenCache(token: string): Promise<void> {
  if (!GoogleSignin) return;
  try { await GoogleSignin.clearCachedAccessToken(token); } catch {}
}

/**
 * True only when the signed-in user (either mode) authenticated via Google.
 * Reads the cached auth store — Apple/phone users must not see Google-only
 * actions like "Save to Drive".
 */
export function isGoogleSignedIn(): boolean {
  const { business, personal } = useAuthStore.getState();
  return (
    (business.isAuthenticated && business.provider === 'google') ||
    (personal.isAuthenticated && personal.provider === 'google')
  );
}
