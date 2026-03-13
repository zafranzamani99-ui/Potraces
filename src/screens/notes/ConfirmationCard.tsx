import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AIExtraction } from '../../types';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { lightTap, mediumTap } from '../../services/haptics';
import { useFadeSlide } from '../../utils/fadeSlide';

interface ConfirmationCardProps {
  extraction: AIExtraction;
  onConfirm: (id: string) => void;
  onSkip: (id: string) => void;
  onEdit?: (id: string) => void;
}

const INTENT_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  expense: 'arrow-up-right',
  income: 'arrow-down-left',
  debt: 'repeat',
  debt_update: 'check-circle',
  bnpl: 'credit-card',
  seller_order: 'shopping-bag',
  seller_cost: 'package',
  query: 'help-circle',
  savings_goal: 'target',
  plain: 'file-text',
};

const INTENT_LABELS: Record<string, string> = {
  expense: 'Expense',
  income: 'Income',
  debt: 'Debt',
  debt_update: 'Payment',
  bnpl: 'Pay Later',
  seller_order: 'Order',
  seller_cost: 'Cost',
  query: 'Question',
  savings_goal: 'Savings',
  plain: 'Note',
};

const ConfirmationCard: React.FC<ConfirmationCardProps> = ({
  extraction,
  onConfirm,
  onSkip,
  onEdit,
}) => {
  const { type, extractedData, status } = extraction;
  const { amount, description, category, wallet, person } = extractedData;

  const isConfirmed = status === 'confirmed';
  const isSkipped = status === 'skipped';
  const isDone = isConfirmed || isSkipped;
  const fadeSlide = useFadeSlide(isDone ? 0 : 100);

  const handleConfirm = useCallback(() => {
    mediumTap();
    onConfirm(extraction.id);
  }, [extraction.id, onConfirm]);

  const handleSkip = useCallback(() => {
    lightTap();
    onSkip(extraction.id);
  }, [extraction.id, onSkip]);

  const handleEdit = useCallback(() => {
    if (onEdit) {
      lightTap();
      onEdit(extraction.id);
    }
  }, [extraction.id, onEdit]);

  if (isDone) {
    return (
      <View style={[styles.card, styles.cardDone]}>
        <View style={styles.doneRow}>
          <Feather
            name={isConfirmed ? 'check' : 'x'}
            size={13}
            color={isConfirmed ? CALM.deepOlive : CALM.textMuted}
          />
          <Text style={[styles.doneText, isSkipped && styles.doneTextSkipped]}>
            {isConfirmed ? 'saved' : 'skipped'} — {description || 'item'}
            {amount > 0 ? ` RM ${amount.toFixed(2)}` : ''}
          </Text>
        </View>
      </View>
    );
  }

  const sub = [category, wallet, person].filter(Boolean).join(' · ');

  return (
    <Animated.View style={[styles.card, { opacity: fadeSlide.opacity, transform: fadeSlide.transform }]}>
      <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={handleEdit}>
        {/* Icon circle */}
        <View style={styles.iconWrap}>
          <Feather
            name={INTENT_ICONS[type] || 'circle'}
            size={16}
            color={CALM.bronze}
          />
        </View>

        {/* Center: name + subtitle */}
        <View style={styles.center}>
          <Text style={styles.name} numberOfLines={1}>
            {description || INTENT_LABELS[type] || type}
          </Text>
          {sub ? (
            <Text style={styles.sub} numberOfLines={1}>{sub}</Text>
          ) : null}
        </View>

        {/* Right: amount */}
        {amount > 0 && (
          <Text style={styles.amount}>RM {amount.toFixed(2)}</Text>
        )}
      </TouchableOpacity>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.skipBtn}
          onPress={handleSkip}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.skipText}>skip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.confirmBtn}
          onPress={handleConfirm}
          activeOpacity={0.7}
        >
          <Feather name="check" size={13} color="#fff" />
          <Text style={styles.confirmText}>save</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

export default React.memo(ConfirmationCard);

const styles = StyleSheet.create({
  card: {
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
    gap: 8,
  },
  cardDone: {
    opacity: 0.5,
    paddingVertical: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: withAlpha(CALM.bronze, 0.1),
    justifyContent: 'center',
    alignItems: 'center',
  },
  center: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  sub: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  amount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
  },
  skipBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
  },
  skipText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CALM.deepOlive,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
  },
  confirmText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  doneText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.deepOlive,
  },
  doneTextSkipped: {
    color: CALM.textMuted,
    textDecorationLine: 'line-through',
  },
});
