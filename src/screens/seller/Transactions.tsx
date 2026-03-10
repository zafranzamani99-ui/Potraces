import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format, isSameDay } from 'date-fns';
import { useSellerStore } from '../../store/sellerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha, BIZ } from '../../constants';
import { SellerPaymentMethod } from '../../types';
import { useFadeSlide } from '../../utils/fadeSlide';
import { Animated } from 'react-native';

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
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMethod, setFilterMethod] = useState<FilterMethod>('all');

  const headerAnim = useFadeSlide(0);
  const listAnim = useFadeSlide(60);

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
            date: dep.date instanceof Date ? dep.date : new Date(dep.date),
            note: dep.note,
            type: 'deposit',
          });
        }
      }

      // Full payment (only if marked paid and not covered by deposits alone)
      if (order.isPaid && order.paidAt && order.paymentMethod) {
        // Check if deposits already cover total — if so, the "paid" was triggered by deposits
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
            date: order.paidAt instanceof Date ? order.paidAt : new Date(order.paidAt),
            note: order.note,
            type: 'full',
          });
        }
      }
    }

    // Sort newest first
    events.sort((a, b) => b.date.getTime() - a.date.getTime());
    return events;
  }, [orders]);

  // Filter + search
  const filtered = useMemo(() => {
    let result = allPayments;

    if (filterMethod !== 'all') {
      result = result.filter((e) => e.method === filterMethod);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.customerName.toLowerCase().includes(q) ||
          (e.orderNumber && e.orderNumber.toLowerCase().includes(q)) ||
          (e.note && e.note.toLowerCase().includes(q))
      );
    }

    return result;
  }, [allPayments, filterMethod, searchQuery]);

  // Summary
  const totalAmount = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered]);

  // Group by date
  const renderItem = useCallback(
    ({ item, index }: { item: PaymentEvent; index: number }) => {
      const prev = index > 0 ? filtered[index - 1] : null;
      const showDateHeader = !prev || !isSameDay(item.date, prev.date);

      return (
        <>
          {showDateHeader && (
            <Text style={styles.dateHeader}>
              {format(item.date, 'EEEE, d MMM yyyy')}
            </Text>
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
    [filtered, currency]
  );

  // Only show methods that have transactions
  const usedMethods = useMemo(() => {
    const set = new Set(allPayments.map((e) => e.method));
    return Array.from(set) as SellerPaymentMethod[];
  }, [allPayments]);
  const methods: FilterMethod[] = ['all', ...usedMethods];

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
        <Text style={styles.summaryCount}>{filtered.length} transactions</Text>
      </Animated.View>

      {/* Search */}
      <Animated.View style={[styles.searchRow, headerAnim]}>
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
      </Animated.View>

      {/* Method filter pills */}
      <Animated.View style={listAnim}>
        <FlatList
          horizontal
          data={methods}
          keyExtractor={(m) => m}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          renderItem={({ item: m }) => {
            const active = filterMethod === m;
            return (
              <TouchableOpacity
                style={[styles.filterPill, active && styles.filterPillActive]}
                activeOpacity={0.7}
                onPress={() => setFilterMethod(m)}
              >
                {m !== 'all' && (
                  <Feather
                    name={METHOD_ICON[m as SellerPaymentMethod] as any}
                    size={12}
                    color={active ? CALM.surface : CALM.textSecondary}
                    style={{ marginRight: 4 }}
                  />
                )}
                <Text style={[styles.filterPillText, active && styles.filterPillTextActive]}>
                  {m === 'all' ? 'all' : METHOD_LABEL[m as SellerPaymentMethod]}
                </Text>
              </TouchableOpacity>
            );
          }}
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
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Feather name="inbox" size={32} color={CALM.textMuted} />
              <Text style={styles.emptyText}>
                {allPayments.length === 0
                  ? 'no payments recorded yet.'
                  : 'no matching transactions.'}
              </Text>
            </View>
          }
        />
      </Animated.View>
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
  summaryCount: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CALM.surface,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.sm,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  searchInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  filterRow: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.sm,
    gap: SPACING.xs,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  filterPillActive: {
    backgroundColor: CALM.accent,
    borderColor: CALM.accent,
  },
  filterPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium as any,
  },
  filterPillTextActive: {
    color: CALM.surface,
  },
  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING['2xl'],
  },
  dateHeader: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold as any,
    color: CALM.textMuted,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
});

export default SellerTransactions;
