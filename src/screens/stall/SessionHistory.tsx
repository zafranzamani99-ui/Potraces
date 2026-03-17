import React, { useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { format } from 'date-fns';
import { useStallStore } from '../../store/stallStore';
import { useSettingsStore } from '../../store/settingsStore';
import { explainStallHistory } from '../../utils/explainStallHistory';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { StallSession, SessionCondition } from '../../types';

// ─── Condition badge colors ─────────────────────────────
const CONDITION_CONFIG: Record<SessionCondition, { label: string; bg: string; text: string }> = {
  good: { label: 'good', bg: withAlpha(CALM.bronze, 0.12), text: CALM.bronze },
  slow: { label: 'slow', bg: withAlpha(CALM.gold, 0.12), text: CALM.gold },
  rainy: { label: 'rainy', bg: withAlpha(CALM.textSecondary, 0.12), text: CALM.textSecondary },
  hot: { label: 'hot', bg: withAlpha(CALM.gold, 0.12), text: CALM.gold },
  normal: { label: 'normal', bg: CALM.border, text: CALM.textSecondary },
};

const SessionHistory: React.FC = () => {
  const navigation = useNavigation<any>();
  const { sessions, getLifetimeStats, getSessionSummary } = useStallStore();
  const currency = useSettingsStore((s) => s.currency);

  // Filter only closed sessions, sorted newest first
  const closedSessions = useMemo(
    () =>
      sessions
        .filter((s) => !s.isActive && s.closedAt)
        .sort((a, b) => {
          const dateA = a.closedAt instanceof Date ? a.closedAt.getTime() : new Date(a.closedAt!).getTime();
          const dateB = b.closedAt instanceof Date ? b.closedAt.getTime() : new Date(b.closedAt!).getTime();
          return dateB - dateA;
        }),
    [sessions],
  );

  const lifetimeStats = useMemo(() => getLifetimeStats(), [sessions]);
  const insight = useMemo(() => explainStallHistory(closedSessions), [closedSessions]);

  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  const formatSessionDate = (session: StallSession): string => {
    const date = session.startedAt instanceof Date ? session.startedAt : new Date(session.startedAt);
    return format(date, 'EEE, d MMM yyyy');
  };

  const handleSessionPress = useCallback(
    (sessionId: string) => {
      navigation.navigate('StallSessionSummary', { sessionId });
    },
    [navigation],
  );

  const renderSessionCard = useCallback(
    ({ item }: { item: StallSession }) => {
      const summary = getSessionSummary(item.id);
      const displayName = item.name || formatSessionDate(item);

      return (
        <TouchableOpacity
          style={styles.sessionCard}
          onPress={() => handleSessionPress(item.id)}
          activeOpacity={0.85}
          accessibilityLabel={`Session ${displayName}, total revenue ${currency} ${item.totalRevenue.toFixed(2)}, ${summary.saleCount} sales`}
          accessibilityHint="Tap to view session details"
          accessibilityRole="button"
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {displayName}
              </Text>
              {item.condition && CONDITION_CONFIG[item.condition] && (
                <View
                  style={[
                    styles.conditionBadge,
                    { backgroundColor: CONDITION_CONFIG[item.condition].bg },
                  ]}
                >
                  <Text
                    style={[
                      styles.conditionText,
                      { color: CONDITION_CONFIG[item.condition].text },
                    ]}
                  >
                    {CONDITION_CONFIG[item.condition].label}
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.cardDate}>
              {formatSessionDate(item)}
              {'  \u00B7  '}
              {formatDuration(summary.duration)}
            </Text>
          </View>

          <View style={styles.cardFooter}>
            <Text
              style={styles.cardRevenue}
              accessibilityLabel={`Revenue ${currency} ${item.totalRevenue.toFixed(2)}`}
            >
              {currency} {item.totalRevenue.toFixed(0)}
            </Text>

            <View style={styles.cardMeta}>
              <Text style={styles.cardMetaText}>
                {summary.saleCount} sale{summary.saleCount !== 1 ? 's' : ''}
              </Text>
              <Text style={styles.cardMetaDot}>{'\u00B7'}</Text>
              <Text style={styles.cardMetaText}>
                cash {currency} {item.totalCash.toFixed(0)}
              </Text>
              <Text style={styles.cardMetaDot}>{'\u00B7'}</Text>
              <Text style={styles.cardMetaText}>
                qr {currency} {item.totalQR.toFixed(0)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [currency, getSessionSummary, handleSessionPress],
  );

  const renderHeader = useCallback(() => {
    return (
      <View style={styles.headerContainer}>
        <Text style={styles.heading}>past sessions</Text>

        {/* Lifetime stats -- only show if 3+ sessions */}
        {closedSessions.length >= 3 && (
          <View style={styles.lifetimeRow}>
            <View style={styles.lifetimeStat}>
              <View style={[styles.statIcon, { backgroundColor: withAlpha(CALM.accent, 0.12) }]}>
                <Feather name="activity" size={14} color={CALM.accent} />
              </View>
              <Text style={styles.lifetimeNumber}>{lifetimeStats.totalSessions}</Text>
              <Text style={styles.lifetimeLabel}>sessions</Text>
            </View>
            <View style={styles.lifetimeStat}>
              <View style={[styles.statIcon, { backgroundColor: withAlpha(CALM.bronze, 0.12) }]}>
                <Feather name="dollar-sign" size={14} color={CALM.bronze} />
              </View>
              <Text style={styles.lifetimeNumber}>
                {currency} {lifetimeStats.totalRevenue.toFixed(0)}
              </Text>
              <Text style={styles.lifetimeLabel}>lifetime</Text>
            </View>
            <View style={styles.lifetimeStat}>
              <View style={[styles.statIcon, { backgroundColor: withAlpha(CALM.gold, 0.12) }]}>
                <Feather name="trending-up" size={14} color={CALM.gold} />
              </View>
              <Text style={styles.lifetimeNumber}>
                {currency} {lifetimeStats.avgPerSession.toFixed(0)}
              </Text>
              <Text style={styles.lifetimeLabel}>avg / session</Text>
            </View>
          </View>
        )}

        {/* AI insight line */}
        {insight && closedSessions.length >= 2 && (
          <Text style={styles.insightText}>{insight}</Text>
        )}
      </View>
    );
  }, [closedSessions.length, lifetimeStats, insight, currency]);

  const renderEmpty = useCallback(() => {
    return (
      <View style={styles.emptyContainer}>
        <Feather name="clock" size={40} color={CALM.border} />
        <Text style={styles.emptyTitle}>no sessions yet</Text>
        <Text style={styles.emptyHint}>
          start selling to see your history here.
        </Text>
      </View>
    );
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={closedSessions}
        renderItem={renderSessionCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews
        maxToRenderPerBatch={10}
        windowSize={5}
        initialNumToRender={10}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  listContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING['4xl'],
    gap: SPACING.md,
  },

  // ─── Header ────────────────────────────────────────────
  headerContainer: {
    marginBottom: SPACING.sm,
  },
  heading: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: SPACING.lg,
  },

  // ─── Lifetime stats ───────────────────────────────────
  lifetimeRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.lg,
  },
  lifetimeStat: {
    flex: 1,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.xs,
  },
  lifetimeNumber: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  lifetimeLabel: {
    ...TYPE.muted,
    marginTop: SPACING.xs,
  },

  // ─── Insight ───────────────────────────────────────────
  insightText: {
    ...TYPE.insight,
    color: CALM.textSecondary,
    marginBottom: SPACING.lg,
  },

  // ─── Session card ──────────────────────────────────────
  sessionCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  cardHeader: {
    gap: SPACING.xs,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  cardTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    flex: 1,
  },
  conditionBadge: {
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
  },
  conditionText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  cardDate: {
    ...TYPE.muted,
  },

  cardFooter: {
    gap: SPACING.xs,
  },
  cardRevenue: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  cardMetaText: {
    ...TYPE.muted,
    fontVariant: ['tabular-nums'],
  },
  cardMetaDot: {
    ...TYPE.muted,
  },

  // ─── Empty state ───────────────────────────────────────
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING['4xl'],
    gap: SPACING.md,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },
  emptyHint: {
    ...TYPE.muted,
    textAlign: 'center',
  },
});

export default SessionHistory;
