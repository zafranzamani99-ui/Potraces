/**
 * ScreenGuide — first-visit guide.
 *
 * Two shapes, one entry point:
 *  - LEGACY (title/description/icon/points/spotlight): the original passive
 *    two-beat guide — intro card, then an optional spotlight that points at a
 *    real control. Rendered by <LegacyGuide/>, byte-for-byte the pre-existing
 *    behavior, so the 10 existing call sites are untouched.
 *  - WALK-THROUGH (steps): an interactive step machine. `doWithMe` steps make
 *    the spotlight hole TAPPABLE — the real control beneath receives the touch,
 *    the user performs the real action, and the step advances when a watched
 *    store value actually changes. This is the "do it with me" experience.
 *
 * Both are one-time (settingsStore.dismissedHints), focus-gated (only the
 * focused screen shows its guide), and portaled to the app root — NOT a <Modal>
 * (an Android modal is a separate window, which breaks the hole math AND, for
 * the walk-through, the touch pass-through).
 *
 * The tappable-hole pass-through relies on the overlay being a same-window
 * sibling of the app (RootSiblingParent wraps GestureHandlerRootView) and MUST
 * be device-verified on Android (elevation can bias touch-target selection). It
 * does NOT reach controls inside a RN <Modal>/BottomSheet.
 */
import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Pressable, StyleSheet, LayoutChangeEvent, Keyboard } from 'react-native';
import RAnimated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { RootSiblingPortal } from 'react-native-root-siblings';
import { useIsFocused } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useSettingsStore } from '../../store/settingsStore';
import { useT } from '../../i18n';
import { lightTap, selectionChanged, successNotification } from '../../services/haptics';
import DuoIcon, { FEATHER_TO_GLYPH } from './DuoIcon';

type GuidePoint = { icon: keyof typeof Feather.glyphMap; text: string };

/** A store watch for advancing a `doWithMe` step when the user actually acts. */
export interface StoreWatch {
  subscribe: (onChange: () => void) => () => void;
  read: () => number;
  done: (current: number, baseline: number) => boolean;
}

/** Bind a StoreWatch to a Zustand store. Baseline is captured by the engine on
 *  step entry (not here), so this descriptor is safe to recreate each render.
 *  e.g. whenStore(useWalletStore, s => s.wallets.length, (n, base) => n > base) */
export const whenStore = <S,>(
  store: { getState: () => S; subscribe: (cb: () => void) => () => void },
  select: (s: S) => number,
  done: (current: number, baseline: number) => boolean,
): StoreWatch => ({
  subscribe: (onChange) => store.subscribe(onChange),
  read: () => select(store.getState()),
  done,
});

export type GuideStep =
  | { kind: 'intro'; title: string; body: string; icon?: keyof typeof Feather.glyphMap; points?: GuidePoint[] }
  | { kind: 'spotlight'; targetRef: React.RefObject<any>; label: string; sublabel?: string }
  | { kind: 'doWithMe'; targetRef: React.RefObject<any>; label: string; sublabel?: string; watch: StoreWatch; keyboardAware?: boolean; dismissKeyboardOnEnter?: boolean }
  | { kind: 'payoff'; title: string; body?: string; icon?: keyof typeof Feather.glyphMap };

interface SpotlightTarget {
  targetRef: React.RefObject<any>;
  label: string;
  sublabel?: string;
}

interface ScreenGuideProps {
  id: string;
  accent?: string;
  /** Interactive walk-through. When present, the legacy props are ignored. */
  steps?: GuideStep[];
  // ── Legacy passive guide (unchanged behavior) ──
  title?: string;
  description?: string;
  icon?: keyof typeof Feather.glyphMap;
  points?: GuidePoint[];
  spotlight?: SpotlightTarget;
}

const HOLE_PAD = 8;
const HOLE_RADIUS = 18;
const DIM = 'rgba(0,0,0,0.52)';

