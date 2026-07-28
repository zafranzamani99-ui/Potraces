import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { AIExtraction } from '../../types';
import { intentGlyph } from '../../constants/intentIcons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useNeu } from '../../components/common/neu';
import { useT } from '../../i18n';
import { lightTap, mediumTap } from '../../services/haptics';
import { useFadeSlide } from '../../utils/fadeSlide';
import { useLearningStore } from '../../store/learningStore';
import { suggestFrom } from '../../store/learningPure';
import { useSettingsStore } from '../../store/settingsStore';
import { parseCommitmentSchedule } from '../../utils/commitmentParse';

interface ConfirmationCardProps {
  extraction: AIExtraction;
  onConfirm: (id: string) => void;
  onSkip: (id: string) => void;
  onEdit?: (id: string) => void;
}


const ConfirmationCard: React.FC<ConfirmationCardProps> = ({
  extraction,
  onConfirm,
  onSkip,
  onEdit,
}) => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  // Onyx: lift each card + skip pill off the near-black sheet with faintDark neu.
  const neu = useNeu(undefined, { faintDark: true });
  const intentLabel = (ty: string): string => {
    switch (ty) {
      case 'expense': return t.notes.typeExpense;
      case 'income': return t.notes.typeIncome;
      case 'debt': return t.notes.typeDebt;
      case 'debt_update': return t.notes.typePayment;
      case 'bnpl': return t.notes.typeBnpl;
      case 'seller_order': return t.notes.typeOrder;
      case 'seller_cost': return t.notes.typeCost;
      case 'query': return t.notes.typeQuery;
      case 'savings_goal': return t.notes.typeSavings;
      case 'subscription': return t.notes.typeCommitment;
      case 'playbook': return t.notes.typePlaybook;
      default: return t.notes.typePlain;
    }
  };
  const currency = useSettingsStore((s) => s.currency);
  const { type, extractedData, status } = extraction;
  const { amount, description, category, wallet, person } = extractedData;

  // "Sebab you ajar" (MAKIN_KENAL §8.4): when the shown category came from the
  // user's own notebook rule, the card says so. Derived here at display time —
  // category may be an id or a name, so compare normalized.
  const categoryPatterns = useLearningStore((s) => s.categoryPatterns);
  const learnedRule = suggestFrom(categoryPatterns, description || '');
  const normCat = (s: string) => s.toLowerCase().replace(/[\s&]+/g, '_');
  const learnedMatches = !!(learnedRule && category && normCat(learnedRule.category) === normCat(category));

  const isConfirmed = status === 'confirmed';
  const isSkipped = status === 'skipped';
  const isDone = isConfirmed || isSkipped;
  const fadeSlide = useFadeSlide(isDone ? 0 : 100);

  const handleConfirm = useCallback(() => {
    mediumTap();
    // Positive reinforcement — AI got it right, reinforce patterns
    const learn = useLearningStore.getState();
    if (description && category) learn.learnCategory(description, category);
    if (description && wallet) learn.learnWallet(description, wallet);
    onConfirm(extraction.id);
  }, [extraction.id, description, category, wallet, onConfirm]);

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
            color={isConfirmed ? C.deepOlive : C.textMuted}
          />
          <Text style={[styles.doneText, isSkipped && styles.doneTextSkipped]}>
            {isConfirmed ? t.notes.cardSaved : t.notes.cardSkipped} — {description || t.notes.cardItem}
            {amount > 0 ? ` ${currency} ${amount.toFixed(2)}` : ''}
          </Text>
        </View>
      </View>
    );
  }

  // For a commitment, lead the subtitle with its schedule (cycle · due day, or
  // installment count) so the user can trust the capture before saving.
  let scheduleLabel = '';
  if (type === 'subscription') {
    const data = extractedData as any;
    const sched = parseCommitmentSchedule(extraction.rawText || description || '');
    const cycle = data.billingCycle || sched.billingCycle;
    const dueDay = data.dueDay ?? sched.dueDay;
    const inst = data.installments ?? sched.installments;
    scheduleLabel = inst && inst > 1
      ? `${inst}× ${t.notes.cardInstallment}`
      : `${cycle}${dueDay ? ` · ${t.notes.cardDue} ${dueDay}` : ''}`;
  }
  const sub = (type === 'subscription'
    ? [scheduleLabel, category]
    : [category, wallet, person]
  ).filter(Boolean).join(' · ');

  return (
    <Animated.View style={[styles.card, neu.raisedSoft, { opacity: fadeSlide.opacity, transform: fadeSlide.transform }]}>
      <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={handleEdit}>
        {/* Icon circle */}
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons
            name={intentGlyph(type)}
            size={19}
            color={C.bronze}
          />
        </View>

        {/* Center: name + subtitle */}
        <View style={styles.center}>
          <Text style={styles.name} numberOfLines={1}>
            {description || intentLabel(type)}
          </Text>
          {sub ? (
            <Text style={styles.sub} numberOfLines={1}>{sub}</Text>
          ) : null}
          {learnedMatches && learnedRule && (
            <Text style={styles.learnedReason} numberOfLines={1}>
              {t.common.learnedRuleReason.replace('{n}', String(learnedRule.count))}
            </Text>
          )}
        </View>

        {/* Right: amount + edit hint */}
        {amount > 0 && (
          <Text style={styles.amount}>{currency} {amount.toFixed(2)}</Text>
        )}
        {onEdit && (
          <Feather name="edit-2" size={12} color={withAlpha(C.textMuted, 0.45)} />
        )}
      </TouchableOpacity>

      {/* Playbook allocations preview */}
      {type === 'playbook' && extractedData.allocations?.length > 0 && (
        <View style={styles.allocList}>
          {extractedData.allocations.map((a: any, i: number) => (
            <View key={i} style={styles.allocRow}>
              <Text style={styles.allocLabel} numberOfLines={1}>{a.label || a.category}</Text>
              <Text style={styles.allocAmount}>{currency} {(a.amount || 0).toFixed(0)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.skipBtn, neu.raised]}
          onPress={handleSkip}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.skipText}>{t.notes.cardSkip}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.confirmBtn, neu.raisedSoft, { backgroundColor: C.deepOlive }]}
          onPress={handleConfirm}
          activeOpacity={0.7}
        >
          <Feather name="check" size={13} color={C.onAccent} />
          <Text style={styles.confirmText}>{t.notes.cardSave}</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

export default React.memo(ConfirmationCard);

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  card: {
    // Onyx raised card = pure near-black face + neu.raisedSoft (spread at render), matching
    // WalletManagement's transferRowCard. NOT a grey withAlpha(textPrimary,0.05) fill (owner
    // rejects that as "not onyx"). The shadow doesn't seam because the parent extract ScrollView
    // bleeds its viewport (extractScroll) so the shadow isn't clipped. See memory
    // neu-boxshadow-device-seam.
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    gap: 10,
  },
  cardDone: {
    opacity: 0.5,
    padding: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withAlpha(C.bronze, 0.1),
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
    color: C.textPrimary,
  },
  sub: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  learnedReason: {
    fontSize: 10,
    color: C.accent,
    marginTop: 1,
  },
  amount: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
  },
  skipBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textPrimary, 0.03),
  },
  skipText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: C.deepOlive,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
  },
  confirmText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  doneText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.deepOlive,
  },
  doneTextSkipped: {
    color: C.textMuted,
    textDecorationLine: 'line-through',
  },
  allocList: {
    backgroundColor: withAlpha(C.accent, 0.04),
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    gap: 2,
    marginLeft: 40 + SPACING.sm,
  },
  allocRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  allocLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    flex: 1,
  },
  allocAmount: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as any,
  },
});
