import React, { useState, useMemo, useCallback, useEffect, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, InteractionManager, Linking } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { subMonths, parseISO, differenceInDays } from 'date-fns';
import { useSavingsStore } from '../../store/savingsStore';
import { useSettingsStore } from '../../store/settingsStore';
import { usePersonalStore } from '../../store/personalStore';
import { usePremiumStore } from '../../store/premiumStore';
import { TIER_LIMITS } from '../../constants/premium';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useNeu } from '../../components/common/neu';
import EmptyState from '../../components/common/EmptyState';
import Sparkline from '../../components/common/Sparkline';
import FAB from '../../components/common/FAB';
import DebtSegmentedControl from '../../components/debt/DebtSegmentedControl';
import EchoInlineChat, { EchoChip } from '../../components/common/EchoInlineChat';
import EchoFab from '../../components/wallet/EchoFab';
import { useEchoFabPan } from '../../hooks/useEchoFabPan';
import PaywallModal from '../../components/common/PaywallModal';
import HowItWorksModal, { HowItWorksSection } from '../../components/common/HowItWorksModal';
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
import { CustomResolver } from './savings/investmentTypes';

type TimeRange = '1M' | '3M' | '6M' | '1Y' | 'ALL';
type Tab = 'savings' | 'investment';

const TIME_RANGES: TimeRange[] = ['1M', '3M', '6M', '1Y', 'ALL'];
const SORT_OPTS: { key: SavingsSortBy; labelKey: 'valueLabel' | 'growthLabel' | 'updatedLabel' }[] = [
  { key: 'value', labelKey: 'valueLabel' },
  { key: 'return', labelKey: 'growthLabel' },
  { key: 'updated', labelKey: 'updatedLabel' },
];

// "How it works" explainer content (mirrors the Bills screen's grouped modal).
const SAVINGS_HOW: HowItWorksSection[] = [
  {
    group: 'the basics',
    items: [
      { icon: 'columns', bold: 'savings vs investments', rest: '— capital-safe accounts (bank, ASB, Tabung Haji, fixed deposit) sit under Savings; market accounts (robo, crypto, stocks, gold) under Investments. the screen splits them for you.' },
      { icon: 'plus-circle', bold: 'put in vs now', rest: "— 'put in' is what you originally deposited; 'now' is what it's worth today. leave 'put in' blank and it matches 'now', so you start at zero gain." },
      { icon: 'percent', bold: 'return %', rest: '— (now − put in) ÷ put in. green means the account is up, muted means it is down.' },
    ],
  },
  {
    group: 'tracking your balance',
    items: [
      { icon: 'refresh-cw', bold: 'update value', rest: '— tap update on a card whenever you check a balance. each update is saved as a dated snapshot.' },
      { icon: 'plus-circle', bold: 'add money, withdraw, dividend', rest: '— tag an update so the math stays right: adding or withdrawing cash adjusts your "put in", so your return isn\'t thrown off, while a dividend counts as return.' },
      { icon: 'bar-chart-2', bold: 'history & chart', rest: '— every snapshot builds the sparkline and the history sheet, so you can watch growth over time.' },
    ],
  },
  {
    group: 'goals & coaching',
    items: [
      { icon: 'target', bold: 'set a target', rest: '— give an account a goal amount and Savings shows a progress bar and an ETA at your current pace.' },
      { icon: 'sun', bold: 'projected earnings', rest: '— add an annual rate (e.g. 4.25% for ASB) and each card estimates your earnings for the year.' },
      { icon: 'zap', bold: 'Echo & nudges', rest: '— the coaching band and Echo give tips based on your accounts, and flag any that have gone stale.' },
    ],
  },
];

