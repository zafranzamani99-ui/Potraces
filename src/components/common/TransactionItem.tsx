import React, { useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format, isValid } from 'date-fns';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, ICON_SIZE, withAlpha } from '../../constants';
import { Transaction, CategoryOption, Wallet } from '../../types';
import { lightTap } from '../../services/haptics';

interface TransactionItemProps {
  transaction: Transaction;
  currency: string;
  category?: CategoryOption;
  wallet?: Wallet | null;
  onPress?: (id: string) => void;
  onLongPress?: (id: string) => void;
  isSelected?: boolean;
  selectMode?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
}

const TransactionItem: React.FC<TransactionItemProps> = ({
  transaction,
  currency,
  category,
  wallet,
  onPress,
  onLongPress,
  isSelected = false,
  selectMode = false,
  isFirst = false,
  isLast = false,
}) => {
  const isExpense = transaction.type === 'expense';
  const editCount = transaction.editLog?.length ?? 0;
  const lastEdit = editCount > 0 ? transaction.editLog![editCount - 1] : null;
  const tags = transaction.tags?.slice(0, 3) ?? [];

  const opacityAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    lightTap();
    Animated.timing(opacityAnim, { toValue: 0.7, duration: 150, useNativeDriver: true }).start();
  }, [opacityAnim]);

  const handlePressOut = useCallback(() => {
    Animated.timing(opacityAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
  }, [opacityAnim]);

  const handlePress = useCallback(() => {
    onPress?.(transaction.id);
  }, [onPress, transaction.id]);

  const handleLongPress = useCallback(() => {
    onLongPress?.(transaction.id);
  }, [onLongPress, transaction.id]);

  return (
    <TouchableOpacity
      onPress={handlePress}
      onLongPress={handleLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      disabled={!onPress && !onLongPress}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={`${category?.name || transaction.category} transaction: ${currency} ${transaction.amount.toFixed(2)}`}
      accessibilityHint={onPress ? "Double tap to view details" : undefined}
    >
      <Animated.View style={[
        styles.container,
        { opacity: opacityAnim },
        !isFirst && styles.dividerTop,
        isFirst && styles.firstItem,
        isLast && styles.lastItem,
        isSelected && styles.selectedBg,
      ]}>
        {selectMode && (
          <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
            {isSelected && <Feather name="check" size={14} color="#fff" />}
          </View>
        )}

        <View
          style={[
            styles.iconContainer,
            { backgroundColor: category?.color ? withAlpha(category.color, 0.08) : CALM.background }
          ]}
        >
          <Feather
            name={(category?.icon as keyof typeof Feather.glyphMap) || 'dollar-sign'}
            size={ICON_SIZE.sm}
            color={category?.color || CALM.textPrimary}
          />
        </View>
        <View style={styles.details}>
          <View style={styles.categoryRow}>
            <Text style={styles.category}>{category?.name || transaction.category}</Text>
            {transaction.emotionalFlag && <View style={styles.emotionalDot} />}
            {transaction.linkedDebtId && (
              <View style={styles.linkedBadge}>
                <Feather name="link" size={9} color={CALM.bronze} />
              </View>
            )}
          </View>
          <Text style={styles.description} numberOfLines={1}>{transaction.description}</Text>
          <Text style={styles.date}>
            {isValid(transaction.date) ? format(transaction.date, 'HH:mm') : '—'}
          </Text>
          {lastEdit && (
            <View style={styles.editedBadge}>
              <Feather name="edit-2" size={9} color={CALM.bronze} />
              <Text style={styles.editedBadgeText}>
                edited {isValid(new Date(lastEdit.editedAt)) ? format(new Date(lastEdit.editedAt), 'MMM d, HH:mm') : '—'}
                {editCount > 1 ? ` · ${editCount}×` : ''}
                {lastEdit.previousType ? ` · was ${lastEdit.previousType}` : ''}
              </Text>
            </View>
          )}
          {wallet && (
            <View style={styles.walletBadge}>
              <Feather name={wallet.icon as keyof typeof Feather.glyphMap} size={10} color={wallet.color} />
              <Text style={[styles.walletBadgeText, { color: wallet.color }]}>{wallet.name}</Text>
            </View>
          )}
        </View>
        <View style={styles.amountContainer}>
          <Text style={[styles.amount, !isExpense && { color: CALM.accent }]}>
            {isExpense ? '-' : '+'}{currency} {transaction.amount.toFixed(2)}
          </Text>
          {tags.length > 0 && (
            <View style={styles.tagsRow}>
              {tags.map((tag, i) => (
                <View key={i} style={styles.tagContainer}>
                  <Text style={styles.tag} numberOfLines={1}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CALM.surface,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
  },
  dividerTop: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CALM.border,
  },
  firstItem: {
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
  },
  lastItem: {
    borderBottomLeftRadius: RADIUS.lg,
    borderBottomRightRadius: RADIUS.lg,
  },
  selectedBg: {
    backgroundColor: withAlpha(CALM.accent, 0.04),
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: CALM.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  checkboxChecked: {
    backgroundColor: CALM.accent,
    borderColor: CALM.accent,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  details: { flex: 1 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  emotionalDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: CALM.accent },
  category: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: 1,
  },
  description: { fontSize: TYPOGRAPHY.size.sm, color: CALM.textSecondary, marginBottom: 1 },
  date: { fontSize: TYPOGRAPHY.size.xs, color: CALM.textMuted },
  amountContainer: { alignItems: 'flex-end', marginLeft: SPACING.sm },
  amount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  tagsRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  tagContainer: {
    backgroundColor: CALM.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.xs,
    maxWidth: 70,
  },
  tag: { fontSize: 10, fontWeight: TYPOGRAPHY.weight.medium, color: CALM.textMuted },
  editedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  editedBadgeText: { fontSize: 9, color: CALM.bronze },
  walletBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  walletBadgeText: { fontSize: 10, fontWeight: TYPOGRAPHY.weight.medium },
  linkedBadge: {
    width: 15,
    height: 15,
    borderRadius: 3,
    backgroundColor: withAlpha(CALM.bronze, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default React.memo(TransactionItem);
