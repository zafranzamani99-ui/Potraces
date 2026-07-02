import React, { useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import ReanimatedSwipeable, { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
// The swipe action's tap is handled by an RNGH Gesture.Tap (not a touchable):
// ReanimatedSwipeable (RNGH 2.25+) swallows touchable presses inside renderRightActions
// on Android, routing the tap to the row underneath. A sibling Tap gesture fires reliably.
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { format, isValid, isToday, isYesterday } from 'date-fns';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, ICON_SIZE, SHADOWS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import WalletLogo from './WalletLogo';
import CategoryIcon from './CategoryIcon';
import { Transaction, CategoryOption, Wallet } from '../../types';
import { lightTap } from '../../services/haptics';

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
 * Transaction row as a pill-shaped card — Phase C v2 redesign.
 * Reference: user-supplied "My Transactions" screenshot — separated cards with
 * generous icon, name + wallet sub-line, right-column amount-over-date.
 *
 * Always-do: S1 (RM tight-kerned), S5 (transaction as recorded moment),
 * S7 (tabular-nums right-aligned), N8 (no red — olive for income, text-primary for expense).
 * Motion: staggered FadeIn (M4 unfold-stagger).
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
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
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

  // Time inline in the subline: "3:42 pm" — paired with wallet name.
  const casualTime = useMemo(() => {
    if (!isValid(transaction.date)) return '';
    return format(transaction.date, 'h:mm a').toLowerCase();
  }, [transaction.date]);

  // Tags display — first 3 tags, no # prefix, mid-dot separated. "lunch · ali · kerja"
  const tagDisplay = useMemo(() => {
    if (!transaction.tags || transaction.tags.length === 0) return '';
    return transaction.tags
      .slice(0, 3)
      .map((tag) => tag.replace(/^#/, '').trim())
      .filter(Boolean)
      .join(' · ');
  }, [transaction.tags]);

  // Time + day combined for the bottom-right slot. "3:42 pm today" / "3:42 pm wed 28 apr"
  const timeDay = useMemo(() => {
    if (!isValid(transaction.date)) return '';
    return `${casualTime} ${casualDate}`;
  }, [casualTime, casualDate, transaction.date]);

  // Icon background tint — category color drives identity.
  const iconBgColor = category?.color
    ? withAlpha(category.color, 0.18)
    : isExpense
      ? withAlpha(C.textPrimary, C === CALM_DARK ? 0.10 : 0.06)
      : withAlpha(C.deepOlive, 0.14);

  const iconColor = category?.color || (isExpense ? C.textPrimary : C.deepOlive);

  const opacityAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    lightTap();
    Animated.timing(opacityAnim, { toValue: 0.6, duration: 280, useNativeDriver: true }).start();
  }, [opacityAnim]);

  const handlePressOut = useCallback(() => {
    Animated.timing(opacityAnim, { toValue: 1, duration: 280, useNativeDriver: true }).start();
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

  // Tap handled by RNGH directly (runs on JS thread) — reliable inside the
  // swipeable's gesture tree where touchables get swallowed on Android.
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

  // Format amount — RM tight-kerned to digits.
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

        {/* Left: 42px circular icon, color-extracted background tint, prominent. */}
        <View style={[styles.iconWrap, { backgroundColor: iconBgColor }]}>
          <CategoryIcon
            icon={category?.icon || (isExpense ? 'arrow-up-right' : 'arrow-down-left')}
            size={ICON_SIZE.sm}
            color={iconColor}
          />
        </View>

        {/* Middle body — 3-row vertical stack:
              row 1: description + amount (top-aligned with each other)
              row 2: tag line (only when present)
              row 3: wallet/edited + time-day */}
        <View style={styles.body}>
          {/* Row 1: name + amount */}
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

          {/* Row 2: tag (only when present) */}
          {tagDisplay ? (
            <Text style={styles.tagLine} numberOfLines={1}>{tagDisplay}</Text>
          ) : null}

          {/* Row 3: wallet + edited (left) — time + day (right) */}
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

  // Staggered entrance — first 12 cards cascade at 50ms intervals (~600ms total),
  // subsequent cards just fade in. Motion: M4 unfold-stagger.
  // Skipped when animateEntrance=false (paginated lists): the entrance replaying
  // on every recycle/scroll is what caused the stutter & half-rendered frames.
  const stagger = Math.min(index, 11) * 50;
  const enteringAnim = animateEntrance ? FadeIn.duration(420).delay(stagger) : undefined;

  if (onSwipeDelete && !selectMode) {
    return (
      <Reanimated.View entering={enteringAnim}>
        <ReanimatedSwipeable
          ref={swipeableRef}
          renderRightActions={renderRightActions}
          overshootRight={false}
          friction={1}
          rightThreshold={40}
        >
          {content}
        </ReanimatedSwipeable>
      </Reanimated.View>
    );
  }

  return <Reanimated.View entering={enteringAnim}>{content}</Reanimated.View>;
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  // Pill-shaped card — generous radius, subtle shadow, surface background.
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start', // top-align so icon sits with the name on row 1
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl, // ~20px — high pill radius matching reference
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 4, // 12 — generous internal padding
    marginBottom: SPACING.sm + 2, // 10px gap between cards
    ...(C === CALM_DARK ? SHADOWS.none : SHADOWS.sm), // subtle elevation per design-tokens
  },
  cardSelected: {
    backgroundColor: withAlpha(C.accent, 0.04),
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
    // Card top-aligns (flex-start) to keep the 42px icon on row 1; nudge the
    // 22px checkbox down by (42-22)/2 so its centre matches the icon's centre.
    marginTop: 10,
  },
  checkboxChecked: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  // Icon — 42px, prominent, color-tinted background per category.
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  // Middle — vertical 3-row stack: name+amount, tag, wallet+timeDay
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
    fontSize: TYPOGRAPHY.size.base, // 16
    fontWeight: TYPOGRAPHY.weight.semibold, // bolder than base 500 — name carries the row
    color: C.textPrimary,
    flexShrink: 1,
    letterSpacing: -0.1,
  },
  // Tag line (row 2) — slightly indented under name; muted but darker than wallet text
  tagLine: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginTop: 4,
    letterSpacing: 0.1,
  },
  // Bottom row (row 3) — wallet/edited (left) and time-day (right)
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
  // Amount — sits in the top row alongside the name (right-aligned via topRow's space-between)
  amount: {
    fontSize: TYPOGRAPHY.size.base, // 16
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4, // RM tight-kerned to digits
  },
  amountIncome: {
    color: C.deepOlive,
  },
  // Time + day — sits in the bottom row alongside wallet (right-aligned via bottomRow's space-between)
  timeDay: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.1,
    flexShrink: 0,
  },
  // Pill-flush trash chip — full rounded corners, sits as a separate floating pill
  // beside the card with a small left gap. No more sharp-rectangle white sliver.
  swipeDeleteBtn: {
    backgroundColor: C.neutral,
    justifyContent: 'center',
    alignItems: 'center',
    width: 56,
    marginLeft: SPACING.sm,
    borderRadius: RADIUS.xl,
    marginBottom: SPACING.sm + 2,
  },
});

export default React.memo(TransactionItem);
