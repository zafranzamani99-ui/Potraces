import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useNeu } from '../common/neu';
import NeuButton from '../common/NeuButton';

interface DebtHowItWorksModalProps {
  visible: boolean;
  onClose: () => void;
}

const DebtHowItWorksModal: React.FC<DebtHowItWorksModalProps> = ({ visible, onClose }) => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  // Mirror the bills how-it-works look: neu card + neu rows (raised base wins
  // over the row tint, so rows read as dark faint-raised cards), wells on icons.
  const neu = useNeu(undefined, { faintDark: true });

  if (!visible) return null;

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.dHowOverlay} onPress={onClose}>
        <View style={[styles.dHowCard, neu.raisedModal]} onStartShouldSetResponder={() => true}>
          {/* Neu seam rule (docs/neu-vertical-error.md): bleed the clip edge
              out, pad content back in — rows keep their layout, shadows gain
              slack. Card uses raisedModal per the scrim rule (no halo). */}
          <ScrollView
            style={styles.dHowScrollBleed}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm }}
          >
            <View style={styles.dHowCardHeader}>
              <Text style={styles.dHowCardTitle}>{t.debts.howItWorks}</Text>
              <Text style={styles.dHowCardSub}>{t.debts.howItWorksSub}</Text>
            </View>

            {/* ── Basics ── */}
            <Text style={styles.dHowGroupLabel}>{t.debts.howItWorksBasics}</Text>
            <View style={[styles.dHowItem, neu.raised]}>
              <View style={[styles.dHowIconCircle, neu.well]}><Feather name="users" size={14} color={C.textSecondary} /></View>
              <Text style={styles.dHowText}><Text style={styles.dHowBold}>{t.debts.howGroupedTitle}</Text> {t.debts.howGroupedDesc}</Text>
            </View>
            <View style={[styles.dHowItem, neu.raised]}>
              <View style={[styles.dHowIconCircle, neu.well]}><Feather name="check-circle" size={14} color={C.textSecondary} /></View>
              <Text style={styles.dHowText}><Text style={styles.dHowBold}>{t.debts.howRecordTitle}</Text> {t.debts.howRecordDesc}</Text>
            </View>
            <View style={[styles.dHowItem, neu.raised]}>
              <View style={[styles.dHowIconCircle, neu.well]}><Feather name="rotate-ccw" size={14} color={C.textSecondary} /></View>
              <Text style={styles.dHowText}><Text style={styles.dHowBold}>{t.debts.howUndoTitle}</Text> {t.debts.howUndoDesc}</Text>
            </View>

            {/* ── Automation ── */}
            <Text style={styles.dHowGroupLabel}>{t.debts.howAutomation}</Text>
            <View style={[styles.dHowItem, neu.raised]}>
              <View style={[styles.dHowIconCircle, neu.well]}><Feather name="archive" size={14} color={C.textSecondary} /></View>
              <Text style={styles.dHowText}><Text style={styles.dHowBold}>{t.debts.howArchiveTitle}</Text> {t.debts.howArchiveDesc}</Text>
            </View>
            <View style={[styles.dHowItem, neu.raised]}>
              <View style={[styles.dHowIconCircle, neu.well]}><Feather name="bell" size={14} color={C.textSecondary} /></View>
              <Text style={styles.dHowText}><Text style={styles.dHowBold}>{t.debts.howRemindersTitle}</Text> {t.debts.howRemindersDesc}</Text>
            </View>
            <View style={[styles.dHowItem, neu.raised]}>
              <View style={[styles.dHowIconCircle, neu.well]}><Feather name="send" size={14} color={C.textSecondary} /></View>
              <Text style={styles.dHowText}><Text style={styles.dHowBold}>{t.debts.requestPayment}</Text> {t.debts.howRequestDesc}</Text>
            </View>

            {/* ── Managing ── */}
            <Text style={styles.dHowGroupLabel}>{t.debts.howManaging}</Text>
            <View style={[styles.dHowItem, neu.raised]}>
              <View style={[styles.dHowIconCircle, neu.well]}><Feather name="trash-2" size={14} color={C.textSecondary} /></View>
              <Text style={styles.dHowText}><Text style={styles.dHowBold}>{t.debts.howDeleteTitle}</Text> {t.debts.howDeleteDesc}</Text>
            </View>
            <View style={[styles.dHowItem, neu.raised]}>
              <View style={[styles.dHowIconCircle, neu.well]}><Feather name="check-square" size={14} color={C.textSecondary} /></View>
              <Text style={styles.dHowText}><Text style={styles.dHowBold}>{t.debts.howBulkTitle}</Text> {t.debts.howBulkDesc}</Text>
            </View>
            <View style={[styles.dHowItem, neu.raised]}>
              <View style={[styles.dHowIconCircle, neu.well]}><Feather name="edit-2" size={14} color={C.textSecondary} /></View>
              <Text style={styles.dHowText}><Text style={styles.dHowBold}>{t.debts.howEditTrackingTitle}</Text> {t.debts.howEditTrackingDesc}</Text>
            </View>
            <View style={[styles.dHowItem, neu.raised]}>
              <View style={[styles.dHowIconCircle, neu.well]}><Feather name="scissors" size={14} color={C.textSecondary} /></View>
              <Text style={styles.dHowText}><Text style={styles.dHowBold}>{t.debts.howSplitsTitle}</Text> {t.debts.howSplitsDesc}</Text>
            </View>
          </ScrollView>

          <View style={styles.dHowDismiss}>
            <NeuButton label={t.common.gotIt} onPress={onClose} />
          </View>
        </View>
      </Pressable>
    </Modal>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  dHowOverlay: {
    flex: 1,
    backgroundColor: withAlpha(C.dimBg, 0.4),
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  dHowCard: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '75%',
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  dHowCardHeader: {
    marginBottom: SPACING.md,
  },
  dHowCardTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? -0.1 : -0.3,
  },
  dHowCardSub: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginTop: 4,
    lineHeight: 16,
  },
  dHowGroupLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  dHowItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm + 2,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.07 : 0.025),
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.sm + 2,
    marginBottom: 6,
  },
  dHowIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.10 : 0.05),
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  dHowText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
    lineHeight: 18,
  },
  dHowBold: {
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  dHowDismiss: {
    marginTop: SPACING.md,
  },
  // Counterpart to the contentContainer padding: pulls the ScrollView's clip
  // edge OUT by the same amount (neu seam rule — docs/neu-vertical-error.md).
  dHowScrollBleed: { marginHorizontal: -SPACING.md, marginVertical: -SPACING.sm },
});

export default React.memo(DebtHowItWorksModal);
