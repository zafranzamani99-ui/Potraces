// ─── MY PLAN ────────────────────────────────────────────────────────────
// Per-tier usage + upgrade screen. The whole point vs the old free-only card:
// caps come from TIER_LIMITS[the user's OWN tier], so a paid user finally sees
// "42/300" instead of nothing. Reached via "See my plan" in SubscriptionCard.
//
// Onyx / Neu Card per CLAUDE.md: C.background surfaces, no container outlines,
// faintDark neu raisedSoft cards, no overflow:'hidden' near a neu shadow.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import NeuButton from '../../components/common/NeuButton';
import PaywallModal from '../../components/common/PaywallModal';
import { useNeu } from '../../components/common/neu';
import { usePremiumStore } from '../../store/premiumStore';
import { useWalletStore } from '../../store/walletStore';
import { usePersonalStore } from '../../store/personalStore';
import { useSavingsStore } from '../../store/savingsStore';
import { useDebtStore } from '../../store/debtStore';
import { TIER_LIMITS } from '../../constants/tiers';
import { countSessionsCreatedThisWeek } from '../../services/collectzService';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha, TERMS_URL, PRIVACY_URL } from '../../constants';
import { isBillingConfigured, restorePurchases } from '../../services/billing';
import { useToast } from '../../context/ToastContext';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import type { PremiumTier } from '../../types';

