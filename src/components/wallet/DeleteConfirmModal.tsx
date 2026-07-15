import React, { useMemo } from 'react';
import { Modal, Pressable, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CALM, RADIUS, SPACING, TYPOGRAPHY } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useNeu } from '../common/neu';
import NeuPressable from '../common/NeuPressable';
import { useT } from '../../i18n';

interface DeleteConfirmModalProps {
  visible: boolean;
  walletId: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  walletName: string;
  /** Number of transactions/transfers still linked to this wallet. When > 0,
   *  deletion is blocked and an explanatory message is shown instead. */
  linkedCount?: number;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  visible,
  walletId,
  onCancel,
  onConfirm,
  walletName,
  linkedCount = 0,
}) => {
  const C = useCalm();
  const t = useT();
  const neuF = useNeu(undefined, { faintDark: true });
  const styles = useMemo(() => makeStyles(C), [C]);

  const blocked = linkedCount > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <Pressable style={styles.deleteConfirmOverlay} onPress={onCancel}>
        <View style={styles.deleteConfirmCard} onStartShouldSetResponder={() => true}>
          {blocked ? (
            <>
              <Text style={styles.deleteConfirmTitle}>{t.wallets.cantDeleteTitle}</Text>
              <Text style={styles.deleteConfirmName} numberOfLines={1}>
                {walletName}
              </Text>
              <Text style={styles.deleteConfirmSub}>
                {t.wallets.cantDeleteLinkedMsg
                  .replace('{count}', String(linkedCount))
                  .replace('{plural}', linkedCount === 1 ? '' : 's')}
              </Text>
              <View style={styles.deleteConfirmBtns}>
                <View style={styles.deleteConfirmBtnFlex}>
                  <NeuPressable
                    style={[styles.deleteConfirmPill, neuF.raisedSoft, { backgroundColor: C.accent }]}
                    onPress={onCancel}
                    accessibilityLabel={t.common.gotIt.toLowerCase()}
                  >
                    <View style={styles.deleteConfirmPillInner}>
                      <Feather name="check" size={16} color={C.onAccent} />
                      <Text style={styles.deleteConfirmPillText}>{t.common.gotIt}</Text>
                    </View>
                  </NeuPressable>
                </View>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.deleteConfirmTitle}>{t.wallets.deleteWalletTitle}</Text>
              <Text style={styles.deleteConfirmName} numberOfLines={1}>
                {walletName}
              </Text>
              <Text style={styles.deleteConfirmSub}>{t.wallets.deleteUndone}</Text>
              <View style={styles.deleteConfirmBtns}>
                <TouchableOpacity
                  style={[styles.deleteConfirmBtn, styles.deleteConfirmCancelBtn, neuF.raised]}
                  onPress={onCancel}
                  accessibilityRole="button"
                  accessibilityLabel={t.common.cancel.toLowerCase()}
                >
                  <Text style={styles.deleteConfirmCancelText}>{t.common.cancel}</Text>
                </TouchableOpacity>
                <View style={styles.deleteConfirmBtnFlex}>
                  <NeuPressable
                    style={[styles.deleteConfirmPill, neuF.raisedSoft, { backgroundColor: C.overdue }]}
                    onPress={onConfirm}
                    accessibilityLabel={t.common.delete.toLowerCase()}
                  >
                    <View style={styles.deleteConfirmPillInner}>
                      <Feather name="trash-2" size={16} color={C.onAccent} />
                      <Text style={styles.deleteConfirmPillText}>{t.common.delete}</Text>
                    </View>
                  </NeuPressable>
                </View>
              </View>
            </>
          )}
        </View>
      </Pressable>
    </Modal>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    deleteConfirmOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    deleteConfirmCard: {
      backgroundColor: C.background,
      borderRadius: RADIUS.xl,
      padding: SPACING.xl,
      width: '82%',
      maxWidth: 380,
      alignSelf: 'center',
    },
    deleteConfirmTitle: {
      fontSize: TYPOGRAPHY.size.lg,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
      marginBottom: SPACING.xs,
    },
    deleteConfirmName: {
      fontSize: TYPOGRAPHY.size.base,
      color: C.textSecondary,
      marginBottom: SPACING.xs,
    },
    deleteConfirmSub: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textMuted,
      marginBottom: SPACING.xl,
    },
    deleteConfirmBtns: {
      flexDirection: 'row',
      gap: SPACING.sm,
    },
    deleteConfirmBtn: {
      flex: 1,
      paddingVertical: SPACING.md,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 52,
    },
    deleteConfirmCancelBtn: {
      backgroundColor: C.background,
    },
    deleteConfirmCancelText: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textSecondary,
    },
    deleteConfirmBtnFlex: {
      flex: 1,
    },
    deleteConfirmPill: {
      width: '100%',
      paddingVertical: SPACING.md,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 52,
    },
    deleteConfirmPillInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    deleteConfirmPillText: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.onAccent,
      letterSpacing: 0.3,
    },
  });

export default DeleteConfirmModal;
