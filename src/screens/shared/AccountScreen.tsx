import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Switch,
  Alert,
  Keyboard,
  Linking,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { signInWithGoogle, statusCodes } from '../../services/googleAuth';
import { signInWithApple } from '../../services/appleAuth';
import { ensureProfile, clearProfileCache } from '../../services/sellerSync';
import { signOut, getAuthSession, signInWithPhone, signUpWithPhone } from '../../services/supabase';
import { syncPersonal, disablePersonalSync } from '../../services/personalSync';
import { resetBackoff } from '../../services/syncBackoff';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useToast } from '../../context/ToastContext';
import { lightTap } from '../../services/haptics';
import { useT } from '../../i18n';

const PRIVACY_URL = 'https://jejakbaki.my/privacy.html';

/**
 * AccountScreen — the personal-mode account + cloud-backup hub.
 *
 * Signed OUT: a trust-building "back up your money" sign-in. Three paths:
 *   • Google / Apple — frictionless, pre-verified.
 *   • Phone + password — for users who don't use Google/Apple. NOTE: personal
 *     phone sign-in does NOT use the Telegram OTP (that's seller verification);
 *     a Supabase session alone is all personal backup needs. We set provider
 *     'phone' but deliberately leave `isVerified` untouched, so business mode
 *     still enforces its own seller-verification gate.
 *
 * Signed IN: identity + cloud-backup toggle + last-synced + sign out, all here,
 * so Settings no longer carries a separate buried sync section.
 */
