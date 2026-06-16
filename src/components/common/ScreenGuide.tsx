/**
 * ScreenGuide — first-visit spotlight.
 *
 * Two beats, fully skippable, shown once per screen:
 *  1. The screen dims under a scrim and a welcome card introduces the place
 *     (title + one moment-led line).
 *  2. The scrim CUTS A HOLE around the screen's REAL primary control —
 *     measured live from a ref — and a small card next to it says what that
 *     control does. The app physically points at its own button.
 *
 * Honest fallbacks: if the target can't be measured (conditional FAB not
 * rendered on first visit, view not mounted yet), the welcome card carries
 * the "how" rows inline instead and there is no second beat. Tap anywhere
 * advances; the whole thing never shows again after dismissal
 * (settingsStore.dismissedHints).
 *
 * Geometry: the hole is computed as target-window-coords minus
 * overlay-window-coords, so it is correct regardless of headers, status bar
 * or platform insets. The scrim is an SVG even-odd path (rounded hole).
 */
import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import RAnimated, { FadeIn, FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { RootSiblingPortal } from 'react-native-root-siblings';
import Svg, { Path } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useSettingsStore } from '../../store/settingsStore';
import { useT } from '../../i18n';
import { lightTap } from '../../services/haptics';
import DuoIcon, { FEATHER_TO_GLYPH } from './DuoIcon';

interface SpotlightTarget {
  /** Ref to the screen's real primary control (FAB, input bar, shutter…). */
  targetRef: React.RefObject<any>;
  /** What that control does — one line. */
  label: string;
  /** The follow-up behaviour — one line, optional. */
  sublabel?: string;
}

interface ScreenGuideProps {
  id: string;
  title: string;
  description: string;
  icon?: keyof typeof Feather.glyphMap;
  accent?: string;
  /** Inline "how" rows — shown in the welcome card when no spotlight target is measurable. */
  points?: { icon: keyof typeof Feather.glyphMap; text: string }[];
  /** Beat 2: highlight the real control. Skipped gracefully if unmeasurable. */
  spotlight?: SpotlightTarget;
}

const HOLE_PAD = 8;
const HOLE_RADIUS = 18;
const DIM = 'rgba(0,0,0,0.52)'; // dim must darken — never a light wash

