import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import Button from '../common/Button';

interface DebtViewSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  bottomInset: number;
  debtsShowArchive: boolean;
  setDebtsShowArchive: (v: boolean) => void;
  debtsShowReminder: boolean;
  setDebtsShowReminder: (v: boolean) => void;
  onHowItWorks: () => void;
}

const DebtViewSettingsModal: React.FC<DebtViewSettingsModalProps> = ({
  visible,
  onClose,
  bottomInset,
  debtsShowArchive,
  setDebtsShowArchive,
  debtsShowReminder,
  setDebtsShowReminder,
  onHowItWorks,
}) => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);

  if (!visible) return null;

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[styles.modalContent, { paddingBottom: Math.max(SPACING['2xl'], bottomInset + SPACING.lg) }]} onStartShouldSetResponder={() => true}>
          <View style={styles.dDebtSheetTopRow}>
            <View style={styles.dDebtSheetHandle} />
          </View>
          <View style={styles.dDebtTitleZone}>
            <Text style={styles.dDebtTitle}>
              view <Text style={styles.dDebtTitleAccent}>settings</Text>
            </Text>
            <Text style={styles.dDebtSubtitle}>tweak what shows up on this screen</Text>
          </View>

          <View style={{ paddingHorizontal: SPACING.xl, paddingBottom: SPACING.lg }}>
            <TouchableOpacity
              style={styles.dSettingsRow}
              onPress={() => setDebtsShowArchive(!debtsShowArchive)}
              activeOpacity={0.7}
              accessibilityRole="switch"
              accessibilityState={{ checked: debtsShowArchive }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.dSettingsRowTitle}>show archive tab</Text>
                <Text style={styles.dSettingsRowSub}>
                  keeps an extra tab for debts and splits you've stashed away. tap any item's "archive" action to move it there.
                </Text>
              </View>
              <View style={[
                styles.dSettingsToggle,
                debtsShowArchive && { backgroundColor: C.accent },
              ]}>
                <View style={[
                  styles.dSettingsToggleThumb,
                  debtsShowArchive && { transform: [{ translateX: 18 }] },
                ]} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.dSettingsRow, { marginTop: SPACING.md }]}
              onPress={() => setDebtsShowReminder(!debtsShowReminder)}
              activeOpacity={0.7}
              accessibilityRole="switch"
              accessibilityState={{ checked: debtsShowReminder }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.dSettingsRowTitle}>show reminder button</Text>
                <Text style={styles.dSettingsRowSub}>
                  adds a reminder button on "they owe" debts so you can nudge people with a friendly message.
                </Text>
              </View>
              <View style={[
                styles.dSettingsToggle,
                debtsShowReminder && { backgroundColor: C.accent },
              ]}>
                <View style={[
                  styles.dSettingsToggleThumb,
                  debtsShowReminder && { transform: [{ translateX: 18 }] },
                ]} />
              </View>
            </TouchableOpacity>

            {/* ── How it works button ─────────────────────── */}
            <TouchableOpacity
              style={styles.dHowButton}
              onPress={onHowItWorks}
              activeOpacity={0.7}
            >
              <Feather name="help-circle" size={16} color={C.accent} />
              <Text style={styles.dHowButtonText}>how it works</Text>
              <Feather name="chevron-right" size={14} color={C.textMuted} />
            </TouchableOpacity>

            <Button
              title={t.common.done}
              onPress={onClose}
              variant="outline"
              fullWidth
              style={{ marginTop: SPACING.lg }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: C.surface,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    padding: SPACING['2xl'],
    maxHeight: '90%',
  },
  dDebtSheetTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
    position: 'relative',
  },
  dDebtSheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: withAlpha(C.textPrimary, 0.15),
  },
  dDebtTitleZone: {
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  dDebtTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? -0.2 : -0.4,
    textAlign: 'center',
  },
  dDebtTitleAccent: {
    fontStyle: 'italic',
    fontFamily: 'serif',
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.accent,
  },
  dDebtSubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginTop: SPACING.xs + 2,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  dSettingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.md,
  },
  dSettingsRowTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: 4,
  },
  dSettingsRowSub: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    lineHeight: 16,
  },
  dSettingsToggle: {
    width: 42,
    height: 24,
    borderRadius: 12,
    backgroundColor: withAlpha(C.textPrimary, 0.12),
    padding: 2,
    justifyContent: 'center',
  },
  dSettingsToggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: C.surface,
    ...(C === CALM_DARK ? {} : { shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 2 }),
  },
  dHowButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: withAlpha(C.textPrimary, 0.06),
    paddingVertical: SPACING.md,
  },
  dHowButtonText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
});

export default React.memo(DebtViewSettingsModal);
