import React from 'react';
import { Animated, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCalm } from '../../hooks/useCalm';
import { withAlpha } from '../../constants';

interface Props {
  hideZoneAnim: Animated.Value;
  hideZoneHoverAnim: Animated.Value;
  measureRef?: React.RefObject<View | null>;
}

export default function EchoDragHideZone({ hideZoneAnim, hideZoneHoverAnim, measureRef }: Props) {
  const C = useCalm();
  const insets = useSafeAreaInsets();
  const { width: SCREEN_W } = useWindowDimensions();

  const scale = hideZoneHoverAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.3],
  });

  const bg = hideZoneHoverAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [withAlpha(C.textPrimary, 0.08), withAlpha(C.accent, 0.22)],
  });

  const borderColor = hideZoneHoverAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [withAlpha(C.textPrimary, 0.12), withAlpha(C.accent, 0.4)],
  });

  const eyeOpenOpacity = hideZoneHoverAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });
  const eyeClosedOpacity = hideZoneHoverAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  return (
    <View
      ref={measureRef}
      collapsable={false}
      pointerEvents="none"
      style={[
        styles.zone,
        {
          left: SCREEN_W / 2 - 28,
          bottom: Math.max(insets.bottom, 20) + 32,
        },
      ]}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.zoneInner,
          {
            opacity: hideZoneAnim,
            transform: [{ scale }],
            backgroundColor: bg,
            borderColor,
          },
        ]}
      >
        <Animated.View style={[styles.icon, { opacity: eyeOpenOpacity }]}>
          <Feather name="eye" size={22} color={C.textMuted} />
        </Animated.View>
        <Animated.View style={[styles.icon, { opacity: eyeClosedOpacity }]}>
          <Feather name="eye-off" size={22} color={C.accent} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  zone: {
    position: 'absolute',
    width: 56,
    height: 56,
    zIndex: 998,
    elevation: 998,
  },
  zoneInner: {
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  icon: {
    position: 'absolute',
  },
});