const SavingsTracker: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const neu = useNeu();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { showToast } = useToast();

  const { accounts, addAccount, updateAccount, deleteAccount, addSnapshot, sortBy, setSortBy, lastOpenedValue, recordOpen } = useSavingsStore();
  const currency = useSettingsStore((s) => s.currency);
  const tier = usePremiumStore((s) => s.tier);
  const canCreateSavingsAccount = usePremiumStore((s) => s.canCreateSavingsAccount);
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
  // Which feature triggered the paywall — the account cap and the Echo/AI gate share
  // one modal, so this drives the correct copy ('savings' vs 'ai') instead of both
  // showing "AI Limit Reached".
  const [paywallFeature, setPaywallFeature] = useState<'ai' | 'savings'>('ai');
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  // Free tier is capped; premium is unlimited. The cap number for display + gating.
  const atAccountCap = !canCreateSavingsAccount(accounts.length);
  const savingsAccountLimit = TIER_LIMITS[tier].maxSavingsAccounts;

  // ── Draggable Echo FAB — same mechanism as Wallet / Bills ──
  const echoHidden = useSettingsStore((s) => s.savingsEchoHidden);
  const setEchoHidden = useSettingsStore((s) => s.setSavingsEchoHidden);
  const [greetingDismissed, setGreetingDismissed] = useState(false);
  const [greetingHiddenDuringDrag, setGreetingHiddenDuringDrag] = useState(false);
  const [fabSide, setFabSide] = useState<'left' | 'right'>('right');
  const { echoFabPan, echoFabPanResponder, hideZoneAnim, hideZoneHoverAnim, fabScale, hideZoneRef } = useEchoFabPan({
    fabSide,
    setFabSide,
    setGreetingHiddenDuringDrag,
    onHide: () => setEchoHidden(true),
    insets,
  });

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setReady(true));
    return () => task.cancel();
  }, []);

  // Record the "since last check" baseline only on real blur/unmount. Read the
  // count fresh from the store so the callback identity stays stable while
  // focused (using accounts.length as a dep would re-fire recordOpen on every
  // add/delete, silently wiping the "since last check" pill mid-session).
  useFocusEffect(useCallback(() => () => { if (useSavingsStore.getState().accounts.length > 0) recordOpen(); }, [recordOpen]));

  const now = useMemo(() => new Date(), []); // fixed at mount — fine for a pushed screen

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
    // A 0 (or negative) baseline makes the % meaningless (div-by-zero → a fake
    // '+0.0%' despite a real gain), so report the diff but null the percentage.
    return { diff: last - first, pct: first > 0 ? ((last - first) / first) * 100 : null };
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
    let earliest: Date | null = null;
    for (const tx of transactions) {
      if ((tx as any).type !== 'expense') continue;
      const d = (tx as any).date instanceof Date ? (tx as any).date : new Date((tx as any).date);
      if (d >= cutoff) { total += (tx as any).amount || 0; if (!earliest || d < earliest) earliest = d; }
    }
    if (!earliest) return 0;
    // Divide by the ACTUAL months of data present (clamped to [1,3]) so new users
    // with < 3 months of history don't get an understated spend (which would
    // inflate the runway and suppress the emergency-fund nudge).
    const monthsSpan = Math.min(3, Math.max(differenceInDays(now, earliest) / 30, 1));
    return total / monthsSpan;
  }, [transactions, now]);

  const nudge = useMemo<Nudge | null>(() => selectNudge({
    tab, accounts: tabAccounts, portfolio: tabPortfolio, breakdown: tabBreakdown, avgMonthlySpend, now,
  }), [tab, tabAccounts, tabPortfolio, tabBreakdown, avgMonthlySpend, now]);

  const fmt = useCallback((v: number) => `${currency} ${v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, [currency]);
  const fmtShort = useCallback((v: number) => (Math.abs(v) >= 1000 ? `${currency} ${(v / 1000).toFixed(1)}k` : `${currency} ${Math.round(v)}`), [currency]);

  // ── Echo ──
  const savingsChips: EchoChip[] = useMemo(() => [
    { label: t.savings.chipOnTrack, question: t.savings.chipOnTrackQ },
    { label: t.savings.chipConcentrated, question: t.savings.chipConcentratedQ },
    { label: t.savings.chipBest, question: t.savings.chipBestQ },
    { label: t.savings.chipSaveMore, question: t.savings.chipSaveMoreQ },
  ], [t]);
  const snapshot = useMemo(() => buildSavingsSnapshot({ accounts, portfolio, breakdown: computeBreakdown(accounts, resolveCustom), currency, now, resolveCustom }), [accounts, portfolio, currency, now, resolveCustom]);

  const openEcho = useCallback((prompt?: string) => {
    if (!TIER_LIMITS[tier].askEchoPerScreen) { setPaywallFeature('ai'); setPaywallOpen(true); return; }
    lightTap();
    setEchoAutoPrompt(prompt);
    setEchoOpen(true);
  }, [tier]);

  const showAccountPaywall = useCallback(() => { setPaywallFeature('savings'); setPaywallOpen(true); }, []);

  // ── Add/edit/update/history/delete ──
  const openAdd = useCallback(() => {
    // Free tier is capped; premium unlocks more (a real upsell, not a dead one).
    if (!canCreateSavingsAccount(accounts.length)) { showAccountPaywall(); return; }
    setEditing(null); setAddEditOpen(true);
  }, [accounts.length, canCreateSavingsAccount, showAccountPaywall]);
  const openEdit = useCallback((a: SavingsAccount) => { setEditing(a); setAddEditOpen(true); }, []);
  const openUpdate = useCallback((a: SavingsAccount) => { setUpdating(a); setUpdateOpen(true); }, []);
  const openHistory = useCallback((a: SavingsAccount) => { setHistoryAcc(a); setHistoryOpen(true); }, []);

  const nudgeCopy = useMemo(() => (nudge ? renderNudge(nudge, t, fmtShort) : null), [nudge, t, fmtShort]);
  const onNudgeAction = useCallback(() => {
    if (!nudge) return;
    if (nudge.kind === 'stale') { const a = tabAccounts.find((x) => x.id === nudge.data.id); if (a) openUpdate(a); }
    else if (nudge.kind === 'runway' || nudge.kind === 'addedThisMonth') openAdd();
    else if (nudge.kind === 'concentration') openEcho(savingsChips[1].question);
  }, [nudge, tabAccounts, openUpdate, openAdd, openEcho, savingsChips]);

  const segTabs = useMemo(() => [
    { key: 'savings' as Tab, label: t.savings.savingsTab, count: split.savings.length, color: C.accent },
    { key: 'investment' as Tab, label: t.savings.investmentsTab, count: split.investments.length, color: C.bronze },
  ], [t, split, C]);

  // Un-dismiss the greeting bubble ONLY on a genuine screen focus. Stable deps keep
  // the callback identity fixed so React Navigation re-runs it on focus — not every
  // time the coaching insight (nudgeCopy) changes, which used to resurrect a bubble
  // the user had just dismissed.
  useFocusEffect(useCallback(() => { setGreetingDismissed(false); }, []));

  // Greeting text is derived straight from the live coaching insight (prefer the
  // nudge, else a default). It's stable across unrelated renders because nudgeCopy
  // is memoized, so the bubble doesn't re-type; dismissal is a separate flag.
  const greetingText = nudgeCopy?.title ?? t.savings.echoGreetingDefault;

  // Header buttons — "how it works" help (always) + Echo restore (only while the
  // FAB is hidden and there are accounts), mirroring the Bills screen's header row.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <TouchableOpacity
            onPress={() => { lightTap(); setHowItWorksOpen(true); }}
            accessibilityRole="button"
            accessibilityLabel="How it works"
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
          >
            <Feather name="help-circle" size={19} color={C.textMuted} />
          </TouchableOpacity>
          {accounts.length > 0 && echoHidden && (
            <TouchableOpacity
              // Restoring the FAB isn't a premium action — the FAB itself gates on tier
              // and shows the paywall on tap — so always bring it back.
              onPress={() => { lightTap(); setEchoHidden(false); }}
              accessibilityRole="button"
              accessibilityLabel={t.savings.askEcho}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}
            >
              <Feather name="zap" size={20} color={!TIER_LIMITS[tier].askEchoPerScreen ? C.textMuted : C.textPrimary} />
            </TouchableOpacity>
          )}
        </View>
      ),
    });
  }, [echoHidden, tier, accounts.length, navigation, C, setEchoHidden, t]);

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
                  <TouchableOpacity key={r} onPress={() => { setTimeRange(r); selectionChanged(); }} style={[styles.range, timeRange === r && styles.rangeOn]} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }} accessibilityRole="button" accessibilityState={{ selected: timeRange === r }} accessibilityLabel={r === 'ALL' ? t.savings.timeRangeAll : r}>
                    <Text style={[styles.rangeText, timeRange === r && styles.rangeTextOn]}>{r === 'ALL' ? t.savings.timeRangeAll : r}</Text>
                  </TouchableOpacity>
                ))}
                {periodChange && periodChange.pct != null && (
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
                      <Pressable onPress={onNudgeAction} style={[styles.coachCta, { backgroundColor: nudgeCopy.tone === 'investment' ? C.bronze : C.accent }]} accessibilityRole="button" accessibilityLabel={nudgeCopy.action}>
                        <Text style={styles.coachCtaText}>{nudgeCopy.action}</Text>
                        <Feather name="arrow-right" size={13} color="#fff" />
                      </Pressable>
                    )}
                    <Pressable onPress={() => openEcho(nudgeCopy.echoPrompt)} style={[styles.coachAsk, neu.raised]} accessibilityRole="button" accessibilityLabel={t.savings.askEcho}>
                      <Feather name="zap" size={12} color={C.accent} />
                      <Text style={styles.coachAskText}>{t.savings.askEcho}</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}

            {/* ALLOCATION */}
            {tabBreakdown.length >= 2 && (() => {
              // Displayed integer labels are apportioned (Hamilton) so they sum to
              // exactly 100; bar widths keep the exact pct for accurate proportions.
              const allocLabels = apportionPct(tabBreakdown.map((b) => b.pct));
              return (
                <View style={[styles.card, neu.raisedSoft]}>
                  <Text style={styles.sectionLabel}>{tab === 'savings' ? t.savings.whereSavingsLive : t.savings.whereInvestmentsLive}</Text>
                  {tabBreakdown.map((b, i) => (
                    <View key={b.id} style={styles.allocRow}>
                      <View style={[styles.allocDot, { backgroundColor: b.color }]} />
                      <Text style={styles.allocName} numberOfLines={1}>{b.name}</Text>
                      <View style={styles.allocBar}><View style={[styles.allocFill, { width: `${Math.max(b.pct, 3)}%`, backgroundColor: b.color }]} /></View>
                      <Text style={styles.allocPct}>{allocLabels[i]}%</Text>
                    </View>
                  ))}
                </View>
              );
            })()}

            {/* SORT */}
            {tabAccounts.length > 1 && (
              <View style={styles.sortRow}>
                {SORT_OPTS.map((o) => (
                  <TouchableOpacity key={o.key} onPress={() => { setSortBy(o.key); selectionChanged(); }} style={[styles.sortChip, neu.raised, sortBy === o.key && { backgroundColor: C.accent }]} activeOpacity={0.8} hitSlop={{ top: 9, bottom: 9, left: 4, right: 4 }} accessibilityRole="button" accessibilityState={{ selected: sortBy === o.key }} accessibilityLabel={t.savings[o.labelKey]}>
                    <Text style={[styles.sortChipText, sortBy === o.key && { color: '#fff' }]}>{t.savings[o.labelKey]}</Text>
                  </TouchableOpacity>
                ))}
                <Text style={styles.count}>{t.savings.accountsCount.replace('{n}', String(tabAccounts.length))}</Text>
              </View>
            )}

            {/* PLAN CAPACITY — free tier shows "x/5" to anticipate the cap; premium is
                unlimited so it just shows the count. */}
            <Text style={styles.planCount}>{t.savings.accountsCount.replace('{n}', Number.isFinite(savingsAccountLimit) ? `${accounts.length}/${savingsAccountLimit}` : `${accounts.length}`)}</Text>

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
                <TouchableOpacity onPress={() => { lightTap(); Linking.openURL('https://versa.com.my').catch(() => showToast(t.savings.couldNotOpenLink, 'error')); }} style={styles.growGo} accessibilityRole="button" accessibilityLabel={t.savings.growExplore}>
                  <Text style={styles.growGoText}>{t.savings.growExplore}</Text>
                  <Feather name="arrow-up-right" size={13} color={C.accent} />
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {showBar && !atAccountCap && <FAB icon="plus" onPress={openAdd} style={{ bottom: Math.max(SPACING.xl, insets.bottom + SPACING.md), right: SPACING.xl }} />}
      {showBar && atAccountCap && <FAB icon="lock" onPress={showAccountPaywall} style={{ bottom: Math.max(SPACING.xl, insets.bottom + SPACING.md), right: SPACING.xl }} />}

      {/* Sheets */}
      <AddEditAccountSheet
        visible={addEditOpen} editing={editing} defaultType={tab === 'investment' ? 'robo' : 'bank'} currency={currency}
        onClose={() => { setAddEditOpen(false); setEditing(null); }}
        onAdd={addAccount} onUpdate={updateAccount} onSnapshot={addSnapshot} onDelete={deleteAccount}
      />
      <UpdateValueSheet
        visible={updateOpen} account={updating} currency={currency}
        onClose={() => { setUpdateOpen(false); setUpdating(null); }} onSnapshot={addSnapshot}
      />
      <HistorySheet
        visible={historyOpen} account={historyAcc} currency={currency}
        onClose={() => { setHistoryOpen(false); setHistoryAcc(null); }}
      />

      {/* ── Echo FAB — draggable, drag-to-hide, greeting bubble (like Wallet/Bills) ── */}
      <EchoFab
        visible={ready && accounts.length > 0 && !echoHidden && !addEditOpen && !updateOpen && !historyOpen && !echoOpen && !paywallOpen}
        fabSide={fabSide}
        onSetFabSide={setFabSide}
        echoFabPan={echoFabPan}
        echoFabPanResponder={echoFabPanResponder}
        greetingText={greetingText}
        greetingDismissed={greetingDismissed}
        onSetGreetingDismissed={setGreetingDismissed}
        greetingHiddenDuringDrag={greetingHiddenDuringDrag}
        onSetGreetingHiddenDuringDrag={setGreetingHiddenDuringDrag}
        greetingChips={savingsChips}
        greetingPrompt={nudgeCopy?.echoPrompt}
        onOpenSheet={(autoPrompt) => { setEchoAutoPrompt(autoPrompt); setEchoOpen(true); setGreetingDismissed(true); }}
        tier={tier}
        onShowPaywall={() => { setPaywallFeature('ai'); setPaywallOpen(true); }}
        insets={insets}
        fabScale={fabScale}
        hideZoneAnim={hideZoneAnim}
        hideZoneHoverAnim={hideZoneHoverAnim}
        hideZoneRef={hideZoneRef}
      />

      {/* Echo chat + paywall */}
      <EchoInlineChat
        visible={echoOpen} onClose={() => setEchoOpen(false)}
        insightTitle={fmt(portfolio.totalCurrent)}
        insightSubtitle={t.savings.askEchoSub.replace('{return}', `${portfolio.totalReturn >= 0 ? '+' : ''}${portfolio.totalReturn.toFixed(1)}%`)}
        chips={savingsChips} contextSnapshot={snapshot} autoPrompt={echoAutoPrompt}
        topInset={insets.top} bottomInset={insets.bottom}
      />
      <PaywallModal visible={paywallOpen} onClose={() => setPaywallOpen(false)} feature={paywallFeature} currentUsage={paywallFeature === 'savings' ? accounts.length : undefined} />
      <HowItWorksModal
        visible={howItWorksOpen}
        onClose={() => setHowItWorksOpen(false)}
        subtitle="everything about savings & investments"
        sections={SAVINGS_HOW}
      />
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
  // parseISO reads the yyyy-MM-dd key as local, matching the local `cutoff`.
  // Split into in-window points and the carry-forward BASELINE: the balance at the
  // window start is the last snapshot strictly BEFORE the cutoff. Prepend it so the
  // % badge and mini-chart measure from the window's opening balance, not the first
  // in-window snapshot (spark is date-sorted, so the last pre-cutoff wins).
  const inWindow: number[] = [];
  let baseline: number | null = null;
  for (const p of spark) {
    if (parseISO(p.date) >= cutoff) inWindow.push(p.value);
    else baseline = p.value;
  }
  if (baseline !== null) {
    // Anchor to the carried-forward baseline even when nothing changed inside the
    // window (flat line) rather than silently falling back to the all-time series.
    return inWindow.length > 0 ? [baseline, ...inWindow] : [baseline, baseline];
  }
  // No pre-cutoff snapshot → the window already spans the whole history.
  return inWindow.length >= 2 ? inWindow : spark.map((p) => p.value);
}

// Largest-remainder (Hamilton) apportionment: round a list of percentages that sum
// to ~100 into integers that sum to EXACTLY 100, so the displayed allocation labels
// never read 99% or 101%. Floor each, then hand the leftover points to the slices
// with the largest fractional remainders.
function apportionPct(values: number[]): number[] {
  // No real total (e.g. every account in the tab is worth 0) → all zeros, not a
  // spurious 1% per slice from distributing the leftover.
  if (values.reduce((s, v) => s + v, 0) <= 0) return values.map(() => 0);
  const floors = values.map((v) => Math.floor(v));
  const sumFloors = floors.reduce((s, v) => s + v, 0);
  let leftover = Math.round(100 - sumFloors);
  leftover = Math.max(0, Math.min(leftover, values.length)); // guard float drift
  const byRemainder = values
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (let k = 0; k < leftover; k++) out[byRemainder[k].i] += 1;
  return out;
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
  content: { padding: SPACING.lg, paddingBottom: 120, maxWidth: 680, width: '100%', alignSelf: 'center' as const },
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
  planCount: { alignSelf: 'flex-end', marginBottom: SPACING.md, fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, fontWeight: '600', fontVariant: ['tabular-nums'] },

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
