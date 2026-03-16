import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  Animated,
  Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import {
  format,
  isSameDay,
  isToday,
  isThisWeek,
  isThisMonth,
  startOfDay,
  endOfDay,
  isBefore,
  isAfter,
  isValid,
} from 'date-fns';
import { useSellerStore } from '../../store/sellerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, TYPE, withAlpha, BIZ } from '../../constants';
import { SellerPaymentMethod } from '../../types';
import { useFadeSlide } from '../../utils/fadeSlide';
import { useToast } from '../../context/ToastContext';
import { lightTap } from '../../services/haptics';
import CalendarPicker from '../../components/common/CalendarPicker';

// ─── Types ─────────────────────────────────────────────────
interface PaymentEvent {
  id: string;
  orderId: string;
  orderNumber?: string;
  customerName: string;
  amount: number;
  method: SellerPaymentMethod;
  date: Date;
  note?: string;
  type: 'full' | 'deposit';
}

type FilterMethod = 'all' | SellerPaymentMethod;
type FilterType = 'all' | 'full' | 'deposit';
type SortOption = 'newest' | 'oldest' | 'highest' | 'lowest';
type PeriodFilter = 'all' | 'today' | 'this_week' | 'this_month' | 'custom';

const SORT_OPTIONS: { value: SortOption; label: string; icon: string }[] = [
  { value: 'newest', label: 'newest first', icon: 'arrow-down' },
  { value: 'oldest', label: 'oldest first', icon: 'arrow-up' },
  { value: 'highest', label: 'highest amount', icon: 'trending-up' },
  { value: 'lowest', label: 'lowest amount', icon: 'trending-down' },
];

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: 'all', label: 'all time' },
  { value: 'today', label: 'today' },
  { value: 'this_week', label: 'this week' },
  { value: 'this_month', label: 'this month' },
  { value: 'custom', label: 'custom range' },
];

const TYPE_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'all' },
  { value: 'full', label: 'full payment' },
  { value: 'deposit', label: 'deposit' },
];

const METHOD_ICON: Record<SellerPaymentMethod, string> = {
  cash: 'dollar-sign',
  ewallet: 'credit-card',
  duitnow: 'grid',
  bank_transfer: 'smartphone',
  tng: 'credit-card',
  grab: 'credit-card',
  boost: 'credit-card',
  maybank_qr: 'grid',
};

const METHOD_LABEL: Record<SellerPaymentMethod, string> = {
  cash: 'cash',
  ewallet: 'e-wallet',
  duitnow: 'QR',
  bank_transfer: 'transfer',
  tng: 'TnG',
  grab: 'GrabPay',
  boost: 'Boost',
  maybank_qr: 'Maybank QR',
};

