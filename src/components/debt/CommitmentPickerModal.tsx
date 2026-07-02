import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Modal } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { Subscription } from '../../types';

interface CommitmentPickerModalProps {
  visible: boolean;
  subscriptions: Subscription[];
  currency: string;
  onPick: (subscriptionId: string) => void;
  onClose: () => void;
}

const CommitmentPickerModal: React.FC<CommitmentPickerModalProps> = ({ visible, subscriptions, currency, onPick, onClose }) => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);

  if (!visible) return null;

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={onClose}>
        <Pressable onPress={() => {}} style={[styles.choiceCard, { maxHeight: '60%' }]}>
          <Text style={styles.choiceTitle}>link to commitment</Text>
          <Text style={styles.choiceSubtitle}>pick an existing commitment</Text>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled style={{ marginTop: SPACING.md }}>
            {subscriptions.filter((s) => s.isActive).map((sub, idx, arr) => (
              <TouchableOpacity
                key={sub.id}
                style={[{ flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.md, gap: SPACING.sm }, idx < arr.length - 1 && styles.choiceRowBorder]}
                onPress={() => onPick(sub.id)}
                activeOpacity={0.7}
              >
                <View style={styles.choiceIcon}>
                  <Feather name="repeat" size={18} color={C.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.choiceLabel}>{sub.name}</Text>
                  <Text style={styles.choiceDesc}>{currency}{sub.amount.toFixed(2)}/{sub.billingCycle === 'monthly' ? 'mo' : sub.billingCycle === 'yearly' ? 'yr' : 'qtr'}</Text>
                </View>
                <Feather name="link" size={16} color={C.accent} />
              </TouchableOpacity>
            ))}
          </ScrollView>
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

export default React.memo(CommitmentPickerModal);
