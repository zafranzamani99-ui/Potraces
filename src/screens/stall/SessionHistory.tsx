/* Hallmark · redesign: receipt-tape · genre: editorial (app-locked CALM/neu system)
 * differs from prior run (QuickLogSetup hero+timeline): structure + divider language
 * One tape surface, dashed tear-lines between entries, stamp badges, typographic stats.
 * pre-emit critique: P4 H4 E4 S4 R4 V4
 */
import React, { useMemo, useCallback, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { useStallStore } from '../../store/stallStore';
import { useSettingsStore } from '../../store/settingsStore';
import { explainStallHistory } from '../../utils/explainStallHistory';
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useNeu } from '../../components/common/neu';
import PullRefresh from '../../components/common/PullRefresh';
import { useT } from '../../i18n';
import { StallSession, SessionCondition } from '../../types';

// ─── Condition stamp colors (text + hairline outline; transparent fill) ─────
const CONDITION_CONFIG: Record<SessionCondition, { label: string; bg: string; text: string }> = {
  good: { label: 'good', bg: withAlpha(CALM.bronze, 0.12), text: CALM.bronze },
  slow: { label: 'slow', bg: withAlpha(CALM.gold, 0.12), text: CALM.gold },
  rainy: { label: 'rainy', bg: withAlpha(CALM.textSecondary, 0.12), text: CALM.textSecondary },
  hot: { label: 'hot', bg: withAlpha(CALM.gold, 0.12), text: CALM.gold },
  normal: { label: 'normal', bg: CALM.border, text: CALM.textSecondary },
};

// A receipt tear-line: a row of dashes (cross-platform — Android can't dash a
// single-side border). Evenly spread so it scales to the tape's width.
const TearLine: React.FC<{ color: string }> = React.memo(({ color }) => (
  <View style={tearStyles.row} importantForAccessibility="no-hide-descendants">
    {Array.from({ length: 28 }).map((_, i) => (
      <View key={i} style={[tearStyles.dash, { backgroundColor: color }]} />
    ))}
  </View>
));
const tearStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    marginVertical: 2,
  },
  dash: { width: 6, height: 1 },
});

