import React, { useEffect, useRef } from 'react';
import { StyleSheet, Animated, ViewStyle } from 'react-native';
import { CALM, RADIUS } from '../../constants';
import { useCalm } from '../../hooks/useCalm';

type SkeletonShape = 'box' | 'circle' | 'line';

interface SkeletonLoaderProps {
  shape?: SkeletonShape;
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

const DEFAULT_SIZES: Record<SkeletonShape, { width: number | string; height: number; borderRadius: number }> = {
  box: { width: '100%', height: 120, borderRadius: RADIUS.lg },
  circle: { width: 44, height: 44, borderRadius: RADIUS.full },
  line: { width: '100%', height: 16, borderRadius: RADIUS.xs },
};

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  shape = 'box',
  width,
  height,
  borderRadius,
  style,
}) => {
  const C = useCalm();
  const opacityAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacityAnim, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacityAnim]);

  const defaults = DEFAULT_SIZES[shape];
  const finalWidth = width ?? defaults.width;
  const finalHeight = height ?? defaults.height;
  const finalBorderRadius = borderRadius ?? defaults.borderRadius;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width: finalWidth as any,
          height: finalHeight,
          borderRadius: finalBorderRadius,
          backgroundColor: C.border,
          opacity: opacityAnim,
        },
        style,
      ]}
      accessibilityRole="none"
      accessibilityLabel="Loading content"
    />
  );
};

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
});

export default SkeletonLoader;
