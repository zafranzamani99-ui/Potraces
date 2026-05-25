import React, { useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { CALM, RADIUS, SPACING, TYPOGRAPHY } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { Wallet } from '../../types';
import WalletLogo from '../common/WalletLogo';

interface RepayPickerModalProps {
  visible: boolean;
  onClose: () => void;
  creditsWithBalance: Wallet[];
  currency: string;
  onSelectCredit: (walletId: string) => void;
}

const RepayPickerModal: React.FC<RepayPickerModalProps> = ({
  visible,
  onClose,
  creditsWithBalance,
  currency,
  onSelectCredit,
}) => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.deleteConfirmOverlay} onPress={onClose}>
        <View style={styles.repayPickerCard} onStartShouldSetResponder={() => true}>
          <Text style={styles.repayPickerTitle}>{t.wallets.repayCredit}</Text>
          <Text style={styles.repayPickerSub}>Choose which card to repay</Text>
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            style={styles.repayPickerList}
            showsVerticalScrollIndicator={false}
          >
            {creditsWithBalance.map((w, idx) => (
              <TouchableOpacity
                key={w.id}
                style={[styles.repayPickerRow, idx < creditsWithBalance.length - 1 && styles.repayPickerRowBorder]}
                onPress={() => {
                  onClose();
                  setTimeout(() => onSelectCredit(w.id), 250);
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${t.wallets.repayCredit.toLowerCase()} ${w.name}`}
              >
                <WalletLogo wallet={w} size={36} />
                <View style={styles.repayPickerRowInfo}>
                  <Text style={styles.repayPickerRowName} numberOfLines={1}>{w.name}</Text>
                  <Text style={styles.repayPickerRowBalance}>{currency} {(w.usedCredit || 0).toFixed(2)} used</Text>
                </View>
                <Feather name="chevron-right" size={16} color={C.textMuted} />
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={styles.repayPickerCancel}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t.common.cancel.toLowerCase()}
          >
            <Text style={styles.repayPickerCancelText}>{t.common.cancel}</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  deleteConfirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  repayPickerCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    width: '88%',
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    paddingTop: SPACING.xl,
  },
  repayPickerTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.xs,
  },
  repayPickerSub: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.md,
  },
  repayPickerList: {
    maxHeight: 320,
  },
  repayPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    gap: SPACING.md,
  },
  repayPickerRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  repayPickerRowInfo: {
    flex: 1,
  },
  repayPickerRowName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  repayPickerRowBalance: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginTop: 2,
  },
  repayPickerCancel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  repayPickerCancelText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
  },
});

export default RepayPickerModal;
