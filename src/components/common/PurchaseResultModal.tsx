import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import NeuButton from './NeuButton';

// Same deliberate off-palette exception as PaywallModal's VerifiedTick — the
// user approved this green for check seals. Everything else stays olive-family.
const SEAL_GREEN = '#22C55E';

type Props = {
  /** 'success' → olive-green seal + check draw · 'failed' → bronze seal + ! draw + wiggle */
  kind: 'success' | 'failed';
  /** e.g. "Premium" — interpolated into the success title. */
  tierName?: string;
  /** Optional failure detail (defaults to the generic i18n sub-line). */
  message?: string;
  onClose: () => void;
  /** Show "try again" as the primary action (purchase path only). */
  onRetry?: () => void;
};

/* ── Living decoration (loops while the modal is open) ── */

/** Expanding halo ring — phase-offset copies form a continuous pulse. */
const PulseRing: React.FC<{ loop: SharedValue<number>; offset: number; color: string }> = ({ loop, offset, color }) => {
  const style = useAnimatedStyle(() => {
    const p = (loop.value + offset) % 1;
    return {
      opacity: interpolate(p, [0, 0.65, 1], [0.55, 0.18, 0]),
      transform: [{ scale: interpolate(p, [0, 1], [0.72, 1.55]) }],
    };
  });
  return <Reanimated.View style={[styles.ring, { borderColor: color }, style]} />;
};

/** Orbiting sparkle — each dot owns a phase of the loop; drifts out, twinkles, drifts back. */
const Spark: React.FC<{ loop: SharedValue<number>; index: number; color: string }> = ({ loop, index, color }) => {
  const style = useAnimatedStyle(() => {
    const ang = (index * 36 * Math.PI) / 180;
    const p = (loop.value + index / 10) % 1;
    const dist = interpolate(p, [0, 0.5, 1], [34, 62, 34]);
    return {
      opacity: interpolate(p, [0, 0.5, 1], [0.15, 0.95, 0.15]),
      transform: [
        { translateX: Math.cos(ang) * dist },
        { translateY: Math.sin(ang) * dist },
        { scale: interpolate(p, [0, 0.5, 1], [0.6, 1.15, 0.6]) },
      ],
    };
  });
  return <Reanimated.View style={[styles.spark, { backgroundColor: color }, style]} />;
};

const RINGS = [0, 1];
const SPARKS = Array.from({ length: 10 });

/**
 * Floating purchase-result overlay — render INSIDE a sheet's tree (absolute-fill,
 * no RN <Modal>: a nested Modal would present behind a Modal sheet on iOS).
 * NO entrance animation — the modal just appears (user request). The content
 * stays ALIVE while open: halo rings pulse, sparkles orbit (success), the seal
 * breathes (failed).
 */
export const PurchaseResultModal: React.FC<Props> = ({ kind, tierName, message, onClose, onRetry }) => {
  const C = useCalm();
  const t = useT();
  const success = kind === 'success';
  const loop = useSharedValue(0);

  useEffect(() => {
    loop.value = 0;
    loop.value = withRepeat(withTiming(1, { duration: 1900, easing: Easing.linear }), -1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const sealStyle = useAnimatedStyle(() => ({
    transform: [{ scale: success ? 1 : interpolate(loop.value, [0, 0.5, 1], [1, 1.05, 1]) }],
  }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[styles.backdrop, { opacity: 0.5 }]} />
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View
        style={[styles.card, { backgroundColor: C.surface, borderColor: withAlpha(C.textPrimary, 0.08) }]}
        onStartShouldSetResponder={() => true}
      >
        <View style={styles.sealWrap}>
          {RINGS.map((i) => (
            <PulseRing key={i} loop={loop} offset={i * 0.5} color={success ? SEAL_GREEN : C.bronze} />
          ))}
          {success &&
            SPARKS.map((_, i) => (
              <Spark key={i} loop={loop} index={i} color={i % 3 === 0 ? SEAL_GREEN : i % 3 === 1 ? C.gold : C.accent} />
            ))}
          <Reanimated.View style={sealStyle}>
            <Svg width={110} height={110} viewBox="0 0 100 100">
              <Circle cx={50} cy={50} r={46} fill={success ? SEAL_GREEN : C.bronze} />
              {success ? (
                <Path
                  d="M28 52 L44 67 L73 37"
                  fill="none"
                  stroke="#fff"
                  strokeWidth={8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : (
                <Path d="M50 30 L50 58" fill="none" stroke="#fff" strokeWidth={8} strokeLinecap="round" />
              )}
              {!success && <Circle cx={50} cy={72} r={4.5} fill="#fff" />}
            </Svg>
          </Reanimated.View>
        </View>
        <Text style={[styles.title, { color: C.textPrimary }]}>
          {success
            ? t.paywall.purchaseSuccessTitle.replace('{tier}', tierName ?? 'Premium')
            : t.paywall.purchaseFailedTitle}
        </Text>
        <Text style={[styles.sub, { color: C.textSecondary }]}>
          {success ? t.paywall.purchaseSuccessSub : (message ?? t.paywall.purchaseFailedSub)}
        </Text>
        <View style={styles.ctaCol}>
          <NeuButton
            label={success ? t.paywall.purchaseSuccessCta : onRetry ? t.paywall.purchaseRetry : t.paywall.purchaseLater}
            onPress={success ? onClose : (onRetry ?? onClose)}
          />
          {!success && onRetry ? (
            <Pressable onPress={onClose} style={styles.ghostWrap}>
              <Text style={[styles.ghost, { color: C.textMuted }]}>{t.paywall.purchaseLater}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  card: {
    position: 'absolute',
    alignSelf: 'center',
    top: '24%',
    width: '84%',
    maxWidth: 420,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    padding: SPACING['2xl'],
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 20 },
    elevation: 12,
  },
  sealWrap: {
    width: 150,
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 75,
    borderWidth: 2,
  },
  spark: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  title: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    textAlign: 'center',
    marginTop: SPACING.lg,
    letterSpacing: -0.5,
  },
  sub: {
    fontSize: TYPOGRAPHY.size.base,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: SPACING.sm,
  },
  ctaCol: {
    alignSelf: 'stretch',
    marginTop: SPACING.xl,
    gap: SPACING.md,
  },
  ghostWrap: { alignSelf: 'center', padding: SPACING.xs },
  ghost: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold },
});

export default PurchaseResultModal;

