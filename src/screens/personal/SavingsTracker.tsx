import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Modal,
  TextInput,
  Alert,
  Keyboard,
  Dimensions,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  format, formatDistanceToNow, isValid, startOfMonth, isWithinInterval,
  endOfMonth, differenceInDays, subMonths, subYears, addMonths,
} from 'date-fns';
import { useSavingsStore } from '../../store/savingsStore';
import { useSettingsStore } from '../../store/settingsStore';
import {
  CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha,
} from '../../constants';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';
import ProgressBar from '../../components/common/ProgressBar';
import Sparkline from '../../components/common/Sparkline';
import { useToast } from '../../context/ToastContext';
import { useCategories } from '../../hooks/useCategories';
import { SavingsAccount, SavingsSortBy, SnapshotType } from '../../types';
import { CategoryOption } from '../../types';
import { lightTap, selectionChanged } from '../../services/haptics';

const MAX_ACCOUNTS = 5;
const SCREEN_W = Dimensions.get('window').width;
const CARD_PAD = SPACING.lg;
const CHART_W = SCREEN_W - CARD_PAD * 4;

const FALLBACK_TYPE: CategoryOption = { id: 'other', name: 'Other', icon: 'briefcase', color: '#9CA3B4' };

type TimeRange = '1M' | '3M' | '6M' | '1Y' | 'ALL';

const TIME_RANGES: { key: TimeRange; label: string }[] = [
  { key: '1M', label: '1M' },
  { key: '3M', label: '3M' },
  { key: '6M', label: '6M' },
  { key: '1Y', label: '1Y' },
  { key: 'ALL', label: 'All' },
];

const SORT_OPTIONS: { key: SavingsSortBy; label: string }[] = [
  { key: 'manual', label: 'Manual' },
  { key: 'value', label: 'Value' },
  { key: 'return', label: 'Return' },
  { key: 'updated', label: 'Updated' },
];

const SNAPSHOT_TYPES: { key: SnapshotType; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: 'manual', label: 'Update', icon: 'refresh-cw' },
  { key: 'dividend', label: 'Dividend', icon: 'gift' },
  { key: 'withdrawal', label: 'Withdraw', icon: 'arrow-down-left' },
];

// Milestones that trigger celebration / nudge
const MILESTONES = [
  1000, 2500, 5000, 10000, 15000, 20000, 25000, 50000,
  75000, 100000, 150000, 200000, 250000, 500000, 1000000,
];

