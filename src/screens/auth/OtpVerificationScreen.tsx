import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  ActivityIndicator,
  AppState,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { CALM, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { supabase, requestOtp, checkVerification } from '../../services/supabase';
import { useAuthStore } from '../../store/authStore';

interface OtpVerificationScreenProps {
  code: string;
  phone: string;
  onVerified: () => void;
  onBack?: () => void;
  initialError?: string | null;
}

const OtpVerificationScreen: React.FC<OtpVerificationScreenProps> = ({
  code: initialCode,
  phone,
  onVerified,
  onBack,
  initialError,
}) => {
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState(initialCode);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(initialError || null);

  // Sync code when parent provides it after async request
  useEffect(() => {
    if (initialCode) setCode(initialCode);
  }, [initialCode]);

  // Sync initialError from parent
  useEffect(() => {
    if (initialError) setError(initialError);
  }, [initialError]);
  const [requesting, setRequesting] = useState(false);
  const [checking, setChecking] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Realtime subscription for instant OTP verification detection
  useEffect(() => {
    const userId = useAuthStore.getState().userId;
    if (!userId) return;

    const channel = supabase
      .channel('otp-status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'otp_verifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if ((payload.new as any).status === 'verified') {
            useAuthStore.getState().setVerified(true);
            onVerified();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [onVerified]);

  // Fallback polling every 5s
  useEffect(() => {
    pollRef.current = setInterval(async () => {
      const verified = await checkVerification();
      if (verified) {
        useAuthStore.getState().setVerified(true);
        onVerified();
      }
    }, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [onVerified]);

  // Also check on app foreground (user might come back from Telegram)
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active') {
        const verified = await checkVerification();
        if (verified) {
          useAuthStore.getState().setVerified(true);
          onVerified();
        }
      }
    });
    return () => sub.remove();
  }, [onVerified]);

  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const handleOpenTelegram = useCallback(() => {
    Linking.openURL('tg://resolve?domain=PotracesBot').catch(() => {
      // Fallback to web URL if Telegram not installed
      Linking.openURL('https://t.me/PotracesBot');
    });
  }, []);

  const handleRequestNew = useCallback(async () => {
    setRequesting(true);
    setError(null);
    try {
      const otp = await requestOtp(phone);
      setCode(otp.code);
    } catch (err: any) {
      setError(err?.message || 'Failed to get new code. Try again.');
    } finally {
      setRequesting(false);
    }
  }, [phone]);

  const handleCheckNow = useCallback(async () => {
    setChecking(true);
    try {
      const verified = await checkVerification();
      if (verified) {
        useAuthStore.getState().setVerified(true);
        onVerified();
      }
    } catch {
      // silently fail
    } finally {
      setChecking(false);
    }
  }, [onVerified]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {onBack && (
        <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={CALM.textPrimary} />
        </TouchableOpacity>
      )}
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Feather name="shield" size={28} color={CALM.accent} />
          </View>
          <Text style={styles.title}>verify your account</Text>
          <Text style={styles.subtitle}>
            send this code to our Telegram bot to complete verification
          </Text>
        </View>

        {/* Code display */}
        <TouchableOpacity style={styles.codeBox} onPress={code ? handleCopy : undefined} activeOpacity={0.7}>
          {code ? (
            <>
              <Text style={styles.codeText}>{code}</Text>
              <View style={styles.copyRow}>
                <Feather name={copied ? 'check' : 'copy'} size={14} color={CALM.accent} />
                <Text style={styles.copyText}>{copied ? 'copied!' : 'tap to copy'}</Text>
              </View>
            </>
          ) : (
            <ActivityIndicator size="small" color={CALM.accent} style={{ paddingVertical: 12 }} />
          )}
        </TouchableOpacity>

        {/* Steps */}
        <View style={styles.steps}>
          <View style={styles.step}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>1</Text></View>
            <Text style={styles.stepText}>copy the code above</Text>
          </View>
          <View style={styles.step}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>2</Text></View>
            <Text style={styles.stepText}>open @PotracesBot on Telegram</Text>
          </View>
          <View style={styles.step}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>3</Text></View>
            <Text style={styles.stepText}>send the code to the bot</Text>
          </View>
          <View style={styles.step}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>4</Text></View>
            <Text style={styles.stepText}>come back here — we'll detect it automatically</Text>
          </View>
        </View>

        {/* Open Telegram button */}
        <TouchableOpacity style={styles.telegramBtn} onPress={handleOpenTelegram} activeOpacity={0.8}>
          <Feather name="send" size={18} color="#fff" />
          <Text style={styles.telegramText}>open Telegram</Text>
        </TouchableOpacity>

        {/* Waiting indicator */}
        <View style={styles.waitingRow}>
          <ActivityIndicator size="small" color={CALM.textMuted} />
          <Text style={styles.waitingText}>waiting for verification...</Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity onPress={handleCheckNow} disabled={checking} style={styles.linkBtn}>
            <Text style={styles.linkText}>
              {checking ? 'checking...' : 'check now'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.dot}>·</Text>
          <TouchableOpacity onPress={handleRequestNew} disabled={requesting} style={styles.linkBtn}>
            <Text style={styles.linkText}>
              {requesting ? 'requesting...' : 'get new code'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Error feedback */}
        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CALM.background },
  backBtn: { marginTop: 12, marginLeft: SPACING.lg, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  content: { flex: 1, paddingHorizontal: SPACING.lg, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 28 },
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
    fontSize: 22,
    fontWeight: '700' as const,
    color: CALM.textPrimary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  codeBox: {
    backgroundColor: CALM.surface,
    borderWidth: 2,
    borderColor: CALM.accent,
    borderRadius: RADIUS.lg,
    paddingVertical: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  codeText: {
    fontSize: 32,
    fontWeight: '800' as const,
    color: CALM.accent,
    letterSpacing: 6,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  copyText: { fontSize: 12, color: CALM.accent, fontWeight: '500' as const },
  steps: { marginBottom: 24 },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: CALM.pillBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: CALM.textSecondary,
  },
  stepText: {
    fontSize: 14,
    color: CALM.textPrimary,
    flex: 1,
  },
  telegramBtn: {
    backgroundColor: CALM.accent,
    borderRadius: RADIUS.md,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  telegramText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#fff',
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  waitingText: {
    fontSize: 13,
    color: CALM.textMuted,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  linkBtn: { paddingVertical: 4, paddingHorizontal: 2 },
  linkText: {
    fontSize: 13,
    color: CALM.accent,
    fontWeight: '500' as const,
  },
  dot: { color: CALM.textMuted, fontSize: 13 },
  errorText: {
    fontSize: 12,
    color: CALM.textSecondary,
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },
});

export default OtpVerificationScreen;
