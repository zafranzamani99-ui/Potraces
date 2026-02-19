import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import GRADIENTS from '../../constants/gradients';
import { COLORS, RADIUS, withAlpha } from '../../constants';

// ─── TYPES ──────────────────────────────────────────────────
type SkeletonShape = 'box' | 'circle' | 'line';

interface SkeletonLoaderProps {
  shape?: SkeletonShape;
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

// ─── DEFAULT SIZES ──────────────────────────────────────────
const DEFAULT_SIZES: Record<SkeletonShape, { width: number | string; height: number; borderRadius: number }> = {
  box: {
    width: '100%',
    height: 120,
    borderRadius: RADIUS.lg, // 14
  },
  circle: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.full, // 9999
  },
  line: {
    width: '100%',
    height: 16,
    borderRadius: RADIUS.xs, // 4
  },
};

// ─── COMPONENT ──────────────────────────────────────────────
/**
 * SkeletonLoader - Animated shimmer loading placeholder
 *
 * Features:
 * - Three shape variants: box, circle, line
 * - Smooth shimmer animation using LinearGradient
 * - Fully customizable dimensions
 * - Uses GRADIENTS.shimmer for consistent animation
 *
 * @example
 * <SkeletonLoader shape="box" width="100%" height={120} />
 * <SkeletonLoader shape="circle" width={44} height={44} />
 * <SkeletonLoader shape="line" width="80%" height={16} />
 */
const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  shape = 'box',
  width,
  height,
  borderRadius,
  style,
}) => {
  // ── Animation setup ──
  const translateX = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    // Infinite loop shimmer animation
    const animation = Animated.loop(
      Animated.timing(translateX, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    );

    animation.start();

    return () => animation.stop();
  }, [translateX]);

  // ── Derive dimensions from shape or custom props ──
  const defaults = DEFAULT_SIZES[shape];
  const finalWidth = width ?? defaults.width;
  const finalHeight = height ?? defaults.height;
  const finalBorderRadius = borderRadius ?? defaults.borderRadius;

  // ── Interpolate translateX for gradient movement ──
  const animatedTranslateX = translateX.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-100%', '100%'],
  });

  return (
    <View
      style={[
        styles.container,
        {
          width: finalWidth,
          height: finalHeight,
          borderRadius: finalBorderRadius,
          backgroundColor: COLORS.surfaceAlt, // Base skeleton color
        },
        style,
      ]}
      accessibilityRole="none"
      accessibilityLabel="Loading content"
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            transform: [{ translateX: animatedTranslateX }],
          },
        ]}
      >
        <LinearGradient
          colors={GRADIENTS.shimmer.colors}
          start={GRADIENTS.shimmer.start}
          end={GRADIENTS.shimmer.end}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
};

// ─── STYLES ─────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
});

export default SkeletonLoader;
