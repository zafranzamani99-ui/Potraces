import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { signUpWithPhone, signInWithPhone, requestOtp } from '../../services/supabase';
import { ensureProfile } from '../../services/sellerSync';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import { useT } from '../../i18n';

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
  const [error, setError] = useState('');

  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const cleanPhone = useCallback((raw: string) => {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('0')) return '60' + digits.slice(1);
    if (digits.startsWith('60')) return digits;
    return digits;
  }, []);

  const handleSubmit = useCallback(async () => {
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
    try {
      if (isLogin) {
        const data = await signInWithPhone(cleaned, password);
        if (data.session) {
          useAuthStore.getState().setAuthenticated(true);
          useAuthStore.getState().setUserId(data.session.user.id);
          useAuthStore.getState().setPhone(cleaned);

          await ensureProfile();
          const { data: profile } = await (await import('../../services/supabase')).supabase
            .from('seller_profiles')
            .select('is_verified')
            .eq('user_id', data.session.user.id)
            .maybeSingle();

          if (profile?.is_verified) {
            useAuthStore.getState().setVerified(true);
            onAuthenticated();
          } else {
            const otp = await requestOtp(cleaned);
            onVerificationNeeded(otp.code, cleaned);
          }
        }
      } else {
        const data = await signUpWithPhone(cleaned, password);
        if (data.session) {
          useAuthStore.getState().setAuthenticated(true);
          useAuthStore.getState().setUserId(data.session.user.id);
          useAuthStore.getState().setPhone(cleaned);

          await ensureProfile();
          const otp = await requestOtp(cleaned);
          onVerificationNeeded(otp.code, cleaned);
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
        bottomOffset={32}
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
              selectionColor={C.accent}
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
              selectionColor={C.accent}
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
                selectionColor={C.accent}
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
          style={[styles.submitBtn, loading && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={loading}
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
      </KeyboardAwareScrollView>
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
});

export default AuthScreen;
