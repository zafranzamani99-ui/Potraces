import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, InteractionManager } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { subMonths } from 'date-fns';
import { useSavingsStore } from '../../store/savingsStore';
import { useSettingsStore } from '../../store/settingsStore';
import { usePersonalStore } from '../../store/personalStore';
import { usePremiumStore } from '../../store/premiumStore';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useNeu } from '../../components/common/neu';
import EmptyState from '../../components/common/EmptyState';
import Sparkline from '../../components/common/Sparkline';
import FAB from '../../components/common/FAB';
import DebtSegmentedControl from '../../components/debt/DebtSegmentedControl';
import EchoInlineChat, { EchoChip } from '../../components/common/EchoInlineChat';
import PaywallModal from '../../components/common/PaywallModal';
import ModalToastHost from '../../components/common/ModalToastHost';
import ScreenGuide from '../../components/common/ScreenGuide';
import { useToast } from '../../context/ToastContext';
import { useCategories } from '../../hooks/useCategories';
import { useT } from '../../i18n';
import { lightTap, selectionChanged } from '../../services/haptics';
import { SavingsAccount, SavingsSortBy } from '../../types';
import AccountCard from './savings/AccountCard';
import { AddEditAccountSheet, UpdateValueSheet, HistorySheet } from './savings/SavingsSheets';
import {
  computePortfolio, classifyAccounts, computeBreakdown, computeAccountDerived, sortDerived, Portfolio,
} from './savings/savingsMath';
import { selectNudge, Nudge } from './savings/coachingEngine';
import { buildSavingsSnapshot } from './savings/savingsSnapshot';
import { getTypeInfo, CustomResolver } from './savings/investmentTypes';

const MAX_ACCOUNTS = 5;
type TimeRange = '1M' | '3M' | '6M' | '1Y' | 'ALL';
type Tab = 'savings' | 'investment';

const TIME_RANGES: TimeRange[] = ['1M', '3M', '6M', '1Y', 'ALL'];
const SORT_OPTS: { key: SavingsSortBy; labelKey: 'valueLabel' | 'growthLabel' | 'updatedLabel' }[] = [
  { key: 'value', labelKey: 'valueLabel' },
  { key: 'return', labelKey: 'growthLabel' },
  { key: 'updated', labelKey: 'updatedLabel' },
];