const holePath = (hole: { x: number; y: number; w: number; h: number }, size: { w: number; h: number }) =>
  `M0 0 H${size.w} V${size.h} H0 Z ` +
  `M${hole.x + HOLE_RADIUS} ${hole.y} ` +
  `h${hole.w - HOLE_RADIUS * 2} a${HOLE_RADIUS} ${HOLE_RADIUS} 0 0 1 ${HOLE_RADIUS} ${HOLE_RADIUS} ` +
  `v${hole.h - HOLE_RADIUS * 2} a${HOLE_RADIUS} ${HOLE_RADIUS} 0 0 1 -${HOLE_RADIUS} ${HOLE_RADIUS} ` +
  `h-${hole.w - HOLE_RADIUS * 2} a${HOLE_RADIUS} ${HOLE_RADIUS} 0 0 1 -${HOLE_RADIUS} -${HOLE_RADIUS} ` +
  `v-${hole.h - HOLE_RADIUS * 2} a${HOLE_RADIUS} ${HOLE_RADIUS} 0 0 1 ${HOLE_RADIUS} -${HOLE_RADIUS} Z`;

// ─────────────────────────────────────────────────────────────
// LEGACY passive guide — the original two-beat behavior, unchanged.
// ─────────────────────────────────────────────────────────────
const LegacyGuide: React.FC<{
  id: string;
  title: string;
  description: string;
  icon?: keyof typeof Feather.glyphMap;
  accent?: string;
  points?: GuidePoint[];
  spotlight?: SpotlightTarget;
}> = ({ id, title, description, icon = 'info', accent, points, spotlight }) => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const dismissed = useSettingsStore((s) => s.dismissedHints.includes(id));
  const dismissHint = useSettingsStore((s) => s.dismissHint);
  const accentColor = accent ?? C.accent;
  const isFocused = useIsFocused();

  const overlayRef = useRef<View>(null);
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<'intro' | 'spot'>('intro');
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [hole, setHole] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    if (dismissed || !isFocused) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 550);
    return () => clearTimeout(timer);
  }, [dismissed, isFocused]);

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
            setHole({ x: tx - ox - HOLE_PAD, y: ty - oy - HOLE_PAD, w: tw + HOLE_PAD * 2, h: th + HOLE_PAD * 2 });
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

  if (dismissed || !isFocused || !visible) return null;

  const hasSpot = !!(hole && spotlight);
  const showPoints = !hasSpot && points && points.length > 0;
  const introA11y = [title, description, ...(showPoints ? points!.map((p) => p.text) : [])].join('. ');

  const scrimPath = step === 'spot' && hole && size ? holePath(hole, size) : null;

  let spotCardPos: object = {};
  if (step === 'spot' && hole && size) {
    const cardW = Math.min(size.w - SPACING.xl * 2, 320);
    const above = hole.y + hole.h / 2 > size.h / 2;
    const left = Math.max(SPACING.lg, Math.min(hole.x + hole.w / 2 - cardW / 2, size.w - SPACING.lg - cardW));
    spotCardPos = above
      ? { bottom: size.h - hole.y + SPACING.md, left, width: cardW }
      : { top: hole.y + hole.h + SPACING.md, left, width: cardW };
  }

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

          {step === 'intro' && (
            <RAnimated.View
              entering={reduceMotion ? undefined : FadeIn.duration(200)}
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
                    onPress={handleNext}
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

// ─────────────────────────────────────────────────────────────
// WALK-THROUGH engine — interactive, do-it-with-me steps.
// ─────────────────────────────────────────────────────────────
const WalkThrough: React.FC<{ id: string; accent?: string; steps: GuideStep[] }> = ({ id, accent, steps }) => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const reduceMotion = useReducedMotion();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const dismissed = useSettingsStore((s) => s.dismissedHints.includes(id));
  const dismissHint = useSettingsStore((s) => s.dismissHint);
  const accentColor = accent ?? C.accent;
  const isFocused = useIsFocused();

  const overlayRef = useRef<View>(null);
  const [visible, setVisible] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [hole, setHole] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [kbHeight, setKbHeight] = useState(0);
  // Latches true once the current step is ready to paint (intro: immediately;
  // hole step: once its target is measured). Gating the visible content on this
  // means the first painted frame already shows the dim WITH the hole, instead
  // of a full-dark flash that then resolves into the spotlight.
  const [revealed, setRevealed] = useState(false);

  const current = steps[Math.min(stepIndex, steps.length - 1)];
  const needsHole = current?.kind === 'spotlight' || current?.kind === 'doWithMe';
  const isLast = stepIndex >= steps.length - 1;

  useEffect(() => {
    if (dismissed || !isFocused) {
      setVisible(false);
      return;
    }
    // Short settle only — the first step is the intro (no measurement), and
    // hole steps re-measure via rAF, so a long delay just makes the guide feel
    // slow to appear (worse on a pushed screen that also brings up a keyboard).
    const timer = setTimeout(() => setVisible(true), reduceMotion ? 120 : 250);
    return () => clearTimeout(timer);
  }, [dismissed, isFocused, reduceMotion]);

  const finish = useCallback(() => {
    lightTap();
    dismissHint(id);
  }, [dismissHint, id]);

  const advance = useCallback(() => {
    setStepIndex((i) => {
      if (i >= steps.length - 1) {
        dismissHint(id);
        return i;
      }
      return i + 1;
    });
  }, [steps.length, dismissHint, id]);
  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  const measureTarget = useCallback(() => {
    const targetRef = current && (current.kind === 'spotlight' || current.kind === 'doWithMe') ? current.targetRef : null;
    const target = targetRef?.current;
    const overlay = overlayRef.current;
    if (!target?.measureInWindow || !overlay) return false;
    let measured = false;
    overlay.measureInWindow((ox: number, oy: number) => {
      target.measureInWindow((tx: number, ty: number, tw: number, th: number) => {
        if (tw > 0 && th > 0) {
          measured = true;
          setHole({ x: tx - ox - HOLE_PAD, y: ty - oy - HOLE_PAD, w: tw + HOLE_PAD * 2, h: th + HOLE_PAD * 2 });
        }
      });
    });
    return measured;
  }, [current]);

  const onOverlayLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  }, []);

  // Measure the current step's target with a few rAF retries; if a hole step's
  // target never measures, skip that step rather than render a dead card.
  useEffect(() => {
    if (!visible) return;
    if (!needsHole) { setHole(null); return; }
    // NOTE: do not clear the hole here — keeping the previous hole until the new
    // one measures avoids a full-dim flash when stepping between hole steps.
    let tries = 0;
    let raf = 0;
    const tick = () => {
      if (measureTarget()) return;
      if (tries++ < 5) raf = requestAnimationFrame(tick);
      else advanceRef.current();
    };
    tick();
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, [visible, stepIndex, needsHole, measureTarget]);

  // doWithMe: capture baseline on entry, advance when the watched value changes.
  useEffect(() => {
    if (!visible || current?.kind !== 'doWithMe') return;
    const watch = current.watch;
    const baseline = watch.read();
    if (watch.done(watch.read(), baseline)) {
      successNotification();
      advance();
      return;
    }
    const unsub = watch.subscribe(() => {
      if (watch.done(watch.read(), baseline)) {
        successNotification();
        advance();
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, stepIndex]);

  // A doWithMe step can ask for the keyboard down on entry, so the control it
  // points at (e.g. a button below a text input) isn't hidden behind it.
  useEffect(() => {
    if (visible && current?.kind === 'doWithMe' && current.dismissKeyboardOnEnter) {
      Keyboard.dismiss();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, stepIndex]);

  useEffect(() => {
    if (!visible) return;
    // The keyboard is often ALREADY up when the guide mounts (e.g. NoteEditor
    // auto-focuses its input), so `keyboardDidShow` never fires and the coach
    // card would sit behind the keyboard. Seed from current metrics, then track.
    const m = Keyboard.metrics?.();
    if (m && m.height) setKbHeight(m.height);
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKbHeight(e.endCoordinates?.height ?? 0));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, [visible]);

  const enteredSpotRef = useRef(-1);
  useEffect(() => {
    if (visible && needsHole && hole && enteredSpotRef.current !== stepIndex) {
      enteredSpotRef.current = stepIndex;
      selectionChanged();
    }
  }, [visible, needsHole, hole, stepIndex]);

  // Reveal (and fade in) only once the current step can paint fully. Latches on
  // so later steps don't blink the content off; resets when the guide hides.
  useEffect(() => {
    if (!visible) { setRevealed(false); return; }
    const introLikeNow = current?.kind === 'intro' || current?.kind === 'payoff';
    const holeReadyNow = needsHole && !!hole && !!size;
    if (introLikeNow || holeReadyNow) setRevealed(true);
  }, [visible, stepIndex, needsHole, hole, size, current]);

  if (dismissed || !isFocused || !visible || !current) return null;

  const holeReady = needsHole && !!hole && !!size;
  const introLike = current.kind === 'intro' || current.kind === 'payoff';
  const label = current.kind === 'spotlight' || current.kind === 'doWithMe' ? current.label : '';
  const sublabel = current.kind === 'spotlight' || current.kind === 'doWithMe' ? current.sublabel : undefined;

  const scrimPath = holeReady && hole && size ? holePath(hole, size) : null;

  let coachPos: object = {};
  if (holeReady && hole && size) {
    const kbAware = current.kind === 'doWithMe' && current.keyboardAware && kbHeight > 0;
    const usableH = kbAware ? size.h - kbHeight : size.h;
    const cardW = Math.min(size.w - SPACING.xl * 2, 320);
    const left = Math.max(SPACING.lg, Math.min(hole.x + hole.w / 2 - cardW / 2, size.w - SPACING.lg - cardW));
    // Prefer BELOW the hole — in the gap above the keyboard. Only flip ABOVE
    // when there isn't room below AND there's room above; a top-anchored hole
    // (like the note input) must never shove the card up into the header.
    const CARD_BUDGET = 120;
    const spaceBelow = usableH - (hole.y + hole.h) - SPACING.md;
    const placeAbove = spaceBelow < CARD_BUDGET && hole.y > CARD_BUDGET;
    coachPos = placeAbove
      ? { bottom: size.h - hole.y + SPACING.md, left, width: cardW }
      : { top: hole.y + hole.h + SPACING.md, left, width: cardW };
  }

  const a11y = introLike
    ? [(current.kind === 'intro' || current.kind === 'payoff') ? current.title : '', (current.kind === 'intro' || current.kind === 'payoff') ? (current.body ?? '') : ''].filter(Boolean).join('. ')
    : `${label}. ${sublabel ?? ''}`;

  const bandPress = () => {
    if (current.kind === 'spotlight') { lightTap(); advance(); }
  };

  const renderIntroCard = () => {
    const cardTitle = (current.kind === 'intro' || current.kind === 'payoff') ? current.title : '';
    const cardBody = current.kind === 'intro' ? current.body : (current.kind === 'payoff' ? current.body : undefined);
    const cardIcon = (current.kind === 'intro' || current.kind === 'payoff') ? (current.icon ?? 'info') : 'info';
    const points = current.kind === 'intro' ? current.points : undefined;
    return (
      <View
        style={[styles.introWrap, kbHeight > 0 ? { bottom: SPACING['3xl'] + SPACING.xl + kbHeight } : null]}
        pointerEvents="box-none"
      >
        <View style={styles.card}>
          <View style={styles.topRow}>
            <View style={[styles.iconTile, { backgroundColor: withAlpha(accentColor, 0.14) }]}>
              {FEATHER_TO_GLYPH[cardIcon] ? (
                <DuoIcon glyph={FEATHER_TO_GLYPH[cardIcon]} size={21} color={accentColor} />
              ) : (
                <Feather name={cardIcon} size={18} color={accentColor} />
              )}
            </View>
            {!!cardTitle && <Text style={styles.title} numberOfLines={1}>{cardTitle}</Text>}
          </View>
          {!!cardBody && <Text style={styles.desc}>{cardBody}</Text>}
          {points && points.length > 0 && (
            <View style={styles.pointsWrap}>
              {points.slice(0, 3).map((p) => (
                <View key={p.text} style={styles.pointRow}>
                  <Feather name={p.icon} size={14} color={accentColor} style={styles.pointIcon} />
                  <Text style={styles.pointText}>{p.text}</Text>
                </View>
              ))}
            </View>
          )}
          <View style={styles.footerRow}>
            <TouchableOpacity
              onPress={isLast ? finish : advance}
              hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
              accessibilityRole="button"
              accessibilityLabel={isLast ? t.common.gotIt : t.common.next}
            >
              <Text style={[styles.footerBtn, { color: accentColor }]}>
                {(isLast ? t.common.gotIt : t.common.next).toLowerCase()}
                {isLast ? '' : '  →'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <RootSiblingPortal>
      {/* Outer stays transparent (no dim, no entering) so measurement can happen
          off-screen; the exit fade lives here. The dim + hole only paint inside
          the `revealed` layer below, which fades in as ONE piece — so the first
          visible frame already has the hole cut, never a full-dark flash. */}
      <RAnimated.View
        ref={overlayRef}
        onLayout={onOverlayLayout}
        exiting={reduceMotion ? undefined : FadeOut.duration(160)}
        style={styles.overlay}
        pointerEvents="box-none"
      >
        {revealed && (
          <RAnimated.View
            entering={reduceMotion ? undefined : FadeIn.duration(180)}
            // pointerEvents in BOTH prop and style: Reanimated/Fabric applies the
            // style path reliably; the prop alone has been seen to drop on iOS.
            style={[StyleSheet.absoluteFill, { pointerEvents: 'box-none' }]}
            pointerEvents="box-none"
          >
            {holeReady && scrimPath && size && hole ? (
              <>
                {/* Plain-View pointerEvents="none" wrapper: RNSVG's iOS hit test
                    ignores the evenodd rule, so the Svg itself would still capture
                    taps INSIDE the hole. A core RN View with "none" removes the
                    whole subtree from hit testing on both platforms. */}
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  <Svg pointerEvents="none" width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
                    <Path d={scrimPath} fill={DIM} fillRule="evenodd" />
                  </Svg>
                </View>
                {/* Frame bands around the hole catch mis-taps; the hole rect has
                    NO overlay view, so the real control beneath gets touches. */}
                <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, height: Math.max(0, hole.y) }} onPress={bandPress} accessibilityLabel={a11y} />
                <Pressable style={{ position: 'absolute', top: hole.y + hole.h, left: 0, right: 0, bottom: 0 }} onPress={bandPress} />
                <Pressable style={{ position: 'absolute', top: hole.y, left: 0, width: Math.max(0, hole.x), height: hole.h }} onPress={bandPress} />
                <Pressable style={{ position: 'absolute', top: hole.y, left: hole.x + hole.w, right: 0, height: hole.h }} onPress={bandPress} />
              </>
            ) : (
              <Pressable
                style={[StyleSheet.absoluteFill, { backgroundColor: DIM }]}
                onPress={isLast ? finish : advance}
                accessibilityRole="button"
                accessibilityLabel={a11y}
              />
            )}

            {introLike ? (
              renderIntroCard()
            ) : holeReady ? (
              <View style={[styles.spotCard, coachPos]} pointerEvents="box-none">
                <Text style={styles.spotLabel}>{label}</Text>
                {sublabel ? <Text style={styles.spotSub}>{sublabel}</Text> : null}
                {/* The card's own skip/next is the single escape hatch — always
                    visible (no stall timer), so the way out is never delayed. */}
                {(current.kind === 'spotlight' || current.kind === 'doWithMe') && (
                  <View style={styles.footerRow}>
                    <TouchableOpacity
                      onPress={current.kind === 'doWithMe' ? advance : (isLast ? finish : advance)}
                      hitSlop={{ top: 10, bottom: 10, left: 16, right: 16 }}
                      accessibilityRole="button"
                      accessibilityLabel={current.kind === 'doWithMe' ? t.common.skip : (isLast ? t.common.gotIt : t.common.next)}
                    >
                      <Text style={[styles.footerBtn, { color: accentColor }]}>
                        {(current.kind === 'doWithMe' ? t.common.skip : (isLast ? t.common.gotIt : t.common.next)).toLowerCase()}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : null}

          </RAnimated.View>
        )}
      </RAnimated.View>
    </RootSiblingPortal>
  );
};

const ScreenGuide: React.FC<ScreenGuideProps> = (props) => {
  if (props.steps && props.steps.length) {
    return <WalkThrough id={props.id} accent={props.accent} steps={props.steps} />;
  }
  return (
    <LegacyGuide
      id={props.id}
      title={props.title ?? ''}
      description={props.description ?? ''}
      icon={props.icon}
      accent={props.accent}
      points={props.points}
      spotlight={props.spotlight}
    />
  );
};

const makeStyles = (C: typeof CALM, isDark: boolean) => StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    // Touch transparency in style as well as the prop — see note at the
    // revealed layer; iOS/Fabric honors style.pointerEvents most reliably.
    pointerEvents: 'box-none',
    // No Android `elevation` — the portal already stacks this on top, and a
    // full-screen elevated view flashes an elevation shadow during the fade.
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
    maxWidth: 560,
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
    // iOS shadow only; NO Android elevation — an elevated view flashes its
    // shadow as an empty box while the card fades in. The border defines it.
    ...(isDark ? SHADOWS.none : { ...SHADOWS.md, elevation: 0 }),
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
    ...(isDark ? SHADOWS.none : { ...SHADOWS.md, elevation: 0 }),
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
