// ─── NEU PRIMARY BUTTON ────────────────────────────────────────────────
// The one consistent primary-action button: a full-width olive (accent) pill
// with a white icon + label and the soft neu shadow. Use it for every primary
// CTA (Save, Create, Repay, Transfer, Confirm…) so they all read the same.
// Press feedback is a spring scale-down (NOT a neu inset — the inset shadow
// reads muddy over the solid olive fill). Part of the surface-design standard.

import React, { useCallback } from 'react';
import { Pressable, Text, View, StyleSheet, StyleProp, ViewStyle, ActivityIndicator } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { TYPOGRAPHY, SPACING, RADIUS } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useNeu } from './neu';
import { lightTap } from '../../services/haptics';

const SPRING = { damping: 15, stiffness: 260, mass: 0.6 } as const;

interface Props {
  onPress: () => void;
  label: string;
  icon?: keyof typeof Feather.glyphMap;
  disabled?: boolean;
  /** Show a spinner instead of the icon/label and block presses (e.g. while submitting). */
  loading?: boolean;
  /** Fill color; defaults to the mode accent (olive). */
  color?: string;
  /** Optional gradient fill (≥2 colors) layered over `color`. Opt-in — omit for the
   *  standard solid Neu Select. Clips to the pill via its own radius (keeps the neu
   *  shadow on the button view, per the seam rule). */
  gradient?: readonly [string, string, ...string[]];
  /** Icon/label color; defaults to onAccent (white). Override when the fill's
   *  contrast ink differs from the app default — e.g. the onboarding night CTA
   *  is gold and needs near-black ink, not white. */
  textColor?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

const NeuButton: React.FC<Props> = ({ onPress, label, icon, disabled, loading, color, gradient, textColor, accessibilityLabel, style }) => {
  const C = useCalm();
  const neu = useNeu();
  const fill = color ?? C.accent;
  const fg = textColor ?? C.onAccent;

  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  // opacity must fold in `disabled` here: this animated style is applied AFTER
  // `disabled && styles.disabled` in the array, so `opacity.value` would otherwise
  // override the disabled 0.5 and the button would never dim.
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: disabled ? 0.5 : opacity.value }));

  const onIn = useCallback(() => {
    scale.value = withSpring(0.95, SPRING);
    opacity.value = withSpring(0.92, SPRING);
  }, [scale, opacity]);
  const onOut = useCallback(() => {
    scale.value = withSpring(1, SPRING);
    opacity.value = withSpring(1, SPRING);
  }, [scale, opacity]);

  return (
    <Pressable
      onPressIn={onIn}
      onPressOut={onOut}
      onPress={() => { if (disabled || loading) return; lightTap(); onPress(); }}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
    >
      <Animated.View
        style={[
          styles.btn,
          neu.raisedSoft,   // soft variant: dark = clean drop-shadow, no muddy dark "highlight" on the olive fill
          { backgroundColor: fill },   // olive fill overrides the neu base
          disabled && styles.disabled,
          aStyle,
          style,
        ]}
      >
        {gradient && (
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            pointerEvents="none"
            style={[StyleSheet.absoluteFillObject, { borderRadius: RADIUS.full }]}
          />
        )}
        <View style={styles.inner}>
          {loading ? (
            <ActivityIndicator size="small" color={fg} />
          ) : (
            <>
              {icon && <Feather name={icon} size={16} color={fg} />}
              <Text style={[styles.label, { color: fg }]}>{label}</Text>
            </>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  btn: {
    width: '100%',
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  disabled: { opacity: 0.5 },
  inner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    letterSpacing: 0.3,
  },
});

export default NeuButton;