const SavingsTracker: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const {
    accounts, addAccount, updateAccount, deleteAccount, addSnapshot,
    sortBy, setSortBy, setTarget, accountOrder, lastOpenedValue, recordOpen,
  } = useSavingsStore();
  const currency = useSettingsStore((s) => s.currency);
  const investmentTypes = useCategories('investment');
  const getTypeInfo = useCallback((typeId: string): CategoryOption =>
    investmentTypes.find((t) => t.id === typeId) || FALLBACK_TYPE,
  [investmentTypes]);

  // ── State ──
  const [timeRange, setTimeRange] = useState<TimeRange>('ALL');

  // Add / Edit modal
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SavingsAccount | null>(null);
  const [name, setName] = useState('');
  const [selectedType, setSelectedType] = useState(investmentTypes[0]?.id || 'tng_plus');
  const [description, setDescription] = useState('');
  const [initialInvestment, setInitialInvestment] = useState('');
  const [currentValue, setCurrentValue] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [goalNameValue, setGoalNameValue] = useState('');
  const [annualRateValue, setAnnualRateValue] = useState('');
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);

  // Update value modal
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const [updatingAccount, setUpdatingAccount] = useState<SavingsAccount | null>(null);
  const [newValue, setNewValue] = useState('');
  const [updateNote, setUpdateNote] = useState('');
  const [snapshotType, setSnapshotType] = useState<SnapshotType>('manual');

  // History modal
  const [historyModalVisible, setHistoryModalVisible] = useState(false);
  const [historyAccount, setHistoryAccount] = useState<SavingsAccount | null>(null);

  // Stale reminder
  const [reminderDismissed, setReminderDismissed] = useState(false);

  // ── Record open on screen blur (for "since last check") ──
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (accounts.length > 0) recordOpen();
      };
    }, [accounts.length, recordOpen])
  );

  // ── Portfolio data — full sparkline with dates ──
  const portfolio = useMemo(() => {
    const totalCurrent = accounts.reduce((s, a) => s + a.currentValue, 0);
    const totalInvested = accounts.reduce((s, a) => s + a.initialInvestment, 0);
    const totalGain = totalCurrent - totalInvested;
    const totalReturn = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0;

    const now = new Date();
    const mStart = startOfMonth(now);
    const mEnd = endOfMonth(now);
    let monthContributed = 0;
    let monthUpdates = 0;
    for (const a of accounts) {
      for (let i = 1; i < a.history.length; i++) {
        const d = a.history[i].date instanceof Date ? a.history[i].date : new Date(a.history[i].date as any);
        if (isWithinInterval(d, { start: mStart, end: mEnd })) {
          const diff = a.history[i].value - a.history[i - 1].value;
          if (diff > 0) monthContributed += diff;
          monthUpdates++;
        }
      }
    }

    // Value change this month
    let totalAtMonthStart = 0;
    for (const a of accounts) {
      const beforeMonth = a.history.filter((h) => {
        const d = h.date instanceof Date ? h.date : new Date(h.date as any);
        return d < mStart;
      });
      totalAtMonthStart += beforeMonth.length > 0
        ? beforeMonth[beforeMonth.length - 1].value
        : a.initialInvestment;
    }
    const monthValueChange = totalCurrent - totalAtMonthStart;

    // Full sparkline with dates (for time range filtering)
    const dateMap = new Map<string, Map<string, number>>();
    for (const a of accounts) {
      for (const h of a.history) {
        const d = h.date instanceof Date ? h.date : new Date(h.date as any);
        const key = format(d, 'yyyy-MM-dd');
        if (!dateMap.has(key)) dateMap.set(key, new Map());
        dateMap.get(key)!.set(a.id, h.value);
      }
    }
    const sortedDates = Array.from(dateMap.keys()).sort();
    const latestValues = new Map<string, number>();
    const fullSparkline: { date: string; value: number }[] = [];
    for (const dateKey of sortedDates) {
      const snapshot = dateMap.get(dateKey)!;
      for (const [aid, val] of snapshot) latestValues.set(aid, val);
      let total = 0;
      for (const val of latestValues.values()) total += val;
      fullSparkline.push({ date: dateKey, value: total });
    }

    return {
      totalCurrent, totalInvested, totalGain, totalReturn,
      monthContributed, monthUpdates, monthValueChange, fullSparkline,
    };
  }, [accounts]);

  // ── Filtered sparkline by time range ──
  const chartData = useMemo(() => {
    const { fullSparkline } = portfolio;
    if (fullSparkline.length < 2) return [];

    if (timeRange === 'ALL') return fullSparkline.map((p) => p.value);

    const now = new Date();
    const cutoff = {
      '1M': subMonths(now, 1),
      '3M': subMonths(now, 3),
      '6M': subMonths(now, 6),
      '1Y': subYears(now, 1),
    }[timeRange];

    const filtered = fullSparkline.filter((p) => new Date(p.date) >= cutoff);
    return filtered.length >= 2 ? filtered.map((p) => p.value) : fullSparkline.map((p) => p.value);
  }, [portfolio, timeRange]);

  // ── Period change (for display under chart) ──
  const periodChange = useMemo(() => {
    if (chartData.length < 2) return null;
    const first = chartData[0];
    const last = chartData[chartData.length - 1];
    const diff = last - first;
    const pct = first > 0 ? (diff / first) * 100 : 0;
    return { diff, pct };
  }, [chartData]);

  // ── "Since last check" delta ──
  const sinceLastCheck = useMemo(() => {
    if (lastOpenedValue === null || accounts.length === 0) return null;
    const diff = portfolio.totalCurrent - lastOpenedValue;
    if (Math.abs(diff) < 0.01) return null;
    return diff;
  }, [portfolio.totalCurrent, lastOpenedValue, accounts.length]);

  // ── Insights: best performer, next milestone, projected earnings ──
  const insights = useMemo(() => {
    if (accounts.length === 0) return null;
    const now = new Date();
    const mStart = startOfMonth(now);

    // Best performer this month
    let bestPerformer: SavingsAccount | null = null;
    let bestPct = 0;
    for (const a of accounts) {
      const beforeMonth = a.history.filter((h) => {
        const d = h.date instanceof Date ? h.date : new Date(h.date as any);
        return d < mStart;
      });
      const startVal = beforeMonth.length > 0 ? beforeMonth[beforeMonth.length - 1].value : a.initialInvestment;
      if (startVal <= 0) continue;
      const pct = ((a.currentValue - startVal) / startVal) * 100;
      if (pct > bestPct) { bestPerformer = a; bestPct = pct; }
    }

    // Next milestone
    const nextMilestone = MILESTONES.find((m) => m > portfolio.totalCurrent) || null;
    const toMilestone = nextMilestone ? nextMilestone - portfolio.totalCurrent : null;
    const milestonePct = nextMilestone ? (portfolio.totalCurrent / nextMilestone) * 100 : 0;

    // Projected annual earnings (from annualRate)
    let projectedEarnings = 0;
    let accountsWithRate = 0;
    for (const a of accounts) {
      if (a.annualRate && a.annualRate > 0) {
        projectedEarnings += a.currentValue * a.annualRate / 100;
        accountsWithRate++;
      }
    }

    return {
      bestPerformer, bestPct, nextMilestone, toMilestone,
      milestonePct, projectedEarnings, accountsWithRate,
    };
  }, [accounts, portfolio.totalCurrent]);

  // ── Stale account reminder ──
  const staleAccount = useMemo(() => {
    if (reminderDismissed || accounts.length === 0) return null;
    const now = new Date();
    let mostStale: SavingsAccount | null = null;
    let maxDays = 0;
    for (const a of accounts) {
      const lastUpdate = a.history.length > 0
        ? (a.history[a.history.length - 1].date instanceof Date
            ? a.history[a.history.length - 1].date
            : new Date(a.history[a.history.length - 1].date as any))
        : a.createdAt;
      const days = differenceInDays(now, lastUpdate);
      if (days >= 7 && days > maxDays) {
        mostStale = a;
        maxDays = days;
      }
    }
    return mostStale ? { account: mostStale, days: maxDays } : null;
  }, [accounts, reminderDismissed]);

  // ── Breakdown ──
  const breakdown = useMemo(() => {
    if (accounts.length < 2) return null;
    const typeMap: Record<string, { name: string; value: number; color: string }> = {};
    for (const a of accounts) {
      const info = getTypeInfo(a.type);
      const key = a.type;
      if (!typeMap[key]) typeMap[key] = { name: info.name, value: 0, color: info.color };
      typeMap[key].value += a.currentValue;
    }
    const total = Object.values(typeMap).reduce((s, v) => s + v.value, 0);
    return Object.values(typeMap)
      .map((v) => ({ ...v, pct: total > 0 ? (v.value / total) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [accounts, getTypeInfo]);

  // ── Sorted accounts ──
  const sortedAccounts = useMemo(() => {
    const now = new Date();
    const mStart = startOfMonth(now);

    const list = accounts.map((account) => {
      const typeInfo = getTypeInfo(account.type);
      const gain = account.currentValue - account.initialInvestment;
      const returnPct = account.initialInvestment > 0 ? (gain / account.initialInvestment) * 100 : 0;

      // Monthly gain for this account
      const beforeMonth = account.history.filter((h) => {
        const d = h.date instanceof Date ? h.date : new Date(h.date as any);
        return d < mStart;
      });
      const monthStartVal = beforeMonth.length > 0 ? beforeMonth[beforeMonth.length - 1].value : account.initialInvestment;
      const monthGain = account.currentValue - monthStartVal;

      // Goal pace projection
      let goalEta: string | null = null;
      if (account.target && account.target > account.currentValue) {
        const remaining = account.target - account.currentValue;
        // Average monthly growth from last 3 months of snapshots
        const threeMonthsAgo = subMonths(now, 3);
        const recentHistory = account.history.filter((h) => {
          const d = h.date instanceof Date ? h.date : new Date(h.date as any);
          return d >= threeMonthsAgo;
        });
        if (recentHistory.length >= 2) {
          const oldVal = recentHistory[0].value;
          const newVal = recentHistory[recentHistory.length - 1].value;
          const firstDate = recentHistory[0].date instanceof Date ? recentHistory[0].date : new Date(recentHistory[0].date as any);
          const lastDate = recentHistory[recentHistory.length - 1].date instanceof Date
            ? recentHistory[recentHistory.length - 1].date : new Date(recentHistory[recentHistory.length - 1].date as any);
          const monthsElapsed = Math.max(differenceInDays(lastDate, firstDate) / 30.44, 0.5);
          const monthlyRate = (newVal - oldVal) / monthsElapsed;
          if (monthlyRate > 0) {
            const monthsToGoal = Math.ceil(remaining / monthlyRate);
            if (monthsToGoal <= 120) { // Only show if within 10 years
              goalEta = format(addMonths(now, monthsToGoal), 'MMM yyyy');
            }
          }
        }
      }

      // Projected annual earnings for this account
      const projectedAnnual = account.annualRate && account.annualRate > 0
        ? account.currentValue * account.annualRate / 100 : null;

      return { ...account, typeInfo, gain, returnPct, monthGain, goalEta, projectedAnnual };
    });

    switch (sortBy) {
      case 'value':
        return list.sort((a, b) => b.currentValue - a.currentValue);
      case 'return':
        return list.sort((a, b) => b.returnPct - a.returnPct);
      case 'updated':
        return list.sort((a, b) => {
          const da = a.updatedAt instanceof Date ? a.updatedAt : new Date(a.updatedAt as any);
          const db = b.updatedAt instanceof Date ? b.updatedAt : new Date(b.updatedAt as any);
          return db.getTime() - da.getTime();
        });
      case 'manual':
      default:
        if (accountOrder.length > 0) {
          return list.sort((a, b) => {
            const ai = accountOrder.indexOf(a.id);
            const bi = accountOrder.indexOf(b.id);
            return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
          });
        }
        return list;
    }
  }, [accounts, sortBy, accountOrder, getTypeInfo]);

  // ── Handlers ──
  const resetForm = useCallback(() => {
    setEditingAccount(null);
    setName('');
    setSelectedType('tng_plus');
    setDescription('');
    setInitialInvestment('');
    setCurrentValue('');
    setTargetValue('');
    setGoalNameValue('');
    setAnnualRateValue('');
    setTypeDropdownOpen(false);
  }, []);

  const openAdd = useCallback(() => {
    if (accounts.length >= MAX_ACCOUNTS) {
      showToast(`Maximum ${MAX_ACCOUNTS} savings accounts`, 'error');
      return;
    }
    resetForm();
    setModalVisible(true);
  }, [accounts.length, resetForm, showToast]);

  const openEdit = useCallback((account: SavingsAccount) => {
    setEditingAccount(account);
    setName(account.name);
    setSelectedType(account.type);
    setDescription(account.description || '');
    setInitialInvestment(account.initialInvestment.toString());
    setCurrentValue(account.currentValue.toString());
    setTargetValue(account.target ? account.target.toString() : '');
    setGoalNameValue(account.goalName || '');
    setAnnualRateValue(account.annualRate ? account.annualRate.toString() : '');
    setTypeDropdownOpen(false);
    setModalVisible(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      showToast('Please enter an account name', 'error');
      return;
    }
    const inv = parseFloat(initialInvestment);
    const cur = parseFloat(currentValue);
    if (!inv || inv <= 0) {
      showToast('Please enter a valid initial investment', 'error');
      return;
    }
    if (!cur || cur < 0) {
      showToast('Please enter a valid current value', 'error');
      return;
    }

    const parsedTarget = parseFloat(targetValue);
    const target = parsedTarget > 0 ? parsedTarget : undefined;
    const parsedRate = parseFloat(annualRateValue);
    const annualRate = parsedRate > 0 ? parsedRate : undefined;
    const goalName = goalNameValue.trim() || undefined;

    if (editingAccount) {
      updateAccount(editingAccount.id, {
        name: name.trim(),
        type: selectedType,
        description: (selectedType === 'other' || selectedType.startsWith('custom_')) ? description.trim() : undefined,
        initialInvestment: inv,
        currentValue: cur,
        target, goalName, annualRate,
      });
      showToast('Account updated', 'success');
    } else {
      addAccount({
        name: name.trim(),
        type: selectedType,
        description: (selectedType === 'other' || selectedType.startsWith('custom_')) ? description.trim() : undefined,
        initialInvestment: inv,
        currentValue: cur,
        target, goalName, annualRate,
      });
      showToast('Account added', 'success');
    }
    lightTap();
    setModalVisible(false);
    resetForm();
  }, [name, selectedType, description, initialInvestment, currentValue, targetValue, goalNameValue, annualRateValue, editingAccount, addAccount, updateAccount, resetForm, showToast]);

  const handleDelete = useCallback((account: SavingsAccount) => {
    Alert.alert(
      'Delete Account',
      `Remove "${account.name}" from your savings?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteAccount(account.id);
            showToast('Account deleted', 'success');
            lightTap();
          },
        },
      ]
    );
  }, [deleteAccount, showToast]);

  const openUpdateValue = useCallback((account: SavingsAccount) => {
    setUpdatingAccount(account);
    setNewValue(account.currentValue.toString());
    setUpdateNote('');
    setSnapshotType('manual');
    setUpdateModalVisible(true);
  }, []);

  const handleUpdateValue = useCallback(() => {
    if (!updatingAccount) return;
    const val = parseFloat(newValue);
    if (!val || val < 0) {
      showToast('Please enter a valid value', 'error');
      return;
    }
    addSnapshot(updatingAccount.id, val, updateNote.trim() || undefined, snapshotType);
    showToast('Value updated', 'success');
    lightTap();
    setUpdateModalVisible(false);
    setUpdatingAccount(null);
  }, [updatingAccount, newValue, updateNote, snapshotType, addSnapshot, showToast]);

  const openHistory = useCallback((account: SavingsAccount) => {
    setHistoryAccount(account);
    setHistoryModalVisible(true);
  }, []);

  // ── History modal data ──
  const historyData = useMemo(() => {
    if (!historyAccount) return { grouped: [], sparkline: [], bestMonth: '', worstMonth: '' };

    const entries = historyAccount.history.slice().reverse();
    const sparkline = historyAccount.history.map((h) => h.value);

    const groups: Record<string, typeof entries> = {};
    for (const snap of entries) {
      const d = snap.date instanceof Date ? snap.date : new Date(snap.date as any);
      const key = isValid(d) ? format(d, 'MMMM yyyy') : 'Unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(snap);
    }
    const grouped = Object.entries(groups).map(([month, items]) => ({ month, items }));

    const monthChanges: Record<string, number> = {};
    const fwd = historyAccount.history;
    for (let i = 1; i < fwd.length; i++) {
      const d = fwd[i].date instanceof Date ? fwd[i].date : new Date(fwd[i].date as any);
      const key = isValid(d) ? format(d, 'MMM yyyy') : 'Unknown';
      const diff = fwd[i].value - fwd[i - 1].value;
      monthChanges[key] = (monthChanges[key] || 0) + diff;
    }
    const sorted = Object.entries(monthChanges).sort((a, b) => b[1] - a[1]);
    const bestMonth = sorted.length > 0 && sorted[0][1] > 0 ? `${sorted[0][0]}: +${currency} ${sorted[0][1].toFixed(2)}` : '';
    const worstMonth = sorted.length > 0 && sorted[sorted.length - 1][1] < 0
      ? `${sorted[sorted.length - 1][0]}: ${currency} ${sorted[sorted.length - 1][1].toFixed(2)}`
      : '';

    return { grouped, sparkline, bestMonth, worstMonth };
  }, [historyAccount, currency]);

  // ── Helpers (stable refs) ──
  const fmtAmount = useCallback((v: number) => `${currency} ${v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, [currency]);
  const fmtShort = useCallback((v: number) => {
    if (Math.abs(v) >= 1000) return `${currency} ${(v / 1000).toFixed(1)}k`;
    return `${currency} ${v.toFixed(0)}`;
  }, [currency]);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ═══ HERO SECTION ═══ */}
        {accounts.length > 0 && (
          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>total savings</Text>
            <Text style={styles.heroAmount}>
              {fmtAmount(portfolio.totalCurrent)}
            </Text>

            {/* "Since last check" badge — THE daily pull hook */}
            {sinceLastCheck !== null && (
              <View style={[
                styles.sinceLastBadge,
                { backgroundColor: withAlpha(sinceLastCheck >= 0 ? CALM.positive : CALM.neutral, 0.08) },
              ]}>
                <Feather
                  name={sinceLastCheck >= 0 ? 'trending-up' : 'trending-down'}
                  size={12}
                  color={sinceLastCheck >= 0 ? CALM.positive : CALM.neutral}
                />
                <Text style={[
                  styles.sinceLastText,
                  { color: sinceLastCheck >= 0 ? CALM.positive : CALM.neutral },
                ]}>
                  {sinceLastCheck >= 0 ? '+' : ''}{fmtAmount(sinceLastCheck)} since last check
                </Text>
              </View>
            )}

            {/* Area chart with gradient fill */}
            {chartData.length >= 2 && (
              <View style={styles.heroChart}>
                <Sparkline
                  data={chartData}
                  width={CHART_W}
                  height={80}
                  showDot
                  filled
                  strokeWidth={2.5}
                />
              </View>
            )}

            {/* Time range pills */}
            <View style={styles.timeRangeRow}>
              {TIME_RANGES.map((tr) => (
                <TouchableOpacity
                  key={tr.key}
                  style={[styles.timeRangePill, timeRange === tr.key && styles.timeRangePillActive]}
                  onPress={() => { setTimeRange(tr.key); selectionChanged(); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.timeRangeText, timeRange === tr.key && styles.timeRangeTextActive]}>
                    {tr.label}
                  </Text>
                </TouchableOpacity>
              ))}
              {periodChange && (
                <Text style={[
                  styles.periodChangeText,
                  { color: periodChange.diff >= 0 ? CALM.positive : CALM.neutral },
                ]}>
                  {periodChange.diff >= 0 ? '+' : ''}{periodChange.pct.toFixed(1)}%
                </Text>
              )}
            </View>

            {/* Stats row: invested · growth · return */}
            <View style={styles.heroStatsRow}>
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatLabel}>invested</Text>
                <Text style={styles.heroStatValue}>{fmtAmount(portfolio.totalInvested)}</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatLabel}>growth</Text>
                <Text style={[styles.heroStatValue, { color: portfolio.totalGain >= 0 ? CALM.positive : CALM.neutral }]}>
                  {portfolio.totalGain >= 0 ? '+' : ''}{fmtAmount(portfolio.totalGain)}
                </Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStatItem}>
                <Text style={styles.heroStatLabel}>return</Text>
                <Text style={[styles.heroStatValue, { color: portfolio.totalReturn >= 0 ? CALM.positive : CALM.neutral }]}>
                  {portfolio.totalReturn >= 0 ? '+' : ''}{portfolio.totalReturn.toFixed(1)}%
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ═══ INSIGHTS CARDS ═══ */}
        {insights && accounts.length > 0 && (
          <View style={styles.insightsRow}>
            {/* Projected annual earnings */}
            {insights.projectedEarnings > 0 && (
              <View style={styles.insightCard}>
                <Feather name="sun" size={16} color={CALM.gold} />
                <Text style={styles.insightValue}>{fmtShort(insights.projectedEarnings)}</Text>
                <Text style={styles.insightLabel}>est. earnings{'\n'}this year</Text>
              </View>
            )}

            {/* Next milestone */}
            {insights.nextMilestone && insights.toMilestone !== null && (
              <View style={styles.insightCard}>
                <Feather name="flag" size={16} color={CALM.accent} />
                <Text style={styles.insightValue}>{fmtShort(insights.toMilestone)}</Text>
                <Text style={styles.insightLabel}>to {fmtShort(insights.nextMilestone)}{'\n'}milestone</Text>
              </View>
            )}

            {/* Best performer this month */}
            {insights.bestPerformer && insights.bestPct > 0 && (
              <View style={styles.insightCard}>
                <Feather name="award" size={16} color={CALM.bronze} />
                <Text style={styles.insightValue} numberOfLines={1}>{insights.bestPerformer.name}</Text>
                <Text style={styles.insightLabel}>+{insights.bestPct.toFixed(1)}%{'\n'}this month</Text>
              </View>
            )}

            {/* This month activity (fallback if no other insights) */}
            {portfolio.monthContributed > 0 && !insights.projectedEarnings && (
              <View style={styles.insightCard}>
                <Feather name="plus-circle" size={16} color={CALM.positive} />
                <Text style={styles.insightValue}>{fmtShort(portfolio.monthContributed)}</Text>
                <Text style={styles.insightLabel}>added this{'\n'}month</Text>
              </View>
            )}
          </View>
        )}

        {/* ═══ STALE REMINDER ═══ */}
        {staleAccount && (
          <View style={styles.reminderCard}>
            <View style={styles.reminderContent}>
              <Feather name="clock" size={16} color={CALM.gold} />
              <Text style={styles.reminderText}>
                {staleAccount.account.name} hasn't been updated in {staleAccount.days} days
              </Text>
            </View>
            <View style={styles.reminderActions}>
              <TouchableOpacity
                onPress={() => openUpdateValue(staleAccount.account)}
                style={styles.reminderBtn}
                activeOpacity={0.7}
              >
                <Text style={styles.reminderBtnText}>update now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setReminderDismissed(true)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="x" size={16} color={CALM.textMuted} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ═══ BREAKDOWN ═══ */}
        {breakdown && (
          <View style={styles.breakdownCard}>
            <Text style={styles.sectionLabel}>where your money lives</Text>
            {breakdown.map((item) => (
              <View key={item.name} style={styles.breakdownRow}>
                <Text style={styles.breakdownName} numberOfLines={1}>{item.name}</Text>
                <View style={styles.breakdownBarContainer}>
                  <View
                    style={[styles.breakdownBar, { width: `${Math.max(item.pct, 3)}%`, backgroundColor: item.color }]}
                  />
                </View>
                <Text style={styles.breakdownPct}>{item.pct.toFixed(0)}%</Text>
              </View>
            ))}
          </View>
        )}

        {/* ═══ SORT + ACCOUNT COUNT ═══ */}
        {accounts.length > 1 && (
          <View style={styles.sortRow}>
            <View style={styles.sortPills}>
              {SORT_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.sortPill, sortBy === opt.key && styles.sortPillActive]}
                  onPress={() => { setSortBy(opt.key); selectionChanged(); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.sortPillText, sortBy === opt.key && styles.sortPillTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.accountCount}>{accounts.length} accounts</Text>
          </View>
        )}

        {/* ═══ ACCOUNT CARDS ═══ */}
        {sortedAccounts.length > 0 ? (
          sortedAccounts.map((account) => {
            const info = account.typeInfo;
            const { gain, returnPct, monthGain, goalEta, projectedAnnual } = account;
            const lastSnapshot = account.history.length > 0
              ? account.history[account.history.length - 1] : null;
            const prevSnapshot = account.history.length > 1
              ? account.history[account.history.length - 2] : null;
            const lastChange = prevSnapshot ? account.currentValue - prevSnapshot.value : null;
            const sparklineValues = account.history.slice(-12).map((h) => h.value);

            const lastDate = lastSnapshot
              ? (lastSnapshot.date instanceof Date ? lastSnapshot.date : new Date(lastSnapshot.date as any))
              : account.createdAt;
            const staleDays = differenceInDays(new Date(), lastDate);
            const isStale = staleDays >= 7;

            const targetPct = account.target && account.target > 0
              ? Math.min(100, Math.round((account.currentValue / account.target) * 100)) : null;

            return (
              <Card key={account.id} style={styles.accountCard}>
                {/* Header row: icon + name + edit */}
                <View style={styles.accountHeader}>
                  <View style={[styles.accountTypeIcon, { backgroundColor: withAlpha(info.color, 0.1) }]}>
                    <Feather name={info.icon as keyof typeof Feather.glyphMap} size={18} color={info.color} />
                  </View>
                  <View style={styles.accountInfo}>
                    <Text style={styles.accountName} numberOfLines={1}>{account.name}</Text>
                    <Text style={[styles.accountTypeName, { color: info.color }]}>
                      {account.type === 'other' && account.description ? account.description : info.name}
                      {account.annualRate ? ` · ${account.annualRate}% p.a.` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => openEdit(account)}
                    style={styles.iconBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel={`Edit ${account.name}`}
                  >
                    <Feather name="more-horizontal" size={18} color={CALM.textMuted} />
                  </TouchableOpacity>
                </View>

                {/* Value + return badge */}
                <View style={styles.valueRow}>
                  <Text style={styles.valueCurrent}>{fmtAmount(account.currentValue)}</Text>
                  <View style={[styles.returnBadge, {
                    backgroundColor: withAlpha(gain >= 0 ? CALM.positive : CALM.neutral, 0.08),
                  }]}>
                    <Text style={[styles.returnBadgeText, { color: gain >= 0 ? CALM.positive : CALM.neutral }]}>
                      {gain >= 0 ? '+' : ''}{returnPct.toFixed(1)}%
                    </Text>
                  </View>
                </View>

                {/* Sub stats: invested + gain */}
                <View style={styles.subStatsRow}>
                  <Text style={styles.subStatText}>put in {fmtAmount(account.initialInvestment)}</Text>
                  <Text style={[styles.subStatText, { color: gain >= 0 ? CALM.positive : CALM.neutral }]}>
                    {gain >= 0 ? '+' : ''}{fmtAmount(gain)}
                  </Text>
                </View>

                {/* Sparkline (wider, area fill) */}
                {sparklineValues.length >= 2 && (
                  <View style={styles.accountSparkline}>
                    <Sparkline
                      data={sparklineValues}
                      width={CHART_W}
                      height={40}
                      showDot
                      filled
                    />
                  </View>
                )}

                {/* Projected annual earnings */}
                {projectedAnnual !== null && projectedAnnual > 0 && (
                  <View style={styles.projectedRow}>
                    <Feather name="sun" size={12} color={CALM.gold} />
                    <Text style={styles.projectedText}>
                      est. {fmtAmount(projectedAnnual)} earnings this year
                    </Text>
                  </View>
                )}

                {/* Target / goal progress */}
                {account.target && account.target > 0 && (
                  <View style={styles.targetSection}>
                    <View style={styles.targetHeader}>
                      <Text style={styles.targetLabel}>
                        {account.goalName || 'target'}: {fmtAmount(account.target)}
                      </Text>
                      <Text style={styles.targetPct}>{targetPct}%</Text>
                    </View>
                    <ProgressBar
                      current={account.currentValue}
                      total={account.target}
                      color={CALM.accent}
                      height={6}
                    />
                    {goalEta && (
                      <Text style={styles.goalEtaText}>
                        at this pace: {goalEta}
                      </Text>
                    )}
                  </View>
                )}

                {/* Footer: last updated + actions */}
                <View style={styles.accountFooter}>
                  <View style={styles.lastUpdatedRow}>
                    {isStale && <View style={[styles.staleDot, { backgroundColor: CALM.gold }]} />}
                    <Feather name="clock" size={11} color={isStale ? CALM.gold : CALM.textMuted} />
                    <Text style={[styles.lastUpdatedText, isStale && { color: CALM.gold }]}>
                      {lastSnapshot ? formatDistanceToNow(lastDate, { addSuffix: true }) : 'no updates'}
                    </Text>
                    {lastChange !== null && (
                      <Text style={[styles.lastChangeText, { color: lastChange >= 0 ? CALM.positive : CALM.neutral }]}>
                        {lastChange >= 0 ? '+' : ''}{fmtAmount(lastChange)}
                      </Text>
                    )}
                  </View>
                  <View style={styles.accountActions}>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => openUpdateValue(account)}
                      activeOpacity={0.7}
                      accessibilityLabel={`Update value for ${account.name}`}
                    >
                      <Feather name="refresh-cw" size={14} color={CALM.accent} />
                      <Text style={styles.actionBtnText}>update</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtnSecondary}
                      onPress={() => openHistory(account)}
                      activeOpacity={0.7}
                      accessibilityLabel={`View history for ${account.name}`}
                    >
                      <Feather name="bar-chart-2" size={14} color={CALM.textSecondary} />
                      <Text style={styles.actionBtnSecondaryText}>history</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </Card>
            );
          })
        ) : (
          <EmptyState
            icon="trending-up"
            title="Track Your Savings"
            message="Monitor TNG GO+, ASB, Tabung Haji, stocks, and more — all in one place"
            actionLabel="Add Account"
            onAction={openAdd}
          />
        )}
      </ScrollView>

      {/* ═══ FAB ═══ */}
      {accounts.length < MAX_ACCOUNTS && accounts.length > 0 && (
        <Button
          title={`Add Account (${accounts.length}/${MAX_ACCOUNTS})`}
          onPress={openAdd}
          icon="plus"
          size="large"
          style={{ ...styles.fab, bottom: Math.max(SPACING.lg, insets.bottom + SPACING.sm) }}
        />
      )}

      {/* ═══ ADD / EDIT MODAL ═══ */}
      {modalVisible && <Modal
        visible
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => { setModalVisible(false); resetForm(); }}
      >
        <Pressable style={styles.modalOverlay} onPress={() => { setModalVisible(false); resetForm(); }}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingAccount ? 'edit account' : 'add account'}
              </Text>
              <TouchableOpacity onPress={() => { setModalVisible(false); resetForm(); }}>
                <Feather name="x" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            </View>

            <KeyboardAwareScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: Math.max(SPACING.lg, insets.bottom) }}
            >
              <Text style={styles.label}>account name</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="e.g. My TNG GO+, ASB Main"
                placeholderTextColor={CALM.textMuted}
                returnKeyType="next"
              />

              <Text style={styles.label}>type</Text>
              <TouchableOpacity
                style={styles.dropdownTrigger}
                onPress={() => setTypeDropdownOpen(!typeDropdownOpen)}
                activeOpacity={0.7}
              >
                <View style={styles.dropdownTriggerLeft}>
                  <View style={[styles.dropdownIcon, { backgroundColor: withAlpha(getTypeInfo(selectedType).color, 0.12) }]}>
                    <Feather name={getTypeInfo(selectedType).icon as keyof typeof Feather.glyphMap} size={16} color={getTypeInfo(selectedType).color} />
                  </View>
                  <Text style={styles.dropdownTriggerText}>{getTypeInfo(selectedType).name}</Text>
                </View>
                <Feather name={typeDropdownOpen ? 'chevron-up' : 'chevron-down'} size={20} color={CALM.textSecondary} />
              </TouchableOpacity>

              {typeDropdownOpen && (
                <View style={styles.dropdownList}>
                  {investmentTypes.map((type) => {
                    const isSelected = selectedType === type.id;
                    return (
                      <TouchableOpacity
                        key={type.id}
                        style={[styles.dropdownItem, isSelected && styles.dropdownItemSelected]}
                        onPress={() => { setSelectedType(type.id); setTypeDropdownOpen(false); }}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.dropdownItemIcon, { backgroundColor: withAlpha(type.color, 0.12) }]}>
                          <Feather name={type.icon as keyof typeof Feather.glyphMap} size={16} color={type.color} />
                        </View>
                        <Text style={[styles.dropdownItemText, isSelected && { color: CALM.accent, fontWeight: TYPOGRAPHY.weight.bold }]}>
                          {type.name}
                        </Text>
                        {isSelected && <Feather name="check" size={16} color={CALM.accent} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {(selectedType === 'other' || selectedType.startsWith('custom_')) && (
                <>
                  <Text style={styles.label}>description</Text>
                  <TextInput
                    style={styles.input}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="e.g. Stashaway, Gold, Mutual Fund"
                    placeholderTextColor={CALM.textMuted}
                    returnKeyType="next"
                  />
                </>
              )}

              <Text style={styles.label}>initial investment</Text>
              <TextInput
                style={styles.input}
                value={initialInvestment}
                onChangeText={setInitialInvestment}
                placeholder="0.00"
                keyboardType="decimal-pad"
                placeholderTextColor={CALM.textMuted}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              <Text style={styles.label}>current value</Text>
              <TextInput
                style={styles.input}
                value={currentValue}
                onChangeText={setCurrentValue}
                placeholder="0.00"
                keyboardType="decimal-pad"
                placeholderTextColor={CALM.textMuted}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              {/* Annual rate — for projected earnings */}
              <Text style={styles.label}>annual rate % (optional)</Text>
              <TextInput
                style={styles.input}
                value={annualRateValue}
                onChangeText={setAnnualRateValue}
                placeholder="e.g. 5.5 for ASB, 3.55 for GO+"
                keyboardType="decimal-pad"
                placeholderTextColor={CALM.textMuted}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              {/* Target + goal name */}
              <Text style={styles.label}>target value (optional)</Text>
              <TextInput
                style={styles.input}
                value={targetValue}
                onChangeText={setTargetValue}
                placeholder="e.g. 50000"
                keyboardType="decimal-pad"
                placeholderTextColor={CALM.textMuted}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              {targetValue && parseFloat(targetValue) > 0 && (
                <>
                  <Text style={styles.label}>goal name (optional)</Text>
                  <TextInput
                    style={styles.input}
                    value={goalNameValue}
                    onChangeText={setGoalNameValue}
                    placeholder="e.g. rumah sendiri, emergency fund"
                    placeholderTextColor={CALM.textMuted}
                    returnKeyType="done"
                  />
                </>
              )}

              <View style={styles.modalActions}>
                <Button
                  title="Cancel"
                  onPress={() => { setModalVisible(false); resetForm(); }}
                  variant="outline"
                  style={{ flex: 1 }}
                />
                <Button
                  title={editingAccount ? 'Save' : 'Add'}
                  onPress={handleSave}
                  icon="check"
                  style={{ flex: 1 }}
                />
              </View>

              {editingAccount && (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => {
                    setModalVisible(false);
                    resetForm();
                    handleDelete(editingAccount);
                  }}
                  activeOpacity={0.7}
                >
                  <Feather name="trash-2" size={14} color={CALM.neutral} />
                  <Text style={styles.deleteBtnText}>delete this account</Text>
                </TouchableOpacity>
              )}
            </KeyboardAwareScrollView>
          </View>
        </Pressable>
      </Modal>}

      {/* ═══ UPDATE VALUE MODAL ═══ */}
      {updateModalVisible && <Modal
        visible
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setUpdateModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setUpdateModalVisible(false)}>
          <View style={styles.modalContent} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>update value</Text>
              <TouchableOpacity onPress={() => setUpdateModalVisible(false)}>
                <Feather name="x" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            </View>

            {updatingAccount && (
              <View style={styles.updateContext}>
                <Text style={styles.updateContextName}>{updatingAccount.name}</Text>
                <Text style={styles.updateContextPrev}>
                  current: {fmtAmount(updatingAccount.currentValue)}
                </Text>
              </View>
            )}

            <KeyboardAwareScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: Math.max(SPACING.lg, insets.bottom) }}
            >
              {/* Snapshot type selector */}
              <Text style={styles.label}>type of update</Text>
              <View style={styles.snapshotTypeRow}>
                {SNAPSHOT_TYPES.map((st) => (
                  <TouchableOpacity
                    key={st.key}
                    style={[styles.snapshotTypePill, snapshotType === st.key && styles.snapshotTypePillActive]}
                    onPress={() => { setSnapshotType(st.key); selectionChanged(); }}
                    activeOpacity={0.7}
                  >
                    <Feather name={st.icon} size={14} color={snapshotType === st.key ? '#FFF' : CALM.textSecondary} />
                    <Text style={[styles.snapshotTypeText, snapshotType === st.key && styles.snapshotTypeTextActive]}>
                      {st.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>new value</Text>
              <TextInput
                style={styles.input}
                value={newValue}
                onChangeText={setNewValue}
                placeholder="0.00"
                keyboardType="decimal-pad"
                placeholderTextColor={CALM.textMuted}
                returnKeyType="next"
                autoFocus
              />

              <Text style={styles.label}>note (optional)</Text>
              <TextInput
                style={styles.input}
                value={updateNote}
                onChangeText={setUpdateNote}
                placeholder={snapshotType === 'dividend' ? 'e.g. ASB annual dividend' : snapshotType === 'withdrawal' ? 'e.g. emergency use' : 'e.g. monthly check'}
                placeholderTextColor={CALM.textMuted}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              {updatingAccount && newValue && parseFloat(newValue) > 0 && (
                <View style={styles.updatePreview}>
                  {(() => {
                    const nv = parseFloat(newValue);
                    const diff = nv - updatingAccount.currentValue;
                    const pct = updatingAccount.currentValue > 0
                      ? (diff / updatingAccount.currentValue) * 100 : 0;
                    return (
                      <>
                        <Text style={styles.updatePreviewLabel}>
                          {snapshotType === 'dividend' ? 'dividend earned' : snapshotType === 'withdrawal' ? 'withdrawn' : 'change'}
                        </Text>
                        <Text style={[styles.updatePreviewValue, { color: diff >= 0 ? CALM.positive : CALM.neutral }]}>
                          {diff >= 0 ? '+' : ''}{fmtAmount(diff)} ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)
                        </Text>
                      </>
                    );
                  })()}
                </View>
              )}

              <View style={styles.modalActions}>
                <Button
                  title="Cancel"
                  onPress={() => setUpdateModalVisible(false)}
                  variant="outline"
                  style={{ flex: 1 }}
                />
                <Button
                  title="Save"
                  onPress={handleUpdateValue}
                  icon="check"
                  style={{ flex: 1 }}
                />
              </View>
            </KeyboardAwareScrollView>
          </View>
        </Pressable>
      </Modal>}

      {/* ═══ HISTORY MODAL ═══ */}
      {historyModalVisible && <Modal
        visible
        animationType="fade"
        transparent
        statusBarTranslucent
        onRequestClose={() => setHistoryModalVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setHistoryModalVisible(false)}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]} onStartShouldSetResponder={() => true}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{historyAccount?.name || 'history'}</Text>
              <TouchableOpacity onPress={() => setHistoryModalVisible(false)}>
                <Feather name="x" size={24} color={CALM.textPrimary} />
              </TouchableOpacity>
            </View>

            {historyAccount && (
              <>
                {/* Summary */}
                <View style={styles.historySummary}>
                  <View style={styles.historySummaryCol}>
                    <Text style={styles.historySummaryLabel}>invested</Text>
                    <Text style={styles.historySummaryValue}>{fmtAmount(historyAccount.initialInvestment)}</Text>
                  </View>
                  <View style={styles.historySummaryCol}>
                    <Text style={styles.historySummaryLabel}>current</Text>
                    <Text style={styles.historySummaryValue}>{fmtAmount(historyAccount.currentValue)}</Text>
                  </View>
                  <View style={styles.historySummaryCol}>
                    <Text style={styles.historySummaryLabel}>return</Text>
                    <Text style={[styles.historySummaryValue, {
                      color: historyAccount.currentValue >= historyAccount.initialInvestment ? CALM.positive : CALM.neutral,
                    }]}>
                      {historyAccount.initialInvestment > 0
                        ? `${(((historyAccount.currentValue - historyAccount.initialInvestment) / historyAccount.initialInvestment) * 100).toFixed(1)}%`
                        : '—'}
                    </Text>
                  </View>
                </View>

                {/* Chart */}
                {historyData.sparkline.length >= 2 && (
                  <View style={styles.historyChart}>
                    <Sparkline
                      data={historyData.sparkline}
                      width={CHART_W}
                      height={64}
                      showDot
                      filled
                      strokeWidth={2.5}
                    />
                  </View>
                )}

                {(historyData.bestMonth || historyData.worstMonth) && (
                  <View style={styles.historyHighlights}>
                    {historyData.bestMonth ? (
                      <Text style={[styles.historyHighlightText, { color: CALM.positive }]}>
                        best: {historyData.bestMonth}
                      </Text>
                    ) : null}
                    {historyData.worstMonth ? (
                      <Text style={[styles.historyHighlightText, { color: CALM.neutral }]}>
                        worst: {historyData.worstMonth}
                      </Text>
                    ) : null}
                  </View>
                )}
              </>
            )}

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: Math.max(SPACING.lg, insets.bottom) }}>
              {historyData.grouped.map(({ month, items }) => (
                <View key={month}>
                  <Text style={styles.historyMonthHeader}>{month}</Text>
                  {items.map((snap, idx) => {
                    const next = idx < items.length - 1 ? items[idx + 1] : null;
                    const diff = next ? snap.value - next.value : null;
                    const typeIcon = snap.snapshotType === 'dividend' ? 'gift'
                      : snap.snapshotType === 'withdrawal' ? 'arrow-down-left'
                      : 'refresh-cw';
                    return (
                      <View key={snap.id} style={styles.historyItem}>
                        <View style={styles.historyItemIcon}>
                          <Feather name={typeIcon as keyof typeof Feather.glyphMap} size={12} color={CALM.textMuted} />
                        </View>
                        <View style={styles.historyItemLeft}>
                          <Text style={styles.historyItemDate}>
                            {isValid(snap.date) ? format(snap.date, 'MMM dd, yyyy') : '—'}
                          </Text>
                          <Text style={styles.historyItemNote}>
                            {isValid(snap.date) ? format(snap.date, 'hh:mm a') : ''}
                            {snap.note ? ` · ${snap.note}` : ''}
                          </Text>
                        </View>
                        <View style={styles.historyItemRight}>
                          <Text style={styles.historyItemValue}>{fmtAmount(snap.value)}</Text>
                          {diff !== null && (
                            <Text style={[styles.historyItemDiff, { color: diff >= 0 ? CALM.positive : CALM.neutral }]}>
                              {diff >= 0 ? '+' : ''}{diff.toFixed(2)}
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>}
    </View>
  );
};

// ── STYLES ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CALM.background },
  scrollView: { flex: 1 },
  scrollContent: { padding: CARD_PAD, paddingBottom: 80 },

  // ─── Hero ───
  heroCard: {
    padding: CARD_PAD,
    borderRadius: RADIUS.xl,
    marginBottom: SPACING.lg,
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  heroLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.xs,
  },
  heroAmount: {
    fontSize: TYPE.amount.fontSize,
    fontWeight: TYPE.amount.fontWeight,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  sinceLastBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    marginTop: SPACING.xs,
  },
  sinceLastText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'],
  },
  heroChart: {
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  timeRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  timeRangePill: {
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
  },
  timeRangePillActive: {
    backgroundColor: withAlpha(CALM.accent, 0.1),
  },
  timeRangeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textMuted,
  },
  timeRangeTextActive: {
    color: CALM.accent,
  },
  periodChangeText: {
    marginLeft: 'auto',
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
  },
  heroStatsRow: {
    flexDirection: 'row',
    backgroundColor: CALM.background,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
  },
  heroStatItem: { flex: 1, alignItems: 'center', gap: 2 },
  heroStatDivider: { width: 1, backgroundColor: CALM.border },
  heroStatLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  heroStatValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  // ─── Insights ───
  insightsRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  insightCard: {
    flex: 1,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: CALM.border,
    gap: SPACING.xs,
  },
  insightValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  insightLabel: {
    fontSize: 10,
    color: CALM.textMuted,
    lineHeight: 13,
  },

  // ─── Reminder ───
  reminderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.lg,
    backgroundColor: CALM.highlight,
  },
  reminderContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  reminderText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
  },
  reminderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  reminderBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: withAlpha(CALM.gold, 0.15),
    borderRadius: RADIUS.full,
  },
  reminderBtnText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
  },

  // ─── Breakdown ───
  sectionLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
    marginBottom: SPACING.md,
  },
  breakdownCard: {
    padding: CARD_PAD,
    borderRadius: RADIUS.xl,
    marginBottom: SPACING.lg,
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  breakdownName: {
    width: 72,
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  breakdownBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  breakdownBar: { height: 8, borderRadius: RADIUS.full },
  breakdownPct: {
    width: 36,
    textAlign: 'right',
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'],
  },

  // ─── Sort ───
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.md,
  },
  sortPills: {
    flexDirection: 'row',
    gap: SPACING.xs,
  },
  sortPill: {
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: CALM.pillBg,
  },
  sortPillActive: {
    backgroundColor: CALM.accent,
  },
  sortPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
  },
  sortPillTextActive: {
    color: '#FFFFFF',
  },
  accountCount: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },

  // ─── Account Card ───
  accountCard: { marginBottom: SPACING.md },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  accountTypeIcon: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  accountInfo: { flex: 1 },
  accountName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  accountTypeName: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginTop: 1,
  },
  iconBtn: {
    padding: SPACING.sm,
    marginLeft: SPACING.xs,
  },

  // Value
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  valueCurrent: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  returnBadge: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  returnBadgeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
  },
  subStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  subStatText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  accountSparkline: {
    marginBottom: SPACING.sm,
  },
  projectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    backgroundColor: withAlpha(CALM.gold, 0.06),
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
  },
  projectedText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'],
  },

  // Target
  targetSection: {
    marginBottom: SPACING.sm,
    gap: SPACING.xs,
  },
  targetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  targetLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
  },
  targetPct: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.accent,
    fontVariant: ['tabular-nums'],
  },
  goalEtaText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },

  // Footer
  accountFooter: {
    borderTopWidth: 1,
    borderTopColor: CALM.border,
    paddingTop: SPACING.sm,
    gap: SPACING.sm,
  },
  lastUpdatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  staleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  lastUpdatedText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  lastChangeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'],
  },
  accountActions: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    backgroundColor: withAlpha(CALM.accent, 0.08),
    borderRadius: RADIUS.md,
  },
  actionBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
  },
  actionBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  actionBtnSecondaryText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
  },

  // ─── FAB ───
  fab: {
    position: 'absolute',
    bottom: SPACING.lg,
    left: SPACING.lg,
    right: SPACING.lg,
  },

  // ─── Modal shared ───
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: CALM.surface,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    padding: CARD_PAD,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
  },
  label: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
  },
  input: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.xl,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  deleteBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.neutral,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // Dropdown
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  dropdownTriggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  dropdownIcon: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownTriggerText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  dropdownList: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    marginTop: SPACING.xs,
    borderWidth: 1,
    borderColor: CALM.border,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  dropdownItemSelected: {
    backgroundColor: withAlpha(CALM.accent, 0.06),
  },
  dropdownItemIcon: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownItemText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },

  // ─── Snapshot type pills ───
  snapshotTypeRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  snapshotTypePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  snapshotTypePillActive: {
    backgroundColor: CALM.accent,
    borderColor: CALM.accent,
  },
  snapshotTypeText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
  },
  snapshotTypeTextActive: {
    color: '#FFF',
  },

  // ─── Update modal ───
  updateContext: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.xs,
  },
  updateContextName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: 2,
  },
  updateContextPrev: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  updatePreview: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.md,
    alignItems: 'center',
  },
  updatePreviewLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    marginBottom: 4,
  },
  updatePreviewValue: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    fontVariant: ['tabular-nums'],
  },

  // ─── History modal ───
  historySummary: {
    flexDirection: 'row',
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  historySummaryCol: { flex: 1, alignItems: 'center', gap: 2 },
  historySummaryLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  historySummaryValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  historyChart: {
    marginBottom: SPACING.md,
    alignItems: 'center',
  },
  historyHighlights: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: SPACING.md,
  },
  historyHighlightText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  historyMonthHeader: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textSecondary,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    textTransform: 'lowercase',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
    gap: SPACING.sm,
  },
  historyItemIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: CALM.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyItemLeft: { flex: 1 },
  historyItemDate: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  historyItemNote: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    marginTop: 1,
  },
  historyItemRight: { alignItems: 'flex-end' },
  historyItemValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  historyItemDiff: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    fontVariant: ['tabular-nums'],
    marginTop: 1,
  },
});

export default SavingsTracker;