const ScreenGuide: React.FC<ScreenGuideProps> = ({
  id,
  title,
  description,
  icon = 'info',
  accent,
  points,
  spotlight,
}) => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const dismissed = useSettingsStore((s) => s.dismissedHints.includes(id));
  const dismissHint = useSettingsStore((s) => s.dismissHint);
  const accentColor = accent ?? C.accent;

  const overlayRef = useRef<View>(null);
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<'intro' | 'spot'>('intro');
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [hole, setHole] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Let the screen settle (navigation transition, layout) before dimming it.
  useEffect(() => {
    if (dismissed) return;
    const timer = setTimeout(() => setVisible(true), 550);
    return () => clearTimeout(timer);
  }, [dismissed]);

  // Measure the target relative to the overlay — correct on any platform,
  // any header, any inset. Runs once the overlay has laid out.
  const onOverlayLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setSize({ w: width, h: height });
      const target = spotlight?.targetRef?.current;
      const overlay = overlayRef.current;
      if (!target?.measureInWindow || !overlay) return;
      overlay.measureInWindow((ox: number, oy: number) => {
        target.measureInWindow((tx: number, ty: number, tw: number, th: number) => {
          if (tw > 0 && th > 0) {
            setHole({
              x: tx - ox - HOLE_PAD,
              y: ty - oy - HOLE_PAD,
              w: tw + HOLE_PAD * 2,
              h: th + HOLE_PAD * 2,
            });
          }
        });
      });
    },
    [spotlight],
  );

  const finish = useCallback(() => {
    lightTap();
    dismissHint(id);
  }, [dismissHint, id]);

  const handleNext = useCallback(() => {
    if (hole && spotlight) {
      lightTap();
      setStep('spot');
    } else {
      finish();
    }
  }, [hole, spotlight, finish]);

  if (dismissed || !visible) return null;

  const hasSpot = !!(hole && spotlight);
  const showPoints = !hasSpot && points && points.length > 0;
  const introA11y = [title, description, ...(showPoints ? points!.map((p) => p.text) : [])].join('. ');

  // Scrim with a rounded hole (even-odd) for the spotlight beat.
  const scrimPath =
    step === 'spot' && hole && size
      ? `M0 0 H${size.w} V${size.h} H0 Z ` +
        `M${hole.x + HOLE_RADIUS} ${hole.y} ` +
        `h${hole.w - HOLE_RADIUS * 2} a${HOLE_RADIUS} ${HOLE_RADIUS} 0 0 1 ${HOLE_RADIUS} ${HOLE_RADIUS} ` +
        `v${hole.h - HOLE_RADIUS * 2} a${HOLE_RADIUS} ${HOLE_RADIUS} 0 0 1 -${HOLE_RADIUS} ${HOLE_RADIUS} ` +
        `h-${hole.w - HOLE_RADIUS * 2} a${HOLE_RADIUS} ${HOLE_RADIUS} 0 0 1 -${HOLE_RADIUS} -${HOLE_RADIUS} ` +
        `v-${hole.h - HOLE_RADIUS * 2} a${HOLE_RADIUS} ${HOLE_RADIUS} 0 0 1 ${HOLE_RADIUS} -${HOLE_RADIUS} Z`
      : null;

  // Place the spot card on the empty side of the hole, clamped to margins.
  let spotCardPos: object = {};
  if (step === 'spot' && hole && size) {
    const cardW = Math.min(size.w - SPACING.xl * 2, 320);
    const above = hole.y + hole.h / 2 > size.h / 2;
    const left = Math.max(
      SPACING.lg,
      Math.min(hole.x + hole.w / 2 - cardW / 2, size.w - SPACING.lg - cardW),
    );
    spotCardPos = above
      ? { bottom: size.h - hole.y + SPACING.md, left, width: cardW }
      : { top: hole.y + hole.h + SPACING.md, left, width: cardW };
  }

  // Portaled to the app root (RootSiblingParent in App.tsx) so the scrim covers
  // the WHOLE screen — including the navigation header, which lives ABOVE the
  // screen body and can't be reached by an absoluteFill mounted inside it.
  // NOT a <Modal>: on Android a Modal is a SEPARATE window, so the overlay's
  // measureInWindow would sit in a different coordinate space than the target
  // FAB (main window) and the spotlight hole would be offset. The portal keeps
  // the overlay in the MAIN window, so the hole math stays correct on all
  // platforms. Reanimated entering/exiting fade the dim in AND out.
  return (
    <RootSiblingPortal>
      <RAnimated.View
        ref={overlayRef}
        onLayout={onOverlayLayout}
        entering={reduceMotion ? undefined : FadeIn.duration(220)}
        exiting={reduceMotion ? undefined : FadeOut.duration(180)}
        style={styles.overlay}
      >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={step === 'intro' ? handleNext : finish}
        accessibilityRole="button"
        accessibilityLabel={step === 'intro' ? introA11y : `${spotlight?.label ?? ''}. ${t.common.gotIt}`}
      >
        {scrimPath && size ? (
          <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
            <Path d={scrimPath} fill={DIM} fillRule="evenodd" />
          </Svg>
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: DIM }]} />
        )}

        {/* Beat 1 — welcome */}
        {step === 'intro' && (
          <RAnimated.View
            entering={reduceMotion ? undefined : FadeInDown.delay(80).duration(320)}
            style={styles.introWrap}
            pointerEvents="box-none"
          >
            <View style={styles.card}>
              <View style={styles.topRow}>
                <View style={[styles.iconTile, { backgroundColor: withAlpha(accentColor, 0.14) }]}>
                  {FEATHER_TO_GLYPH[icon] ? (
                    <DuoIcon glyph={FEATHER_TO_GLYPH[icon]} size={21} color={accentColor} />
                  ) : (
                    <Feather name={icon} size={18} color={accentColor} />
                  )}
                </View>
                <Text style={styles.title} numberOfLines={1}>{title}</Text>
              </View>
              <Text style={styles.desc}>{description}</Text>
              {showPoints && (
                <View style={styles.pointsWrap}>
                  {points!.slice(0, 3).map((p) => (
                    <View key={p.text} style={styles.pointRow}>
                      <Feather name={p.icon} size={14} color={accentColor} style={styles.pointIcon} />
                      <Text style={styles.pointText}>{p.text}</Text>
                    </View>
                  ))}
                </View>
              )}
              <View style={styles.footerRow}>
                <TouchableOpacity
                  onPress={step === 'intro' ? handleNext : finish}
                  hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
                  accessibilityRole="button"
                  accessibilityLabel={hasSpot ? t.common.next : t.common.gotIt}
                >
                  <Text style={[styles.footerBtn, { color: accentColor }]}>
                    {(hasSpot ? t.common.next : t.common.gotIt).toLowerCase()}
                    {hasSpot ? '  →' : ''}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </RAnimated.View>
        )}

        {/* Beat 2 — the app points at its own control */}
        {step === 'spot' && hole && (
          <RAnimated.View
            entering={reduceMotion ? undefined : FadeIn.duration(220)}
            style={[styles.spotCard, spotCardPos]}
            pointerEvents="box-none"
          >
            <Text style={styles.spotLabel}>{spotlight!.label}</Text>
            {spotlight!.sublabel ? <Text style={styles.spotSub}>{spotlight!.sublabel}</Text> : null}
            <View style={styles.footerRow}>
              <TouchableOpacity
                onPress={finish}
                hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
                accessibilityRole="button"
                accessibilityLabel={t.common.gotIt}
              >
                <Text style={[styles.footerBtn, { color: accentColor }]}>{t.common.gotIt.toLowerCase()}</Text>
              </TouchableOpacity>
            </View>
          </RAnimated.View>
        )}
      </Pressable>
      </RAnimated.View>
    </RootSiblingPortal>
  );
};

const makeStyles = (C: typeof CALM, isDark: boolean) => StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 24,
  },
  introWrap: {
    position: 'absolute',
    left: SPACING.lg,
    right: SPACING.lg,
    bottom: SPACING['3xl'] + SPACING.xl,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 560, // tablet cap
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
    ...(isDark ? SHADOWS.none : SHADOWS.md),
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  iconTile: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    textTransform: 'lowercase',
  },
  desc: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textSecondary,
    lineHeight: TYPOGRAPHY.size.base * 1.5,
    marginTop: SPACING.md,
  },
  pointsWrap: {
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  pointRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  pointIcon: {
    marginTop: 2,
  },
  pointText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    lineHeight: TYPOGRAPHY.size.sm * 1.4,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: SPACING.sm,
  },
  footerBtn: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    paddingVertical: SPACING.sm,
  },
  spotCard: {
    position: 'absolute',
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
    ...(isDark ? SHADOWS.none : SHADOWS.md),
  },
  spotLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    lineHeight: TYPOGRAPHY.size.base * 1.4,
  },
  spotSub: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    lineHeight: TYPOGRAPHY.size.sm * 1.45,
    marginTop: SPACING.xs,
  },
});

export default ScreenGuide;
