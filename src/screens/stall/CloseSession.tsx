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
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useStallStore } from '../../store/stallStore';
import { useSettingsStore } from '../../store/settingsStore';
import { SessionCondition } from '../../types';
import { useT } from '../../i18n';
import BusinessHeroNumber from '../../components/business/BusinessHeroNumber';

const CloseSession: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const CONDITIONS: { value: SessionCondition; label: string; icon: string }[] = [
    { value: 'good', label: t.stall.conditionGood, icon: 'sun' },
    { value: 'slow', label: t.stall.conditionSlow, icon: 'moon' },
    { value: 'rainy', label: t.stall.conditionRainy, icon: 'cloud-rain' },
    { value: 'hot', label: t.stall.conditionHot, icon: 'thermometer' },
    { value: 'normal', label: t.stall.conditionNormal, icon: 'minus' },
  ];
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
          <Text style={styles.emptyText}>{t.stall.noActiveSession}</Text>
          <TouchableOpacity
            style={styles.backLink}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.backLinkText}>{t.stall.goBack}</Text>
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

        <Text style={styles.heading}>{t.stall.closeSessionHeading}</Text>

        {/* Session summary — canonical hero number */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryHeroWrap}>
            <BusinessHeroNumber
              amount={summary.totalRevenue}
              label={t.stall.cameInLabel}
              prefix={currency}
              animated={false}
            />
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Feather name="clock" size={16} color={C.textSecondary} style={{ marginBottom: 4 }} />
              <Text style={styles.summaryItemValue}>
                {formatDuration(summary.duration)}
              </Text>
              <Text style={styles.summaryItemLabel}>{t.stall.durationLabel}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Feather name="shopping-bag" size={16} color={C.textSecondary} style={{ marginBottom: 4 }} />
              <Text style={styles.summaryItemValue}>{summary.saleCount}</Text>
              <Text style={styles.summaryItemLabel}>
                {summary.saleCount !== 1 ? t.stall.salesLabel : t.stall.saleLabel}
              </Text>
            </View>
          </View>

          {/* Cash / QR breakdown */}
          <View style={styles.breakdownRow}>
            <View style={styles.breakdownItem}>
              <Feather name="dollar-sign" size={14} color={C.textSecondary} />
              <Text style={styles.breakdownText}>
                {t.stall.cashPrefix} {currency} {summary.totalCash.toFixed(0)}
              </Text>
            </View>
            <View style={styles.breakdownItem}>
              <Feather name="smartphone" size={14} color={C.textSecondary} />
              <Text style={styles.breakdownText}>
                {t.stall.qrPrefix} {currency} {summary.totalQR.toFixed(0)}
              </Text>
            </View>
          </View>
        </View>

        {/* Condition picker */}
        <View style={styles.conditionSection}>
          <Text style={styles.inputLabel}>{t.stall.howWasIt}</Text>
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
          <Text style={styles.inputLabel}>{t.stall.noteLabel}</Text>
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder={t.stall.notePlaceholder}
            placeholderTextColor={C.neutral}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            accessibilityLabel="Session note, optional"
            accessibilityHint="Add a note about this selling session"
            keyboardAppearance={isDark ? 'dark' : 'light'}
            selectionColor={C.accent}
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
          <Text style={styles.closeButtonText}>{t.stall.closeSessionButton}</Text>
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
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
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
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
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
  summaryHeroWrap: {
    marginBottom: SPACING.xl,
    alignItems: 'center',
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
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
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
    color: C.onAccent,
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
