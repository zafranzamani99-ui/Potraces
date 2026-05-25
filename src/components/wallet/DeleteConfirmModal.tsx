import React, { useMemo } from 'react';
import { Modal, Pressable, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CALM, RADIUS, SPACING, TYPOGRAPHY } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';

interface DeleteConfirmModalProps {
  visible: boolean;
  walletId: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  walletName: string;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  visible,
  walletId,
  onCancel,
  onConfirm,
  walletName,
}) => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <Pressable style={styles.deleteConfirmOverlay} onPress={onCancel}>
        <View style={styles.deleteConfirmCard} onStartShouldSetResponder={() => true}>
          <Text style={styles.deleteConfirmTitle}>Delete wallet?</Text>
          <Text style={styles.deleteConfirmName} numberOfLines={1}>
            {walletName}
          </Text>
          <Text style={styles.deleteConfirmSub}>This cannot be undone.</Text>
          <View style={styles.deleteConfirmBtns}>
            <TouchableOpacity
              style={[styles.deleteConfirmBtn, styles.deleteConfirmCancelBtn]}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel={t.common.cancel.toLowerCase()}
            >
              <Text style={styles.deleteConfirmCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.deleteConfirmBtn, styles.deleteConfirmDeleteBtn]}
              onPress={onConfirm}
              accessibilityRole="button"
              accessibilityLabel={t.common.delete.toLowerCase()}
            >
              <Text style={styles.deleteConfirmDeleteText}>Delete</Text>
            </TouchableOpacity>
          </View>
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
      backgroundColor: C.surface,
      borderRadius: RADIUS.xl,
      padding: SPACING.xl,
      width: '82%',
      borderWidth: 1,
      borderColor: C.border,
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
      borderRadius: RADIUS.lg,
      alignItems: 'center',
    },
    deleteConfirmCancelBtn: {
      backgroundColor: C.background,
      borderWidth: 1,
      borderColor: C.border,
    },
    deleteConfirmDeleteBtn: {
      backgroundColor: C.accent,
    },
    deleteConfirmCancelText: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textSecondary,
    },
    deleteConfirmDeleteText: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.onAccent,
    },
  });

export default DeleteConfirmModal;
