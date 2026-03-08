import React, { useRef, useEffect, useCallback } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useAppStore } from '../../store/appStore';
import { useSettingsStore } from '../../store/settingsStore';
import { COLORS, CALM, SPACING, TYPOGRAPHY, RADIUS, ANIMATION } from '../../constants';
import { selectionChanged } from '../../services/haptics';

const TRACK_WIDTH = 240;
const TRACK_HEIGHT = 36;
const THUMB_PADDING = 3;
const THUMB_WIDTH = TRACK_WIDTH / 2 - THUMB_PADDING;
const THUMB_HEIGHT = TRACK_HEIGHT - THUMB_PADDING * 2;

const ModeToggle: React.FC = () => {
  const { mode, setMode } = useAppStore();
  const businessModeEnabled = useSettingsStore((s) => s.businessModeEnabled);
  const slideAnim = useRef(new Animated.Value(mode === 'business' ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: mode === 'business' ? 1 : 0,
      duration: ANIMATION.normal,
      useNativeDriver: false,
    }).start();
  }, [mode, slideAnim]);

  const handlePress = useCallback((newMode: 'personal' | 'business') => {
    if (newMode === mode) return;
    selectionChanged();
    setMode(newMode);
  }, [mode, setMode]);

  if (!businessModeEnabled) return null;

  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [THUMB_PADDING, TRACK_WIDTH / 2],
  });

  const thumbColor = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [COLORS.personal, COLORS.business],
  });

  const personalTextColor = slideAnim.interpolate({
    inputRange: [0, 0.5],
    outputRange: ['#FFFFFF', CALM.textSecondary],
    extrapolate: 'clamp',
  });

  const businessTextColor = slideAnim.interpolate({
    inputRange: [0.5, 1],
    outputRange: [CALM.textSecondary, '#FFFFFF'],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.wrapper}>
      <View style={styles.track}>
        <Animated.View
          style={[
            styles.thumb,
            {
              transform: [{ translateX }],
              backgroundColor: thumbColor,
            },
          ]}
        />
        <TouchableOpacity
          style={styles.labelButton}
          onPress={() => handlePress('personal')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Switch to personal mode"
          accessibilityState={{ selected: mode === 'personal' }}
        >
          <Animated.Text style={[styles.labelText, { color: personalTextColor }]}>
            Personal
          </Animated.Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.labelButton}
          onPress={() => handlePress('business')}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Switch to business mode"
          accessibilityState={{ selected: mode === 'business' }}
        >
          <Animated.Text style={[styles.labelText, { color: businessTextColor }]}>
            Business
          </Animated.Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: 'center',
    marginVertical: SPACING.sm,
  },
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: RADIUS.lg,
    backgroundColor: CALM.background,
    flexDirection: 'row',
    position: 'relative',
  },
  thumb: {
    position: 'absolute',
    top: THUMB_PADDING,
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: RADIUS.lg - 2,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  labelButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  labelText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
});

export default React.memo(ModeToggle);