const SessionHistory: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const neu = useNeu(undefined, { faintDark: true });
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { sessions, getLifetimeStats, getSessionSummary } = useStallStore();
  const currency = useSettingsStore((s) => s.currency);

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  }, []);

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
  const insight = useMemo(() => explainStallHistory(closedSessions, currency), [closedSessions, currency]);
  const tearColor = withAlpha(C.textMuted, 0.45);

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

  // ─── One tape entry per session; a tear-line separates it from the next ───
  const renderSessionEntry = useCallback(
    ({ item, index }: { item: StallSession; index: number }) => {
      const summary = getSessionSummary(item.id);
      const displayName = item.name || formatSessionDate(item);
      const condition = item.condition ? CONDITION_CONFIG[item.condition] : undefined;

      return (
        <View>
          <TouchableOpacity
            style={styles.entry}
            onPress={() => handleSessionPress(item.id)}
            activeOpacity={0.7}
            accessibilityLabel={`Session ${displayName}, total came in ${currency} ${item.totalRevenue.toFixed(2)}, ${summary.saleCount} sales`}
            accessibilityHint="Tap to view session details"
            accessibilityRole="button"
          >
            <View style={styles.entryTitleRow}>
              <Text style={styles.entryTitle} numberOfLines={1}>
                {displayName}
              </Text>
              {condition && (
                <View style={[styles.stamp, { borderColor: withAlpha(condition.text, 0.55) }]}>
                  <Text style={[styles.stampText, { color: condition.text }]}>
                    {condition.label.toUpperCase()}
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.entryDate}>
              {formatSessionDate(item)}
              {'  ·  '}
              {formatDuration(summary.duration)}
            </Text>

            <View style={styles.entryBottomRow}>
              <Text
                style={styles.entryAmount}
                accessibilityLabel={`Came in ${currency} ${item.totalRevenue.toFixed(2)}`}
              >
                {currency} {item.totalRevenue.toFixed(0)}
              </Text>
              <Text style={styles.entryMeta} numberOfLines={1}>
                {summary.saleCount === 1
                  ? t.stallHistory.nSales.replace('{n}', '1')
                  : t.stallHistory.nSalesPlural.replace('{n}', String(summary.saleCount))}
                {' · '}
                {t.stallHistory.cash} {currency} {item.totalCash.toFixed(0)}
                {' · '}
                {t.stallHistory.qr} {currency} {item.totalQR.toFixed(0)}
              </Text>
            </View>
          </TouchableOpacity>
          {index < closedSessions.length - 1 && <TearLine color={tearColor} />}
        </View>
      );
    },
    [currency, closedSessions.length, getSessionSummary, handleSessionPress, styles, tearColor, t],
  );

  // ─── Tape head: the register-receipt totals block (bare type, hairline rules) ───
  const renderTapeHead = useCallback(() => {
    const showSummary = closedSessions.length >= 3;
    const showInsight = insight && closedSessions.length >= 2;
    if (!showSummary && !showInsight) return null;
    return (
      <View>
        {showSummary && (
          <View style={styles.summaryRow}>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryNumber}>{lifetimeStats.totalSessions}</Text>
              <Text style={styles.summaryLabel}>{t.stallHistory.sessions.toUpperCase()}</Text>
            </View>
            <View style={styles.summaryRule} />
            <View style={styles.summaryStat}>
              <Text style={styles.summaryNumber}>
                {currency} {lifetimeStats.totalRevenue.toFixed(0)}
              </Text>
              <Text style={styles.summaryLabel}>{t.stallHistory.lifetimeCameIn.toUpperCase()}</Text>
            </View>
            <View style={styles.summaryRule} />
            <View style={styles.summaryStat}>
              <Text style={styles.summaryNumber}>
                {currency} {lifetimeStats.avgPerSession.toFixed(0)}
              </Text>
              <Text style={styles.summaryLabel}>{t.stallHistory.avgPerSession.toUpperCase()}</Text>
            </View>
          </View>
        )}
        {showSummary && <View style={styles.headRule} />}
        {showInsight && <Text style={styles.insightText}>{insight}</Text>}
        <TearLine color={tearColor} />
      </View>
    );
  }, [closedSessions.length, lifetimeStats, insight, currency, styles, tearColor, t]);

  const renderEmpty = useCallback(() => {
    return (
      <View style={styles.emptyContainer}>
        <Feather name="clock" size={40} color={C.border} />
        <Text style={styles.emptyTitle}>{t.stallHistory.emptyTitle}</Text>
        <Text style={styles.emptyHint}>
          {t.stallHistory.emptyHint}
        </Text>
      </View>
    );
  }, [C, styles, t]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.pagePad}>
        <Text style={styles.heading}>{t.stallHistory.heading}</Text>
        {/* The tape: ONE surface holds the whole history. neu shadow lives on
            the unclipped wrapper; the inner view clips the tape to its radius. */}
        <View style={[styles.tapeShadow, neu.raisedSoft]}>
          <View style={styles.tapeClip}>
            <PullRefresh refreshing={refreshing} onRefresh={onRefresh} tintColor={C.bronze}>
              <FlatList
                style={{ flex: 1 }}
                data={closedSessions}
                renderItem={renderSessionEntry}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, SPACING.md) }}
                ListHeaderComponent={renderTapeHead}
                ListEmptyComponent={renderEmpty}
                showsVerticalScrollIndicator={false}
                removeClippedSubviews
                maxToRenderPerBatch={10}
                windowSize={5}
                initialNumToRender={10}
              />
            </PullRefresh>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  pagePad: {
    flex: 1,
    padding: SPACING.lg,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
  },
  heading: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
    marginBottom: SPACING.lg,
  },

  // ─── The tape surface ──────────────────────────────────
  tapeShadow: {
    flex: 1,
    borderRadius: RADIUS.lg,
  },
  tapeClip: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    overflow: 'hidden' as const,
  },

  // ─── Tape head: register-tape totals (no tiles, no icons) ───
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
    paddingHorizontal: SPACING.lg,
  },
  summaryStat: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  summaryRule: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginVertical: 2,
  },
  summaryNumber: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    letterSpacing: 1.1,
    textAlign: 'center' as const,
  },
  headRule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.border,
    marginHorizontal: SPACING.lg,
  },

  // ─── Insight — the clerk's margin note ────────────────
  insightText: {
    ...TYPE.insight,
    fontStyle: 'italic',
    color: C.textSecondary,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },

  // ─── Tape entry (one session) ──────────────────────────
  entry: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    gap: 3,
  },
  entryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  entryTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    flex: 1,
  },
  // Rubber-stamp badge: hairline outline, slight tilt, no fill.
  stamp: {
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    transform: [{ rotate: '-3deg' }],
  },
  stampText: {
    fontSize: 9,
    fontWeight: TYPOGRAPHY.weight.bold,
    letterSpacing: 1.2,
  },
  entryDate: {
    ...TYPE.muted,
  },
  entryBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: SPACING.md,
    marginTop: SPACING.sm,
  },
  entryAmount: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  entryMeta: {
    ...TYPE.muted,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
    textAlign: 'right' as const,
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
    color: C.textSecondary,
  },
  emptyHint: {
    ...TYPE.muted,
    textAlign: 'center',
  },
});

export default SessionHistory;
