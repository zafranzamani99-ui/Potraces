import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  TextInput,
  Animated,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useStallStore } from '../../store/stallStore';
import { useBusinessStore } from '../../store/businessStore';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { explainStallSession } from '../../utils/explainStallSession';
import { RootStackParamList } from '../../types';

type SessionSummaryRoute = RouteProp<RootStackParamList, 'StallSessionSummary'>;

const SessionSummary: React.FC = () => {
  const route = useRoute<SessionSummaryRoute>();
  const { sessionId } = route.params;

  const { sessions, getSessionSummary, getLifetimeStats, markSessionTransferred } = useStallStore();
  const addTransfer = useBusinessStore((s) => s.addTransfer);
  const addTransferIncome = usePersonalStore((s) => s.addTransferIncome);
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();

  // Transfer bridge state
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDone, setTransferDone] = useState(false);
  const [transferSkipped, setTransferSkipped] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Find the session
  const session = useMemo(
    () => sessions.find((s) => s.id === sessionId),
    [sessions, sessionId]
  );

  const summary = useMemo(
    () => getSessionSummary(sessionId),
    [sessionId]
  );

  const lifetimeStats = useMemo(() => getLifetimeStats(), [sessions]);

  // AI insight
  const insight = useMemo(
    () => (session ? explainStallSession(session) : null),
    [session]
  );

  // Comparison to average (needs 3+ past sessions)
  const closedCount = sessions.filter((s) => !s.isActive).length;
  const comparison = useMemo(() => {
    if (closedCount < 3) return null;
    const avg = lifetimeStats.avgPerSession;
    const diff = summary.totalRevenue - avg;
    return {
      avg,
      diff,
      isAbove: diff >= 0,
    };
  }, [closedCount, lifetimeStats, summary]);

  // Pre-fill transfer amount with session revenue
  useEffect(() => {
    if (session && summary.totalRevenue > 0 && !session.transferredToPersonal) {
      setTransferAmount(summary.totalRevenue.toFixed(2));
    }
    if (session?.transferredToPersonal) {
      setTransferDone(true);
    }
  }, [session, summary.totalRevenue]);

  // Handle transfer to personal
  const handleTransfer = () => {
    if (!session) return;
    const amount = parseFloat(transferAmount);
    if (isNaN(amount) || amount <= 0) return;

    markSessionTransferred(sessionId, amount);
    const transfer = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      amount,
      fromMode: 'business' as const,
      toMode: 'personal' as const,
      note: `stall: ${session.name || format(session.startedAt, 'dd MMM')}`,
      date: new Date(),
    };
    addTransfer(transfer);
    addTransferIncome(transfer);
    setTransferDone(true);

    // Fade out after 3 seconds
    setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }, 3000);
  };

  const handleSkipTransfer = () => {
    setTransferSkipped(true);
  };

  const showTransferBridge =
    session &&
    !session.transferredToPersonal &&
    !transferDone &&
    !transferSkipped &&
    summary.totalRevenue > 0;

  // Format duration
  const formatDuration = (minutes: number): string => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  // WhatsApp share
  const handleShare = async () => {
    if (!session) return;

    const sessionLabel = session.name || 'stall session';
    const dateStr = format(
      session.closedAt || session.startedAt,
      'dd MMM yyyy'
    );

    let message = `${sessionLabel}\n${dateStr}\n`;
    message += `Total: ${currency} ${summary.totalRevenue.toFixed(2)}\n`;
    message += `Cash: ${currency} ${summary.totalCash.toFixed(2)} | QR: ${currency} ${summary.totalQR.toFixed(2)}\n`;
    message += '---\n';

    for (const product of summary.productBreakdown) {
      const unitPrice = product.qtySold > 0 ? product.revenue / product.qtySold : 0;
      message += `${product.productName}: ${product.qtySold} x ${currency}${unitPrice.toFixed(2)} = ${currency}${product.revenue.toFixed(2)}\n`;
    }

    try {
      await Share.share({
        message,
      });
    } catch {
      // User cancelled or share failed — silent
    }
  };

  // Safeguard: session not found
  if (!session) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>session not found</Text>
          <TouchableOpacity
            style={styles.doneButtonEmpty}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.doneButtonEmptyText}>go back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Session name / date */}
        {session.name ? (
          <Text style={styles.sessionName}>{session.name}</Text>
        ) : null}
        <Text style={styles.dateText}>
          {format(session.closedAt || session.startedAt, 'EEEE, dd MMM yyyy')}
        </Text>

        {/* Total revenue */}
        <Text style={styles.revenueLabel}>TOTAL REVENUE</Text>
        <Text
          style={styles.revenueAmount}
          accessibilityLabel={`Total revenue ${currency} ${summary.totalRevenue.toFixed(2)}`}
        >
          {currency} {summary.totalRevenue.toFixed(0)}
        </Text>

        {/* Duration, sale count */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Feather name="clock" size={16} color={CALM.textSecondary} />
            <Text style={styles.statText}>{formatDuration(summary.duration)}</Text>
          </View>
          <View style={styles.statItem}>
            <Feather name="shopping-bag" size={16} color={CALM.textSecondary} />
            <Text style={styles.statText}>
              {summary.saleCount} sale{summary.saleCount !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>

        {/* Cash / QR split */}
        <View style={styles.splitRow}>
          <View style={styles.splitItem}>
            <Feather name="dollar-sign" size={16} color={CALM.textSecondary} style={{ marginBottom: 4 }} />
            <Text style={styles.splitLabel}>CASH</Text>
            <Text
              style={styles.splitValue}
              accessibilityLabel={`Cash ${currency} ${summary.totalCash.toFixed(2)}`}
            >
              {currency} {summary.totalCash.toFixed(0)}
            </Text>
          </View>
          <View style={styles.splitDivider} />
          <View style={styles.splitItem}>
            <Feather name="smartphone" size={16} color={CALM.textSecondary} style={{ marginBottom: 4 }} />
            <Text style={styles.splitLabel}>QR</Text>
            <Text
              style={styles.splitValue}
              accessibilityLabel={`QR payments ${currency} ${summary.totalQR.toFixed(2)}`}
            >
              {currency} {summary.totalQR.toFixed(0)}
            </Text>
          </View>
        </View>

        {/* Product breakdown */}
        {summary.productBreakdown.length > 0 && (
          <View style={styles.breakdownSection}>
            <Text style={styles.sectionLabel}>PRODUCTS</Text>
            {summary.productBreakdown.map((product, index) => (
              <View key={`${product.productName}-${index}`} style={styles.productRow}>
                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{product.productName}</Text>
                  <Text style={styles.productQty}>
                    {product.qtySold} sold
                  </Text>
                </View>
                <Text
                  style={styles.productRevenue}
                  accessibilityLabel={`${product.productName} revenue ${currency} ${product.revenue.toFixed(2)}`}
                >
                  {currency} {product.revenue.toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* AI insight */}
        {insight && (
          <View style={styles.insightCard}>
            <Feather name="message-circle" size={14} color={CALM.textSecondary} />
            <Text style={styles.insightText}>{insight}</Text>
          </View>
        )}

        {/* Comparison to average */}
        {comparison && (
          <View style={styles.comparisonCard}>
            <Text style={styles.comparisonText}>
              {currency} {summary.totalRevenue.toFixed(0)} vs your {currency}{' '}
              {comparison.avg.toFixed(0)} average
            </Text>
          </View>
        )}

        {/* Condition tag */}
        {session.condition && (
          <View style={styles.conditionBadge}>
            <Text style={styles.conditionBadgeText}>{session.condition}</Text>
          </View>
        )}

        {/* Note */}
        {session.note && (
          <View style={styles.noteCard}>
            <Text style={styles.noteText}>{session.note}</Text>
          </View>
        )}

        {/* Transfer bridge */}
        {showTransferBridge && (
          <View style={styles.transferCard}>
            <Text style={styles.transferLabel}>TRANSFER TO PERSONAL</Text>
            <Text style={styles.transferHint}>move stall earnings to your personal wallet</Text>
            <View style={styles.transferRow}>
              <Text style={styles.transferCurrency}>{currency}</Text>
              <TextInput
                style={styles.transferInput}
                value={transferAmount}
                onChangeText={setTransferAmount}
                keyboardType="decimal-pad"
                selectTextOnFocus
                accessibilityLabel="Transfer amount"
              />
            </View>
            <TouchableOpacity
              style={styles.transferButton}
              onPress={handleTransfer}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Transfer to personal wallet"
            >
              <Text style={styles.transferButtonText}>transfer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.skipLink}
              onPress={handleSkipTransfer}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Skip transfer"
            >
              <Text style={styles.skipLinkText}>skip</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Transfer confirmation */}
        {transferDone && (
          <Animated.View style={[styles.transferConfirm, { opacity: fadeAnim }]}>
            <Feather name="check" size={16} color={CALM.positive} />
            <Text style={styles.transferConfirmText}>
              {currency} {session?.transferAmount?.toFixed(2) || transferAmount} transferred
            </Text>
          </Animated.View>
        )}

        {/* WhatsApp share */}
        <TouchableOpacity
          style={styles.shareButton}
          onPress={handleShare}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Share session summary via WhatsApp or other apps"
        >
          <Feather name="share" size={18} color={CALM.bronze} />
          <Text style={styles.shareButtonText}>share summary</Text>
        </TouchableOpacity>

        {/* Done button */}
        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Done, return to stall dashboard"
        >
          <Text style={styles.doneButtonText}>done</Text>
        </TouchableOpacity>
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

  // ─── Header ──────────────────────────────────────────────────
  sessionName: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
    marginBottom: SPACING.xs,
  },
  dateText: {
    ...TYPE.muted,
    color: CALM.textSecondary,
    marginBottom: SPACING['3xl'],
  },

  // ─── Revenue ─────────────────────────────────────────────────
  revenueLabel: {
    ...TYPE.label,
    marginBottom: SPACING.xs,
  },
  revenueAmount: {
    ...TYPE.balance,
    color: CALM.textPrimary,
    marginBottom: SPACING.xl,
    fontSize: TYPOGRAPHY.size['4xl'],
  },

  // ─── Stats row ───────────────────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.xl,
    marginBottom: SPACING['2xl'],
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  statText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },

  // ─── Cash / QR split ────────────────────────────────────────
  splitRow: {
    flexDirection: 'row',
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    marginBottom: SPACING['3xl'],
  },
  splitItem: {
    flex: 1,
    alignItems: 'center',
  },
  splitLabel: {
    ...TYPE.label,
    marginBottom: SPACING.xs,
  },
  splitValue: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  splitDivider: {
    width: 1,
    backgroundColor: CALM.border,
  },

  // ─── Product breakdown ───────────────────────────────────────
  breakdownSection: {
    marginBottom: SPACING['2xl'],
  },
  sectionLabel: {
    ...TYPE.label,
    marginBottom: SPACING.md,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
    minHeight: 44,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  productQty: {
    ...TYPE.muted,
    marginTop: 2,
  },
  productRevenue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  // ─── AI insight ──────────────────────────────────────────────
  insightCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: CALM.highlight,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  insightText: {
    ...TYPE.insight,
    color: CALM.textSecondary,
    flex: 1,
  },

  // ─── Comparison ──────────────────────────────────────────────
  comparisonCard: {
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  comparisonText: {
    ...TYPE.insight,
    color: CALM.textSecondary,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },

  // ─── Condition badge ─────────────────────────────────────────
  conditionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    borderWidth: 1,
    borderColor: withAlpha(CALM.bronze, 0.2),
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  conditionBadgeText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.bronze,
  },

  // ─── Note ────────────────────────────────────────────────────
  noteCard: {
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  noteText: {
    ...TYPE.insight,
    color: CALM.textSecondary,
    fontStyle: 'italic',
  },

  // ─── Transfer bridge ────────────────────────────────────────
  transferCard: {
    backgroundColor: withAlpha(CALM.bronze, 0.04),
    borderWidth: 1,
    borderColor: withAlpha(CALM.bronze, 0.2),
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    marginBottom: SPACING.xl,
  },
  transferLabel: {
    ...TYPE.label,
    marginBottom: SPACING.xs,
  },
  transferHint: {
    ...TYPE.muted,
    marginBottom: SPACING.lg,
  },
  transferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  transferCurrency: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },
  transferInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    fontVariant: ['tabular-nums'],
  },
  transferButton: {
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  transferButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#FFFFFF',
  },
  skipLink: {
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    minHeight: 44,
    justifyContent: 'center',
  },
  skipLinkText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },
  transferConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.xl,
  },
  transferConfirmText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.positive,
    fontVariant: ['tabular-nums'],
  },

  // ─── Actions ─────────────────────────────────────────────────
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.bronze,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    minHeight: 48,
    marginBottom: SPACING.lg,
  },
  shareButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.bronze,
  },
  doneButton: {
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  doneButtonText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#FFFFFF',
  },

  // ─── Empty state ─────────────────────────────────────────────
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING['3xl'],
  },
  emptyText: {
    ...TYPE.insight,
    color: CALM.textSecondary,
    marginBottom: SPACING.lg,
  },
  doneButtonEmpty: {
    minHeight: 44,
    justifyContent: 'center',
  },
  doneButtonEmptyText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.bronze,
  },
});

export default SessionSummary;
