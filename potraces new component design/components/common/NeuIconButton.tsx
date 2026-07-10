// ─── NEUMORPHIC ICON BUTTON ────────────────────────────────────────────
// Reusable soft-UI button: neumorphic face + spring scale + inset on press.
// Used for the QR button and (optionally) the Quick-Add FAB.
//
// PLACE AT: src/components/common/NeuIconButton.tsx
//
// USAGE — QR button (Dashboard, replaces the qrButton TouchableOpacity):
//   <NeuIconButton size={44} radius={14} onPress={openQr} accessibilityLabel={t.dashboard.showPaymentQr}>
//     <Feather name="maximize" size={22} color={paymentQrs.length > 0 ? C.accent : C.textMuted} />
//   </NeuIconButton>
//
// USAGE — standalone FAB:
//   <NeuIconButton size={56} radius={9999} onPress={openQuickAdd}>
//     <Ionicons name="add" size={30} color={C.accent} />
//   </NeuIconButton>
//
// NOTE on the *draggable* Quick-Add FAB inside QuickAddExpense.tsx: that FAB uses
// a PanResponder on its wrapper, so don't nest this Pressable inside it — instead
// wrap just the FAB face with <NeuSurface> (see HANDOFF).

import React, { useState } from 'react';
import { Pressable, StyleProp, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { NeuSurface } from './neu';
import { lightTap } from '../../services/haptics';

const SPRING = { damping: 15, stiffness: 260, mass: 0.6 } as const;

interface Props {
  onPress: () => void;
  size?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  children: React.ReactNode;
}

const NeuIconButton: React.FC<Props> = ({
  onPress, size = 56, radius, style, accessibilityLabel, accessibilityHint, children,
}) => {
  const [pressed, setPressed] = useState(false);
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const r = radius ?? Math.round(size * 0.34);

  return (
    <Pressable
      onPressIn={() => { setPressed(true); scale.value = withSpring(0.92, SPRING); }}
      onPressOut={() => { setPressed(false); scale.value = withSpring(1, SPRING); }}
      onPress={() => { lightTap(); onPress(); }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      hitSlop={8}
    >
      <Animated.View style={aStyle}>
        <NeuSurface
          pressed={pressed}
          style={[{ width: size, height: size, borderRadius: r, alignItems: 'center', justifyContent: 'center' }, style]}
        >
          {children}
        </NeuSurface>
      </Animated.View>
    </Pressable>
  );
};

export default NeuIconButton;
