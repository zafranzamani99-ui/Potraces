import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Card from '../common/Card';
import { usePremiumStore } from '../../store/premiumStore';
import { useWalletStore } from '../../store/walletStore';
import { usePersonalStore } from '../../store/personalStore';
import { FREE_TIER, PREMIUM_CONFIG } from '../../constants/premium';
import { CALM, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { useToast } from '../../context/ToastContext';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';

/**
 * Premium status + free-tier usage card, shared by Personal and Business hubs.
 * Premium (scans / AI) is account-wide, so both modes show it. Wallet/budget
 * usage is personal-only, so the `variant` prop hides those rows in business —
 * showing personal counts in business mode would be misleading.
 */
const SubscriptionCard: React.FC<{ variant: 'personal' | 'business' }> = ({ variant }) => {
  const C = useCalm();
  const styles = React.useMemo(() => makeStyles(C), [C]);
  const { showToast } = useToast();
  const t = useT();

  const tier = usePremiumStore((s) => s.tier);
  const subscribe = usePremiumStore((s) => s.subscribe);
  const unsubscribe = usePremiumStore((s) => s.unsubscribe);
  const scanCount = usePremiumStore((s) => s.scanCount);
  const aiCallsCount = usePremiumStore((s) => s.aiCallsCount);
  const walletCount = useWalletStore((s) => s.wallets.length);
  const budgetCount = usePersonalStore((s) => s.budgets.length);

  return (
    <Card style={styles.card}>
      {tier === 'premium' ? (
        <View style={[styles.premiumStatusRow, { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md }]}>
          <View style={styles.premiumBadge}>
            <Feather name="award" size={14} color={C.onAccent} />
            <Text style={styles.premiumBadgeText}>{t.settings.premiumBadge}</Text>
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
          <TouchableOpacity
            style={styles.subscribeButton}
            onPress={() => {
              subscribe();
              showToast(t.settings.welcomeToPremium, 'success');
            }}
            activeOpacity={0.7}
          >
            <Feather name="award" size={18} color={C.onAccent} />
            <Text style={styles.subscribeButtonText}>
              {t.settings.subscribeButton
                .replace('{currency}', PREMIUM_CONFIG.currency)
                .replace('{price}', String(PREMIUM_CONFIG.price))
                .replace('{period}', PREMIUM_CONFIG.period)}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </Card>
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
  subscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: C.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    marginTop: SPACING.md,
  },
  subscribeButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.onAccent,
  },
});

export default SubscriptionCard;
