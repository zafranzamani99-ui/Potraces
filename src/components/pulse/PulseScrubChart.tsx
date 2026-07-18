import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Defs, ClipPath, Rect, Line } from 'react-native-svg';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useAnimatedReaction,
  withTiming,
  withRepeat,
  Easing,
  runOnJS,
  useReducedMotion,
} from 'react-native-reanimated';
import { TYPOGRAPHY, SPACING, RADIUS, withAlpha } from '../../constants';
import { lightTap, selectionChanged } from '../../services/haptics';

const AnimatedRect = Reanimated.createAnimatedComponent(Rect);

const READOUT_H = 46;
const X_LABELS_H = 18;
const PAD_TOP = 12;

interface PulseScrubChartProps {
  width: number;
  height: number; // total component height (readout + plot + x labels)
  /** Cumulative spend, index 0 = day 1 … last index = today. */
  cums: number[];
  daysInMonth: number;
  /** Where the dashed even-pace line ends (monthly budget or typical spend). null → no pace line. */
  paceTotal: number | null;
  color: string; // actual spend line
  paceColor: string; // dashed pace line
  labelColor: string; // axis labels
  textColor: string; // readout primary
  /** Idle readout headline — the useful at-a-glance line ("RM 723 out so far · landing ~RM 3,091"). */
  idleMain: string;
  /** Idle readout second line (today's vs-pace status). null hides it. */
  idleSub: string | null;
  idleSubColor: string;
  /** "12 Jul" for a given day of this month. */
  dayLabel: (day: number) => string;
  /** "RM 1,240" */
  moneyLabel: (n: number) => string;
  /** Line under the scrub value: diff = paceCum − actualCum at that day (＋ = under pace). null hides it. */
  paceDiffLabel: (diff: number) => string;
  /** Disable the parent scroll while a scrub is live. */
  onScrubActive?: (active: boolean) => void;
  /** Pause ambient animation (e.g. while the screen is covered). */
  active?: boolean;
}

/**
 * The month so far as a scrubbable cumulative-spend curve against a dashed
 * "even pace" line (Copilot-style). Long-press + drag to scrub day by day —
 * the crosshair moves on the UI thread, a haptic tick fires per day change,
 * and the readout above the plot updates on discrete day changes only (no
 * per-frame React renders). The line tip carries a softly pinging "now" dot.
 */
