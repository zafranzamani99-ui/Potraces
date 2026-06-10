import React, { useMemo, useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Alert, Modal, Pressable } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { useSellerStore } from '../../store/sellerStore';
import { useBusinessStore } from '../../store/businessStore';
import { useSettingsStore, clearBusinessLocalData } from '../../store/settingsStore';
import { useAuthStore } from '../../store/authStore';
import { signOut } from '../../services/supabase';
import { syncAll, clearProfileCache } from '../../services/sellerSync';
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha, BIZ, BIZ_SAFE, semantic } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useFadeSlide } from '../../utils/fadeSlide';
import { lightTap } from '../../services/haptics';

// ─── Component ───────────────────────────────────────────────
const SellerManage: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const isDark = useIsDark();
  const bizSuccess = semantic(BIZ_SAFE.success, isDark);
  const styles = useMemo(() => makeStyles(C), [C]);
  const { products, seasons, ingredientCosts, orders } = useSellerStore();
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();

  const incomeType = useBusinessStore((s) => s.incomeType);
  const [setupModalVisible, setSetupModalVisible] = useState(false);

  const activeSeason = seasons.find((s) => s.isActive) || null;
  const paidOrders = useMemo(() => orders.filter((o) => o.isPaid), [orders]);
  const totalCostsThisMonth = useMemo(() => ingredientCosts
    .filter((c) => {
      const d = c.date instanceof Date ? c.date : new Date(c.date);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, c) => sum + c.amount, 0), [ingredientCosts]);

  const handleSignOut = useCallback(() => {
    Alert.alert(
      t.settings.signOutTitle,
      t.settings.signOutMsg,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.settings.signOut,
          onPress: () => {
            const { isAuthenticated, isVerified } = useAuthStore.getState();
            let syncData: any = null;
            if (isAuthenticated && isVerified) {
              const { products, orders, seasons, sellerCustomers } = useSellerStore.getState();
              syncData = { products, orders, seasons, sellerCustomers };
            }
            useAuthStore.getState().reset();
            clearProfileCache();
            if (navigation.canGoBack()) navigation.goBack();
            if (syncData) syncAll(syncData.products, syncData.orders, syncData.seasons, syncData.sellerCustomers).catch(() => {});
            clearBusinessLocalData().catch(() => {});
            signOut().catch(() => {});
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
  const seasonsAnim = useFadeSlide(180);
  const settingsAnim = useFadeSlide(240);
  const setupLinkAnim = useFadeSlide(290);
  const signOutAnim = useFadeSlide(320);

  return (
    <>
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ─── Page Header ──────────────────────────────────── */}
      <Animated.View style={[styles.header, headerAnim]}>
        <Text style={styles.headerLabel}>{t.sellerManage.heading}</Text>
        <Text style={styles.headerSubtitle}>{t.sellerManage.subtitle}</Text>
      </Animated.View>

      {/* ─── Products Card ────────────────────────────────── */}
      <Animated.View style={productsAnim}>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Products. ${products.length} products. Navigate to product catalog.`}
          onPress={() => navigation.getParent()?.navigate('SellerProducts')}
        >
          <View style={[styles.iconBox, { backgroundColor: withAlpha(C.accent, 0.12) }]}>
            <Feather name="package" size={24} color={C.accent} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>{t.sellerManage.productsTitle}</Text>
            <Text style={styles.cardSubtitle}>{t.sellerManage.productsSub}</Text>
            <Text style={styles.cardBadge}>{t.sellerManage.nProducts.replace('{n}', String(products.length))}</Text>
          </View>
          <Feather name="chevron-right" size={20} color={C.textMuted} />
        </TouchableOpacity>
      </Animated.View>

      {/* ─── Transactions Card ─────────────────────────────── */}
      <Animated.View style={transactionsAnim}>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Transactions. ${paidOrders.length} paid orders. Navigate to transaction list.`}
          onPress={() => navigation.getParent()?.navigate('SellerTransactions')}
        >
          <View style={[styles.iconBox, { backgroundColor: withAlpha(bizSuccess, 0.12) }]}>
            <Feather name="list" size={24} color={bizSuccess} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>{t.sellerManage.transactionsTitle}</Text>
            <Text style={styles.cardSubtitle}>{t.sellerManage.transactionsSub}</Text>
            <Text style={styles.cardBadge}>{t.sellerManage.nPaidOrders.replace('{n}', String(paidOrders.length))}</Text>
          </View>
          <Feather name="chevron-right" size={20} color={C.textMuted} />
        </TouchableOpacity>
      </Animated.View>

      {/* ─── Costs Card ────────────────────────────────────── */}
      <Animated.View style={costsAnim}>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Costs. ${ingredientCosts.length} entries. Navigate to cost management.`}
          onPress={() => navigation.getParent()?.navigate('SellerCosts')}
        >
          <View style={styles.iconBox}>
            <Feather name="shopping-bag" size={24} color={C.bronze} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>{t.sellerManage.costsTitle}</Text>
            <Text style={styles.cardSubtitle}>{t.sellerManage.costsSub}</Text>
            <View style={styles.badgeRow}>
              <Text style={styles.cardBadge}>{t.sellerManage.nEntries.replace('{n}', String(ingredientCosts.length))}</Text>
              {totalCostsThisMonth > 0 && (
                <Text style={styles.costBadge}>{t.sellerManage.thisMonth.replace('{currency}', currency).replace('{amount}', totalCostsThisMonth.toFixed(0))}</Text>
              )}
            </View>
          </View>
          <Feather name="chevron-right" size={20} color={C.textMuted} />
        </TouchableOpacity>
      </Animated.View>

      {/* ─── Seasons Card ─────────────────────────────────── */}
      <Animated.View style={seasonsAnim}>
        <TouchableOpacity
          style={[styles.card, activeSeason && styles.cardHighlighted]}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`Seasons. ${seasons.length} seasons.${activeSeason ? ` Active season: ${activeSeason.name}.` : ''} Navigate to season history.`}
          onPress={() => navigation.getParent()?.navigate('PastSeasons')}
        >
          <View style={[styles.iconBox, { backgroundColor: withAlpha(C.gold, 0.12) }]}>
            <Feather name="calendar" size={24} color={C.gold} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>{t.sellerManage.seasonsTitle}</Text>
            <Text style={styles.cardSubtitle}>{t.sellerManage.seasonsSub}</Text>
            <View style={styles.badgeRow}>
              <Text style={styles.cardBadge}>{t.sellerManage.nSeasons.replace('{n}', String(seasons.length))}</Text>
              {activeSeason && (
                <Text style={styles.activeBadge}>{t.sellerManage.activeSeason.replace('{name}', activeSeason.name)}</Text>
              )}
            </View>
          </View>
          <Feather name="chevron-right" size={20} color={C.textMuted} />
        </TouchableOpacity>
      </Animated.View>

      {/* ─── Settings Card ────────────────────────────────── */}
      <Animated.View style={settingsAnim}>
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Settings. Currency, preferences, and data. Navigate to settings."
          onPress={() => navigation.getParent()?.navigate('SellerSettings')}
        >
          <View style={[styles.iconBox, { backgroundColor: withAlpha(C.lavender, 0.15) }]}>
            <Feather name="settings" size={24} color={C.lavender} />
          </View>
          <View style={styles.cardContent}>
            <Text style={styles.cardTitle}>{t.sellerManage.settingsTitle}</Text>
            <Text style={styles.cardSubtitle}>{t.sellerManage.settingsSub}</Text>
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
          accessibilityLabel={t.sellerManage.changeSetupLink}
          onPress={handleOpenSetup}
        >
          <Feather name="briefcase" size={18} color={C.textMuted} />
          <Text style={styles.setupLinkText}>{t.sellerManage.changeSetupLink}</Text>
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
        <View style={styles.confirmCard} onStartShouldSetResponder={() => true}>
          <Text style={styles.confirmTitle}>{t.sellerManage.changeSetupConfirmTitle}</Text>
          {!!incomeType && (
            <Text style={styles.confirmCurrent} numberOfLines={1}>{incomeType}</Text>
          )}
          <Text style={styles.confirmSub}>{t.sellerManage.changeSetupConfirmMsg}</Text>
          <View style={styles.confirmBtns}>
            <TouchableOpacity
              style={[styles.confirmBtn, styles.confirmCancelBtn]}
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
              accessibilityLabel={t.sellerManage.changeSetupConfirmBtn}
            >
              <Text style={styles.confirmPrimaryText}>{t.sellerManage.changeSetupConfirmBtn}</Text>
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

  // Card
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
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

  // Badge row for seasons
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xs,
    gap: SPACING.sm,
  },
  activeBadge: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
  },
  costBadge: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
    fontVariant: ['tabular-nums'] as ('tabular-nums')[],
  },
  cardHighlighted: {
    borderColor: withAlpha(C.gold, 0.3),
    backgroundColor: withAlpha(C.gold, 0.03),
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
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: C.border,
    ...SHADOWS.lg,
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

export default SellerManage;
