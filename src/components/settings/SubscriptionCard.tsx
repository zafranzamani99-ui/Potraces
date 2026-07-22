import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import NeuGroup from '../common/NeuGroup';
import NeuButton from '../common/NeuButton';
import PaywallModal from '../common/PaywallModal';
import { usePremiumStore } from '../../store/premiumStore';
import { FREE_TIER } from '../../constants/premium';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha, TERMS_URL, PRIVACY_URL } from '../../constants';
import { isBillingConfigured, restorePurchases } from '../../services/billing';
import { useToast } from '../../context/ToastContext';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';

// Soft-lift olive for the "See plans" CTA gradient — the button lightens GENTLY toward
// the BOTTOM (lit from below), never dark and never a bright pop. A muted step above the
// base olive; local const since light mode has no lighter-olive token.
const LIFT_OLIVE = '#676A1B';

/**
 * Premium status + free-tier usage card, shared by Personal and Business hubs.
 * Premium (scans / AI) is account-wide, so both modes show it. Wallet/budget
 * usage is personal-only, so the `variant` prop hides those rows in business —
 * showing personal counts in business mode would be misleading.
 *
 * The "See plans" CTA opens the shared PaywallModal (the single source of pricing
 * truth — 3 tiers, cloud-backup promise) rather than instantly subscribing at a
 * hardcoded price. The paywall's Continue does the actual unlock.
 *
 * `variant` is kept for call-site compat: it used to hide the personal-only
 * wallet/budget rows in business mode, but those moved to the MyPlan screen —
 * everything left here (scans / AI) is account-wide, so both modes show it all.
 */
const SubscriptionCard: React.FC<{ variant: 'personal' | 'business' }> = () => {
  const C = useCalm();
  const styles = React.useMemo(() => makeStyles(C), [C]);
  const { showToast } = useToast();
  const t = useT();
  const navigation = useNavigation<any>();

  const [paywallOpen, setPaywallOpen] = React.useState(false);
  // The backup notice and the See-plans button share ONE modal instance but sell
  // different things — the notice opens on the cloud-backup pitch, the button on
  // the general (ai) pitch.
  const [paywallFeature, setPaywallFeature] = React.useState<'ai' | 'backup'>('ai');
  const openPaywall = (feature: 'ai' | 'backup') => {
    setPaywallFeature(feature);
    setPaywallOpen(true);
  };

  const tier = usePremiumStore((s) => s.tier);
  const unsubscribe = usePremiumStore((s) => s.unsubscribe);
  const scanCount = usePremiumStore((s) => s.scanCount);
  const aiCallsCount = usePremiumStore((s) => s.aiCallsCount);

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
      <NeuGroup style={styles.card}>
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
              onPress={() => openPaywall('backup')}
              activeOpacity={0.7}
            >
              <Feather name="cloud-off" size={15} color={C.bronze} />
              <Text style={styles.backupNoticeText}>{t.settings.notBackedUp}</Text>
            </TouchableOpacity>

            {/* Neu Select CTA → opens the shared paywall (3 tiers, real pricing). */}
            <NeuButton
              label={t.settings.upgradeButton}
              icon="award"
              gradient={[C.accent, LIFT_OLIVE]}
              onPress={() => openPaywall('ai')}
              style={styles.upgradeBtn}
            />
          </View>
        )}

        {/* "See my plan" — the full per-tier usage breakdown (wallets, budgets,
            savings, goals, shared subs, Collectz, scans, AI) lives on the MyPlan
            screen; paid users reach their real caps (e.g. 42/300) through here. */}
        <TouchableOpacity
          style={styles.myPlanRow}
          onPress={() => navigation.navigate('MyPlan')}
          accessibilityRole="button"
          accessibilityLabel={t.settings.myPlanSee}
        >
          <Text style={styles.myPlanText}>{t.settings.myPlanSee}</Text>
          <Feather name="arrow-right" size={15} color={C.accent} />
        </TouchableOpacity>

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
      </NeuGroup>

      <PaywallModal
        visible={paywallOpen}
        onClose={() => setPaywallOpen(false)}
        feature={paywallFeature}
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
  myPlanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  myPlanText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
  legalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap', // wrap to a 2nd line rather than overflow (long Malay labels / large type)
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    rowGap: SPACING.xs,
    // NeuGroup adds no inner padding (unlike the old Card), so pad here directly.
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.md,
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
