import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Card from '../common/Card';
import NeuButton from '../common/NeuButton';
import PaywallModal from '../common/PaywallModal';
import { usePremiumStore } from '../../store/premiumStore';
import { useWalletStore } from '../../store/walletStore';
import { usePersonalStore } from '../../store/personalStore';
import { FREE_TIER } from '../../constants/premium';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha, TERMS_URL, PRIVACY_URL } from '../../constants';
import { isBillingConfigured, restorePurchases } from '../../services/billing';
import { useToast } from '../../context/ToastContext';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';

/**
 * Premium status + free-tier usage card, shared by Personal and Business hubs.
 * Premium (scans / AI) is account-wide, so both modes show it. Wallet/budget
 * usage is personal-only, so the `variant` prop hides those rows in business —
 * showing personal counts in business mode would be misleading.
 *
 * The "Upgrade" CTA opens the shared PaywallModal (the single source of pricing
 * truth — 3 tiers, cloud-backup promise) rather than instantly subscribing at a
 * hardcoded price. The paywall's Continue does the actual unlock.
 */
const SubscriptionCard: React.FC<{ variant: 'personal' | 'business' }> = ({ variant }) => {
  const C = useCalm();
  const styles = React.useMemo(() => makeStyles(C), [C]);
  const { showToast } = useToast();
  const t = useT();

  const [paywallOpen, setPaywallOpen] = React.useState(false);

  const tier = usePremiumStore((s) => s.tier);
  const unsubscribe = usePremiumStore((s) => s.unsubscribe);
  const scanCount = usePremiumStore((s) => s.scanCount);
  const aiCallsCount = usePremiumStore((s) => s.aiCallsCount);
  const walletCount = useWalletStore((s) => s.wallets.length);
  const budgetCount = usePersonalStore((s) => s.budgets.length);

  // Restore Purchases — Apple requires it reachable outside the paywall. No-op while billing
  // is dormant (dev); once RevenueCat is live it re-applies any active entitlement.
  const handleRestore = async () => {
    if (!isBillingConfigured()) return;
    try {
      const ok = await restorePurchases();
      showToast(ok ? t.settings.restoreDone : t.settings.restoreNone, ok ? 'success' : 'info');
    } catch {
      showToast(t.settings.restoreFailed, 'error');
    }
  };

  return (
    <>
      <Card style={styles.card}>
        {tier !== 'free' ? (
          <View style={[styles.premiumStatusRow, { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md }]}>
            <View style={styles.premiumBadge}>
              <Feather name="award" size={14} color={C.onAccent} />
              <Text style={styles.premiumBadgeText}>{tier.charAt(0).toUpperCase() + tier.slice(1)}</Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  t.settings.unsubscribe,
                  t.settings.unsubscribeConfirm,
                  [
                    { text: t.settings.keepPremium, style: 'cancel' },
                    {
                      text: t.settings.unsubscribe,
                      style: 'destructive',
                      onPress: () => {
                        unsubscribe();
                        showToast(t.settings.subscriptionCancelled, 'success');
                      },
                    },
                  ]
                );
              }}
            >
              <Text style={styles.unsubscribeText}>{t.settings.cancelSubscription}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md }}>
            <View style={styles.usageLimits}>
              {variant === 'personal' && (
                <>
                  <View style={styles.usageRow}>
                    <View style={styles.settingLabelRow}>
                      <Feather name="credit-card" size={16} color={C.textSecondary} />
                      <Text style={styles.usageLabel}>{t.settings.walletsUsage}</Text>
                    </View>
                    <Text style={styles.usageValue}>{walletCount}/{FREE_TIER.maxWallets}</Text>
                  </View>
                  <View style={styles.usageRow}>
                    <View style={styles.settingLabelRow}>
                      <Feather name="pie-chart" size={16} color={C.textSecondary} />
                      <Text style={styles.usageLabel}>{t.settings.budgetsUsage}</Text>
                    </View>
                    <Text style={styles.usageValue}>{budgetCount}/{FREE_TIER.maxBudgets}</Text>
                  </View>
                </>
              )}
              <View style={styles.usageRow}>
                <View style={styles.settingLabelRow}>
                  <Feather name="camera" size={16} color={C.textSecondary} />
                  <Text style={styles.usageLabel}>{t.settings.scansThisMonth}</Text>
                </View>
                <Text style={styles.usageValue}>{scanCount}/{FREE_TIER.maxScansPerMonth}</Text>
              </View>
              <View style={styles.usageRow}>
                <View style={styles.settingLabelRow}>
                  <Feather name="cpu" size={16} color={C.textSecondary} />
                  <Text style={styles.usageLabel}>{t.settings.aiCallsThisMonth}</Text>
                </View>
                <Text style={styles.usageValue}>{aiCallsCount}/{FREE_TIER.maxAiCallsPerMonth}</Text>
              </View>
            </View>

            {/* "This isn't a backup" — free data lives on the device only. The one line
                that makes cloud backup worth paying for; taps straight to the paywall. */}
            <TouchableOpacity
              style={styles.backupNotice}
              onPress={() => setPaywallOpen(true)}
              activeOpacity={0.7}
            >
              <Feather name="cloud-off" size={15} color={C.bronze} />
              <Text style={styles.backupNoticeText}>{t.settings.notBackedUp}</Text>
            </TouchableOpacity>

            {/* Neu Select CTA → opens the shared paywall (3 tiers, real pricing). */}
            <NeuButton
              label={t.settings.upgradeButton}
              icon="award"
              onPress={() => setPaywallOpen(true)}
              style={styles.upgradeBtn}
            />
          </View>
        )}

        {/* Restore + legal — Apple wants Restore reachable outside the paywall, and Terms/
            Privacy present wherever the subscription lives. Same trio as the paywall footer. */}
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
      </Card>

      <PaywallModal
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        feature="ai"
      />
    </>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  card: {
    marginBottom: SPACING.sm,
  },
  settingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  premiumStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.md,
    backgroundColor: C.accent,
  },
  premiumBadgeText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.onAccent,
  },
  unsubscribeText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.neutral,
  },
  usageLimits: {
    gap: SPACING.sm,
  },
  usageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.xs,
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
  backupNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md - 4,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(C.bronze, 0.1),
  },
  backupNoticeText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    lineHeight: 17,
  },
  upgradeBtn: {
    marginTop: SPACING.md,
  },
  legalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap', // wrap to a 2nd line rather than overflow (long Malay labels / large type)
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    rowGap: SPACING.xs,
    paddingTop: SPACING.md,
    // no paddingHorizontal — Card already pads SPACING.lg each side; extra padding starved the row
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.textPrimary, 0.08),
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

export default SubscriptionCard;
