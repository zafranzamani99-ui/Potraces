// ─── LIQUID GLASS NAV BAR ──────────────────────────────────────────────
// Drop-in replacement for CustomTabBar — iOS 26 "Liquid Glass".
//
// PLACE AT:  src/components/navigation/LiquidGlassNavBar.tsx
//            (keeps the ../../ imports below valid — same folder as CustomTabBar)
//
// INSTALL:   npx expo install expo-glass-effect      (expo-blur is already installed)
//            Build with Xcode 26 (EAS default for SDK 54).
//
// WIRE IT IN (src/navigation/PersonalNavigator.tsx) — identical call site to CustomTabBar:
//   tabBar={(props) => <LiquidGlassNavBar {...props} accentColor={COLORS.personal} />}
//
// BEHAVIOUR:
//   • iOS 26+  → native Apple Liquid Glass (real lensing, gyroscope specular, gel press),
//               GlassContainer makes the active pill fluidly merge/morph as it moves.
//   • Android / iOS < 26 → automatic expo-blur frosted fallback (looks good, not "liquid").
//
// INTERACTION:
//   • Tap a tab → pill springs over with a liquid glide.
//   • Drag across the bar → the pill scrubs with your finger and stretches (leading edge
//     reaches, trailing lags), icons light up as it passes, snaps to the nearest tab on release.
//
// FLOATING: the bar floats (absolute) so the glass lenses the scroll content behind it.
//   Add bottom padding to your scroll views so nothing hides under it:
//   contentContainerStyle={{ paddingBottom: insets.bottom + 88 }}
//
// DELIBERATE CHANGES vs CustomTabBar (say the word to revert any):
//   • Flat capsule — the raised center pop-out is dropped (matches the iOS reference).
//   • Active pill morphs/scrubs between tabs (was: color-only).
//   • Active tint is the olive accent (was: textPrimary).
//   • Icons are ALWAYS the solid/filled glyph (treatment "B"); the active one tints olive
//     and sits under the morphing pill (was: outline→solid morph).
// ───────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { selectionChanged } from '../../services/haptics';
import DuoIcon, { FEATHER_TO_GLYPH } from '../common/DuoIcon';
import { useAIInsightsStore } from '../../store/aiInsightsStore';
import { useUILayoutStore } from '../../store/uiLayoutStore';

// Compiled-in check (false on Android / older iOS → use the blur fallback path).
const GLASS = isLiquidGlassAvailable();

const SPRING = { damping: 18, stiffness: 210, mass: 0.7 } as const;
const INSET = 3;          // pill inset inside a tab
const MAX_STRETCH = 26;   // px of liquid stretch at high drag speed

// Modern tab glyphs: outline when inactive, solid when active (same map as CustomTabBar).
const NAV_ICON: Record<string, { solid: string; outline: string }> = {
  home: { solid: 'i/home', outline: 'i/home-outline' },
  sliders: { solid: 'i/pie-chart', outline: 'i/pie-chart-outline' },
  'edit-3': { solid: 'i/pencil', outline: 'i/pencil-outline' },
  zap: { solid: 'i/flash', outline: 'i/flash-outline' },
  settings: { solid: 'i/settings', outline: 'i/settings-outline' },
};

// Render a lib-prefixed glyph spec (`i/` Ionicons, `m/` MaterialCommunityIcons, default Feather).
const renderNavGlyph = (spec: string, size: number, color: string) => {
  const [lib, name] = spec.includes('/') ? spec.split('/') : ['f', spec];
  if (lib === 'm') return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
  if (lib === 'i') return <Ionicons name={name as any} size={size} color={color} />;
  return <Feather name={name as any} size={size} color={color} />;
};

type TabLayout = { x: number; w: number; cx: number };

interface Props extends BottomTabBarProps {
  accentColor: string;
  /** Active tab tint (icon + label). Defaults to the olive C.accent (personal);
   *  business passes C.bronze so its bar matches business identity, not personal's olive. */
  activeColor?: string;
}

