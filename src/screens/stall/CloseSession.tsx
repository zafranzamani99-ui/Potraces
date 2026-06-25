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

          <View style={styles.amountFieldRow}>
            <Text style={styles.amountFieldLabel}>{t.stall.floatLabel}</Text>
            <View style={styles.amountInputWrap}>
              <Text style={styles.amountCurrency}>{currency}</Text>
              <TextInput
                style={styles.amountInput}
                value={floatStr}
                onChangeText={(v) => setFloatStr(v.replace(/[^0-9.]/g, ''))}
                placeholder={t.stall.floatPlaceholder}
                placeholderTextColor={C.neutral}
                keyboardType="decimal-pad"
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={withAlpha(C.accent, 0.25)}
                accessibilityLabel="Starting cash float, optional"
              />
            </View>
          </View>

          <View style={styles.cashLineRow}>
            <Text style={styles.cashLineLabel}>{t.stall.expectedInBox}</Text>
            <Text style={styles.cashLineValue}>{currency} {expectedCash.toFixed(2)}</Text>
          </View>

          <View style={styles.amountFieldRow}>
            <Text style={styles.amountFieldLabel}>{t.stall.countedLabel}</Text>
            <View style={styles.amountInputWrap}>
              <Text style={styles.amountCurrency}>{currency}</Text>
              <TextInput
                style={styles.amountInput}
                value={countedStr}
                onChangeText={(v) => setCountedStr(v.replace(/[^0-9.]/g, ''))}
                placeholder={t.stall.countCashPlaceholder}
                placeholderTextColor={C.neutral}
                keyboardType="decimal-pad"
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={withAlpha(C.accent, 0.25)}
                accessibilityLabel="Counted cash, optional"
              />
            </View>
          </View>

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
              style={styles.expenseNameInput}
              value={expenseName}
              onChangeText={setExpenseName}
              placeholder={t.stall.expenseNamePlaceholder}
              placeholderTextColor={C.neutral}
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={withAlpha(C.accent, 0.25)}
              accessibilityLabel="What the cost was for"
            />
            <View style={styles.expenseAmountWrap}>
              <Text style={styles.amountCurrency}>{currency}</Text>
              <TextInput
                style={styles.expenseAmountInput}
                value={expenseAmount}
                onChangeText={(v) => setExpenseAmount(v.replace(/[^0-9.]/g, ''))}
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
            <TouchableOpacity
              style={styles.expenseAddBtn}
              onPress={guardedAddExpense}
              accessibilityRole="button"
              accessibilityLabel={t.stall.addExpenseBtn}
            >
              <Feather name="plus" size={18} color={C.onAccent} />
            </TouchableOpacity>
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
            selectionColor={withAlpha(C.accent, 0.25)}
          />
        </View>

        {/* Close session button */}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={guardedClose}
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

  // ─── Optional cashbox sections ───────────────────────────────
  section: {
    marginBottom: SPACING['3xl'],
  },
  sectionHint: {
    ...TYPE.muted,
    marginTop: -SPACING.xs,
    marginBottom: SPACING.md,
  },
  amountFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  amountFieldLabel: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textSecondary,
    flex: 1,
  },
  amountInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    minWidth: 140,
    minHeight: 48,
  },
  amountCurrency: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  amountInput: {
    flex: 1,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
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
  expenseAddBtn: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: C.bronze,
    alignItems: 'center',
    justifyContent: 'center',
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
