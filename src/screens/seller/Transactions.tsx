import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  Animated,
  Pressable,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
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
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, TYPE, withAlpha, BIZ, BIZ_SAFE, semantic } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { SellerPaymentMethod } from '../../types';
import { useFadeSlide } from '../../utils/fadeSlide';
import { useToast } from '../../context/ToastContext';
import { lightTap } from '../../services/haptics';
import CalendarPicker from '../../components/common/CalendarPicker';
import ModalToastHost from '../../components/common/ModalToastHost';

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

const SORT_ICONS: Record<SortOption, string> = {
  newest: 'arrow-down',
  oldest: 'arrow-up',
  highest: 'trending-up',
  lowest: 'trending-down',
};

const METHOD_ICON: Record<SellerPaymentMethod, string> = {
  cash: 'dollar-sign',
  ewallet: 'credit-card',
  duitnow: 'grid',
  bank_transfer: 'smartphone',
  tng: 'credit-card',
  grab: 'credit-card',
  boost: 'credit-card',
  maybank_qr: 'grid',
  card: 'wifi',
};

// ─── Component ─────────────────────────────────────────────
const SellerTransactions: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const bizSuccess = semantic(BIZ_SAFE.success, isDark);
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);

  const SORT_OPTIONS: { value: SortOption; label: string; icon: string }[] = [
    { value: 'newest', label: t.seller.sortNewest, icon: SORT_ICONS.newest },
    { value: 'oldest', label: t.seller.sortOldest, icon: SORT_ICONS.oldest },
    { value: 'highest', label: t.seller.sortHighest, icon: SORT_ICONS.highest },
    { value: 'lowest', label: t.seller.sortLowest, icon: SORT_ICONS.lowest },
  ];

  const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
    { value: 'all', label: t.seller.periodAll },
    { value: 'today', label: t.seller.periodToday },
    { value: 'this_week', label: t.seller.periodThisWeek },
    { value: 'this_month', label: t.seller.periodThisMonth },
    { value: 'custom', label: t.seller.periodCustom },
  ];

  const TYPE_OPTIONS: { value: FilterType; label: string }[] = [
    { value: 'all', label: t.seller.typeAll },
    { value: 'full', label: t.seller.typeFull },
    { value: 'deposit', label: t.seller.typeDeposit },
  ];

  const METHOD_LABEL: Record<SellerPaymentMethod, string> = {
    cash: t.seller.methodCash,
    ewallet: t.seller.methodEwallet,
    duitnow: t.seller.methodDuitnow,
    bank_transfer: t.seller.methodBankTransfer,
    tng: t.seller.methodTng,
    grab: t.seller.methodGrab,
    boost: t.seller.methodBoost,
    maybank_qr: t.seller.methodMaybankQr,
    card: t.tapToPay.card,
  };
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
            customerName: order.customerName || t.seller.walkIn,
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
            customerName: order.customerName || t.seller.walkIn,
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
      periodFilter === 'today' ? t.seller.periodToday :
      periodFilter === 'this_week' ? t.seller.periodThisWeek :
      periodFilter === 'this_month' ? t.seller.periodThisMonth :
      periodFilter === 'custom' && customDateFrom && customDateTo
        ? `${format(customDateFrom, 'd MMM yyyy')} – ${format(customDateTo, 'd MMM yyyy')}`
        : t.seller.periodAll;

    lines.push(`${t.seller.txTitle} (${periodLabel})`);
    lines.push(`${t.seller.totalReceived}: ${currency} ${totalAmount.toFixed(2)}`);
    lines.push(t.seller.nTransactions.replace('{n}', String(filtered.length)));
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
      const typeLabel = e.type === 'deposit' ? t.seller.deposit : t.seller.paid;
      lines.push(`  ${e.customerName} ${orderNo} · ${typeLabel} · ${METHOD_LABEL[e.method]} · ${currency} ${e.amount.toFixed(2)}`);
    }

    await Clipboard.setStringAsync(lines.join('\n'));
    lightTap();
    toast.showToast(t.seller.copiedToClipboard, 'success');
  }, [filtered, totalAmount, dailyTotals, currency, periodFilter, customDateFrom, customDateTo, toast, t, METHOD_LABEL]);

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
            <View style={[styles.txIcon, { backgroundColor: withAlpha(bizSuccess, 0.1) }]}>
              <Feather
                name={METHOD_ICON[item.method] as keyof typeof Feather.glyphMap}
                size={16}
                color={bizSuccess}
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
                  {item.type === 'deposit' ? t.seller.deposit : t.seller.paid}
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
                      <Text style={{ color: C.bronze, fontStyle: 'normal', fontWeight: '600' }}>{tipMatch[1]}</Text>
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
      { key: 'all', label: t.seller.all, onPress: () => { handleResetFilters(); }, active: !hasActiveFilters },
      { key: 'today', label: t.seller.periodToday, onPress: () => handleQuickChipPress('today'), active: periodFilter === 'today' },
      { key: 'this_week', label: t.seller.periodThisWeek, onPress: () => handleQuickChipPress('this_week'), active: periodFilter === 'this_week' },
      { key: 'this_month', label: t.seller.periodThisMonth, onPress: () => handleQuickChipPress('this_month'), active: periodFilter === 'this_month' },
    ];
    return chips;
  }, [periodFilter, hasActiveFilters, handleResetFilters, handleQuickChipPress, t]);

  return (
    <View style={styles.screen}>
      {/* Header */}
      <Animated.View style={[styles.header, headerAnim]}>
        <Text style={styles.headerLabel}>{t.seller.txTitle}</Text>
        <Text style={styles.headerSubtitle}>{t.seller.txSubtitle}</Text>
      </Animated.View>

      {/* Summary card */}
      <Animated.View style={[styles.summaryCard, headerAnim]}>
        <View>
          <Text style={styles.summaryLabel}>{t.seller.totalReceived}</Text>
          <Text style={styles.summaryAmount}>
            {currency} {totalAmount.toFixed(2)}
          </Text>
        </View>
        <View style={styles.summaryRight}>
          <Text style={styles.summaryCount}>{t.seller.nTransactions.replace('{n}', String(filtered.length))}</Text>
          <TouchableOpacity
            onPress={handleExportSummary}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.exportBtn}
            activeOpacity={0.7}
          >
            <Feather name="copy" size={14} color={C.textMuted} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Search bar + filter icon */}
      <Animated.View style={[styles.searchRowOuter, headerAnim]}>
        <View style={styles.searchRow}>
          <Feather name="search" size={16} color={C.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t.seller.searchPlaceholder}
            placeholderTextColor={withAlpha(C.textMuted, 0.6)}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={16} color={C.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.sortButton, hasActiveFilters && styles.sortButtonActive]}
          onPress={() => { setShowFilterModal(true); lightTap(); }}
          activeOpacity={0.7}
        >
          <Feather name="sliders" size={18} color={hasActiveFilters ? C.bronze : C.textSecondary} />
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
                  name={chip.icon as keyof typeof Feather.glyphMap}
                  size={12}
                  color={chip.active ? C.bronze : C.textSecondary}
                />
              )}
              <Text style={[styles.quickChipText, chip.active && styles.quickChipTextActive]}>
                {chip.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </Animated.View>

      {/* Active filter summary */}
      {hasActiveFilters && (
        <View style={styles.resultRow}>
          <Text style={styles.resultText}>
            {filtered.length} of {allPayments.length}
          </Text>
          <TouchableOpacity
            onPress={handleResetFilters}
            activeOpacity={0.7}
            style={styles.clearFiltersBtn}
            accessibilityRole="button"
            accessibilityLabel="Clear all filters"
          >
            <Feather name="x" size={14} color={C.bronze} />
            <Text style={styles.clearFiltersBtnText}>clear</Text>
          </TouchableOpacity>
        </View>
      )}

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
              <View style={styles.emptyIconCircle}>
                <Feather name="inbox" size={28} color={C.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>
                {allPayments.length === 0
                  ? t.seller.noPaymentsRecorded
                  : t.seller.noMatchingTransactions}
              </Text>
              <Text style={styles.emptySubtitle}>
                {allPayments.length === 0
                  ? 'payments will appear here as orders get paid.'
                  : 'try adjusting your filters.'}
              </Text>
              {hasActiveFilters && allPayments.length > 0 && (
                <TouchableOpacity onPress={handleResetFilters} activeOpacity={0.7} style={styles.emptySecondary}>
                  <Text style={styles.clearFiltersText}>{t.seller.clearFilters}</Text>
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
          <Pressable style={styles.filterSortSheet} onPress={(e) => e.stopPropagation()} onStartShouldSetResponder={() => true}>
            {(showFromCalendar || showToCalendar) ? (
              <>
                {/* Calendar view */}
                <View style={styles.filterSortHeader}>
                  <TouchableOpacity onPress={() => { setShowFromCalendar(false); setShowToCalendar(false); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name="arrow-left" size={16} color={C.textSecondary} />
                    <Text style={TYPE.label}>{showFromCalendar ? t.seller.fromDate : t.seller.toDate}</Text>
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
                  <Text style={TYPE.label}>{t.seller.filters}</Text>
                  {hasActiveFilters && (
                    <TouchableOpacity onPress={() => { handleResetFilters(); setShowFilterModal(false); }}>
                      <Text style={styles.filterSortClear}>{t.seller.reset}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <ScrollView showsVerticalScrollIndicator={false} style={styles.filterSortScroll}>
                  {/* Sort by */}
                  <Text style={styles.filterSectionLabel}>{t.seller.sortBy}</Text>
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
                            name={opt.icon as keyof typeof Feather.glyphMap}
                            size={12}
                            color={active ? C.bronze : C.textMuted}
                          />
                          <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Payment method */}
                  <Text style={styles.filterSectionLabel}>{t.seller.paymentMethod}</Text>
                  <View style={styles.filterSectionPills}>
                    <TouchableOpacity
                      style={[styles.filterPill, filterMethod === 'all' && styles.filterPillActive]}
                      onPress={() => { setFilterMethod('all'); lightTap(); }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.filterPillText, filterMethod === 'all' && styles.filterPillTextActive]}>
                        {t.seller.all}
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
                            name={METHOD_ICON[m] as keyof typeof Feather.glyphMap}
                            size={12}
                            color={active ? C.bronze : C.textMuted}
                          />
                          <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                            {METHOD_LABEL[m]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Type */}
                  <Text style={styles.filterSectionLabel}>{t.seller.type}</Text>
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
                  <Text style={styles.filterSectionLabel}>{t.seller.period}</Text>
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
                        <Text style={styles.dateRangeLabel}>{t.seller.from}</Text>
                        <Text style={styles.dateRangeValue}>
                          {customDateFrom ? format(customDateFrom, 'd MMM yyyy') : t.seller.selectDate}
                        </Text>
                        <Feather name="calendar" size={14} color={C.textMuted} />
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.dateRangeBtn}
                        onPress={() => setShowToCalendar(true)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.dateRangeLabel}>{t.seller.to}</Text>
                        <Text style={styles.dateRangeValue}>
                          {customDateTo ? format(customDateTo, 'd MMM yyyy') : t.seller.selectDate}
                        </Text>
                        <Feather name="calendar" size={14} color={C.textMuted} />
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
                  <Text style={styles.filterSortDoneText}>{t.seller.doneBtn}</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
        <ModalToastHost />
      </Modal>
      )}

    </View>
  );
};

// ─── Styles ────────────────────────────────────────────────
const makeStyles = (C: typeof CALM) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  header: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xs,
    maxWidth: 680,
  },
  headerLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  headerSubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginTop: SPACING.xs,
  },
  summaryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.surface,
    marginHorizontal: SPACING.xl,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
    maxWidth: 680,
  },
  summaryLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginBottom: SPACING.xs,
  },
  summaryAmount: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: BIZ.success,
    fontVariant: ['tabular-nums'],
  },
  summaryRight: {
    alignItems: 'flex-end',
    gap: SPACING.xs,
  },
  summaryCount: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
  exportBtn: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textMuted, 0.06),
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Search + filter icon ──
  searchRowOuter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
    maxWidth: 680,
  },
  searchRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withAlpha(C.textMuted, 0.06),
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.md,
    minHeight: 44,
    gap: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    paddingVertical: SPACING.xs,
  },
  sortButton: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textMuted, 0.06),
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortButtonActive: {
    backgroundColor: withAlpha(C.bronze, 0.1),
  },
  sortActiveDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: C.bronze,
    borderWidth: 1.5,
    borderColor: C.background,
  },

  // ── Quick chips ──
  quickChipRow: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textMuted, 0.06),
  },
  quickChipActive: {
    backgroundColor: withAlpha(C.bronze, 0.1),
    borderWidth: 1,
    borderColor: C.bronze,
  },
  quickChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
  },
  quickChipTextActive: {
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // ── List ──
  listContent: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING['2xl'],
    maxWidth: 680,
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
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateHeaderTotal: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: BIZ.success,
    fontVariant: ['tabular-nums'],
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.md,
    marginBottom: SPACING.xs,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
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
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    flex: 1,
    marginRight: SPACING.sm,
  },
  txAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: BIZ.success,
    fontVariant: ['tabular-nums'],
  },
  txBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.xs,
  },
  txMeta: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    flex: 1,
  },
  txTime: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  txNote: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    marginTop: SPACING.xs,
    fontStyle: 'italic',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING['4xl'],
    paddingHorizontal: SPACING['2xl'],
    gap: SPACING.md,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: withAlpha(C.bronze, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  emptySubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptySecondary: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    minHeight: 44,
    justifyContent: 'center',
  },
  clearFiltersText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ── Result row (visible when filters active) ──
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.xl,
    marginBottom: SPACING.xs,
  },
  resultText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'],
  },
  clearFiltersBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.xs,
  },
  clearFiltersBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // ── Filter modal ──
  sortOverlay: {
    flex: 1,
    backgroundColor: withAlpha(C.dimBg, 0.42),
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterSortSheet: {
    backgroundColor: C.surface,
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
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
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
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textMuted, 0.06),
  },
  filterPillActive: {
    backgroundColor: withAlpha(C.bronze, 0.1),
  },
  filterPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  filterPillTextActive: {
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  filterSortDone: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    marginTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  filterSortDoneText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
  },

  // ── Custom date range ──
  customDateSection: {
    marginTop: SPACING.sm,
    gap: SPACING.xs,
  },
  dateRangeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withAlpha(C.accent, 0.05),
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  dateRangeLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    width: 36,
  },
  dateRangeValue: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
  },

});

export default SellerTransactions;
