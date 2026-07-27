import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Alert,
  Platform,
  InteractionManager,
  LayoutAnimation,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ScrollView } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SettingRow from '../../components/common/SettingRow';
import NeuGroup from '../../components/common/NeuGroup';
import PaymentQrCard from '../../components/settings/PaymentQrCard';
import SubscriptionCard from '../../components/settings/SubscriptionCard';
import UnitManager from '../../components/common/UnitManager';
import StallUnitManager from '../../components/business/StallUnitManager';
import StallCategoryManager from '../../components/business/StallCategoryManager';
import ModalToastHost from '../../components/common/ModalToastHost';
import StallResetSheet from '../../components/business/StallResetSheet';
import { useSettingsStore, clearBusinessLocalData } from '../../store/settingsStore';
import { useBusinessStore } from '../../store/businessStore';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { useSellerStore } from '../../store/sellerStore';
import { signOut, supabaseBusiness } from '../../services/supabase';
import { clearProfileCache, syncAll } from '../../services/sellerSync';
import { tapToPayAvailable } from '../../services/tapToPay';
import { CALM, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { RootStackParamList, SettingsSection } from '../../types';
import { useToast } from '../../context/ToastContext';
import { lightTap } from '../../services/haptics';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';

/**
 * Business-mode Settings: hub, business setup (income type, units, business QR,
 * tap-to-pay, business categories), and the business danger zone (sign out,
 * clear business data). No personal rows, no personal data tools. Shared
 * app/device settings live in AppSettings (preferences/security/about
 * sections). Rendered by the shared Settings router; also serves SellerSettings.
 */
const BusinessSettings: React.FC<{ section?: SettingsSection; scrollTo?: string }> = ({ section, scrollTo }) => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { showToast } = useToast();

  const [ready, setReady] = useState(false);
  const [unitManagerVisible, setUnitManagerVisible] = useState(false);
  const [stallUnitManagerVisible, setStallUnitManagerVisible] = useState(false);
  const [stallCategoryManagerVisible, setStallCategoryManagerVisible] = useState(false);
  const [resetSheetVisible, setResetSheetVisible] = useState(false);
  const scrollRef = useRef<any>(null);
  const sectionY = useRef<Record<string, number>>({});

  const businessProfile = useSettingsStore((s) => s.businessProfile);
  const clearBusinessData = useSettingsStore((s) => s.clearBusinessData);
  const tapToPayEnabled = useSettingsStore((s) => s.tapToPayEnabled);
  const setTapToPayEnabled = useSettingsStore((s) => s.setTapToPayEnabled);
  const incomeType = useBusinessStore((s) => s.incomeType);
  const isAuthenticated = useAuthStore((s) => s.personal.isAuthenticated);

  const isProductBusiness = incomeType === 'seller' || incomeType === 'stall';

  useEffect(() => {
    if (ready) return;
    if (scrollTo) { setReady(true); return; }
    const task = InteractionManager.runAfterInteractions(() => setReady(true));
    const fallback = setTimeout(() => setReady(true), 400);
    return () => { task.cancel(); clearTimeout(fallback); };
  }, [scrollTo, ready]);

  useEffect(() => {
    if (!scrollTo || !ready) return;
    // Unit deep-link (from the product form's "manage units in settings") →
    // open the right unit manager directly instead of just scrolling. Deferred a
    // tick (so it isn't a synchronous setState in the effect body) but NOT cleaned
    // up: setParams(undefined) below re-runs this effect, and a clearTimeout cleanup
    // would cancel the open before it fired.
    if (scrollTo === 'units') {
      navigation.setParams({ scrollTo: undefined } as never);
      const openUnits = incomeType === 'stall' ? setStallUnitManagerVisible : setUnitManagerVisible;
      setTimeout(() => openUnits(true), 0);
      return;
    }
    // Stall category deep-link (from the product form's "manage categories in settings").
    if (scrollTo === 'stallcats') {
      navigation.setParams({ scrollTo: undefined } as never);
      setTimeout(() => setStallCategoryManagerVisible(true), 0);
      return;
    }
    // Category deep-links now land on the dedicated screen — forward.
    if (scrollTo === 'categories') {
      navigation.setParams({ scrollTo: undefined } as never);
      navigation.navigate('ManageCategories', { mode: 'business' });
      return;
    }
    const timer = setTimeout(() => {
      if (sectionY.current[scrollTo] !== undefined) {
        scrollRef.current?.scrollTo({ y: sectionY.current[scrollTo], animated: true });
      }
      navigation.setParams({ scrollTo: undefined } as never);
    }, 100);
    return () => clearTimeout(timer);
  }, [scrollTo, ready, navigation, incomeType]);

  useEffect(() => {
    if (!section) return;
    const titles: Record<string, string> = {
      money: t.settings.moneySetup,
    };
    if (titles[section]) navigation.setOptions({ title: titles[section] });
  }, [section, navigation, t]);

  const handleSignOut = useCallback(() => {
    Alert.alert(
      t.settings.signOutTitle,
      t.settings.signOutMsg,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.settings.signOut,
          onPress: () => {
            // Snapshot data for fire-and-forget sync before clearing stores.
            const { isAuthenticated: bizAuthed, isVerified } = useAuthStore.getState().business;
            let syncData: { products: any; orders: any; seasons: any; sellerCustomers: any } | null = null;
            if (bizAuthed && isVerified) {
              const { products, orders, seasons, sellerCustomers } = useSellerStore.getState();
              syncData = { products, orders, seasons, sellerCustomers };
            }

            // Reset business auth + navigate IMMEDIATELY so sign-out feels instant.
            useAuthStore.getState().resetBusiness();
            clearProfileCache();
            if (navigation.canGoBack()) navigation.goBack();

            // Background cleanup — user already sees AuthScreen.
            if (syncData) syncAll(syncData.products, syncData.orders, syncData.seasons, syncData.sellerCustomers).catch(() => {});
            clearBusinessLocalData().catch(() => {});
            signOut(supabaseBusiness).catch(() => {});
          },
        },
      ]
    );
  }, [t, navigation]);

  const handleClearBusinessData = useCallback(() => {
    Alert.alert(
      t.settings.clearBusinessDataTitle,
      t.settings.clearBusinessDataMsg,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.settings.clearAndSignOut,
          style: 'destructive',
          onPress: async () => {
            await clearBusinessData();
            showToast(t.settings.businessDataCleared, 'success');
          },
        },
      ]
    );
  }, [clearBusinessData, showToast, t]);

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 88 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
      >
        {/* ── HUB ── */}
        {!section && (
          <>
            {/* Business profile (the shop's "business card") — replaces the personal
                name field so business settings no longer shows a personal setting. */}
              <SettingRow
                icon="i/briefcase"
                chipColor="#5A5320"
                label={t.businessProfile.entryTitle}
                sublabel={businessProfile.shopName || t.businessProfile.entryUnset}
                onPress={() => { lightTap(); navigation.navigate('BusinessProfile'); }}
                last
              />

            {/* Account */}
            <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>{t.settings.accountSection}</Text>
              <SettingRow
                icon="i/person-circle-outline"
                chipColor="#6BA3BE"
                label={t.auth.acctTitle}
                sublabel={isAuthenticated ? t.auth.acctManageEntry : t.auth.acctSignInEntry}
                onPress={() => { lightTap(); navigation.navigate('Account' as never); }}
                last
              />

            <SubscriptionCard variant="business" />

              <SettingRow
                icon="i/gift"
                chipColor="#4F5104"
                label={t.settings.inviteFriends}
                onPress={() => { lightTap(); navigation.navigate('InviteFriends'); }}
              />
              <SettingRow
                icon="i/ticket-outline"
                chipColor="#9A6400"
                label={t.settings.redeemCode}
                onPress={() => { lightTap(); navigation.navigate('RedeemCode'); }}
                last
              />

            {/* Hub nav — each its own card */}
              <SettingRow
                icon="m/tune-variant"
                chipColor="#A688B8"
                label={t.settings.preferences}
                onPress={() => { lightTap(); navigation.navigate('SettingsDetail', { section: 'preferences' }); }}
              />
              <SettingRow
                icon="i/wallet"
                chipColor="#4F5104"
                label={t.settings.moneySetup}
                onPress={() => { lightTap(); navigation.navigate('SettingsDetail', { section: 'money' }); }}
              />
              <SettingRow
                icon="i/stats-chart"
                chipColor="#4F5104"
                label={t.settings.viewReports}
                onPress={() => { lightTap(); navigation.navigate('BusinessReports'); }}
              />
              {/* Whole-app rolling backup (covers business + seller stores too) — a
                  data-safety tool, not a personal one, so business needs it here. */}
              <SettingRow
                icon="i/cloud-upload-outline"
                chipColor="#4F5104"
                label={t.settings.backupsRestore}
                onPress={() => { lightTap(); navigation.navigate('BackupRestore' as never); }}
              />
              <SettingRow
                icon="i/shield-checkmark"
                chipColor="#9A6400"
                label={t.settings.security}
                onPress={() => { lightTap(); navigation.navigate('SettingsDetail', { section: 'security' }); }}
              />
              <SettingRow
                icon="i/information-circle-outline"
                chipColor="#5A5320"
                label={t.settings.aboutSection}
                onPress={() => { lightTap(); navigation.navigate('SettingsDetail', { section: 'about' }); }}
                last
              />

            <Text style={{ fontSize: TYPOGRAPHY.size.xs, lineHeight: 18, color: C.textMuted, textAlign: 'center', paddingHorizontal: SPACING.xl, marginTop: SPACING.md }}>
              {t.settings.financialDisclaimer}
            </Text>

            {/* Danger zone — business only */}
            <Text style={[styles.sectionHeader, { color: '#B5705A' }]}>{t.settings.dangerZone}</Text>
              <SettingRow
                icon="i/log-out-outline"
                chipColor="#B5705A"
                label={t.settings.signOut}
                onPress={handleSignOut}
              />
              {/* Scoped, safer delete of just this sub-mode's data — offered above
                  the all-business wipe so it's found first. Stall only for now. */}
              {incomeType === 'stall' && (
                <SettingRow
                  icon="i/trash-outline"
                  chipColor="#B5705A"
                  label={t.stall.deleteDataTitle}
                  onPress={() => { lightTap(); setResetSheetVisible(true); }}
                />
              )}
              <SettingRow
                icon="m/broom"
                chipColor="#B5705A"
                label={t.settings.clearBusinessDataBtn}
                onPress={handleClearBusinessData}
                last
              />
          </>
        )}

        {/* ── BUSINESS SETUP (money) ── */}
        {section === 'money' && (
          <>
            <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>{t.settings.moneySetup}</Text>
              {/* Income type — sellers change this from the Manage tab's "Change
                  Business Setup", so exclude them here to avoid a duplicate entry.
                  Every other sub-mode (stall/freelance/rider/parttime/mixed) has no
                  Manage tab, so this is their only way to change it. */}
              {incomeType !== 'seller' && (
                <SettingRow
                  icon="m/storefront"
                  chipColor="#9A6400"
                  label={t.settings.changeIncomeType}
                  value={incomeType || t.settings.notSet}
                  onPress={() => { lightTap(); useBusinessStore.getState().resetSetup(); }}
                />
              )}

              {ready && isProductBusiness && (
                <SettingRow
                  icon="i/cube-outline"
                  chipColor="#9A6400"
                  label={t.settings.manageUnits}
                  onPress={() => { lightTap(); incomeType === 'stall' ? setStallUnitManagerVisible(true) : setUnitManagerVisible(true); }}
                />
              )}

              {ready && incomeType === 'stall' && (
                <SettingRow
                  icon="i/pricetags"
                  chipColor="#9A6400"
                  label={t.settings.manageCategoriesRow}
                  onPress={() => { lightTap(); setStallCategoryManagerVisible(true); }}
                />
              )}

              {!isProductBusiness && (
                <View onLayout={(e) => { sectionY.current.categories = e.nativeEvent.layout.y; }}>
                  {/* One entry for all four managers — its own screen. */}
                  <SettingRow
                    icon="i/pricetags"
                    chipColor="#9A6400"
                    label={t.settings.manageCategoriesRow}
                    sublabel={t.settings.manageCategoriesDesc}
                    onPress={() => { lightTap(); navigation.navigate('ManageCategories', { mode: 'business' }); }}
                  />
                </View>
              )}

              <NeuGroup style={styles.card} onLayout={(e) => { sectionY.current.qr = e.nativeEvent.layout.y; }}>
                <PaymentQrCard mode="business" />
              </NeuGroup>

              {Platform.OS === 'ios' && (() => {
                const av = tapToPayAvailable();
                const status = !tapToPayEnabled
                  ? t.tapToPay.settingsSubtitle
                  : av.available
                    ? t.tapToPay.statusAvailable
                    : av.reason === 'currency' ? t.tapToPay.statusCurrency
                      : av.reason === 'device' ? t.tapToPay.statusDevice
                        : av.reason === 'offline' ? t.tapToPay.statusOffline
                          : av.reason === 'config' ? t.tapToPay.statusConfig
                            : av.reason === 'platform' ? t.tapToPay.statusPlatform
                              : t.tapToPay.statusFlag;
                return (
                    <SettingRow
                      icon="i/card"
                      chipColor="#6BA3BE"
                      label={t.tapToPay.settingsTitle}
                      sublabel={status}
                      rightElement={
                        <Switch
                          value={tapToPayEnabled}
                          onValueChange={(v) => { lightTap(); setTapToPayEnabled(v); }}
                          trackColor={{ false: C.border, true: C.positive }}
                          thumbColor={C.surface}
                        />
                      }
                      last
                    />
                );
              })()}
          </>
        )}

        <View style={{ height: SPACING['3xl'] }} />

        {ready && unitManagerVisible && (
          <UnitManager
            visible
            onClose={() => setUnitManagerVisible(false)}
          />
        )}

        {ready && stallUnitManagerVisible && (
          <StallUnitManager
            visible
            onClose={() => setStallUnitManagerVisible(false)}
          />
        )}

        {ready && stallCategoryManagerVisible && (
          <StallCategoryManager
            visible
            onClose={() => setStallCategoryManagerVisible(false)}
          />
        )}
      </ScrollView>
      <StallResetSheet
        visible={resetSheetVisible}
        onClose={() => setResetSheetVisible(false)}
        onDeleted={() => showToast(t.stall.deleteDataDone, 'success')}
      />
      <ModalToastHost />
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
  },
  sectionHeader: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
    marginLeft: SPACING.xs,
  },
  card: {
    marginBottom: SPACING.sm,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    minHeight: 44,
  },
  settingLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  settingLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  input: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    textAlign: 'right',
    flex: 1,
    marginLeft: SPACING.lg,
    paddingVertical: SPACING.xs,
  },
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: SPACING.xs,
  },
});

export default BusinessSettings;
