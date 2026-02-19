import React, { useEffect, useRef, useState } from 'react';
import { View, Animated, Dimensions, StyleSheet } from 'react-native';
import { COLORS } from '../../constants';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const PARTICLE_COLORS = [
  COLORS.primary,
  COLORS.success,
  COLORS.accent,
  '#FFD700',
  COLORS.info,
  '#A06CD5',
];

const NUM_PARTICLES = 30;

interface Particle {
  x: number;
  y: Animated.Value;
  opacity: Animated.Value;
  rotate: Animated.Value;
  size: number;
  color: string;
}

interface ConfettiProps {
  active: boolean;
}

const Confetti: React.FC<ConfettiProps> = ({ active }) => {
  const [particles, setParticles] = useState<Particle[]>([]);
  const prevActive = useRef(false);

  useEffect(() => {
    // Trigger only on rising edge (false → true)
    if (active && !prevActive.current) {
      const newParticles: Particle[] = Array.from({ length: NUM_PARTICLES }, () => ({
        x: Math.random() * SCREEN_WIDTH,
        y: new Animated.Value(-20),
        opacity: new Animated.Value(1),
        rotate: new Animated.Value(0),
        size: 6 + Math.random() * 6,
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      }));

      setParticles(newParticles);

      const animations = newParticles.map((p) => {
        const duration = 1800 + Math.random() * 800;
        return Animated.parallel([
          Animated.timing(p.y, {
            toValue: SCREEN_HEIGHT + 40,
            duration,
            useNativeDriver: true,
          }),
          Animated.timing(p.opacity, {
            toValue: 0,
            duration,
            delay: duration * 0.6,
            useNativeDriver: true,
          }),
          Animated.timing(p.rotate, {
            toValue: 3 + Math.random() * 4,
            duration,
            useNativeDriver: true,
          }),
        ]);
      });

      Animated.stagger(30, animations).start(() => {
        setParticles([]);
      });
    }
    prevActive.current = active;
  }, [active]);

  if (particles.length === 0) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false} importantForAccessibility="no">
      {particles.map((p, i) => (
        <Animated.View
          key={i}
          style={[
            styles.particle,
            {
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              borderRadius: p.size > 9 ? 2 : p.size / 2,
              left: p.x,
              opacity: p.opacity,
              transform: [
                { translateY: p.y },
                {
                  rotate: p.rotate.interpolate({
                    inputRange: [0, 7],
                    outputRange: ['0deg', '2520deg'],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  particle: {
    position: 'absolute',
    top: 0,
  },
});

export default Confetti;
