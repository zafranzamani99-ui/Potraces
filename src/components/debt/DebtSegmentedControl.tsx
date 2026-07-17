import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';

// iOS 26 → Apple's real Liquid Glass (expo-glass-effect); Android / iOS < 26 →
// expo-blur fallback. Glass rules (same as the navbar / GlassModeToggle): ONE glass
// surface (the capsule), a NON-glass fill pill for the selected segment, capsule
// UNtinted so the material adapts, and NO overflow:'hidden' masking the native
// GlassView (it self-rounds; only the blur fallback is clipped).
const GLASS = isLiquidGlassAvailable();

export interface SegmentTab<K extends string = string> {
  key: K;
  label: string;
  count: number;
  color: string;
}

interface DebtSegmentedControlProps<K extends string> {
  tabs: ReadonlyArray<SegmentTab<K>>;
  active: K;
  onSelect: (key: K) => void;
  /** a11y noun: "debt" / "split" */
  itemNoun: string;
  /** trailing slot (e.g. draft bookmark) rendered inside the control after the tabs */
  children?: React.ReactNode;
}

function DebtSegmentedControl<K extends string>({
  tabs,
  active,
  onSelect,
  itemNoun,
  children,
}: DebtSegmentedControlProps<K>) {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = React.useMemo(() => makeStyles(C), [C]);

  return (
    <View style={[styles.wrapper, !GLASS && styles.wrapperClip]}>
      {/* ── Glass capsule (the single glass surface) ── */}
      {GLASS ? (
        <GlassView
          style={[StyleSheet.absoluteFill, styles.capsuleShape]}
          glassEffectStyle="regular"
        />
      ) : (
        <>
          <BlurView
            style={[StyleSheet.absoluteFill, styles.capsuleShape]}
            intensity={isDark ? 30 : 40}
            tint={isDark ? 'dark' : 'light'}
            experimentalBlurMethod="dimezisBlurView"
          />
          <View style={[StyleSheet.absoluteFill, styles.capsuleShape, styles.fallbackTint]} />
        </>
      )}

      <View style={styles.track}>
        {tabs.map((tab) => {
          const isActive = active === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => onSelect(tab.key)}
              style={[
                styles.segmentTab,
                // Non-glass selection pill on the glass. DARK: a neutral white bubble
                // reads fine on the dark glass. LIGHT: a white pill blends into the
                // light frosted glass (couldn't tell which was selected), so the
                // selected segment uses the tab's OWN color as a tint + a clear colored
                // border — unmistakable, and the bold colored label sits on it.
                isActive && (isDark
                  ? {
                      backgroundColor: withAlpha('#FFFFFF', 0.16),
                      borderColor: withAlpha('#FFFFFF', 0.22),
                      borderWidth: StyleSheet.hairlineWidth,
                      ...SHADOWS.sm,
                    }
                  : {
                      backgroundColor: withAlpha(tab.color, 0.16),
                      borderColor: withAlpha(tab.color, 0.55),
                      borderWidth: 1.5,
                      ...SHADOWS.sm,
                    }),
              ]}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={t.debts.segmentTabA11y.replace('{label}', tab.label).replace('{count}', String(tab.count)).replace('{noun}', tab.count === 1 ? itemNoun : itemNoun + 's')}
            >
              <Text style={[
                styles.segmentTabText,
                isActive && { color: tab.color, fontWeight: TYPOGRAPHY.weight.semibold },
              ]}>
                {tab.label}
              </Text>
              <View style={[
                styles.segmentTabBadge,
                isActive && { backgroundColor: tab.color },
              ]}>
                <Text style={[
                  styles.segmentTabBadgeText,
                  isActive && { color: C.onAccent },
                ]}>
                  {tab.count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
        {children}
      </View>
    </View>
  );
}

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  wrapper: {
    borderRadius: RADIUS.full,
    marginBottom: SPACING.md,
  },
  // Fallback-only: BlurView needs clipping; native glass must NOT be masked.
  wrapperClip: { overflow: 'hidden' },
  capsuleShape: { borderRadius: RADIUS.full },
  fallbackTint: {
    backgroundColor: withAlpha(C.surface, 0.4),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha('#FFFFFF', 0.3),
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: SPACING.sm,
    paddingHorizontal: 12,
    borderRadius: RADIUS.full,
    minHeight: 36,
  },
  segmentTabText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
    letterSpacing: 0.1,
  },
  segmentTabBadge: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.12 : 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentTabBadgeText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});

export default DebtSegmentedControl;
