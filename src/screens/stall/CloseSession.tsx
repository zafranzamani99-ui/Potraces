import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useStallStore } from '../../store/stallStore';
import { useSettingsStore } from '../../store/settingsStore';
import { SessionCondition } from '../../types';

const CONDITIONS: { value: SessionCondition; label: string; icon: string }[] = [
  { value: 'good', label: 'good', icon: 'sun' },
  { value: 'slow', label: 'slow', icon: 'moon' },
  { value: 'rainy', label: 'rainy', icon: 'cloud-rain' },
  { value: 'hot', label: 'hot', icon: 'thermometer' },
  { value: 'normal', label: 'normal', icon: 'minus' },
];

const CloseSession: React.FC = () => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { getActiveSession, closeSession, getSessionSummary } = useStallStore();
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();

  const activeSession = getActiveSession();

  const [selectedCondition, setSelectedCondition] = useState<SessionCondition | undefined>(
    undefined
  );
  const [note, setNote] = useState('');

  // Session summary
  const summary = useMemo(() => {
    if (!activeSession) return null;
    return getSessionSummary(activeSession.id);
  }, [activeSession]);

  // Format duration
  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const handleClose = () => {
    if (!activeSession) return;
    const sessionId = activeSession.id;
    closeSession(selectedCondition, note.trim() || undefined);
    navigation.getParent()?.navigate('StallSessionSummary', { sessionId });
  };

  // Safeguard: if no active session, go back
  if (!activeSession || !summary) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>no active session</Text>
          <TouchableOpacity
            style={styles.backLink}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.backLinkText}>go back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="arrow-left" size={24} color={C.textPrimary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.heading}>close session</Text>

        {/* Session summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>TOTAL REVENUE</Text>
          <Text
            style={styles.summaryRevenue}
            accessibilityLabel={`Total revenue ${currency} ${summary.totalRevenue.toFixed(2)}`}
          >
            {currency} {summary.totalRevenue.toFixed(0)}
          </Text>

          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Feather name="clock" size={16} color={C.textSecondary} style={{ marginBottom: 4 }} />
              <Text style={styles.summaryItemValue}>
                {formatDuration(summary.duration)}
              </Text>
              <Text style={styles.summaryItemLabel}>duration</Text>
            </View>
            <View style={styles.summaryItem}>
              <Feather name="shopping-bag" size={16} color={C.textSecondary} style={{ marginBottom: 4 }} />
              <Text style={styles.summaryItemValue}>{summary.saleCount}</Text>
              <Text style={styles.summaryItemLabel}>
                sale{summary.saleCount !== 1 ? 's' : ''}
              </Text>
            </View>
          </View>

          {/* Cash / QR breakdown */}
          <View style={styles.breakdownRow}>
            <View style={styles.breakdownItem}>
              <Feather name="dollar-sign" size={14} color={C.textSecondary} />
              <Text style={styles.breakdownText}>
                cash {currency} {summary.totalCash.toFixed(0)}
              </Text>
            </View>
            <View style={styles.breakdownItem}>
              <Feather name="smartphone" size={14} color={C.textSecondary} />
              <Text style={styles.breakdownText}>
                qr {currency} {summary.totalQR.toFixed(0)}
              </Text>
            </View>
          </View>
        </View>

        {/* Condition picker */}
        <View style={styles.conditionSection}>
          <Text style={styles.inputLabel}>HOW WAS IT?</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.conditionList}
          >
            {CONDITIONS.map((cond) => {
              const isSelected = selectedCondition === cond.value;
              return (
                <TouchableOpacity
                  key={cond.value}
                  style={[
                    styles.conditionPill,
                    isSelected && styles.conditionPillSelected,
                  ]}
                  onPress={() =>
                    setSelectedCondition(
                      isSelected ? undefined : cond.value
                    )
                  }
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Condition: ${cond.label}`}
                  accessibilityState={{ selected: isSelected }}
                >
                  <Feather
                    name={cond.icon as keyof typeof Feather.glyphMap}
                    size={16}
                    color={isSelected ? C.bronze : C.textSecondary}
                  />
                  <Text
                    style={[
                      styles.conditionText,
                      isSelected && styles.conditionTextSelected,
                    ]}
                  >
                    {cond.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Note input */}
        <View style={styles.noteSection}>
          <Text style={styles.inputLabel}>NOTE</Text>
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="anything to remember about today?"
            placeholderTextColor={C.neutral}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            accessibilityLabel="Session note, optional"
            accessibilityHint="Add a note about this selling session"
          />
        </View>

        {/* Close session button */}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={handleClose}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Close this selling session"
        >
          <Text style={styles.closeButtonText}>close session</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING['2xl'],
    paddingBottom: SPACING['4xl'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    fontSize: TYPOGRAPHY.size['3xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: SPACING['3xl'],
  },

  // ─── Summary card ────────────────────────────────────────────
  summaryCard: {
    backgroundColor: withAlpha(C.bronze, 0.04),
    borderWidth: 1,
    borderColor: withAlpha(C.bronze, 0.15),
    borderRadius: RADIUS.lg,
    padding: SPACING['2xl'],
    marginBottom: SPACING['3xl'],
  },
  summaryLabel: {
    ...TYPE.label,
    marginBottom: SPACING.xs,
  },
  summaryRevenue: {
    ...TYPE.balance,
    color: C.textPrimary,
    marginBottom: SPACING.xl,
    fontSize: TYPOGRAPHY.size['4xl'],
  },
  summaryRow: {
    flexDirection: 'row',
    gap: SPACING['3xl'],
    marginBottom: SPACING.lg,
  },
  summaryItem: {
    alignItems: 'flex-start',
  },
  summaryItemValue: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  summaryItemLabel: {
    ...TYPE.muted,
    marginTop: 2,
  },
  breakdownRow: {
    flexDirection: 'row',
    gap: SPACING.xl,
    paddingTop: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  breakdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  breakdownText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
  },

  // ─── Condition picker ────────────────────────────────────────
  conditionSection: {
    marginBottom: SPACING['3xl'],
  },
  inputLabel: {
    ...TYPE.label,
    marginBottom: SPACING.sm,
  },
  conditionList: {
    gap: SPACING.sm,
    paddingRight: SPACING.sm,
  },
  conditionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    minHeight: 44,
  },
  conditionPillSelected: {
    borderColor: C.bronze,
    backgroundColor: withAlpha(C.bronze, 0.10),
  },
  conditionText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  conditionTextSelected: {
    color: C.bronze,
  },

  // ─── Note ────────────────────────────────────────────────────
  noteSection: {
    marginBottom: SPACING['3xl'],
  },
  noteInput: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    minHeight: 88,
  },

  // ─── Actions ─────────────────────────────────────────────────
  closeButton: {
    backgroundColor: C.bronze,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  closeButtonText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#FFFFFF',
  },

  // ─── Empty state ─────────────────────────────────────────────
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING['3xl'],
  },
  emptyText: {
    ...TYPE.insight,
    color: C.textSecondary,
    marginBottom: SPACING.lg,
  },
  backLink: {
    minHeight: 44,
    justifyContent: 'center',
  },
  backLinkText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },
});

export default CloseSession;
