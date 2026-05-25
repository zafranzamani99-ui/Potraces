import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, AppState } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { useSettingsStore } from '../../store/settingsStore';
import { useCalm } from '../../hooks/useCalm';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';

/**
 * Gates the app behind a biometric prompt when:
 *  - settingsStore.biometricLockEnabled is true, AND
 *  - the app has been in background longer than biometricLockTimeoutMin minutes, AND
 *  - device supports biometrics AND user has enrolled at least one method.
 *
 * While locked, renders a blocking overlay over all children.
 */
const BiometricGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const C = useCalm();
  const enabled = useSettingsStore((s) => s.biometricLockEnabled);
  const timeoutMin = useSettingsStore((s) => s.biometricLockTimeoutMin);

  const [locked, setLocked] = useState<boolean>(enabled);
  const [authenticating, setAuthenticating] = useState(false);
  const lastActiveAtRef = useRef<number>(Date.now());

  const tryUnlock = useCallback(async () => {
    if (authenticating) return;
    setAuthenticating(true);
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !enrolled) {
        // Device can't authenticate; fall through so user isn't locked out.
        setLocked(false);
        return;
      }
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Potraces',
        fallbackLabel: 'Use passcode',
        cancelLabel: 'Cancel',
      });
      if (res.success) {
        setLocked(false);
        lastActiveAtRef.current = Date.now();
      }
    } finally {
      setAuthenticating(false);
    }
  }, [authenticating]);

  // When the feature flag flips on, immediately lock.
  useEffect(() => {
    if (enabled) setLocked(true);
    else setLocked(false);
  }, [enabled]);

  // Trigger initial unlock once the gate is locked.
  useEffect(() => {
    if (locked && !authenticating) {
      tryUnlock();
    }
  }, [locked, authenticating, tryUnlock]);

  // Re-lock when the app returns from background after timeout.
  useEffect(() => {
    if (!enabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        lastActiveAtRef.current = Date.now();
      } else if (state === 'active') {
        const elapsedMin = (Date.now() - lastActiveAtRef.current) / 60000;
        if (elapsedMin >= timeoutMin) {
          setLocked(true);
        }
      }
    });
    return () => sub.remove();
  }, [enabled, timeoutMin]);

  if (!enabled || !locked) return <>{children}</>;

  return (
    <View style={{ flex: 1 }}>
      {children}
      <View style={[styles.overlay, { backgroundColor: C.background }]}>
        <View style={[styles.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={styles.iconCircle}>
            <Feather name="lock" size={32} color={C.accent} />
          </View>
          <Text style={[styles.title, { color: C.textPrimary }]}>Potraces is locked</Text>
          <Text style={[styles.sub, { color: C.textSecondary }]}>
            Unlock with Face ID, fingerprint, or device passcode.
          </Text>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: C.accent }]}
            onPress={tryUnlock}
            activeOpacity={0.85}
            disabled={authenticating}
          >
            <Feather name="unlock" size={16} color={C.onAccent} />
            <Text style={[styles.btnText, { color: C.onAccent }]}>{authenticating ? 'Authenticating…' : 'Unlock'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0, right: 0, bottom: 0, left: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  card: {
    width: '86%',
    maxWidth: 340,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    padding: SPACING['2xl'],
    alignItems: 'center',
    ...SHADOWS.lg,
  },
  iconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: withAlpha(CALM.accent, 0.08),
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  title: { fontSize: 20, fontWeight: TYPOGRAPHY.weight.semibold, marginBottom: 6 },
  sub: { fontSize: 14, textAlign: 'center', marginBottom: SPACING.lg, lineHeight: 20 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
  },
  btnText: { fontWeight: TYPOGRAPHY.weight.semibold, fontSize: 15 },
});

export default BiometricGate;
