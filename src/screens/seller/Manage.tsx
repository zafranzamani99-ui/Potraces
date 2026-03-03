import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Animated } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useSellerStore } from '../../store/sellerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';

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

// ─── Component ───────────────────────────────────────────────
const SellerManage: React.FC = () => {
  const { products, seasons, ingredientCosts } = useSellerStore();
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();

  const activeSeason = seasons.find((s) => s.isActive) || null;
  const totalCostsThisMonth = ingredientCosts
    .filter((c) => {
      const d = c.date instanceof Date ? c.date : new Date(c.date);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, c) => sum + c.amount, 0);

  // Staggered animations
  const headerAnim = useFadeSlide(0);
  const productsAnim = useFadeSlide(60);
  const costsAnim = useFadeSlide(120);
  const seasonsAnim = useFadeSlide(180);
  const settingsAnim = useFadeSlide(240);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ─── Page Header ──────────────────────────────────── */}
      <Animated.View style={[styles.header, headerAnim]}>
        <Text style={styles.headerLabel}>MANAGE</Text>
        <Text style={styles.headerSubtitle}>products, costs, seasons, and settings</Text>
      </Animated.View>

      {/* ─── Products Card ────────────────────────────────── */}
      <Animated.View style={productsAnim}>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Products. ${products.length} products. Navigate to product catalog.`}
          onPress={() => navigation.getParent()?.navigate('SellerProducts')}
        >
          <View style={[styles.iconBox, { backgroundColor: withAlpha(CALM.accent, 0.12) }]}>
            <Feather name="package" size={24} color={CALM.accent} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Products</Text>
            <Text style={styles.cardSubtitle}>catalog and pricing</Text>
            <Text style={styles.cardBadge}>{products.length} products</Text>
          </View>
          <Feather name="chevron-right" size={20} color={CALM.textMuted} />
        </TouchableOpacity>
      </Animated.View>

      {/* ─── Costs Card ────────────────────────────────────── */}
      <Animated.View style={costsAnim}>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Costs. ${ingredientCosts.length} entries. Navigate to cost management.`}
          onPress={() => navigation.getParent()?.navigate('SellerCosts')}
        >
          <View style={styles.iconBox}>
            <Feather name="shopping-bag" size={24} color={CALM.bronze} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Costs</Text>
            <Text style={styles.cardSubtitle}>budget, history, and transfers</Text>
            <View style={styles.badgeRow}>
              <Text style={styles.cardBadge}>{ingredientCosts.length} entries</Text>
              {totalCostsThisMonth > 0 && (
                <Text style={styles.costBadge}>{currency} {totalCostsThisMonth.toFixed(0)} this month</Text>
              )}
            </View>
          </View>
          <Feather name="chevron-right" size={20} color={CALM.textMuted} />
        </TouchableOpacity>
      </Animated.View>

      {/* ─── Seasons Card ─────────────────────────────────── */}
      <Animated.View style={seasonsAnim}>
        <TouchableOpacity
          style={[styles.card, activeSeason && styles.cardHighlighted]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Seasons. ${seasons.length} seasons.${activeSeason ? ` Active season: ${activeSeason.name}.` : ''} Navigate to season history.`}
          onPress={() => navigation.getParent()?.navigate('PastSeasons')}
        >
          <View style={[styles.iconBox, { backgroundColor: withAlpha(CALM.gold, 0.12) }]}>
            <Feather name="calendar" size={24} color={CALM.gold} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Seasons</Text>
            <Text style={styles.cardSubtitle}>history and performance by season</Text>
            <View style={styles.badgeRow}>
              <Text style={styles.cardBadge}>{seasons.length} seasons</Text>
              {activeSeason && (
                <Text style={styles.activeBadge}>active: {activeSeason.name}</Text>
              )}
            </View>
          </View>
          <Feather name="chevron-right" size={20} color={CALM.textMuted} />
        </TouchableOpacity>
      </Animated.View>

      {/* ─── Settings Card ────────────────────────────────── */}
      <Animated.View style={settingsAnim}>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Settings. Currency, preferences, and data. Navigate to settings."
          onPress={() => navigation.getParent()?.navigate('SellerSettings')}
        >
          <View style={[styles.iconBox, { backgroundColor: withAlpha(CALM.lavender, 0.15) }]}>
            <Feather name="settings" size={24} color={CALM.lavender} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>Settings</Text>
            <Text style={styles.cardSubtitle}>currency, preferences, data</Text>
          </View>
          <Feather name="chevron-right" size={20} color={CALM.textMuted} />
        </TouchableOpacity>
      </Animated.View>
    </ScrollView>
  );
};

// ─── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  content: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING['3xl'],
  },

  // Header
  header: {
    marginTop: SPACING['3xl'],
    marginBottom: SPACING.xl,
  },
  headerLabel: {
    ...TYPE.label,
  },
  headerSubtitle: {
    ...TYPE.muted,
    marginTop: SPACING.xs,
  },

  // Card
  card: {
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },

  // Icon box
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },

  // Card text content
  cardContent: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  cardTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  cardSubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    marginTop: 2,
  },
  cardBadge: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
    marginTop: SPACING.xs,
  },

  // Badge row for seasons
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
    gap: SPACING.sm,
  },
  activeBadge: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.bronze,
  },
  costBadge: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.bronze,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  cardHighlighted: {
    borderColor: withAlpha(CALM.gold, 0.3),
    backgroundColor: withAlpha(CALM.gold, 0.03),
  },
});

export default SellerManage;