const LiquidGlassNavBar: React.FC<Props> = ({ state, descriptors, navigation, accentColor, activeColor }) => {
  const C = useCalm();
  const isDark = useIsDark();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(C), [C]);
  const pendingCount = useAIInsightsStore((s) => s.pendingActions.length);
  const setNavBarHeight = useUILayoutStore((s) => s.setNavBarHeight);

  const ACTIVE = activeColor ?? C.accent;
  const INACTIVE = C.textMuted;

  // ── Morphing highlight state (UI-thread shared values) ──
  const pillL = useSharedValue(0);
  const pillR = useSharedValue(0);
  const ready = useSharedValue(0);
  const barW = useSharedValue(0);
  const layoutsSV = useSharedValue<TabLayout[]>([]);
  const activeSV = useSharedValue(state.index);

  const layoutsRef = useRef<Record<number, TabLayout>>({});
  const [visualActive, setVisualActive] = useState(state.index); // which tab looks active (leads navigation while dragging)

  const springToTab = useCallback((idx: number) => {
    const l = layoutsRef.current[idx];
    if (!l) return;
    pillL.value = withSpring(l.x + INSET, SPRING);
    pillR.value = withSpring(l.x + l.w - INSET, SPRING);
  }, [pillL, pillR]);

  const onTabLayout = useCallback(
    (i: number) => (e: LayoutChangeEvent) => {
      const { x, width } = e.nativeEvent.layout;
      layoutsRef.current[i] = { x, w: width, cx: x + width / 2 };
      // publish to the UI thread for the pan worklet
      layoutsSV.value = Object.keys(layoutsRef.current)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => layoutsRef.current[Number(k)]);

      if (Object.keys(layoutsRef.current).length === state.routes.length && ready.value === 0) {
        const l = layoutsRef.current[state.index];
        if (l) { pillL.value = l.x + INSET; pillR.value = l.x + l.w - INSET; }
        ready.value = 1;
      }
    },
    [state.routes.length, state.index, layoutsSV, pillL, pillR, ready],
  );

  // Keep the pill + visual in sync when navigation changes the active tab (taps, deep links).
  useEffect(() => {
    activeSV.value = state.index;
    setVisualActive(state.index);
    if (ready.value === 1) springToTab(state.index);
  }, [state.index, springToTab, activeSV, ready]);

  // ── Navigation (unchanged semantics from CustomTabBar) ──
  const navigateTo = useCallback((index: number) => {
    const route = state.routes[index];
    const isFocused = state.index === index;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!isFocused && !event.defaultPrevented) {
      selectionChanged();
      navigation.navigate(route.name);
    }
  }, [navigation, state.routes, state.index]);

  const handleLongPress = useCallback((routeKey: string) => {
    navigation.emit({ type: 'tabLongPress', target: routeKey });
  }, [navigation]);

  // ── Drag-to-scrub gesture (only engages on horizontal movement, so taps pass through) ──
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .onUpdate((e) => {
          'worklet';
          const L = layoutsSV.value;
          if (!L.length) return;
          const cx = Math.max(10, Math.min(barW.value - 10, e.x));
          // nearest tab
          let idx = 0, best = 1e9;
          for (let i = 0; i < L.length; i++) {
            const d = Math.abs(L[i].cx - cx);
            if (d < best) { best = d; idx = i; }
          }
          const half = L[idx].w / 2 - INSET;
          const stretch = Math.min(Math.abs(e.velocityX) * 0.015, MAX_STRETCH);
          pillL.value = cx - half - stretch / 2;
          pillR.value = cx + half + stretch / 2;
          if (activeSV.value !== idx) { activeSV.value = idx; runOnJS(setVisualActive)(idx); }
        })
        .onEnd(() => {
          'worklet';
          const idx = activeSV.value;
          const L = layoutsSV.value;
          if (L[idx]) {
            pillL.value = withSpring(L[idx].x + INSET, SPRING);
            pillR.value = withSpring(L[idx].x + L[idx].w - INSET, SPRING);
          }
          runOnJS(navigateTo)(idx);
        }),
    [layoutsSV, barW, pillL, pillR, activeSV, navigateTo],
  );

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillL.value }],
    width: Math.max(10, pillR.value - pillL.value),
    opacity: ready.value,
  }));

  // Fallback-only (Android / iOS < 26): solid pill color over the blur bar.
  const highlightTint = withAlpha(accentColor, isDark ? 0.3 : 0.2);

  const renderTabs = () =>
    state.routes.map((route, index) => {
      const { options } = descriptors[route.key];
      const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : (options.title ?? route.name);
      const isFocused = visualActive === index;
      const color = isFocused ? ACTIVE : INACTIVE;
      const badgeCount = route.name === 'MoneyChat' ? pendingCount : 0;

      const iconName: string = options.tabBarIcon
        ? ((options.tabBarIcon as any)({ focused: isFocused, color: '', size: 24 }) as any).props.name
        : 'circle';

      return (
        <Pressable
          key={route.key}
          accessibilityRole="button"
          accessibilityState={isFocused ? { selected: true } : {}}
          accessibilityLabel={options.tabBarAccessibilityLabel}
          onPress={() => navigateTo(index)}
          onLongPress={() => handleLongPress(route.key)}
          onLayout={onTabLayout(index)}
          style={styles.tab}
        >
          <View style={styles.iconWrap}>
            {NAV_ICON[iconName] ? (
              // Treatment B: always the solid glyph; `color` handles active(olive)/inactive(muted).
              renderNavGlyph(NAV_ICON[iconName].solid, 24, color)
            ) : FEATHER_TO_GLYPH[iconName] ? (
              <DuoIcon glyph={FEATHER_TO_GLYPH[iconName]} size={24} color={color} duo fillAlpha={0.3} />
            ) : (
              <Feather name={iconName as any} size={23} color={color} />
            )}
            {badgeCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText} numberOfLines={1}>{badgeCount > 9 ? '9+' : String(badgeCount)}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.label, { color }]} numberOfLines={1}>{label}</Text>
        </Pressable>
      );
    });

  const onRowLayout = (e: LayoutChangeEvent) => { barW.value = e.nativeEvent.layout.width; };

  return (
    <View
      style={[styles.wrap, { paddingBottom: insets.bottom + SPACING.xs }]}
      pointerEvents="box-none"
      // Report the bar's true height (capsule + bottom safe-area padding) so the
      // Echo composer can seat itself just above it instead of guessing (was: +88).
      onLayout={(e) => setNavBarHeight(e.nativeEvent.layout.height)}
    >
      <GestureDetector gesture={pan}>
        {GLASS ? (
          // ── Native iOS 26 Liquid Glass ──
          // Plain View capsule, NOT GlassContainer: the bar glass and pill glass fully
          // overlap, so the container's merge-morph drew a "goo" bulge outside the capsule
          // (the ghost rectangle above the bar). A discrete bar + gliding pill lens is
          // also exactly how the system tab bar (WhatsApp et al) reads.
          <View style={styles.capsule}>
            <GlassView
              style={[StyleSheet.absoluteFill, styles.glassShape]}
              glassEffectStyle="regular"
              // Untinted: the pure system material (what WhatsApp's bar is). Any tint
              // sits on the effect itself and mutes the lens.
              colorScheme={isDark ? 'dark' : 'light'}
            />
            <View style={styles.row} onLayout={onRowLayout}>
              <Animated.View style={[styles.highlight, pillStyle]}>
                <GlassView
                  style={[StyleSheet.absoluteFill, styles.highlightShape]}
                  // `clear` = UIGlassEffect.Style.clear — the ring-lens variant the system
                  // pills use (Instagram/WhatsApp). `regular` frosts it flat.
                  glassEffectStyle="clear"
                  isInteractive
                  // Whisper of white so the blob still reads over near-black; the lens does the rest.
                  tintColor={withAlpha('#FFFFFF', isDark ? 0.1 : 0.08)}
                  colorScheme={isDark ? 'dark' : 'light'}
                />
              </Animated.View>
              {renderTabs()}
            </View>
          </View>
        ) : (
          // ── expo-blur fallback (Android / iOS < 26) ──
          <View style={styles.capsule}>
            <BlurView
              style={[StyleSheet.absoluteFill, styles.glassShape]}
              intensity={isDark ? 34 : 42}
              tint={isDark ? 'dark' : 'light'}
              experimentalBlurMethod="dimezisBlurView"
            />
            <View style={[StyleSheet.absoluteFill, styles.glassShape, styles.blurTint]} />
            <View style={styles.row} onLayout={onRowLayout}>
              <Animated.View style={[styles.highlight, styles.highlightShape, { backgroundColor: highlightTint }, pillStyle]} />
              {renderTabs()}
            </View>
          </View>
        )}
      </GestureDetector>
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    paddingHorizontal: SPACING.md,   // 16 — floating side margins
    alignItems: 'stretch',
  },
  capsule: {
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
  },
  glassShape: {
    borderRadius: 30,   // no fake border — the glass material draws its own specular rim
  },
  blurTint: {
    backgroundColor: withAlpha(C.surface, 0.5),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: withAlpha('#FFFFFF', 0.35),   // fallback bar keeps an edge (no native rim there)
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  highlight: {
    position: 'absolute',
    top: 6, bottom: 6, left: 0,
    zIndex: 0,
  },
  highlightShape: {
    borderRadius: 24,   // full capsule, like the system tab-bar pill; the `regular` material brings its own specular rim
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    gap: 3,
    zIndex: 1,
  },
  iconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: -5, right: -10,
    minWidth: 16, height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: C.bronze,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: C.surface,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.onAccent,
  },
});

export default React.memo(LiquidGlassNavBar);
