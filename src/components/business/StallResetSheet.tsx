import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useStallStore } from '../../store/stallStore';
import { lightTap } from '../../services/haptics';
import { StallResetScope } from '../../types';
import { newstOutline } from './NewstInput';

// Muted terracotta — same tone the business-settings danger zone uses (not alarm red).
const DANGER = '#B5705A';

interface Props {
  visible: boolean;
  onClose: () => void;
  onDeleted?: (scope: StallResetScope) => void;
}

/**
 * Scoped, gated delete of the stall business setup's data. Guards on an open
 * session, shows what will be removed with counts, and requires typing the
 * confirm word before the (local, irreversible) delete is allowed. Stays in
 * stall mode — unlike the all-business "clear business data" wipe.
 */
const StallResetSheet: React.FC<Props> = ({ visible, onClose, onDeleted }) => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);

  const sessions = useStallStore((s) => s.sessions);
  const products = useStallStore((s) => s.products);
  const regularCustomers = useStallStore((s) => s.regularCustomers);
  const preOrders = useStallStore((s) => s.preOrders);
  const activeSessionId = useStallStore((s) => s.activeSessionId);
  const resetStallData = useStallStore((s) => s.resetStallData);

  const [scope, setScope] = useState<StallResetScope>('all');
  const [confirmText, setConfirmText] = useState('');
  const [focused, setFocused] = useState(false);

  const hasActiveSession = activeSessionId != null;

  const counts: Record<StallResetScope, number> = {
    all: sessions.length + products.length + regularCustomers.length + preOrders.length,
    history: sessions.length,
    products: products.length,
    customers: regularCustomers.length,
    preorders: preOrders.length,
  };

  const scopes: { key: StallResetScope; label: string }[] = [
    { key: 'all', label: t.stall.scopeAll },
    { key: 'history', label: t.stall.scopeHistory },
    { key: 'products', label: t.stall.scopeProducts },
    { key: 'customers', label: t.stall.scopeCustomers },
    { key: 'preorders', label: t.stall.scopePreorders },
  ];

  const confirmWord = t.stall.deleteDataConfirmWord;
  const typedOk = confirmText.trim().toUpperCase() === confirmWord.toUpperCase();
  const canDelete = !hasActiveSession && typedOk && counts[scope] > 0;

  const reset = () => {
    setScope('all');
    setConfirmText('');
    setFocused(false);
  };
  const handleClose = () => {
    reset();
    onClose();
  };
  const handleDelete = () => {
    if (!canDelete) return;
    lightTap();
    const done = scope;
    resetStallData(scope);
    reset();
    onClose();
    onDeleted?.(done);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <Pressable style={styles.overlay} onPress={handleClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.headerRow}>
            <View style={styles.warnIcon}>
              <Feather name="trash-2" size={20} color={DANGER} />
            </View>
            <Text style={styles.title}>{t.stall.deleteDataTitle}</Text>
          </View>

          <Text style={styles.warning}>{t.stall.deleteDataWarning}</Text>

          {/* Scope picker */}
          <View style={styles.scopeList}>
            {scopes.map((s) => {
              const selected = scope === s.key;
              return (
                <TouchableOpacity
                  key={s.key}
                  style={[styles.scopeRow, selected && styles.scopeRowActive]}
                  onPress={() => {
                    lightTap();
                    setScope(s.key);
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${s.label}, ${counts[s.key]}`}
                >
                  <View style={[styles.radio, selected && styles.radioActive]}>
                    {selected && <View style={styles.radioDot} />}
                  </View>
                  <Text style={[styles.scopeLabel, selected && styles.scopeLabelActive]}>
                    {s.label}
                  </Text>
                  <Text style={styles.scopeCount}>{counts[s.key]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {hasActiveSession ? (
            <Text style={styles.guard}>{t.stall.deleteDataActiveGuard}</Text>
          ) : (
            <>
              <Text style={styles.confirmPrompt}>
                {t.stall.deleteDataTypeToConfirm.replace('{word}', confirmWord)}
              </Text>
              <TextInput
                style={[styles.input, newstOutline(C, focused)]}
                value={confirmText}
                onChangeText={setConfirmText}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder={confirmWord}
                placeholderTextColor={C.neutral}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={withAlpha(C.textPrimary, 0.2)}
                accessibilityLabel={t.stall.deleteDataTypeToConfirm.replace('{word}', confirmWord)}
              />
            </>
          )}

          <TouchableOpacity
            style={[styles.deleteBtn, !canDelete && styles.deleteBtnDisabled]}
            disabled={!canDelete}
            onPress={handleDelete}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t.stall.deleteDataButton}
          >
            <Text style={styles.deleteBtnText}>{t.stall.deleteDataButton}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleClose}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t.common.cancel}
          >
            <Text style={styles.cancelBtnText}>{t.common.cancel}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.4)',
      justifyContent: 'center',
      paddingHorizontal: SPACING['2xl'],
    },
    card: {
      backgroundColor: C.background,
      borderRadius: RADIUS.xl,
      padding: SPACING.xl,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      marginBottom: SPACING.md,
    },
    warnIcon: {
      width: 40,
      height: 40,
      borderRadius: RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(DANGER, 0.12),
    },
    title: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.lg,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
    },
    warning: {
      fontSize: TYPOGRAPHY.size.sm,
      lineHeight: 20,
      color: C.textSecondary,
      marginBottom: SPACING.lg,
    },
    scopeList: {
      marginBottom: SPACING.lg,
    },
    scopeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      borderRadius: RADIUS.md,
      minHeight: 48,
    },
    scopeRowActive: {
      backgroundColor: withAlpha(DANGER, 0.08),
    },
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: C.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioActive: {
      borderColor: DANGER,
    },
    radioDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: DANGER,
    },
    scopeLabel: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.medium,
      color: C.textSecondary,
    },
    scopeLabelActive: {
      color: C.textPrimary,
      fontWeight: TYPOGRAPHY.weight.semibold,
    },
    scopeCount: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textMuted,
      fontVariant: ['tabular-nums'],
      minWidth: 24,
      textAlign: 'right',
    },
    guard: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.medium,
      color: DANGER,
      marginBottom: SPACING.lg,
    },
    confirmPrompt: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textSecondary,
      marginBottom: SPACING.sm,
    },
    input: {
      minHeight: 48,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      fontSize: 16,
      fontWeight: TYPOGRAPHY.weight.semibold,
      letterSpacing: 2,
      color: C.textPrimary,
      marginBottom: SPACING.lg,
    },
    deleteBtn: {
      backgroundColor: DANGER,
      borderRadius: RADIUS.lg,
      paddingVertical: SPACING.md,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 50,
    },
    deleteBtnDisabled: {
      opacity: 0.4,
    },
    deleteBtnText: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.onAccent,
    },
    cancelBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: SPACING.md,
      minHeight: 44,
      marginTop: SPACING.xs,
    },
    cancelBtnText: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.medium,
      color: C.textSecondary,
    },
  });

export default StallResetSheet;
