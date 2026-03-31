import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { format, differenceInDays, differenceInHours } from 'date-fns';
import { useSellerStore } from '../../store/sellerStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha, BIZ } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useToast } from '../../context/ToastContext';
import { warningNotification } from '../../services/haptics';
import { Season } from '../../types';

// -- Format duration between two dates (e.g. "10 days 15 hours") ----
function formatDuration(start: Date, end: Date): string {
  const totalHours = differenceInHours(end, start);
  const days = differenceInDays(end, start);
  const hours = totalHours - days * 24;

  if (days === 0) return hours <= 1 ? '1 hour' : `${hours} hours`;
  if (hours === 0) return days === 1 ? '1 day' : `${days} days`;
  return `${days} day${days !== 1 ? 's' : ''} ${hours} hour${hours !== 1 ? 's' : ''}`;
}

// -- Animated card wrapper with stagger fade-in ---------------------
const AnimatedSeasonCard: React.FC<{ index: number; children: React.ReactNode }> = React.memo(({
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
});

// -- Pulsing dot for active badge -----------------------------------
const PulsingDot: React.FC<{ styles: ReturnType<typeof makeStyles> }> = React.memo(({ styles }) => {
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
});

const PastSeasons: React.FC = () => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { seasons, orders, ingredientCosts, addSeason, useSeasonTemplate } = useSellerStore();
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();
  const { showToast } = useToast();

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [templateSeasonId, setTemplateSeasonId] = useState<string | null>(null);

  const activeSeason = seasons.find((s) => s.isActive);
  const pastSeasons = seasons.filter((s) => !s.isActive);

  const handleStartSeason = useCallback(() => {
    if (!newName.trim()) {
      warningNotification();
      showToast('enter a season name', 'error');
      return;
    }

    if (activeSeason) {
      warningNotification();
      showToast(`"${activeSeason.name}" is still active — end it first`, 'error');
      return;
    }

    addSeason({
      name: newName.trim(),
      startDate: new Date(),
      isActive: true,
    });
    if (templateSeasonId) {
      const trimmedName = newName.trim();
      const newSeason = useSellerStore.getState().seasons.find(
        (s) => s.isActive && s.name === trimmedName
      );
      if (newSeason) useSeasonTemplate(newSeason.id, templateSeasonId);
    }
    setNewName('');
    setTemplateSeasonId(null);
    setShowAdd(false);
  }, [newName, activeSeason, templateSeasonId, addSeason, useSeasonTemplate]);

  const statsMap = useMemo(() => {
    const map: Record<string, { orderCount: number; kept: number; customerCount: number }> = {};
    for (const s of seasons) {
      const seasonOrders = orders.filter((o) => o.seasonId === s.id);
      const seasonCosts = ingredientCosts.filter((c) => c.seasonId === s.id);
      const totalIncome = seasonOrders.filter((o) => o.isPaid).reduce((sum, o) => sum + o.totalAmount, 0);
      const totalCosts = seasonCosts.reduce((sum, c) => sum + c.amount, 0);
      const customers = new Set(
        seasonOrders.filter((o) => o.customerName).map((o) => o.customerName!)
      );
      map[s.id] = {
        orderCount: seasonOrders.length,
        kept: totalIncome - totalCosts,
        customerCount: customers.size,
      };
    }
    return map;
  }, [seasons, orders, ingredientCosts]);

  // Show active season first, then past seasons
  const allSeasons = useMemo(() => {
    return activeSeason ? [activeSeason, ...pastSeasons] : pastSeasons;
  }, [activeSeason, pastSeasons]);

  const navigateToSeason = useCallback((seasonId: string) => {
    navigation.navigate('SeasonSummary', { seasonId });
  }, [navigation]);

  const renderSeason = useCallback(
    ({ item, index }: { item: Season; index: number }) => {
      const stats = statsMap[item.id] || { orderCount: 0, kept: 0, customerCount: 0 };
      const isActive = item.isActive;
      const isLast = index === allSeasons.length - 1;

      // Build compact stats parts
      const ordersPart = `${stats.orderCount} orders`;
      const keptPart = `${currency} ${stats.kept.toFixed(0)} kept`;
      const customersPart = stats.customerCount > 0
        ? `${stats.customerCount} customers`
        : null;

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
                      <Feather name="calendar" size={20} color={C.bronze} />
                    </View>
                    <View style={styles.seasonHeaderInfo}>
                      <Text style={styles.seasonName}>{item.name}</Text>
                      <Text style={styles.seasonDates}>
                        {format(item.startDate instanceof Date ? item.startDate : new Date(item.startDate), 'dd MMM yyyy, h:mm a')}
                        {' \u2013 now  \u00B7  '}
                        {formatDuration(item.startDate instanceof Date ? item.startDate : new Date(item.startDate), new Date())}
                      </Text>
                    </View>
                    <View style={styles.activeBadge}>
                      <PulsingDot styles={styles} />
                      <Text style={styles.activeBadgeText}>active</Text>
                    </View>
                  </View>

                  {/* Quick stats */}
                  <Text style={styles.seasonStatsInline}>
                    {ordersPart}{'  \u00B7  '}
                    <Text style={{ color: stats.kept >= 0 ? BIZ.profit : BIZ.loss }}>{keptPart}</Text>
                    {customersPart ? `  \u00B7  ${customersPart}` : ''}
                  </Text>

                  {/* View details link */}
                  <View style={styles.viewDetailsRow}>
                    <Text style={styles.viewDetailsText}>view details</Text>
                    <Feather name="arrow-right" size={14} color={C.bronze} />
                  </View>
                </TouchableOpacity>
              ) : (
                // Past season card (tappable, delete button inside captures its own press)
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
                      <Feather name="calendar" size={20} color={C.textMuted} />
                    </View>
                    <View style={styles.seasonHeaderInfo}>
                      <Text style={styles.seasonName}>{item.name}</Text>
                      <Text style={styles.seasonDates}>
                        {format(item.startDate instanceof Date ? item.startDate : new Date(item.startDate), 'dd MMM yyyy, h:mm a')}
                        {item.endDate
                          ? ` \u2013 ${format(item.endDate instanceof Date ? item.endDate : new Date(item.endDate), 'dd MMM yyyy, h:mm a')}  \u00B7  ${formatDuration(item.startDate instanceof Date ? item.startDate : new Date(item.startDate), item.endDate instanceof Date ? item.endDate : new Date(item.endDate))}`
                          : ''}
                      </Text>
                    </View>
                  </View>

                  {/* Compact stats */}
                  <Text style={styles.seasonStatsInline}>
                    {ordersPart}{'  \u00B7  '}
                    <Text style={{ color: stats.kept >= 0 ? BIZ.profit : BIZ.loss }}>{keptPart}</Text>
                    {customersPart ? `  \u00B7  ${customersPart}` : ''}
                  </Text>

                  {/* View details link */}
                  <View style={styles.viewDetailsRow}>
                    <Text style={styles.viewDetailsText}>view details</Text>
                    <Feather name="arrow-right" size={14} color={C.bronze} />
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </AnimatedSeasonCard>
      );
    },
    [statsMap, currency, navigateToSeason, allSeasons.length]
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
            <Feather name="calendar" size={40} color={C.border} />
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
        removeClippedSubviews
        windowSize={5}
        maxToRenderPerBatch={10}
        initialNumToRender={10}
      />

      {/* Bottom-anchored add button (only when seasons exist and no active season) */}
      {allSeasons.length > 0 && !activeSeason && (
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

      {showAdd && (
        <Modal visible transparent statusBarTranslucent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>new season</Text>
              <TextInput
                style={styles.modalInput}
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g. Raya 2025, CNY 2025"
                placeholderTextColor={C.textSecondary}
                autoFocus
              />
              {pastSeasons.length > 0 && (
                <View style={styles.templateSection}>
                  <Text style={styles.templateLabel}>copy from previous season</Text>
                  <View style={styles.templatePills}>
                    <TouchableOpacity
                      style={[styles.templatePill, templateSeasonId === null && styles.templatePillActive]}
                      onPress={() => setTemplateSeasonId(null)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.templatePillText, templateSeasonId === null && styles.templatePillTextActive]}>
                        none
                      </Text>
                    </TouchableOpacity>
                    {pastSeasons.slice(0, 3).map((s) => (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.templatePill, templateSeasonId === s.id && styles.templatePillActive]}
                        onPress={() => setTemplateSeasonId(s.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.templatePillText, templateSeasonId === s.id && styles.templatePillTextActive]} numberOfLines={1}>
                          {s.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {templateSeasonId && (
                    <Text style={styles.templateHint}>copies costs, budget & product prices</Text>
                  )}
                </View>
              )}
              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={() => { setShowAdd(false); setTemplateSeasonId(null); }}
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
      )}
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,     // #F9F9F7
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
    color: C.textPrimary,               // #1A1A1A
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
    backgroundColor: C.bronze,          // #B2780A filled
  },
  timelineDotPast: {
    width: 6,
    height: 6,
    backgroundColor: C.border,          // #EBEBEB
  },
  timelineLine: {
    flex: 1,
    width: 1,
    backgroundColor: C.border,          // #EBEBEB
    marginTop: SPACING.xs,                 // 4pt gap below dot
  },
  timelineCardWrapper: {
    flex: 1,
    paddingBottom: SPACING.md,             // 16pt gap between cards
    paddingLeft: SPACING.md,               // 16pt from timeline to card
  },

  // -- Active season card (prominent) -------------------------------
  activeSeasonCard: {
    backgroundColor: withAlpha(C.bronze, 0.06), // bronze at 6% opacity
    borderRadius: RADIUS.lg,               // 14
    borderWidth: 1,
    borderColor: withAlpha(C.bronze, 0.15), // subtle bronze border
    padding: SPACING.lg,                   // 16pt
    gap: SPACING.md,                       // 16pt between sections
  },

  // -- Past season card ---------------------------------------------
  seasonCard: {
    backgroundColor: C.surface,         // #FFFFFF
    borderRadius: RADIUS.lg,               // 14
    borderWidth: 1,
    borderColor: C.border,              // #EBEBEB
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
    backgroundColor: withAlpha(C.bronze, 0.08), // bronze at 8% opacity
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
    color: C.textPrimary,               // #1A1A1A
  },
  seasonDates: {
    ...TYPE.muted,                         // fontSize 12, color #A0A0A0
  },

  // -- Active badge with pulsing dot --------------------------------
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,                       // 4pt
    backgroundColor: C.bronze,          // #B2780A
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
    backgroundColor: C.surface,
  },

  // -- Compact stats inline -----------------------------------------
  seasonStatsInline: {
    ...TYPE.muted,                         // fontSize 12, color #A0A0A0
    color: C.textSecondary,             // #6B6B6B
    fontVariant: ['tabular-nums'],
  },

  // -- View details link -------------------------
  viewDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,                       // 4pt
    paddingTop: SPACING.xs,                // 4pt above
  },
  viewDetailsText: {
    fontSize: TYPOGRAPHY.size.sm,          // 13
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: C.bronze,                    // #B2780A
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
    color: C.textPrimary,               // #1A1A1A
  },
  emptyHint: {
    ...TYPE.insight,                       // fontSize 14, lineHeight 22
    color: C.textSecondary,             // #6B6B6B
    textAlign: 'center',
  },
  emptyCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: C.deepOlive,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.lg,
    alignSelf: 'stretch',
    marginTop: SPACING.sm,
    ...SHADOWS.sm,
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
    gap: SPACING.sm,
    backgroundColor: C.deepOlive,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.lg,
    ...SHADOWS.sm,
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
    backgroundColor: C.surface,         // #FFFFFF
    borderRadius: RADIUS.lg,               // 14
    padding: SPACING.xl,                   // 24pt
    width: '100%',
    gap: SPACING.lg,                       // 16pt
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size.lg,          // 17
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: C.textPrimary,               // #1A1A1A
  },
  modalInput: {
    ...TYPE.insight,                       // fontSize 14, lineHeight 22
    color: C.textPrimary,               // #1A1A1A
    backgroundColor: C.background,      // #F9F9F7
    borderRadius: RADIUS.md,               // 10
    padding: SPACING.md,                   // 16pt
    borderWidth: 1,
    borderColor: C.border,              // #EBEBEB
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
    color: C.textSecondary,             // #6B6B6B
  },
  modalConfirm: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    backgroundColor: C.deepOlive,
    borderRadius: RADIUS.xl,
    minHeight: 44,
    justifyContent: 'center',
  },
  modalConfirmText: {
    fontSize: TYPOGRAPHY.size.sm,          // 13
    fontWeight: TYPOGRAPHY.weight.semibold, // 600
    color: '#fff',
  },
  templateSection: {
    gap: SPACING.xs,
  },
  templateLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    letterSpacing: 0.3,
  },
  templatePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  templatePill: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    maxWidth: 120,
  },
  templatePillActive: {
    backgroundColor: withAlpha(C.accent, 0.12),
  },
  templatePillText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
  templatePillTextActive: {
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  templateHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontStyle: 'italic',
  },
});

export default PastSeasons;