// Upgrade ladder — premium has nowhere to go, so it maps to nothing.
const NEXT_TIER: Partial<Record<PremiumTier, PremiumTier>> = {
  free: 'basic',
  basic: 'pro',
  pro: 'premium',
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const MyPlan: React.FC = () => {
  const C = useCalm();
  const styles = React.useMemo(() => makeStyles(C), [C]);
  const neu = useNeu(undefined, { faintDark: true });
  const { showToast } = useToast();
  const t = useT();

  const tier = usePremiumStore((s) => s.tier);
  const scanCount = usePremiumStore((s) => s.scanCount);
  const aiCallsCount = usePremiumStore((s) => s.aiCallsCount);
  const walletCount = useWalletStore((s) => s.wallets.length);
  const budgetCount = usePersonalStore((s) => s.budgets.length);
  const goalCount = usePersonalStore((s) => s.goals.length);
  const savingsCount = useSavingsStore((s) => s.accounts.length);
  const sharedSubCount = useDebtStore((s) => s.sharedSubscriptions.length);

  const limits = TIER_LIMITS[tier];

  // Stale-counter fix: roll the monthly windows forward BEFORE displaying, so a
  // new month never shows last month's scan/AI counts. Same public API the
  // canScanReceipt/canUseAI gates use — the store is untouched.
  React.useEffect(() => {
    const s = usePremiumStore.getState();
    s.resetScanCountIfNeeded();
    s.resetAiCallsIfNeeded();
  }, []);

  // Collectz creations this week — server count; null = loading ('—'), and a
  // REJECTED call (e.g. signed out, no Collectz identity) hides the row entirely.
  const [collectzCount, setCollectzCount] = React.useState<number | null>(null);
  const [collectzUnavailable, setCollectzUnavailable] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    countSessionsCreatedThisWeek()
      .then((n) => { if (alive) setCollectzCount(n); })
      .catch(() => { if (alive) setCollectzUnavailable(true); });
    return () => { alive = false; };
  }, []);

  const [paywallOpen, setPaywallOpen] = React.useState(false);

  // Same restore handler as SubscriptionCard — Apple wants Restore reachable
  // wherever the subscription is presented. No-op while billing is dormant.
  const handleRestore = async () => {
    if (!isBillingConfigured()) return;
    try {
      const ok = await restorePurchases();
      showToast(ok ? t.settings.restoreDone : t.settings.restoreNone, ok ? 'success' : 'info');
    } catch {
      showToast(t.settings.restoreFailed, 'error');
    }
  };

  const nextTier = NEXT_TIER[tier];

  const renderUsageRow = (
    icon: keyof typeof Feather.glyphMap,
    label: string,
    used: number | null,
    cap: number,
  ) => {
    const loading = used === null;
    const unlimited = cap === Infinity;
    const pct = loading || unlimited ? 0 : Math.min(1, cap > 0 ? used / cap : 1);
    return (
      <View style={styles.usageRow} key={label}>
        <View style={styles.usageTop}>
          <View style={styles.usageLabelRow}>
            <Feather name={icon} size={16} color={C.textSecondary} />
            <Text style={styles.usageLabel}>{label}</Text>
          </View>
          <Text style={styles.usageValue}>
            {loading ? '—' : unlimited ? t.settings.myPlanUnlimited : `${used}/${cap}`}
          </Text>
        </View>
        {/* Meter — flat by design (not a tappable): faint track + accent fill. */}
        {!unlimited && (
          <View style={styles.meterTrack}>
            <View style={[styles.meterFill, { width: `${pct * 100}%` }]} />
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Tier header card ── */}
        <View style={[styles.card, neu.raisedSoft]}>
          <Text style={styles.yourPlanLabel}>{t.settings.myPlanYourPlan}</Text>
          <View style={styles.tierBadge}>
            <Feather name="award" size={14} color={C.onAccent} />
            <Text style={styles.tierBadgeText}>
              {tier === 'free' ? 'Free plan' : capitalize(tier)}
            </Text>
          </View>
        </View>

        {/* ── Usage card — every limit for the user's OWN tier ── */}
        <View style={[styles.card, neu.raisedSoft]}>
          {renderUsageRow('credit-card', t.settings.walletsUsage, walletCount, limits.maxWallets)}
          {renderUsageRow('pie-chart', t.settings.budgetsUsage, budgetCount, limits.maxBudgets)}
          {renderUsageRow('trending-up', t.settings.savingsUsage, savingsCount, limits.maxSavingsAccounts)}
          {renderUsageRow('target', t.settings.goalsUsage, goalCount, limits.maxGoals)}
          {renderUsageRow('repeat', t.settings.sharedSubsUsage, sharedSubCount, limits.maxSharedSubs)}
          {!collectzUnavailable &&
            renderUsageRow('users', t.settings.collectzWeekUsage, collectzCount, limits.maxCollectzSessionsPerWeek)}
          {renderUsageRow('camera', t.settings.scansThisMonth, scanCount, limits.maxScansPerMonth)}
          {renderUsageRow('cpu', t.settings.aiCallsThisMonth, aiCallsCount, limits.maxAiCallsPerMonth)}
        </View>

        {/* ── Upgrade path — one rung up the ladder; premium has none ── */}
        {nextTier && (
          <NeuButton
            label={t.settings.myPlanUpgradeNext.replace('{tier}', capitalize(nextTier))}
            icon="award"
            onPress={() => setPaywallOpen(true)}
            style={styles.upgradeBtn}
          />
        )}

        {/* ── Restore + legal — same trio as SubscriptionCard / paywall footer ── */}
        <View style={styles.legalRow}>
          <TouchableOpacity onPress={handleRestore} accessibilityRole="button">
            <Text style={styles.legalLink}>{t.settings.restorePurchases}</Text>
          </TouchableOpacity>
          <Text style={styles.legalDot}>·</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}
            accessibilityRole="link"
            accessibilityLabel={t.settings.termsOfUse}
          >
            <Text style={styles.legalLink}>{t.settings.termsOfUse}</Text>
          </TouchableOpacity>
          <Text style={styles.legalDot}>·</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}
            accessibilityRole="link"
            accessibilityLabel={t.settings.privacyPolicy}
          >
            <Text style={styles.legalLink}>{t.settings.privacyPolicy}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <PaywallModal
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        feature="ai"
      />
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
    padding: SPACING.lg,
    paddingBottom: SPACING.xl * 2,
  },
  // Neu Card: C.background base + raisedSoft, no outline, no overflow.
  card: {
    borderRadius: RADIUS.lg,
    backgroundColor: C.background,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  yourPlanLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: SPACING.sm,
  },
  tierBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
    backgroundColor: C.accent,
  },
  tierBadgeText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.onAccent,
  },
  usageRow: {
    paddingVertical: SPACING.sm,
  },
  usageTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  usageLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    flexShrink: 1,
  },
  usageLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  usageValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  meterTrack: {
    height: 5,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textPrimary, 0.08),
    marginTop: SPACING.xs + 2,
  },
  meterFill: {
    height: '100%',
    borderRadius: RADIUS.full,
    backgroundColor: C.accent,
  },
  upgradeBtn: {
    marginBottom: SPACING.md,
  },
  legalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    rowGap: SPACING.xs,
    paddingTop: SPACING.md,
  },
  legalLink: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  legalDot: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },
});

export default MyPlan;
