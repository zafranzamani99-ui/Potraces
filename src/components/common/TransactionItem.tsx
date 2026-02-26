import React, { useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import {
  COLORS,
  SPACING,
  TYPOGRAPHY,
  RADIUS,
  SHADOWS,
  ICON_SIZE,
  withAlpha
} from '../../constants';
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

  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    lightTap();
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
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
      <Animated.View
        style={[
          styles.container,
          { transform: [{ scale: scaleAnim }] }
        ]}
      >
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: category?.color ? withAlpha(category.color, 0.12) : COLORS.surface }
          ]}
        >
          <Feather
            name={(category?.icon as keyof typeof Feather.glyphMap) || 'dollar-sign'}
            size={ICON_SIZE.sm}
            color={category?.color || COLORS.text}
          />
        </View>
        <View style={styles.details}>
          <Text style={styles.category}>{category?.name || transaction.category}</Text>
          <Text style={styles.description} numberOfLines={1}>
            {transaction.description}
          </Text>
          <Text style={styles.date}>{format(transaction.date, 'MMM dd, yyyy • HH:mm')}</Text>
          {wallet && (
            <View style={styles.walletBadge}>
              <Feather
                name={wallet.icon as keyof typeof Feather.glyphMap}
                size={10}
                color={wallet.color}
              />
              <Text style={[styles.walletBadgeText, { color: wallet.color }]}>
                {wallet.name}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.amountContainer}>
          <Text
            style={[
              styles.amount,
              { color: isExpense ? COLORS.expense : COLORS.income },
            ]}
          >
            {isExpense ? '-' : '+'}{currency} {transaction.amount.toFixed(2)}
          </Text>
          {transaction.tags && transaction.tags.length > 0 && (
            <View style={styles.tagContainer}>
              <Text style={styles.tag} numberOfLines={1}>
                {transaction.tags[0]}
              </Text>
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
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    ...SHADOWS.sm,
  },
  iconContainer: {
    width: ICON_SIZE.xl,
    height: ICON_SIZE.xl,
    borderRadius: ICON_SIZE.xl / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  details: {
    flex: 1,
  },
  category: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: COLORS.text,
    marginBottom: SPACING.xs / 2,
  },
  description: {
    fontSize: TYPOGRAPHY.size.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs / 2,
  },
  date: {
    fontSize: TYPOGRAPHY.size.xs,
    color: COLORS.textTertiary,
  },
  amountContainer: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
    marginBottom: SPACING.xs,
  },
  tagContainer: {
    backgroundColor: COLORS.surfaceAlt,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs / 2,
    borderRadius: RADIUS.xs,
    maxWidth: 80,
  },
  tag: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: COLORS.textSecondary,
  },
  walletBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  walletBadgeText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
});

export default React.memo(TransactionItem);
