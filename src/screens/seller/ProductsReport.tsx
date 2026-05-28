import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useSellerStore } from '../../store/sellerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha, BIZ_SAFE } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { semantic } from '../../constants';

const ProductsReport: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(C), [C]);
  const products = useSellerStore((s) => s.products);
  const orders = useSellerStore((s) => s.orders);
  const currency = useSettingsStore((s) => s.currency);
  const t = useT();
  const sl = t.seller;
  const bizKept = semantic(BIZ_SAFE.profit, isDark);

  const reportData = useMemo(() => {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const monthName = format(now, 'MMMM yyyy');

    const safeDate = (d: any) => (d instanceof Date ? d : new Date(d));
    const thisMonthOrders = orders.filter((o) => safeDate(o.date) >= thisMonthStart);
    const lastMonthOrders = orders.filter((o) => {
      const d = safeDate(o.date);
      return d >= lastMonthStart && d <= lastMonthEnd;
    });

    // 1 — Revenue share (this month)
    const revMap: Record<string, { name: string; revenue: number; qty: number; unit: string }> = {};
    let totalRevenue = 0;
    for (const order of thisMonthOrders) {
      for (const item of order.items) {
        const k = item.productName;
        if (!revMap[k]) revMap[k] = { name: k, revenue: 0, qty: 0, unit: item.unit };
        const rev = item.quantity * item.unitPrice;
        revMap[k].revenue += rev;
        revMap[k].qty += item.quantity;
        totalRevenue += rev;
      }
    }
    const revenueShare = Object.values(revMap)
      .map((p) => ({ ...p, share: totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0 }))
      .sort((a, b) => b.revenue - a.revenue);

    // 2 — Margin winners (from catalog)
    const marginProducts = products
      .filter((p) => p.costPerUnit && p.costPerUnit > 0 && p.pricePerUnit > 0)
      .map((p) => ({
        name: p.name,
        margin: Math.round(((p.pricePerUnit - p.costPerUnit!) / p.pricePerUnit) * 100),
        kept: p.pricePerUnit - p.costPerUnit!,
        unit: p.unit,
      }))
      .sort((a, b) => b.margin - a.margin);

    // 3 — Customer reach (all time)
    const custMap: Record<string, Set<string>> = {};
    for (const order of orders) {
      const custKey = (order.customerName || 'walk-in').toLowerCase();
      for (const item of order.items) {
        if (!custMap[item.productName]) custMap[item.productName] = new Set();
        custMap[item.productName].add(custKey);
      }
    }
    const customerReach = Object.entries(custMap)
      .map(([name, custs]) => ({ name, customers: custs.size }))
      .sort((a, b) => b.customers - a.customers)
      .slice(0, 5);

    // 4 — Month-over-month trends
    const thisM: Record<string, number> = {};
    const lastM: Record<string, number> = {};
    for (const o of thisMonthOrders) for (const it of o.items) thisM[it.productName] = (thisM[it.productName] || 0) + it.quantity;
    for (const o of lastMonthOrders) for (const it of o.items) lastM[it.productName] = (lastM[it.productName] || 0) + it.quantity;
    const trends = Object.keys({ ...thisM, ...lastM })
      .map((name) => {
        const cur = thisM[name] || 0;
        const prev = lastM[name] || 0;
        const change = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : (cur > 0 ? 100 : 0);
        return { name, thisMonth: cur, lastMonth: prev, change };
      })
      .filter((t) => t.thisMonth > 0 || t.lastMonth > 0)
      .sort((a, b) => b.change - a.change);

    // 5 — Never ordered (all time)
    const orderedNames = new Set<string>();
    for (const o of orders) for (const it of o.items) orderedNames.add(it.productName.toLowerCase());
    const neverOrdered = products.filter((p) => !orderedNames.has(p.name.toLowerCase()));

    // 6 — Low stock alert (velocity from last 30 days)
    const thirtyAgo = new Date(now.getTime() - 30 * 86400000);
    const lowStock = products
      .filter((p) => p.trackStock && (p.stockQuantity ?? 0) > 0)
      .map((p) => {
        let sold30 = 0;
        for (const o of orders) {
          if (safeDate(o.date) >= thirtyAgo) {
            for (const it of o.items) {
              if (it.productName.toLowerCase() === p.name.toLowerCase()) sold30 += it.quantity;
            }
          }
        }
        const daily = sold30 / 30;
        const days = daily > 0 ? Math.round((p.stockQuantity ?? 0) / daily) : null;
        return { name: p.name, stock: p.stockQuantity ?? 0, unit: p.unit, days };
      })
      .filter((p) => p.days !== null && p.days <= 7)
      .sort((a, b) => (a.days ?? 999) - (b.days ?? 999));

    const totalSold = Object.values(revMap).reduce((s, p) => s + p.qty, 0);

    return { monthName, totalSold, totalRevenue, revenueShare, marginProducts, customerReach, trends, neverOrdered, lowStock };
  }, [orders, products]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{sl.reportTitle}</Text>
        <Text style={styles.subtitle}>
          {reportData.monthName} · {sl.reportSold.replace('{n}', String(reportData.totalSold))} · {currency} {reportData.totalRevenue.toFixed(0)}
        </Text>
      </View>

      {reportData.revenueShare.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="inbox" size={32} color={C.textMuted} />
          <Text style={styles.emptyText}>{sl.reportNoData}</Text>
        </View>
      ) : (
        <>
          {/* Top earners */}
          <View style={styles.card}>
            <View style={styles.sectionHeader}>
              <Feather name="bar-chart-2" size={15} color={C.bronze} />
              <Text style={styles.sectionTitle}>{sl.reportTopEarners}</Text>
            </View>
            {reportData.revenueShare.slice(0, 8).map((p, i) => {
              const maxRev = reportData.revenueShare[0]?.revenue || 1;
              return (
                <View key={p.name} style={styles.rowWrap}>
                  <View style={styles.row}>
                    <View style={styles.rankBadge}>
                      <Text style={styles.rankText}>{i + 1}</Text>
                    </View>
                    <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.value}>{currency} {p.revenue.toFixed(0)}</Text>
                    <Text style={styles.pct}>{p.share.toFixed(0)}%</Text>
                  </View>
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${(p.revenue / maxRev) * 100}%` as any }]} />
                  </View>
                </View>
              );
            })}
          </View>

          {/* Best margins */}
          {reportData.marginProducts.length > 0 && (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Feather name="trending-up" size={15} color={C.bronze} />
                <Text style={styles.sectionTitle}>{sl.reportBestMargins}</Text>
              </View>
              {reportData.marginProducts.slice(0, 5).map((p) => (
                <View key={p.name} style={styles.row}>
                  <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.valueBronze}>
                    {sl.reportKeeps.replace('{pct}', String(p.margin))}
                  </Text>
                  <Text style={styles.pct}>{currency} {p.kept.toFixed(2)}/{p.unit}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Customer reach */}
          {reportData.customerReach.length > 0 && (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Feather name="users" size={15} color={C.bronze} />
                <Text style={styles.sectionTitle}>{sl.reportCustomerReach}</Text>
              </View>
              {reportData.customerReach.map((p) => (
                <View key={p.name} style={styles.row}>
                  <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.value}>
                    {sl.reportBuyers.replace('{n}', String(p.customers))}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* vs last month */}
          {reportData.trends.length > 0 && (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Feather name="activity" size={15} color={C.bronze} />
                <Text style={styles.sectionTitle}>{sl.reportVsLastMonth}</Text>
              </View>
              {reportData.trends.slice(0, 8).map((p) => (
                <View key={p.name} style={styles.row}>
                  <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.value}>{p.thisMonth}</Text>
                  <Feather
                    name={p.change > 0 ? 'arrow-up-right' : p.change < 0 ? 'arrow-down-right' : 'minus'}
                    size={13}
                    color={p.change > 0 ? bizKept : C.textMuted}
                  />
                  <Text style={[styles.pct, p.change > 0 && { color: bizKept }]}>
                    {p.lastMonth === 0 ? sl.reportNew : `${p.change > 0 ? '+' : ''}${p.change}%`}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Never ordered */}
          {reportData.neverOrdered.length > 0 && (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Feather name="package" size={15} color={C.textMuted} />
                <Text style={styles.sectionTitle}>{sl.reportNeverOrdered}</Text>
              </View>
              {reportData.neverOrdered.map((p) => (
                <View key={p.id} style={styles.row}>
                  <Text style={[styles.name, { color: C.textMuted }]} numberOfLines={1}>{p.name}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Low stock */}
          {reportData.lowStock.length > 0 && (
            <View style={styles.card}>
              <View style={styles.sectionHeader}>
                <Feather name="alert-circle" size={15} color={C.gold} />
                <Text style={styles.sectionTitle}>{sl.reportLowStock}</Text>
              </View>
              {reportData.lowStock.map((p) => (
                <View key={p.name} style={styles.row}>
                  <Text style={styles.name} numberOfLines={1}>{p.name}</Text>
                  <Text style={styles.value}>{p.stock} {p.unit}</Text>
                  {p.days !== null && (
                    <Text style={[styles.pct, { color: C.gold }]}>
                      {sl.reportDaysLeft.replace('{n}', String(p.days))}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  content: {
    padding: SPACING.xl,
    paddingBottom: SPACING['2xl'] * 2,
  },
  header: {
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginTop: SPACING.xs,
    fontVariant: ['tabular-nums'],
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  rowWrap: {
    marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
    gap: SPACING.sm,
  },
  rankBadge: {
    width: 22,
    height: 22,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.bronze, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
  },
  name: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    flex: 1,
  },
  value: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  valueBronze: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
    fontVariant: ['tabular-nums'],
  },
  pct: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontVariant: ['tabular-nums'],
    minWidth: 40,
    textAlign: 'right',
  },
  barTrack: {
    height: 3,
    backgroundColor: withAlpha(C.textPrimary, 0.06),
    borderRadius: 2,
    marginTop: 2,
  },
  barFill: {
    height: 3,
    backgroundColor: withAlpha(C.bronze, 0.45),
    borderRadius: 2,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING['2xl'] * 2,
    gap: SPACING.md,
  },
  emptyText: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textMuted,
  },
});

export default ProductsReport;
