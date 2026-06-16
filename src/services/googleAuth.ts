import { supabase } from './supabase';

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
  });
}

export async function signInWithGoogle(): Promise<{ userId: string }> {
  if (!GoogleSignin) throw new Error('Google Sign-In not available (dev build required)');
  if (!WEB_CLIENT_ID) throw new Error('Google Sign-In is not configured (missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID).');
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  const idToken = response.data?.idToken;
  if (!idToken) throw new Error('No ID token from Google');

  const { data, error } = await supabase.auth.signInWithIdToken({
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
