import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';

interface FabChoiceModalProps {
  visible: boolean;
  onClose: () => void;
  onAddDebt: () => void;
  onSplitExpense: () => void;
  onAddSharedSub: () => void;
}

const FabChoiceModal: React.FC<FabChoiceModalProps> = ({ visible, onClose, onAddDebt, onSplitExpense, onAddSharedSub }) => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);

  if (!visible) return null;

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={onClose}>
        <Pressable onPress={() => {}} style={styles.choiceCard}>
          <Text style={styles.choiceTitle}>{t.debts.newEntry}</Text>
          <Text style={styles.choiceSubtitle}>{t.debts.whatWouldYouAdd}</Text>
          {([
            { icon: 'users' as const, label: t.debts.addDebt, desc: t.debts.trackMoneyOwed, onPress: onAddDebt },
            { icon: 'scissors' as const, label: t.debts.splitExpense, desc: t.debts.divideBill, onPress: onSplitExpense },
            { icon: 'repeat' as const, label: t.sharedSubs.addSharedSub, desc: t.sharedSubs.noSharedSubsHint, onPress: onAddSharedSub },
          ] as const).map((opt, i, arr) => (
            <TouchableOpacity key={opt.label} onPress={opt.onPress} activeOpacity={0.7} style={[styles.choiceRow, i < arr.length - 1 && styles.choiceRowBorder]}>
              <View style={styles.choiceIcon}><Feather name={opt.icon} size={18} color={C.accent} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.choiceLabel}>{opt.label}</Text>
                <Text style={styles.choiceDesc}>{opt.desc}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={C.textMuted} />
            </TouchableOpacity>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  choiceCard: {
    width: '82%',
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
    ...SHADOWS['2xl'],
  },
  choiceTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    marginBottom: SPACING.xs,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  choiceSubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginBottom: SPACING.lg,
  },
  choiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  choiceRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  choiceIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(C.accent, 0.1),
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  choiceLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  choiceDesc: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginTop: 1,
  },
});

export default React.memo(FabChoiceModal);
