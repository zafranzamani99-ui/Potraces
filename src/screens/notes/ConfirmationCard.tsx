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

const INTENT_LABELS: Record<string, string> = {
  expense: 'expense',
  income: 'income',
  debt: 'debt',
  debt_update: 'debt update',
  bnpl: 'pay later',
  seller_order: 'order',
  seller_cost: 'cost',
  query: 'question',
  savings_goal: 'savings',
  plain: 'note',
};

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

  if (isDone) {
    return (
      <View style={[styles.card, styles.cardDone]}>
        <View style={styles.doneRow}>
          <Feather
            name={isConfirmed ? 'check' : 'x'}
            size={14}
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

  const handleEdit = useCallback(() => {
    if (onEdit) {
      lightTap();
      onEdit(extraction.id);
    }
  }, [extraction.id, onEdit]);

  return (
    <Animated.View style={[styles.card, { opacity: fadeSlide.opacity, transform: fadeSlide.transform }]}>
      <TouchableOpacity activeOpacity={0.7} onPress={handleEdit}>
        {/* Intent badge + description */}
        <View style={styles.header}>
          <View style={styles.intentBadge}>
            <Feather
              name={INTENT_ICONS[type] || 'circle'}
              size={12}
              color={CALM.bronze}
            />
            <Text style={styles.intentLabel}>
              {INTENT_LABELS[type] || type}
            </Text>
          </View>
          {amount > 0 && (
            <Text style={styles.amount}>RM {amount.toFixed(2)}</Text>
          )}
        </View>

        {/* Details */}
        {description ? (
          <Text style={styles.description} numberOfLines={2}>
            {description}
          </Text>
        ) : null}

        <View style={styles.metaRow}>
          {category && (
            <View style={styles.metaPill}>
              <Feather name="tag" size={10} color={CALM.textMuted} />
              <Text style={styles.metaText}>{category}</Text>
            </View>
          )}
          {wallet && (
            <View style={styles.metaPill}>
              <Feather name="credit-card" size={10} color={CALM.textMuted} />
              <Text style={styles.metaText}>{wallet}</Text>
            </View>
          )}
          {person && (
            <View style={styles.metaPill}>
              <Feather name="user" size={10} color={CALM.textMuted} />
              <Text style={styles.metaText}>{person}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>

      {/* Action buttons */}
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
          <Feather name="check" size={14} color="#fff" />
          <Text style={styles.confirmText}>save</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

export default React.memo(ConfirmationCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: SPACING.xs,
  },
  cardDone: {
    opacity: 0.6,
    paddingVertical: SPACING.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  intentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  intentLabel: {
    fontSize: 11,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.bronze,
  },
  amount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  description: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: withAlpha(CALM.textMuted, 0.06),
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  metaText: {
    fontSize: 10,
    color: CALM.textMuted,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
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
