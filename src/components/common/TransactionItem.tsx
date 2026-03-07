import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, ICON_SIZE, withAlpha } from '../../constants';
import { useSettingsStore } from '../../store/settingsStore';
import { useWalletStore } from '../../store/walletStore';
import { useCategories } from '../../hooks/useCategories';
import { Transaction } from '../../types';
import { lightTap } from '../../services/haptics';

interface TransactionItemProps {
  transaction: Transaction;
  onPress?: () => void;
}

const TransactionItem: React.FC<TransactionItemProps> = ({ transaction, onPress }) => {
  const currency = useSettingsStore(state => state.currency);
  const wallets = useWalletStore((s) => s.wallets);
  const wallet = transaction.walletId ? wallets.find((w) => w.id === transaction.walletId) : null;
  const expenseCategories = useCategories('expense');
  const incomeCategories = useCategories('income');
  const categories = transaction.type === 'expense' ? expenseCategories : incomeCategories;
  const category = categories.find((cat) => cat.id === transaction.category);
  const isExpense = transaction.type === 'expense';
  const editCount = transaction.editLog?.length ?? 0;
  const lastEdit = editCount > 0 ? transaction.editLog![editCount - 1] : null;

  const opacityAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    lightTap();
    Animated.timing(opacityAnim, { toValue: 0.7, duration: 150, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    Animated.timing(opacityAnim, { toValue: 1, duration: 150, useNativeDriver: true }).start();
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${category?.name || transaction.category} transaction: ${currency} ${transaction.amount.toFixed(2)}`}
      accessibilityHint={onPress ? "Double tap to view details" : undefined}
    >
      <Animated.View style={[styles.container, { opacity: opacityAnim }]}>
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: category?.color ? withAlpha(category.color, 0.12) : CALM.background }
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
          <Text style={styles.date}>{format(transaction.date, 'MMM dd, yyyy • HH:mm')}</Text>
          {lastEdit && (
            <View style={styles.editedBadge}>
              <Feather name="edit-2" size={9} color={CALM.bronze} />
              <Text style={styles.editedBadgeText}>
                edited {format(new Date(lastEdit.editedAt), 'MMM d, HH:mm')}
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
          <Text style={styles.amount}>
            {isExpense ? '-' : '+'}{currency} {transaction.amount.toFixed(2)}
          </Text>
          {transaction.tags && transaction.tags.length > 0 && (
            <View style={styles.tagContainer}>
              <Text style={styles.tag} numberOfLines={1}>{transaction.tags[0]}</Text>
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
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  iconContainer: {
    width: ICON_SIZE.xl,
    height: ICON_SIZE.xl,
    borderRadius: ICON_SIZE.xl / 2,
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
    marginBottom: SPACING.xs / 2,
  },
  description: { fontSize: TYPOGRAPHY.size.sm, color: CALM.textSecondary, marginBottom: SPACING.xs / 2 },
  date: { fontSize: TYPOGRAPHY.size.xs, color: CALM.neutral },
  amountContainer: { alignItems: 'flex-end' },
  amount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
    marginBottom: SPACING.xs,
  },
  tagContainer: {
    backgroundColor: CALM.background,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs / 2,
    borderRadius: RADIUS.xs,
    maxWidth: 80,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  tag: { fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.medium, color: CALM.textSecondary },
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
