import { Alert } from 'react-native';
import { clientForMode, signInWithPhone, type Mode } from './supabase';
import { signInWithGoogle } from './googleAuth';
import { signInWithApple } from './appleAuth';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';

export type ReuseCreds =
  | { provider: 'phone'; phone: string; password: string }
  | { provider: 'google' }
  | { provider: 'apple' };

/**
 * Sign the OTHER mode's client into the SAME account, so business + personal
 * share one Supabase user. We do a REAL independent sign-in on the target client
 * (its own refresh-token chain) — never copy tokens across clients, which would
 * break under Supabase refresh-token rotation.
 *
 * Into business: OAuth is pre-verified (matches AuthScreen); phone is left
 * unverified so the AuthGatedBusiness OTP gate runs as usual. ensureProfile()
 * creates the seller profile for the reused business account.
 */
export async function reuseAccountForMode(target: Mode, creds: ReuseCreds): Promise<void> {
  const client = clientForMode(target);
  let userId: string;
  let phone: string | null = null;

  if (creds.provider === 'phone') {
    const data = await signInWithPhone(creds.phone, creds.password, client);
    if (!data.session) throw new Error('reuse: no session returned');
    userId = data.session.user.id;
    phone = creds.phone;
  } else if (creds.provider === 'google') {
    userId = (await signInWithGoogle(client)).userId;
  } else {
    userId = (await signInWithApple(client)).userId;
  }

  const auth = useAuthStore.getState();
  if (target === 'business') {
    const { ensureProfile } = require('./sellerSync');
    await ensureProfile();
    auth.setBusinessAuth({
      isAuthenticated: true,
      userId,
      phone,
      provider: creds.provider,
      isVerified: creds.provider !== 'phone', // OAuth pre-verified; phone → OTP gate
    });
  } else {
    auth.setPersonalAuth({ isAuthenticated: true, userId, phone, provider: creds.provider });
  }
}

/**
 * Offer to reuse the just-signed-in account for the OTHER mode. No-op if that mode
 * is already signed in, or if the user chose "don't ask again". `tr` is the active
 * i18n bundle.
 *
 * "Not now" is deliberately NOT remembered — it means ask me again next sign-in.
 * Only "don't ask again" persists, otherwise a user who never wants the two modes
 * linked gets nagged on every single sign-in.
 */
export function confirmReuse(target: Mode, creds: ReuseCreds, tr: any): void {
  const already =
    target === 'business'
      ? useAuthStore.getState().business.isAuthenticated
      : useAuthStore.getState().personal.isAuthenticated;
  if (already) return;
  if (useSettingsStore.getState().reuseNeverAsk) return;

  const title = target === 'business' ? tr.auth.acctReuseBizTitle : tr.auth.acctReusePersonalTitle;
  Alert.alert(title, tr.auth.acctReuseMsg, [
    { text: tr.auth.acctReuseNotNow, style: 'cancel' },
    {
      text: tr.auth.acctReuseNever,
      onPress: () => useSettingsStore.getState().setReuseNeverAsk(true),
    },
    {
      text: tr.auth.acctReuseConfirm,
      onPress: () => { reuseAccountForMode(target, creds).catch(() => {}); },
    },
  ]);
}
