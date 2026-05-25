import React, { useMemo, useCallback, useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CALM,
  CALM_DARK,
  SPACING,
  RADIUS,
  TYPOGRAPHY,
  withAlpha,
} from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import WalletPicker from '../common/WalletPicker';
import WalletLogo from '../common/WalletLogo';
import { lightTap } from '../../services/haptics';
import type { Wallet } from '../../types';

interface TransferModalProps {
  visible: boolean;
  onClose: () => void;
  transferFrom: string | null;
  setTransferFrom: (id: string) => void;
  transferTo: string | null;
  setTransferTo: (id: string) => void;
  transferAmount: string;
  setTransferAmount: (v: string) => void;
  transferNote: string;
  setTransferNote: (v: string) => void;
  nonCreditWallets: Wallet[];
  transferToWallets: Wallet[];
  wallets: Wallet[];
  currency: string;
  onTransfer: () => void;
}

const TransferModal: React.FC<TransferModalProps> = ({
  visible,
  onClose,
  transferFrom,
  setTransferFrom,
  transferTo,
  setTransferTo,
  transferAmount,
  setTransferAmount,
  transferNote,
  setTransferNote,
  nonCreditWallets,
  transferToWallets,
  wallets,
  currency,
  onTransfer,
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

  const handleAmountChange = useCallback((raw: string) => {
    const stripped = raw.replace(/,/g, '').replace(/[^\d.]/g, '');
    const fd = stripped.indexOf('.');
    let normalized = stripped;
    if (fd !== -1) {
      normalized = stripped.slice(0, fd + 1) + stripped.slice(fd + 1).replace(/\./g, '');
      const [ip, fp = ''] = normalized.split('.');
      normalized = ip + '.' + fp.slice(0, 2);
    }
    setTransferAmount(normalized);
  }, [setTransferAmount]);

  const displayAmount = useMemo(() => {
    if (!transferAmount) return '';
    const dotIdx = transferAmount.indexOf('.');
    const intRaw = dotIdx === -1 ? transferAmount : transferAmount.slice(0, dotIdx);
    const fracRaw = dotIdx === -1 ? null : transferAmount.slice(dotIdx + 1);
    const intFormatted = intRaw ? Number(intRaw).toLocaleString('en-US') : '';
    if (fracRaw === null) return intFormatted;
    return `${intFormatted}.${fracRaw}`;
  }, [transferAmount]);

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
                  transfer <Text style={styles.sheetTitleAccent}>funds</Text>
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
            <View style={styles.fieldCard}>
              <Text style={styles.fieldLabel}>{t.wallets.from}</Text>
              <WalletPicker
                wallets={nonCreditWallets}
                selectedId={transferFrom}
                onSelect={(id) => { lightTap(); setTransferFrom(id); }}
              />
            </View>

            <View style={styles.fieldCard}>
              <Text style={styles.fieldLabel}>{t.wallets.to}</Text>
              <WalletPicker
                wallets={transferToWallets}
                selectedId={transferTo}
                onSelect={(id) => { lightTap(); setTransferTo(id); }}
              />
            </View>

            <View style={styles.heroCard}>
              <Text style={styles.fieldLabel}>
                {t.wallets.amount.toLowerCase()}
              </Text>
              <View style={styles.heroAmountRow}>
                <Text style={styles.heroCurrency} numberOfLines={1}>
                  {currency}
                </Text>
                <TextInput
                  style={styles.heroAmountInput}
                  value={displayAmount}
                  onChangeText={handleAmountChange}
                  placeholder="0.00"
                  placeholderTextColor={withAlpha(C.textPrimary, 0.12)}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  selectTextOnFocus
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={C.accent}
                  accessibilityLabel={t.wallets.amount.toLowerCase()}
                />
              </View>
            </View>

            {(() => {
              const amt = parseFloat(transferAmount);
              const fromW = wallets.find((w) => w.id === transferFrom);
              const toW = wallets.find((w) => w.id === transferTo);
              if (!fromW || !toW || !amt || amt <= 0) return null;
              const fromAfter = fromW.balance - amt;
              const toAfter = toW.balance + amt;
              return (
                <View style={styles.transferPreview}>
                  <View style={styles.transferPreviewRow}>
                    <WalletLogo wallet={fromW} size={16} />
                    <Text style={styles.transferPreviewName} numberOfLines={1}>{fromW.name}</Text>
                    <Text style={styles.transferPreviewBefore}>{currency} {fromW.balance.toFixed(2)}</Text>
                    <Text style={styles.transferPreviewArrow}>→</Text>
                    <Text style={[styles.transferPreviewAfter, fromAfter < 0 && { color: C.bronze }]}>{currency} {fromAfter.toFixed(2)}</Text>
                  </View>
                  <View style={styles.transferPreviewRow}>
                    <WalletLogo wallet={toW} size={16} />
                    <Text style={styles.transferPreviewName} numberOfLines={1}>{toW.name}</Text>
                    <Text style={styles.transferPreviewBefore}>{currency} {toW.balance.toFixed(2)}</Text>
                    <Text style={styles.transferPreviewArrow}>→</Text>
                    <Text style={[styles.transferPreviewAfter, { color: C.positive }]}>{currency} {toAfter.toFixed(2)}</Text>
                  </View>
                </View>
              );
            })()}

            <View style={styles.fieldCard}>
              <Text style={styles.fieldLabel}>
                {t.wallets.noteOptional.toLowerCase()}
              </Text>
              <TextInput
                style={styles.fieldInput}
                value={transferNote}
                onChangeText={setTransferNote}
                placeholder={t.wallets.topUpPlaceholder}
                placeholderTextColor={withAlpha(C.textPrimary, 0.25)}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={C.accent}
                accessibilityLabel={t.wallets.noteOptional.toLowerCase()}
              />
            </View>
          </KeyboardAwareScrollView>

          <View style={[styles.saveZone, { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.sm) }]}>
            <Pressable style={styles.saveBtn} onPress={onTransfer} accessibilityRole="button" accessibilityLabel="transfer">
              <View style={styles.saveBtnInner}>
                <Feather name="repeat" size={16} color={C.onAccent} />
                <Text style={styles.saveBtnText}>{t.wallets.transfer.toLowerCase()}</Text>
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
  heroAmountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: SPACING.xs,
  },
  heroCurrency: {
    fontSize: 22,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.accent,
    fontVariant: ['tabular-nums'],
    marginRight: 4,
    letterSpacing: -0.2,
    maxWidth: '40%',
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
  fieldLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  fieldCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.sm + 4,
    marginBottom: SPACING.sm + 2,
  },
  fieldInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
    paddingVertical: 2,
    minHeight: 22,
  },
  transferPreview: {
    marginBottom: SPACING.sm + 2,
    padding: SPACING.md,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.06 : 0.03),
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    gap: SPACING.sm,
  },
  transferPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  transferPreviewName: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textPrimary,
    flex: 1,
  },
  transferPreviewBefore: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textSecondary,
  },
  transferPreviewArrow: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textSecondary,
  },
  transferPreviewAfter: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.semibold,
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

export default TransferModal;
