import React, { useMemo } from 'react';
import { Modal, Pressable, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import Button from '../common/Button';
import { HITSLOP_10 } from '../../utils/hitSlop';

interface UpcomingBill {
  id?: string;
  name: string;
  amount: number;
  nextDate: Date;
}

interface BillsPreviewModalProps {
  visible: boolean;
  onClose: () => void;
  upcomingBills: UpcomingBill[];
  totalBills: number;
  currency: string;
  onOpenManageBills: () => void;
}

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    floatingOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      paddingHorizontal: SPACING['2xl'],
    },
    floatingContent: {
      backgroundColor: C.surface,
      borderRadius: RADIUS.xl,
      padding: SPACING.xl,
      maxHeight: '70%',
      borderWidth: 1,
      borderColor: C.border,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACING.xl,
    },
    modalTitle: {
      fontSize: TYPOGRAPHY.size.xl,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
    },
    billRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: SPACING.sm + 2,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    billRowLeft: {
      flex: 1,
      gap: 2,
    },
    billRowName: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.medium,
      color: C.textPrimary,
    },
    billRowDate: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
    },
    billRowAmount: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'] as any,
    },
    billsTotalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingTop: SPACING.sm + 2,
    },
    billsTotalLabel: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    billsTotalAmount: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'] as any,
    },
  });

const BillsPreviewModal: React.FC<BillsPreviewModalProps> = ({
  visible,
  onClose,
  upcomingBills,
  totalBills,
  currency,
  onOpenManageBills,
}) => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.floatingOverlay} onPress={onClose}>
        <View style={styles.floatingContent} onStartShouldSetResponder={() => true}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t.wallets.billsThisWeekTitle}</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={HITSLOP_10}
              accessibilityRole="button"
              accessibilityLabel={t.a11y.close}
            >
              <Feather name="x" size={20} color={C.textPrimary} />
            </TouchableOpacity>
          </View>
          {upcomingBills.map((b, i) => {
            const day = b.nextDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
            return (
              <View key={b.id ?? i} style={styles.billRow}>
                <View style={styles.billRowLeft}>
                  <Text style={styles.billRowName}>{b.name}</Text>
                  <Text style={styles.billRowDate}>{day}</Text>
                </View>
                <Text style={styles.billRowAmount}>{currency} {b.amount.toFixed(2)}</Text>
              </View>
            );
          })}
          <View style={styles.billsTotalRow}>
            <Text style={styles.billsTotalLabel}>total</Text>
            <Text style={styles.billsTotalAmount}>{currency} {totalBills.toFixed(2)}</Text>
          </View>
          <Button
            title={t.wallets.manageBills}
            variant="outline"
            icon="list"
            onPress={onOpenManageBills}
            style={{ marginTop: SPACING.md }}
          />
        </View>
      </Pressable>
    </Modal>
  );
};

export default BillsPreviewModal;
