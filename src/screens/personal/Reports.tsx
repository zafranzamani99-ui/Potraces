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
import { useNavigation } from '@react-navigation/native';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, TYPE, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useCategories } from '../../hooks/useCategories';
import {
  RangeKey,
  getRange,
  cashFlow,
  categoryRollup,
  merchantRollup,
  monthlySeries,
  recurringShare,
  toTxnListRange,
} from '../../utils/insights';
import Card from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';
import SkeletonLoader from '../../components/common/SkeletonLoader';
import TimeRangePills from '../../components/common/TimeRangePills';
import AnimatedNumber from '../../components/common/AnimatedNumber';
import CategoryIcon from '../../components/common/CategoryIcon';
import Donut from '../../components/common/Donut';

const PersonalReports: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation<any>();
  const { width: winW } = useWindowDimensions();
  const chartWidth = winW - SPACING['2xl'] * 2 - SPACING['2xl'];

  const transactions = usePersonalStore((s) => s.transactions);
  const subscriptions = usePersonalStore((s) => s.subscriptions);
  const currency = useSettingsStore((state) => state.currency);
  const expenseCategories = useCategories('expense');

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

  // ── Range-scoped computations ──────────────────────────────
  const dr = useMemo(() => getRange(range), [range]);
  const cf = useMemo(() => cashFlow(transactions, dr), [transactions, dr]);
  const cats = useMemo(
    () => categoryRollup(transactions, dr, expenseCategories, C.accent, 6),
    [transactions, dr, expenseCategories, C]
  );
  const merchants = useMemo(() => merchantRollup(transactions, dr, 5), [transactions, dr]);
  const recurring = useMemo(
    () => recurringShare(subscriptions, cf.wentOut),
    [subscriptions, cf.wentOut]
  );

  // ── Fixed 6-month trend (independent of the pill) ──────────
  const series = useMemo(() => monthlySeries(transactions, 6), [transactions]);
  const hasTrend = useMemo(
    () => series.some((p) => p.cameIn > 0 || p.wentOut > 0),
    [series]
  );
  const keptMax = useMemo(
    () => Math.max(...series.map((p) => Math.abs(p.kept)), 1),
    [series]
  );

  // ── Vs last month — shown as deltas on the cash-flow card ──
  const thisCF = useMemo(() => cashFlow(transactions, getRange('this_month')), [transactions]);
  const lastCF = useMemo(() => cashFlow(transactions, getRange('last_month')), [transactions]);
  const inDelta =
    lastCF.cameIn > 0 ? Math.round(((thisCF.cameIn - lastCF.cameIn) / lastCF.cameIn) * 100) : null;
  const spendDelta =
    lastCF.wentOut > 0 ? Math.round(((thisCF.wentOut - lastCF.wentOut) / lastCF.wentOut) * 100) : null;
  const keptDelta =
    lastCF.kept !== 0 ? Math.round(((thisCF.kept - lastCF.kept) / Math.abs(lastCF.kept)) * 100) : null;
  const showMoM = range === 'this_month' && lastCF.count > 0;

  // Average savings rate across months with income (trend caption).
  const avgRate = useMemo(() => {
    const m = series.filter((p) => p.cameIn > 0);
    if (m.length === 0) return null;
    return Math.round(
      (m.reduce((s, p) => s + Math.max(0, Math.min(p.kept / p.cameIn, 1)), 0) / m.length) * 100
    );
  }, [series]);

  // ── Formatting helpers ─────────────────────────────────────
  const money0 = (n: number) =>
    n.toLocaleString('en-MY', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const money2 = (n: number) =>
    n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Hero: count-up kept number (seed 0 → value on mount/change) ─
  const [heroKept, setHeroKept] = useState(0);
  useEffect(() => setHeroKept(Math.abs(cf.kept)), [cf.kept]);
  const heroColor = cf.kept >= 0 ? C.positive : C.neutral;
  const heroTint = cf.kept >= 0 ? C.deepOlive : C.bronze;
  const heroEyebrow = cf.kept >= 0 ? t.reports.thisPeriodKept : t.reports.wentOut;
  const heroSub = useMemo(() => {
    if (cf.cameIn <= 0) return '';
    if (cf.kept >= 0) {
      const pct = Math.round((cf.kept / cf.cameIn) * 100);
      return `${pct}% ${t.reports.ofWhatCameIn}`;
    }
    return t.reports.moreWentOut;
  }, [cf, t]);

  // ── Donut: top categories + an "other" slice so the ring fills ─
  const donutData = useMemo(() => {
    const segs = cats.map((c) => ({ value: c.amount, color: c.color }));
    const top = cats.reduce((s, c) => s + c.amount, 0);
    const other = Math.max(cf.wentOut - top, 0);
    if (other > 0.005) segs.push({ value: other, color: withAlpha(C.textMuted, 0.25) });
    return segs;
  }, [cats, cf.wentOut, C]);

  // ── Trend chart data ───────────────────────────────────────
  const trendData = useMemo(
    () => ({
      labels: series.map((p) => p.label),
      datasets: [
        {
          data: series.map((p) => p.cameIn),
          color: (opacity = 1) => withAlpha(C.positive, opacity),
          strokeWidth: 2,
        },
        {
          data: series.map((p) => p.wentOut),
          color: (opacity = 1) => withAlpha(C.textSecondary, opacity),
          strokeWidth: 2,
        },
      ],
      legend: [t.reports.legendIn, t.reports.legendOut],
    }),
    [series, C, t]
  );

  // ── Drill-down navigation ──────────────────────────────────
  const goToCategory = useCallback(
    (catId: string) => {
      navigation.navigate('TransactionsList', {
        filterCategory: catId,
        filterDateRange: toTxnListRange(range),
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

  // ── Ready gate + pull-to-refresh ───────────────────────────
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

  const chartConfig = {
    backgroundColor: C.surface,
    backgroundGradientFrom: C.surface,
    backgroundGradientTo: C.surface,
    decimalPlaces: 0,
    color: (opacity = 1) => withAlpha(C.accent, opacity),
    labelColor: (opacity = 1) => withAlpha(C.textSecondary, opacity),
    style: { borderRadius: RADIUS.lg },
    propsForDots: { r: '4', strokeWidth: '2' },
  };

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
    if (delta === null || delta === 0) return <Text style={styles.deltaFlat}>—</Text>;
    const up = delta > 0;
    const good = goodWhenDown ? !up : up;
    const color = good ? C.positive : C.neutral;
    return (
      <View style={[styles.deltaPill, { backgroundColor: withAlpha(color, 0.12) }]}>
        <Feather name={up ? 'arrow-up' : 'arrow-down'} size={11} color={color} />
        <Text style={[styles.deltaText, { color }]}>{Math.abs(delta)}%</Text>
      </View>
    );
  };

  const donutTotal = cats.reduce((s, c) => s + c.amount, 0) + Math.max(cf.wentOut - cats.reduce((s, c) => s + c.amount, 0), 0);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={C.accent}
            colors={[C.accent]}
          />
        }
      >
        {/* Hero — the kept number for the selected range */}
        <View style={styles.heroCard}>
          <LinearGradient
            colors={[withAlpha(heroTint, 0.07), withAlpha(C.surface, 0)]}
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
            </>
          )}
        </View>

        {/* Time-range selector */}
        <TimeRangePills value={range} onChange={setRange} labels={rangeLabels} containerStyle={styles.pills} />

        {/* Cash-flow summary (range-scoped) */}
        <Card>
          <Text style={styles.chartTitle}>{t.reports.cashFlow}</Text>
          <View style={styles.statRow}>
            <View style={styles.statItem}>
              <AnimatedNumber value={cf.cameIn} prefix={`${currency} `} decimals={0} style={styles.statValue} />
              <Text style={styles.statLabel}>{t.reports.cameIn}</Text>
              {showMoM && deltaPill(inDelta, false)}
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <AnimatedNumber value={cf.wentOut} prefix={`${currency} `} decimals={0} style={styles.statValue} />
              <Text style={styles.statLabel}>{t.reports.wentOut}</Text>
              {showMoM && deltaPill(spendDelta, true)}
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <AnimatedNumber
                value={Math.abs(cf.kept)}
                prefix={`${currency} `}
                decimals={0}
                style={StyleSheet.flatten([styles.statValue, { color: cf.kept >= 0 ? C.positive : C.neutral }])}
              />
              <Text style={styles.statLabel}>{t.reports.kept}</Text>
              {showMoM && deltaPill(keptDelta, false)}
            </View>
          </View>
          {showMoM && <Text style={styles.cashFlowCaption}>{t.reports.monthOverMonth}</Text>}
        </Card>

        {/* In vs out trend + kept per month */}
        {hasTrend && (
          <Card>
            <Text style={styles.chartTitle}>{t.reports.inVsOut}</Text>
            <LineChart
              data={trendData}
              width={chartWidth}
              height={220}
              chartConfig={chartConfig}
              bezier
              style={styles.chart}
            />
            <Text style={styles.caption}>{t.reports.keptPerMonth}</Text>
            <View style={styles.keptRow}>
              {series.map((p) => {
                const h = (Math.abs(p.kept) / keptMax) * 36;
                return (
                  <View key={p.monthKey} style={styles.keptCol}>
                    <View style={styles.keptBarTrack}>
                      <View
                        style={[
                          styles.keptBar,
                          {
                            height: Math.max(h, p.kept !== 0 ? 3 : 0),
                            backgroundColor: p.kept >= 0 ? C.positive : C.neutral,
                          },
                        ]}
                      />
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
          </Card>
        )}

        {/* Where it went — donut + tappable category rows */}
        {cats.length > 0 && (
          <Card>
            <Text style={styles.chartTitle}>{t.reports.whereItWentRange}</Text>
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
            {cats.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={styles.row}
                onPress={() => goToCategory(c.id)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${c.name}, ${t.reports.seeTransactions}`}
              >
                <View style={[styles.rowChip, { backgroundColor: withAlpha(c.color, 0.12) }]}>
                  <CategoryIcon icon={c.icon} size={18} color={c.color} />
                </View>
                <View style={styles.rowMid}>
                  <Text style={styles.rowName} numberOfLines={1}>{c.name}</Text>
                  <View style={styles.miniBarTrack}>
                    <View
                      style={[styles.miniBarFill, { width: `${Math.min(c.percent, 100)}%`, backgroundColor: c.color }]}
                    />
                  </View>
                </View>
                <View style={styles.rowRight}>
                  <Text style={styles.rowAmount}>{currency} {money2(c.amount)}</Text>
                  <Feather name="chevron-right" size={16} color={C.textMuted} />
                </View>
              </TouchableOpacity>
            ))}
          </Card>
        )}

        {/* Top merchants/places */}
        {merchants.length > 0 && (
          <Card>
            <Text style={styles.chartTitle}>{t.reports.topMerchants}</Text>
            {merchants.map((m, i) => (
              <TouchableOpacity
                key={m.key}
                style={styles.row}
                onPress={() => goToMerchant(m.label)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${m.label}, ${t.reports.seeTransactions}`}
              >
                <View style={[styles.rowChip, { backgroundColor: withAlpha(C.bronze, 0.12) }]}>
                  <Text style={styles.rankText}>{i + 1}</Text>
                </View>
                <View style={styles.rowMid}>
                  <Text style={styles.rowName} numberOfLines={1}>{m.label}</Text>
                  <Text style={styles.rowMeta}>{m.count} {t.reports.times}</Text>
                </View>
                <View style={styles.rowRight}>
                  <Text style={styles.rowAmount}>{currency} {money2(m.amount)}</Text>
                  <Feather name="chevron-right" size={16} color={C.textMuted} />
                </View>
              </TouchableOpacity>
            ))}
          </Card>
        )}

        {/* Recurring share — composition bar */}
        {recurring.monthlyRecurring > 0 && cf.wentOut > 0 && (
          <Card>
            <Text style={styles.chartTitle}>{t.reports.recurringLabel}</Text>
            <Text style={styles.recurringValue}>{currency} {money2(recurring.monthlyRecurring)}</Text>
            <View style={[styles.compBarTrack, { backgroundColor: withAlpha(C.deepOlive, 0.22) }]}>
              <View
                style={[
                  styles.compBarFill,
                  { width: `${Math.min(recurring.ofSpendPercent, 100)}%`, backgroundColor: C.bronze },
                ]}
              />
            </View>
            <Text style={styles.recurringNote}>
              {Math.round(recurring.ofSpendPercent)}% {t.reports.ofWentOutRecurring}
            </Text>
          </Card>
        )}

        <View style={{ height: SPACING['3xl'] }} />
      </ScrollView>
    </View>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    scrollView: { flex: 1 },
    scrollContent: { padding: SPACING['2xl'] },

    // Hero
    heroCard: {
      backgroundColor: C.surface,
      borderRadius: RADIUS.xl,
      padding: SPACING.xl,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
      marginBottom: SPACING.lg,
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
    heroSub: {
      ...TYPE.insight,
      color: C.textSecondary,
      marginTop: SPACING.sm,
    },
    heroEmpty: {
      ...TYPE.narrative,
      color: C.textSecondary,
    },
    pills: { marginBottom: SPACING.lg },

    chartTitle: {
      fontSize: TYPOGRAPHY.size.lg,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
      marginBottom: SPACING.lg,
    },
    chart: { marginVertical: SPACING.sm, borderRadius: RADIUS.lg },
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
      marginTop: SPACING.sm,
    },

    // Stats (cash flow)
    statRow: { flexDirection: 'row', alignItems: 'flex-start' },
    statItem: { flex: 1, alignItems: 'center', gap: SPACING.xs },
    statDivider: { width: 1, height: SPACING['4xl'], backgroundColor: C.border, marginHorizontal: SPACING.md },
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

    // Kept-per-month mini bars
    keptRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 56 },
    keptCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
    keptBarTrack: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', width: '100%' },
    keptBar: {
      width: '46%',
      minWidth: 10,
      borderTopLeftRadius: RADIUS.sm,
      borderTopRightRadius: RADIUS.sm,
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

    // Rows (category + merchant)
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
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
      backgroundColor: withAlpha(C.textMuted, 0.1),
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

    // Recurring composition
    recurringValue: {
      fontSize: TYPOGRAPHY.size['2xl'],
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'],
      marginBottom: SPACING.md,
    },
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
