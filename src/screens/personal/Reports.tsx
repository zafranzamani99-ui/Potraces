import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  InteractionManager,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { LineChart } from 'react-native-chart-kit';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { format } from 'date-fns';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, TYPE, withAlpha, ensureContrastOnDark } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useCategories } from '../../hooks/useCategories';
import { useNeu } from '../../components/common/neu';
import {
  RangeKey,
  getRange,
  previousRange,
  monthsInRange,
  scopeTxns,
  cashFlowOf,
  rollupOf,
  merchantsOf,
  monthlySeries,
  recurringShare,
  biggestOf,
  categoryMoversOf,
  toTxnListRange,
} from '../../utils/insights';
import EmptyState from '../../components/common/EmptyState';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import TimeRangePills from '../../components/common/TimeRangePills';
import AnimatedNumber from '../../components/common/AnimatedNumber';
import CategoryIcon from '../../components/common/CategoryIcon';
import Donut from '../../components/common/Donut';
import CashFlowMathSheet, { MathFocus } from '../../components/common/CashFlowMathSheet';
import { lightTap } from '../../services/haptics';
import ScreenGuide from '../../components/common/ScreenGuide';
import { useKeptAcrossBooks } from '../../hooks/useKeptNumber';

const DELTA_CAP = 999;

