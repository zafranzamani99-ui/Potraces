import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import {
  format,
  startOfMonth,
  endOfMonth,
  getDay,
  getDaysInMonth,
  isValid,
} from 'date-fns';

import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useCategories } from '../../hooks/useCategories';
import {
  realTxns,
  inRange,
  cashFlow,
  getRange,
  wellnessScore,
  safeToSpend,
  monthEndOutlook,
  upcomingBills,
  unusualSpend,
  WellnessComponent,
} from '../../utils/insights';
import Card from '../../components/common/Card';
import ScreenGuide from '../../components/common/ScreenGuide';
import EmptyState from '../../components/common/EmptyState';
import CircularProgress from '../../components/common/CircularProgress';
import HalfGauge from '../../components/common/HalfGauge';
import AnimatedNumber from '../../components/common/AnimatedNumber';

const getWellnessLabel = (score: number, pulse: any): string => {
  if (score >= 80) return pulse.feelingGood;
  if (score >= 60) return pulse.steadyGround;
  if (score >= 40) return pulse.buildingUp;
  if (score >= 20) return pulse.justStarting;
  return pulse.findingRhythm;
};

const FinancialPulse: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation<any>();
  const { width: winW } = useWindowDimensions();
  const gaugeSize = Math.min(winW - SPACING['2xl'] * 2 - SPACING['2xl'], 240);

  const transactions = usePersonalStore((s) => s.transactions);
  const subscriptions = usePersonalStore((s) => s.subscriptions);
  const budgets = usePersonalStore((s) => s.budgets);
  const goals = usePersonalStore((s) => s.goals);
  const currency = useSettingsStore((state) => state.currency);
  const expenseCategories = useCategories('expense');

  const [focusKey, setFocusKey] = useState(0);
  // Refresh date-derived bounds only when the calendar day actually changes
  // (e.g. app left open past midnight / into a new month). Re-running the full
  // analytics cascade on every focus blocks the JS thread right when the user
  // tries to scroll, so guard it. (scroll-responsiveness fix)
  const lastFocusDay = useRef(new Date().toDateString());
  useFocusEffect(
    useCallback(() => {
      const today = new Date().toDateString();
      if (today !== lastFocusDay.current) {
        lastFocusDay.current = today;
        setFocusKey((k) => k + 1);
      }
    }, [])
  );

  const dateBounds = useMemo(() => {
    const now = new Date();
    return {
      now,
      monthStart: startOfMonth(now),
      monthEnd: endOfMonth(now),
      dayOfMonth: now.getDate(),
      daysInCurrentMonth: getDaysInMonth(now),
    };
  }, [focusKey]);
  const { now, monthStart, monthEnd, dayOfMonth, daysInCurrentMonth } = dateBounds;

  const thisMonth = useMemo(
    () => inRange(realTxns(transactions), { start: monthStart, end: monthEnd }),
    [transactions, monthStart, monthEnd]
  );
  const cf = useMemo(() => cashFlow(transactions, getRange('this_month', now)), [transactions, now]);

  const money0 = (n: number) =>
    n.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const money2 = (n: number) =>
    n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Wellness + breakdown.
  const wellness = useMemo(
    () =>
      wellnessScore({
        txnsThisMonth: thisMonth,
        budgets,
        goals,
        income: cf.cameIn,
        expenses: cf.wentOut,
        dayOfMonth,
      }),
    [thisMonth, budgets, goals, cf, dayOfMonth]
  );
  const wellnessColor =
    wellness.score >= 70 ? C.positive : wellness.score >= 40 ? C.accent : C.neutral;
  const compLabel = (key: WellnessComponent['key']) =>
    ({
      budget: t.pulse.compBudget,
      savings: t.pulse.compSavings,
      consistency: t.pulse.compConsistency,
      goals: t.pulse.compGoals,
    }[key]);

  // Count-up the wellness score on mount (seed 0 → score).
  const [scoreVal, setScoreVal] = useState(0);
  useEffect(() => setScoreVal(wellness.score), [wellness.score]);

  // Forward forecasts.
  const sts = useMemo(() => safeToSpend(transactions, budgets, now), [transactions, budgets, now]);
  const outlook = useMemo(() => monthEndOutlook(transactions, subscriptions, now), [transactions, subscriptions, now]);
  const bills = useMemo(() => upcomingBills(subscriptions, 30, now), [subscriptions, now]);
  const unusual = useMemo(() => unusualSpend(transactions, expenseCategories, now), [transactions, expenseCategories, now]);

  // Gauge fill = how much of money-in is being kept so far.
  const pacePct = cf.cameIn > 0 ? Math.max(0, Math.min((outlook.keptSoFar / cf.cameIn) * 100, 100)) : 0;
  const gaugeGradient: [string, string] =
    outlook.tone === 'snug' ? [C.bronze, C.bronze] : [C.accent, C.bronze];

  // No-spend streak (behavioural).
  const streakData = useMemo(() => {
    const daysElapsed = dayOfMonth;
    const expenseDaysSet = new Set<string>();
    thisMonth
      .filter((tx) => tx.type === 'expense')
      .forEach((tx) => {
        if (isValid(tx.date)) expenseDaysSet.add(format(tx.date, 'yyyy-MM-dd'));
      });
    const noSpendDays = daysElapsed - expenseDaysSet.size;
    let currentStreak = 0;
    for (let i = 0; i < daysElapsed; i++) {
      const checkDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      if (!expenseDaysSet.has(format(checkDate, 'yyyy-MM-dd'))) currentStreak++;
      else break;
    }
    let bestStreak = 0;
    let tempStreak = 0;
    for (let d = 1; d <= daysElapsed; d++) {
      const checkDate = new Date(now.getFullYear(), now.getMonth(), d);
      if (!expenseDaysSet.has(format(checkDate, 'yyyy-MM-dd'))) {
        tempStreak++;
        bestStreak = Math.max(bestStreak, tempStreak);
      } else tempStreak = 0;
    }
    return { currentStreak, bestStreak, noSpendDays, daysElapsed };
  }, [thisMonth, dayOfMonth, now]);

  // Weekly pattern (behavioural).
  const weeklyPattern = useMemo(() => {
    const dayTotals = [0, 0, 0, 0, 0, 0, 0];
    thisMonth
      .filter((tx) => tx.type === 'expense')
      .forEach((tx) => {
        dayTotals[getDay(tx.date)] += tx.amount;
      });
    const ordered = [
      { label: 'Mon', amount: dayTotals[1] },
      { label: 'Tue', amount: dayTotals[2] },
      { label: 'Wed', amount: dayTotals[3] },
      { label: 'Thu', amount: dayTotals[4] },
      { label: 'Fri', amount: dayTotals[5] },
      { label: 'Sat', amount: dayTotals[6] },
      { label: 'Sun', amount: dayTotals[0] },
    ];
    const maxAmount = Math.max(...ordered.map((d) => d.amount), 1);
    const heaviestIndex = ordered.reduce(
      (maxIdx, d, idx, arr) => (d.amount > arr[maxIdx].amount ? idx : maxIdx),
      0
    );
    return { days: ordered, maxAmount, heaviestIndex };
  }, [thisMonth]);

  const safeLine =
    sts.perDay !== null
      ? `${currency} ${money0(Math.floor(sts.perDay))} ${t.pulse.perDay} — ${t.pulse.comfortableRest}`
      : t.pulse.setBudgetForDaily;
  const outlookLine = !outlook.confident
    ? t.pulse.tooEarly
    : outlook.tone === 'comfortable'
    ? `${t.pulse.onTrackAround} ${currency} ${money0(Math.max(outlook.projectedKept, 0))}`
    : t.pulse.snugMonthEnd;

  if (transactions.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="i/pulse"
          title={t.pulse.notEnoughData}
          message={t.pulse.addFewTransactions}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
      >
        {/* ── HERO: wellness ring + safe-to-spend ────────────── */}
        <View style={styles.heroCard}>
          <LinearGradient
            colors={[withAlpha(wellnessColor, 0.07), withAlpha(C.surface, 0)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          <View style={styles.ringWrap}>
            <CircularProgress
              size={128}
              strokeWidth={10}
              percentage={wellness.score}
              color={wellnessColor}
              trackColor={withAlpha(wellnessColor, 0.15)}
            >
              <View style={styles.ringCenter}>
                <AnimatedNumber value={scoreVal} style={StyleSheet.flatten([styles.ringNumber, { color: wellnessColor }])} />
                <Text style={styles.ringLabel}>{getWellnessLabel(wellness.score, t.pulse)}</Text>
              </View>
            </CircularProgress>
          </View>

          <Text style={styles.heroHeadline}>{safeLine}</Text>
          {sts.perDay === null && (
            <TouchableOpacity
              style={styles.heroCta}
              onPress={() => navigation.navigate('BudgetPlanning')}
              activeOpacity={0.8}
              accessibilityRole="button"
            >
              <Text style={styles.heroCtaText}>{t.pulse.setBudget}</Text>
              <Feather name="arrow-right" size={14} color={C.accent} />
            </TouchableOpacity>
          )}

          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{Math.max(daysInCurrentMonth - dayOfMonth, 0)}</Text>
              <Text style={styles.heroStatLabel}>{t.pulse.daysLeft}</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              {outlook.confident ? (
                <AnimatedNumber
                  value={outlook.projectedKept}
                  prefix={`${currency} `}
                  decimals={0}
                  style={StyleSheet.flatten([
                    styles.heroStatValue,
                    { color: outlook.projectedKept < 0 ? C.neutral : C.positive },
                  ])}
                />
              ) : (
                <Text style={styles.heroStatValue}>—</Text>
              )}
              <Text style={styles.heroStatLabel}>{t.pulse.projectedToKeep}</Text>
            </View>
          </View>
        </View>

        {/* ── WELLNESS BREAKDOWN ─────────────────────────────── */}
        <Text style={styles.sectionLabel}>{t.pulse.wellnessBreakdown}</Text>
        <Card style={styles.card}>
          {wellness.components.map((comp, idx) => (
            <View
              key={comp.key}
              style={[styles.wbRow, idx === wellness.components.length - 1 && styles.wbRowLast]}
            >
              <Text style={styles.wbLabel}>{compLabel(comp.key)}</Text>
              <View style={styles.wbBarTrack}>
                <View
                  style={[
                    styles.wbBarFill,
                    {
                      width: `${(comp.score / comp.max) * 100}%`,
                      backgroundColor: comp.score / comp.max >= 0.7 ? C.positive : withAlpha(C.accent, 0.55),
                    },
                  ]}
                />
              </View>
              <Text style={styles.wbValue}>{comp.score}/{comp.max}</Text>
            </View>
          ))}
        </Card>

        {/* ── MONTH-END OUTLOOK (gauge) ──────────────────────── */}
        <Text style={styles.sectionLabel}>{t.pulse.monthEndOutlook}</Text>
        <Card style={styles.card}>
          {outlook.confident ? (
            <View style={styles.gaugeWrap}>
              <HalfGauge
                size={gaugeSize}
                strokeWidth={16}
                percentage={pacePct}
                color={C.accent}
                trackColor={withAlpha(C.textPrimary, 0.08)}
                gradient={gaugeGradient}
              >
                <Text
                  style={[
                    styles.gaugeNumber,
                    { color: outlook.projectedKept < 0 ? C.neutral : C.textPrimary },
                  ]}
                >
                  {currency} {money0(outlook.projectedKept)}
                </Text>
                <Text style={styles.gaugeLabel}>{outlookLine}</Text>
              </HalfGauge>
              <View style={styles.outlookStatsRow}>
                <View style={styles.outlookStat}>
                  <Text style={styles.outlookStatValue}>{currency} {money0(Math.max(outlook.keptSoFar, 0))}</Text>
                  <Text style={styles.outlookStatLabel}>{t.pulse.keptSoFar}</Text>
                </View>
                <View style={styles.outlookStatDivider} />
                <View style={styles.outlookStat}>
                  <Text style={styles.outlookStatValue}>{currency} {money0(outlook.billsToCome)}</Text>
                  <Text style={styles.outlookStatLabel}>{t.pulse.billsToCome}</Text>
                </View>
              </View>
              <Text style={styles.outlookCaption}>{t.pulse.basedOnPace}</Text>
            </View>
          ) : (
            <Text style={styles.outlookEarly}>{t.pulse.tooEarly}</Text>
          )}
        </Card>

        {/* ── UPCOMING BILLS (next 30 days) ──────────────────── */}
        {bills.items.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>{t.pulse.comingUp}</Text>
            <Card style={styles.card}>
              {bills.items.slice(0, 6).map((b) => (
                <View
                  key={b.id}
                  style={[
                    styles.billRow,
                    { borderLeftWidth: 3, borderLeftColor: withAlpha(C.accent, b.dueInDays <= 2 ? 0.6 : 0.25), paddingLeft: SPACING.md },
                  ]}
                >
                  <View style={styles.billLeft}>
                    <View style={[styles.billIconBg, { backgroundColor: withAlpha(C.accent, 0.1) }]}>
                      <Feather name="repeat" size={14} color={C.accent} />
                    </View>
                    <View style={styles.billInfo}>
                      <Text style={styles.billName} numberOfLines={1}>{b.name}</Text>
                      <Text style={styles.billDue}>
                        {b.dueInDays <= 0
                          ? t.pulse.dueToday
                          : b.dueInDays === 1
                          ? t.pulse.tomorrow
                          : `${b.dueInDays} ${t.pulse.days}`}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.billAmount}>{currency} {money2(b.amount)}</Text>
                </View>
              ))}
              <View style={styles.billFooter}>
                <Text style={styles.billFooterText}>
                  {currency} {money2(bills.total)} {t.pulse.dueInNext30Days}
                </Text>
              </View>
            </Card>
          </>
        )}

        {/* ── HEADS UP ───────────────────────────────────────── */}
        {unusual.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>{t.pulse.headsUp}</Text>
            <Card style={styles.card}>
              {unusual.map((u, idx) => (
                <View
                  key={u.categoryId}
                  style={[styles.unusualRow, idx === unusual.length - 1 && styles.unusualRowLast]}
                >
                  <Feather name="info" size={15} color={C.textMuted} />
                  <Text style={styles.unusualText}>{u.name} {t.pulse.ranHigher}</Text>
                </View>
              ))}
            </Card>
          </>
        )}

        {/* ── NO-SPEND STREAK ────────────────────────────────── */}
        <Text style={styles.sectionLabel}>{t.pulse.quietDays}</Text>
        <Card style={styles.card}>
          <View style={styles.streakRow}>
            <View style={styles.streakHero}>
              <Feather
                name={streakData.currentStreak > 0 ? 'zap' : 'sun'}
                size={20}
                color={streakData.currentStreak > 0 ? C.accent : C.neutral}
              />
              <Text style={styles.streakNumber}>{streakData.currentStreak}</Text>
              <Text style={styles.streakUnit}>
                {streakData.currentStreak === 1 ? t.pulse.day : t.pulse.days} {t.pulse.currentStreak}
              </Text>
            </View>
          </View>
          <View style={styles.streakStatsRow}>
            <View style={styles.streakStat}>
              <Text style={styles.streakStatValue}>{streakData.bestStreak}</Text>
              <Text style={styles.streakStatLabel}>{t.pulse.bestStreak}</Text>
            </View>
            <View style={styles.streakDivider} />
            <View style={styles.streakStat}>
              <Text style={styles.streakStatValue}>{streakData.noSpendDays}</Text>
              <Text style={styles.streakStatLabel}>{t.pulse.quietDays} / {streakData.daysElapsed}</Text>
            </View>
          </View>
        </Card>

        {/* ── WEEKLY PATTERN ─────────────────────────────────── */}
        <Text style={styles.sectionLabel}>{t.pulse.yourWeek}</Text>
        <Card style={styles.card}>
          <View style={styles.weeklyChart}>
            {weeklyPattern.days.map((day, idx) => {
              const barHeight =
                weeklyPattern.maxAmount > 0 ? (day.amount / weeklyPattern.maxAmount) * 120 : 0;
              const isHeaviest = idx === weeklyPattern.heaviestIndex && day.amount > 0;
              return (
                <View
                  key={day.label}
                  style={styles.weeklyColumn}
                  accessibilityLabel={`${day.label}: ${currency} ${day.amount.toFixed(2)}`}
                >
                  <Text style={[styles.weeklyAmount, isHeaviest && { color: C.accent, fontWeight: TYPOGRAPHY.weight.bold }]}>
                    {day.amount > 0
                      ? day.amount >= 1000
                        ? `${(day.amount / 1000).toFixed(1)}k`
                        : day.amount.toFixed(0)
                      : ''}
                  </Text>
                  <View style={styles.weeklyBarTrack}>
                    <View
                      style={[
                        styles.weeklyBar,
                        {
                          height: Math.max(barHeight, day.amount > 0 ? 4 : 0),
                          backgroundColor: isHeaviest ? C.accent : withAlpha(C.accent, 0.3),
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.weeklyLabel, isHeaviest && { color: C.accent, fontWeight: TYPOGRAPHY.weight.bold }]}>
                    {day.label}
                  </Text>
                </View>
              );
            })}
          </View>
          {weeklyPattern.days[weeklyPattern.heaviestIndex].amount > 0 && (
            <Text style={styles.weeklyInsight}>
              {weeklyPattern.days[weeklyPattern.heaviestIndex].label}s {t.pulse.heaviestDay}
            </Text>
          )}
        </Card>

        <View style={{ height: SPACING['3xl'] }} />
      </ScrollView>
      <ScreenGuide
        id="guide_pulse"
        title={t.guide.yourMoneyHealth}
        icon="activity"
        description={t.guide.descPulse}
        accent="#A688B8"
        points={[
          { icon: 'activity', text: t.guide.pulsePoint1 },
          { icon: 'trending-up', text: t.guide.pulsePoint2 },
        ]}
      />
    </View>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    scrollView: { flex: 1 },
    scrollContent: { padding: SPACING['2xl'] },

    sectionLabel: {
      fontSize: TYPE.label.fontSize,
      color: C.textMuted,
      textTransform: TYPE.label.textTransform,
      letterSpacing: TYPE.label.letterSpacing,
      marginTop: SPACING.xl,
      marginBottom: SPACING.sm,
    },
    card: { marginBottom: SPACING.xs },

    // Hero
    heroCard: {
      backgroundColor: C.surface,
      borderRadius: RADIUS.xl,
      padding: SPACING.xl,
      marginBottom: SPACING.xs,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
      alignItems: 'center',
    },
    ringWrap: { marginBottom: SPACING.lg },
    ringCenter: { alignItems: 'center' },
    ringNumber: {
      fontSize: 32,
      fontWeight: TYPOGRAPHY.weight.bold,
      fontVariant: ['tabular-nums'],
    },
    ringLabel: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textSecondary,
      marginTop: 2,
      textTransform: 'lowercase',
    },
    heroHeadline: {
      fontSize: TYPOGRAPHY.size.lg,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      lineHeight: TYPOGRAPHY.size.lg * 1.35,
      textAlign: 'center',
    },
    heroCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      marginTop: SPACING.md,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      borderRadius: RADIUS.full,
      borderWidth: 1,
      borderColor: C.accent,
      backgroundColor: withAlpha(C.accent, 0.08),
    },
    heroCtaText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.accent },
    heroStats: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'stretch',
      paddingTop: SPACING.lg,
      marginTop: SPACING.lg,
      borderTopWidth: 1,
      borderTopColor: C.border,
    },
    heroStat: { flex: 1, alignItems: 'center', gap: SPACING.xs },
    heroStatValue: {
      fontSize: TYPOGRAPHY.size.lg,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    heroStatLabel: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      textAlign: 'center',
    },
    heroStatDivider: { width: 1, height: 32, backgroundColor: C.border },

    // Wellness breakdown
    wbRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.sm,
      gap: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    wbRowLast: { borderBottomWidth: 0 },
    wbLabel: { fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary, width: 110 },
    wbBarTrack: {
      flex: 1,
      height: 8,
      backgroundColor: C.border,
      borderRadius: RADIUS.full,
      overflow: 'hidden',
    },
    wbBarFill: { height: 8, borderRadius: RADIUS.full },
    wbValue: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textSecondary,
      fontVariant: ['tabular-nums'],
      width: 44,
      textAlign: 'right',
    },

    // Month-end outlook gauge
    gaugeWrap: { alignItems: 'center' },
    gaugeNumber: {
      fontSize: TYPE.balance.fontSize,
      fontWeight: TYPOGRAPHY.weight.bold,
      fontVariant: ['tabular-nums'],
    },
    gaugeLabel: {
      fontSize: TYPE.insight.fontSize,
      lineHeight: TYPE.insight.lineHeight,
      color: C.textSecondary,
      textAlign: 'center',
      marginTop: SPACING.xs,
      paddingHorizontal: SPACING.md,
    },
    outlookStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'stretch',
      paddingTop: SPACING.md,
      marginTop: SPACING.lg,
      borderTopWidth: 1,
      borderTopColor: C.border,
    },
    outlookStat: { flex: 1, alignItems: 'center', gap: SPACING.xs },
    outlookStatValue: {
      fontSize: TYPOGRAPHY.size.lg,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    outlookStatLabel: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      textAlign: 'center',
    },
    outlookStatDivider: { width: 1, height: 36, backgroundColor: C.border },
    outlookCaption: {
      fontSize: TYPE.insight.fontSize,
      lineHeight: TYPE.insight.lineHeight,
      color: C.textMuted,
      marginTop: SPACING.md,
      textAlign: 'center',
    },
    outlookEarly: {
      fontSize: TYPOGRAPHY.size.lg,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      lineHeight: TYPOGRAPHY.size.lg * 1.35,
    },

    // Upcoming bills
    billRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    billLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: SPACING.md },
    billIconBg: {
      width: 32,
      height: 32,
      borderRadius: RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    billInfo: { flex: 1 },
    billName: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary },
    billDue: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary, marginTop: SPACING.xs },
    billAmount: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    billFooter: { paddingTop: SPACING.md, marginTop: SPACING.xs },
    billFooterText: {
      fontSize: TYPE.insight.fontSize,
      lineHeight: TYPE.insight.lineHeight,
      color: C.textSecondary,
      textAlign: 'center',
    },

    // Heads up
    unusualRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.sm,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    unusualRowLast: { borderBottomWidth: 0 },
    unusualText: {
      fontSize: TYPE.insight.fontSize,
      lineHeight: TYPE.insight.lineHeight,
      color: C.textSecondary,
      flex: 1,
    },

    // No-spend streak
    streakRow: { alignItems: 'center', marginBottom: SPACING.lg },
    streakHero: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    streakNumber: {
      fontSize: TYPOGRAPHY.size['3xl'],
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    streakUnit: {
      fontSize: TYPE.insight.fontSize,
      lineHeight: TYPE.insight.lineHeight,
      color: C.textSecondary,
    },
    streakStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: C.border,
    },
    streakStat: { flex: 1, alignItems: 'center' },
    streakStatValue: {
      fontSize: TYPOGRAPHY.size.xl,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'],
      marginBottom: SPACING.xs,
    },
    streakStatLabel: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary, textAlign: 'center' },
    streakDivider: { width: 1, height: 36, backgroundColor: C.border, marginHorizontal: SPACING.lg },

    // Weekly pattern
    weeklyChart: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      height: 170,
      paddingTop: SPACING.lg,
    },
    weeklyColumn: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
    weeklyAmount: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textSecondary,
      fontVariant: ['tabular-nums'],
      marginBottom: SPACING.xs,
    },
    weeklyBarTrack: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', width: '100%' },
    weeklyBar: {
      width: '55%',
      minWidth: 12,
      borderTopLeftRadius: RADIUS.sm,
      borderTopRightRadius: RADIUS.sm,
    },
    weeklyLabel: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary, marginTop: SPACING.sm },
    weeklyInsight: {
      fontSize: TYPE.insight.fontSize,
      lineHeight: TYPE.insight.lineHeight,
      color: C.textSecondary,
      textAlign: 'center',
      marginTop: SPACING.lg,
    },
  });

export default FinancialPulse;
