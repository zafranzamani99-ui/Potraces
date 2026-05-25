import React, { useMemo } from 'react';
import { Animated, View, TouchableOpacity, Alert, StyleSheet, PanResponderInstance } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { EdgeInsets } from 'react-native-safe-area-context';
import { CALM, CALM_DARK, SPACING, RADIUS, SHADOWS, TYPOGRAPHY, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { lightTap } from '../../services/haptics';
import TypewriterText from '../common/TypewriterText';

interface GreetingChip {
  label: string;
  question: string;
}

interface EchoFabProps {
  visible: boolean;
  fabSide: 'left' | 'right';
  onSetFabSide: (side: 'left' | 'right') => void;
  echoFabPan: Animated.ValueXY;
  echoFabPanResponder: PanResponderInstance;
  greetingText: string;
  greetingDismissed: boolean;
  onSetGreetingDismissed: (dismissed: boolean) => void;
  greetingHiddenDuringDrag: boolean;
  onSetGreetingHiddenDuringDrag: (hidden: boolean) => void;
  greetingChips: GreetingChip[];
  onOpenSheet: (autoPrompt?: string) => void;
  onHideEcho: () => void;
  tier: string;
  onShowPaywall: () => void;
  insets: EdgeInsets;
}

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  walletEchoFabContainer: {
    position: 'absolute',
    alignItems: 'center',
    gap: SPACING.sm,
    zIndex: 999,
    elevation: 999,
  },
  walletEchoFab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...(C === CALM_DARK ? SHADOWS.xs : SHADOWS.md),
  },
  walletEchoFabPulse: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.gold,
    borderWidth: 1.5,
    borderColor: C.accent,
  },
  walletEchoGreetingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    maxWidth: 260,
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.2),
    ...(C === CALM_DARK ? SHADOWS.xs : SHADOWS.md),
  },
  walletEchoGreetingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: C.accent,
  },
  walletEchoGreetingText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    lineHeight: 18,
  },
  walletEchoGreetingDismiss: {
    padding: 2,
    marginLeft: SPACING.xs,
  },
  walletEchoGreetingTail: {
    position: 'absolute',
    top: 13,
    width: 12,
    height: 12,
    backgroundColor: C.surface,
    borderColor: withAlpha(C.accent, 0.2),
    transform: [{ rotate: '45deg' }],
  },
  echoFabLock: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.onAccent,
  },
});

const EchoFab: React.FC<EchoFabProps> = ({
  visible,
  fabSide,
  echoFabPan,
  echoFabPanResponder,
  greetingText,
  greetingDismissed,
  onSetGreetingDismissed,
  greetingHiddenDuringDrag,
  greetingChips,
  onOpenSheet,
  onHideEcho,
  tier,
  onShowPaywall,
  insets,
}) => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.walletEchoFabContainer,
        fabSide === 'right'
          ? { right: SPACING.xl, flexDirection: 'row-reverse' }
          : { left: SPACING.xl, flexDirection: 'row' },
        { top: Math.max(insets.top, 20) + 80 },
        { transform: echoFabPan.getTranslateTransform() },
      ]}
      {...echoFabPanResponder.panHandlers}
    >
      {/* FAB always first in JSX — flexDirection positions it left or right */}
      <TouchableOpacity
        style={styles.walletEchoFab}
        onPress={() => { lightTap(); if (tier !== 'premium') { onShowPaywall(); return; } onOpenSheet(undefined); onSetGreetingDismissed(true); }}
        onLongPress={() => {
          lightTap();
          Alert.alert(t.wallets.hideEchoTitle, t.wallets.hideEchoMsg, [
            { text: t.common.cancel, style: 'cancel' },
            { text: t.wallets.hideEchoAction, onPress: () => onHideEcho() },
          ]);
        }}
        delayLongPress={500}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Open Echo assistant (hold to hide)"
      >
        <Feather name="zap" size={22} color={C.onAccent} />
        {tier !== 'premium' && (
          <View style={styles.echoFabLock}>
            <Feather name="lock" size={9} color={C.onAccent} />
          </View>
        )}
        <View style={styles.walletEchoFabPulse} />
      </TouchableOpacity>
      {greetingText && !greetingDismissed && !greetingHiddenDuringDrag && (
        <TouchableOpacity
          style={styles.walletEchoGreetingBubble}
          onPress={() => { lightTap(); if (tier !== 'premium') { onShowPaywall(); return; } onOpenSheet(greetingChips[0]?.question || greetingText); }}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Echo: ${greetingText}`}
        >
          <View style={styles.walletEchoGreetingDot} />
          <TypewriterText
            text={greetingText}
            style={styles.walletEchoGreetingText}
            speed={28}
            startDelay={140}
          />
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation(); onSetGreetingDismissed(true); }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.walletEchoGreetingDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss greeting"
          >
            <Feather name="x" size={12} color={C.textMuted} />
          </TouchableOpacity>
          {/* Tail points toward FAB */}
          <View style={[
            styles.walletEchoGreetingTail,
            fabSide === 'left'
              ? { left: -6, borderBottomWidth: 1, borderLeftWidth: 1 }
              : { right: -6, borderTopWidth: 1, borderRightWidth: 1 },
          ]} />
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

export default EchoFab;