const PersonalReports: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const isDark = useIsDark();
  const neu = useNeu(undefined, { faintDark: true }); // Onyx: borderless #121212 + soft neu lift
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation<any>();
  const { width: winW } = useWindowDimensions();
  // Card interior = page − outer padding (2×2xl=48) − card padding (2×lg=32).
  const chartWidth = Math.min(winW, 680) - SPACING['2xl'] * 2 - SPACING.lg * 2;

  // Lift fixed category colours so donut arcs / bars match the (already lifted)
  // icons in dark mode; light mode keeps the raw hue.
  const lift = useCallback((hex: string) => (isDark ? ensureContrastOnDark(hex) : hex), [isDark]);

  const transactions = usePersonalStore((s) => s.transactions);
  const subscriptions = usePersonalStore((s) => s.subscriptions);
  const currency = useSettingsStore((state) => state.currency);
  // Cross-book "kept" (hustle settled into personal − personal spend). Shows only
  // when there's real settlement this month; distinct from the range-driven hero.
  const keptBooks = useKeptAcrossBooks();
  const expenseCategories = useCategories('expense');
  const incomeCategories = useCategories('income');

  const [range, setRange] = useState<RangeKey>('this_month');
  const rangeLabels = useMemo<Record<RangeKey, string>>(
    () => ({
      this_month: t.reports.rangeThisMonth,
      last_month: t.reports.rangeLastMonth,
      '3m': t.reports.range3m,
      '6m': t.reports.range6m,
      year: t.reports.rangeYear,
    }),
    [t]
  );

  // ── Range-scoped computations + the equal window before it ──
  // Scope the ledger to this window (and the one before) ONCE, then derive every
  // metric from those slices — one array scan per window instead of ~8 per pill tap.
  const dr = useMemo(() => getRange(range), [range]);
  const prevDr = useMemo(() => previousRange(dr), [dr]);
  const scopedThis = useMemo(() => scopeTxns(transactions, dr), [transactions, dr]);
  const scopedPrev = useMemo(() => scopeTxns(transactions, prevDr), [transactions, prevDr]);
  const cf = useMemo(() => cashFlowOf(scopedThis), [scopedThis]);
  const prevCF = useMemo(() => cashFlowOf(scopedPrev), [scopedPrev]);
  const cats = useMemo(
    () => rollupOf(scopedThis, expenseCategories, C.accent, 6, 'expense'),
    [scopedThis, expenseCategories, C]
  );
  const income = useMemo(
    () => rollupOf(scopedThis, incomeCategories, C.accent, 5, 'income'),
    [scopedThis, incomeCategories, C]
  );
  // "Places you go back to" — only merchants visited 2+ times, so this stays
  // distinct from "biggest buys" (which lists single largest transactions).
  const merchants = useMemo(
    () => merchantsOf(scopedThis, 30).filter((m) => m.count >= 2).slice(0, 5),
    [scopedThis]
  );
  const movers = useMemo(
    () => categoryMoversOf(scopedThis, scopedPrev, expenseCategories, C.accent, 3),
    [scopedThis, scopedPrev, expenseCategories, C]
  );
  const bigExp = useMemo(() => biggestOf(scopedThis, 5), [scopedThis]);

  // Recurring is inherently monthly, so compare it against AVERAGE monthly spend
  // for the range — not the range total (which would understate it ~N×).
  const monthsSpan = useMemo(() => monthsInRange(dr), [dr]);
  const avgMonthlyOut = monthsSpan > 0 ? cf.wentOut / monthsSpan : cf.wentOut;
  const recurring = useMemo(
    () => recurringShare(subscriptions, avgMonthlyOut),
    [subscriptions, avgMonthlyOut]
  );

  const expenseCatMap = useMemo(() => {
    const m: Record<string, { name: string; icon: string; color: string }> = {};
    expenseCategories.forEach((c) => (m[c.id] = { name: c.name, icon: c.icon, color: c.color }));
    return m;
  }, [expenseCategories]);

  // ── Fixed 6-month trend (independent of the pill — labelled as such) ──
  const series = useMemo(() => monthlySeries(transactions, 6), [transactions]);
  const hasTrend = useMemo(() => series.some((p) => p.cameIn > 0 || p.wentOut > 0), [series]);
  const keptMax = useMemo(() => Math.max(...series.map((p) => Math.abs(p.kept)), 1), [series]);

  // ── Vs previous period — deltas on the cash-flow card (any range) ──
  const inDelta = prevCF.cameIn > 0 ? Math.round(((cf.cameIn - prevCF.cameIn) / prevCF.cameIn) * 100) : null;
  const spendDelta = prevCF.wentOut > 0 ? Math.round(((cf.wentOut - prevCF.wentOut) / prevCF.wentOut) * 100) : null;
  const keptDelta =
    prevCF.kept !== 0 ? Math.round(((cf.kept - prevCF.kept) / Math.abs(prevCF.kept)) * 100) : null;
  const showCompare = prevCF.count > 0;

  const avgRate = useMemo(() => {
    const m = series.filter((p) => p.cameIn > 0);
    if (m.length === 0) return null;
    return Math.round(
      (m.reduce((s, p) => s + Math.max(0, Math.min(p.kept / p.cameIn, 1)), 0) / m.length) * 100
    );
  }, [series]);

  // ── Formatting — ONE precision on this screen (whole ringgit, calm) ──
  const money0 = (n: number) =>
    n.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  // ── "Show me the math" sheet — each number explains itself: tap "came in"
  // → income breakdown, "went out" → expense breakdown, "kept"/hero → the full
  // came in − went out = kept equation (clarity/transparency). ──
  const [mathFocus, setMathFocus] = useState<MathFocus | null>(null);
  const canShowMath = cf.count > 0;
  const openMath = useCallback((focus: MathFocus) => {
    lightTap();
    setMathFocus(focus);
  }, []);

  // Deep-link: the Dashboard's "kept" card lands here with the math sheet
  // already open on the kept equation. Param cleared so back-and-forth
  // doesn't re-trigger it.
  const route = useRoute<any>();
  const paramFocus = route.params?.openMath as MathFocus | undefined;
  useEffect(() => {
    if (paramFocus && canShowMath) {
      setMathFocus(paramFocus);
      navigation.setParams({ openMath: undefined });
    }
  }, [paramFocus, canShowMath, navigation]);

  // ── Hero: count-up kept number (seed 0 → value on mount/change) ──
  const [heroKept, setHeroKept] = useState(0);
  useEffect(() => setHeroKept(Math.abs(cf.kept)), [cf.kept]);
  const heroPositive = cf.kept >= 0;
  const heroColor = heroPositive ? C.positive : C.overdue;
  const heroEyebrow = heroPositive ? t.reports.thisPeriodKept : t.reports.heroOver;
  const heroSub = useMemo(() => {
    if (cf.cameIn <= 0) return '';
    if (heroPositive) {
      const pct = Math.round((cf.kept / cf.cameIn) * 100);
      return `${pct}% ${t.reports.ofWhatCameIn}`;
    }
    return t.reports.moreWentOut;
  }, [cf, heroPositive, t]);

  // ── Donut: top categories + a solid "other" slice so the ring fills ──
  const catTotal = useMemo(() => cats.reduce((s, c) => s + c.amount, 0), [cats]);
  const otherAmount = Math.max(cf.wentOut - catTotal, 0);
  const donutTotal = cf.wentOut;
  const donutData = useMemo(() => {
    const segs = cats.map((c) => ({ value: c.amount, color: lift(c.color) }));
    if (otherAmount > 0.005) segs.push({ value: otherAmount, color: withAlpha(C.textMuted, 0.5) });
    return segs;
  }, [cats, otherAmount, C, lift]);

  // ── Trend chart data — In vs Out with distinct hues ──
  const trendData = useMemo(
    () => ({
      labels: series.map((p) => p.label),
      datasets: [
        { data: series.map((p) => p.cameIn), color: (o = 1) => withAlpha(lift(C.positive), o), strokeWidth: 2 },
        { data: series.map((p) => p.wentOut), color: (o = 1) => withAlpha(C.overdue, o), strokeWidth: 2 },
      ],
      legend: [t.reports.legendIn, t.reports.legendOut],
    }),
    [series, C, t, lift]
  );

  // ── Drill-down navigation ──
  const goToCategory = useCallback(
    (catId: string, filterType?: 'income' | 'expense') => {
      navigation.navigate('TransactionsList', {
        filterCategory: catId,
        filterDateRange: toTxnListRange(range),
        ...(filterType ? { filterType } : {}),
      });
    },
    [navigation, range]
  );
  const goToMerchant = useCallback(
    (label: string) => {
      navigation.navigate('TransactionsList', {
        filterSearch: label,
        filterDateRange: toTxnListRange(range),
      });
    },
    [navigation, range]
  );
  const goToBig = useCallback(
    (b: { description: string; category: string }) => {
      if (b.description) goToMerchant(b.description);
      else goToCategory(b.category, 'expense');
    },
    [goToMerchant, goToCategory]
  );

  // ── Ready gate + pull-to-refresh ──
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setReady(true));
    return () => task.cancel();
  }, []);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    InteractionManager.runAfterInteractions(() => setRefreshing(false));
  }, []);

  const chartConfig = useMemo(
    () => ({
      backgroundColor: C.background,
      backgroundGradientFrom: C.background,
      backgroundGradientTo: C.background,
      decimalPlaces: 0,
      // Gridlines only — a neutral faint gray so no data series shares the grid colour.
      color: (o = 1) => withAlpha(C.textMuted, o * 0.25),
      labelColor: (o = 1) => withAlpha(C.textSecondary, o),
      style: { borderRadius: RADIUS.lg },
      propsForDots: { r: '3', strokeWidth: '2' },
      propsForBackgroundLines: { strokeWidth: 1 },
    }),
    [C]
  );

  // The trend chart is a fixed 6-month view (range-independent) — memoize the
  // element so tapping a range pill doesn't re-run chart-kit's bezier path work.
  const trendChart = useMemo(
    () => (
      <LineChart
        data={trendData}
        width={chartWidth}
        height={220}
        chartConfig={chartConfig}
        bezier
        withShadow={false}
        style={styles.chart}
      />
    ),
    [trendData, chartWidth, chartConfig, styles.chart]
  );

  if (!ready) {
    return (
      <View style={styles.container}>
        <SkeletonLoader />
        <SkeletonLoader style={{ marginTop: SPACING.md }} />
      </View>
    );
  }

  if (transactions.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon="i/bar-chart-outline"
          title={t.reports.nothingToReport}
          message={t.reports.spendingStory}
        />
      </View>
    );
  }

  const deltaPill = (delta: number | null, goodWhenDown: boolean) => {
    if (delta === null) return null;
    if (delta === 0) return <Text style={styles.deltaFlat}>—</Text>;
    const up = delta > 0;
    const good = goodWhenDown ? !up : up;
    const color = good ? C.positive : C.overdue;
    const abs = Math.abs(delta);
    const label = abs > DELTA_CAP ? `${DELTA_CAP}+%` : `${abs}%`;
    return (
      <View style={[styles.deltaPill, { backgroundColor: withAlpha(color, 0.14) }]}>
        <Feather name={up ? 'arrow-up' : 'arrow-down'} size={11} color={color} />
        <Text style={[styles.deltaText, { color }]}>{label}</Text>
      </View>
    );
  };

  const catRow = (
    key: string,
    color: string,
    icon: string,
    name: string,
    amount: number,
    percent: number,
    onPress: () => void,
    last: boolean
  ) => (
    <TouchableOpacity
      key={key}
      style={[styles.row, last && styles.rowLast]}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${currency} ${money0(amount)}, ${t.reports.seeTransactions}`}
    >
      <View style={[styles.rowChip, { backgroundColor: withAlpha(lift(color), 0.15) }]}>
        <CategoryIcon icon={icon} size={18} color={lift(color)} />
      </View>
      <View style={styles.rowMid}>
        <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
        <View style={styles.miniBarTrack}>
          <View style={[styles.miniBarFill, { width: `${Math.min(percent, 100)}%`, backgroundColor: lift(color) }]} />
        </View>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.rowAmount}>{currency} {money0(amount)}</Text>
        <Feather name="chevron-right" size={16} color={C.textMuted} />
      </View>
    </TouchableOpacity>
  );

  const moverRow = (m: (typeof movers.up)[number], up: boolean, last: boolean) => {
    const color = up ? C.overdue : C.positive; // spent more = caution, spent less = good
    return (
      <View key={`${up ? 'u' : 'd'}-${m.id}`} style={[styles.row, last && styles.rowLast]}>
        <View style={[styles.rowChip, { backgroundColor: withAlpha(lift(m.color), 0.15) }]}>
          <CategoryIcon icon={m.icon} size={18} color={lift(m.color)} />
        </View>
        <View style={styles.rowMid}>
          <Text style={styles.rowName} numberOfLines={1}>{m.name}</Text>
        </View>
        <View style={styles.moverRight}>
          <Feather name={up ? 'arrow-up' : 'arrow-down'} size={13} color={color} />
          <Text style={[styles.moverAmt, { color }]}>{currency} {money0(Math.abs(m.delta))}</Text>
          <Text style={styles.moverPct}>
            {`${Math.min(Math.abs(Math.round(m.pct ?? 0)), DELTA_CAP)}%`}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScreenGuide
        id="guide_reports"
        title={t.guide.yourReports}
        icon="bar-chart-2"
        accent="#A688B8"
        description={t.guide.descReports}
        points={[
          { icon: 'calendar', text: t.guide.reportsPoint1 },
          { icon: 'pie-chart', text: t.guide.reportsPoint2 },
        ]}
      />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} colors={[C.accent]} />
        }
      >
        {/* Hero — the kept number for the selected range (tap → the math) */}
        <TouchableOpacity
          style={[styles.heroCard, neu.raisedSoft]}
          onPress={canShowMath ? () => openMath('kept') : undefined}
          disabled={!canShowMath}
          activeOpacity={canShowMath ? 0.85 : 1}
          accessibilityRole={canShowMath ? 'button' : undefined}
          accessibilityLabel={canShowMath ? `${heroEyebrow} ${currency} ${money0(Math.abs(cf.kept))}. ${t.reports.theMath}` : undefined}
        >
          <LinearGradient
            colors={[withAlpha(heroColor, 0.14), withAlpha(C.background, 0)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFillObject}
            pointerEvents="none"
          />
          <Text style={styles.heroEyebrow}>{heroEyebrow}</Text>
          {cf.count === 0 ? (
            <Text style={styles.heroEmpty}>{t.reports.notEnoughHistory}</Text>
          ) : (
            <>
              <AnimatedNumber
                value={heroKept}
                prefix={`${currency} `}
                decimals={0}
                style={StyleSheet.flatten([styles.heroAmount, { color: heroColor }])}
              />
              {heroSub ? <Text style={styles.heroSub}>{heroSub}</Text> : null}
              <View style={styles.mathHintRow}>
                <Feather name="info" size={12} color={C.textMuted} />
                <Text style={styles.mathHintText}>{t.reports.theMath}</Text>
              </View>
            </>
          )}
        </TouchableOpacity>

        {/* Time-range selector (Onyx: Neu Pills) */}
        <TimeRangePills value={range} onChange={setRange} labels={rangeLabels} neu containerStyle={styles.pills} />

        {/* Cash-flow summary — each number opens its own breakdown */}
        <Text style={styles.sectionLabel}>{t.reports.cashFlow}</Text>
        <View style={[styles.oCard, neu.raisedSoft]}>
          <View style={styles.statRow}>
            <TouchableOpacity
              style={styles.statItem}
              onPress={canShowMath ? () => openMath('in') : undefined}
              disabled={!canShowMath}
              activeOpacity={canShowMath ? 0.6 : 1}
              accessibilityRole={canShowMath ? 'button' : undefined}
              accessibilityLabel={canShowMath ? `${t.reports.cameIn} ${currency} ${money0(cf.cameIn)}. ${t.reports.theMath}` : undefined}
            >
              <AnimatedNumber value={cf.cameIn} prefix={`${currency} `} decimals={0} style={styles.statValue} />
              <Text style={styles.statLabel}>{t.reports.cameIn}</Text>
              {showCompare && deltaPill(inDelta, false)}
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <TouchableOpacity
              style={styles.statItem}
              onPress={canShowMath ? () => openMath('out') : undefined}
              disabled={!canShowMath}
              activeOpacity={canShowMath ? 0.6 : 1}
              accessibilityRole={canShowMath ? 'button' : undefined}
              accessibilityLabel={canShowMath ? `${t.reports.wentOut} ${currency} ${money0(cf.wentOut)}. ${t.reports.theMath}` : undefined}
            >
              <AnimatedNumber value={cf.wentOut} prefix={`${currency} `} decimals={0} style={styles.statValue} />
              <Text style={styles.statLabel}>{t.reports.wentOut}</Text>
              {showCompare && deltaPill(spendDelta, true)}
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <TouchableOpacity
              style={styles.statItem}
              onPress={canShowMath ? () => openMath('kept') : undefined}
              disabled={!canShowMath}
              activeOpacity={canShowMath ? 0.6 : 1}
              accessibilityRole={canShowMath ? 'button' : undefined}
              accessibilityLabel={canShowMath ? `${t.reports.kept} ${currency} ${money0(Math.abs(cf.kept))}. ${t.reports.theMath}` : undefined}
            >
              <AnimatedNumber
                value={Math.abs(cf.kept)}
                prefix={`${currency} `}
                decimals={0}
                style={StyleSheet.flatten([styles.statValue, { color: heroColor }])}
              />
              <Text style={styles.statLabel}>{t.reports.kept}</Text>
              {showCompare && deltaPill(keptDelta, false)}
            </TouchableOpacity>
          </View>
          {(canShowMath || showCompare) && (
            <View style={styles.mathHintRow}>
              {canShowMath && <Feather name="info" size={12} color={C.textMuted} />}
              <Text style={styles.mathHintText}>
                {canShowMath && showCompare
                  ? `${t.reports.tapForMath} · ${t.reports.vsPrevious}`
                  : canShowMath
                  ? t.reports.tapForMath
                  : t.reports.vsPrevious}
              </Text>
            </View>
          )}
        </View>

        {/* Kept across both books — hustle take-home settled into personal minus
            personal spend this month. Only when there's real settlement (crossBook). */}
        {keptBooks.crossBook && (
          <View style={[styles.oCard, neu.raisedSoft, styles.bothBooksCard]}>
            <Text style={styles.heroEyebrow}>{t.reports.keptBothBooksLabel}</Text>
            <AnimatedNumber
              value={keptBooks.kept}
              prefix={`${currency} `}
              decimals={0}
              style={StyleSheet.flatten([styles.heroAmount, { color: heroColor }])}
            />
            <Text style={styles.heroSub}>{t.reports.keptBothBooksCaption}</Text>
          </View>
        )}

        {/* Where it came from — income sources (new; neither screen had this) */}
        {cf.cameIn > 0 && income.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>{t.reports.incomeSources}</Text>
            <View style={[styles.oCard, neu.raisedSoft]}>
              {income.map((c, i) =>
                catRow(
                  `inc-${c.id}`,
                  c.color,
                  c.icon,
                  c.name,
                  c.amount,
                  c.percent,
                  () => goToCategory(c.id, 'income'),
                  i === income.length - 1
                )
              )}
            </View>
          </>
        )}

        {/* Where it went — donut + tappable category rows */}
        {cats.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>{t.reports.whereItWentRange}</Text>
            <View style={[styles.oCard, neu.raisedSoft]}>
              <View style={styles.donutWrap}>
                <Donut
                  data={donutData}
                  size={Math.min(chartWidth, 200)}
                  strokeWidth={18}
                  trackColor={withAlpha(C.textMuted, 0.08)}
                >
                  <View style={styles.donutCenter}>
                    <Text style={styles.donutTotal}>{currency} {money0(donutTotal)}</Text>
                    <Text style={styles.donutLabel}>{t.reports.spent}</Text>
                  </View>
                </Donut>
              </View>
              {cats.map((c, i) =>
                catRow(
                  `cat-${c.id}`,
                  c.color,
                  c.icon,
                  c.name,
                  c.amount,
                  c.percent,
                  () => goToCategory(c.id, 'expense'),
                  otherAmount <= 0.5 && i === cats.length - 1
                )
              )}
              {otherAmount > 0.5 && (
                <View style={[styles.row, styles.rowLast]}>
                  <View style={[styles.rowChip, { backgroundColor: withAlpha(C.textMuted, 0.15) }]}>
                    <Feather name="more-horizontal" size={18} color={C.textMuted} />
                  </View>
                  <View style={styles.rowMid}>
                    <Text style={styles.rowName} numberOfLines={1}>{t.reports.otherSlice}</Text>
                  </View>
                  <Text style={styles.rowAmount}>{currency} {money0(otherAmount)}</Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* What changed — this range vs the previous equal window (new) */}
        {showCompare && (movers.up.length > 0 || movers.down.length > 0) && (
          <>
            <Text style={styles.sectionLabel}>{t.reports.movers}</Text>
            <View style={[styles.oCard, neu.raisedSoft]}>
              {movers.up.length > 0 && (
                <>
                  <Text style={styles.moverGroupLabel}>{t.reports.spentMore}</Text>
                  {movers.up.map((m, i) => moverRow(m, true, movers.down.length === 0 && i === movers.up.length - 1))}
                </>
              )}
              {movers.down.length > 0 && (
                <>
                  <Text style={[styles.moverGroupLabel, movers.up.length > 0 && { marginTop: SPACING.md }]}>
                    {t.reports.spentLess}
                  </Text>
                  {movers.down.map((m, i) => moverRow(m, false, i === movers.down.length - 1))}
                </>
              )}
            </View>
          </>
        )}

        {/* Biggest single buys in range (new) */}
        {bigExp.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>{t.reports.biggestBuys}</Text>
            <View style={[styles.oCard, neu.raisedSoft]}>
              {bigExp.map((b, i) => {
                const cat = expenseCatMap[b.category] || { name: b.category, icon: 'tag', color: C.accent };
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={[styles.row, i === bigExp.length - 1 && styles.rowLast]}
                    onPress={() => goToBig(b)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`${b.description || cat.name}, ${currency} ${money0(b.amount)}`}
                  >
                    <View style={[styles.rowChip, { backgroundColor: withAlpha(lift(cat.color), 0.15) }]}>
                      <CategoryIcon icon={cat.icon} size={18} color={lift(cat.color)} />
                    </View>
                    <View style={styles.rowMid}>
                      <Text style={styles.rowName} numberOfLines={1}>{b.description || cat.name}</Text>
                      <Text style={styles.rowMeta}>{format(b.date, 'd MMM')} · {cat.name}</Text>
                    </View>
                    <View style={styles.rowRight}>
                      <Text style={styles.rowAmount}>{currency} {money0(b.amount)}</Text>
                      <Feather name="chevron-right" size={16} color={C.textMuted} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* In vs out trend + kept per month (fixed 6-month window) */}
        {hasTrend && (
          <>
            <Text style={styles.sectionLabel}>{t.reports.inVsOut}</Text>
            <View style={[styles.oCard, neu.raisedSoft]}>
              {trendChart}
              <Text style={styles.caption}>{t.reports.keptPerMonth}</Text>
              <View style={styles.keptRow}>
                {series.map((p) => {
                  const h = Math.max((Math.abs(p.kept) / keptMax) * 34, p.kept !== 0 ? 3 : 0);
                  const positive = p.kept >= 0;
                  return (
                    <View key={p.monthKey} style={styles.keptCol}>
                      <View style={styles.keptHalfTop}>
                        {positive && (
                          <View style={[styles.keptBarUp, { height: h, backgroundColor: lift(C.positive) }]} />
                        )}
                      </View>
                      <View style={styles.keptCenterLine} />
                      <View style={styles.keptHalfBot}>
                        {!positive && (
                          <View style={[styles.keptBarDown, { height: h, backgroundColor: C.overdue }]} />
                        )}
                      </View>
                      <Text style={styles.keptColLabel}>{p.label}</Text>
                    </View>
                  );
                })}
              </View>
              {avgRate !== null && (
                <Text style={styles.trendCaption}>
                  {t.reports.kept} {avgRate}% {t.reports.ofWhatCameIn}
                </Text>
              )}
            </View>
          </>
        )}

        {/* Top merchants/places */}
        {merchants.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>{t.reports.topMerchants}</Text>
            <View style={[styles.oCard, neu.raisedSoft]}>
              {merchants.map((m, i) => (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.row, i === merchants.length - 1 && styles.rowLast]}
                  onPress={() => goToMerchant(m.label)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${m.label}, ${t.reports.seeTransactions}`}
                >
                  <View style={[styles.rowChip, { backgroundColor: withAlpha(C.bronze, 0.16) }]}>
                    <Text style={styles.rankText}>{i + 1}</Text>
                  </View>
                  <View style={styles.rowMid}>
                    <Text style={styles.rowName} numberOfLines={1}>{m.label}</Text>
                    <Text style={styles.rowMeta}>{m.count} {t.reports.times}</Text>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={styles.rowAmount}>{currency} {money0(m.amount)}</Text>
                    <Feather name="chevron-right" size={16} color={C.textMuted} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Recurring share — per-month composition */}
        {recurring.monthlyRecurring > 0 && cf.wentOut > 0 && (
          <>
            <Text style={styles.sectionLabel}>{t.reports.recurringLabel}</Text>
            <View style={[styles.oCard, neu.raisedSoft]}>
              <Text style={styles.recurringValue}>
                {currency} {money0(recurring.monthlyRecurring)}
                <Text style={styles.recurringPerMo}> {t.reports.perMo}</Text>
              </Text>
              <View style={[styles.compBarTrack, { backgroundColor: withAlpha(C.textMuted, 0.12) }]}>
                <View
                  style={[
                    styles.compBarFill,
                    { width: `${Math.min(recurring.ofSpendPercent, 100)}%`, backgroundColor: C.bronze },
                  ]}
                />
              </View>
              <Text style={styles.recurringNote}>
                {recurring.ofSpendPercent > 100
                  ? t.reports.recurringOverSpend
                  : `${Math.round(recurring.ofSpendPercent)}% ${t.reports.ofWentOutRecurring}`}
              </Text>
            </View>
          </>
        )}

        <View style={{ height: SPACING['3xl'] }} />
      </ScrollView>

      <CashFlowMathSheet
        visible={mathFocus !== null}
        focus={mathFocus ?? 'kept'}
        onClose={() => setMathFocus(null)}
        currency={currency}
        rangeLabel={rangeLabels[range]}
        cameIn={cf.cameIn}
        wentOut={cf.wentOut}
        kept={cf.kept}
        incomeRows={income}
        expenseRows={cats}
        compare={showCompare ? { cameIn: prevCF.cameIn, wentOut: prevCF.wentOut, kept: prevCF.kept } : null}
      />
    </View>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    scrollView: { flex: 1 },
    scrollContent: { padding: SPACING['2xl'], maxWidth: 680, width: '100%', alignSelf: 'center' as const },

    // Onyx card — borderless C.background, lift from neu.raisedSoft
    oCard: {
      backgroundColor: C.background,
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
    },
    bothBooksCard: { alignItems: 'center', marginTop: SPACING.md },

    sectionLabel: {
      fontSize: TYPE.label.fontSize,
      color: C.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginTop: SPACING.xl,
      marginBottom: SPACING.sm,
      marginLeft: SPACING.xs,
    },

    // Hero
    heroCard: {
      backgroundColor: C.background,
      borderRadius: RADIUS.xl,
      padding: SPACING.xl,
      overflow: 'hidden',
      marginBottom: SPACING.xs,
    },
    heroEyebrow: {
      fontSize: TYPE.label.fontSize,
      color: C.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: SPACING.sm,
    },
    heroAmount: {
      fontSize: TYPE.amount.fontSize,
      fontWeight: TYPE.amount.fontWeight,
      fontVariant: ['tabular-nums'],
    },
    heroSub: { ...TYPE.insight, color: C.textSecondary, marginTop: SPACING.sm },
    heroEmpty: { ...TYPE.narrative, color: C.textSecondary },
    pills: { marginBottom: SPACING.xs },

    // "the math" tap affordance — subtle, signals the card opens a breakdown
    mathHintRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: SPACING.xs,
      marginTop: SPACING.md,
    },
    mathHintText: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      textTransform: 'lowercase',
    },

    chart: { marginVertical: SPACING.sm, borderRadius: RADIUS.lg, alignSelf: 'center' },
    caption: {
      fontSize: TYPE.label.fontSize,
      color: C.textMuted,
      textTransform: TYPE.label.textTransform,
      letterSpacing: TYPE.label.letterSpacing,
      marginTop: SPACING.md,
      marginBottom: SPACING.sm,
    },
    trendCaption: {
      fontSize: TYPE.insight.fontSize,
      lineHeight: TYPE.insight.lineHeight,
      color: C.textSecondary,
      marginTop: SPACING.md,
    },

    // Stats (cash flow)
    statRow: { flexDirection: 'row', alignItems: 'stretch' },
    statItem: { flex: 1, alignItems: 'center', gap: SPACING.xs, paddingVertical: SPACING.xs },
    statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: withAlpha(C.textPrimary, 0.08), marginHorizontal: SPACING.md },
    statValue: {
      fontSize: TYPOGRAPHY.size.lg,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
    },
    statLabel: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary, textAlign: 'center' },
    cashFlowCaption: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      textAlign: 'center',
      marginTop: SPACING.md,
    },

    // Kept-per-month diverging bars (up = kept, down = overspent)
    keptRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    keptCol: { flex: 1, alignItems: 'center' },
    keptHalfTop: { height: 34, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
    keptHalfBot: { height: 34, width: '100%', justifyContent: 'flex-start', alignItems: 'center' },
    keptCenterLine: { height: 1, alignSelf: 'stretch', backgroundColor: withAlpha(C.textPrimary, 0.1) },
    keptBarUp: {
      width: '46%',
      minWidth: 10,
      borderTopLeftRadius: RADIUS.sm,
      borderTopRightRadius: RADIUS.sm,
    },
    keptBarDown: {
      width: '46%',
      minWidth: 10,
      borderBottomLeftRadius: RADIUS.sm,
      borderBottomRightRadius: RADIUS.sm,
    },
    keptColLabel: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: SPACING.xs },

    // Donut
    donutWrap: { alignItems: 'center', marginBottom: SPACING.lg },
    donutCenter: { alignItems: 'center' },
    donutTotal: {
      fontSize: TYPE.balance.fontSize,
      fontWeight: TYPE.balance.fontWeight,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    donutLabel: {
      fontSize: TYPE.label.fontSize,
      color: C.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },

    // Rows (category + merchant + income + biggest)
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(C.textPrimary, 0.06),
    },
    rowLast: { borderBottomWidth: 0 },
    rowChip: {
      width: 36,
      height: 36,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: SPACING.md,
    },
    rankText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.bold, color: C.bronze },
    rowMid: { flex: 1, marginRight: SPACING.md },
    rowName: { fontSize: TYPOGRAPHY.size.base, color: C.textPrimary },
    rowMeta: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: SPACING.xs },
    miniBarTrack: {
      height: 4,
      borderRadius: RADIUS.full,
      backgroundColor: withAlpha(C.textMuted, 0.12),
      marginTop: 6,
      overflow: 'hidden',
    },
    miniBarFill: { height: 4, borderRadius: RADIUS.full },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    rowAmount: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'],
    },

    // Movers
    moverGroupLabel: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: SPACING.xs,
    },
    moverRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
    moverAmt: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, fontVariant: ['tabular-nums'] },
    moverPct: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, fontVariant: ['tabular-nums'], minWidth: 34, textAlign: 'right' },

    // Recurring composition
    recurringValue: {
      fontSize: TYPOGRAPHY.size['2xl'],
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'],
      marginBottom: SPACING.md,
    },
    recurringPerMo: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.medium, color: C.textMuted },
    compBarTrack: {
      height: 10,
      borderRadius: RADIUS.full,
      overflow: 'hidden',
      marginBottom: SPACING.md,
    },
    compBarFill: { height: 10, borderRadius: RADIUS.full },
    recurringNote: {
      fontSize: TYPE.insight.fontSize,
      lineHeight: TYPE.insight.lineHeight,
      color: C.textSecondary,
    },

    // Delta pills
    deltaPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.sm,
      paddingVertical: SPACING.xs,
      borderRadius: RADIUS.full,
      gap: 2,
    },
    deltaText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.semibold },
    deltaFlat: { fontSize: TYPOGRAPHY.size.sm, color: C.textMuted },
  });

export default PersonalReports;
