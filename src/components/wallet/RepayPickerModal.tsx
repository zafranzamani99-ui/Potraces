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
import { useNeu } from '../common/neu';

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
  const neuF = useNeu(undefined, { faintDark: true });

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
          <Text style={styles.repayPickerSub}>{t.wallets.chooseCardToRepay}</Text>
          <ScrollView
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            style={styles.repayPickerList}
            contentContainerStyle={styles.repayPickerListContent}
            showsVerticalScrollIndicator={false}
          >
            {creditsWithBalance.map((w) => (
              <TouchableOpacity
                key={w.id}
                style={[styles.repayPickerRow, neuF.raisedSoft]}
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
                  <Text style={styles.repayPickerRowBalance}>{currency} {(w.usedCredit || 0).toFixed(2)} {t.wallets.usedLabel}</Text>
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
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    width: '88%',
    maxHeight: '70%',
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
  repayPickerListContent: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.xs,
  },
  repayPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.sm,
    backgroundColor: C.background,
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
