import React, { useMemo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Alert, Modal, Pressable } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useStallStore } from '../../store/stallStore';
import { useBusinessStore } from '../../store/businessStore';
import { useSettingsStore, clearBusinessLocalData } from '../../store/settingsStore';
import { useAuthStore } from '../../store/authStore';
import { signOut, supabaseBusiness } from '../../services/supabase';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha, BIZ_SAFE, semantic } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useNeu } from '../../components/common/neu';
import { useT } from '../../i18n';
import { useFadeSlide } from '../../utils/fadeSlide';
import { lightTap } from '../../services/haptics';

// ─── Component ───────────────────────────────────────────────
// Stall "Manage" hub — the stall counterpart to seller/Manage.tsx. Same neu/Onyx
// card layout; stall has sessions (not seasons), so the cards are Products, Sales
// (Transactions), Costs, and Settings, plus change-setup + sign out.
const StallManage: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const isDark = useIsDark();
  const bizSuccess = semantic(BIZ_SAFE.success, isDark);
  const styles = useMemo(() => makeStyles(C), [C]);
  const neuF = useNeu(undefined, { faintDark: true });
  const { products, sessions } = useStallStore();
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const incomeType = useBusinessStore((s) => s.incomeType);
  const [setupModalVisible, setSetupModalVisible] = useState(false);

  // Sales across every session (stall "transactions").
  const salesCount = useMemo(
    () => sessions.reduce((sum, s) => sum + (s.sales?.length || 0), 0),
    [sessions],
  );

  // Costs (session expenses) — total count + this-month sum.
  const { costsCount, totalCostsThisMonth } = useMemo(() => {
    const now = new Date();
    let count = 0;
    let month = 0;
    for (const s of sessions) {
      for (const e of s.expenses || []) {
        count += 1;
        const d = e.timestamp instanceof Date ? e.timestamp : new Date(e.timestamp);
        if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
          month += e.amount;
        }
      }
    }
    return { costsCount: count, totalCostsThisMonth: month };
  }, [sessions]);

  const handleSignOut = useCallback(() => {
    Alert.alert(
      t.settings.signOutTitle,
      t.settings.signOutMsg,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.settings.signOut,
          onPress: () => {
            useAuthStore.getState().resetBusiness();
            if (navigation.canGoBack()) navigation.goBack();
            clearBusinessLocalData().catch(() => {});
            signOut(supabaseBusiness).catch(() => {});
          },
        },
      ],
    );
  }, [t, navigation]);

  const handleOpenSetup = useCallback(() => {
    lightTap();
    setSetupModalVisible(true);
  }, []);

  const handleConfirmSetup = useCallback(() => {
    setSetupModalVisible(false);
    useBusinessStore.getState().resetSetup();
  }, []);

  // Staggered animations
  const headerAnim = useFadeSlide(0);
  const productsAnim = useFadeSlide(60);
  const transactionsAnim = useFadeSlide(90);
  const costsAnim = useFadeSlide(120);
  const settingsAnim = useFadeSlide(180);
  const setupLinkAnim = useFadeSlide(240);
  const signOutAnim = useFadeSlide(280);

  return (
    <>
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 88 }]}
      showsVerticalScrollIndicator={false}
    >
      {/* ─── Page Header ──────────────────────────────────── */}
      <Animated.View style={[styles.header, headerAnim]}>
        <Text style={styles.headerLabel}>{t.stallManage.heading}</Text>
        <Text style={styles.headerSubtitle}>{t.stallManage.subtitle}</Text>
      </Animated.View>

      {/* ─── Products Card ────────────────────────────────── */}
      <Animated.View style={productsAnim}>
        <TouchableOpacity
          style={[styles.card, neuF.raisedSoft]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Products. ${products.length} products. Navigate to product catalog.`}
          onPress={() => navigation.getParent()?.navigate('StallProducts')}
        >
          <View style={[styles.iconBox, { backgroundColor: withAlpha(C.accent, 0.12) }]}>
            <Feather name="package" size={24} color={C.accent} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>{t.stallManage.productsTitle}</Text>
            <Text style={styles.cardSubtitle}>{t.stallManage.productsSub}</Text>
            <Text style={styles.cardBadge}>{t.stallManage.nProducts.replace('{n}', String(products.length))}</Text>
          </View>
          <Feather name="chevron-right" size={20} color={C.textMuted} />
        </TouchableOpacity>
      </Animated.View>

      {/* ─── Transactions (sales) Card ─────────────────────── */}
      <Animated.View style={transactionsAnim}>
        <TouchableOpacity
          style={[styles.card, neuF.raisedSoft]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Transactions. ${salesCount} sales. Navigate to sales list.`}
          onPress={() => navigation.getParent()?.navigate('StallTransactions')}
        >
          <View style={[styles.iconBox, { backgroundColor: withAlpha(bizSuccess, 0.12) }]}>
            <Feather name="list" size={24} color={bizSuccess} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>{t.stallManage.transactionsTitle}</Text>
            <Text style={styles.cardSubtitle}>{t.stallManage.transactionsSub}</Text>
            <Text style={styles.cardBadge}>{t.stallManage.nSales.replace('{n}', String(salesCount))}</Text>
          </View>
          <Feather name="chevron-right" size={20} color={C.textMuted} />
        </TouchableOpacity>
      </Animated.View>

      {/* ─── Costs Card ────────────────────────────────────── */}
      <Animated.View style={costsAnim}>
        <TouchableOpacity
          style={[styles.card, neuF.raisedSoft]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Costs. ${costsCount} entries. Navigate to costs.`}
          onPress={() => navigation.getParent()?.navigate('StallCosts')}
        >
          <View style={styles.iconBox}>
            <Feather name="shopping-bag" size={24} color={C.bronze} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>{t.stallManage.costsTitle}</Text>
            <Text style={styles.cardSubtitle}>{t.stallManage.costsSub}</Text>
            <View style={styles.badgeRow}>
              <Text style={styles.cardBadge}>{t.stallManage.nCosts.replace('{n}', String(costsCount))}</Text>
              {totalCostsThisMonth > 0 && (
                <Text style={styles.costBadge}>{t.stallManage.thisMonth.replace('{currency}', currency).replace('{amount}', totalCostsThisMonth.toFixed(0))}</Text>
              )}
            </View>
          </View>
          <Feather name="chevron-right" size={20} color={C.textMuted} />
        </TouchableOpacity>
      </Animated.View>

      {/* ─── Settings Card ────────────────────────────────── */}
      <Animated.View style={settingsAnim}>
        <TouchableOpacity
          style={[styles.card, neuF.raisedSoft]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Settings. Currency, preferences, and data. Navigate to settings."
          onPress={() => navigation.getParent()?.navigate('Settings')}
        >
          <View style={[styles.iconBox, { backgroundColor: withAlpha(C.lavender, 0.15) }]}>
            <Feather name="settings" size={24} color={C.lavender} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>{t.stallManage.settingsTitle}</Text>
            <Text style={styles.cardSubtitle}>{t.stallManage.settingsSub}</Text>
          </View>
          <Feather name="chevron-right" size={20} color={C.textMuted} />
        </TouchableOpacity>
      </Animated.View>

      {/* ─── Change Business Setup ────────────────────────── */}
      <Animated.View style={setupLinkAnim}>
        <TouchableOpacity
          style={styles.setupLink}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t.stallManage.changeSetupLink}
          onPress={handleOpenSetup}
        >
          <Feather name="briefcase" size={18} color={C.textMuted} />
          <Text style={styles.setupLinkText}>{t.stallManage.changeSetupLink}</Text>
        </TouchableOpacity>
      </Animated.View>

      {/* ─── Sign Out ─────────────────────────────────────── */}
      <Animated.View style={signOutAnim}>
        <TouchableOpacity
          style={styles.signOutCard}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t.settings.signOut}
          onPress={handleSignOut}
        >
          <Feather name="log-out" size={18} color={C.textMuted} />
          <Text style={styles.signOutText}>{t.settings.signOut}</Text>
        </TouchableOpacity>
      </Animated.View>
    </ScrollView>

    {/* ─── Change Business Setup Confirm Modal ────────────── */}
    <Modal
      visible={setupModalVisible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => setSetupModalVisible(false)}
    >
      <Pressable style={styles.confirmOverlay} onPress={() => setSetupModalVisible(false)}>
        <View style={[styles.confirmCard, neuF.raisedModal]} onStartShouldSetResponder={() => true}>
          <Text style={styles.confirmTitle}>{t.stallManage.changeSetupConfirmTitle}</Text>
          {!!incomeType && (
            <Text style={styles.confirmCurrent} numberOfLines={1}>{incomeType}</Text>
          )}
          <Text style={styles.confirmSub}>{t.stallManage.changeSetupConfirmMsg}</Text>
          <View style={styles.confirmBtns}>
            <TouchableOpacity
              style={[styles.confirmBtn, styles.confirmCancelBtn, neuF.raised]}
              onPress={() => setSetupModalVisible(false)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t.common.cancel}
            >
              <Text style={styles.confirmCancelText}>{t.common.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, styles.confirmPrimaryBtn]}
              onPress={handleConfirmSetup}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t.stallManage.changeSetupConfirmBtn}
            >
              <Text style={styles.confirmPrimaryText}>{t.stallManage.changeSetupConfirmBtn}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Pressable>
    </Modal>
    </>
  );
};

// ─── Styles ──────────────────────────────────────────────────
const makeStyles = (C: typeof CALM) => StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: C.background,
  },
  content: {
    paddingHorizontal: SPACING.xl,
    paddingBottom: SPACING['3xl'],
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
  },

  // Header
  header: {
    marginTop: SPACING['3xl'],
    marginBottom: SPACING.xl,
  },
  headerLabel: {
    ...TYPE.label,
  },
  headerSubtitle: {
    ...TYPE.muted,
    marginTop: SPACING.xs,
  },

  // Card (Neu Card: C.background base + neu shadow, no border — no overflow clip)
  card: {
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginBottom: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },

  // Icon box
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: withAlpha(C.bronze, 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },

  // Card text content
  cardContent: {
    flex: 1,
    marginRight: SPACING.sm,
  },
  cardTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  cardSubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginTop: 2,
  },
  cardBadge: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginTop: SPACING.xs,
  },

  // Badge row (count + this-month cost)
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
    gap: SPACING.sm,
  },
  costBadge: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },

  // Change business setup
  setupLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    minHeight: 44,
    marginTop: SPACING.xl,
    paddingVertical: SPACING.md,
  },
  setupLinkText: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // Sign out
  signOutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
    paddingVertical: SPACING.md,
  },
  signOutText: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // Confirm modal
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  confirmCard: {
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
    // Onyx dialog: neu.raisedModal (spread at call site) = C.background surface +
    // soft neutral drop; border per the floating-modal-outline rule.
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.12),
  },
  confirmTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    marginBottom: SPACING.xs,
  },
  confirmCurrent: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textSecondary,
    marginBottom: SPACING.xs,
    textTransform: 'capitalize',
  },
  confirmSub: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    lineHeight: TYPOGRAPHY.size.sm * 1.5,
    marginBottom: SPACING.xl,
  },
  confirmBtns: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  confirmCancelBtn: {
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
  },
  confirmPrimaryBtn: {
    backgroundColor: C.deepOliveBiz,
  },
  confirmCancelText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
  },
  confirmPrimaryText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.onAccent,
  },
});

export default StallManage;
