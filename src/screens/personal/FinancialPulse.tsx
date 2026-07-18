// ─────────────────────────────────────────────────────────────
// FinancialPulse — "your money's vitals" (v2 flagship redesign).
//
// The pulse metaphor, taken seriously: one big score (WHOOP-style) with a
// live ECG trace, tappable contributor bars vs your own baselines (Oura),
// a recovery-sized daily safe-to-spend (strain target), a scrubbable
// month-pace chart (Copilot), a 14-day bills runway checked against real
// wallet money, savings runway + debt momentum, and a calm heads-up feed.
// All math lives in utils/pulseMath.ts (pure + tested). Forward-looking
// only — Reports owns the backward/comparative story.
// ─────────────────────────────────────────────────────────────
import React, { useEffect, useMemo, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, useWindowDimensions } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import Reanimated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { format, getDaysInMonth, startOfMonth, subDays } from 'date-fns';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useWalletStore } from '../../store/walletStore';
import { useDebtStore } from '../../store/debtStore';
import { useSavingsStore } from '../../store/savingsStore';
import { useBudgetProfileStore } from '../../store/budgetProfileStore';
import { usePremiumStore } from '../../store/premiumStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useNeu } from '../../components/common/neu';
import { useT } from '../../i18n';
import { useCategories } from '../../hooks/useCategories';
import { lightTap } from '../../services/haptics';
import { realTxns, scopeTxns, getRange } from '../../utils/insights';
import {
  expandBills,
  liquidBalance,
  billsCoverage,
  typicalMonthlySpend,
  baselineDailySpend,
  last14DailySpend,
  safeToday,
  monthCurve,
  pulseScore,
  debtPulse,
  streakData,
  unusualSpendProrated,
  PulseComponent,
  PulseBand,
} from '../../utils/pulseMath';
import EmptyState from '../../components/common/EmptyState';
import ScreenGuide from '../../components/common/ScreenGuide';
import AnimatedNumber from '../../components/common/AnimatedNumber';
import PulseWave from '../../components/pulse/PulseWave';
import PulseScrubChart from '../../components/pulse/PulseScrubChart';
import EchoFab from '../../components/wallet/EchoFab';
import EchoInlineChat, { EchoChip } from '../../components/common/EchoInlineChat';
import PaywallModal from '../../components/common/PaywallModal';
import { useEchoFabPan } from '../../hooks/useEchoFabPan';
import { classifyAccounts, emergencyRunway } from './savings/savingsMath';

const RUNWAY_CAP = 24; // beyond this "24+" — the number stops being informative

