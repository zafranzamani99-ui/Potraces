import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, Modal } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';

interface DebtHowItWorksModalProps {
  visible: boolean;
  onClose: () => void;
}

const DebtHowItWorksModal: React.FC<DebtHowItWorksModalProps> = ({ visible, onClose }) => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);

  if (!visible) return null;

  return (
    <Modal visible animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.dHowOverlay} onPress={onClose}>
        <View style={styles.dHowCard} onStartShouldSetResponder={() => true}>
          <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: SPACING.sm }}>
            <View style={styles.dHowCardHeader}>
              <Text style={styles.dHowCardTitle}>how it works</Text>
              <Text style={styles.dHowCardSub}>everything you need to know about this screen</Text>
            </View>

            {/* ── Basics ── */}
            <Text style={styles.dHowGroupLabel}>basics</Text>
            <View style={styles.dHowItem}>
              <View style={styles.dHowIconCircle}><Feather name="users" size={14} color={C.textSecondary} /></View>
              <Text style={styles.dHowText}><Text style={styles.dHowBold}>grouped by person</Text> — debts with the same person are consolidated into one card. tap to see each debt inside.</Text>
            </View>
            <View style={styles.dHowItem}>
              <View style={styles.dHowIconCircle}><Feather name="check-circle" size={14} color={C.textSecondary} /></View>
              <Text style={styles.dHowText}><Text style={styles.dHowBold}>record payments</Text> — partial or full, against any debt. each payment links to your wallet automatically.</Text>
            </View>
            <View style={styles.dHowItem}>
              <View style={styles.dHowIconCircle}><Feather name="rotate-ccw" size={14} color={C.textSecondary} /></View>
              <Text style={styles.dHowText}><Text style={styles.dHowBold}>undo payments</Text> — tap the clock icon to view history. you can remove any payment from there.</Text>
            </View>

            {/* ── Automation ── */}
            <Text style={styles.dHowGroupLabel}>automation</Text>
            <View style={styles.dHowItem}>
              <View style={styles.dHowIconCircle}><Feather name="archive" size={14} color={C.textSecondary} /></View>
              <Text style={styles.dHowText}><Text style={styles.dHowBold}>auto-archive</Text> — settled debts move to archive after 30 days. enable the archive tab in settings to view them.</Text>
            </View>
            <View style={styles.dHowItem}>
              <View style={styles.dHowIconCircle}><Feather name="bell" size={14} color={C.textSecondary} /></View>
              <Text style={styles.dHowText}><Text style={styles.dHowBold}>reminders</Text> — send a friendly nudge via WhatsApp for "they owe" debts. includes all outstanding amounts.</Text>
            </View>
            <View style={styles.dHowItem}>
              <View style={styles.dHowIconCircle}><Feather name="send" size={14} color={C.textSecondary} /></View>
              <Text style={styles.dHowText}><Text style={styles.dHowBold}>request payment</Text> — generate a message with optional QR code. share via WhatsApp or copy.</Text>
            </View>

            {/* ── Managing ── */}
            <Text style={styles.dHowGroupLabel}>managing</Text>
            <View style={styles.dHowItem}>
              <View style={styles.dHowIconCircle}><Feather name="trash-2" size={14} color={C.textSecondary} /></View>
              <Text style={styles.dHowText}><Text style={styles.dHowBold}>delete only here</Text> — debt-linked transactions can only be removed from this screen, not from the transactions list.</Text>
            </View>
            <View style={styles.dHowItem}>
              <View style={styles.dHowIconCircle}><Feather name="check-square" size={14} color={C.textSecondary} /></View>
              <Text style={styles.dHowText}><Text style={styles.dHowBold}>bulk actions</Text> — long-press any debt or split to select. archive or delete multiple items at once.</Text>
            </View>
            <View style={styles.dHowItem}>
              <View style={styles.dHowIconCircle}><Feather name="edit-2" size={14} color={C.textSecondary} /></View>
              <Text style={styles.dHowText}><Text style={styles.dHowBold}>edit tracking</Text> — payment edits are logged. look for the "edited" badge on modified payments.</Text>
            </View>
            <View style={styles.dHowItem}>
              <View style={styles.dHowIconCircle}><Feather name="scissors" size={14} color={C.textSecondary} /></View>
              <Text style={styles.dHowText}><Text style={styles.dHowBold}>splits</Text> — divide expenses with friends using equal, custom, or item-based methods.</Text>
            </View>
          </ScrollView>

          <TouchableOpacity
            style={styles.dHowDismiss}
            onPress={onClose}
            activeOpacity={0.7}
          >
            <Text style={styles.dHowDismissText}>got it</Text>
          </TouchableOpacity>
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
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C === CALM_DARK ? withAlpha(C.textPrimary, 0.12) : withAlpha(C.textPrimary, 0.08),
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.lg),
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
    alignItems: 'center',
    paddingVertical: SPACING.sm + 4,
    marginTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: withAlpha(C.textPrimary, 0.06),
  },
  dHowDismissText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
    letterSpacing: 0.2,
  },
});

export default React.memo(DebtHowItWorksModal);
