import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useSellerStore } from '../../store/sellerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';

const SeasonSummary: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { seasons, orders, ingredientCosts, endSeason, addSeason } = useSellerStore();
  const currency = useSettingsStore((s) => s.currency);

  // Get season — either from route params or active season
  const seasonId = route.params?.seasonId;
  const season = seasonId
    ? seasons.find((s) => s.id === seasonId)
    : seasons.find((s) => s.isActive);

  const stats = useMemo(() => {
    if (!season) return null;
    const seasonOrders = orders.filter((o) => o.seasonId === season.id);
    const seasonCosts = ingredientCosts.filter((c) => c.seasonId === season.id);
    const paidOrders = seasonOrders.filter((o) => o.isPaid);
    const unpaidOrders = seasonOrders.filter((o) => !o.isPaid);

    const totalIncome = paidOrders.reduce((s, o) => s + o.totalAmount, 0);
    const totalCosts = seasonCosts.reduce((s, c) => s + c.amount, 0);
    const kept = totalIncome - totalCosts;

    // Top products
    const productCounts: Record<string, { name: string; qty: number; revenue: number }> = {};
    for (const order of seasonOrders) {
      for (const item of order.items) {
        if (!productCounts[item.productName]) {
          productCounts[item.productName] = { name: item.productName, qty: 0, revenue: 0 };
        }
        productCounts[item.productName].qty += item.quantity;
        productCounts[item.productName].revenue += item.unitPrice * item.quantity;
      }
    }
    const topProducts = Object.values(productCounts)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Unique customers
    const customers = new Set(
      seasonOrders.filter((o) => o.customerName).map((o) => o.customerName!)
    );

    return {
      totalOrders: seasonOrders.length,
      paidOrders: paidOrders.length,
      unpaidOrders: unpaidOrders.length,
      unpaidAmount: unpaidOrders.reduce((s, o) => s + o.totalAmount, 0),
      totalIncome,
      totalCosts,
      kept,
      topProducts,
      customerCount: customers.size,
    };
  }, [season, orders, ingredientCosts]);

  const handleEndSeason = () => {
    if (!season) return;
    Alert.alert(
      `End ${season.name}?`,
      'This marks the season as complete. You can still view it in past seasons.',
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'End season',
          onPress: () => {
            endSeason(season.id);
          },
        },
      ]
    );
  };

  const handleStartNewSeason = () => {
    Alert.prompt
      ? Alert.prompt('New season', 'What do you want to call it?', (name) => {
          if (name?.trim()) {
            addSeason({ name: name.trim(), startDate: new Date(), isActive: true });
          }
        })
      : Alert.alert('New season', 'Use the seasons tab to start a new season.');
  };

  if (!season || !stats) {
    return (
      <View style={styles.container}>
        <View style={styles.noSeason}>
          <Feather name="calendar" size={48} color={CALM.border} />
          <Text style={styles.noSeasonTitle}>no active season</Text>
          <Text style={styles.noSeasonText}>
            start a season when you begin taking orders for an event, like Raya or CNY.
          </Text>
          <TouchableOpacity style={styles.startSeasonButton} onPress={handleStartNewSeason}>
            <Text style={styles.startSeasonButtonText}>start a season</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Emotional messaging based on results
  const emotionalMessage = getEmotionalMessage(stats.kept, stats.totalOrders, stats.customerCount);

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Season header */}
        <Text style={styles.seasonName}>{season.name}</Text>
        <Text style={styles.seasonDates}>
          {format(season.startDate instanceof Date ? season.startDate : new Date(season.startDate), 'dd MMM yyyy')}
          {season.endDate
            ? ` \u2013 ${format(season.endDate instanceof Date ? season.endDate : new Date(season.endDate), 'dd MMM yyyy')}`
            : ' \u2013 now'}
        </Text>

        {/* The emotional number */}
        <View style={styles.keptSection}>
          <Text style={styles.keptLabel}>you kept</Text>
          <Text style={styles.keptAmount}>
            {currency} {stats.kept.toFixed(2)}
          </Text>
          <Text style={styles.keptSubtext}>
            after {currency} {stats.totalCosts.toFixed(2)} in ingredients
          </Text>
        </View>

        {/* Emotional message */}
        {emotionalMessage && (
          <Text style={styles.emotionalText}>{emotionalMessage}</Text>
        )}

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{stats.totalOrders}</Text>
            <Text style={styles.statLabel}>orders</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{stats.customerCount}</Text>
            <Text style={styles.statLabel}>customers</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>
              {currency} {stats.totalIncome.toFixed(0)}
            </Text>
            <Text style={styles.statLabel}>came in</Text>
          </View>
        </View>

        {/* Unpaid warning */}
        {stats.unpaidOrders > 0 && (
          <View style={styles.unpaidCard}>
            <Text style={styles.unpaidText}>
              {stats.unpaidOrders} order{stats.unpaidOrders !== 1 ? 's' : ''} still unpaid &middot;{' '}
              {currency} {stats.unpaidAmount.toFixed(2)}
            </Text>
          </View>
        )}

        {/* Top products */}
        {stats.topProducts.length > 0 && (
          <View style={styles.topSection}>
            <Text style={styles.sectionTitle}>what people ordered most</Text>
            {stats.topProducts.map((p, i) => (
              <View key={p.name} style={styles.topProductRow}>
                <Text style={styles.topRank}>{i + 1}</Text>
                <Text style={styles.topName}>{p.name}</Text>
                <Text style={styles.topQty}>{p.qty} units</Text>
              </View>
            ))}
          </View>
        )}

        {/* End season / Already ended */}
        {season.isActive ? (
          <TouchableOpacity style={styles.endSeasonButton} onPress={handleEndSeason}>
            <Text style={styles.endSeasonText}>end this season</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.endedBadge}>
            <Feather name="check-circle" size={16} color={CALM.positive} />
            <Text style={styles.endedText}>season complete</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

function getEmotionalMessage(
  kept: number,
  totalOrders: number,
  customerCount: number
): string | null {
  if (totalOrders === 0) return null;

  if (kept > 0 && totalOrders >= 10) {
    return `${totalOrders} orders. That's a lot of work \u2014 and you showed up for every one.`;
  }

  if (kept > 0 && customerCount >= 5) {
    return `${customerCount} different people trusted your food this season. That matters.`;
  }

  if (kept > 0) {
    return "You made something, people wanted it, and you kept some of it. That's real.";
  }

  if (kept <= 0 && totalOrders > 0) {
    return "Costs were high this time. That doesn't take away from the work you put in.";
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING['2xl'],
    paddingBottom: SPACING['5xl'],
  },
  noSeason: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING['2xl'],
    gap: SPACING.md,
  },
  noSeasonTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  noSeasonText: {
    ...TYPE.insight,
    color: CALM.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  startSeasonButton: {
    backgroundColor: CALM.accent,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING['2xl'],
    marginTop: SPACING.lg,
  },
  startSeasonButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },

  // Season header
  seasonName: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: SPACING.xs,
  },
  seasonDates: {
    ...TYPE.muted,
    marginBottom: SPACING['2xl'],
  },

  // Kept section — the emotional center
  keptSection: {
    alignItems: 'center',
    marginBottom: SPACING['2xl'],
    paddingVertical: SPACING['2xl'],
  },
  keptLabel: {
    ...TYPE.label,
    marginBottom: SPACING.sm,
  },
  keptAmount: {
    fontSize: 56,
    fontWeight: '200' as const,
    color: CALM.textPrimary,
    marginBottom: SPACING.sm,
  },
  keptSubtext: {
    ...TYPE.muted,
    color: CALM.textSecondary,
  },

  // Emotional message
  emotionalText: {
    ...TYPE.insight,
    color: CALM.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING['2xl'],
    paddingHorizontal: SPACING.lg,
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  statBox: {
    flex: 1,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.xs,
  },
  statNumber: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  statLabel: {
    ...TYPE.muted,
  },

  // Unpaid
  unpaidCard: {
    backgroundColor: CALM.highlight,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  unpaidText: {
    ...TYPE.insight,
    color: CALM.textPrimary,
  },

  // Top products
  topSection: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    ...TYPE.label,
    marginBottom: SPACING.md,
  },
  topProductRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
    gap: SPACING.md,
  },
  topRank: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.accent,
    width: 24,
  },
  topName: {
    flex: 1,
    ...TYPE.insight,
    color: CALM.textPrimary,
  },
  topQty: {
    ...TYPE.muted,
  },

  // End season
  endSeasonButton: {
    alignItems: 'center',
    paddingVertical: SPACING.lg,
    marginTop: SPACING.lg,
  },
  endSeasonText: {
    ...TYPE.insight,
    color: CALM.neutral,
  },
  endedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.lg,
    marginTop: SPACING.lg,
  },
  endedText: {
    ...TYPE.insight,
    color: CALM.positive,
  },
});

export default SeasonSummary;
