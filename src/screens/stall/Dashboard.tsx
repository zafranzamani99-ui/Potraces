import React, { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useStallStore } from '../../store/stallStore';
import { useSettingsStore } from '../../store/settingsStore';
import { explainStallHistory } from '../../utils/explainStallHistory';
import ModeToggle from '../../components/common/ModeToggle';

// ─── Animation helper ────────────────────────────────────────
function useFadeSlide(delay: number) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);

    return () => clearTimeout(timer);
  }, []);

  return { opacity, transform: [{ translateY }] };
}

const StallDashboard: React.FC = () => {
  const {
    sessions,
    activeSessionId,
    getActiveSession,
    getLifetimeStats,
  } = useStallStore();
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();

  const activeSession = getActiveSession();
  const hasActiveSession = !!activeSession;

  // Pulsing dot animation
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!hasActiveSession) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [hasActiveSession, pulseAnim]);

  // Staggered animations (State A)
  const headingAnim = useFadeSlide(0);
  const ctaAnim = useFadeSlide(60);
  const statsAnim = useFadeSlide(120);
  const insightAnim = useFadeSlide(180);

  // Lifetime stats
  const lifetimeStats = useMemo(() => getLifetimeStats(), [sessions]);

  // AI insight from history (needs 2+ closed sessions)
  const closedSessions = useMemo(
    () => sessions.filter((s) => !s.isActive),
    [sessions]
  );
  const historyInsight = useMemo(
    () => (closedSessions.length >= 2 ? explainStallHistory(closedSessions) : null),
    [closedSessions]
  );

  // Recent sales (last 5 from active session)
  const recentSales = useMemo(() => {
    if (!activeSession) return [];
    return [...activeSession.sales]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 5);
  }, [activeSession]);

  // ─── State B: Active session ───────────────────────────────
  if (hasActiveSession && activeSession) {
    return (
      <View style={styles.container}>
        <ModeToggle />
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Selling now indicator */}
          <View style={styles.sellingNowRow}>
            <Animated.View
              style={[styles.pulsingDot, { opacity: pulseAnim }]}
            />
            <Text style={styles.sellingNowLabel}>selling now</Text>
          </View>

          {/* Session name */}
          {activeSession.name ? (
            <Text style={styles.sessionName}>{activeSession.name}</Text>
          ) : null}

          {/* Running total — bronze-tinted card */}
          <View style={styles.runningTotalCard}>
            <Text style={styles.runningTotalLabel}>TOTAL</Text>
            <Text
              style={styles.runningTotal}
              accessibilityLabel={`Total revenue ${currency} ${activeSession.totalRevenue.toFixed(2)}`}
            >
              {currency} {activeSession.totalRevenue.toFixed(0)}
            </Text>

            {/* Cash / QR pills */}
            <View style={styles.pillRow}>
              <View style={styles.pill}>
                <Feather name="dollar-sign" size={14} color={CALM.textSecondary} />
                <Text style={styles.pillText}>
                  cash {currency} {activeSession.totalCash.toFixed(0)}
                </Text>
              </View>
              <View style={styles.pill}>
                <Feather name="smartphone" size={14} color={CALM.textSecondary} />
                <Text style={styles.pillText}>
                  qr {currency} {activeSession.totalQR.toFixed(0)}
                </Text>
              </View>
            </View>
          </View>

          {/* Recent sales */}
          {recentSales.length > 0 && (
            <View style={styles.recentSection}>
              <Text style={styles.sectionLabel}>RECENT SALES</Text>
              {recentSales.map((sale) => (
                <View key={sale.id} style={styles.saleRow}>
                  <View style={styles.saleInfo}>
                    <Text style={styles.saleProduct}>{sale.productName}</Text>
                    <Text style={styles.saleQty}>
                      x{sale.quantity} {sale.paymentMethod === 'qr' ? '(QR)' : ''}
                    </Text>
                  </View>
                  <Text
                    style={styles.saleAmount}
                    accessibilityLabel={`${currency} ${sale.total.toFixed(2)}`}
                  >
                    {currency} {sale.total.toFixed(2)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {recentSales.length === 0 && (
            <View style={styles.emptySales}>
              <Text style={styles.emptySalesText}>no sales yet this session</Text>
            </View>
          )}

          {/* Close session — outlined button instead of subtle link */}
          <TouchableOpacity
            style={styles.closeSessionButton}
            onPress={() => navigation.getParent()?.navigate('StallCloseSession')}
            accessibilityRole="button"
            accessibilityLabel="Close current selling session"
            activeOpacity={0.7}
          >
            <Feather name="square" size={16} color={CALM.textSecondary} />
            <Text style={styles.closeSessionText}>close session</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ─── State A: No active session ────────────────────────────
  return (
    <View style={styles.container}>
      <ModeToggle />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Heading */}
        <Animated.View style={headingAnim}>
          <Text style={styles.heading}>stall</Text>
          <Text style={styles.headingSubtitle}>pasar malam, roadside, walk-in</Text>
        </Animated.View>

        {/* Start selling button */}
        <Animated.View style={ctaAnim}>
          <TouchableOpacity
            style={styles.startButton}
            onPress={() => navigation.getParent()?.navigate('StallSessionSetup')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Start a new selling session"
          >
            <Feather name="play" size={20} color="#FFFFFF" />
            <Text style={styles.startButtonText}>start selling</Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Lifetime stats */}
        {lifetimeStats.totalSessions > 0 && (
          <Animated.View style={[styles.lifetimeSection, statsAnim]}>
            <Text style={styles.sectionLabel}>LIFETIME</Text>
            <View style={styles.lifetimeGrid}>
              <View style={styles.lifetimeStat}>
                <View style={[styles.statIcon, { backgroundColor: withAlpha(CALM.accent, 0.12) }]}>
                  <Feather name="activity" size={16} color={CALM.accent} />
                </View>
                <Text style={styles.lifetimeNumber}>
                  {lifetimeStats.totalSessions}
                </Text>
                <Text style={styles.lifetimeLabel}>sessions</Text>
              </View>
              <View style={styles.lifetimeStat}>
                <View style={[styles.statIcon, { backgroundColor: withAlpha(CALM.bronze, 0.12) }]}>
                  <Feather name="dollar-sign" size={16} color={CALM.bronze} />
                </View>
                <Text
                  style={styles.lifetimeNumber}
                  accessibilityLabel={`Total revenue ${currency} ${lifetimeStats.totalRevenue.toFixed(2)}`}
                >
                  {currency} {lifetimeStats.totalRevenue.toFixed(0)}
                </Text>
                <Text style={styles.lifetimeLabel}>total revenue</Text>
              </View>
              <View style={styles.lifetimeStat}>
                <View style={[styles.statIcon, { backgroundColor: withAlpha(CALM.gold, 0.12) }]}>
                  <Feather name="trending-up" size={16} color={CALM.gold} />
                </View>
                <Text
                  style={styles.lifetimeNumber}
                  accessibilityLabel={`Average per session ${currency} ${lifetimeStats.avgPerSession.toFixed(2)}`}
                >
                  {currency} {lifetimeStats.avgPerSession.toFixed(0)}
                </Text>
                <Text style={styles.lifetimeLabel}>avg / session</Text>
              </View>
            </View>
          </Animated.View>
        )}

        {/* AI insight */}
        {historyInsight && (
          <Animated.View style={insightAnim}>
            <Text style={styles.insightText}>{historyInsight}</Text>
          </Animated.View>
        )}

        {/* Session history link */}
        {closedSessions.length > 0 && (
          <TouchableOpacity
            style={styles.historyLink}
            onPress={() => navigation.navigate('StallHistory')}
            accessibilityRole="button"
            accessibilityLabel="View past selling sessions"
          >
            <Text style={styles.historyLinkText}>session history</Text>
            <Feather name="chevron-right" size={16} color={CALM.textSecondary} />
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
};

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
    paddingBottom: SPACING['4xl'],
  },

  // ─── State A: No active session ─────────────────────────────
  heading: {
    fontSize: TYPOGRAPHY.size['3xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: SPACING.xs,
  },
  headingSubtitle: {
    ...TYPE.muted,
    color: CALM.textSecondary,
    marginBottom: SPACING['3xl'],
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    minHeight: 52,
    marginBottom: SPACING['3xl'],
  },
  startButtonText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#FFFFFF',
  },
  lifetimeSection: {
    marginBottom: SPACING.xl,
  },
  sectionLabel: {
    ...TYPE.label,
    marginBottom: SPACING.md,
  },
  lifetimeGrid: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  lifetimeStat: {
    flex: 1,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  lifetimeNumber: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: SPACING.xs,
  },
  lifetimeLabel: {
    ...TYPE.muted,
  },
  insightText: {
    ...TYPE.insight,
    color: CALM.textSecondary,
    marginBottom: SPACING.xl,
  },
  historyLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
    minHeight: 48,
  },
  historyLinkText: {
    ...TYPE.insight,
    color: CALM.textSecondary,
  },

  // ─── State B: Active session ────────────────────────────────
  sellingNowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  pulsingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: CALM.positive,
  },
  sellingNowLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.positive,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sessionName: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
    marginBottom: SPACING.lg,
  },
  runningTotalCard: {
    backgroundColor: withAlpha(CALM.bronze, 0.06),
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    marginBottom: SPACING['3xl'],
  },
  runningTotalLabel: {
    ...TYPE.label,
    marginBottom: SPACING.xs,
  },
  runningTotal: {
    ...TYPE.balance,
    color: CALM.textPrimary,
    marginBottom: SPACING.lg,
  },
  pillRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: CALM.border,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  pillText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },
  recentSection: {
    marginBottom: SPACING['3xl'],
  },
  saleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
    minHeight: 44,
  },
  saleInfo: {
    flex: 1,
  },
  saleProduct: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  saleQty: {
    ...TYPE.muted,
    marginTop: 2,
  },
  saleAmount: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  emptySales: {
    paddingVertical: SPACING['3xl'],
    alignItems: 'center',
  },
  emptySalesText: {
    ...TYPE.muted,
    color: CALM.textSecondary,
  },
  closeSessionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    minHeight: 48,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    backgroundColor: CALM.surface,
  },
  closeSessionText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },
});

export default StallDashboard;
