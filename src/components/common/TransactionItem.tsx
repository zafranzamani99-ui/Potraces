import React, { useRef, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import ReanimatedSwipeable, { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
// The swipe action's tap is handled by an RNGH Gesture.Tap (not a touchable):
// ReanimatedSwipeable (RNGH 2.25+) swallows touchable presses inside renderRightActions
// on Android, routing the tap to the row underneath. A sibling Tap gesture fires reliably.
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { format, isValid, isToday, isYesterday } from 'date-fns';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, ICON_SIZE, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import WalletLogo from './WalletLogo';
import CategoryIcon from './CategoryIcon';
import { Transaction, CategoryOption, Wallet } from '../../types';
import { lightTap } from '../../services/haptics';
import { useNeu } from './neu';

interface TransactionItemProps {
  transaction: Transaction;
  currency: string;
  category?: CategoryOption;
  wallet?: Wallet | null;
  onPress?: (id: string) => void;
  onLongPress?: (id: string) => void;
  onSwipeDelete?: (id: string) => void;
  isSelected?: boolean;
  selectMode?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  /** Row position in initial render — used for staggered entrance animation. */
  index?: number;
  /** Set false to skip the entrance fade (paginated lists — avoids recycle jank). */
  animateEntrance?: boolean;
}

/**
 * Transaction row as a NEUMORPHIC pill card — Phase 2 redesign.
 * Same layout/logic as before (generous icon, name + wallet sub-line, right-column
 * amount-over-date); the surface is now a soft-raised neumorphic card with a
 * debossed icon well, and press pushes it in.
 *
 * Always-do: S1 (RM tight-kerned), S5 (transaction as recorded moment),
 * S7 (tabular-nums right-aligned), N8 (no red — olive for income, text-primary for expense).
 */
const TransactionItem: React.FC<TransactionItemProps> = ({
  transaction,
  currency,
  category,
  wallet,
  onPress,
  onLongPress,
  onSwipeDelete,
  isSelected = false,
  selectMode = false,
  isFirst = false,
  isLast = false,
  index = 0,
  animateEntrance = true,
}) => {
  const swipeableRef = useRef<SwipeableMethods>(null);
  const C = useCalm();
  const neu = useNeu();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [pressed, setPressed] = useState(false);
  const isExpense = transaction.type === 'expense';
  const editCount = transaction.editLog?.length ?? 0;

  // Casual date label for the right-bottom column.
  // "today" / "yesterday" / "wed 28 apr" — Strava-borrowed lowercase register.
  const casualDate = useMemo(() => {
    if (!isValid(transaction.date)) return '—';
    if (isToday(transaction.date)) return t.transactionList.today.toLowerCase();
    if (isYesterday(transaction.date)) return t.transactionList.yesterday.toLowerCase();
    return format(transaction.date, 'EEE d MMM').toLowerCase();
  }, [transaction.date, t]);

  const casualTime = useMemo(() => {
    if (!isValid(transaction.date)) return '';
    return format(transaction.date, 'h:mm a').toLowerCase();
  }, [transaction.date]);

  const tagDisplay = useMemo(() => {
    if (!transaction.tags || transaction.tags.length === 0) return '';
    return transaction.tags
      .slice(0, 3)
      .map((tag) => tag.replace(/^#/, '').trim())
      .filter(Boolean)
      .join(' · ');
  }, [transaction.tags]);

  const timeDay = useMemo(() => {
    if (!isValid(transaction.date)) return '';
    return `${casualTime} ${casualDate}`;
  }, [casualTime, casualDate, transaction.date]);

  // Icon background tint — category color drives identity (kept as the well's fill).
  const iconBgColor = category?.color
    ? withAlpha(category.color, 0.18)
    : isExpense
      ? withAlpha(C.textPrimary, C === CALM_DARK ? 0.10 : 0.06)
      : withAlpha(C.deepOlive, 0.14);

  const iconColor = category?.color || (isExpense ? C.textPrimary : C.deepOlive);

  const opacityAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    lightTap();
    setPressed(true);
    Animated.timing(opacityAnim, { toValue: 0.85, duration: 120, useNativeDriver: true }).start();
  }, [opacityAnim]);

  const handlePressOut = useCallback(() => {
    setPressed(false);
    Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
  }, [opacityAnim]);

  const handlePress = useCallback(() => {
    onPress?.(transaction.id);
  }, [onPress, transaction.id]);

  const handleLongPress = useCallback(() => {
    onLongPress?.(transaction.id);
  }, [onLongPress, transaction.id]);

  const handleSwipeDelete = useCallback(() => {
    swipeableRef.current?.close();
    onSwipeDelete?.(transaction.id);
  }, [onSwipeDelete, transaction.id]);

  const deleteTapGesture = useMemo(
    () => Gesture.Tap().runOnJS(true).onEnd(() => handleSwipeDelete()),
    [handleSwipeDelete]
  );

  const renderRightActions = useCallback(() => (
    <GestureDetector gesture={deleteTapGesture}>
      <View
        style={styles.swipeDeleteBtn}
        accessibilityRole="button"
        accessibilityLabel={t.common.delete}
      >
        <Feather name="trash-2" size={20} color={C.surface} />
      </View>
    </GestureDetector>
  ), [deleteTapGesture, styles.swipeDeleteBtn, t, C.surface]);

  const sign = isExpense ? '−' : '+';
  const amountStr = transaction.amount.toFixed(2);
  const accessibilityLabel = `${transaction.description}, ${sign}${currency} ${amountStr}, ${casualDate}`;

  const content = (
    <TouchableOpacity
      onPress={handlePress}
      onLongPress={handleLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      disabled={!onPress && !onLongPress}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={onPress ? t.common.tapToView : undefined}
    >
      {/* The neu shadow lives on the OUTER wrapper (below), NOT here — the swipeable
          clips its children (overflow:hidden) and would cut the shadow into a hard
          vertical seam. The card itself just carries the fill + layout. */}
      <Animated.View style={[
        styles.card,
        { opacity: opacityAnim },
        isSelected && styles.cardSelected,
      ]}>
        {selectMode && (
          <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
            {isSelected && <Feather name="check" size={14} color={C.surface} />}
          </View>
        )}

        {/* Left: 42px debossed icon well, category-tinted, holding the glyph */}
        <View style={[styles.iconWrap, neu.well, { backgroundColor: iconBgColor }]}>
          <CategoryIcon
            icon={category?.icon || (isExpense ? 'arrow-up-right' : 'arrow-down-left')}
            size={ICON_SIZE.sm}
            color={iconColor}
          />
        </View>

        <View style={styles.body}>
          <View style={styles.topRow}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {transaction.description || category?.name || '—'}
              </Text>
              {transaction.linkedDebtId && (
                <Feather name="link" size={11} color={C.bronze} style={styles.nameBadge} />
              )}
              {transaction.linkedGoalId && (
                <Feather name="target" size={11} color={C.accent} style={styles.nameBadge} />
              )}
              {transaction.emotionalFlag && <View style={styles.emotionalDot} />}
            </View>
            <Text style={[styles.amount, !isExpense && styles.amountIncome]} numberOfLines={1}>
              {sign}{currency}{amountStr}
            </Text>
          </View>

          {tagDisplay ? (
            <Text style={styles.tagLine} numberOfLines={1}>{tagDisplay}</Text>
          ) : null}

          <View style={styles.bottomRow}>
            <View style={styles.walletRow}>
              {wallet && <WalletLogo wallet={wallet} size={14} />}
              <Text style={styles.walletText} numberOfLines={1}>
                {wallet?.name.toLowerCase() || category?.name?.toLowerCase() || ''}
                {editCount > 0 ? (
                  <Text style={styles.walletEditedNote}>
                    {(wallet || category?.name) ? '  ·  ' : ''}{t.common.edited.toLowerCase()}
                  </Text>
                ) : null}
              </Text>
            </View>
            <Text style={styles.timeDay} numberOfLines={1}>{timeDay}</Text>
          </View>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );

  const stagger = Math.min(index, 11) * 50;
  const enteringAnim = animateEntrance ? FadeIn.duration(420).delay(stagger) : undefined;

  // Neu shadow on this UNCLIPPED wrapper so it renders in full (the swipeable
  // inside clips its own children, which is why the card can't carry the shadow).
  const shadowStyle = pressed ? neu.insetSoft : neu.raisedSoft;

  if (onSwipeDelete && !selectMode) {
    return (
      <Reanimated.View entering={enteringAnim}>
        <View style={[styles.rowShadow, shadowStyle]}>
          <ReanimatedSwipeable
            ref={swipeableRef}
            renderRightActions={renderRightActions}
            overshootRight={false}
            friction={1}
            rightThreshold={40}
          >
            {content}
          </ReanimatedSwipeable>
        </View>
      </Reanimated.View>
    );
  }

  return (
    <Reanimated.View entering={enteringAnim}>
      <View style={[styles.rowShadow, shadowStyle]}>{content}</View>
    </Reanimated.View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  // Unclipped shadow wrapper — carries the neu shadow + the inter-row gap, so the
  // swipeable's overflow:hidden can't cut the shadow into a hard edge.
  rowShadow: {
    borderRadius: RADIUS.xl,
    marginBottom: SPACING.sm + 6, // gap so the soft shadow can breathe
  },
  // The card fill/layout. Opaque bg so it slides cleanly over the wrapper on swipe.
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: RADIUS.xl,
    backgroundColor: C.background,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4,
  },
  cardSelected: {
    backgroundColor: withAlpha(C.accent, 0.06),
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.25),
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: RADIUS.full,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
    marginTop: 10,
  },
  checkboxChecked: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  // NEU: debossed well — inset shadow added via neu.well; keeps the category tint.
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    flexShrink: 1,
    letterSpacing: -0.1,
  },
  tagLine: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginTop: 4,
    letterSpacing: 0.1,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    gap: SPACING.sm,
  },
  nameBadge: {
    marginLeft: 6,
  },
  emotionalDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.bronze,
    marginLeft: 6,
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
    minWidth: 0,
  },
  walletText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    flexShrink: 1,
    letterSpacing: 0.1,
  },
  walletEditedNote: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.bronze,
    fontStyle: 'italic',
  },
  amount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  amountIncome: {
    color: C.deepOlive,
  },
  timeDay: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.1,
    flexShrink: 0,
  },
  swipeDeleteBtn: {
    backgroundColor: C.neutral,
    justifyContent: 'center',
    alignItems: 'center',
    width: 56,
    marginLeft: SPACING.sm,
    borderRadius: RADIUS.xl,
  },
});

export default React.memo(TransactionItem);