const FinancialPulse: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const neu = useNeu(undefined, { faintDark: true }); // Onyx: borderless #121212 + soft neu lift
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation<any>();
  const isFocused = useIsFocused(); // ambient loops pause while covered — screens stay mounted in the stack
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const contentW = Math.min(winW, 680) - SPACING['2xl'] * 2;
  const chartW = contentW - SPACING.lg * 2;

  // ── Stores ──
  const transactions = usePersonalStore((s) => s.transactions);
  const subscriptions = usePersonalStore((s) => s.subscriptions);
  const budgets = usePersonalStore((s) => s.budgets);
  const goals = usePersonalStore((s) => s.goals);
  const wallets = useWalletStore((s) => s.wallets);
  const debts = useDebtStore((s) => s.debts);
  const savingsAccounts = useSavingsStore((s) => s.accounts);
  const takeHome = useBudgetProfileStore((s) => s.takeHome);
  const currency = useSettingsStore((s) => s.currency);
  const tier = usePremiumStore((s) => s.tier);
  const expenseCategories = useCategories('expense');

  // ── Day-rollover guard (keep: recomputing the cascade on every focus
  // blocks the JS thread mid-scroll; only a calendar-day change matters) ──
  const [focusKey, setFocusKey] = useState(0);
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
  const now = useMemo(() => new Date(), [focusKey]);
  const daysInMonth = getDaysInMonth(now);
  const dayOfMonth = now.getDate();

  // While covered by a pushed screen, hold the ledger snapshot still — the
  // analytics cascade below must not re-run for background store writes.
  // Refocusing re-renders (isFocused flips), picks up the live array, and
  // recomputes once.
  const frozenTxns = useRef(transactions);
  if (isFocused) frozenTxns.current = transactions;
  const txns = frozenTxns.current;

  // ── Money formatting ──
  const money0 = (n: number) =>
    n.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmt = useCallback(
    (n: number) => `${currency} ${money0(Math.round(n))}`,
    [currency]
  );

  // ── Math cascade (scope the ledger ONCE, derive everything from slices) ──
  const scopedMonth = useMemo(
    () => scopeTxns(txns, getRange('this_month', now)),
    [txns, now]
  );
  const bills14 = useMemo(() => expandBills(subscriptions, 13, now), [subscriptions, now]);
  const restOfMonthBills = useMemo(
    () => expandBills(subscriptions, daysInMonth - dayOfMonth, now),
    [subscriptions, daysInMonth, dayOfMonth, now]
  );
  const typicalSpend = useMemo(() => typicalMonthlySpend(txns, now), [txns, now]);
  const baselineDaily = useMemo(() => baselineDailySpend(txns, now), [txns, now]);
  const last14Daily = useMemo(() => last14DailySpend(txns, now), [txns, now]);

  const score = useMemo(
    () =>
      pulseScore({
        scopedMonth,
        budgets,
        goals,
        wallets,
        bills14,
        takeHome,
        baselineDaily,
        last14Daily,
        now,
      }),
    [scopedMonth, budgets, goals, wallets, bills14, takeHome, baselineDaily, last14Daily, now]
  );

  // Score a week ago — the delta chip's other half. Wallet/goal state can't be
  // rewound, so those components are held at today's values; the txn-driven
  // components (budget, saving, rhythm) are genuinely recomputed at now−7d.
  const weekDelta = useMemo(() => {
    const real = realTxns(txns);
    if (real.length < 5) return null;
    let earliest = Infinity;
    for (const tx of real) {
      const d = tx.date instanceof Date ? tx.date : new Date(tx.date);
      const ms = d.getTime();
      if (!Number.isNaN(ms) && ms < earliest) earliest = ms;
    }
    const weekAgo = subDays(now, 7);
    if (!Number.isFinite(earliest) || earliest > weekAgo.getTime()) return null;
    const prev = pulseScore({
      scopedMonth: scopeTxns(txns, { start: startOfMonth(weekAgo), end: weekAgo }),
      budgets,
      goals,
      wallets,
      bills14,
      takeHome,
      baselineDaily: baselineDailySpend(txns, weekAgo),
      last14Daily: last14DailySpend(txns, weekAgo),
      now: weekAgo,
    });
    return score.score - prev.score;
  }, [txns, budgets, goals, wallets, bills14, takeHome, score.score, now]);

  const safe = useMemo(
    () => safeToday({ scopedMonth, budgets, restOfMonthBills, takeHome, now }),
    [scopedMonth, budgets, restOfMonthBills, takeHome, now]
  );
  const curve = useMemo(
    () => monthCurve({ scopedMonth, budgets, typicalSpend, now }),
    [scopedMonth, budgets, typicalSpend, now]
  );
  const coverage = useMemo(
    () => billsCoverage(liquidBalance(wallets), bills14),
    [wallets, bills14]
  );
  const debt = useMemo(() => debtPulse(debts, now), [debts, now]);
  const runway = useMemo(() => {
    if (savingsAccounts.length === 0) return null;
    const { savings } = classifyAccounts(savingsAccounts);
    const savingsValue = savings.reduce((s, a) => s + a.currentValue, 0);
    const avgSpend =
      typicalSpend ??
      (dayOfMonth >= 7 && curve.spentSoFar > 0 ? (curve.spentSoFar / dayOfMonth) * daysInMonth : 0);
    if (avgSpend <= 0) return null;
    return emergencyRunway(savingsValue, avgSpend);
  }, [savingsAccounts, typicalSpend, curve.spentSoFar, dayOfMonth, daysInMonth]);
  const unusual = useMemo(
    () => unusualSpendProrated(txns, expenseCategories, now),
    [txns, expenseCategories, now]
  );
  const streak = useMemo(() => streakData(scopedMonth, now), [scopedMonth, now]);

  // ── Presentation helpers ──
  // gold/lavender fail AA as TEXT on the light background (~2:1) — swap in
  // measured text-safe variants there. Decorative fills keep the raw tokens.
  const goldText = isDark ? C.gold : '#8E6610';
  const lavenderText = isDark ? C.lavender : '#6E6776';
  const bandColor = (band: PulseBand): string =>
    band === 'good' || band === 'steady'
      ? C.accent
      : band === 'building'
      ? goldText
      : band === 'starting'
      ? C.bronze
      : lavenderText;
  const scoreColor = bandColor(score.band);
  const bandLabel: Record<PulseBand, string> = {
    good: t.pulse.feelingGood,
    steady: t.pulse.steadyGround,
    building: t.pulse.buildingUp,
    starting: t.pulse.justStarting,
    finding: t.pulse.findingRhythm,
  };
  const compLabel: Record<PulseComponent['key'], string> = {
    budget: t.pulse.compBudget,
    saving: t.pulse.compSavings,
    bills: t.pulse.compBills,
    rhythm: t.pulse.compRhythm,
    goals: t.pulse.compGoals,
  };
  const compBandWord = (c: PulseComponent): string =>
    c.neutral
      ? t.pulse.neutralTag
      : c.band === 'strong'
      ? t.pulse.bandStrong
      : c.band === 'steady'
      ? t.pulse.bandSteady
      : c.band === 'fair'
      ? t.pulse.bandFair
      : t.pulse.bandAttention;
  const compColor = (c: PulseComponent): string =>
    c.neutral
      ? C.textMuted
      : c.band === 'strong' || c.band === 'steady'
      ? C.accent
      : c.band === 'fair'
      ? goldText
      : C.overdue;
  const compRoute: Record<PulseComponent['key'], () => void> = useMemo(
    () => ({
      budget: () => navigation.navigate('BudgetPlanning'),
      saving: () => navigation.navigate('PersonalReports'),
      bills: () => navigation.navigate('SubscriptionList'),
      rhythm: () =>
        navigation.navigate('TransactionsList', { filterDateRange: 'this_month' }),
      goals: () => navigation.navigate('Goals'),
    }),
    [navigation]
  );

  // Count-up seed (0 → score on mount / score change)
  const [scoreVal, setScoreVal] = useState(0);
  useEffect(() => setScoreVal(score.score), [score.score]);

  const [showBehind, setShowBehind] = useState(false);
  const [scrollLocked, setScrollLocked] = useState(false);
  const [selBillDay, setSelBillDay] = useState<number | null>(null);

  // ── 14-day bills strip data ──
  const billDays = useMemo(() => {
    const per = new Array<number>(14).fill(0);
    for (const b of bills14.items) {
      if (b.dueInDays >= 0 && b.dueInDays < 14) per[b.dueInDays] += b.amount;
    }
    const max = Math.max(...per, 1);
    return { per, max };
  }, [bills14]);
  // Stable identities — PulseScrubChart is React.memo'd so the mid-scrub
  // scroll-lock state change must not hand it fresh props.
  const chartDayLabel = useCallback(
    (d: number) => format(new Date(now.getFullYear(), now.getMonth(), d), 'd MMM'),
    [now]
  );
  const chartPaceDiffLabel = useCallback(
    (diff: number) =>
      (diff >= 0 ? t.pulse.paceUnder : t.pulse.paceOver).replace('{x}', fmt(Math.abs(diff))),
    [t, fmt]
  );
  // Idle glance: what's out + where the month is landing; second line = today's
  // position vs the dotted line. Stable strings so the memo'd chart stays put.
  const chartIdle = useMemo(() => {
    let main = t.pulse.outSoFar.replace('{x}', fmt(curve.spentSoFar));
    if (curve.confident) main += ` · ${t.pulse.headingFor.replace('{x}', fmt(curve.projectedOut))}`;
    const diffToday =
      curve.paceTotal !== null ? (curve.paceTotal * curve.cums.length) / daysInMonth - curve.spentSoFar : null;
    return {
      main,
      sub: diffToday !== null ? chartPaceDiffLabel(diffToday) : null,
      subColor: diffToday !== null && diffToday >= 0 ? C.accent : C.bronze,
    };
  }, [t, fmt, curve, daysInMonth, chartPaceDiffLabel, C]);

  const billDayLabel = useCallback(
    (inDays: number): string =>
      inDays <= 0
        ? t.pulse.dueToday
        : inDays === 1
        ? t.pulse.tomorrow
        : format(subDays(now, -inDays), 'EEE d MMM'),
    [t, now]
  );

  // ── Echo (pattern B: in-screen FAB + inline chat, real tier gate) ──
  const echoHidden = useSettingsStore((s) => s.pulseEchoHidden);
  const setEchoHidden = useSettingsStore((s) => s.setPulseEchoHidden);
  const [echoOpen, setEchoOpen] = useState(false);
  const [echoAutoPrompt, setEchoAutoPrompt] = useState<string | undefined>(undefined);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [greetingDismissed, setGreetingDismissed] = useState(false);
  const [greetingHiddenDuringDrag, setGreetingHiddenDuringDrag] = useState(false);
  const [fabSide, setFabSide] = useState<'left' | 'right'>('right');
  const { echoFabPan, echoFabPanResponder, hideZoneAnim, hideZoneHoverAnim, fabScale, hideZoneRef } =
    useEchoFabPan({
      fabSide,
      setFabSide,
      setGreetingHiddenDuringDrag,
      onHide: () => setEchoHidden(true),
      insets,
    });
  useFocusEffect(useCallback(() => { setGreetingDismissed(false); }, []));

  const pulseChips: EchoChip[] = useMemo(
    () => [
      { label: t.pulse.chipDoing, question: t.pulse.chipDoingQ },
      { label: t.pulse.chipWatch, question: t.pulse.chipWatchQ },
      { label: t.pulse.chipTrim, question: t.pulse.chipTrimQ },
      { label: t.pulse.chipBillsReady, question: t.pulse.chipBillsReadyQ },
    ],
    [t]
  );

  // The greeting leads with the day's "one big thing" (Oura's Today rule).
  const greeting = useMemo(() => {
    if (!coverage.covered && wallets.length > 0)
      return {
        text: t.pulse.walletsShortBy
          .replace('{x}', fmt(coverage.shortBy))
          .replace('{day}', billDayLabel(coverage.shortOnDay ?? 0)),
        prompt: t.pulse.chipBillsReadyQ,
      };
    if (unusual.length > 0)
      return {
        text: t.pulse.runningWarm.replace('{cat}', unusual[0].name),
        prompt: t.pulse.chipWatchQ,
      };
    return { text: t.pulse.echoGreetingPulse, prompt: undefined as string | undefined };
  }, [coverage, wallets.length, unusual, t, fmt, billDayLabel]);

  const contextSnapshot = useMemo(() => {
    const comp = score.components
      .map((c) => `${c.key} ${c.score}/${c.max}${c.neutral ? ' (no data)' : ''}`)
      .join(', ');
    const lines = [
      `PULSE SNAPSHOT — day ${dayOfMonth} of ${daysInMonth}`,
      `score: ${score.score}/100 (${score.band}) — ${comp}`,
      safe.perDay !== null
        ? `today: ~${fmt(safe.perDay)} feels safe (basis: ${safe.basis}), spent ${fmt(safe.spentToday)} so far today`
        : `today: no daily safe number yet (no budget/income logged)`,
      `month: spent ${fmt(curve.spentSoFar)} so far${curve.confident ? `, heading for ~${fmt(curve.projectedOut)}` : ''}${curve.paceTotal !== null ? `, pace line ${fmt(curve.paceTotal)} (${curve.paceBasis})` : ''}`,
      `bills next 14 days: ${fmt(bills14.total)} across ${bills14.items.length} charge(s); liquid wallets ${fmt(coverage.liquid)}${coverage.covered ? ' — covered' : ` — short ${fmt(coverage.shortBy)}`}`,
      runway
        ? `safety net: ${runway.months === Infinity ? '∞' : runway.months.toFixed(1)} months of spending saved`
        : null,
      debt.iOweOutstanding > 0 || debt.theyOweOutstanding > 0
        ? `debts: you owe ${fmt(debt.iOweOutstanding)}${debt.overdueCount > 0 ? ` (${debt.overdueCount} past due)` : ''}; owed to you ${fmt(debt.theyOweOutstanding)}`
        : null,
      unusual.length > 0
        ? `watch: ${unusual.map((u) => `${u.name} ${fmt(u.thisAmount)} vs usual ~${fmt(u.usualAmount)}/mo`).join('; ')}`
        : null,
    ].filter(Boolean);
    return lines.join('\n');
  }, [score, safe, curve, bills14, coverage, runway, debt, unusual, dayOfMonth, daysInMonth, fmt]);

  // Header: seamless (empty title) + a restore button once the FAB was
  // drag-hidden, mirroring Savings/Bills.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: echoHidden
        ? () => (
            <TouchableOpacity
              onPress={() => { lightTap(); setEchoHidden(false); }}
              style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityLabel={t.savings.askEcho}
            >
              <Feather name="zap" size={20} color={C.textMuted} />
            </TouchableOpacity>
          )
        : undefined,
    });
  }, [navigation, echoHidden, C, setEchoHidden, t]);

  // ── Empty state (transfers alone are not a pulse) ──
  const realCount = useMemo(() => realTxns(txns).length, [txns]);
  if (realCount === 0) {
    return (
      <View style={styles.container}>
        <EmptyState icon="i/pulse" title={t.pulse.notEnoughData} message={t.pulse.addFewTransactions} />
      </View>
    );
  }

  const scoreDeltaChip =
    weekDelta === null ? null : (
      <View
        style={[
          styles.deltaChip,
          { backgroundColor: withAlpha(weekDelta >= 0 ? C.accent : C.bronze, 0.14) },
        ]}
      >
        {weekDelta !== 0 && (
          <Feather
            name={weekDelta > 0 ? 'arrow-up-right' : 'arrow-down-right'}
            size={12}
            color={weekDelta > 0 ? C.accent : C.bronze}
          />
        )}
        <Text
          style={[styles.deltaChipText, { color: weekDelta >= 0 ? C.accent : C.bronze }]}
        >
          {weekDelta === 0
            ? t.pulse.deltaFlatWeek
            : (weekDelta > 0 ? t.pulse.deltaUpWeek : t.pulse.deltaDownWeek).replace(
                '{d}',
                `${weekDelta > 0 ? '+' : '−'}${Math.abs(weekDelta)}`
              )}
        </Text>
      </View>
    );

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        scrollEnabled={!scrollLocked}
      >
        {/* ── HERO — the pulse ─────────────────────────────── */}
        <Text style={styles.eyebrow}>{t.pulse.yourMoneyPulse}</Text>
        <View style={[styles.heroCard, neu.raisedSoft]}>
          <LinearGradient
            colors={[withAlpha(scoreColor, 0.08), withAlpha(C.background, 0)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          {/* The score itself toggles the breakdown; the contributor rows live
              OUTSIDE this Pressable so VoiceOver can reach each one. */}
          <Pressable
            onPress={() => { lightTap(); setShowBehind((v) => !v); }}
            accessibilityRole="button"
            accessibilityState={{ expanded: showBehind }}
            accessibilityLabel={`${t.pulse.yourMoneyPulse}: ${score.score}. ${t.pulse.wellnessBreakdown}`}
            style={styles.heroPress}
          >
          <View style={styles.heroTopRow}>
            <Text style={styles.heroDate}>{format(now, 'EEEE, d MMMM')}</Text>
            {scoreDeltaChip}
          </View>
          <View style={styles.scoreWrap}>
            <AnimatedNumber
              value={scoreVal}
              style={StyleSheet.flatten([styles.scoreNumber, { color: scoreColor }])}
            />
            <Text style={[styles.scoreBand, { color: scoreColor }]}>{bandLabel[score.band]}</Text>
          </View>
          <PulseWave
            width={chartW}
            height={54}
            color={scoreColor}
            trackColor={withAlpha(C.textPrimary, 0.1)}
            active={isFocused}
          />
          {/* Where this number sits — the "is my score okay?" answer */}
          <View style={styles.scaleWrap}>
            <View style={styles.scaleTrack}>
              {[C.lavender, C.bronze, C.gold, C.accent, C.accent].map((zc, i) => (
                <View
                  key={i}
                  style={[
                    styles.scaleSeg,
                    {
                      backgroundColor:
                        Math.min(Math.floor(score.score / 20), 4) === i ? zc : withAlpha(zc, 0.22),
                    },
                  ]}
                />
              ))}
              <View
                style={[
                  styles.scaleDot,
                  { left: `${Math.min(Math.max(score.score, 2), 98)}%`, backgroundColor: C.textPrimary },
                ]}
              />
            </View>
            <Text style={styles.scaleHint}>{t.pulse.scoreScaleHint}</Text>
          </View>
          <View style={styles.behindToggle}>
            <Text style={styles.behindToggleText}>{t.pulse.wellnessBreakdown}</Text>
            <Feather name={showBehind ? 'chevron-up' : 'chevron-down'} size={14} color={C.textMuted} />
          </View>
          </Pressable>

          {showBehind && (
            <Reanimated.View entering={FadeInDown.duration(220)} style={styles.compList}>
              {score.components.map((c) => (
                <TouchableOpacity
                  key={c.key}
                  style={styles.compRow}
                  activeOpacity={0.7}
                  onPress={() => { lightTap(); compRoute[c.key](); }}
                  accessibilityRole="button"
                  accessibilityLabel={`${compLabel[c.key]}: ${compBandWord(c)}`}
                >
                  <Text style={styles.compLabel} numberOfLines={1}>{compLabel[c.key]}</Text>
                  <View style={styles.compBarTrack}>
                    <View
                      style={[
                        styles.compBarFill,
                        {
                          width: `${Math.max((c.score / c.max) * 100, 4)}%`,
                          backgroundColor: compColor(c),
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.compBand, { color: compColor(c) }]} numberOfLines={1}>
                    {compBandWord(c)}
                  </Text>
                  <Feather name="chevron-right" size={14} color={C.textMuted} />
                </TouchableOpacity>
              ))}
            </Reanimated.View>
          )}
        </View>

        {/* ── TODAY — the daily dial ───────────────────────── */}
        <Text style={styles.sectionLabel}>{t.pulse.today}</Text>
        <Pressable
          style={[styles.card, neu.raisedSoft]}
          onPress={() => { lightTap(); navigation.navigate('BudgetPlanning'); }}
          accessibilityRole="button"
          accessibilityLabel={t.pulse.today}
        >
          <Feather name="chevron-right" size={16} color={C.textMuted} style={styles.cardChevron} />
          {safe.perDay !== null ? (
            <>
              <Text style={styles.todayHeadline}>
                {t.pulse.todayHeadline.replace('{x}', fmt(Math.floor(safe.leftToday ?? 0)))}
              </Text>
              <View style={styles.todayBarTrack}>
                <View
                  style={[
                    styles.todayBarFill,
                    {
                      width: `${Math.min((safe.spentToday / Math.max(safe.perDay, 1)) * 100, 100)}%`,
                      backgroundColor: safe.spentToday > safe.perDay ? C.overdue : C.accent,
                    },
                  ]}
                />
              </View>
              <View style={styles.todayMetaRow}>
                <Text style={styles.todayMeta}>
                  {t.pulse.todaySpentLine.replace('{x}', fmt(safe.spentToday))}
                </Text>
                <Text style={styles.todayMeta}>
                  {safe.basis === 'budget'
                    ? t.pulse.basisBudget
                    : safe.basis === 'income'
                    ? t.pulse.basisIncome
                    : t.pulse.basisPlanned}
                  {safe.billsAhead > 0 ? ` · ${t.pulse.afterBills}` : ''}
                </Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.todayEmpty}>{t.pulse.todayNoBasis}</Text>
              <TouchableOpacity
                style={styles.setBudgetCta}
                onPress={() => { lightTap(); navigation.navigate('BudgetPlanning'); }}
                activeOpacity={0.8}
                accessibilityRole="button"
              >
                <Text style={styles.setBudgetCtaText}>{t.pulse.setBudget}</Text>
                <Feather name="arrow-right" size={14} color={C.accent} />
              </TouchableOpacity>
            </>
          )}
        </Pressable>

        {/* ── THE MONTH — scrubbable pace chart ────────────── */}
        <Text style={styles.sectionLabel}>{t.pulse.monthSoFar}</Text>
        <View style={[styles.card, neu.raisedSoft]}>
          <PulseScrubChart
            width={chartW}
            height={210}
            cums={curve.cums}
            daysInMonth={daysInMonth}
            paceTotal={curve.paceTotal}
            color={C.accent}
            paceColor={C.bronze}
            labelColor={C.textMuted}
            textColor={C.textPrimary}
            idleMain={chartIdle.main}
            idleSub={chartIdle.sub}
            idleSubColor={chartIdle.subColor}
            dayLabel={chartDayLabel}
            moneyLabel={fmt}
            paceDiffLabel={chartPaceDiffLabel}
            onScrubActive={setScrollLocked}
            active={isFocused}
          />
          <TouchableOpacity
            style={styles.captionRow}
            activeOpacity={0.7}
            onPress={() => {
              lightTap();
              navigation.navigate('TransactionsList', { filterDateRange: 'this_month' });
            }}
            accessibilityRole="button"
          >
            <Text style={styles.chartCaption}>
              {curve.paceTotal !== null
                ? `${curve.paceBasis === 'budget' ? t.pulse.paceLineBudget : t.pulse.paceLineTypical} · ${t.pulse.scrubHint}`
                : t.pulse.scrubHint}
            </Text>
            <Feather name="chevron-right" size={14} color={C.textMuted} />
          </TouchableOpacity>
        </View>

        {/* ── NEXT 14 DAYS — bills runway vs real wallet money ── */}
        <Text style={styles.sectionLabel}>{t.pulse.next14Days}</Text>
        <Pressable
          style={[styles.card, neu.raisedSoft]}
          onPress={() => { lightTap(); navigation.navigate('SubscriptionList'); }}
          accessibilityRole="button"
          accessibilityLabel={t.pulse.next14Days}
        >
          <Feather name="chevron-right" size={16} color={C.textMuted} style={styles.cardChevron} />
          {bills14.items.length > 0 ? (
            <>
              <View style={styles.runwayStrip}>
                {billDays.per.map((amt, i) => {
                  const has = amt > 0;
                  const sel = selBillDay === i;
                  return (
                    <Pressable
                      key={i}
                      style={styles.runwayCol}
                      disabled={!has}
                      accessible={has}
                      hitSlop={{ top: 10, bottom: 10 }}
                      onPress={() => {
                        lightTap();
                        setSelBillDay(sel ? null : i);
                      }}
                      accessibilityRole={has ? 'button' : undefined}
                      accessibilityLabel={has ? `${billDayLabel(i)}: ${fmt(amt)}` : undefined}
                    >
                      <View style={styles.runwayBarZone}>
                        {has && (
                          <View
                            style={[
                              styles.runwayBar,
                              {
                                height: Math.max((amt / billDays.max) * 56, 8),
                                backgroundColor: sel ? C.bronze : withAlpha(C.bronze, 0.55),
                              },
                            ]}
                          />
                        )}
                      </View>
                      <View
                        style={[
                          styles.runwayTick,
                          {
                            backgroundColor: has
                              ? sel
                                ? C.bronze
                                : withAlpha(C.bronze, 0.7)
                              : withAlpha(C.textPrimary, 0.12),
                          },
                        ]}
                      />
                      <Text style={[styles.runwayDayNum, sel && { color: C.bronze, fontWeight: TYPOGRAPHY.weight.bold }]}>
                        {i === 0 ? '·' : i % 2 === 0 ? format(subDays(now, -i), 'd') : ' '}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {selBillDay !== null && (
                <Reanimated.View entering={FadeIn.duration(180)} style={styles.billDetail}>
                  <Text style={styles.billDetailDay}>{billDayLabel(selBillDay)}</Text>
                  {bills14.items
                    .filter((b) => b.dueInDays === selBillDay)
                    .map((b) => (
                      <View key={b.id} style={styles.billDetailRow}>
                        <Text style={styles.billDetailName} numberOfLines={1}>{b.name}</Text>
                        <Text style={styles.billDetailAmt}>{fmt(b.amount)}</Text>
                      </View>
                    ))}
                </Reanimated.View>
              )}
              <View style={styles.coverageRow}>
                <Feather
                  name={coverage.covered ? 'check-circle' : 'alert-circle'}
                  size={14}
                  color={coverage.covered ? C.accent : C.overdue}
                />
                <Text
                  style={[
                    styles.coverageText,
                    { color: coverage.covered ? C.textSecondary : C.overdue },
                  ]}
                >
                  {fmt(bills14.total)} · {wallets.length === 0
                    ? t.pulse.dueInNext2Weeks
                    : coverage.covered
                    ? t.pulse.walletsCoverBills
                    : t.pulse.walletsShortBy
                        .replace('{x}', fmt(coverage.shortBy))
                        .replace('{day}', billDayLabel(coverage.shortOnDay ?? 0))}
                </Text>
              </View>
            </>
          ) : (
            <Text style={styles.noBills}>{t.pulse.noBills14}</Text>
          )}
        </Pressable>

        {/* ── SAFETY NET + OWED tiles ──────────────────────── */}
        {(runway !== null || savingsAccounts.length > 0 || debt.iOweCount > 0 || debt.theyOweCount > 0) && (
          <View style={styles.tileRow}>
            <TouchableOpacity
              style={[styles.tile, neu.raisedSoft]}
              activeOpacity={0.75}
              onPress={() => { lightTap(); navigation.navigate('SavingsTracker'); }}
              accessibilityRole="button"
            >
              <Text style={styles.tileTitle}>{t.pulse.runwayTitle}</Text>
              {runway !== null ? (
                <>
                  <Text style={[styles.tileValue, { color: C.accent }]}>
                    {runway.months === Infinity || runway.months > RUNWAY_CAP
                      ? `${RUNWAY_CAP}+`
                      : runway.months.toFixed(1)}
                  </Text>
                  <Text style={styles.tileCaption}>{t.pulse.runwayCaption}</Text>
                </>
              ) : (
                <Text style={styles.tileEmpty}>{t.pulse.runwayEmpty}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tile, neu.raisedSoft]}
              activeOpacity={0.75}
              onPress={() => { lightTap(); navigation.navigate('DebtTracking'); }}
              accessibilityRole="button"
            >
              <Text style={styles.tileTitle}>{t.pulse.debtTitle}</Text>
              {debt.iOweOutstanding > 0 ? (
                <>
                  <Text style={[styles.tileValue, { color: C.bronze }]}>{fmt(debt.iOweOutstanding)}</Text>
                  <Text style={styles.tileCaption}>
                    {t.pulse.youOweShort}
                    {debt.overdueCount > 0
                      ? ` · ${t.pulse.overdueN.replace('{n}', String(debt.overdueCount))}`
                      : debt.nextDue !== null && debt.nextDue.inDays >= 0
                      ? ` · ${t.pulse.debtNextDueIn.replace('{when}', billDayLabel(debt.nextDue.inDays))}`
                      : ''}
                  </Text>
                </>
              ) : debt.theyOweOutstanding > 0 ? (
                <>
                  <Text style={[styles.tileValue, { color: C.accent }]}>{fmt(debt.theyOweOutstanding)}</Text>
                  <Text style={styles.tileCaption}>{t.pulse.owedToYouShort}</Text>
                </>
              ) : (
                <Text style={styles.tileEmpty}>{t.pulse.debtClear}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── HEADS UP — calm anomaly feed ─────────────────── */}
        {unusual.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>{t.pulse.headsUp}</Text>
            {unusual.map((u) => (
              <TouchableOpacity
                key={u.categoryId}
                style={[styles.card, styles.warmCard, neu.raisedSoft]}
                activeOpacity={0.75}
                onPress={() => {
                  lightTap();
                  navigation.navigate('TransactionsList', {
                    filterCategory: u.categoryId,
                    filterDateRange: 'this_month',
                  });
                }}
                accessibilityRole="button"
              >
                <View style={[styles.warmIcon, { backgroundColor: withAlpha(C.gold, 0.14) }]}>
                  <Feather name="trending-up" size={15} color={C.gold} />
                </View>
                <View style={styles.warmBody}>
                  <Text style={styles.warmTitle}>{t.pulse.runningWarm.replace('{cat}', u.name)}</Text>
                  <Text style={styles.warmDetail}>
                    {t.pulse.warmDetail.replace('{x}', fmt(u.thisAmount)).replace('{y}', fmt(u.usualAmount))}
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={C.textMuted} />
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* ── QUIET DAYS — compact streak ──────────────────── */}
        <Text style={styles.sectionLabel}>{t.pulse.quietDays}</Text>
        <Pressable
          style={[styles.card, styles.streakCard, neu.raisedSoft]}
          onPress={() => {
            lightTap();
            navigation.navigate('TransactionsList', { filterDateRange: 'this_month' });
          }}
          accessibilityRole="button"
          accessibilityLabel={t.pulse.quietDays}
        >
          <View style={styles.streakLeft}>
            <Feather
              name={streak.currentStreak > 0 ? 'zap' : 'sun'}
              size={18}
              color={streak.currentStreak > 0 ? C.gold : C.textMuted}
            />
            <Text style={styles.streakNumber}>{streak.currentStreak}</Text>
            <Text style={styles.streakUnit}>
              {streak.currentStreak === 1 ? t.pulse.day : t.pulse.days} {t.pulse.currentStreak}
            </Text>
          </View>
          <View style={styles.streakRight}>
            <Text style={styles.streakMeta}>
              {t.pulse.bestStreak}: {streak.bestStreak}
            </Text>
            <Text style={styles.streakMeta}>
              {streak.noSpendDays}/{streak.daysElapsed} {t.pulse.days}
            </Text>
          </View>
        </Pressable>

        <View style={{ height: SPACING['5xl'] }} />
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

      {/* ── Echo FAB — draggable, drag-to-hide, pulse-aware greeting ── */}
      <EchoFab
        visible={!echoHidden && !echoOpen && !paywallOpen}
        fabSide={fabSide}
        onSetFabSide={setFabSide}
        echoFabPan={echoFabPan}
        echoFabPanResponder={echoFabPanResponder}
        greetingText={greeting.text}
        greetingDismissed={greetingDismissed}
        onSetGreetingDismissed={setGreetingDismissed}
        greetingHiddenDuringDrag={greetingHiddenDuringDrag}
        onSetGreetingHiddenDuringDrag={setGreetingHiddenDuringDrag}
        greetingChips={pulseChips}
        greetingPrompt={greeting.prompt}
        onOpenSheet={(autoPrompt) => { setEchoAutoPrompt(autoPrompt); setEchoOpen(true); setGreetingDismissed(true); }}
        tier={tier}
        onShowPaywall={() => setPaywallOpen(true)}
        insets={insets}
        fabScale={fabScale}
        hideZoneAnim={hideZoneAnim}
        hideZoneHoverAnim={hideZoneHoverAnim}
        hideZoneRef={hideZoneRef}
      />
      <EchoInlineChat
        visible={echoOpen}
        onClose={() => setEchoOpen(false)}
        insightTitle={`${score.score}/100`}
        insightSubtitle={t.pulse.echoSubtitle}
        chips={pulseChips}
        contextSnapshot={contextSnapshot}
        autoPrompt={echoAutoPrompt}
        topInset={insets.top}
        bottomInset={insets.bottom}
      />
      <PaywallModal visible={paywallOpen} onClose={() => setPaywallOpen(false)} feature="ai" />
    </View>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    scrollView: { flex: 1 },
    scrollContent: {
      padding: SPACING['2xl'],
      maxWidth: 680,
      width: '100%',
      alignSelf: 'center' as const,
    },

    eyebrow: {
      fontSize: TYPE.label.fontSize,
      color: C.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: SPACING.sm,
      marginLeft: SPACING.xs,
    },
    sectionLabel: {
      fontSize: TYPE.label.fontSize,
      color: C.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: SPACING.xl,
      marginBottom: SPACING.sm,
      marginLeft: SPACING.xs,
    },
    card: {
      backgroundColor: C.background,
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
    },
    cardChevron: {
      position: 'absolute',
      top: SPACING.lg,
      right: SPACING.lg,
      zIndex: 1,
    },
    captionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      marginTop: SPACING.sm,
    },

    // Hero
    heroCard: {
      backgroundColor: C.background,
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
      overflow: 'hidden',
      alignItems: 'center',
    },
    heroPress: { alignSelf: 'stretch', alignItems: 'center' },
    heroTopRow: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    heroDate: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      textTransform: 'lowercase',
    },
    deltaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.full,
    },
    deltaChipText: {
      fontSize: 11,
      fontWeight: TYPOGRAPHY.weight.bold,
      fontVariant: ['tabular-nums'],
    },
    scoreWrap: { alignItems: 'center', marginTop: SPACING.md, marginBottom: SPACING.sm },
    scoreNumber: {
      fontSize: 72,
      fontWeight: '200',
      fontVariant: ['tabular-nums'],
      lineHeight: 76,
    },
    scoreBand: {
      fontSize: TYPOGRAPHY.size.sm,
      textTransform: 'lowercase',
      marginTop: 2,
    },
    scaleWrap: { alignItems: 'center', alignSelf: 'stretch', marginTop: SPACING.md },
    scaleTrack: {
      flexDirection: 'row',
      gap: 3,
      width: '72%',
      height: 4,
    },
    scaleSeg: { flex: 1, height: 4, borderRadius: RADIUS.full },
    scaleDot: {
      position: 'absolute',
      top: -3,
      width: 10,
      height: 10,
      borderRadius: RADIUS.full,
      marginLeft: -5,
      borderWidth: 2,
      borderColor: C.background,
    },
    scaleHint: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      marginTop: SPACING.sm,
      textAlign: 'center',
    },
    behindToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      marginTop: SPACING.md,
    },
    behindToggleText: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      textTransform: 'lowercase',
    },
    compList: {
      alignSelf: 'stretch',
      marginTop: SPACING.md,
      paddingTop: SPACING.sm,
      borderTopWidth: 1,
      borderTopColor: withAlpha(C.textPrimary, 0.06),
    },
    compRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.sm,
      gap: SPACING.sm,
    },
    compLabel: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textPrimary,
      width: 118,
    },
    compBarTrack: {
      flex: 1,
      height: 6,
      backgroundColor: withAlpha(C.textPrimary, 0.08),
      borderRadius: RADIUS.full,
      overflow: 'hidden',
    },
    compBarFill: { height: 6, borderRadius: RADIUS.full },
    compBand: {
      fontSize: TYPOGRAPHY.size.xs,
      width: 86,
      textAlign: 'right',
      textTransform: 'lowercase',
    },

    // Today
    todayHeadline: {
      fontSize: TYPOGRAPHY.size.lg,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      lineHeight: TYPOGRAPHY.size.lg * 1.35,
      fontVariant: ['tabular-nums'],
    },
    todayBarTrack: {
      height: 8,
      backgroundColor: withAlpha(C.textPrimary, 0.08),
      borderRadius: RADIUS.full,
      overflow: 'hidden',
      marginTop: SPACING.md,
    },
    todayBarFill: { height: 8, borderRadius: RADIUS.full },
    todayMetaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: SPACING.sm,
      gap: SPACING.md,
    },
    todayMeta: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      flexShrink: 1,
    },
    todayEmpty: {
      fontSize: TYPE.insight.fontSize,
      lineHeight: TYPE.insight.lineHeight,
      color: C.textSecondary,
    },
    setBudgetCta: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: SPACING.xs,
      marginTop: SPACING.md,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      borderRadius: RADIUS.full,
      backgroundColor: withAlpha(C.accent, 0.1),
    },
    setBudgetCtaText: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.accent,
    },

    // Month chart
    chartCaption: {
      fontSize: TYPE.insight.fontSize,
      lineHeight: TYPE.insight.lineHeight,
      color: C.textSecondary,
      flex: 1,
      fontVariant: ['tabular-nums'],
    },

    // Bills runway
    runwayStrip: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      height: 88,
    },
    runwayCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
    runwayBarZone: { justifyContent: 'flex-end', height: 60 },
    runwayBar: { width: 8, borderRadius: RADIUS.sm },
    runwayTick: {
      width: 4,
      height: 4,
      borderRadius: 2,
      marginTop: SPACING.xs,
    },
    runwayDayNum: {
      fontSize: 9,
      color: C.textMuted,
      marginTop: 3,
      fontVariant: ['tabular-nums'],
    },
    billDetail: {
      marginTop: SPACING.md,
      paddingTop: SPACING.sm,
      borderTopWidth: 1,
      borderTopColor: withAlpha(C.textPrimary, 0.06),
    },
    billDetailDay: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      textTransform: 'lowercase',
      marginBottom: SPACING.xs,
    },
    billDetailRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: SPACING.xs,
      gap: SPACING.md,
    },
    billDetailName: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textPrimary,
      flexShrink: 1,
    },
    billDetailAmt: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    coverageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      marginTop: SPACING.md,
      paddingTop: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: withAlpha(C.textPrimary, 0.06),
    },
    coverageText: {
      fontSize: TYPE.insight.fontSize,
      lineHeight: TYPE.insight.lineHeight,
      flex: 1,
      fontVariant: ['tabular-nums'],
    },
    noBills: {
      fontSize: TYPE.insight.fontSize,
      lineHeight: TYPE.insight.lineHeight,
      color: C.textSecondary,
    },

    // Tiles
    tileRow: {
      flexDirection: 'row',
      gap: SPACING.md,
      marginTop: SPACING.xl,
    },
    tile: {
      flex: 1,
      backgroundColor: C.background,
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
      minHeight: 96,
    },
    tileTitle: {
      fontSize: TYPE.label.fontSize,
      color: C.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    tileValue: {
      fontSize: TYPOGRAPHY.size['2xl'],
      fontWeight: TYPOGRAPHY.weight.bold,
      fontVariant: ['tabular-nums'],
      marginTop: SPACING.sm,
    },
    tileCaption: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textSecondary,
      marginTop: SPACING.xs,
    },
    tileEmpty: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      marginTop: SPACING.sm,
      lineHeight: 16,
    },

    // Heads up
    warmCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      marginBottom: SPACING.sm,
    },
    warmIcon: {
      width: 32,
      height: 32,
      borderRadius: RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    warmBody: { flex: 1 },
    warmTitle: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
    },
    warmDetail: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textSecondary,
      marginTop: 2,
      fontVariant: ['tabular-nums'],
    },

    // Streak
    streakCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    streakLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    streakNumber: {
      fontSize: TYPOGRAPHY.size['2xl'],
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    streakUnit: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textSecondary,
    },
    streakRight: { alignItems: 'flex-end', gap: 2 },
    streakMeta: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      fontVariant: ['tabular-nums'],
    },
  });

export default FinancialPulse;
