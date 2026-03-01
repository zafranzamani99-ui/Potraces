import React, { useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Animated,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useSellerStore } from '../../store/sellerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';

// -- Count-up animation hook ----------------------------------------
const useCountUp = (target: number, duration: number = 300) => {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    animatedValue.setValue(0);
    Animated.timing(animatedValue, {
      toValue: target,
      duration,
      useNativeDriver: false,
    }).start();
  }, [target]);

  return animatedValue;
};

// -- Stagger fade-in wrapper ----------------------------------------
const FadeInSection: React.FC<{ delay: number; children: React.ReactNode }> = ({
  delay,
  children,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 250,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 250,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
};

// -- Animated kept amount display -----------------------------------
const AnimatedKeptAmount: React.FC<{ value: number; currency: string }> = ({
  value,
  currency,
}) => {
  const animatedValue = useCountUp(value, 300);
  const [displayText, setDisplayText] = React.useState(`${currency} 0.00`);

  useEffect(() => {
    const id = animatedValue.addListener(({ value: v }) => {
      setDisplayText(`${currency} ${v.toFixed(2)}`);
    });
    return () => animatedValue.removeListener(id);
  }, [animatedValue, currency]);

  return <Text style={styles.keptAmount}>{displayText}</Text>;
};

const SeasonSummary: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { seasons, orders, ingredientCosts, endSeason, addSeason } = useSellerStore();
  const currency = useSettingsStore((s) => s.currency);

  // Get season -- either from route params or active season
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

  const navigateToOrders = () => {
    navigation.getParent()?.navigate('SellerOrders');
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
          <TouchableOpacity
            style={styles.startSeasonButton}
            activeOpacity={0.7}
            onPress={handleStartNewSeason}
            accessibilityRole="button"
            accessibilityLabel="Start a season"
          >
            <Feather name="plus" size={18} color="#fff" />
            <Text style={styles.startSeasonButtonText}>start a season</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Emotional messaging based on results
  const emotionalMessage = getEmotionalMessage(stats.kept, stats.totalOrders, stats.customerCount);

  // Max qty for proportional bars
  const maxQty = stats.topProducts.length > 0
    ? Math.max(...stats.topProducts.map((p) => p.qty))
    : 1;

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Season header */}
        <FadeInSection delay={0}>
          <Text style={styles.seasonName}>{season.name}</Text>
          <Text style={styles.seasonDates}>
            {format(season.startDate instanceof Date ? season.startDate : new Date(season.startDate), 'dd MMM yyyy')}
            {season.endDate
              ? ` \u2013 ${format(season.endDate instanceof Date ? season.endDate : new Date(season.endDate), 'dd MMM yyyy')}`
              : ' \u2013 now'}
          </Text>
        </FadeInSection>

        {/* The emotional number -- framed with ledger lines */}
        <FadeInSection delay={50}>
          <View style={styles.keptSection}>
            <View style={styles.ledgerLine} />
            <View style={styles.keptInner}>
              <Text style={styles.keptLabel}>you kept</Text>
              <AnimatedKeptAmount value={stats.kept} currency={currency} />
              <Text style={styles.keptSubtext}>
                after {currency} {stats.totalCosts.toFixed(2)} in ingredients
              </Text>
            </View>
            <View style={styles.ledgerLine} />
          </View>
        </FadeInSection>

        {/* Emotional message */}
        {emotionalMessage && (
          <FadeInSection delay={100}>
            <Text style={styles.emotionalText}>{emotionalMessage}</Text>
          </FadeInSection>
        )}

        {/* Stats grid: enhanced with icon circles and larger numbers */}
        <FadeInSection delay={150}>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <View style={styles.statIconCircle}>
                <Feather name="clipboard" size={16} color={CALM.bronze} />
              </View>
              <Text style={styles.statNumber}>{stats.totalOrders}</Text>
              <Text style={styles.statLabel}>orders</Text>
            </View>
            <View style={styles.statBoxDivider} />
            <View style={styles.statBox}>
              <View style={styles.statIconCircle}>
                <Feather name="users" size={16} color={CALM.bronze} />
              </View>
              <Text style={styles.statNumber}>{stats.customerCount}</Text>
              <Text style={styles.statLabel}>customers</Text>
            </View>
          </View>
          <View style={styles.statsWideRow}>
            <View style={styles.statBoxWide}>
              <View style={styles.statIconCircle}>
                <Feather name="trending-up" size={16} color={CALM.bronze} />
              </View>
              <Text style={styles.statNumber}>
                {currency} {stats.totalIncome.toFixed(0)}
              </Text>
              <Text style={styles.statLabel}>came in</Text>
            </View>
          </View>
        </FadeInSection>

        {/* Unpaid card -- actionable with button */}
        {stats.unpaidOrders > 0 && (
          <FadeInSection delay={200}>
            <TouchableOpacity
              style={styles.unpaidCard}
              activeOpacity={0.7}
              onPress={navigateToOrders}
              accessibilityRole="button"
              accessibilityLabel={`${stats.unpaidOrders} unpaid orders totalling ${currency} ${stats.unpaidAmount.toFixed(2)}. Tap to collect payments.`}
            >
              <View style={styles.unpaidContent}>
                <Text style={styles.unpaidText}>
                  {stats.unpaidOrders} order{stats.unpaidOrders !== 1 ? 's' : ''} still unpaid {'\u00B7'}{' '}
                  {currency} {stats.unpaidAmount.toFixed(2)}
                </Text>
                <View style={styles.unpaidAction}>
                  <Text style={styles.unpaidActionText}>collect payments</Text>
                  <Feather name="arrow-right" size={14} color={CALM.bronze} />
                </View>
              </View>
            </TouchableOpacity>
          </FadeInSection>
        )}

        {/* Top products */}
        {stats.topProducts.length > 0 && (
          <FadeInSection delay={250}>
            <View style={styles.topSection}>
              <Text style={styles.sectionTitle}>what people ordered most</Text>
              {stats.topProducts.map((p, i) => {
                const proportion = maxQty > 0 ? p.qty / maxQty : 0;
                return (
                  <View key={p.name} style={styles.topProductItem}>
                    <View style={styles.topProductRow}>
                      <View style={styles.rankCircle}>
                        <Text style={styles.rankText}>{i + 1}</Text>
                      </View>
                      <Text style={styles.topName}>{p.name}</Text>
                      <Text style={styles.topQty}>{p.qty} units</Text>
                    </View>
                    {/* Proportional bar */}
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          { width: `${Math.max(proportion * 100, 2)}%` },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </FadeInSection>
        )}

        {/* Season actions section */}
        <FadeInSection delay={300}>
          {season.isActive ? (
            <View style={styles.actionsCard}>
              {/* View orders row */}
              <TouchableOpacity
                style={styles.actionRow}
                activeOpacity={0.7}
                onPress={navigateToOrders}
                accessibilityRole="button"
                accessibilityLabel="View orders"
              >
                <View style={styles.actionRowLeft}>
                  <View style={styles.actionIconCircle}>
                    <Feather name="clipboard" size={16} color={CALM.bronze} />
                  </View>
                  <Text style={styles.actionRowText}>view orders</Text>
                </View>
                <Feather name="chevron-right" size={16} color={CALM.textMuted} />
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.actionDivider} />

              {/* End season row */}
              <TouchableOpacity
                style={styles.actionRow}
                activeOpacity={0.7}
                onPress={handleEndSeason}
                accessibilityRole="button"
                accessibilityLabel="End this season"
              >
                <View style={styles.actionRowLeft}>
                  <View style={styles.actionIconCircle}>
                    <Feather name="x-circle" size={16} color={CALM.textMuted} />
                  </View>
                  <Text style={styles.actionRowText}>end this season</Text>
                </View>
                <Feather name="chevron-right" size={16} color={CALM.textMuted} />
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.seasonCompleteSection}>
              {/* Season complete badge */}
              <View style={styles.completeBadge}>
                <View style={styles.completeIconCircle}>
                  <Feather name="check-circle" size={20} color={CALM.bronze} />
                </View>
                <View style={styles.completeBadgeText}>
                  <Text style={styles.completeTitle}>season complete</Text>
                  {season.endDate && (
                    <Text style={styles.completeDate}>
                      ended {format(
                        season.endDate instanceof Date ? season.endDate : new Date(season.endDate),
                        'dd MMM yyyy'
                      )}
                    </Text>
                  )}
                </View>
              </View>

              {/* Start new season button */}
              <TouchableOpacity
                style={styles.newSeasonButton}
                activeOpacity={0.7}
                onPress={handleStartNewSeason}
                accessibilityRole="button"
                accessibilityLabel="Start new season"
              >
                <Feather name="plus" size={18} color="#fff" />
                <Text style={styles.newSeasonButtonText}>start new season</Text>
              </TouchableOpacity>
            </View>
          )}
        </FadeInSection>
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
    backgroundColor: CALM.background,   // #F9F9F7
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING['2xl'],   // 24pt horizontal
    paddingTop: SPACING['2xl'],          // 24pt top
    paddingBottom: SPACING['5xl'],       // 48pt bottom
  },

  // -- No season state ----------------------------------------------
  noSeason: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING['2xl'],             // 24pt
    gap: SPACING.md,                     // 16pt
  },
  noSeasonTitle: {
    fontSize: TYPOGRAPHY.size.xl,        // 20
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: CALM.textPrimary,             // #1A1A1A
  },
  noSeasonText: {
    ...TYPE.insight,                     // fontSize 14, lineHeight 22
    color: CALM.textSecondary,           // #6B6B6B
    textAlign: 'center',
    lineHeight: 22,
  },
  startSeasonButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,                     // 8pt
    backgroundColor: CALM.bronze,        // #B2780A
    borderRadius: RADIUS.lg,             // 14
    paddingVertical: SPACING.lg,         // 16pt
    paddingHorizontal: SPACING['2xl'],   // 24pt
    marginTop: SPACING.lg,              // 16pt
  },
  startSeasonButtonText: {
    fontSize: TYPOGRAPHY.size.base,      // 15
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: '#fff',
  },

  // -- Season header ------------------------------------------------
  seasonName: {
    fontSize: TYPOGRAPHY.size['2xl'],    // 24
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: CALM.textPrimary,             // #1A1A1A
    marginBottom: SPACING.xs,            // 4pt
  },
  seasonDates: {
    ...TYPE.muted,                       // fontSize 12, color #A0A0A0
    marginBottom: SPACING['2xl'],        // 24pt
  },

  // -- Kept section -- the emotional center -------------------------
  keptSection: {
    marginBottom: SPACING['2xl'],        // 24pt
  },
  ledgerLine: {
    height: 1,
    backgroundColor: CALM.border,        // #EBEBEB
  },
  keptInner: {
    alignItems: 'center',
    paddingVertical: SPACING['2xl'],     // 24pt
  },
  keptLabel: {
    ...TYPE.label,                       // fontSize 12, uppercase, letterSpacing 1
    marginBottom: SPACING.sm,            // 8pt
  },
  keptAmount: {
    fontSize: 56,                        // LARGEST element on screen
    fontWeight: TYPOGRAPHY.weight.light,  // 300
    color: CALM.textPrimary,             // #1A1A1A
    fontVariant: ['tabular-nums'],
    marginBottom: SPACING.sm,            // 8pt
  },
  keptSubtext: {
    ...TYPE.muted,                       // fontSize 12, color #A0A0A0
    color: CALM.textSecondary,           // #6B6B6B
    fontVariant: ['tabular-nums'],
  },

  // -- Emotional message --------------------------------------------
  emotionalText: {
    ...TYPE.insight,                     // fontSize 14, lineHeight 22
    color: CALM.textSecondary,           // #6B6B6B
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING['2xl'],        // 24pt
    paddingHorizontal: SPACING.lg,       // 16pt
  },

  // -- Stats grid: enhanced with icon circles -----------------------
  statsRow: {
    flexDirection: 'row',
    backgroundColor: CALM.surface,       // #FFFFFF
    borderRadius: RADIUS.lg,             // 14
    borderWidth: 1,
    borderColor: CALM.border,            // #EBEBEB
    marginBottom: SPACING.md,            // 16pt
  },
  statBox: {
    flex: 1,
    paddingVertical: SPACING.lg,         // 16pt
    paddingHorizontal: SPACING.lg,       // 16pt
    alignItems: 'flex-start',
    gap: SPACING.xs,                     // 4pt between elements
  },
  statBoxDivider: {
    width: 1,
    backgroundColor: CALM.border,        // #EBEBEB
    marginVertical: SPACING.md,          // 16pt top/bottom inset
  },
  statsWideRow: {
    marginBottom: SPACING.xl,            // 24pt
  },
  statBoxWide: {
    backgroundColor: CALM.surface,       // #FFFFFF
    borderRadius: RADIUS.lg,             // 14
    borderWidth: 1,
    borderColor: CALM.border,            // #EBEBEB
    paddingVertical: SPACING.lg,         // 16pt
    paddingHorizontal: SPACING.lg,       // 16pt
    alignItems: 'flex-start',
    gap: SPACING.xs,                     // 4pt
  },
  statIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: withAlpha(CALM.bronze, 0.1), // bronze at 10% opacity
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,            // 4pt below icon circle
  },
  statNumber: {
    fontSize: TYPOGRAPHY.size.xl,        // 20 (upgraded from 17)
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: CALM.textPrimary,             // #1A1A1A
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    ...TYPE.muted,                       // fontSize 12, color #A0A0A0
  },

  // -- Unpaid card -- actionable ------------------------------------
  unpaidCard: {
    backgroundColor: CALM.surface,       // #FFFFFF
    borderRadius: RADIUS.lg,             // 14
    borderWidth: 1,
    borderColor: CALM.border,            // #EBEBEB
    borderLeftWidth: 3,
    borderLeftColor: CALM.bronze,        // #B2780A accent
    padding: SPACING.lg,                 // 16pt
    marginBottom: SPACING.xl,            // 24pt
  },
  unpaidContent: {
    gap: SPACING.md,                     // 16pt between text and action
  },
  unpaidText: {
    ...TYPE.insight,                     // fontSize 14, lineHeight 22
    color: CALM.textPrimary,             // #1A1A1A
    fontVariant: ['tabular-nums'],
  },
  unpaidAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,                     // 4pt
  },
  unpaidActionText: {
    fontSize: TYPOGRAPHY.size.sm,        // 13
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: CALM.bronze,                  // #B2780A
  },

  // -- Top products -------------------------------------------------
  topSection: {
    marginBottom: SPACING.xl,            // 24pt
  },
  sectionTitle: {
    ...TYPE.label,                       // fontSize 12, uppercase, letterSpacing 1
    marginBottom: SPACING.md,            // 16pt
  },
  topProductItem: {
    marginBottom: SPACING.md,            // 16pt gap between product rows
  },
  topProductRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,                     // 16pt
  },
  rankCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: CALM.bronze,        // #B2780A
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankText: {
    fontSize: 12,
    fontWeight: TYPOGRAPHY.weight.bold,  // 700
    color: '#fff',
  },
  topName: {
    ...TYPE.insight,                     // fontSize 14, lineHeight 22
    color: CALM.textPrimary,             // #1A1A1A
    flex: 1,
  },
  topQty: {
    ...TYPE.muted,                       // fontSize 12, color #A0A0A0
    fontVariant: ['tabular-nums'],
  },
  // Proportional bar
  barTrack: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'transparent',
    marginTop: SPACING.xs,              // 4pt
    marginLeft: 44,                      // 28 (circle) + 16 (gap) offset
  },
  barFill: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: withAlpha(CALM.bronze, 0.15), // CALM.bronze at 0.15 opacity
  },

  // -- Season actions card ------------------------------------------
  actionsCard: {
    backgroundColor: CALM.surface,       // #FFFFFF
    borderRadius: RADIUS.lg,             // 14
    borderWidth: 1,
    borderColor: CALM.border,            // #EBEBEB
    marginTop: SPACING.lg,              // 16pt
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,         // 16pt
    paddingHorizontal: SPACING.lg,       // 16pt
    minHeight: 56,                       // comfortable touch target
  },
  actionRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,                     // 16pt
  },
  actionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: withAlpha(CALM.bronze, 0.08), // bronze at 8% opacity
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRowText: {
    fontSize: TYPOGRAPHY.size.base,      // 15
    fontWeight: TYPOGRAPHY.weight.medium, // 500
    color: CALM.textPrimary,             // #1A1A1A
  },
  actionDivider: {
    height: 1,
    backgroundColor: CALM.border,        // #EBEBEB
    marginHorizontal: SPACING.lg,        // 16pt inset from edges
  },

  // -- Season complete state ----------------------------------------
  seasonCompleteSection: {
    marginTop: SPACING.lg,              // 16pt
    gap: SPACING.lg,                     // 16pt between badge and button
  },
  completeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,                     // 16pt
    backgroundColor: CALM.surface,       // #FFFFFF
    borderRadius: RADIUS.lg,             // 14
    borderWidth: 1,
    borderColor: CALM.border,            // #EBEBEB
    padding: SPACING.lg,                // 16pt
  },
  completeIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withAlpha(CALM.bronze, 0.1), // bronze at 10% opacity
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeBadgeText: {
    flex: 1,
    gap: SPACING.xs,                     // 4pt
  },
  completeTitle: {
    fontSize: TYPOGRAPHY.size.base,      // 15
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: CALM.textPrimary,             // #1A1A1A
  },
  completeDate: {
    ...TYPE.muted,                       // fontSize 12, color #A0A0A0
  },
  newSeasonButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,                     // 8pt
    backgroundColor: CALM.bronze,        // #B2780A
    borderRadius: RADIUS.lg,             // 14
    paddingVertical: SPACING.lg,         // 16pt
    minHeight: 48,
  },
  newSeasonButtonText: {
    fontSize: TYPOGRAPHY.size.base,      // 15
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: '#fff',
  },
});

export default SeasonSummary;
