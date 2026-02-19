import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import GRADIENTS from '../../constants/gradients';
import { FREE_TIER, PREMIUM_CONFIG } from '../../constants/premium';
import GradientButton from './GradientButton';
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
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header with gradient */}
          <LinearGradient
            colors={GRADIENTS.premium.colors as [string, string]}
            start={GRADIENTS.premium.start}
            end={GRADIENTS.premium.end}
            style={styles.header}
          >
            <View style={styles.crownCircle}>
              <Feather name="award" size={28} color="#FFB347" />
            </View>
            <Text style={styles.headerTitle}>{config.title}</Text>
            <Text style={styles.headerSubtitle}>
              {currentUsage !== undefined
                ? `You've used ${currentUsage}/${config.freeLimit} free ${config.unit}`
                : `Free plan allows ${config.freeLimit} ${config.unit}`}
            </Text>
          </LinearGradient>

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
                <LinearGradient
                  colors={GRADIENTS.premium.colors as [string, string]}
                  start={GRADIENTS.premium.start}
                  end={GRADIENTS.premium.end}
                  style={styles.premiumBadge}
                >
                  <Text style={styles.premiumBadgeText}>Premium</Text>
                </LinearGradient>
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
            <GradientButton
              title={`Subscribe - ${PREMIUM_CONFIG.currency} ${PREMIUM_CONFIG.price}/${PREMIUM_CONFIG.period}`}
              onPress={handleSubscribe}
              gradient={GRADIENTS.premium}
              size="large"
              icon="award"
              textStyle={{ color: '#333' }}
            />

            {/* Dismiss */}
            <TouchableOpacity style={styles.dismissBtn} onPress={onClose}>
              <Text style={styles.dismissText}>Maybe Later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
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
      color={check ? COLORS.income : cross ? COLORS.textTertiary : COLORS.textSecondary}
    />
    <Text
      style={[
        styles.tierRowText,
        cross && { color: COLORS.textTertiary, textDecorationLine: 'line-through' },
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
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    ...SHADOWS.xl,
  },
  header: {
    alignItems: 'center',
    paddingVertical: SPACING['2xl'],
    paddingHorizontal: SPACING.xl,
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
    color: '#333',
    marginBottom: SPACING.xs,
  },
  headerSubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: 'rgba(51, 51, 51, 0.7)',
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
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  premiumTierCard: {
    borderColor: '#FFB347',
    borderWidth: 1.5,
  },
  tierLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  premiumBadge: {
    alignSelf: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: 3,
    borderRadius: RADIUS.sm,
    marginBottom: SPACING.sm,
  },
  premiumBadgeText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: '#333',
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
    color: COLORS.text,
    flex: 1,
  },
  dismissBtn: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
  },
  dismissText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: COLORS.textTertiary,
  },
});

export default PaywallModal;
