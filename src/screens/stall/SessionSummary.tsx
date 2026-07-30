import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  TextInput,
  Animated,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useSubmitGuard } from '../../hooks/useSubmitGuard';
import { useStallStore } from '../../store/stallStore';
import { useBusinessStore } from '../../store/businessStore';
import { usePersonalStore } from '../../store/personalStore';
import { useWalletStore } from '../../store/walletStore';
import { useSettingsStore } from '../../store/settingsStore';
import { explainStallSession } from '../../utils/explainStallSession';
import { RootStackParamList } from '../../types';
import { useT } from '../../i18n';
import BusinessHeroNumber from '../../components/business/BusinessHeroNumber';
import WalletPicker from '../../components/common/WalletPicker';
import { newstOutline } from '../../components/business/NewstInput';
import { useNeu } from '../../components/common/neu';
import NeuButton from '../../components/common/NeuButton';

type SessionSummaryRoute = RouteProp<RootStackParamList, 'StallSessionSummary'>;

const SessionSummary: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const neu = useNeu(undefined, { faintDark: true });
  const route = useRoute<SessionSummaryRoute>();
  const { sessionId } = route.params;

  const { sessions, getSessionSummary, getLifetimeStats, getSessionEconomics, markSessionTransferred } = useStallStore();
  const addTransfer = useBusinessStore((s) => s.addTransfer);
  const addTransferIncome = usePersonalStore((s) => s.addTransferIncome);
  const wallets = useWalletStore((s) => s.wallets);
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();

  // Transfer bridge state
  const [transferAmount, setTransferAmount] = useState('');
  const [transferDone, setTransferDone] = useState(false);
  const [transferSkipped, setTransferSkipped] = useState(false);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Destination wallet for the transfer — defaults to the user's default wallet.
  const defaultWalletId = useMemo(
    () => wallets.find((w) => w.isDefault)?.id ?? wallets[0]?.id ?? null,
    [wallets]
  );
  const effectiveWalletId = walletId ?? defaultWalletId;

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

  // Optional economics (kept + cash reconciliation)
  const econ = useMemo(() => getSessionEconomics(sessionId), [sessionId, sessions]);

  // AI insight
  const insight = useMemo(
    () => (session ? explainStallSession(session, currency) : null),
    [session, currency]
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

  // Pre-fill transfer amount with what you KEPT (revenue − goods cost − expenses),
  // not the gross came-in — gross still holds the float you seeded + COGS to restock.
  // When no costs are set, kept === revenue, so this matches the old behaviour.
  useEffect(() => {
    if (session && summary.totalRevenue > 0 && !session.transferredToPersonal) {
      setTransferAmount(Math.max(0, econ.kept).toFixed(2));
    }
    if (session?.transferredToPersonal) {
      setTransferDone(true);
    }
  }, [session, summary.totalRevenue, econ.kept]);

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
      // Credit the chosen personal wallet. addTransferIncome owns the wallet
      // adjustment (single-owner); the transfer- id keeps it out of income math.
      ...(effectiveWalletId ? { walletId: effectiveWalletId } : {}),
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

  const guardedTransfer = useSubmitGuard(handleTransfer);

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

    const sessionLabel = session.name || t.stall.stallSessionFallback;
    const dateStr = format(
      session.closedAt || session.startedAt,
      'dd MMM yyyy'
    );

    let message = `${sessionLabel}\n${dateStr}\n`;
    message += `${t.stall.totalLine}: ${currency} ${summary.totalRevenue.toFixed(2)}\n`;
    message += `${t.stall.cashLine}: ${currency} ${summary.totalCash.toFixed(2)} | ${t.stall.qrLine}: ${currency} ${summary.totalQR.toFixed(2)}`;
    message += summary.totalCard > 0 ? ` | ${t.tapToPay.card}: ${currency} ${summary.totalCard.toFixed(2)}\n` : '\n';
    message += '---\n';

    for (const product of summary.productBreakdown) {
      const unitPrice = product.qtySold > 0 ? product.revenue / product.qtySold : 0;
      const productCameIn = product.revenue;
      message += `${product.productName}: ${product.qtySold} x ${currency}${unitPrice.toFixed(2)} = ${currency}${productCameIn.toFixed(2)}\n`;
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
          <Text style={styles.emptyText}>{t.stall.sessionNotFound}</Text>
          <TouchableOpacity
            style={styles.doneButtonEmpty}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Text style={styles.doneButtonEmptyText}>{t.stall.goBack}</Text>
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

        {/* Total came in — canonical hero number */}
        <View style={styles.heroWrap}>
          <BusinessHeroNumber
            amount={summary.totalRevenue}
            label={t.stall.cameInLabel}
            prefix={currency}
            animated={false}
          />
        </View>

        {/* Duration, sale count */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Feather name="clock" size={16} color={C.textSecondary} />
            <Text style={styles.statText}>{formatDuration(summary.duration)}</Text>
          </View>
          <View style={styles.statItem}>
            <Feather name="shopping-bag" size={16} color={C.textSecondary} />
            <Text style={styles.statText}>
              {summary.saleCount} {summary.saleCount !== 1 ? t.stall.salesLabel : t.stall.saleLabel}
            </Text>
          </View>
        </View>

        {/* Cash / QR split */}
        <View style={[styles.splitRow, neu.raisedSoft]}>
          <View style={styles.splitItem}>
            <Feather name="dollar-sign" size={16} color={C.textSecondary} style={{ marginBottom: 4 }} />
            <Text style={styles.splitLabel}>{t.stall.cashLabelCaps}</Text>
            <Text
              style={styles.splitValue}
              accessibilityLabel={`Cash came in ${currency} ${summary.totalCash.toFixed(2)}`}
            >
              {currency} {summary.totalCash.toFixed(0)}
            </Text>
          </View>
          <View style={styles.splitDivider} />
          <View style={styles.splitItem}>
            <Feather name="smartphone" size={16} color={C.textSecondary} style={{ marginBottom: 4 }} />
            <Text style={styles.splitLabel}>{t.stall.qrLabelCaps}</Text>
            <Text
              style={styles.splitValue}
              accessibilityLabel={`QR came in ${currency} ${summary.totalQR.toFixed(2)}`}
            >
              {currency} {summary.totalQR.toFixed(0)}
            </Text>
          </View>
          {summary.totalCard > 0 && (
            <>
              <View style={styles.splitDivider} />
              <View style={styles.splitItem}>
                <Feather name="wifi" size={16} color={C.textSecondary} style={{ marginBottom: 4 }} />
                <Text style={styles.splitLabel}>{t.tapToPay.card}</Text>
                <Text
                  style={styles.splitValue}
                  accessibilityLabel={`Card came in ${currency} ${summary.totalCard.toFixed(2)}`}
                >
                  {currency} {summary.totalCard.toFixed(0)}
                </Text>
              </View>
            </>
          )}
        </View>

        {/* What you kept — only when costs were entered */}
        {econ.hasCosts && (
          <View style={[styles.keptCard, neu.raisedSoft, { backgroundColor: withAlpha(C.bronze, 0.04) }]}>
            <Text style={styles.sectionLabel}>{t.stall.keptHeading}</Text>
            <View style={styles.keptRow}>
              <Text style={styles.keptRowLabel}>{t.stall.cameInRow}</Text>
              <Text style={styles.keptRowValue}>{currency} {econ.revenue.toFixed(2)}</Text>
            </View>
            {econ.cogs > 0 && (
              <View style={styles.keptRow}>
                <Text style={styles.keptRowLabelMuted}>{t.stall.goodsCostRow}</Text>
                <Text style={styles.keptRowValueMuted}>−{currency} {econ.cogs.toFixed(2)}</Text>
              </View>
            )}
            {econ.expensesTotal > 0 && (
              <View style={styles.keptRow}>
                <Text style={styles.keptRowLabelMuted}>{t.stall.moneyOutRow}</Text>
                <Text style={styles.keptRowValueMuted}>−{currency} {econ.expensesTotal.toFixed(2)}</Text>
              </View>
            )}
            <View style={[styles.keptRow, styles.keptRowFinal]}>
              <Text style={styles.keptFinalLabel}>{t.stall.keptRow}</Text>
              <Text style={styles.keptFinalValue}>{econ.keptIsApprox ? '~' : ''}{currency} {econ.kept.toFixed(2)}</Text>
            </View>
            {econ.keptIsApprox && (
              <Text style={{ fontSize: 11, color: C.textMuted, textAlign: 'right', marginTop: 4, fontStyle: 'italic' }}>
                {t.stall.keptApproxNote}
              </Text>
            )}
          </View>
        )}

        {/* Cash box reconciliation — only when the box was counted */}
        {econ.hasCounted && (
          <View style={[styles.reconcileCard, neu.raisedSoft]}>
            <Text style={styles.sectionLabel}>{t.stall.cashBoxHeading}</Text>
            <View style={styles.reconcileRow}>
              <Text style={styles.reconcileLabel}>{t.stall.expectedLabel}</Text>
              <Text style={styles.reconcileValue}>{currency} {econ.expectedCash.toFixed(2)}</Text>
            </View>
            <View style={styles.reconcileRow}>
              <Text style={styles.reconcileLabel}>{t.stall.countedLabel}</Text>
              <Text style={styles.reconcileValue}>{currency} {(econ.countedCash ?? 0).toFixed(2)}</Text>
            </View>
            <View style={[styles.reconcileRow, styles.reconcileRowFinal]}>
              <Text style={styles.reconcileDiffLabel}>{t.stall.differenceLabel}</Text>
              <Text style={styles.reconcileDiffValue}>
                {(econ.cashDifference ?? 0) === 0
                  ? t.stall.cashMatches
                  : (econ.cashDifference ?? 0) > 0
                  ? t.stall.overBy.replace('{currency}', currency).replace('{amount}', Math.abs(econ.cashDifference ?? 0).toFixed(2))
                  : t.stall.shortBy.replace('{currency}', currency).replace('{amount}', Math.abs(econ.cashDifference ?? 0).toFixed(2))}
              </Text>
            </View>
          </View>
        )}

        {/* Product breakdown */}
        {summary.productBreakdown.length > 0 && (
          <View style={styles.breakdownSection}>
            <Text style={styles.sectionLabel}>{t.stall.productsLabel}</Text>
            {summary.productBreakdown.map((product, index) => {
              const productCameIn = product.revenue;
              return (
                <View key={`${product.productName}-${index}`} style={styles.productRow}>
                  <View style={styles.productInfo}>
                    <Text style={styles.productName}>{product.productName}</Text>
                    <Text style={styles.productQty}>
                      {product.qtySold} {t.stall.soldLabel}
                    </Text>
                  </View>
                  <Text
                    style={styles.productCameIn}
                    accessibilityLabel={`${product.productName} came in ${currency} ${productCameIn.toFixed(2)}`}
                  >
                    {currency} {productCameIn.toFixed(2)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* AI insight */}
        {insight && (
          <View style={styles.insightCard}>
            <Feather name="message-circle" size={14} color={C.textSecondary} />
            <Text style={styles.insightText}>{insight}</Text>
          </View>
        )}

        {/* Comparison to average came-in */}
        {comparison && (
          <View style={[styles.comparisonCard, neu.raisedSoft]}>
            <Text style={styles.comparisonText}>
              {t.stall.cameInVsAverage
                .replace('{curr}', currency)
                .replace('{amount}', summary.totalRevenue.toFixed(0))
                .replace('{curr2}', currency)
                .replace('{avg}', comparison.avg.toFixed(0))}
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
          <View style={[styles.noteCard, neu.raisedSoft]}>
            <Text style={styles.noteText}>{session.note}</Text>
          </View>
        )}

        {/* Transfer bridge */}
        {showTransferBridge && (
          <View style={[styles.transferCard, neu.raisedSoft, { backgroundColor: withAlpha(C.bronze, 0.04) }]}>
            <Text style={styles.transferLabel}>{t.stall.transferToPersonal}</Text>
            <Text style={styles.transferHint}>{t.stall.transferHint}</Text>
            {wallets.length > 0 && (
              <WalletPicker
                wallets={wallets}
                selectedId={effectiveWalletId}
                onSelect={setWalletId}
                label={t.stall.transferWalletLabel}
                faintNeu
                onyxTrigger
              />
            )}
            <View style={[styles.transferRow, newstOutline(C, focusedField === 'transfer')]}>
              <Text style={styles.transferCurrency}>{currency}</Text>
              <TextInput
                style={styles.transferInput}
                value={transferAmount}
                onChangeText={setTransferAmount}
                keyboardType="decimal-pad"
                selectTextOnFocus
                onFocus={() => setFocusedField('transfer')}
                onBlur={() => setFocusedField((f) => (f === 'transfer' ? null : f))}
                accessibilityLabel="Transfer amount"
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={withAlpha(C.accent, 0.25)}
              />
            </View>
            <NeuButton
              icon="arrow-up-right"
              label={t.stall.transferButton}
              color={C.bronze}
              onPress={guardedTransfer}
              accessibilityLabel="Transfer to personal wallet"
            />
            <TouchableOpacity
              style={styles.skipLink}
              onPress={handleSkipTransfer}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Skip transfer"
            >
              <Text style={styles.skipLinkText}>{t.stall.skip}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Transfer confirmation */}
        {transferDone && (
          <Animated.View style={[styles.transferConfirm, { opacity: fadeAnim }]}>
            <Feather name="check" size={16} color={C.positive} />
            <Text style={styles.transferConfirmText}>
              {currency} {session?.transferAmount?.toFixed(2) || transferAmount} {t.stall.transferredSuffix}
            </Text>
          </Animated.View>
        )}

        {/* WhatsApp share */}
        <TouchableOpacity
          style={[styles.shareButton, neu.raisedSoft]}
          onPress={handleShare}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Share session summary via WhatsApp or other apps"
        >
          <Feather name="share" size={18} color={C.bronze} />
          <Text style={styles.shareButtonText}>{t.stall.shareSummary}</Text>
        </TouchableOpacity>

        {/* Done button */}
        <NeuButton
          icon="check"
          label={t.stall.done}
          color={C.bronze}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Done, return to stall dashboard"
        />
      </ScrollView>
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING['2xl'],
    paddingBottom: SPACING['4xl'],
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
  },

  // ─── Header ──────────────────────────────────────────────────
  sessionName: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    marginBottom: SPACING.xs,
  },
  dateText: {
    ...TYPE.muted,
    color: C.textSecondary,
    marginBottom: SPACING['3xl'],
  },

  // ─── Came in (hero) ──────────────────────────────────────────
  heroWrap: {
    marginBottom: SPACING.xl,
    alignItems: 'center',
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
    color: C.textSecondary,
  },

  // ─── Cash / QR split ────────────────────────────────────────
  splitRow: {
    flexDirection: 'row',
    backgroundColor: C.background,
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
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  splitDivider: {
    width: 1,
    backgroundColor: C.border,
  },

  // ─── Product breakdown ───────────────────────────────────────
  breakdownSection: {
    marginBottom: SPACING['2xl'],
  },
  sectionLabel: {
    ...TYPE.label,
    marginBottom: SPACING.md,
  },

  // ─── Kept (net) card ─────────────────────────────────────────
  keptCard: {
    backgroundColor: withAlpha(C.bronze, 0.04),
    borderWidth: 1,
    borderColor: withAlpha(C.bronze, 0.15),
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    marginBottom: SPACING['2xl'],
  },
  keptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  keptRowLabel: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textSecondary,
  },
  keptRowValue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  keptRowLabelMuted: {
    ...TYPE.muted,
  },
  keptRowValueMuted: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  keptRowFinal: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: withAlpha(C.bronze, 0.2),
  },
  keptFinalLabel: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  keptFinalValue: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.bronze,
    fontVariant: ['tabular-nums'],
  },

  // ─── Cash reconciliation card ────────────────────────────────
  reconcileCard: {
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    marginBottom: SPACING['2xl'],
  },
  reconcileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  reconcileLabel: {
    ...TYPE.muted,
  },
  reconcileValue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  reconcileRowFinal: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  reconcileDiffLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  reconcileDiffValue: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.bronze,
    fontVariant: ['tabular-nums'],
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    minHeight: 44,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  productQty: {
    ...TYPE.muted,
    marginTop: 2,
  },
  productCameIn: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },

  // ─── AI insight ──────────────────────────────────────────────
  insightCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: C.highlight,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  insightText: {
    ...TYPE.insight,
    color: C.textSecondary,
    flex: 1,
  },

  // ─── Comparison ──────────────────────────────────────────────
  comparisonCard: {
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  comparisonText: {
    ...TYPE.insight,
    color: C.textSecondary,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },

  // ─── Condition badge ─────────────────────────────────────────
  conditionBadge: {
    alignSelf: 'flex-start',
    backgroundColor: withAlpha(C.bronze, 0.08),
    borderWidth: 1,
    borderColor: withAlpha(C.bronze, 0.2),
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  conditionBadgeText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
  },

  // ─── Note ────────────────────────────────────────────────────
  noteCard: {
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  noteText: {
    ...TYPE.insight,
    color: C.textSecondary,
    fontStyle: 'italic',
  },

  // ─── Transfer bridge ────────────────────────────────────────
  transferCard: {
    backgroundColor: withAlpha(C.bronze, 0.04),
    borderWidth: 1,
    borderColor: withAlpha(C.bronze, 0.2),
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
    paddingHorizontal: SPACING.md,
  },
  transferCurrency: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  transferInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
    paddingVertical: SPACING.sm,
    fontVariant: ['tabular-nums'],
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
    color: C.textSecondary,
  },
  transferConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.xl,
  },
  transferConfirmText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.positive,
    fontVariant: ['tabular-nums'],
  },

  // ─── Actions ─────────────────────────────────────────────────
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.bronze,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    minHeight: 48,
    marginBottom: SPACING.lg,
  },
  shareButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
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
    color: C.textSecondary,
    marginBottom: SPACING.lg,
  },
  doneButtonEmpty: {
    minHeight: 44,
    justifyContent: 'center',
  },
  doneButtonEmptyText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },
});

export default SessionSummary;
