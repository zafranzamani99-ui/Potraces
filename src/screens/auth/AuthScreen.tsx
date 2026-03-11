import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { signUpWithPhone, signInWithPhone, requestOtp } from '../../services/supabase';
import { ensureProfile } from '../../services/sellerSync';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';

interface AuthScreenProps {
  onVerificationNeeded: (code: string, phone: string) => void;
  onAuthenticated: () => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onVerificationNeeded, onAuthenticated }) => {
  const insets = useSafeAreaInsets();
  const [isLogin, setIsLogin] = useState(true);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);


  const cleanPhone = useCallback((raw: string) => {
    const digits = raw.replace(/\D/g, '');
    // Malaysian numbers: 01x-xxxx xxxx → 601xxxxxxxx
    if (digits.startsWith('0')) return '60' + digits.slice(1);
    if (digits.startsWith('60')) return digits;
    return digits;
  }, []);

  const handleSubmit = useCallback(async () => {
    setError('');
    const cleaned = cleanPhone(phone);
    if (cleaned.length < 10) {
      setError('enter a valid phone number');
      return;
    }
    if (password.length < 6) {
      setError('password must be at least 6 characters');
      return;
    }
    if (!isLogin && password !== confirmPassword) {
      setError('passwords do not match');
      return;
    }

    setLoading(true);
    try {
      if (isLogin) {
        // Login
        const data = await signInWithPhone(cleaned, password);
        if (data.session) {
          useAuthStore.getState().setAuthenticated(true);
          useAuthStore.getState().setUserId(data.session.user.id);
          useAuthStore.getState().setPhone(cleaned);

          // Check if verified
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
            // Need OTP verification
            const otp = await requestOtp(cleaned);
            onVerificationNeeded(otp.code, cleaned);
          }
        }
      } else {
        // Signup
        const data = await signUpWithPhone(cleaned, password);
        if (data.session) {
          useAuthStore.getState().setAuthenticated(true);
          useAuthStore.getState().setUserId(data.session.user.id);
          useAuthStore.getState().setPhone(cleaned);

          // Create profile + request OTP
          await ensureProfile();
          const otp = await requestOtp(cleaned);
          onVerificationNeeded(otp.code, cleaned);
        }
      }
    } catch (e: any) {
      const msg = e?.message || 'Something went wrong';
      if (msg.includes('Invalid login')) setError('wrong phone number or password');
      else if (msg.includes('already registered') || msg.includes('already been registered'))
        setError('this phone is already registered — try logging in');
      else setError(msg.toLowerCase());
    } finally {
      setLoading(false);
    }
  }, [phone, password, confirmPassword, isLogin, cleanPhone, onVerificationNeeded, onAuthenticated]);

  const handleBack = useCallback(() => {
    useAppStore.getState().setMode('personal');
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <TouchableOpacity onPress={handleBack} style={styles.backBtn} activeOpacity={0.7}>
        <Feather name="arrow-left" size={22} color={CALM.textPrimary} />
      </TouchableOpacity>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Feather name="briefcase" size={28} color={CALM.accent} />
            </View>
            <Text style={styles.title}>business mode</Text>
            <Text style={styles.subtitle}>
              {isLogin ? 'sign in to your account' : 'create your business account'}
            </Text>
          </View>

          {/* Toggle */}
          <View style={styles.toggle}>
            <TouchableOpacity
              style={[styles.toggleBtn, isLogin && styles.toggleActive]}
              onPress={() => { setIsLogin(true); setError(''); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.toggleText, isLogin && styles.toggleTextActive]}>sign in</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, !isLogin && styles.toggleActive]}
              onPress={() => { setIsLogin(false); setError(''); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.toggleText, !isLogin && styles.toggleTextActive]}>sign up</Text>
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Phone */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>phone number</Text>
              <View style={styles.phoneRow}>
                <View style={styles.prefixBox}>
                  <Text style={styles.prefixText}>+60</Text>
                </View>
                <TextInput
                  style={[styles.input, styles.phoneInput, focusedField === 'phone' && styles.inputFocused]}
                  placeholder="12-345 6789"
                  placeholderTextColor={CALM.textMuted}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  onFocus={() => setFocusedField('phone')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            </View>

            {/* Password */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>password</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  ref={passwordRef}
                  style={[styles.input, styles.passwordInput, focusedField === 'password' && styles.inputFocused]}
                  placeholder="min 6 characters"
                  placeholderTextColor={CALM.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoComplete={isLogin ? 'password' : 'new-password'}
                  returnKeyType={isLogin ? 'done' : 'next'}
                  onSubmitEditing={() => {
                    if (!isLogin) confirmRef.current?.focus();
                    else { Keyboard.dismiss(); handleSubmit(); }
                  }}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Feather name={showPassword ? 'eye-off' : 'eye'} size={18} color={CALM.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Confirm Password (signup only) */}
            {!isLogin && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>confirm password</Text>
                <TextInput
                  ref={confirmRef}
                  style={[styles.input, focusedField === 'confirm' && styles.inputFocused]}
                  placeholder="re-enter password"
                  placeholderTextColor={CALM.textMuted}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  autoComplete="new-password"
                  returnKeyType="done"
                  onSubmitEditing={() => { Keyboard.dismiss(); handleSubmit(); }}
                  onFocus={() => setFocusedField('confirm')}
                  onBlur={() => setFocusedField(null)}
                />
              </View>
            )}

            {/* Error */}
            {error ? (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={14} color={CALM.bronze} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitDisabled]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitText}>{isLogin ? 'sign in' : 'create account'}</Text>
              )}
            </TouchableOpacity>
          </View>
      </KeyboardAwareScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CALM.background },
  backBtn: { marginTop: 12, marginLeft: SPACING.lg, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: SPACING.lg, paddingBottom: 80 },
  header: { alignItems: 'center', marginTop: 16, marginBottom: 32 },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(79,81,4,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: CALM.textPrimary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textSecondary,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: CALM.pillBg,
    borderRadius: RADIUS.md,
    padding: 3,
    marginBottom: 24,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: RADIUS.md - 2,
  },
  toggleActive: {
    backgroundColor: CALM.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  toggleText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: '500' as const,
    color: CALM.textMuted,
  },
  toggleTextActive: {
    color: CALM.textPrimary,
    fontWeight: '600' as const,
  },
  form: {},
  inputGroup: { marginBottom: 16 },
  label: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: CALM.textSecondary,
    textTransform: 'lowercase',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  input: {
    backgroundColor: CALM.surface,
    borderWidth: 1.5,
    borderColor: CALM.inputBorder,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: CALM.textPrimary,
  },
  inputFocused: {
    borderColor: CALM.accent,
    backgroundColor: '#fff',
  },
  phoneRow: { flexDirection: 'row', gap: 8 },
  prefixBox: {
    backgroundColor: CALM.pillBg,
    borderRadius: RADIUS.md,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: CALM.inputBorder,
  },
  prefixText: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: CALM.textSecondary,
  },
  phoneInput: { flex: 1 },
  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1, paddingRight: 44 },
  eyeBtn: { position: 'absolute', right: 14 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(178,120,10,0.08)',
    borderRadius: RADIUS.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    color: CALM.bronze,
    flex: 1,
  },
  submitBtn: {
    backgroundColor: CALM.accent,
    borderRadius: RADIUS.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  submitDisabled: { opacity: 0.6 },
  submitText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#fff',
  },
});

export default AuthScreen;