const PulseScrubChart: React.FC<PulseScrubChartProps> = ({
  width,
  height,
  cums,
  daysInMonth,
  paceTotal,
  color,
  paceColor,
  labelColor,
  textColor,
  idleMain,
  idleSub,
  idleSubColor,
  dayLabel,
  moneyLabel,
  paceDiffLabel,
  onScrubActive,
  active = true,
}) => {
  const reduceMotion = useReducedMotion();
  const today = cums.length;
  const plotH = Math.max(height - READOUT_H - X_LABELS_H - PAD_TOP, 40);
  const plotTop = READOUT_H + PAD_TOP;
  const baseY = plotTop + plotH;

  const { xs, ys, linePath, areaPath, tipX, tipY, paceStartY, paceEndX, paceEndY } = useMemo(() => {
    const step = daysInMonth > 1 ? width / (daysInMonth - 1) : width;
    const spentSoFar = cums.length > 0 ? cums[cums.length - 1] : 0;
    // Scale to TODAY's region, not the full-month pace total — otherwise the
    // actual line spends the first half of the month squashed on the baseline.
    const paceCumToday = paceTotal !== null ? (paceTotal * cums.length) / daysInMonth : 0;
    const yMax = Math.max(spentSoFar, paceCumToday, 10) * 1.25;
    const x = (day: number) => (day - 1) * step;
    const y = (v: number) => plotTop + plotH * (1 - v / yMax);
    const xsArr: number[] = [];
    const ysArr: number[] = [];
    let line = '';
    for (let i = 0; i < cums.length; i++) {
      const px = x(i + 1);
      const py = y(cums[i]);
      xsArr.push(px);
      ysArr.push(py);
      line += i === 0 ? `M ${px} ${py}` : ` L ${px} ${py}`;
    }
    const area =
      cums.length > 0
        ? `${line} L ${x(cums.length)} ${baseY} L ${x(1)} ${baseY} Z`
        : '';
    // The pace line usually exits the top of the plot before month-end now —
    // clamp it at the exit point instead of letting it draw over the readout.
    let pEndX = width;
    let pEndY = paceTotal !== null ? y(paceTotal) : 0;
    if (paceTotal !== null && paceTotal > yMax) {
      const dExit = (yMax / paceTotal) * daysInMonth;
      pEndX = x(Math.max(dExit, 1));
      pEndY = y(yMax);
    }
    return {
      xs: xsArr,
      ys: ysArr,
      linePath: line,
      areaPath: area,
      tipX: cums.length > 0 ? x(cums.length) : 0,
      tipY: cums.length > 0 ? y(cums[cums.length - 1]) : baseY,
      paceStartY: paceTotal !== null ? y(paceTotal / daysInMonth) : 0,
      paceEndX: pEndX,
      paceEndY: pEndY,
    };
  }, [cums, daysInMonth, width, plotH, plotTop, baseY, paceTotal]);

  // ── Scrub state ──
  const activeSv = useSharedValue(0);
  const dayIdx = useSharedValue(0); // 0-based index into cums
  const [selDay, setSelDay] = useState<number | null>(null);

  const setScrub = useCallback(
    (day: number | null) => {
      setSelDay(day);
      onScrubActive?.(day !== null);
    },
    [onScrubActive]
  );

  const tickHaptic = useCallback(() => selectionChanged(), []);

  // xs is small (≤31) — safe to close over in worklets.
  const pan = Gesture.Pan()
    .activateAfterLongPress(200)
    .onStart((e) => {
      const step = daysInMonth > 1 ? width / (daysInMonth - 1) : width;
      const idx = Math.min(Math.max(Math.round(e.x / step), 0), today - 1);
      dayIdx.value = idx;
      activeSv.value = withTiming(1, { duration: 120 });
      runOnJS(lightTap)();
      runOnJS(setScrub)(idx + 1);
    })
    .onUpdate((e) => {
      const step = daysInMonth > 1 ? width / (daysInMonth - 1) : width;
      const idx = Math.min(Math.max(Math.round(e.x / step), 0), today - 1);
      if (idx !== dayIdx.value) {
        dayIdx.value = idx;
        runOnJS(tickHaptic)();
        runOnJS(setScrub)(idx + 1);
      }
    })
    .onFinalize(() => {
      activeSv.value = withTiming(0, { duration: 160 });
      runOnJS(setScrub)(null);
    });

  // ── Crosshair (UI-thread transforms — never SVG) ──
  const crosshairStyle = useAnimatedStyle(() => ({
    opacity: activeSv.value,
    transform: [{ translateX: xs[dayIdx.value] ?? 0 }],
  }));
  const dotStyle = useAnimatedStyle(() => ({
    opacity: activeSv.value,
    transform: [
      { translateX: (xs[dayIdx.value] ?? 0) - 5 },
      { translateY: (ys[dayIdx.value] ?? 0) - 5 },
    ],
  }));

  // ── Draw-in on mount (clip sweep) + "now" ping ──
  const drawn = useSharedValue(reduceMotion ? width : 0);
  const ping = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion || !active) {
      drawn.value = width;
      ping.value = 0;
      return;
    }
    drawn.value = 0;
    drawn.value = withTiming(width, { duration: 750, easing: Easing.out(Easing.cubic) });
    ping.value = 0;
    ping.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }),
      -1,
      false
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion, active, width, cums]);
  const clipProps = useAnimatedProps(() => ({ width: drawn.value }));
  const pingStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion || !active ? 0 : 0.5 * (1 - ping.value),
    transform: [{ scale: 0.6 + ping.value * 1.7 }],
  }));

  const scrubCum = selDay !== null ? cums[selDay - 1] : null;
  const scrubDiff =
    selDay !== null && paceTotal !== null && scrubCum !== null
      ? (paceTotal * selDay) / daysInMonth - scrubCum
      : null;

  const midDay = Math.round(daysInMonth / 2);

  return (
    <GestureDetector gesture={pan}>
      <View style={{ width, height }} accessible accessibilityLabel={idleMain}>
        {/* The plot's y-coordinates already include the readout offset, so the
            Svg must be absolutely positioned — in normal flow it would render
            BELOW the readout and overflow the card by READOUT_H. */}
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Defs>
            <ClipPath id="pulseDraw">
              <AnimatedRect x={0} y={0} height={height} animatedProps={clipProps} />
            </ClipPath>
          </Defs>
          {/* Baseline */}
          <Line
            x1={0}
            y1={baseY}
            x2={width}
            y2={baseY}
            stroke={withAlpha(labelColor, 0.25)}
            strokeWidth={1}
          />
          {/* Even-pace dotted line (clamped where it exits the plot) */}
          {paceTotal !== null && (
            <Line
              x1={xs[0] ?? 0}
              y1={paceStartY}
              x2={paceEndX}
              y2={paceEndY}
              stroke={paceColor}
              strokeWidth={1.5}
              strokeDasharray="5 6"
              opacity={0.65}
            />
          )}
          {/* Actual spend — area + line, revealed by the clip sweep */}
          {areaPath !== '' && (
            <Path d={areaPath} fill={withAlpha(color, 0.1)} clipPath="url(#pulseDraw)" />
          )}
          {linePath !== '' && (
            <Path
              d={linePath}
              stroke={color}
              strokeWidth={2.5}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              clipPath="url(#pulseDraw)"
            />
          )}
        </Svg>

        {/* Readout row — fixed height so the card never jumps. Idle = the
            useful glance; scrubbing = the day under the finger. */}
        <View style={styles.readout}>
          {selDay !== null && scrubCum !== null ? (
            <>
              <Text style={[styles.readoutMain, { color: textColor }]} numberOfLines={1}>
                {dayLabel(selDay)} · {moneyLabel(scrubCum)}
              </Text>
              {scrubDiff !== null && (
                <Text
                  style={[
                    styles.readoutSub,
                    { color: scrubDiff >= 0 ? color : paceColor },
                  ]}
                  numberOfLines={1}
                >
                  {paceDiffLabel(scrubDiff)}
                </Text>
              )}
            </>
          ) : (
            <>
              <Text style={[styles.readoutMain, { color: textColor }]} numberOfLines={1}>
                {idleMain}
              </Text>
              {idleSub !== null && (
                <Text style={[styles.readoutSub, { color: idleSubColor }]} numberOfLines={1}>
                  {idleSub}
                </Text>
              )}
            </>
          )}
        </View>

        {/* "Now" dot at the line tip — the month's beat */}
        {cums.length > 0 && (
          <View style={[styles.tipWrap, { left: tipX - 8, top: tipY - 8 }]} pointerEvents="none">
            <Reanimated.View style={[styles.tipPing, { backgroundColor: color }, pingStyle]} />
            <View style={[styles.tipDot, { backgroundColor: color }]} />
          </View>
        )}

        {/* Crosshair — absolute Views on UI-thread transforms */}
        <Reanimated.View
          pointerEvents="none"
          style={[
            styles.crosshair,
            { top: plotTop, height: plotH, backgroundColor: withAlpha(textColor, 0.35) },
            crosshairStyle,
          ]}
        />
        <Reanimated.View
          pointerEvents="none"
          style={[styles.scrubDot, { backgroundColor: textColor }, dotStyle]}
        />

        {/* X labels */}
        <View style={[styles.xLabels, { top: baseY + 4, width }]} pointerEvents="none">
          <Text style={[styles.xLabel, { color: labelColor }]}>{dayLabel(1)}</Text>
          <Text style={[styles.xLabel, { color: labelColor }]}>{dayLabel(midDay)}</Text>
          <Text style={[styles.xLabel, { color: labelColor }]}>{dayLabel(daysInMonth)}</Text>
        </View>
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  readout: {
    height: READOUT_H,
    justifyContent: 'center',
  },
  readoutMain: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
  },
  readoutSub: {
    fontSize: TYPOGRAPHY.size.xs,
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
  crosshair: {
    position: 'absolute',
    left: 0,
    width: 1,
  },
  scrubDot: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 10,
    height: 10,
    borderRadius: RADIUS.full,
  },
  tipWrap: {
    position: 'absolute',
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipPing: { position: 'absolute', width: 16, height: 16, borderRadius: 8 },
  tipDot: { width: 7, height: 7, borderRadius: 4 },
  xLabels: {
    position: 'absolute',
    left: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  xLabel: {
    fontSize: 10,
    fontVariant: ['tabular-nums'],
  },
});

// Memoized: the screen locks its ScrollView (a state change) mid-scrub — the
// chart must NOT re-render during its own active gesture.
export default React.memo(PulseScrubChart);
