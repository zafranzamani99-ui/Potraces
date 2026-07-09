// ─── NEU PRESSABLE ─────────────────────────────────────────────────────
// The NeuButton spring-press feel (scale-down + slight fade on a spring),
// wrapped around ARBITRARY children/styling. Use it when you want a button to
// press like the shared NeuButton but keep its own custom look (e.g. a tonal
// olive-text CTA that isn't the solid-olive NeuButton). Near-drop-in for a
// TouchableOpacity: pass style + onPress, drop activeOpacity.

import React, { useCallback } from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { lightTap } from '../../services/haptics';

const SPRING = { damping: 15, stiffness: 260, mass: 0.6 } as const;

interface Props extends Omit<PressableProps, 'style' | 'onPress'> {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  /** haptic tap on press (default true) */
  haptic?: boolean;
  children: React.ReactNode;
}

const NeuPressable: React.FC<Props> = ({ onPress, style, disabled, haptic = true, children, ...rest }) => {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }));

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
      onPress={() => { if (disabled) return; if (haptic) lightTap(); onPress(); }}
      disabled={disabled}
      {...rest}
    >
      <Animated.View style={[style, aStyle]}>{children}</Animated.View>
    </Pressable>
  );
};

export default NeuPressable;