const SavingsTracker: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const neu = useNeu();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const { accounts, addAccount, updateAccount, deleteAccount, addSnapshot, sortBy, setSortBy, lastOpenedValue, recordOpen } = useSavingsStore();
  const currency = useSettingsStore((s) => s.currency);
  const tier = usePremiumStore((s) => s.tier);
  const transactions = usePersonalStore((s) => s.transactions);
  const investmentCats = useCategories('investment');

  const resolveCustom = useCallback<CustomResolver>((id) => {
    const c = investmentCats.find((x) => x.id === id);
    return c ? { name: c.name, icon: c.icon, color: c.color } : undefined;
  }, [investmentCats]);

  // ── UI state ──
  const [timeRange, setTimeRange] = useState<TimeRange>('ALL');
  const [tab, setTab] = useState<Tab>('savings');
  const [ready, setReady] = useState(false);

  // sheets
  const [addEditOpen, setAddEditOpen] = useState(false);
  const [editing, setEditing] = useState<SavingsAccount | null>(null);
  const [updateOpen, setUpdateOpen] = useState(false);
  const [updating, setUpdating] = useState<SavingsAccount | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyAcc, setHistoryAcc] = useState<SavingsAccount | null>(null);

  // echo + paywall
  const [echoOpen, setEchoOpen] = useState(false);
  const [echoAutoPrompt, setEchoAutoPrompt] = useState<string | undefined>(undefined);
  const [paywallOpen, setPaywallOpen] = useState(false);

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setReady(true));
    return () => task.cancel();
  }, []);

  useFocusEffect(useCallback(() => () => { if (accounts.length > 0) recordOpen(); }, [accounts.length, recordOpen]));

  const now = useMemo(() => new Date(), [accounts]); // stable per data change

  // ── Whole-portfolio (hero) ──
  const portfolio = useMemo(() => computePortfolio(accounts, now), [accounts, now]);
  const sinceLastCheck = useMemo(() => {
    if (lastOpenedValue === null || accounts.length === 0) return null;
    const diff = portfolio.totalCurrent - lastOpenedValue;
    return Math.abs(diff) < 0.01 ? null : diff;
  }, [portfolio.totalCurrent, lastOpenedValue, accounts.length]);

  const chartData = useMemo(() => timeRangeFilter(portfolio, timeRange, now), [portfolio, timeRange, now]);
  const periodChange = useMemo(() => {
    if (chartData.length < 2) return null;
    const first = chartData[0]; const last = chartData[chartData.length - 1];
    return { diff: last - first, pct: first > 0 ? ((last - first) / first) * 100 : 0 };
  }, [chartData]);

  // ── Split ──
  const split = useMemo(() => classifyAccounts(accounts, resolveCustom), [accounts, resolveCustom]);
  const tabAccounts = tab === 'savings' ? split.savings : split.investments;
  const tabPortfolio = useMemo(() => computePortfolio(tabAccounts, now), [tabAccounts, now]);
  const tabBreakdown = useMemo(() => computeBreakdown(tabAccounts, resolveCustom), [tabAccounts, resolveCustom]);
  const derived = useMemo(() => tabAccounts.map((a) => computeAccountDerived(a, now, resolveCustom)), [tabAccounts, now, resolveCustom]);
  const sorted = useMemo(() => sortDerived(derived, sortBy, []), [derived, sortBy]);

  // ── avg monthly spend for runway (last 90 days of personal expenses) ──
  const avgMonthlySpend = useMemo(() => {
    const cutoff = subMonths(now, 3);
    let total = 0;
    for (const tx of transactions) {
      if ((tx as any).type !== 'expense') continue;
      const d = (tx as any).date instanceof Date ? (tx as any).date : new Date((tx as any).date);
      if (d >= cutoff) total += (tx as any).amount || 0;
    }
    return total / 3;
  }, [transactions, now]);

  const nudge = useMemo<Nudge | null>(() => selectNudge({
    tab, accounts: tabAccounts, portfolio: tabPortfolio, breakdown: tabBreakdown, avgMonthlySpend, now,
  }), [tab, tabAccounts, tabPortfolio, tabBreakdown, avgMonthlySpend, now]);

  const fmt = useCallback((v: number) => `${currency} ${v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, [currency]);
  const fmtShort = useCallback((v: number) => (Math.abs(v) >= 1000 ? `${currency} ${(v / 1000).toFixed(1)}k` : `${currency} ${Math.round(v)}`), [currency]);

  // ── Echo ──
  const savingsChips: EchoChip[] = useMemo(() => [
    { label: 'am I on track?', question: 'based on my current pace, am I on track to hit my savings targets?' },
    { label: 'too concentrated?', question: 'is my portfolio too concentrated in one type? should I diversify?' },
    { label: 'best performer?', question: 'which of my savings/investments is doing best and worst, and why?' },
    { label: 'patut simpan lagi?', question: 'patut ke aku tambah simpanan bulan ni, atau cukup dah?' },
  ], []);
  const snapshot = useMemo(() => buildSavingsSnapshot({ accounts, portfolio, breakdown: computeBreakdown(accounts, resolveCustom), currency, now, resolveCustom }), [accounts, portfolio, currency, now, resolveCustom]);

  const openEcho = useCallback((prompt?: string) => {
    if (tier !== 'premium') { setPaywallOpen(true); return; }
    lightTap();
    setEchoAutoPrompt(prompt);
    setEchoOpen(true);
  }, [tier]);

  // ── Add/edit/update/history/delete ──
  const openAdd = useCallback(() => {
    if (accounts.length >= MAX_ACCOUNTS) { setPaywallOpen(true); return; }
    setEditing(null); setAddEditOpen(true);
  }, [accounts.length]);
  const openEdit = useCallback((a: SavingsAccount) => { setEditing(a); setAddEditOpen(true); }, []);
  const openUpdate = useCallback((a: SavingsAccount) => { setUpdating(a); setUpdateOpen(true); }, []);
  const openHistory = useCallback((a: SavingsAccount) => { setHistoryAcc(a); setHistoryOpen(true); }, []);

  const nudgeCopy = useMemo(() => (nudge ? renderNudge(nudge, t, fmtShort) : null), [nudge, t, fmtShort]);
  const onNudgeAction = useCallback(() => {
    if (!nudge) return;
    if (nudge.kind === 'stale') { const a = tabAccounts.find((x) => x.name === nudge.data.name); if (a) openUpdate(a); }
    else if (nudge.kind === 'runway' || nudge.kind === 'addedThisMonth') openAdd();
    else if (nudge.kind === 'concentration') openEcho(savingsChips[1].question);
  }, [nudge, tabAccounts, openUpdate, openAdd, openEcho, savingsChips]);

  const segTabs = useMemo(() => [
    { key: 'savings' as Tab, label: t.savings.savingsTab, count: split.savings.length, color: C.accent },
    { key: 'investment' as Tab, label: t.savings.investmentsTab, count: split.investments.length, color: C.bronze },
  ], [t, split, C]);

  const showBar = ready && accounts.length > 0;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!ready && <View style={styles.loading}><Text style={styles.muted}>{t.savings.loading}</Text></View>}

        {ready && accounts.length === 0 && (
          <EmptyState icon="m/piggy-bank-outline" title={t.savings.startBuilding} message={t.savings.setAside} actionLabel={t.savings.addSavings} onAction={openAdd} />
        )}

        {showBar && (
          <>
            {/* HERO */}
            <View style={[styles.hero, neu.raisedSoft]}>
              <Text style={styles.heroLabel}>{t.savings.totalValue}</Text>
              <Text style={styles.heroAmount}>{fmt(portfolio.totalCurrent)}</Text>
              {sinceLastCheck !== null && (
                <View style={[styles.since, { backgroundColor: withAlpha(sinceLastCheck >= 0 ? C.positive : C.neutral, 0.12) }]}>
                  <Feather name={sinceLastCheck >= 0 ? 'trending-up' : 'trending-down'} size={12} color={sinceLastCheck >= 0 ? C.positive : C.neutral} />
                  <Text style={[styles.sinceText, { color: sinceLastCheck >= 0 ? C.positive : C.neutral }]}>
                    {sinceLastCheck >= 0 ? '+' : ''}{fmt(sinceLastCheck)} {t.savings.sinceLastCheck}
                  </Text>
                </View>
              )}
              {chartData.length >= 2 && (
                <View style={styles.heroChart}><Sparkline data={chartData} height={72} color={C.accent} showDot filled strokeWidth={2.5} /></View>
              )}
              <View style={styles.ranges}>
                {TIME_RANGES.map((r) => (
                  <TouchableOpacity key={r} onPress={() => { setTimeRange(r); selectionChanged(); }} style={[styles.range, timeRange === r && styles.rangeOn]} activeOpacity={0.7}>
                    <Text style={[styles.rangeText, timeRange === r && styles.rangeTextOn]}>{r === 'ALL' ? t.savings.timeRangeAll : r}</Text>
                  </TouchableOpacity>
                ))}
                {periodChange && (
                  <Text style={[styles.rangeChange, { color: periodChange.diff >= 0 ? C.positive : C.neutral }]}>
                    {periodChange.diff >= 0 ? '+' : ''}{periodChange.pct.toFixed(1)}%
                  </Text>
                )}
              </View>
              <View style={styles.heroStats}>
                <View style={styles.hs}><Text style={styles.hsK}>{t.savings.invested}</Text><Text style={styles.hsV}>{fmtShort(portfolio.totalInvested)}</Text></View>
                <View style={[styles.hs, styles.hsBorder]}><Text style={styles.hsK}>{t.savings.growth}</Text><Text style={[styles.hsV, { color: portfolio.totalGain >= 0 ? C.positive : C.neutral }]}>{portfolio.totalGain >= 0 ? '+' : ''}{fmtShort(portfolio.totalGain)}</Text></View>
                <View style={[styles.hs, styles.hsBorder]}><Text style={styles.hsK}>{t.savings.returnLabel}</Text><Text style={[styles.hsV, { color: portfolio.totalReturn >= 0 ? C.positive : C.neutral }]}>{portfolio.totalReturn >= 0 ? '+' : ''}{portfolio.totalReturn.toFixed(1)}%</Text></View>
              </View>
            </View>

            {/* ASK ECHO */}
            <TouchableOpacity activeOpacity={0.85} onPress={() => openEcho()} style={[styles.askEcho, neu.insetSoft]}>
              <View style={[styles.askSpark, { backgroundColor: withAlpha(C.accent, 0.12) }]}>
                <Feather name="zap" size={14} color={C.accent} />
              </View>
              <Text style={styles.askPh} numberOfLines={1}>{t.savings.askEchoBar}</Text>
              <View style={styles.plusBadge}><Text style={styles.plusBadgeText}>PLUS</Text></View>
            </TouchableOpacity>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {savingsChips.map((c) => (
                <TouchableOpacity key={c.label} onPress={() => openEcho(c.question)} style={[styles.chip, neu.raised]} activeOpacity={0.8}>
                  <Text style={styles.chipText}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* SEGMENTED */}
            <View style={styles.seg}>
              <DebtSegmentedControl tabs={segTabs} active={tab} onSelect={(k) => { setTab(k); selectionChanged(); }} itemNoun={t.savings.accounts} />
            </View>

            {/* COACHING BAND */}
            {nudgeCopy && (
              <View style={[styles.coach, neu.raisedSoft]}>
                <View style={[styles.coachIcon, neu.well, { backgroundColor: withAlpha(nudgeCopy.tone === 'investment' ? C.bronze : C.accent, 0.14) }]}>
                  <Feather name={nudgeCopy.icon as any} size={22} color={nudgeCopy.tone === 'investment' ? C.bronze : C.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.coachTitle}>{nudgeCopy.title}</Text>
                  <Text style={styles.coachBody}>{nudgeCopy.body}</Text>
                  <View style={styles.coachActions}>
                    {nudgeCopy.action && (
                      <Pressable onPress={onNudgeAction} style={[styles.coachCta, { backgroundColor: nudgeCopy.tone === 'investment' ? C.bronze : C.accent }]}>
                        <Text style={styles.coachCtaText}>{nudgeCopy.action}</Text>
                        <Feather name="arrow-right" size={13} color="#fff" />
                      </Pressable>
                    )}
                    <Pressable onPress={() => openEcho(nudgeCopy.echoPrompt)} style={[styles.coachAsk, neu.raised]}>
                      <Feather name="zap" size={12} color={C.accent} />
                      <Text style={styles.coachAskText}>{t.savings.askEcho}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}

            {/* ALLOCATION */}
            {tabBreakdown.length >= 2 && (
              <View style={[styles.card, neu.raisedSoft]}>
                <Text style={styles.sectionLabel}>{tab === 'savings' ? t.savings.whereSavingsLive : t.savings.whereInvestmentsLive}</Text>
                {tabBreakdown.map((b) => (
                  <View key={b.id} style={styles.allocRow}>
                    <View style={[styles.allocDot, { backgroundColor: b.color }]} />
                    <Text style={styles.allocName} numberOfLines={1}>{b.name}</Text>
                    <View style={styles.allocBar}><View style={[styles.allocFill, { width: `${Math.max(b.pct, 3)}%`, backgroundColor: b.color }]} /></View>
                    <Text style={styles.allocPct}>{b.pct.toFixed(0)}%</Text>
                  </View>
                ))}
              </View>
            )}

            {/* SORT */}
            {tabAccounts.length > 1 && (
              <View style={styles.sortRow}>
                {SORT_OPTS.map((o) => (
                  <TouchableOpacity key={o.key} onPress={() => { setSortBy(o.key); selectionChanged(); }} style={[styles.sortChip, neu.raised, sortBy === o.key && { backgroundColor: C.accent }]} activeOpacity={0.8}>
                    <Text style={[styles.sortChipText, sortBy === o.key && { color: '#fff' }]}>{t.savings[o.labelKey]}</Text>
                  </TouchableOpacity>
                ))}
                <Text style={styles.count}>{t.savings.accountsCount.replace('{n}', String(tabAccounts.length))}</Text>
              </View>
            )}

            {/* ACCOUNT CARDS */}
            {sorted.length > 0 ? (
              sorted.map((d) => (
                <AccountCard key={d.account.id} account={d.account} derived={d} currency={currency} onEdit={openEdit} onUpdate={openUpdate} onHistory={openHistory} />
              ))
            ) : (
              <View style={styles.tabEmpty}>
                <Feather name={tab === 'savings' ? 'shield' : 'trending-up'} size={26} color={C.textMuted} />
                <Text style={styles.tabEmptyText}>{tab === 'savings' ? t.savings.emptySavingsTab : t.savings.emptyInvestTab}</Text>
              </View>
            )}

            {/* WAYS TO GROW (investments) */}
            {tab === 'investment' && (
              <View style={[styles.grow, { borderColor: withAlpha(C.accent, 0.4) }]}>
                <Text style={styles.growTag}>{t.savings.growTitle} · {t.savings.growOptional}</Text>
                <Text style={styles.growTitle}>{t.savings.growCashTitle}</Text>
                <Text style={styles.growBody}>{t.savings.growCashBody}</Text>
                <TouchableOpacity onPress={() => { lightTap(); showToast(t.savings.growTitle, 'info'); }} style={styles.growGo}>
                  <Text style={styles.growGoText}>{t.savings.growExplore}</Text>
                  <Feather name="arrow-up-right" size={13} color={C.accent} />
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {showBar && accounts.length < MAX_ACCOUNTS && <FAB icon="plus" onPress={openAdd} />}
      {showBar && accounts.length >= MAX_ACCOUNTS && <FAB icon="lock" onPress={() => setPaywallOpen(true)} />}

      {/* Sheets */}
      <AddEditAccountSheet
        visible={addEditOpen} editing={editing} currency={currency}
        onClose={() => { setAddEditOpen(false); setEditing(null); }}
        onAdd={addAccount} onUpdate={updateAccount} onSnapshot={addSnapshot} onDelete={deleteAccount}
        investmentCats={investmentCats}
      />
      <UpdateValueSheet
        visible={updateOpen} account={updating} currency={currency}
        onClose={() => { setUpdateOpen(false); setUpdating(null); }} onSnapshot={addSnapshot}
      />
      <HistorySheet
        visible={historyOpen} account={historyAcc} currency={currency}
        onClose={() => { setHistoryOpen(false); setHistoryAcc(null); }}
      />

      {/* Echo + paywall */}
      <EchoInlineChat
        visible={echoOpen} onClose={() => setEchoOpen(false)}
        insightTitle={fmt(portfolio.totalCurrent)}
        insightSubtitle={t.savings.askEchoSub.replace('{return}', `${portfolio.totalReturn >= 0 ? '+' : ''}${portfolio.totalReturn.toFixed(1)}%`)}
        chips={savingsChips} contextSnapshot={snapshot} autoPrompt={echoAutoPrompt}
        topInset={insets.top} bottomInset={insets.bottom}
      />
      <PaywallModal visible={paywallOpen} onClose={() => setPaywallOpen(false)} feature="ai" />
      <ModalToastHost />
      <ScreenGuide
        id="guide_savings"
        title={t.guide.yourSavings}
        icon="archive"
        description={t.guide.descSavings}
        points={[
          { icon: 'plus', text: t.guide.savingsPoint1 },
          { icon: 'edit-3', text: t.guide.savingsPoint2 },
        ]}
      />
    </View>
  );
};

// ── helpers ──
function timeRangeFilter(portfolio: Portfolio, range: TimeRange, now: Date): number[] {
  const spark = portfolio.fullSparkline;
  if (spark.length < 2) return [];
  if (range === 'ALL') return spark.map((p) => p.value);
  const cutoff = { '1M': subMonths(now, 1), '3M': subMonths(now, 3), '6M': subMonths(now, 6), '1Y': subMonths(now, 12) }[range];
  const filtered = spark.filter((p) => new Date(p.date) >= cutoff);
  return filtered.length >= 2 ? filtered.map((p) => p.value) : spark.map((p) => p.value);
}

function renderNudge(n: Nudge, t: any, fmtShort: (v: number) => string) {
  const s = t.savings;
  const d = n.data;
  let title = ''; let body = ''; let action: string | undefined; let echoPrompt = '';
  switch (n.kind) {
    case 'stale':
      title = s.coachStaleTitle; body = s.coachStaleBody.replace('{name}', String(d.name)).replace('{days}', String(d.days));
      action = s.coachStaleAction; echoPrompt = `how should I keep ${d.name} up to date?`; break;
    case 'runway':
      title = s.coachRunwayTitle.replace('{months}', String(d.months));
      body = s.coachRunwayBody.replace('{saved}', fmtShort(Number(d.saved))).replace('{months}', String(d.months)).replace('{gap}', fmtShort(Number(d.gap))).replace('{target}', String(d.targetMonths));
      action = s.coachRunwayAction; echoPrompt = 'how much more should I save for a 6-month emergency fund?'; break;
    case 'concentration':
      title = s.coachConcTitle; body = s.coachConcBody.replace('{pct}', String(d.pct)).replace('{name}', String(d.name));
      action = s.coachConcAction; echoPrompt = 'is my portfolio too concentrated? how should I diversify?'; break;
    case 'milestone':
      title = s.coachMilestoneTitle.replace('{remaining}', fmtShort(Number(d.remaining)));
      body = s.coachMilestoneBody.replace('{pct}', String(d.pct)).replace('{value}', fmtShort(Number(d.value)));
      echoPrompt = `how can I reach ${fmtShort(Number(d.value))} faster?`; break;
    case 'bestPerformer':
      title = s.coachBestTitle.replace('{name}', String(d.name)); body = s.coachBestBody.replace('{pct}', String(d.pct));
      echoPrompt = `why is ${d.name} performing well this month?`; break;
    case 'addedThisMonth':
      title = s.coachAddedTitle.replace('{amount}', fmtShort(Number(d.amount))); body = s.coachAddedBody;
      action = s.coachRunwayAction; echoPrompt = 'am I saving enough each month?'; break;
  }
  return { title, body, action, echoPrompt, icon: n.icon, tone: n.tone };
}

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  content: { padding: SPACING.lg, paddingBottom: 120 },
  loading: { alignItems: 'center', paddingTop: 80 },
  muted: { fontSize: TYPOGRAPHY.size.sm, color: C.textMuted },

  hero: { backgroundColor: C.background, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md },
  heroLabel: { fontSize: TYPOGRAPHY.size.xs, letterSpacing: 1, textTransform: 'uppercase', color: C.textMuted, fontWeight: '600' },
  heroAmount: { fontSize: 38, fontWeight: '300', color: C.textPrimary, letterSpacing: -0.5, marginTop: 4, fontVariant: ['tabular-nums'] },
  since: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 9, paddingVertical: 4, borderRadius: RADIUS.full },
  sinceText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: '700', fontVariant: ['tabular-nums'] },
  heroChart: { marginTop: 14, marginHorizontal: -4 },
  ranges: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  range: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.full },
  rangeOn: { backgroundColor: C.accent },
  rangeText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: '600', color: C.textSecondary },
  rangeTextOn: { color: '#fff' },
  rangeChange: { marginLeft: 'auto', fontSize: TYPOGRAPHY.size.xs, fontWeight: '700', fontVariant: ['tabular-nums'] },
  heroStats: { flexDirection: 'row', marginTop: 14, paddingTop: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  hs: { flex: 1 },
  hsBorder: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: C.border, paddingLeft: 12 },
  hsK: { fontSize: 10.5, letterSpacing: 0.4, textTransform: 'uppercase', color: C.textMuted, fontWeight: '600' },
  hsV: { fontSize: TYPOGRAPHY.size.base, fontWeight: '700', color: C.textPrimary, marginTop: 3, fontVariant: ['tabular-nums'] },

  askEcho: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.background, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 12, marginBottom: 10 },
  askSpark: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  askPh: { flex: 1, fontSize: TYPOGRAPHY.size.sm, color: C.textMuted, fontWeight: '500' },
  plusBadge: { borderWidth: 1, borderColor: withAlpha(C.gold, 0.55), borderRadius: RADIUS.full, paddingHorizontal: 7, paddingVertical: 2 },
  plusBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5, color: C.gold },
  chipRow: { gap: 8, paddingBottom: 4, marginBottom: 6 },
  chip: { backgroundColor: C.background, paddingHorizontal: 13, paddingVertical: 8, borderRadius: RADIUS.full },
  chipText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: '600', color: C.textPrimary },

  seg: { marginTop: 6, marginBottom: SPACING.md },

  coach: { flexDirection: 'row', gap: 13, alignItems: 'flex-start', backgroundColor: C.background, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md },
  coachIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  coachTitle: { fontSize: TYPOGRAPHY.size.base, fontWeight: '700', color: C.textPrimary, letterSpacing: -0.2, marginBottom: 3 },
  coachBody: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary, lineHeight: 18 },
  coachActions: { flexDirection: 'row', gap: 9, marginTop: 11, flexWrap: 'wrap' },
  coachCta: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full },
  coachCtaText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: '700', color: '#fff' },
  coachAsk: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: C.background },
  coachAskText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: '700', color: C.accent },

  card: { backgroundColor: C.background, borderRadius: RADIUS.xl, padding: SPACING.lg, marginBottom: SPACING.md },
  sectionLabel: { fontSize: TYPOGRAPHY.size.xs, letterSpacing: 1, textTransform: 'uppercase', color: C.textMuted, fontWeight: '600', marginBottom: 6 },
  allocRow: { flexDirection: 'row', alignItems: 'center', gap: 11, marginTop: 11 },
  allocDot: { width: 9, height: 9, borderRadius: 3 },
  allocName: { fontSize: TYPOGRAPHY.size.xs, fontWeight: '600', color: C.textPrimary, width: 96 },
  allocBar: { flex: 1, height: 8, borderRadius: RADIUS.full, backgroundColor: C.pillBg, overflow: 'hidden' },
  allocFill: { height: '100%', borderRadius: RADIUS.full },
  allocPct: { fontSize: TYPOGRAPHY.size.xs, fontWeight: '700', color: C.textSecondary, width: 36, textAlign: 'right', fontVariant: ['tabular-nums'] },

  sortRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SPACING.md },
  sortChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: C.background },
  sortChipText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: '600', color: C.textSecondary },
  count: { marginLeft: 'auto', fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, fontWeight: '600' },

  tabEmpty: { alignItems: 'center', gap: 8, paddingVertical: 36 },
  tabEmptyText: { fontSize: TYPOGRAPHY.size.sm, color: C.textMuted, fontWeight: '600' },

  grow: { borderRadius: RADIUS.xl, padding: SPACING.lg, marginTop: 4, borderWidth: 1, borderStyle: 'dashed', backgroundColor: withAlpha(C.accent, 0.05) },
  growTag: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: C.accent, fontWeight: '700' },
  growTitle: { fontSize: TYPOGRAPHY.size.base, fontWeight: '700', color: C.textPrimary, marginTop: 6, marginBottom: 3 },
  growBody: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary },
  growGo: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 11 },
  growGoText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: '700', color: C.accent },
});

export default SavingsTracker;
