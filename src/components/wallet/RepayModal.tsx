import React, { useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  Pressable,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { Wallet } from '../../types';
import WalletLogo from '../common/WalletLogo';
import WalletPicker from '../common/WalletPicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { lightTap } from '../../services/haptics';
import { useT } from '../../i18n';

interface RepayModalProps {
  visible: boolean;
  onClose: () => void;
  repayWalletId: string | null;
  repaySourceId: string | null;
  setRepaySourceId: (id: string | null) => void;
  repayAmount: string;
  setRepayAmount: (val: string) => void;
  wallets: Wallet[];
  nonCreditWallets: Wallet[];
  currency: string;
  onRepay: () => void;
}

const RepayModal: React.FC<RepayModalProps> = ({
  visible,
  onClose,
  repayWalletId,
  repaySourceId,
  setRepaySourceId,
  repayAmount,
  setRepayAmount,
  wallets,
  nonCreditWallets,
  currency,
  onRepay,
}) => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { height: SCREEN_H } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(C), [C]);

  // ── Drag-to-dismiss ──
  const sheetY = useSharedValue(SCREEN_H);
  const dragStart = useSharedValue(0);
  const closingRef = useRef(false);

  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      sheetY.value = SCREEN_H;
      sheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
    }
  }, [visible, SCREEN_H, sheetY]);

  const finishClose = useCallback(() => {
    if (!closingRef.current) return;
    closingRef.current = false;
    onClose();
  }, [onClose]);

  const closeSheet = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    Keyboard.dismiss();
    sheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
  }, [SCREEN_H, sheetY, finishClose]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .onStart(() => {
          'worklet';
          dragStart.value = sheetY.value;
        })
        .onUpdate((e) => {
          'worklet';
          let newY = dragStart.value + e.translationY;
          if (newY < 0) newY = newY / 3;
          sheetY.value = newY;
        })
        .onEnd((e) => {
          'worklet';
          if (e.translationY > 100 || e.velocityY > 800) {
            runOnJS(closeSheet)();
          } else {
            sheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [SCREEN_H, closeSheet]
  );

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));
  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));

  if (!visible) return null;

  return (
    <Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={closeSheet}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Reanimated.View style={[styles.backdrop, backdropAnimatedStyle]}>
          <Pressable style={{ flex: 1 }} onPress={closeSheet} />
        </Reanimated.View>

        <Reanimated.View style={[styles.sheetContainer, sheetAnimatedStyle]}>
          <GestureDetector gesture={panGesture}>
            <View collapsable={false}>
              <View style={styles.sheetTopRow}>
                <View style={styles.sheetHandle} />
              </View>
              <View style={styles.sheetTitleZone}>
                <Text style={styles.sheetTitle}>
                  repay <Text style={styles.sheetTitleAccent}>credit</Text>
                </Text>
              </View>
            </View>
          </GestureDetector>

          <KeyboardAwareScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            contentContainerStyle={{ paddingHorizontal: SPACING.xl, paddingBottom: SPACING.lg }}
            keyboardDismissMode="on-drag"
          >
            {repayWalletId && (() => {
              const cw = wallets.find((w) => w.id === repayWalletId);
              if (!cw) return null;
              return (
                <View style={styles.repayContextCard}>
                  <View style={[styles.repayIconBg, { backgroundColor: cw.presetId ? C.background : withAlpha(cw.color, 0.15) }]}>
                    <WalletLogo wallet={cw} size={40} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.repayName}>{cw.name}</Text>
                    <Text style={styles.repayUsed}>
                      {t.wallets.usedPrefix} {currency} {(cw.usedCredit || 0).toFixed(2)}
                    </Text>
                  </View>
                </View>
              );
            })()}

            <View style={styles.heroCard}>
              <Text style={styles.fieldLabel}>{t.wallets.repaymentAmount}</Text>
              <View style={styles.heroAmountRow}>
                <Text style={styles.heroCurrency}>{currency}</Text>
                <TextInput
                  style={styles.heroAmountInput}
                  value={repayAmount}
                  onChangeText={setRepayAmount}
                  placeholder="0.00"
                  placeholderTextColor={withAlpha(C.textPrimary, 0.12)}
                  keyboardType="decimal-pad"
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={C.accent}
                  accessibilityLabel={t.wallets.repaymentAmount.toLowerCase()}
                />
              </View>
            </View>

            <View style={styles.walletPickerCard}>
              <Text style={styles.fieldLabel}>{t.wallets.payFrom}</Text>
              <WalletPicker
                wallets={nonCreditWallets}
                selectedId={repaySourceId}
                onSelect={(id) => { lightTap(); setRepaySourceId(id); }}
              />
            </View>
          </KeyboardAwareScrollView>

          <View style={[styles.saveZone, { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.sm) }]}>
            <Pressable style={styles.saveBtn} onPress={onRepay} accessibilityRole="button" accessibilityLabel="repay">
              <View style={styles.saveBtnInner}>
                <Feather name="check" size={16} color={C.onAccent} />
                <Text style={styles.saveBtnText}>{t.wallets.repay.toLowerCase()}</Text>
              </View>
            </Pressable>
            <Pressable style={styles.closeLink} onPress={closeSheet} hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}>
              {({ pressed }: { pressed: boolean }) => (
                <View style={[styles.closeLinkInner, pressed && { opacity: 0.55 }]}>
                  <Feather name="x" size={12} color={C.textMuted} />
                  <Text style={styles.closeLinkText}>close</Text>
                </View>
              )}
            </Pressable>
          </View>
        </Reanimated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: withAlpha(C.dimBg, 0.4),
  },
  sheetContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    maxHeight: '92%',
  },
  sheetTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: withAlpha(C.textPrimary, 0.15),
  },
  sheetTitleZone: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  sheetTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  sheetTitleAccent: {
    fontStyle: 'italic',
    fontFamily: 'serif',
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.accent,
  },
  repayContextCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.sm + 4,
    marginBottom: SPACING.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  repayIconBg: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repayName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  repayUsed: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginTop: 2,
  },
  heroCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    marginBottom: SPACING.sm + 2,
  },
  fieldLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: SPACING.xs,
    gap: SPACING.xs,
  },
  heroCurrency: {
    fontSize: 22,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.accent,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  heroAmountInput: {
    flex: 1,
    fontSize: 36,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.8,
    paddingVertical: 0,
  },
  walletPickerCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.sm + 4,
    marginBottom: SPACING.sm + 2,
  },
  saveZone: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.textPrimary, 0.06),
    backgroundColor: C.surface,
  },
  saveBtn: {
    width: '100%',
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.full,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  saveBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saveBtnText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
    letterSpacing: 0.3,
  },
  closeLink: {
    marginTop: SPACING.lg,
    alignSelf: 'center',
  },
  closeLinkInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  closeLinkText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
  },
});

export default RepayModal;