export default function AccountScreen() {
  const C = useCalm();
  const isDark = useIsDark();
  const tr = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { showToast } = useToast();

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const provider = useAuthStore((s) => s.provider);
  const personalSyncEnabled = useSettingsStore((s) => s.personalSyncEnabled);
  const lastPersonalSyncAt = useSettingsStore((s) => s.lastPersonalSyncAt);

  const [email, setEmail] = useState<string | null>(null);
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const [syncing, setSyncing] = useState(false);

  // Phone form
  const [isLogin, setIsLogin] = useState(true);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [error, setError] = useState('');
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const busy = !!socialLoading || phoneLoading;

  // Pull the email off the live Supabase session for the profile card.
  useEffect(() => {
    let alive = true;
    if (isAuthenticated) {
      getAuthSession()
        .then((s) => { if (alive) setEmail((s?.user as any)?.email ?? null); })
        .catch(() => {});
    } else {
      setEmail(null);
    }
    return () => { alive = false; };
  }, [isAuthenticated]);

  const enableBackup = useCallback(async () => {
    useSettingsStore.getState().setPersonalSyncEnabled(true);
    showToast(tr.auth.acctBackingUp, 'info');
    try {
      await syncPersonal();
      showToast(tr.settings.syncedToCloud, 'success');
    } catch {
      showToast(tr.settings.syncFailedRetry, 'info');
    }
  }, [showToast, tr]);

  const handleGoogle = useCallback(async () => {
    if (busy) return;
    lightTap();
    setSocialLoading('google');
    try {
      const result = await signInWithGoogle();
      const auth = useAuthStore.getState();
      auth.setAuthenticated(true);
      auth.setVerified(true);
      auth.setUserId(result.userId);
      auth.setProvider('google');
      ensureProfile().catch(() => {});
      await enableBackup();
    } catch (e: any) {
      if (e?.code === statusCodes.SIGN_IN_CANCELLED) return;
      if (e?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) showToast(tr.auth.playServicesRequired, 'info');
      else showToast(tr.auth.socialSignInFailed, 'info');
    } finally {
      setSocialLoading(null);
    }
  }, [busy, enableBackup, showToast, tr]);

  const handleApple = useCallback(async () => {
    if (busy) return;
    lightTap();
    setSocialLoading('apple');
    try {
      const result = await signInWithApple();
      const auth = useAuthStore.getState();
      auth.setAuthenticated(true);
      auth.setVerified(true);
      auth.setUserId(result.userId);
      auth.setProvider('apple');
      ensureProfile().catch(() => {});
      await enableBackup();
    } catch (e: any) {
      if (e?.code === 'ERR_CANCELED' || e?.code === '1001') return;
      showToast(tr.auth.socialSignInFailed, 'info');
    } finally {
      setSocialLoading(null);
    }
  }, [busy, enableBackup, showToast, tr]);

  const cleanPhone = useCallback((raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('0')) return '60' + digits.slice(1);
    if (digits.startsWith('60')) return digits;
    return digits;
  }, []);

  const handlePhoneSubmit = useCallback(async () => {
    if (busy) return;
    setError('');
    const cleaned = cleanPhone(phone);
    if (cleaned.length < 10) { setError(tr.auth.errEnterValidPhone); return; }
    if (password.length < 6) { setError(tr.auth.errPasswordLen); return; }
    if (!isLogin && password !== confirmPassword) { setError(tr.auth.errPasswordMismatch); return; }

    Keyboard.dismiss();
    lightTap();
    setPhoneLoading(true);
    try {
      const data = isLogin
        ? await signInWithPhone(cleaned, password)
        : await signUpWithPhone(cleaned, password);
      if (data.session) {
        const auth = useAuthStore.getState();
        auth.setAuthenticated(true);
        auth.setUserId(data.session.user.id);
        auth.setPhone(cleaned);
        auth.setProvider('phone');
        // Deliberately NOT setVerified — personal backup needs only a session;
        // business mode keeps its own Telegram seller-verification gate.
        ensureProfile().catch(() => {});
        await enableBackup();
      }
    } catch (e: any) {
      const msg = e?.message || tr.auth.errSomethingWrong;
      if (msg.includes('Invalid login')) setError(tr.auth.errWrongCreds);
      else if (msg.includes('already registered') || msg.includes('already been registered')) setError(tr.auth.errAlreadyRegistered);
      else setError(msg.toLowerCase());
    } finally {
      setPhoneLoading(false);
    }
  }, [busy, cleanPhone, phone, password, confirmPassword, isLogin, enableBackup, tr]);

  const handleSyncNow = useCallback(async () => {
    if (syncing) return;
    lightTap();
    setSyncing(true);
    resetBackoff('personalSync');
    showToast(tr.settings.syncing, 'info');
    try {
      await syncPersonal();
      showToast(tr.settings.synced, 'success');
    } catch {
      showToast(tr.settings.syncFailed, 'info');
    } finally {
      setSyncing(false);
    }
  }, [syncing, showToast, tr]);

  const handleToggleBackup = useCallback((value: boolean) => {
    lightTap();
    if (value) { enableBackup(); return; }
    Alert.alert(tr.settings.turnOffCloudSync, tr.settings.turnOffCloudSyncMsg, [
      { text: tr.common.cancel, style: 'cancel' },
      {
        text: tr.settings.turnOff,
        onPress: async () => { await disablePersonalSync(false); showToast(tr.settings.cloudSyncDisabled, 'info'); },
      },
      {
        text: tr.settings.turnOffWipe,
        style: 'destructive',
        onPress: async () => { await disablePersonalSync(true); showToast(tr.settings.cloudSyncDisabledWiped, 'info'); },
      },
    ]);
  }, [enableBackup, showToast, tr]);

  const handleSignOut = useCallback(() => {
    lightTap();
    Alert.alert(tr.auth.acctSignOutTitle, tr.auth.acctSignOutMsg, [
      { text: tr.common.cancel, style: 'cancel' },
      {
        text: tr.settings.signOut,
        style: 'destructive',
        onPress: async () => {
          await disablePersonalSync(false);
          clearProfileCache();
          signOut().catch(() => {});
          useAuthStore.getState().reset();
        },
      },
    ]);
  }, [tr]);

  const providerName =
    provider === 'apple' ? tr.auth.acctProviderApple
      : provider === 'phone' ? tr.auth.acctProviderPhone
        : tr.auth.acctProviderGoogle;
  const avatarInitial = (email?.[0] ?? providerName?.[0] ?? '?').toUpperCase();

  const benefits = [
    { icon: 'cloud' as const, title: tr.auth.acctBenefitBackup, desc: tr.auth.acctBenefitBackupDesc },
    { icon: 'smartphone' as const, title: tr.auth.acctBenefitDevices, desc: tr.auth.acctBenefitDevicesDesc },
    { icon: 'lock' as const, title: tr.auth.acctBenefitPrivate, desc: tr.auth.acctBenefitPrivateDesc },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Pressable
        onPress={() => navigation.goBack()}
        style={styles.backBtn}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel={tr.common.cancel}
      >
        <Feather name="arrow-left" size={22} color={C.textPrimary} />
      </Pressable>

      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(80, insets.bottom + 40) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        bottomOffset={32}
      >
        <View style={styles.contentWrap}>
          {!isAuthenticated ? (
            <>
              {/* Hero */}
              <View style={styles.hero}>
                <View style={styles.iconCircle}>
                  <Feather name="cloud" size={28} color={C.accent} />
                </View>
                <Text style={styles.heroTitle}>{tr.auth.acctBackupTitle}</Text>
                <Text style={styles.heroSubtitle}>{tr.auth.acctBackupSubtitle}</Text>
              </View>

              {/* Benefits */}
              <View style={styles.benefits}>
                {benefits.map((b) => (
                  <View key={b.icon} style={styles.benefitRow}>
                    <View style={styles.benefitIcon}>
                      <Feather name={b.icon} size={16} color={C.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.benefitTitle}>{b.title}</Text>
                      <Text style={styles.benefitDesc}>{b.desc}</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Google */}
              <Pressable
                style={[styles.socialBtn, socialLoading === 'google' && { opacity: 0.6 }]}
                onPress={handleGoogle}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={tr.auth.continueWithGoogle}
              >
                {({ pressed }) => (
                  <View style={[styles.socialBtnInner, pressed && { opacity: 0.85 }]}>
                    {socialLoading === 'google' ? (
                      <ActivityIndicator color={C.textPrimary} size="small" />
                    ) : (
                      <>
                        <Text style={styles.googleG}>G</Text>
                        <Text style={styles.socialBtnText}>{tr.auth.continueWithGoogle}</Text>
                      </>
                    )}
                  </View>
                )}
              </Pressable>

              {/* Apple (iOS only) */}
              {Platform.OS === 'ios' && (
                <Pressable
                  style={[styles.socialBtn, styles.appleSocialBtn, socialLoading === 'apple' && { opacity: 0.6 }]}
                  onPress={handleApple}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityLabel={tr.auth.continueWithApple}
                >
                  {({ pressed }) => (
                    <View style={[styles.socialBtnInner, pressed && { opacity: 0.85 }]}>
                      {socialLoading === 'apple' ? (
                        <ActivityIndicator color={isDark ? C.background : '#FFFFFF'} size="small" />
                      ) : (
                        <>
                          <Feather name="command" size={18} color={isDark ? '#000000' : '#FFFFFF'} />
                          <Text style={[styles.socialBtnText, styles.appleBtnText]}>{tr.auth.continueWithApple}</Text>
                        </>
                      )}
                    </View>
                  )}
                </Pressable>
              )}

              {/* Divider */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{tr.auth.orContinueWith}</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Phone + password (no OTP for personal) */}
              <View style={styles.toggle}>
                <Pressable
                  style={[styles.toggleBtn, isLogin && styles.toggleActive]}
                  onPress={() => { setIsLogin(true); setError(''); }}
                >
                  <Text style={[styles.toggleText, isLogin && styles.toggleTextActive]}>{tr.auth.signIn}</Text>
                </Pressable>
                <Pressable
                  style={[styles.toggleBtn, !isLogin && styles.toggleActive]}
                  onPress={() => { setIsLogin(false); setError(''); }}
                >
                  <Text style={[styles.toggleText, !isLogin && styles.toggleTextActive]}>{tr.auth.signUp}</Text>
                </Pressable>
              </View>

              <View style={styles.fieldCard}>
                <Text style={styles.fieldLabel}>{tr.auth.phoneNumber}</Text>
                <View style={styles.phoneRow}>
                  <View style={styles.prefixBox}>
                    <Text style={styles.prefixText}>+60</Text>
                  </View>
                  <TextInput
                    style={[styles.fieldInput, { flex: 1 }]}
                    placeholder={tr.auth.phonePlaceholder}
                    placeholderTextColor={withAlpha(C.textPrimary, 0.25)}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    selectionColor={C.accent}
                  />
                </View>
              </View>

              <View style={styles.fieldCard}>
                <Text style={styles.fieldLabel}>{tr.auth.password}</Text>
                <View style={styles.passwordRow}>
                  <TextInput
                    ref={passwordRef}
                    style={[styles.fieldInput, { flex: 1, paddingRight: 36 }]}
                    placeholder={tr.auth.passwordPlaceholder}
                    placeholderTextColor={withAlpha(C.textPrimary, 0.25)}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoComplete={isLogin ? 'password' : 'new-password'}
                    returnKeyType={isLogin ? 'done' : 'next'}
                    onSubmitEditing={() => {
                      if (!isLogin) confirmRef.current?.focus();
                      else handlePhoneSubmit();
                    }}
                    keyboardAppearance={isDark ? 'dark' : 'light'}
                    selectionColor={C.accent}
                  />
                  <Pressable
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={tr.auth.password}
                  >
                    <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={C.textMuted} />
                  </Pressable>
                </View>
              </View>

              {!isLogin && (
                <View style={styles.fieldCard}>
                  <Text style={styles.fieldLabel}>{tr.auth.confirmPassword}</Text>
                  <View style={styles.passwordRow}>
                    <TextInput
                      ref={confirmRef}
                      style={[styles.fieldInput, { flex: 1, paddingRight: 36 }]}
                      placeholder={tr.auth.confirmPasswordPlaceholder}
                      placeholderTextColor={withAlpha(C.textPrimary, 0.25)}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showPassword}
                      autoComplete="new-password"
                      returnKeyType="done"
                      onSubmitEditing={handlePhoneSubmit}
                      keyboardAppearance={isDark ? 'dark' : 'light'}
                      selectionColor={C.accent}
                    />
                  </View>
                </View>
              )}

              {error ? (
                <View style={styles.errorBox}>
                  <Feather name="alert-circle" size={14} color={C.bronze} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                style={[styles.submitBtn, busy && { opacity: 0.6 }]}
                onPress={handlePhoneSubmit}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={isLogin ? tr.auth.signIn : tr.auth.createAccount}
              >
                {({ pressed }) => (
                  <View style={[styles.submitBtnInner, pressed && { opacity: 0.85 }]}>
                    {phoneLoading ? (
                      <ActivityIndicator color={C.onAccent} size="small" />
                    ) : (
                      <>
                        <Feather name={isLogin ? 'log-in' : 'user-plus'} size={16} color={C.onAccent} />
                        <Text style={styles.submitText}>{isLogin ? tr.auth.signIn : tr.auth.createAccount}</Text>
                      </>
                    )}
                  </View>
                )}
              </Pressable>

              <Pressable
                style={styles.switchHint}
                onPress={() => { setIsLogin(!isLogin); setError(''); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.switchHintText}>
                  {isLogin ? tr.auth.noAccountYet : tr.auth.alreadyHaveAccount}
                </Text>
              </Pressable>

              {/* Privacy footnote */}
              <Text style={styles.footnote}>
                {tr.auth.acctAgreePrefix}{' '}
                <Text style={styles.footnoteLink} onPress={() => Linking.openURL(PRIVACY_URL)}>
                  {tr.auth.acctPrivacyPolicy}
                </Text>
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.pageTitle}>{tr.auth.acctTitle}</Text>

              {/* Profile */}
              <View style={styles.card}>
                <View style={styles.profileRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{avatarInitial}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    {email ? <Text style={styles.profileEmail} numberOfLines={1}>{email}</Text> : null}
                    <Text style={styles.profileProvider}>
                      {tr.auth.acctSignedInWith} {providerName}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Cloud backup */}
              <View style={styles.card}>
                <View style={styles.settingRow}>
                  <View style={styles.settingLabelWrap}>
                    <View style={styles.settingLabelRow}>
                      <Feather name="cloud" size={18} color={C.textSecondary} />
                      <Text style={styles.settingLabel}>{tr.auth.acctCloudBackup}</Text>
                    </View>
                    <Text style={styles.settingDesc}>{tr.auth.acctCloudBackupDesc}</Text>
                  </View>
                  <Switch
                    value={personalSyncEnabled}
                    onValueChange={handleToggleBackup}
                    trackColor={{ false: C.border, true: C.positive }}
                    thumbColor={C.surface}
                  />
                </View>

                {personalSyncEnabled && (
                  <>
                    <View style={styles.divider} />
                    <View style={styles.settingRow}>
                      <View style={styles.settingLabelWrap}>
                        <View style={styles.settingLabelRow}>
                          <Feather name="refresh-cw" size={18} color={C.textSecondary} />
                          <Text style={styles.settingLabel}>{tr.settings.lastSync}</Text>
                        </View>
                        <Text style={styles.settingDesc}>
                          {lastPersonalSyncAt ? lastPersonalSyncAt.toLocaleString() : tr.settings.notSyncedYet}
                        </Text>
                      </View>
                      <Pressable
                        onPress={handleSyncNow}
                        disabled={syncing}
                        style={[styles.syncNowBtn, syncing && { opacity: 0.6 }]}
                        accessibilityRole="button"
                        accessibilityLabel={tr.settings.syncNow}
                      >
                        {syncing
                          ? <ActivityIndicator color={C.accent} size="small" />
                          : <Text style={styles.syncNowText}>{tr.settings.syncNow}</Text>}
                      </Pressable>
                    </View>
                  </>
                )}
              </View>

              {/* Sign out */}
              <Pressable
                style={styles.signOutBtn}
                onPress={handleSignOut}
                accessibilityRole="button"
                accessibilityLabel={tr.settings.signOut}
              >
                {({ pressed }) => (
                  <View style={[styles.signOutInner, pressed && { opacity: 0.7 }]}>
                    <Feather name="log-out" size={16} color={C.bronze} />
                    <Text style={styles.signOutText}>{tr.settings.signOut}</Text>
                  </View>
                )}
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  backBtn: {
    marginTop: SPACING.sm,
    marginLeft: SPACING.lg,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: SPACING.xl,
  },
  // Tablet cap — keep the column readable, centered on wide screens.
  contentWrap: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
  },

  // ── Signed-out hero ───────────────────────────────────────
  hero: {
    alignItems: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: withAlpha(C.accent, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  heroTitle: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.4,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.regular,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: SPACING.sm,
  },

  // ── Benefits ──────────────────────────────────────────────
  benefits: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.lg,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm + 2,
  },
  benefitIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: withAlpha(C.accent, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  benefitDesc: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginTop: 1,
  },

  // ── Social buttons (mirrors AuthScreen) ───────────────────
  socialBtn: {
    width: '100%',
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.full,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginBottom: SPACING.sm + 2,
  },
  appleSocialBtn: {
    backgroundColor: C === CALM_DARK ? '#FFFFFF' : '#000000',
    borderColor: C === CALM_DARK ? '#FFFFFF' : '#000000',
  },
  socialBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
  },
  googleG: {
    fontSize: 20,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: '#4285F4',
  },
  socialBtnText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    letterSpacing: 0.2,
  },
  appleBtnText: {
    color: C === CALM_DARK ? '#000000' : '#FFFFFF',
  },

  // ── Divider ───────────────────────────────────────────────
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: withAlpha(C.textPrimary, 0.10),
  },
  dividerText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.3,
  },

  // ── Phone form ────────────────────────────────────────────
  toggle: {
    flexDirection: 'row',
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.10 : 0.05),
    borderRadius: RADIUS.md,
    padding: 3,
    marginBottom: SPACING.md,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: SPACING.sm + 1,
    alignItems: 'center',
    borderRadius: RADIUS.sm + 2,
  },
  toggleActive: {
    backgroundColor: C === CALM_DARK ? withAlpha(C.textPrimary, 0.15) : C.surface,
    borderWidth: C === CALM_DARK ? 1 : 0,
    borderColor: withAlpha(C.textPrimary, 0.12),
    ...(C === CALM_DARK ? {} : SHADOWS.xs),
  },
  toggleText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: withAlpha(C.textPrimary, 0.35),
  },
  toggleTextActive: {
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  fieldCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.sm + 4,
    marginBottom: SPACING.sm + 2,
  },
  fieldLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  fieldInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
    paddingVertical: 2,
    minHeight: 22,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  prefixBox: {
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.08 : 0.04),
    borderRadius: RADIUS.sm + 2,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs + 1,
  },
  prefixText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  eyeBtn: {
    position: 'absolute',
    right: 0,
    padding: SPACING.xs,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm - 2,
    backgroundColor: withAlpha(C.bronze, 0.08),
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    marginBottom: SPACING.sm + 2,
  },
  errorText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
    flex: 1,
    lineHeight: 18,
  },
  submitBtn: {
    width: '100%',
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.full,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: SPACING.sm,
  },
  submitBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  submitText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
    letterSpacing: 0.3,
  },
  switchHint: {
    marginTop: SPACING.md,
    alignSelf: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  switchHintText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },
  footnote: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    textAlign: 'center',
    marginTop: SPACING.lg,
    lineHeight: 18,
  },
  footnoteLink: {
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ── Signed-in ─────────────────────────────────────────────
  pageTitle: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.4,
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingHorizontal: SPACING.md + 2,
    marginBottom: SPACING.md,
    ...(C === CALM_DARK ? {} : SHADOWS.sm),
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: withAlpha(C.accent, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
  profileEmail: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  profileProvider: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginTop: 2,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
  },
  settingLabelWrap: {
    flex: 1,
    paddingRight: SPACING.md,
  },
  settingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  settingLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  settingDesc: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginTop: 3,
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
  },
  syncNowBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: C.accent,
    backgroundColor: withAlpha(C.accent, 0.1),
    minWidth: 72,
    alignItems: 'center',
  },
  syncNowText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.accent,
  },
  signOutBtn: {
    marginTop: SPACING.sm,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  signOutInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  signOutText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },
});
