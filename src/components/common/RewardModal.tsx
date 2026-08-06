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
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { navigationRef } from '../../navigation/navigationRef';
import NeuButton from './NeuButton';

// Same deliberate off-palette exception as PurchaseResultModal — the user
// approved this green for check seals. Everything else stays olive-family.
const SEAL_GREEN = '#22C55E';

/** One surprise grant the user has never been shown (my_entitlement new_rewards). */
export interface NewReward {
  source: string;
  tier: string;
  days: number;
}

export type RewardModalProps =
  | { kind: 'earned'; rewards: NewReward[] }
  | { kind: 'intro'; welcomeDays: number; days: number; tier: string; batch: number }
  | { kind: 'info'; icon: 'gift' | 'info'; title: string; body: string };

type Props = RewardModalProps & { onClose: () => void };

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

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Floating rewards overlay — rendered via RootSiblings (RewardModalContext),
 * absolute-fill, no RN <Modal>, NO entrance animation (user request). The
 * content stays ALIVE while open: halo rings pulse, sparkles orbit.
 * Two kinds:
 *  - 'earned': a surprise grant just landed (referrer payout, Collectz
 *    milestone, admin manual) — green check seal, single CTA.
 *  - 'intro': one-time invite-rewards explainer — gold gift seal, CTA jumps
 *    to the Invite screen, ghost dismisses.
 *  - 'info': on-demand explainer (Collectz how-it-works / reward buttons) —
 *    gold gift or info seal, literal title/body, single CTA.
 */
export const RewardModal: React.FC<Props> = (props) => {
  const C = useCalm();
  const t = useT();
  const { onClose } = props;
  const earned = props.kind === 'earned';
  const loop = useSharedValue(0);

  useEffect(() => {
    loop.value = 0;
    loop.value = withRepeat(withTiming(1, { duration: 1900, easing: Easing.linear }), -1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earned]);

  const fill = (s: string, vars: Record<string, string | number>) =>
    Object.keys(vars).reduce((out, k) => out.split(`{${k}}`).join(String(vars[k])), s);

  let title = '';
  let sub = '';
  let ctaLabel = '';
  let onCta = onClose;
  let ghostLabel: string | null = null;
  let seal: 'check' | 'gift' | 'info' = 'check';

  if (props.kind === 'earned') {
    const days = props.rewards.reduce((n, r) => n + (typeof r.days === 'number' ? r.days : 0), 0);
    const primary = props.rewards.reduce<NewReward | null>(
      (best, r) => (!best || r.days > best.days ? r : best),
      null
    );
    const tier = cap(primary?.tier ?? 'pro');
    const body =
      primary?.source === 'referral_reward'
        ? t.rewards.earnedBodyReferral
        : primary?.source === 'collectz_milestone'
          ? t.rewards.earnedBodyMilestone
          : primary?.source === 'share_reward'
            ? t.rewards.earnedBodyShare
            : t.rewards.earnedBodyGeneric;
    title = fill(t.rewards.earnedTitle, { days, tier });
    sub = fill(body, { days, tier });
    ctaLabel = t.rewards.earnedCta;
  } else if (props.kind === 'intro') {
    const tier = cap(props.tier || 'pro');
    title = fill(t.rewards.introTitle, { tier });
    sub = fill(t.rewards.introBody, { welcome: props.welcomeDays, days: props.days, tier, batch: props.batch });
    ctaLabel = t.rewards.introCta;
    onCta = () => {
      if (navigationRef.isReady()) {
        (navigationRef as any).navigate('EarnPro', { tab: 'invite' });
      }
      onClose();
    };
    ghostLabel = t.rewards.introLater;
    seal = 'gift';
  } else {
    // info — Collectz screen's how-it-works / reward explainers.
    title = props.title;
    sub = props.body;
    ctaLabel = t.common.gotIt;
    seal = props.icon;
  }

  const sealColor = props.kind === 'earned' ? SEAL_GREEN : C.gold;

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
            <PulseRing key={i} loop={loop} offset={i * 0.5} color={sealColor} />
          ))}
          {SPARKS.map((_, i) => (
            <Spark key={i} loop={loop} index={i} color={i % 3 === 0 ? sealColor : i % 3 === 1 ? C.gold : C.accent} />
          ))}
          <Svg width={110} height={110} viewBox="0 0 100 100">
            <Circle cx={50} cy={50} r={46} fill={sealColor} />
            {seal === 'check' ? (
              <Path
                d="M28 52 L44 67 L73 37"
                fill="none"
                stroke="#fff"
                strokeWidth={8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : seal === 'info' ? (
              <>
                <Path d="M50 30 L50 58" fill="none" stroke="#fff" strokeWidth={8} strokeLinecap="round" />
                <Circle cx={50} cy={72} r={4.5} fill="#fff" />
              </>
            ) : (
              <>
                <Rect x={28} y={44} width={44} height={32} rx={4} fill="#fff" />
                <Rect x={24} y={35} width={52} height={11} rx={3} fill="#fff" />
                <Rect x={47} y={35} width={6} height={41} fill={sealColor} />
              </>
            )}
          </Svg>
        </View>
        <Text style={[styles.title, { color: C.textPrimary }]}>{title}</Text>
        <Text style={[styles.sub, { color: C.textSecondary }]}>{sub}</Text>
        <View style={styles.ctaCol}>
          <NeuButton label={ctaLabel} onPress={onCta} />
          {ghostLabel ? (
            <Pressable onPress={onClose} style={styles.ghostWrap}>
              <Text style={[styles.ghost, { color: C.textMuted }]}>{ghostLabel}</Text>
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

export default RewardModal;
