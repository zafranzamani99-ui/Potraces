import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { ScrollView } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useStallStore } from '../../store/stallStore';
import { useSettingsStore } from '../../store/settingsStore';
import { SessionCondition } from '../../types';
import { useT } from '../../i18n';
import { useSubmitGuard } from '../../hooks/useSubmitGuard';
import BusinessHeroNumber from '../../components/business/BusinessHeroNumber';
import NewstInput, { newstOutline } from '../../components/business/NewstInput';
import { useNeu } from '../../components/common/neu';
import NeuIconButton from '../../components/common/NeuIconButton';
import NeuButton from '../../components/common/NeuButton';

const CloseSession: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const neu = useNeu(undefined, { faintDark: true });
  const CONDITIONS: { value: SessionCondition; label: string; icon: string }[] = [
    { value: 'good', label: t.stall.conditionGood, icon: 'sun' },
    { value: 'slow', label: t.stall.conditionSlow, icon: 'moon' },
    { value: 'rainy', label: t.stall.conditionRainy, icon: 'cloud-rain' },
    { value: 'hot', label: t.stall.conditionHot, icon: 'thermometer' },
    { value: 'normal', label: t.stall.conditionNormal, icon: 'minus' },
  ];
  const {
    getActiveSession, closeSession, getSessionSummary, getSessionEconomics,
    setStartingFloat, setCountedCash, addExpense, removeExpense,
  } = useStallStore();
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();

  const activeSession = getActiveSession();

  const [selectedCondition, setSelectedCondition] = useState<SessionCondition | undefined>(
    undefined
  );
  const [note, setNote] = useState('');
  // Optional cashbox layer (all skippable)
  const [floatStr, setFloatStr] = useState(activeSession?.startingFloat ? String(activeSession.startingFloat) : '');
  const [countedStr, setCountedStr] = useState(activeSession?.countedCash != null ? String(activeSession.countedCash) : '');
  const [expenseName, setExpenseName] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // Session summary
  const summary = useMemo(() => {
    if (!activeSession) return null;
    return getSessionSummary(activeSession.id);
  }, [activeSession]);

  // Optional economics (cogs + expenses → kept). Recomputes as expenses change.
  const econ = useMemo(() => {
    if (!activeSession) return null;
    return getSessionEconomics(activeSession.id);
  }, [activeSession]);

  // Format duration
  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const handleAddExpense = () => {
    const amt = parseFloat(expenseAmount);
    if (isNaN(amt) || amt <= 0) return;
    addExpense({ label: expenseName.trim(), amount: amt });
    setExpenseName('');
    setExpenseAmount('');
  };
  const guardedAddExpense = useSubmitGuard(handleAddExpense);

  const handleClose = () => {
    if (!activeSession) return;
    const sessionId = activeSession.id;
    // Commit optional cashbox values onto the (still-active) session before closing
    const f = parseFloat(floatStr);
    setStartingFloat(!isNaN(f) && f > 0 ? f : undefined);
    const c = parseFloat(countedStr);
    setCountedCash(!isNaN(c) && c >= 0 ? c : undefined);
    closeSession(selectedCondition, note.trim() || undefined);
    navigation.getParent()?.navigate('StallSessionSummary', { sessionId });
  };
  const guardedClose = useSubmitGuard(handleClose);

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

  // Live cash-box reconciliation (from local inputs — no nag if left blank)
  const floatNum = parseFloat(floatStr) || 0;
  const expectedCash = floatNum + summary.totalCash;
  const countedNum = parseFloat(countedStr);
  const hasCounted = !isNaN(countedNum);
  const cashDiff = hasCounted ? countedNum - expectedCash : 0;
  const expenses = activeSession.expenses || [];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <NeuIconButton
            size={44}
            radius={14}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
          >
            <Feather name="arrow-left" size={22} color={C.textPrimary} />
          </NeuIconButton>
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
            {summary.totalCard > 0 && (
              <View style={styles.breakdownItem}>
                <Feather name="wifi" size={14} color={C.textSecondary} />
                <Text style={styles.breakdownText}>
                  {t.tapToPay.card} {currency} {summary.totalCard.toFixed(0)}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Cash box — optional reconciliation. Card settles to Stripe, not the
            drawer, so expected cash stays cash-only above. */}
        <View style={styles.section}>
          <Text style={styles.inputLabel}>{t.stall.cashBoxHeading}</Text>
          <Text style={styles.sectionHint}>{t.stall.cashBoxHint}</Text>

          <NewstInput
            label={t.stall.floatLabel}
            value={floatStr}
            onChangeText={(v) => setFloatStr(v.replace(/[^0-9.]/g, ''))}
            prefix={currency}
            keyboardType="decimal-pad"
            accessibilityLabel="Starting cash float, optional"
            style={styles.cashField}
          />

          <View style={styles.cashLineRow}>
            <Text style={styles.cashLineLabel}>{t.stall.expectedInBox}</Text>
            <Text style={styles.cashLineValue}>{currency} {expectedCash.toFixed(2)}</Text>
          </View>

          <NewstInput
            label={t.stall.countedLabel}
            value={countedStr}
            onChangeText={(v) => setCountedStr(v.replace(/[^0-9.]/g, ''))}
            prefix={currency}
            keyboardType="decimal-pad"
            accessibilityLabel="Counted cash, optional"
            style={styles.cashField}
          />

          {hasCounted && (
            <View style={styles.diffPill}>
              <Feather
                name={cashDiff === 0 ? 'check' : cashDiff > 0 ? 'arrow-up' : 'arrow-down'}
                size={14}
                color={C.bronze}
              />
              <Text style={styles.diffText}>
                {cashDiff === 0
                  ? t.stall.cashMatches
                  : cashDiff > 0
                  ? t.stall.overBy.replace('{currency}', currency).replace('{amount}', Math.abs(cashDiff).toFixed(2))
                  : t.stall.shortBy.replace('{currency}', currency).replace('{amount}', Math.abs(cashDiff).toFixed(2))}
              </Text>
            </View>
          )}
        </View>

        {/* Money out — optional expenses */}
        <View style={styles.section}>
          <Text style={styles.inputLabel}>{t.stall.moneyOutHeading}</Text>
          <Text style={styles.sectionHint}>{t.stall.moneyOutHint}</Text>

          {expenses.map((e) => (
            <View key={e.id} style={styles.expenseRow}>
              <Text style={styles.expenseLabel} numberOfLines={1}>{e.label}</Text>
              <Text style={styles.expenseAmount}>{currency} {e.amount.toFixed(2)}</Text>
              <TouchableOpacity
                onPress={() => removeExpense(e.id)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${e.label}`}
              >
                <Feather name="x" size={16} color={C.neutral} />
              </TouchableOpacity>
            </View>
          ))}

          <View style={styles.expenseAddRow}>
            <TextInput
              style={[styles.expenseNameInput, newstOutline(C, focusedField === 'expenseName')]}
              value={expenseName}
              onChangeText={setExpenseName}
              onFocus={() => setFocusedField('expenseName')}
              onBlur={() => setFocusedField((f) => (f === 'expenseName' ? null : f))}
              placeholder={t.stall.expenseNamePlaceholder}
              placeholderTextColor={C.neutral}
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={withAlpha(C.accent, 0.25)}
              accessibilityLabel="What the cost was for"
            />
            <View style={[styles.expenseAmountWrap, newstOutline(C, focusedField === 'expenseAmount')]}>
              <Text style={styles.amountCurrency}>{currency}</Text>
              <TextInput
                style={styles.expenseAmountInput}
                value={expenseAmount}
                onChangeText={(v) => setExpenseAmount(v.replace(/[^0-9.]/g, ''))}
                onFocus={() => setFocusedField('expenseAmount')}
                onBlur={() => setFocusedField((f) => (f === 'expenseAmount' ? null : f))}
                placeholder={t.stall.expenseAmountPlaceholder}
                placeholderTextColor={C.neutral}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={guardedAddExpense}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={withAlpha(C.accent, 0.25)}
                accessibilityLabel="Cost amount"
              />
            </View>
            <NeuIconButton
              size={48}
              radius={14}
              onPress={guardedAddExpense}
              accessibilityLabel={t.stall.addExpenseBtn}
            >
              <Feather name="plus" size={18} color={C.bronze} />
            </NeuIconButton>
          </View>
        </View>

        {/* What you kept — only when costs exist */}
        {econ && econ.hasCosts && (
          <View style={styles.netCard}>
            <View style={styles.netRow}>
              <Text style={styles.netLabel}>{t.stall.cameInRow}</Text>
              <Text style={styles.netValue}>{currency} {econ.revenue.toFixed(2)}</Text>
            </View>
            {econ.cogs > 0 && (
              <View style={styles.netRow}>
                <Text style={styles.netLabelMuted}>{t.stall.goodsCostRow}</Text>
                <Text style={styles.netValueMuted}>−{currency} {econ.cogs.toFixed(2)}</Text>
              </View>
            )}
            {econ.expensesTotal > 0 && (
              <View style={styles.netRow}>
                <Text style={styles.netLabelMuted}>{t.stall.moneyOutRow}</Text>
                <Text style={styles.netValueMuted}>−{currency} {econ.expensesTotal.toFixed(2)}</Text>
              </View>
            )}
            <View style={[styles.netRow, styles.netRowFinal]}>
              <Text style={styles.netKeptLabel}>{t.stall.keptRow}</Text>
              <Text style={styles.netKeptValue}>{currency} {econ.kept.toFixed(2)}</Text>
            </View>
          </View>
        )}

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
                    neu.raised,
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
                    color={isSelected ? C.onAccent : C.textSecondary}
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
          <NewstInput
            label={t.stall.noteLabel}
            value={note}
            onChangeText={setNote}
            multiline
            accessibilityLabel="Session note, optional"
            accessibilityHint="Add a note about this selling session"
          />
        </View>

        {/* Close session button */}
        <NeuButton
          icon="check"
          label={t.stall.closeSessionButton}
          color={C.bronze}
          onPress={guardedClose}
          accessibilityLabel="Close this selling session"
        />
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

  // ─── Optional cashbox sections ───────────────────────────────
  section: {
    marginBottom: SPACING['3xl'],
  },
  sectionHint: {
    ...TYPE.muted,
    marginTop: -SPACING.xs,
    marginBottom: SPACING.md,
  },
  cashField: {
    marginBottom: SPACING.sm,
  },
  amountCurrency: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  cashLineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  cashLineLabel: {
    ...TYPE.muted,
  },
  cashLineValue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  diffPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.xs,
    backgroundColor: withAlpha(C.bronze, 0.08),
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.xs,
  },
  diffText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
    fontVariant: ['tabular-nums'],
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  expenseLabel: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },
  expenseAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  expenseAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  expenseNameInput: {
    flex: 1,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    minHeight: 48,
  },
  expenseAmountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    width: 96,
    minHeight: 48,
  },
  expenseAmountInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  netCard: {
    backgroundColor: withAlpha(C.bronze, 0.04),
    borderWidth: 1,
    borderColor: withAlpha(C.bronze, 0.15),
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    marginBottom: SPACING['3xl'],
    gap: SPACING.sm,
  },
  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  netRowFinal: {
    marginTop: SPACING.xs,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: withAlpha(C.bronze, 0.2),
  },
  netLabel: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textSecondary,
  },
  netValue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  netLabelMuted: {
    ...TYPE.muted,
  },
  netValueMuted: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  netKeptLabel: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  netKeptValue: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.bronze,
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
    backgroundColor: withAlpha(C.textPrimary, 0.03),
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    minHeight: 44,
  },
  conditionPillSelected: {
    backgroundColor: C.bronze,
  },
  conditionText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  conditionTextSelected: {
    color: C.onAccent,
    fontWeight: TYPOGRAPHY.weight.bold,
  },

  // ─── Note ────────────────────────────────────────────────────
  noteSection: {
    marginBottom: SPACING['3xl'],
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
