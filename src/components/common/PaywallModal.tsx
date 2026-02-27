import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { FREE_TIER, PREMIUM_CONFIG } from '../../constants/premium';
import { usePremiumStore } from '../../store/premiumStore';

type PaywallFeature = 'wallet' | 'budget' | 'scan';

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
  feature: PaywallFeature;
  currentUsage?: number;
}

const FEATURE_CONFIG: Record<PaywallFeature, { title: string; icon: keyof typeof Feather.glyphMap; freeLimit: number; unit: string }> = {
  wallet: {
    title: 'Wallet Limit Reached',
    icon: 'credit-card',
    freeLimit: FREE_TIER.maxWallets,
    unit: 'wallets',
  },
  budget: {
    title: 'Budget Limit Reached',
    icon: 'pie-chart',
    freeLimit: FREE_TIER.maxBudgets,
    unit: 'budgets',
  },
  scan: {
    title: 'Scan Limit Reached',
    icon: 'camera',
    freeLimit: FREE_TIER.maxScansPerMonth,
    unit: 'scans/month',
  },
};

const PaywallModal: React.FC<PaywallModalProps> = ({
  visible,
  onClose,
  feature,
  currentUsage,
}) => {
  const subscribe = usePremiumStore((s) => s.subscribe);
  const config = FEATURE_CONFIG[feature];

  const handleSubscribe = () => {
    subscribe();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.modal} onStartShouldSetResponder={() => true}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.crownCircle}>
              <Feather name="award" size={28} color="#FFB347" />
            </View>
            <Text style={styles.headerTitle}>{config.title}</Text>
            <Text style={styles.headerSubtitle}>
              {currentUsage !== undefined
                ? `You've used ${currentUsage}/${config.freeLimit} free ${config.unit}`
                : `Free plan allows ${config.freeLimit} ${config.unit}`}
            </Text>
          </View>

          {/* Comparison */}
          <View style={styles.body}>
            <View style={styles.comparison}>
              {/* Free tier */}
              <View style={styles.tierCard}>
                <Text style={styles.tierLabel}>Free</Text>
                <View style={styles.tierFeatures}>
                  <TierRow icon="credit-card" text={`${FREE_TIER.maxWallets} wallets`} />
                  <TierRow icon="pie-chart" text={`${FREE_TIER.maxBudgets} budgets`} />
                  <TierRow icon="camera" text={`${FREE_TIER.maxScansPerMonth} scans/mo`} />
                  <TierRow icon="download" text="Export data" check />
                  <TierRow icon="file-text" text="Google Docs sync" cross />
                </View>
              </View>

              {/* Premium tier */}
              <View style={[styles.tierCard, styles.premiumTierCard]}>
                <View style={styles.premiumBadge}>
                  <Text style={styles.premiumBadgeText}>Premium</Text>
                </View>
                <View style={styles.tierFeatures}>
                  <TierRow icon="credit-card" text="Unlimited wallets" check />
                  <TierRow icon="pie-chart" text="Unlimited budgets" check />
                  <TierRow icon="camera" text="Unlimited scans" check />
                  <TierRow icon="download" text="Export data" check />
                  <TierRow icon="file-text" text="Google Docs sync" check soon />
                </View>
              </View>
            </View>

            {/* Subscribe button */}
            <TouchableOpacity style={styles.subscribeButton} onPress={handleSubscribe}>
              <Feather name="award" size={18} color="#FFFFFF" />
              <Text style={styles.subscribeText}>
                {`Subscribe - ${PREMIUM_CONFIG.currency} ${PREMIUM_CONFIG.price}/${PREMIUM_CONFIG.period}`}
              </Text>
            </TouchableOpacity>

            {/* Dismiss */}
            <TouchableOpacity style={styles.dismissBtn} onPress={onClose}>
              <Text style={styles.dismissText}>Maybe Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
};

// Helper component for tier comparison rows
const TierRow: React.FC<{
  icon: keyof typeof Feather.glyphMap;
  text: string;
  check?: boolean;
  cross?: boolean;
  soon?: boolean;
}> = ({ icon, text, check, cross, soon }) => (
  <View style={styles.tierRow}>
    <Feather
      name={check ? 'check-circle' : cross ? 'x-circle' : icon}
      size={14}
      color={check ? CALM.positive : cross ? CALM.neutral : CALM.textSecondary}
    />
    <Text
      style={[
        styles.tierRowText,
        cross && { color: CALM.neutral, textDecorationLine: 'line-through' },
      ]}
    >
      {text}
      {soon ? ' (soon)' : ''}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
  },
  modal: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: CALM.border,
  },
  header: {
    alignItems: 'center',
    paddingVertical: SPACING['2xl'],
    paddingHorizontal: SPACING.xl,
    backgroundColor: CALM.accent,
  },
  crownCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  headerTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: '#FFFFFF',
    marginBottom: SPACING.xs,
  },
  headerSubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
  },
  body: {
    padding: SPACING.xl,
  },
  comparison: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.xl,
  },
  tierCard: {
    flex: 1,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  premiumTierCard: {
    borderColor: '#FFB347',
    borderWidth: 1.5,
  },
  tierLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textSecondary,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  premiumBadge: {
    alignSelf: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.sm,
    backgroundColor: CALM.accent,
  },
  premiumBadgeText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: '#FFFFFF',
  },
  tierFeatures: {
    gap: SPACING.sm,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  tierRowText: {
    fontSize: 11,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
    flex: 1,
  },
  subscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: CALM.accent,
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.md,
  },
  subscribeText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: '#FFFFFF',
  },
  dismissBtn: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
  },
  dismissText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.neutral,
  },
});

export default PaywallModal;
