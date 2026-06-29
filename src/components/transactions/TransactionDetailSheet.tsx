import React, { useMemo, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { ScrollView, Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { lightTap } from '../../services/haptics';
import CategoryIcon from '../common/CategoryIcon';
import WalletLogo from '../common/WalletLogo';
import ModalToastHost from '../common/ModalToastHost';
import { Transaction, CategoryOption, Wallet } from '../../types';

const SPRING_CFG = { damping: 22, stiffness: 220, mass: 0.5 };

interface TransactionDetailSheetProps {
  visible: boolean;
  onClose: () => void;
  transaction: Transaction | null;
  category?: CategoryOption;
  wallet?: Wallet | null;
  currency: string;
  onEdit: (transaction: Transaction) => void;
}

const formatDateTime = (date: Date): string =>
  format(date, "d MMM yyyy '·' h:mm a").replace(/AM|PM/, (m) => m.toLowerCase());

const TransactionDetailSheet: React.FC<TransactionDetailSheetProps> = ({
  visible, onClose, transaction, category, wallet, currency, onEdit,
}) => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const closingRef = useRef(false);
  const pendingEditRef = useRef<Transaction | null>(null);
  const { height: SCREEN_H } = useWindowDimensions();
  const sheetY = useSharedValue(SCREEN_H);
  const dragStart = useSharedValue(0);

  useEffect(() => {
    if (visible && transaction) {
      closingRef.current = false;
      sheetY.value = SCREEN_H;
      sheetY.value = withSpring(0, SPRING_CFG);
    }
  }, [visible, transaction?.id]);

  const finishClose = useCallback(() => {
    closingRef.current = false;
    const editTxn = pendingEditRef.current;
    pendingEditRef.current = null;
    onClose();
    // If the user tapped "edit", open the edit sheet only AFTER this sheet has
    // fully animated out — avoids stacking two native modal layers on iOS.
    if (editTxn) onEdit(editTxn);
  }, [onClose, onEdit]);

  const closeSheet = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    sheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
  }, [SCREEN_H, finishClose]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([10, 9999])
        .onStart(() => { 'worklet'; dragStart.value = sheetY.value; })
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
            sheetY.value = withSpring(0, SPRING_CFG);
          }
        }),
    [SCREEN_H, closeSheet]
  );

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));
  const backdropAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(sheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP),
  }));

  const handleEdit = useCallback(() => {
    if (!transaction) return;
    lightTap();
    // Animate the sheet closed first; finishClose fires onEdit afterwards.
    pendingEditRef.current = transaction;
    closeSheet();
  }, [transaction, closeSheet]);

  if (!visible || !transaction) return null;

  const isExpense = transaction.type === 'expense';
  const sign = isExpense ? '−' : '+';
  const tintColor = category?.color || C.accent;
  const title = transaction.description || category?.name || t.transactionList.walletFallback;

  return (
    <Modal visible animationType="none" transparent statusBarTranslucent onRequestClose={closeSheet}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Reanimated.View style={[styles.backdrop, backdropAnimStyle]}>
          <Pressable style={{ flex: 1 }} onPress={closeSheet} />
        </Reanimated.View>

        <Reanimated.View style={[styles.sheetContainer, sheetAnimStyle]}>
          <GestureDetector gesture={panGesture}>
            <View collapsable={false}>
              <View style={styles.topRow}>
                <View style={styles.handle} />
              </View>
              {/* Header */}
              <View style={styles.headerZone}>
                <View style={[styles.headerIconWrap, { backgroundColor: withAlpha(tintColor, 0.12) }]}>
                  <CategoryIcon
                    icon={category?.icon || (isExpense ? 'arrow-up-right' : 'arrow-down-left')}
                    size={24}
                    color={tintColor}
                  />
                </View>
                <Text style={styles.title} numberOfLines={1}>{title}</Text>
                <Text style={[styles.amount, !isExpense && { color: C.accent }]}>
                  {sign}{currency}{Math.abs(transaction.amount).toFixed(2)}
                </Text>
              </View>
            </View>
          </GestureDetector>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Detail rows — each led by its own icon (bank logo / category / calendar / type) */}
            <View style={styles.infoCard}>
              <View style={styles.detailRow}>
                <View style={styles.rowIcon}>
                  <CategoryIcon
                    icon={category?.icon || (isExpense ? 'arrow-up-right' : 'arrow-down-left')}
                    size={16}
                    color={tintColor}
                  />
                </View>
                <Text style={styles.detailLabel}>{t.notes.category}</Text>
                <Text style={styles.detailValue} numberOfLines={1}>{category?.name || '—'}</Text>
              </View>
              <View style={styles.rowDivider} />
              <View style={styles.detailRow}>
                <View style={styles.rowIcon}>
                  {wallet ? (
                    <WalletLogo wallet={wallet} size={20} />
                  ) : (
                    <Feather name="credit-card" size={15} color={C.textMuted} />
                  )}
                </View>
                <Text style={styles.detailLabel}>{t.notes.wallet}</Text>
                <Text style={styles.detailValue} numberOfLines={1}>{wallet?.name || '—'}</Text>
              </View>
              <View style={styles.rowDivider} />
              <View style={styles.detailRow}>
                <View style={styles.rowIcon}>
                  <Feather name="calendar" size={15} color={C.textMuted} />
                </View>
                <Text style={styles.detailLabel}>{t.transactionList.dateLabel}</Text>
                <Text style={styles.detailValue} numberOfLines={1}>{formatDateTime(transaction.date)}</Text>
              </View>
              <View style={styles.rowDivider} />
              <View style={styles.detailRow}>
                <View style={styles.rowIcon}>
                  <Feather
                    name={isExpense ? 'arrow-up-right' : 'arrow-down-left'}
                    size={15}
                    color={isExpense ? C.textMuted : C.accent}
                  />
                </View>
                <Text style={styles.detailLabel}>{t.notes.type}</Text>
                <Text style={styles.detailValue}>
                  {isExpense ? t.transactionList.expenses.toLowerCase() : t.transactionList.income.toLowerCase()}
                </Text>
              </View>
            </View>

            {/* Tags */}
            {transaction.tags && transaction.tags.length > 0 && (
              <View style={styles.tagRow}>
                {transaction.tags.map((tag) => (
                  <View key={tag} style={styles.tagChip}>
                    <Text style={styles.tagChipText}>{tag}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Edit action — delete lives inside the edit sheet, not here */}
            <TouchableOpacity style={styles.editBtn} onPress={handleEdit} activeOpacity={0.7}>
              <Feather name="edit-2" size={16} color={C.textSecondary} />
              <Text style={styles.editBtnText}>{t.common.edit.toLowerCase()}</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Close zone */}
          <View style={[styles.closeZone, { paddingBottom: Math.max(SPACING.lg, 34) }]}>
            <Pressable
              style={styles.closeLink}
              onPress={closeSheet}
              hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }}
              accessibilityRole="button"
              accessibilityLabel={t.common.close.toLowerCase()}
            >
              {({ pressed }) => (
                <View style={[styles.closeLinkInner, pressed && { opacity: 0.55 }]}>
                  <Feather name="x" size={12} color={C.textMuted} />
                  <Text style={styles.closeLinkText}>{t.common.close.toLowerCase()}</Text>
                </View>
              )}
            </Pressable>
          </View>
        </Reanimated.View>
        <ModalToastHost />
      </GestureHandlerRootView>
    </Modal>
  );
};

const makeStyles = (C: typeof CALM, isDark: boolean) => StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheetContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    maxHeight: '88%',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: withAlpha(C.textPrimary, 0.15),
  },
  headerZone: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  headerIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  title: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? -0.2 : -0.4,
    textAlign: 'center',
    maxWidth: '90%',
  },
  amount: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    marginTop: SPACING.xs,
    letterSpacing: -0.4,
  },
  scrollContent: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  infoCard: {
    backgroundColor: withAlpha(C.textPrimary, isDark ? 0.06 : 0.03),
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm + 3,
    gap: SPACING.sm + 2,
  },
  rowIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: withAlpha(C.textPrimary, 0.06),
  },
  detailLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
  },
  detailValue: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  tagChip: {
    backgroundColor: withAlpha(C.bronze, 0.12),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 4,
  },
  tagChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    backgroundColor: withAlpha(C.textPrimary, isDark ? 0.06 : 0.03),
  },
  editBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    letterSpacing: 0.2,
  },
  closeZone: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.textPrimary, 0.06),
    backgroundColor: C.surface,
  },
  closeLink: {
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

export default React.memo(TransactionDetailSheet);