// ─── Component ─────────────────────────────────────────────
const SellerTransactions: React.FC = () => {
  const { orders } = useSellerStore();
  const currency = useSettingsStore((s) => s.currency);
  const toast = useToast();

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMethod, setFilterMethod] = useState<FilterMethod>('all');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [customDateFrom, setCustomDateFrom] = useState<Date | null>(null);
  const [customDateTo, setCustomDateTo] = useState<Date | null>(null);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showFromCalendar, setShowFromCalendar] = useState(false);
  const [showToCalendar, setShowToCalendar] = useState(false);

  const headerAnim = useFadeSlide(0);
  const listAnim = useFadeSlide(60);

  // Memoize today's date to avoid re-creating each render
  const today = useMemo(() => new Date(), []);

  // Derive all payment events from orders
  const allPayments = useMemo(() => {
    const events: PaymentEvent[] = [];

    for (const order of orders) {
      // Deposits
      if (order.deposits && order.deposits.length > 0) {
        for (const dep of order.deposits) {
          events.push({
            id: dep.id || `${order.id}-dep-${dep.date}`,
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerName: order.customerName || 'walk-in',
            amount: dep.amount,
            method: dep.method,
            date: (() => { const dd = dep.date instanceof Date ? dep.date : new Date(dep.date); return isValid(dd) ? dd : new Date(); })(),
            note: dep.note,
            type: 'deposit',
          });
        }
      }

      // Full payment (only if marked paid and not covered by deposits alone)
      if (order.isPaid && order.paidAt && order.paymentMethod) {
        const depositTotal = (order.deposits || []).reduce((s, d) => s + d.amount, 0);
        const fullPayAmount = order.totalAmount - depositTotal;
        if (fullPayAmount > 0) {
          events.push({
            id: `${order.id}-paid`,
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerName: order.customerName || 'walk-in',
            amount: fullPayAmount,
            method: order.paymentMethod,
            date: (() => { const dd = order.paidAt instanceof Date ? order.paidAt : new Date(order.paidAt!); return isValid(dd) ? dd : new Date(); })(),
            note: order.note,
            type: 'full',
          });
        }
      }
    }

    // Default sort newest first
    events.sort((a, b) => b.date.getTime() - a.date.getTime());
    return events;
  }, [orders]);

  // Has active filters (beyond defaults)
  const hasActiveFilters = useMemo(() => {
    return (
      filterMethod !== 'all' ||
      filterType !== 'all' ||
      sortBy !== 'newest' ||
      periodFilter !== 'all' ||
      searchQuery.trim().length > 0
    );
  }, [filterMethod, filterType, sortBy, periodFilter, searchQuery]);

  // Filter + search + sort pipeline
  const filtered = useMemo(() => {
    let result = allPayments;

    // Method filter
    if (filterMethod !== 'all') {
      result = result.filter((e) => e.method === filterMethod);
    }

    // Type filter
    if (filterType !== 'all') {
      result = result.filter((e) => e.type === filterType);
    }

    // Period filter
    if (periodFilter === 'today') {
      result = result.filter((e) => isToday(e.date));
    } else if (periodFilter === 'this_week') {
      result = result.filter((e) => isThisWeek(e.date, { weekStartsOn: 1 }));
    } else if (periodFilter === 'this_month') {
      result = result.filter((e) => isThisMonth(e.date));
    } else if (periodFilter === 'custom') {
      if (customDateFrom) {
        const from = startOfDay(customDateFrom);
        result = result.filter((e) => !isBefore(e.date, from));
      }
      if (customDateTo) {
        const to = endOfDay(customDateTo);
        result = result.filter((e) => !isAfter(e.date, to));
      }
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.customerName.toLowerCase().includes(q) ||
          (e.orderNumber && e.orderNumber.toLowerCase().includes(q)) ||
          (e.note && e.note.toLowerCase().includes(q))
      );
    }

    // Sort
    switch (sortBy) {
      case 'newest':
        result = [...result].sort((a, b) => b.date.getTime() - a.date.getTime());
        break;
      case 'oldest':
        result = [...result].sort((a, b) => a.date.getTime() - b.date.getTime());
        break;
      case 'highest':
        result = [...result].sort((a, b) => b.amount - a.amount);
        break;
      case 'lowest':
        result = [...result].sort((a, b) => a.amount - b.amount);
        break;
    }

    return result;
  }, [allPayments, filterMethod, filterType, periodFilter, customDateFrom, customDateTo, searchQuery, sortBy]);

  // Summary
  const totalAmount = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered]);

  // Daily totals map for date headers
  const dailyTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filtered) {
      const key = format(e.date, 'yyyy-MM-dd');
      map.set(key, (map.get(key) || 0) + e.amount);
    }
    return map;
  }, [filtered]);

  // Only show methods that have transactions
  const usedMethods = useMemo(() => {
    const set = new Set(allPayments.map((e) => e.method));
    return Array.from(set) as SellerPaymentMethod[];
  }, [allPayments]);

  // Handlers
  const handleResetFilters = useCallback(() => {
    setFilterMethod('all');
    setFilterType('all');
    setSortBy('newest');
    setPeriodFilter('all');
    setCustomDateFrom(null);
    setCustomDateTo(null);
    setSearchQuery('');
    lightTap();
  }, []);

  const handleExportSummary = useCallback(async () => {
    const lines: string[] = [];
    const periodLabel =
      periodFilter === 'today' ? 'today' :
      periodFilter === 'this_week' ? 'this week' :
      periodFilter === 'this_month' ? 'this month' :
      periodFilter === 'custom' && customDateFrom && customDateTo
        ? `${format(customDateFrom, 'd MMM yyyy')} – ${format(customDateTo, 'd MMM yyyy')}`
        : 'all time';

    lines.push(`Transactions Summary (${periodLabel})`);
    lines.push(`Total: ${currency} ${totalAmount.toFixed(2)}`);
    lines.push(`Count: ${filtered.length} transactions`);
    lines.push('');

    let currentDate = '';
    for (const e of filtered) {
      const dateStr = format(e.date, 'EEEE, d MMM yyyy');
      if (dateStr !== currentDate) {
        currentDate = dateStr;
        const dayKey = format(e.date, 'yyyy-MM-dd');
        const dayTotal = dailyTotals.get(dayKey) || 0;
        lines.push(`── ${dateStr}  (${currency} ${dayTotal.toFixed(2)}) ──`);
      }
      const orderNo = e.orderNumber ? `#${e.orderNumber}` : '';
      const typeLabel = e.type === 'deposit' ? 'deposit' : 'paid';
      lines.push(`  ${e.customerName} ${orderNo} · ${typeLabel} · ${METHOD_LABEL[e.method]} · ${currency} ${e.amount.toFixed(2)}`);
    }

    await Clipboard.setStringAsync(lines.join('\n'));
    lightTap();
    toast.showToast('copied to clipboard', 'success');
  }, [filtered, totalAmount, dailyTotals, currency, periodFilter, customDateFrom, customDateTo, toast]);

  const handleSetFromDate = useCallback((date: Date) => {
    setCustomDateFrom(date);
    if (customDateTo && isBefore(customDateTo, date)) {
      setCustomDateTo(date);
    }
    setShowFromCalendar(false);
  }, [customDateTo]);

  const handleSetToDate = useCallback((date: Date) => {
    setCustomDateTo(date);
    setShowToCalendar(false);
  }, []);

  const handleQuickChipPress = useCallback((period: PeriodFilter) => {
    setPeriodFilter(period);
    if (period !== 'custom') {
      setCustomDateFrom(null);
      setCustomDateTo(null);
    }
    lightTap();
  }, []);

  // Render transaction item
  const renderItem = useCallback(
    ({ item, index }: { item: PaymentEvent; index: number }) => {
      const prev = index > 0 ? filtered[index - 1] : null;
      const showDateHeader = sortBy === 'newest' || sortBy === 'oldest'
        ? !prev || !isSameDay(item.date, prev.date)
        : index === 0 || !isSameDay(item.date, prev!.date);

      const dayKey = format(item.date, 'yyyy-MM-dd');
      const dayTotal = dailyTotals.get(dayKey) || 0;

      return (
        <>
          {showDateHeader && (
            <View style={styles.dateHeaderRow}>
              <Text style={styles.dateHeader}>
                {format(item.date, 'EEEE, d MMM yyyy')}
              </Text>
              <Text style={styles.dateHeaderTotal}>
                {currency} {dayTotal.toFixed(2)}
              </Text>
            </View>
          )}
          <View style={styles.txRow}>
            <View style={[styles.txIcon, { backgroundColor: withAlpha(BIZ.success, 0.1) }]}>
              <Feather
                name={METHOD_ICON[item.method] as any}
                size={16}
                color={BIZ.success}
              />
            </View>
            <View style={styles.txContent}>
              <View style={styles.txTopRow}>
                <Text style={styles.txName} numberOfLines={1}>
                  {item.customerName}
                </Text>
                <Text style={styles.txAmount}>
                  +{currency} {item.amount.toFixed(2)}
                </Text>
              </View>
              <View style={styles.txBottomRow}>
                <Text style={styles.txMeta} numberOfLines={1}>
                  {item.orderNumber ? `#${item.orderNumber}` : ''}
                  {item.orderNumber ? ' · ' : ''}
                  {item.type === 'deposit' ? 'deposit' : 'paid'}
                  {' · '}
                  {METHOD_LABEL[item.method]}
                </Text>
                <Text style={styles.txTime}>{format(item.date, 'h:mm a')}</Text>
              </View>
              {item.note ? (() => {
                const tipMatch = item.note.match(/(tip\s+\S+\s+[\d,.]+)/i);
                if (tipMatch) {
                  const idx = item.note.indexOf(tipMatch[1]);
                  const before = item.note.slice(0, idx).replace(/\s*·\s*$/, '');
                  return (
                    <Text style={styles.txNote} numberOfLines={1}>
                      {before ? <>{before} · </> : null}
                      <Text style={{ color: CALM.bronze, fontStyle: 'normal', fontWeight: '600' }}>{tipMatch[1]}</Text>
                    </Text>
                  );
                }
                return <Text style={styles.txNote} numberOfLines={1}>{item.note}</Text>;
              })() : null}
            </View>
          </View>
        </>
      );
    },
    [filtered, currency, dailyTotals, sortBy]
  );

  // Quick chips: period shortcuts + payment method chips
  const quickChips = useMemo(() => {
    const chips: { key: string; label: string; onPress: () => void; active: boolean; icon?: string }[] = [
      { key: 'all', label: 'all', onPress: () => { handleResetFilters(); }, active: !hasActiveFilters },
      { key: 'today', label: 'today', onPress: () => handleQuickChipPress('today'), active: periodFilter === 'today' },
      { key: 'this_week', label: 'this week', onPress: () => handleQuickChipPress('this_week'), active: periodFilter === 'this_week' },
      { key: 'this_month', label: 'this month', onPress: () => handleQuickChipPress('this_month'), active: periodFilter === 'this_month' },
    ];
    // Add payment method chips
    for (const m of usedMethods) {
      chips.push({
        key: m,
        label: METHOD_LABEL[m],
        icon: METHOD_ICON[m],
        onPress: () => { setFilterMethod((prev) => prev === m ? 'all' : m); lightTap(); },
        active: filterMethod === m,
      });
    }
    return chips;
  }, [usedMethods, filterMethod, periodFilter, hasActiveFilters, handleResetFilters, handleQuickChipPress]);

  return (
    <View style={styles.screen}>
      {/* Header */}
      <Animated.View style={[styles.header, headerAnim]}>
        <Text style={styles.headerLabel}>TRANSACTIONS</Text>
        <Text style={styles.headerSubtitle}>all payments received</Text>
      </Animated.View>

      {/* Summary card */}
      <Animated.View style={[styles.summaryCard, headerAnim]}>
        <View>
          <Text style={styles.summaryLabel}>total received</Text>
          <Text style={styles.summaryAmount}>
            {currency} {totalAmount.toFixed(2)}
          </Text>
        </View>
        <View style={styles.summaryRight}>
          <Text style={styles.summaryCount}>{filtered.length} transactions</Text>
          <TouchableOpacity
            onPress={handleExportSummary}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.exportBtn}
            activeOpacity={0.7}
          >
            <Feather name="copy" size={14} color={CALM.textMuted} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Search bar + filter icon */}
      <Animated.View style={[styles.searchRowOuter, headerAnim]}>
        <View style={styles.searchRow}>
          <Feather name="search" size={16} color={CALM.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="search by name, order #, or note"
            placeholderTextColor={CALM.textMuted}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={16} color={CALM.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.sortButton, hasActiveFilters && styles.sortButtonActive]}
          onPress={() => { setShowFilterModal(true); lightTap(); }}
          activeOpacity={0.7}
        >
          <Feather name="sliders" size={18} color={hasActiveFilters ? CALM.bronze : CALM.textSecondary} />
          {hasActiveFilters && <View style={styles.sortActiveDot} />}
        </TouchableOpacity>
      </Animated.View>

      {/* Quick filter chips */}
      <Animated.View style={listAnim}>
        <FlatList
          horizontal
          data={quickChips}
          keyExtractor={(c) => c.key}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickChipRow}
          renderItem={({ item: chip }) => (
            <TouchableOpacity
              style={[styles.quickChip, chip.active && styles.quickChipActive]}
              activeOpacity={0.7}
              onPress={chip.onPress}
            >
              {chip.icon && (
                <Feather
                  name={chip.icon as any}
                  size={12}
                  color={chip.active ? CALM.bronze : CALM.textSecondary}
                />
              )}
              <Text style={[styles.quickChipText, chip.active && styles.quickChipTextActive]}>
                {chip.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </Animated.View>

      {/* List */}
      <Animated.View style={[{ flex: 1 }, listAnim]}>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews
          windowSize={5}
          maxToRenderPerBatch={8}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="inbox" size={32} color={CALM.textMuted} />
              <Text style={styles.emptyText}>
                {allPayments.length === 0
                  ? 'no payments recorded yet.'
                  : 'no matching transactions.'}
              </Text>
              {hasActiveFilters && allPayments.length > 0 && (
                <TouchableOpacity onPress={handleResetFilters} activeOpacity={0.7}>
                  <Text style={styles.clearFiltersText}>clear filters</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      </Animated.View>

      {/* ─── Filter modal ──────────────────────────────────── */}
      {showFilterModal && (
      <Modal
        visible
        transparent
        animationType="fade"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <Pressable
          style={styles.sortOverlay}
          onPress={() => setShowFilterModal(false)}
        >
          <Pressable style={styles.filterSortSheet} onPress={(e) => e.stopPropagation()}>
            {(showFromCalendar || showToCalendar) ? (
              <>
                {/* Calendar view */}
                <View style={styles.filterSortHeader}>
                  <TouchableOpacity onPress={() => { setShowFromCalendar(false); setShowToCalendar(false); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name="arrow-left" size={16} color={CALM.textSecondary} />
                    <Text style={TYPE.label}>{showFromCalendar ? 'from date' : 'to date'}</Text>
                  </TouchableOpacity>
                </View>
                {showFromCalendar && (
                  <CalendarPicker
                    value={customDateFrom || today}
                    onChange={handleSetFromDate}
                  />
                )}
                {showToCalendar && (
                  <CalendarPicker
                    value={customDateTo || today}
                    minimumDate={customDateFrom || undefined}
                    onChange={handleSetToDate}
                  />
                )}
              </>
            ) : (
              <>
                {/* Filter view */}
                <View style={styles.filterSortHeader}>
                  <Text style={TYPE.label}>filters</Text>
                  {hasActiveFilters && (
                    <TouchableOpacity onPress={() => { handleResetFilters(); setShowFilterModal(false); }}>
                      <Text style={styles.filterSortClear}>reset</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <ScrollView showsVerticalScrollIndicator={false} style={styles.filterSortScroll}>
                  {/* Sort by */}
                  <Text style={styles.filterSectionLabel}>sort by</Text>
                  <View style={styles.filterSectionPills}>
                    {SORT_OPTIONS.map((opt) => {
                      const active = sortBy === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={[styles.filterPill, active && styles.filterPillActive]}
                          onPress={() => { setSortBy(opt.value); lightTap(); }}
                          activeOpacity={0.7}
                        >
                          <Feather
                            name={opt.icon as any}
                            size={12}
                            color={active ? CALM.bronze : CALM.textMuted}
                          />
                          <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Payment method */}
                  <Text style={styles.filterSectionLabel}>payment method</Text>
                  <View style={styles.filterSectionPills}>
                    <TouchableOpacity
                      style={[styles.filterPill, filterMethod === 'all' && styles.filterPillActive]}
                      onPress={() => { setFilterMethod('all'); lightTap(); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.filterPillText, filterMethod === 'all' && styles.filterPillTextActive]}>
                        all
                      </Text>
                    </TouchableOpacity>
                    {usedMethods.map((m) => {
                      const active = filterMethod === m;
                      return (
                        <TouchableOpacity
                          key={m}
                          style={[styles.filterPill, active && styles.filterPillActive]}
                          onPress={() => { setFilterMethod(m); lightTap(); }}
                          activeOpacity={0.7}
                        >
                          <Feather
                            name={METHOD_ICON[m] as any}
                            size={12}
                            color={active ? CALM.bronze : CALM.textMuted}
                          />
                          <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                            {METHOD_LABEL[m]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Type */}
                  <Text style={styles.filterSectionLabel}>type</Text>
                  <View style={styles.filterSectionPills}>
                    {TYPE_OPTIONS.map((opt) => {
                      const active = filterType === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={[styles.filterPill, active && styles.filterPillActive]}
                          onPress={() => { setFilterType(opt.value); lightTap(); }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Period */}
                  <Text style={styles.filterSectionLabel}>period</Text>
                  <View style={styles.filterSectionPills}>
                    {PERIOD_OPTIONS.map((opt) => {
                      const active = periodFilter === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={[styles.filterPill, active && styles.filterPillActive]}
                          onPress={() => {
                            setPeriodFilter(opt.value);
                            if (opt.value !== 'custom') {
                              setCustomDateFrom(null);
                              setCustomDateTo(null);
                            }
                            lightTap();
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Custom date range */}
                  {periodFilter === 'custom' && (
                    <View style={styles.customDateSection}>
                      <TouchableOpacity
                        style={styles.dateRangeBtn}
                        onPress={() => setShowFromCalendar(true)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.dateRangeLabel}>from</Text>
                        <Text style={styles.dateRangeValue}>
                          {customDateFrom ? format(customDateFrom, 'd MMM yyyy') : 'select date'}
                        </Text>
                        <Feather name="calendar" size={14} color={CALM.textMuted} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.dateRangeBtn}
                        onPress={() => setShowToCalendar(true)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.dateRangeLabel}>to</Text>
                        <Text style={styles.dateRangeValue}>
                          {customDateTo ? format(customDateTo, 'd MMM yyyy') : 'select date'}
                        </Text>
                        <Feather name="calendar" size={14} color={CALM.textMuted} />
                      </TouchableOpacity>
                    </View>
                  )}
                </ScrollView>

                {/* Done */}
                <TouchableOpacity
                  style={styles.filterSortDone}
                  onPress={() => setShowFilterModal(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.filterSortDoneText}>done</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
      )}

    </View>
  );
};

// ─── Styles ────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  headerLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold as any,
    color: CALM.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  headerSubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    marginTop: 2,
  },
  summaryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: CALM.surface,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  summaryLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    marginBottom: 2,
  },
  summaryAmount: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold as any,
    color: BIZ.success,
    fontVariant: ['tabular-nums'],
  },
  summaryRight: {
    alignItems: 'flex-end',
    gap: SPACING.xs,
  },
  summaryCount: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  exportBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: withAlpha(CALM.textMuted, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Search + filter icon ──
  searchRowOuter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: CALM.border,
    minHeight: 44,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    paddingVertical: SPACING.sm,
  },
  sortButton: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.lg,
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortButtonActive: {
    borderColor: CALM.bronze,
  },
  sortActiveDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: CALM.bronze,
    borderWidth: 1.5,
    borderColor: CALM.background,
  },

  // ── Quick chips ──
  quickChipRow: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
    gap: 6,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: 10,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 32,
  },
  quickChipActive: {
    borderColor: CALM.bronze,
  },
  quickChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium as any,
    color: CALM.textSecondary,
  },
  quickChipTextActive: {
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
  },

  // ── List ──
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING['2xl'],
  },
  dateHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
  },
  dateHeader: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: CALM.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateHeaderTotal: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: BIZ.success,
    fontVariant: ['tabular-nums'],
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.xs,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  txContent: {
    flex: 1,
  },
  txTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  txName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium as any,
    color: CALM.textPrimary,
    flex: 1,
    marginRight: SPACING.sm,
  },
  txAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: BIZ.success,
    fontVariant: ['tabular-nums'],
  },
  txBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  txMeta: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    flex: 1,
  },
  txTime: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  txNote: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    marginTop: 3,
    fontStyle: 'italic',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: SPACING.md,
  },
  emptyText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
  },
  clearFiltersText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.medium as any,
  },

  // ── Filter modal ──
  sortOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterSortSheet: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING['2xl'],
    paddingBottom: SPACING.md,
    width: '88%',
    maxWidth: 360,
    maxHeight: '70%',
  },
  filterSortHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  filterSortClear: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium as any,
    color: CALM.bronze,
  },
  filterSortScroll: {
    flexGrow: 0,
  },
  filterSectionLabel: {
    ...TYPE.label,
    marginTop: SPACING.md,
    marginBottom: SPACING.xs,
  },
  filterSectionPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.sm + 2,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 30,
  },
  filterPillActive: {
    borderColor: CALM.bronze,
  },
  filterPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium as any,
  },
  filterPillTextActive: {
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
  },
  filterSortDone: {
    alignItems: 'center',
    paddingVertical: SPACING.sm + 2,
    marginTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CALM.border,
  },
  filterSortDoneText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: CALM.bronze,
  },

  // ── Custom date range ──
  customDateSection: {
    marginTop: SPACING.sm,
    gap: SPACING.xs,
  },
  dateRangeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withAlpha(CALM.accent, 0.05),
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  dateRangeLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium as any,
    width: 36,
  },
  dateRangeValue: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
  },

});

export default SellerTransactions;
