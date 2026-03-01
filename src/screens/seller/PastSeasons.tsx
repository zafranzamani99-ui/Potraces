import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useSellerStore } from '../../store/sellerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { Season } from '../../types';

// -- Animated card wrapper with stagger fade-in ---------------------
const AnimatedSeasonCard: React.FC<{ index: number; children: React.ReactNode }> = ({
  index,
  children,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 250,
        delay: index * 50,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 250,
        delay: index * 50,
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

// -- Pulsing dot for active badge -----------------------------------
const PulsingDot: React.FC = () => {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  return (
    <Animated.View
      style={[styles.pulsingDot, { opacity }]}
    />
  );
};

const PastSeasons: React.FC = () => {
  const { seasons, orders, ingredientCosts, addSeason } = useSellerStore();
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');

  const activeSeason = seasons.find((s) => s.isActive);
  const pastSeasons = seasons.filter((s) => !s.isActive);

  const handleStartSeason = () => {
    if (!newName.trim()) return;

    if (activeSeason) {
      Alert.alert(
        'Season already active',
        `"${activeSeason.name}" is still active. End it first before starting a new one.`
      );
      return;
    }

    addSeason({
      name: newName.trim(),
      startDate: new Date(),
      isActive: true,
    });
    setNewName('');
    setShowAdd(false);
  };

  const getStats = (seasonId: string) => {
    const seasonOrders = orders.filter((o) => o.seasonId === seasonId);
    const seasonCosts = ingredientCosts.filter((c) => c.seasonId === seasonId);
    const totalIncome = seasonOrders.filter((o) => o.isPaid).reduce((s, o) => s + o.totalAmount, 0);
    const totalCosts = seasonCosts.reduce((s, c) => s + c.amount, 0);
    const customers = new Set(
      seasonOrders.filter((o) => o.customerName).map((o) => o.customerName!)
    );
    return {
      orderCount: seasonOrders.length,
      kept: totalIncome - totalCosts,
      customerCount: customers.size,
    };
  };

  // Show active season first, then past seasons
  const allSeasons = useMemo(() => {
    return activeSeason ? [activeSeason, ...pastSeasons] : pastSeasons;
  }, [activeSeason, pastSeasons]);

  const navigateToSeason = (seasonId: string) => {
    navigation.getParent()?.navigate('SeasonSummary', { seasonId });
  };

  const renderSeason = useCallback(
    ({ item, index }: { item: Season; index: number }) => {
      const stats = getStats(item.id);
      const isActive = item.isActive;
      const isLast = index === allSeasons.length - 1;

      // Build compact stats string
      const statParts: string[] = [];
      statParts.push(`${stats.orderCount} orders`);
      statParts.push(`${currency} ${stats.kept.toFixed(0)} kept`);
      if (stats.customerCount > 0) {
        statParts.push(`${stats.customerCount} customers`);
      }

      return (
        <AnimatedSeasonCard index={index}>
          <View style={styles.timelineRow}>
            {/* Timeline indicator on the left */}
            <View style={styles.timelineColumn}>
              {/* Dot */}
              <View
                style={[
                  styles.timelineDot,
                  isActive ? styles.timelineDotActive : styles.timelineDotPast,
                ]}
              />
              {/* Vertical line (hide on last item) */}
              {!isLast && <View style={styles.timelineLine} />}
            </View>

            {/* Card */}
            <View style={styles.timelineCardWrapper}>
              {isActive ? (
                // Active season: special prominent card
                <TouchableOpacity
                  style={styles.activeSeasonCard}
                  activeOpacity={0.7}
                  onPress={() => navigateToSeason(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Active season: ${item.name}. ${stats.orderCount} orders, ${currency} ${stats.kept.toFixed(0)} kept. Tap to view details.`}
                >
                  {/* Header with badge */}
                  <View style={styles.seasonHeader}>
                    <View style={styles.seasonIconArea}>
                      <Feather name="calendar" size={20} color={CALM.bronze} />
                    </View>
                    <View style={styles.seasonHeaderInfo}>
                      <Text style={styles.seasonName}>{item.name}</Text>
                      <Text style={styles.seasonDates}>
                        {format(item.startDate instanceof Date ? item.startDate : new Date(item.startDate), 'dd MMM yyyy')}
                        {' \u2013 now'}
                      </Text>
                    </View>
                    <View style={styles.activeBadge}>
                      <PulsingDot />
                      <Text style={styles.activeBadgeText}>active</Text>
                    </View>
                  </View>

                  {/* Quick stats */}
                  <Text style={styles.seasonStatsInline}>
                    {statParts.join('  \u00B7  ')}
                  </Text>

                  {/* View details link */}
                  <View style={styles.viewDetailsRow}>
                    <Text style={styles.viewDetailsText}>view details</Text>
                    <Feather name="arrow-right" size={14} color={CALM.bronze} />
                  </View>
                </TouchableOpacity>
              ) : (
                // Past season card
                <TouchableOpacity
                  style={styles.seasonCard}
                  activeOpacity={0.7}
                  onPress={() => navigateToSeason(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Past season: ${item.name}. ${stats.orderCount} orders, ${currency} ${stats.kept.toFixed(0)} kept. Tap to view details.`}
                >
                  {/* Header with icon */}
                  <View style={styles.seasonHeader}>
                    <View style={styles.seasonIconArea}>
                      <Feather name="calendar" size={20} color={CALM.textMuted} />
                    </View>
                    <View style={styles.seasonHeaderInfo}>
                      <Text style={styles.seasonName}>{item.name}</Text>
                      <Text style={styles.seasonDates}>
                        {format(item.startDate instanceof Date ? item.startDate : new Date(item.startDate), 'dd MMM yyyy')}
                        {item.endDate
                          ? ` \u2013 ${format(item.endDate instanceof Date ? item.endDate : new Date(item.endDate), 'dd MMM yyyy')}`
                          : ''}
                      </Text>
                    </View>
                  </View>

                  {/* Compact stats */}
                  <Text style={styles.seasonStatsInline}>
                    {statParts.join('  \u00B7  ')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </AnimatedSeasonCard>
      );
    },
    [orders, ingredientCosts, currency, navigation, allSeasons.length]
  );

  // Page header above FlatList
  const ListHeaderComponent = useMemo(() => (
    <View style={styles.pageHeader}>
      <Text style={styles.pageTitle}>seasons</Text>
      <Text style={styles.pageSubtitle}>track your seasonal events like Raya, CNY, or bazaar</Text>
    </View>
  ), []);

  return (
    <View style={styles.container}>
      <FlatList
        data={allSeasons}
        renderItem={renderSeason}
        keyExtractor={(s) => s.id}
        ListHeaderComponent={allSeasons.length > 0 ? ListHeaderComponent : null}
        contentContainerStyle={[
          styles.listContent,
          allSeasons.length === 0 && styles.listContentEmpty,
        ]}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="calendar" size={40} color={CALM.border} />
            <Text style={styles.emptyTitle}>no seasons yet</Text>
            <Text style={styles.emptyHint}>
              a season is like Raya, CNY, or any event where you take orders.
            </Text>
            <TouchableOpacity
              style={styles.emptyCTA}
              activeOpacity={0.7}
              onPress={() => setShowAdd(true)}
              accessibilityRole="button"
              accessibilityLabel="Start your first season"
            >
              <Feather name="plus" size={18} color="#fff" />
              <Text style={styles.emptyCTAText}>start your first season</Text>
            </TouchableOpacity>
          </View>
        }
      />

      {/* Bottom-anchored add button (only when seasons exist) */}
      {allSeasons.length > 0 && (
        <View style={styles.addButtonWrapper}>
          <TouchableOpacity
            style={styles.addButton}
            activeOpacity={0.7}
            onPress={() => setShowAdd(true)}
            accessibilityRole="button"
            accessibilityLabel="Start new season"
          >
            <Feather name="plus" size={20} color="#fff" />
            <Text style={styles.addButtonText}>start new season</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={showAdd} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>new season</Text>
            <TextInput
              style={styles.modalInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="e.g. Raya 2025, CNY 2025"
              placeholderTextColor={CALM.textSecondary}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setShowAdd(false)}
                style={styles.modalCancel}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.modalCancelText}>cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleStartSeason}
                style={styles.modalConfirm}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Start season"
              >
                <Text style={styles.modalConfirmText}>start</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,     // #F9F9F7
  },
  listContent: {
    paddingHorizontal: SPACING['2xl'],     // 24pt horizontal
    paddingTop: SPACING.lg,                // 16pt top
    paddingBottom: SPACING['3xl'],         // 32pt bottom (room for add button)
  },
  listContentEmpty: {
    flex: 1,
    justifyContent: 'center',
  },

  // -- Page header --------------------------------------------------
  pageHeader: {
    marginBottom: SPACING.xl,              // 24pt below header
  },
  pageTitle: {
    fontSize: TYPOGRAPHY.size.xl,          // 20
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: CALM.textPrimary,               // #1A1A1A
    marginBottom: SPACING.xs,              // 4pt
  },
  pageSubtitle: {
    ...TYPE.muted,                         // fontSize 12, color #A0A0A0
  },

  // -- Timeline layout ----------------------------------------------
  timelineRow: {
    flexDirection: 'row',
  },
  timelineColumn: {
    width: 24,                             // space for dot + line
    alignItems: 'center',
    paddingTop: SPACING.lg,                // align dot with card top content
  },
  timelineDot: {
    borderRadius: 9999,
    zIndex: 1,
  },
  timelineDotActive: {
    width: 8,
    height: 8,
    backgroundColor: CALM.bronze,          // #B2780A filled
  },
  timelineDotPast: {
    width: 6,
    height: 6,
    backgroundColor: CALM.border,          // #EBEBEB
  },
  timelineLine: {
    flex: 1,
    width: 1,
    backgroundColor: CALM.border,          // #EBEBEB
    marginTop: SPACING.xs,                 // 4pt gap below dot
  },
  timelineCardWrapper: {
    flex: 1,
    paddingBottom: SPACING.md,             // 16pt gap between cards
    paddingLeft: SPACING.md,               // 16pt from timeline to card
  },

  // -- Active season card (prominent) -------------------------------
  activeSeasonCard: {
    backgroundColor: withAlpha(CALM.bronze, 0.06), // bronze at 6% opacity
    borderRadius: RADIUS.lg,               // 14
    borderWidth: 1,
    borderColor: withAlpha(CALM.bronze, 0.15), // subtle bronze border
    padding: SPACING.lg,                   // 16pt
    gap: SPACING.md,                       // 16pt between sections
  },

  // -- Past season card ---------------------------------------------
  seasonCard: {
    backgroundColor: CALM.surface,         // #FFFFFF
    borderRadius: RADIUS.lg,               // 14
    borderWidth: 1,
    borderColor: CALM.border,              // #EBEBEB
    padding: SPACING.lg,                   // 16pt
    gap: SPACING.sm,                       // 8pt
  },

  // -- Shared card header -------------------------------------------
  seasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,                       // 16pt
  },
  seasonIconArea: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withAlpha(CALM.bronze, 0.08), // bronze at 8% opacity
    alignItems: 'center',
    justifyContent: 'center',
  },
  seasonHeaderInfo: {
    flex: 1,
    gap: 2,
  },
  seasonName: {
    fontSize: TYPOGRAPHY.size.base,        // 15
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: CALM.textPrimary,               // #1A1A1A
  },
  seasonDates: {
    ...TYPE.muted,                         // fontSize 12, color #A0A0A0
  },

  // -- Active badge with pulsing dot --------------------------------
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,                       // 4pt
    backgroundColor: CALM.bronze,          // #B2780A
    borderRadius: RADIUS.full,
    paddingVertical: 4,
    paddingHorizontal: SPACING.sm,         // 8pt
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: '#fff',
    textTransform: 'uppercase',
  },
  pulsingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },

  // -- Compact stats inline -----------------------------------------
  seasonStatsInline: {
    ...TYPE.muted,                         // fontSize 12, color #A0A0A0
    color: CALM.textSecondary,             // #6B6B6B
    fontVariant: ['tabular-nums'],
  },

  // -- View details link (active card only) -------------------------
  viewDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,                       // 4pt
    paddingTop: SPACING.xs,                // 4pt above
  },
  viewDetailsText: {
    fontSize: TYPOGRAPHY.size.sm,          // 13
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: CALM.bronze,                    // #B2780A
  },

  // -- Empty state --------------------------------------------------
  emptyState: {
    alignItems: 'center',
    paddingVertical: SPACING['4xl'],       // 40pt generous vertical padding
    paddingHorizontal: SPACING['2xl'],     // 24pt
    gap: SPACING.md,                       // 16pt
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.size.lg,          // 17
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: CALM.textPrimary,               // #1A1A1A
  },
  emptyHint: {
    ...TYPE.insight,                       // fontSize 14, lineHeight 22
    color: CALM.textSecondary,             // #6B6B6B
    textAlign: 'center',
  },
  emptyCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,                       // 8pt
    backgroundColor: CALM.bronze,          // #B2780A
    borderRadius: RADIUS.lg,              // 14
    paddingVertical: SPACING.lg,           // 16pt
    alignSelf: 'stretch',
    marginTop: SPACING.sm,                // 8pt
  },
  emptyCTAText: {
    fontSize: TYPOGRAPHY.size.base,        // 15
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: '#fff',
  },

  // -- Bottom-anchored add button -----------------------------------
  addButtonWrapper: {
    paddingHorizontal: SPACING.lg,         // 16pt sides
    paddingBottom: SPACING.lg,             // 16pt bottom
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,                       // 8pt
    backgroundColor: CALM.bronze,          // #B2780A
    borderRadius: RADIUS.lg,              // 14
    paddingVertical: SPACING.lg,           // 16pt
    ...SHADOWS.sm,                         // subtle elevation
  },
  addButtonText: {
    fontSize: TYPOGRAPHY.size.base,        // 15
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: '#fff',
  },

  // -- Modal --------------------------------------------------------
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING['2xl'],               // 24pt
  },
  modalContent: {
    backgroundColor: CALM.surface,         // #FFFFFF
    borderRadius: RADIUS.lg,               // 14
    padding: SPACING.xl,                   // 24pt
    width: '100%',
    gap: SPACING.lg,                       // 16pt
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size.lg,          // 17
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: CALM.textPrimary,               // #1A1A1A
  },
  modalInput: {
    ...TYPE.insight,                       // fontSize 14, lineHeight 22
    color: CALM.textPrimary,               // #1A1A1A
    backgroundColor: CALM.background,      // #F9F9F7
    borderRadius: RADIUS.md,               // 10
    padding: SPACING.md,                   // 16pt
    borderWidth: 1,
    borderColor: CALM.border,              // #EBEBEB
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.md,                       // 16pt
  },
  modalCancel: {
    paddingVertical: SPACING.sm,           // 8pt
    paddingHorizontal: SPACING.lg,         // 16pt
    minHeight: 44,
    justifyContent: 'center',
  },
  modalCancelText: {
    fontSize: TYPOGRAPHY.size.sm,          // 13
    color: CALM.textSecondary,             // #6B6B6B
  },
  modalConfirm: {
    paddingVertical: SPACING.sm,           // 8pt
    paddingHorizontal: SPACING.lg,         // 16pt
    backgroundColor: CALM.bronze,          // #B2780A
    borderRadius: RADIUS.md,               // 10
    minHeight: 44,
    justifyContent: 'center',
  },
  modalConfirmText: {
    fontSize: TYPOGRAPHY.size.sm,          // 13
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: '#fff',
  },
});

export default PastSeasons;
