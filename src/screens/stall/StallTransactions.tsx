import React, { useMemo } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useStallStore } from '../../store/stallStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useNeu } from '../../components/common/neu';
import { useT } from '../../i18n';
import { StallSale, StallPaymentMethod } from '../../types';

// A sale flattened out of its session, carrying the session's spot/name for context.
type FlatSale = StallSale & { sessionName?: string; sessionWhere?: string };

const asDate = (d: Date | string): Date => (d instanceof Date ? d : new Date(d));

const StallTransactions: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const neu = useNeu(undefined, { faintDark: true });
  const insets = useSafeAreaInsets();
  const sessions = useStallStore((s) => s.sessions);
  const currency = useSettingsStore((s) => s.currency);

  // Every sale across every session, newest first.
  const sales = useMemo<FlatSale[]>(() => {
    const flat: FlatSale[] = [];
    for (const s of sessions) {
      for (const sale of s.sales || []) {
        flat.push({ ...sale, sessionName: s.name, sessionWhere: s.where });
      }
    }
    return flat.sort((a, b) => asDate(b.timestamp).getTime() - asDate(a.timestamp).getTime());
  }, [sessions]);

  const totalSales = useMemo(() => sales.reduce((sum, s) => sum + s.total, 0), [sales]);

  const payMeta = (m: StallPaymentMethod): { icon: keyof typeof Feather.glyphMap; label: string } => {
    switch (m) {
      case 'qr': return { icon: 'smartphone', label: t.stallTransactions.qr };
      case 'card': return { icon: 'credit-card', label: t.stallTransactions.card };
      default: return { icon: 'dollar-sign', label: t.stallTransactions.cash };
    }
  };

  const renderItem = ({ item }: { item: FlatSale }) => {
    const pay = payMeta(item.paymentMethod);
    const title = item.isCustom ? (item.label?.trim() || t.stallTransactions.custom) : item.productName;
    const when = format(asDate(item.timestamp), 'd MMM, h:mma');
    return (
      <View style={[styles.row, neu.raisedSoft]}>
        <View style={[styles.iconBox, { backgroundColor: withAlpha(C.bronze, 0.1) }]}>
          <Feather name={pay.icon} size={18} color={C.bronze} />
        </View>
        <View style={styles.rowContent}>
          <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {`×${item.quantity} · ${pay.label} · ${when}`}
          </Text>
        </View>
        <Text style={styles.rowAmount}>{`${currency} ${item.total.toFixed(2)}`}</Text>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <FlatList
        data={sales}
        keyExtractor={(s) => s.id}
        renderItem={renderItem}
        extraData={C}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 88 }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          sales.length > 0 ? (
            <View style={styles.header}>
              <Text style={styles.headerLabel}>{t.stallTransactions.subtitle}</Text>
              <Text style={styles.headerTotal}>{`${currency} ${totalSales.toFixed(2)}`}</Text>
              <Text style={styles.headerCount}>
                {t.stallTransactions.nSales.replace('{n}', String(sales.length))} · {t.stallTransactions.totalLabel}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, neu.raised]}>
              <Feather name="list" size={26} color={C.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>{t.stallTransactions.empty}</Text>
            <Text style={styles.emptySub}>{t.stallTransactions.emptySub}</Text>
          </View>
        }
      />
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  content: {
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
  },

  // Header (total)
  header: {
    marginBottom: SPACING.lg,
  },
  headerLabel: {
    ...TYPE.muted,
  },
  headerTotal: {
    fontSize: TYPOGRAPHY.size['3xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    marginTop: SPACING.xs,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  headerCount: {
    ...TYPE.muted,
    marginTop: 2,
  },

  // Row (Neu Card)
  row: {
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  rowContent: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  rowTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  rowMeta: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginTop: 2,
  },
  rowAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },

  // Empty state
  empty: {
    alignItems: 'center',
    paddingTop: SPACING['4xl'],
    paddingHorizontal: SPACING.xl,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: SPACING.xs,
  },
  emptySub: {
    ...TYPE.muted,
    textAlign: 'center',
  },
});

export default StallTransactions;
