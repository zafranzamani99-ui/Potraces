import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import Svg, { Path } from 'react-native-svg';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { signUpWithPhone, signInWithPhone, requestOtp, supabaseBusiness } from '../../services/supabase';
import { ensureProfile } from '../../services/sellerSync';
import { signInWithGoogle, statusCodes } from '../../services/googleAuth';
import { signInWithApple } from '../../services/appleAuth';
import { confirmReuse } from '../../services/reuseAccount';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import WauLoader from '../../components/common/WauLoader';
import { useT } from '../../i18n';

// Official 4-color Google "G". ponytail: brand hex is spec-mandated, not theme tokens.
const GoogleGLogo = ({ size = 18 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 48 48">
    <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </Svg>
);

interface AuthScreenProps {
  onVerificationNeeded: (code: string, phone: string) => void;
  onAuthenticated: () => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onVerificationNeeded, onAuthenticated }) => {
  const C = useCalm();
  const isDark = useIsDark();
  const tr = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const [isLogin, setIsLogin] = useState(true);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);
  const [error, setError] = useState('');

  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const anyLoading = loading || !!socialLoading;

  const cleanPhone = useCallback((raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('0')) return '60' + digits.slice(1);
    if (digits.startsWith('60')) return digits;
    return digits;
  }, []);

  const handleSubmit = useCallback(async () => {
    Keyboard.dismiss();
    setError('');
    const cleaned = cleanPhone(phone);
    if (cleaned.length < 10) {
      setError(tr.auth.errEnterValidPhone);
      return;
    }
    if (password.length < 6) {
      setError(tr.auth.errPasswordLen);
      return;
    }
    if (!isLogin && password !== confirmPassword) {
      setError(tr.auth.errPasswordMismatch);
      return;
    }

    setLoading(true);
    // Keep the wau loader up for a beat so it reads as motion, not a flicker.
    const startedAt = Date.now();
    const holdLoader = async () => {
      const rest = 2000 - (Date.now() - startedAt);
      if (rest > 0) await new Promise((r) => setTimeout(r, rest));
    };
    try {
      if (isLogin) {
        const data = await signInWithPhone(cleaned, password, supabaseBusiness);
        if (data.session) {
          const userId = data.session.user.id;
          await ensureProfile();
          await holdLoader();
          // Seamless sign-in: Telegram is a ONE-TIME gate at sign-up. A returning
          // user who knows the password goes straight in — the wau loader covers
          // the moment, no verify screen. (Sign-up below still verifies once.)
          useAuthStore.getState().setBusinessAuth({
            isAuthenticated: true, isVerified: true, userId, phone: cleaned, provider: 'phone',
          });
          onAuthenticated();
          confirmReuse('personal', { provider: 'phone', phone: cleaned, password }, tr);
        }
      } else {
        const data = await signUpWithPhone(cleaned, password, supabaseBusiness);
        if (data.session) {
          await ensureProfile();
          const otp = await requestOtp(cleaned, supabaseBusiness);
          await holdLoader();
          // Set the OTP code BEFORE flipping isAuthenticated so the gate lands
          // straight on the verify screen (no setup-screen flash in between).
          onVerificationNeeded(otp.code, cleaned);
          useAuthStore.getState().setBusinessAuth({
            isAuthenticated: true, userId: data.session.user.id, phone: cleaned, provider: 'phone',
          });
        }
      }
    } catch (e: any) {
      const msg = e?.message || tr.auth.errSomethingWrong;
      if (msg.includes('Invalid login')) setError(tr.auth.errWrongCreds);
      else if (msg.includes('already registered') || msg.includes('already been registered'))
        setError(tr.auth.errAlreadyRegistered);
      else setError(msg.toLowerCase());
    } finally {
      setLoading(false);
    }
  }, [phone, password, confirmPassword, isLogin, cleanPhone, onVerificationNeeded, onAuthenticated, tr]);

  const handleGoogleSignIn = useCallback(async () => {
    if (anyLoading) return;
    setError('');
    setSocialLoading('google');
    try {
      const result = await signInWithGoogle(supabaseBusiness);
      useAuthStore.getState().setBusinessAuth({
        isAuthenticated: true, isVerified: true, userId: result.userId, provider: 'google',
      });
      await ensureProfile();
      onAuthenticated();
      confirmReuse('personal', { provider: 'google' }, tr);
    } catch (e: any) {
      if (e?.code === statusCodes.SIGN_IN_CANCELLED) return;
      if (e?.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setError(tr.auth.playServicesRequired);
      } else {
        setError(tr.auth.socialSignInFailed);
      }
    } finally {
      setSocialLoading(null);
    }
  }, [anyLoading, onAuthenticated, tr]);

  const handleAppleSignIn = useCallback(async () => {
    if (anyLoading) return;
    setError('');
    setSocialLoading('apple');
    try {
      const result = await signInWithApple(supabaseBusiness);
      useAuthStore.getState().setBusinessAuth({
        isAuthenticated: true, isVerified: true, userId: result.userId, provider: 'apple',
      });
      await ensureProfile();
      onAuthenticated();
      confirmReuse('personal', { provider: 'apple' }, tr);
    } catch (e: any) {
      if (e?.code === 'ERR_CANCELED' || e?.code === '1001') return;
      setError(tr.auth.socialSignInFailed);
    } finally {
      setSocialLoading(null);
    }
  }, [anyLoading, onAuthenticated, tr]);

  const handleBack = useCallback(() => {
    useAppStore.getState().setMode('personal');
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Pressable onPress={handleBack} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Feather name="arrow-left" size={22} color={C.textPrimary} />
      </Pressable>

      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(80, insets.bottom + 40) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        bottomOffset={120}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Feather name="bar-chart-2" size={26} color={C.accent} />
          </View>
          <Text style={styles.title}>
            business <Text style={styles.titleAccent}>mode</Text>
          </Text>
          <Text style={styles.subtitle}>
            {isLogin ? tr.auth.signInSub : tr.auth.signUpSub}
          </Text>
        </View>

        {/* Toggle */}
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

        {/* Phone */}
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
              selectionColor={withAlpha(C.accent, 0.25)}
            />
          </View>
        </View>

        {/* Password */}
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
                else { Keyboard.dismiss(); handleSubmit(); }
              }}
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={withAlpha(C.accent, 0.25)}
            />
            <Pressable
              onPress={() => setShowPassword(!showPassword)}
              style={styles.eyeBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={C.textMuted} />
            </Pressable>
          </View>
        </View>

        {/* Confirm Password (signup only) */}
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
                onSubmitEditing={() => { Keyboard.dismiss(); handleSubmit(); }}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={withAlpha(C.accent, 0.25)}
              />
              <Pressable
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={C.textMuted} />
              </Pressable>
            </View>
          </View>
        )}

        {/* Error */}
        {error ? (
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={14} color={C.bronze} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Submit */}
        <Pressable
          style={[styles.submitBtn, anyLoading && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={anyLoading}
        >
          {({ pressed }) => (
            <View style={[styles.submitBtnInner, pressed && { opacity: 0.85 }]}>
              {loading ? (
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

        {/* Switch mode hint */}
        <Pressable
          style={styles.switchHint}
          onPress={() => { setIsLogin(!isLogin); setError(''); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.switchHintText}>
            {isLogin ? tr.auth.noAccountYet || "don't have an account?" : tr.auth.alreadyHaveAccount || 'already have an account?'}
          </Text>
        </Pressable>

        {/* ─── Social sign-in ──────────────────────────────────── */}
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>{tr.auth.orContinueWith}</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* Google */}
        <Pressable
          style={[styles.socialBtn, socialLoading === 'google' && { opacity: 0.6 }]}
          onPress={handleGoogleSignIn}
          disabled={anyLoading}
        >
          {({ pressed }) => (
            <View style={[styles.socialBtnInner, pressed && { opacity: 0.85 }]}>
              {socialLoading === 'google' ? (
                <ActivityIndicator color="#1F1F1F" size="small" />
              ) : (
                <>
                  <GoogleGLogo size={18} />
                  <Text style={styles.socialBtnText}>{tr.auth.continueWithGoogle}</Text>
                </>
              )}
            </View>
          )}
        </Pressable>

        {/* Apple (iOS only) */}
        {Platform.OS === 'ios' && (
          <Pressable
            style={[styles.socialBtn, socialLoading === 'apple' && { opacity: 0.6 }]}
            onPress={handleAppleSignIn}
            disabled={anyLoading}
          >
            {({ pressed }) => (
              <View style={[styles.socialBtnInner, pressed && { opacity: 0.85 }]}>
                {socialLoading === 'apple' ? (
                  <ActivityIndicator color="#1F1F1F" size="small" />
                ) : (
                  <>
                    <Ionicons name="logo-apple" size={19} color="#000000" />
                    <Text style={styles.socialBtnText}>{tr.auth.continueWithApple}</Text>
                  </>
                )}
              </View>
            )}
          </Pressable>
        )}
      </KeyboardAwareScrollView>

      {anyLoading && <WauLoader label={tr.auth.checkingVerification} />}
    </View>
  );
};

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
  header: {
    alignItems: 'center',
    marginTop: SPACING.xl,
    marginBottom: SPACING.xl + SPACING.md,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: withAlpha(C.accent, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.4,
    marginBottom: SPACING.xs,
  },
  titleAccent: {
    fontStyle: 'italic',
    fontFamily: 'serif',
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.accent,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.regular,
    letterSpacing: 0.1,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.10 : 0.05),
    borderRadius: RADIUS.md,
    padding: 3,
    marginBottom: SPACING.lg + SPACING.xs,
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
    ...(C === CALM_DARK ? {} : {
      shadowColor: C.textPrimary,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 2,
      elevation: 1,
    }),
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
    marginTop: SPACING.lg,
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

  // ─── Social sign-in ──────────────────────────────────────
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
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
  // ponytail: fixed white brand buttons in both themes — matches Google/Apple guidelines.
  socialBtn: {
    width: '100%',
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.full,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DADCE0',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginBottom: SPACING.sm + 2,
  },
  socialBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm + 2,
  },
  socialBtnText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#1F1F1F',
    letterSpacing: 0.2,
  },
});

export default AuthScreen;
