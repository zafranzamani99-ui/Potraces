/* Hallmark · redesign v2: "that's a wrap" — wind-down register close for a tired
 * seller. Mood: appreciative, calm, soft neu (no gradient, no glass, no solid
 * bronze card). KeyboardAwareScrollView keeps the focused field visible.
 * pre-emit critique: P5 H4 E4 S4 R5 V4
 */
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  TextInput,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useStallStore } from '../../store/stallStore';
import { useSettingsStore } from '../../store/settingsStore';
import { SessionCondition } from '../../types';
import { useT } from '../../i18n';
import { useSubmitGuard } from '../../hooks/useSubmitGuard';
import { lightTap } from '../../services/haptics';
import NewstInput, { newstOutline } from '../../components/business/NewstInput';
import { useNeu } from '../../components/common/neu';
import NeuIconButton from '../../components/common/NeuIconButton';
import PaymentSplitBar from '../../components/business/PaymentSplitBar';

const SPRING = { damping: 18, stiffness: 260, mass: 0.7 } as const;

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

  // Close-CTA press spring
  const ctaScale = useSharedValue(1);
  const ctaAStyle = useAnimatedStyle(() => ({ transform: [{ scale: ctaScale.value }] }));

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
  const expenses = activeSession.expenses || [];
  // Cash expenses come out of the drawer → subtract them, or any cash expense
  // shows a false "short" at close (bug 6c). Mirrors getSessionEconomics.
  const expensesTotal = expenses.reduce((sum, e) => sum + e.amount, 0);
  const expectedCash = floatNum + summary.totalCash - expensesTotal;
  const countedNum = parseFloat(countedStr);
  const hasCounted = !isNaN(countedNum);
  const cashDiff = hasCounted ? countedNum - expectedCash : 0;

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bottomOffset={SPACING.lg}
      >
        {/* Appreciative wind-down header (back lives in the native nav header) */}
        <Text style={styles.heading}>{t.stall.wrapHeading}</Text>
        <Text style={styles.headingSub}>
          {t.stall.wrapSubtitle.replace('{duration}', formatDuration(summary.duration))}
        </Text>

        {/* ─── Wind-down hero: soft neu well, the number is the payoff ─── */}
        <View style={[styles.heroCard, neu.raisedSoft]}>
          <Text style={styles.heroLabel}>{t.stall.cameInLabel.toUpperCase()}</Text>
          <Text style={styles.heroAmount} accessibilityLabel={`${currency} ${Math.round(summary.totalRevenue)}`}>
            {currency} {Math.round(summary.totalRevenue).toLocaleString()}
          </Text>

          <View style={styles.heroStats}>
            <Feather name="clock" size={13} color={C.textMuted} />
            <Text style={styles.heroStatText}>
              {summary.saleCount} {summary.saleCount !== 1 ? t.stall.salesLabel : t.stall.saleLabel}
            </Text>
          </View>

          <View style={{ marginTop: SPACING.lg }}>
            <PaymentSplitBar
              cash={summary.totalCash}
              qr={summary.totalQR}
              card={summary.totalCard}
              cashLabel={`${t.stall.cashPrefix} ${currency} ${summary.totalCash.toFixed(0)}`}
              qrLabel={`${t.stall.qrPrefix} ${currency} ${summary.totalQR.toFixed(0)}`}
              cardLabel={`${t.tapToPay.card} ${currency} ${summary.totalCard.toFixed(0)}`}
              cashColor={C.bronze}
              qrColor={C.accent}
              cardColor={C.gold}
              trackColor={withAlpha(C.textPrimary, 0.08)}
              labelColor={C.textSecondary}
            />
          </View>
        </View>

        {/* ─── Count the drawer — optional cash reconciliation ───
            Card settles to Stripe, not the drawer, so expected stays cash-only. */}
        <View style={[styles.sectionCard, neu.raisedSoft]}>
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

          <View style={styles.expectedRow}>
            <Text style={styles.expectedLabel}>{t.stall.expectedInBox}</Text>
            <Text style={styles.expectedValue}>{currency} {expectedCash.toFixed(2)}</Text>
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
            <View style={styles.diffRow}>
              <View
                style={[
                  styles.diffStamp,
                  {
                    borderColor: withAlpha(
                      cashDiff === 0 ? C.positive : cashDiff > 0 ? C.gold : C.neutral,
                      0.65
                    ),
                  },
                ]}
              >
                <Feather
                  name={cashDiff === 0 ? 'check' : cashDiff > 0 ? 'arrow-up' : 'arrow-down'}
                  size={12}
                  color={cashDiff === 0 ? C.positive : cashDiff > 0 ? C.gold : C.neutral}
                />
                <Text
                  style={[
                    styles.diffStampText,
                    { color: cashDiff === 0 ? C.positive : cashDiff > 0 ? C.gold : C.neutral },
                  ]}
                >
                  {cashDiff === 0
                    ? t.stall.cashMatches.toUpperCase()
                    : cashDiff > 0
                    ? t.stall.overBy.replace('{currency}', currency).replace('{amount}', Math.abs(cashDiff).toFixed(2)).toUpperCase()
                    : t.stall.shortBy.replace('{currency}', currency).replace('{amount}', Math.abs(cashDiff).toFixed(2)).toUpperCase()}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* ─── Money out — optional expenses, ledger rows ─── */}
        <View style={[styles.sectionCard, neu.raisedSoft]}>
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

        {/* ─── What you kept — receipt lines, only when costs exist ─── */}
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
            <View style={styles.netRule} />
            <View style={styles.netRow}>
              <Text style={styles.netKeptLabel}>{t.stall.keptRow}</Text>
              <Text style={styles.netKeptValue}>{econ.keptIsApprox ? '~' : ''}{currency} {econ.kept.toFixed(2)}</Text>
            </View>
            {econ.keptIsApprox && (
              <Text style={{ fontSize: 11, color: C.textMuted, textAlign: 'right', marginTop: 4, fontStyle: 'italic' }}>
                {t.stall.keptApproxNote}
              </Text>
            )}
          </View>
        )}

        {/* ─── Condition — rubber-stamp picker ─── */}
        <View style={styles.conditionSection}>
          <Text style={styles.inputLabel}>{t.stall.howWasIt}</Text>
          <View style={styles.conditionWrap}>
            {CONDITIONS.map((cond) => {
              const isSelected = selectedCondition === cond.value;
              return (
                <TouchableOpacity
                  key={cond.value}
                  style={[
                    styles.conditionStamp,
                    isSelected
                      ? { backgroundColor: C.bronze, borderColor: C.bronze, transform: [{ rotate: '0deg' }] }
                      : { borderColor: withAlpha(C.textSecondary, 0.45) },
                  ]}
                  onPress={() => {
                    lightTap();
                    setSelectedCondition(isSelected ? undefined : cond.value);
                  }}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Condition: ${cond.label}`}
                  accessibilityState={{ selected: isSelected }}
                >
                  <Feather
                    name={cond.icon as keyof typeof Feather.glyphMap}
                    size={13}
                    color={isSelected ? '#FFFFFF' : C.textSecondary}
                  />
                  <Text
                    style={[
                      styles.conditionStampText,
                      { color: isSelected ? '#FFFFFF' : C.textSecondary },
                    ]}
                  >
                    {cond.label.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
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

        {/* ─── Close CTA — solid bronze, spring press ─── */}
        <Reanimated.View style={ctaAStyle}>
          <Pressable
            onPressIn={() => { ctaScale.value = withSpring(0.97, SPRING); }}
            onPressOut={() => { ctaScale.value = withSpring(1, SPRING); }}
            onPress={() => { lightTap(); guardedClose(); }}
            accessibilityRole="button"
            accessibilityLabel="Close this selling session"
            style={[styles.closeCta, { backgroundColor: C.bronze }]}
          >
            <Feather name="check" size={18} color="#FFFFFF" />
            <Text style={styles.closeCtaText}>{t.stall.closeSessionButton}</Text>
          </Pressable>
        </Reanimated.View>
      </KeyboardAwareScrollView>
    </View>
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
    marginBottom: SPACING.xs,
  },
  headingSub: {
    ...TYPE.muted,
    color: C.textSecondary,
    marginBottom: SPACING.xl,
  },

  // ─── Wind-down hero: soft neu card, bronze number, calm rhythm ───
  heroCard: {
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textMuted,
    letterSpacing: 1.4,
    marginBottom: SPACING.xs,
  },
  heroAmount: {
    fontSize: 52,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.bronze,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: SPACING.sm,
  },
  heroStatText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
  },

  // ─── Sections ──────────────────────────────────────────
  sectionCard: {
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  sectionHint: {
    ...TYPE.muted,
    marginTop: -SPACING.xs,
    marginBottom: SPACING.md,
  },
  inputLabel: {
    ...TYPE.label,
    marginBottom: SPACING.sm,
  },
  cashField: {
    marginBottom: SPACING.sm,
  },
  expectedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    marginBottom: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
  },
  expectedLabel: {
    ...TYPE.muted,
  },
  expectedValue: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  // ─── Diff stamp (matched / over / short) ───────────────
  diffRow: {
    alignItems: 'flex-start',
    marginTop: SPACING.sm,
  },
  diffStamp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    transform: [{ rotate: '-2deg' }],
  },
  diffStampText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    letterSpacing: 1.1,
    fontVariant: ['tabular-nums'],
  },

  // ─── Money out ─────────────────────────────────────────
  amountCurrency: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
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

  // ─── Kept (receipt lines) ──────────────────────────────
  netCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  netRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginVertical: SPACING.xs,
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

  // ─── Condition stamps ──────────────────────────────────
  conditionSection: {
    marginBottom: SPACING.xl,
  },
  conditionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  conditionStamp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minHeight: 40,
    transform: [{ rotate: '-2deg' }],
  },
  conditionStampText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    letterSpacing: 1.1,
  },

  // ─── Note ──────────────────────────────────────────────
  noteSection: {
    marginBottom: SPACING.xl,
  },

  // ─── Close CTA ─────────────────────────────────────────
  closeCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.lg,
    minHeight: 56,
  },
  closeCtaText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: '#FFFFFF',
  },

  // ─── Empty state ───────────────────────────────────────
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
