import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Switch,
  TouchableOpacity,
  Alert,
  Keyboard,
  Modal,
  Pressable,
  InteractionManager,
  Platform,
  LayoutAnimation,
  useWindowDimensions,
} from 'react-native';
import { FullWindowOverlay } from 'react-native-screens';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SettingRow from '../../components/common/SettingRow';
import NeuGroup from '../../components/common/NeuGroup';
import NeuButton from '../../components/common/NeuButton';
import { useNeu } from '../../components/common/neu';
import PaymentQrCard from '../../components/settings/PaymentQrCard';
import SubscriptionCard from '../../components/settings/SubscriptionCard';
import OcrDebugHarness from '../../components/dev/OcrDebugHarness';
import ModalToastHost from '../../components/common/ModalToastHost';
import Avatar from '../../components/common/Avatar';
import AvatarPicker from '../../components/common/AvatarPicker';
import { useSettingsStore } from '../../store/settingsStore';
import { usePersonalStore } from '../../store/personalStore';
import { useWalletStore } from '../../store/walletStore';
import { useReceiptStore } from '../../store/receiptStore';
import { useAppStore } from '../../store/appStore';
import { useAuthStore } from '../../store/authStore';
import { exportTransactionsCsv, exportWalletsCsv, exportSubscriptionsCsv, exportReceiptsCsv } from '../../services/exportService';
import { exportMonthlyStatement, exportTaxYearPdf } from '../../services/pdfExport';
import { MYTAX_CATEGORIES } from '../../constants/taxCategories';
import { syncCheckinReminders, formatCheckinTime } from '../../services/checkinReminders';
import { loadSampleData, SAMPLE_PROFILES, type SampleBracket } from '../../utils/sampleData';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { RootStackParamList, SettingsSection } from '../../types';
import { useToast } from '../../context/ToastContext';
import { lightTap } from '../../services/haptics';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';

/**
 * Personal-mode Settings: hub, personal money setup, personal data tools, and
 * the personal-only danger zone (delete personal data). Nothing business-only
 * renders here. Shared app/device settings live in AppSettings (reached via the
 * preferences/security/about sections). Rendered by the shared Settings router.
 */
const PersonalSettings: React.FC<{ section?: SettingsSection; scrollTo?: string }> = ({ section, scrollTo }) => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  // Explicit size for the FullWindowOverlay child (time picker).
  const { width: winW, height: winH } = useWindowDimensions();
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const neu = useNeu(undefined, { faintDark: true });
  const neuFull = useNeu(); // full neu for focal hero icons (icons LIFT)
  const styles = useMemo(() => makeStyles(C), [C]);
  const { showToast } = useToast();

  const [ready, setReady] = useState(false);
  const [businessInfoVisible, setBusinessInfoVisible] = useState(false);
  const [sampleModalVisible, setSampleModalVisible] = useState(false);
  // Daily check-in reminder times: overlay time-picker shown while adding.
  const [addingCheckinTime, setAddingCheckinTime] = useState(false);
  const [checkinDraft, setCheckinDraft] = useState<Date>(() => {
    const d = new Date();
    d.setHours(21, 0, 0, 0);
    return d;
  });
  const scrollRef = useRef<any>(null);
  const sectionY = useRef<Record<string, number>>({});

  const setMode = useAppStore((s) => s.setMode);
  const userName = useSettingsStore((s) => s.userName);
  const setUserName = useSettingsStore((s) => s.setUserName);
  const [avatarPickerVisible, setAvatarPickerVisible] = useState(false);
  const currency = useSettingsStore((s) => s.currency);
  const businessModeEnabled = useSettingsStore((s) => s.businessModeEnabled);
  const setBusinessModeEnabled = useSettingsStore((s) => s.setBusinessModeEnabled);
  const walletEchoHidden = useSettingsStore((s) => s.walletEchoHidden);
  const setWalletEchoHidden = useSettingsStore((s) => s.setWalletEchoHidden);
  const budgetEchoHidden = useSettingsStore((s) => s.budgetEchoHidden);
  const setBudgetEchoHidden = useSettingsStore((s) => s.setBudgetEchoHidden);
  const commitmentEchoHidden = useSettingsStore((s) => s.commitmentEchoHidden);
  const setCommitmentEchoHidden = useSettingsStore((s) => s.setCommitmentEchoHidden);
  const savingsEchoHidden = useSettingsStore((s) => s.savingsEchoHidden);
  const setSavingsEchoHidden = useSettingsStore((s) => s.setSavingsEchoHidden);
  const pulseEchoHidden = useSettingsStore((s) => s.pulseEchoHidden);
  const setPulseEchoHidden = useSettingsStore((s) => s.setPulseEchoHidden);
  const echoDailyCheckin = useSettingsStore((s) => s.echoDailyCheckin);
  const setEchoDailyCheckin = useSettingsStore((s) => s.setEchoDailyCheckin);
  const echoCheckinTimes = useSettingsStore((s) => s.echoCheckinTimes);
  const setEchoCheckinTimes = useSettingsStore((s) => s.setEchoCheckinTimes);

  // Check-in toggle/time changes re-sync the OS notification schedule.
  const applyCheckin = useCallback(async (enabled: boolean, times: string[]) => {
    setEchoDailyCheckin(enabled);
    setEchoCheckinTimes(times);
    const ok = await syncCheckinReminders(enabled, times);
    if (enabled && !ok) showToast(t.settings.checkinPermissionNeeded, 'info');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);
  const quickAddConfirm = useSettingsStore((s) => s.quickAddConfirm);
  const setQuickAddConfirm = useSettingsStore((s) => s.setQuickAddConfirm);
  const spendingAlertsEnabled = useSettingsStore((s) => s.spendingAlertsEnabled);
  const setSpendingAlertsEnabled = useSettingsStore((s) => s.setSpendingAlertsEnabled);
  const clearPersonalData = useSettingsStore((s) => s.clearPersonalData);
  const isAuthenticated = useAuthStore((s) => s.personal.isAuthenticated);

  // Defer heavy sub-sections until interactions settle, so opening the screen
  // feels instant. A deep-link (scrollTo) needs them immediately, so skip the
  // wait in that case. 400ms fallback guards against a never-firing task when
  // navigating in from a still-animating modal.
  useEffect(() => {
    if (ready) return;
    if (scrollTo) { setReady(true); return; }
    const task = InteractionManager.runAfterInteractions(() => setReady(true));
    const fallback = setTimeout(() => setReady(true), 400);
    return () => { task.cancel(); clearTimeout(fallback); };
  }, [scrollTo, ready]);

  useEffect(() => {
    if (!scrollTo || !ready) return;
    // Category deep-links (CategoryPicker "manage", MoneyChat, NoteEditor…)
    // now land on the dedicated screen — forward instead of scrolling.
    if (scrollTo === 'categories') {
      navigation.setParams({ scrollTo: undefined } as never);
      navigation.navigate('ManageCategories', { mode: 'personal' });
      return;
    }
    const timer = setTimeout(() => {
      if (sectionY.current[scrollTo] !== undefined) {
        scrollRef.current?.scrollTo({ y: sectionY.current[scrollTo], animated: true });
      }
      navigation.setParams({ scrollTo: undefined } as never);
    }, 100);
    return () => clearTimeout(timer);
  }, [scrollTo, ready, navigation]);

  useEffect(() => {
    if (!section) return;
    const titles: Record<string, string> = {
      money: t.settings.moneySetup,
      data: t.settings.data,
    };
    if (titles[section]) navigation.setOptions({ title: titles[section] });
  }, [section, navigation, t]);

  const handleBusinessModeToggle = useCallback((value: boolean) => {
    lightTap();
    setBusinessModeEnabled(value);
    if (!value) {
      navigation.goBack();
      setMode('personal');
    }
    showToast(
      value ? t.settings.businessModeEnabledToast : t.settings.businessModeDisabledToast,
      'success'
    );
  }, [setBusinessModeEnabled, navigation, setMode, showToast, t]);

  const handleViewReports = useCallback(() => {
    lightTap();
    navigation.navigate('PersonalReports');
  }, [navigation]);

  const handleExportData = useCallback(() => {
    lightTap();
    const name = useSettingsStore.getState().userName;

    const doCsv = async (kind: 'transactions' | 'wallets' | 'subscriptions' | 'receipts') => {
      try {
        if (kind === 'transactions') await exportTransactionsCsv(usePersonalStore.getState().transactions);
        else if (kind === 'wallets') await exportWalletsCsv(useWalletStore.getState().wallets);
        else if (kind === 'subscriptions') await exportSubscriptionsCsv(usePersonalStore.getState().subscriptions);
        else if (kind === 'receipts') await exportReceiptsCsv(useReceiptStore.getState().receipts);
      } catch (err: any) {
        Alert.alert(t.settings.exportFailed, err?.message || t.settings.exportFailedMsg);
      }
    };

    const doMonthlyPdf = async () => {
      try {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        await exportMonthlyStatement({
          start, end, userName: name, currency,
          transactions: usePersonalStore.getState().transactions,
          wallets: useWalletStore.getState().wallets,
        });
      } catch (err: any) {
        Alert.alert(t.settings.exportFailed, err?.message || t.settings.couldNotGeneratePdf);
      }
    };

    const doTaxPdf = async () => {
      try {
        const year = new Date().getFullYear();
        const categoryNames = Object.fromEntries(MYTAX_CATEGORIES.map((c) => [c.id, c.name]));
        await exportTaxYearPdf({
          year, userName: name, currency,
          receipts: useReceiptStore.getState().receipts,
          categoryNames,
        });
      } catch (err: any) {
        Alert.alert(t.settings.exportFailed, err?.message || t.settings.couldNotGeneratePdf);
      }
    };

    const showCsvMenu = () => {
      Alert.alert(t.settings.csvExport, t.settings.chooseWhatToExport, [
        { text: t.settings.transactionsLabel, onPress: () => doCsv('transactions') },
        { text: t.settings.wallets, onPress: () => doCsv('wallets') },
        { text: t.settings.subscriptionsLabel, onPress: () => doCsv('subscriptions') },
        { text: t.settings.receiptsLabel, onPress: () => doCsv('receipts') },
        { text: t.common.cancel, style: 'cancel' },
      ]);
    };

    Alert.alert(t.settings.exportDataTitle, t.settings.chooseFormat, [
      { text: t.settings.monthlyPdf, onPress: doMonthlyPdf },
      { text: t.settings.taxYearPdf.replace('{year}', String(new Date().getFullYear())), onPress: doTaxPdf },
      { text: t.settings.csvEllipsis, onPress: showCsvMenu },
      { text: t.common.cancel, style: 'cancel' },
    ]);
  }, [currency, t]);

  const handleLoadSampleData = useCallback(() => {
    lightTap();
    setSampleModalVisible(true);
  }, []);

  const handlePickSampleProfile = useCallback((bracket: SampleBracket) => {
    lightTap();
    setSampleModalVisible(false);
    setTimeout(() => {
      try {
        loadSampleData(bracket);
        showToast(t.settings.loadSampleDataSuccess, 'success');
      } catch {
        showToast('Failed to load demo data', 'error');
      }
    }, 120);
  }, [t, showToast]);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      t.settings.deleteAccountTitle,
      t.settings.deleteAccountWarning,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.settings.continueLabel,
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              t.settings.absolutelySure,
              t.settings.absolutelySureMsg,
              [
                { text: t.common.cancel, style: 'cancel' },
                {
                  text: t.settings.deleteEverything,
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await clearPersonalData();
                      showToast(t.settings.accountDeleted, 'success');
                    } catch (err: any) {
                      Alert.alert(t.settings.errorLabel, err?.message || t.settings.deletionError);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }, [clearPersonalData, showToast, t]);

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
            <NeuGroup style={styles.card}>
              <View style={[styles.settingRow, { paddingVertical: 13, minHeight: 56 }]}>
                <View style={styles.settingLabelRow}>
                  <Pressable
                    onPress={() => { lightTap(); setAvatarPickerVisible(true); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={t.settings.avatarTitle}
                  >
                    <Avatar size={42} />
                  </Pressable>
                  <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.name}</Text>
                </View>
                <TextInput
                  value={userName}
                  onChangeText={setUserName}
                  placeholder={t.settings.enterYourName}
                  placeholderTextColor={C.neutral}
                  style={[styles.input, { color: C.textPrimary }]}
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={withAlpha(C.accent, 0.25)}
                />
              </View>
            </NeuGroup>

            {/* Mode */}
            <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>{t.settings.modeSection}</Text>
              <SettingRow
                icon="i/briefcase"
                chipColor="#5A5320"
                label={t.settings.businessMode}
                sublabel={t.settings.businessModeDesc}
                rightElement={
                  <Switch
                    value={businessModeEnabled}
                    onValueChange={handleBusinessModeToggle}
                    trackColor={{ false: C.border, true: C.positive }}
                    thumbColor={C.surface}
                  />
                }
              />
              <SettingRow
                icon="i/information-circle-outline"
                chipColor="#6BA3BE"
                label={t.settings.businessModeHow}
                onPress={() => { lightTap(); setBusinessInfoVisible(true); }}
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

            <SubscriptionCard variant="personal" />

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
                icon="m/database"
                chipColor="#6BA3BE"
                label={t.settings.data}
                onPress={() => { lightTap(); navigation.navigate('SettingsDetail', { section: 'data' }); }}
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

            {/* Danger zone — personal only */}
            <Text style={[styles.sectionHeader, { color: '#B5705A' }]}>{t.settings.dangerZone}</Text>
              <SettingRow
                icon="i/trash-outline"
                chipColor="#B5705A"
                label={t.settings.deleteAccount}
                onPress={handleDeleteAccount}
                last
              />
          </>
        )}

        {/* ── MONEY SETUP ── */}
        {section === 'money' && (
          <>
            <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>{t.settings.moneySetup}</Text>
              {Platform.OS === 'ios' && !Platform.isPad && (
                <SettingRow
                  icon="i/flash"
                  chipColor="#DEAB22"
                  label={t.settings.quickLog.row}
                  sublabel={t.settings.quickLog.rowSub}
                  onPress={() => { lightTap(); navigation.navigate('QuickLogSetup' as never); }}
                />
              )}

              {/* One entry for all four managers — its own screen. */}
              <SettingRow
                icon="i/pricetags"
                chipColor="#9A6400"
                label={t.settings.manageCategoriesRow}
                sublabel={t.settings.manageCategoriesDesc}
                onPress={() => { lightTap(); navigation.navigate('ManageCategories', { mode: 'personal' }); }}
              />

              {/* Transaction-entry preferences — ABOVE the QR section (owner request). */}
              <SettingRow
                icon="i/checkmark-circle"
                chipColor="#4F5104"
                label={t.settings.quickAddConfirm}
                sublabel={t.settings.quickAddConfirmDesc}
                rightElement={
                  <Switch
                    value={quickAddConfirm}
                    onValueChange={(v) => { lightTap(); setQuickAddConfirm(v); }}
                    trackColor={{ false: C.border, true: C.positive }}
                    thumbColor={C.surface}
                  />
                }
              />
              <SettingRow
                icon="i/trending-up"
                chipColor="#B2780A"
                label={t.settings.spendingAlerts}
                sublabel={t.settings.spendingAlertsDesc}
                rightElement={
                  <Switch
                    value={spendingAlertsEnabled}
                    onValueChange={(v) => { lightTap(); setSpendingAlertsEnabled(v); }}
                    trackColor={{ false: C.border, true: C.positive }}
                    thumbColor={C.surface}
                  />
                }
              />

              <NeuGroup style={styles.card} onLayout={(e) => { sectionY.current.qr = e.nativeEvent.layout.y; }}>
                <PaymentQrCard mode="personal" />
              </NeuGroup>

              {/* Echo visibility — its own card */}
              <NeuGroup style={styles.card}>
              <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xs }}>
                <View style={styles.settingLabelRow}>
                  <View style={{ width: 34, height: 34, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha('#B2780A', isDark ? 0.2 : 0.12) }}>
                    <Feather name="zap" size={18} color="#B2780A" />
                  </View>
                  <Text style={[styles.settingLabel, { color: C.textPrimary, marginLeft: 0 }]}>{t.settings.echoVisibility}</Text>
                </View>
              </View>
              <View style={[styles.settingRow, { paddingHorizontal: SPACING.lg }]}>
                <Text style={[styles.settingLabel, { color: C.textSecondary, flex: 1 }]}>{t.settings.echoOnWallets}</Text>
                <Switch
                  value={!walletEchoHidden}
                  onValueChange={(v) => { lightTap(); setWalletEchoHidden(!v); }}
                  trackColor={{ false: C.border, true: C.positive }}
                  thumbColor={C.surface}
                />
              </View>
              <View style={[styles.settingRow, { paddingHorizontal: SPACING.lg }]}>
                <Text style={[styles.settingLabel, { color: C.textSecondary, flex: 1 }]}>{t.settings.echoOnBudgets}</Text>
                <Switch
                  value={!budgetEchoHidden}
                  onValueChange={(v) => { lightTap(); setBudgetEchoHidden(!v); }}
                  trackColor={{ false: C.border, true: C.positive }}
                  thumbColor={C.surface}
                />
              </View>
              <View style={[styles.settingRow, { paddingHorizontal: SPACING.lg }]}>
                <Text style={[styles.settingLabel, { color: C.textSecondary, flex: 1 }]}>{t.settings.echoOnCommitments}</Text>
                <Switch
                  value={!commitmentEchoHidden}
                  onValueChange={(v) => { lightTap(); setCommitmentEchoHidden(!v); }}
                  trackColor={{ false: C.border, true: C.positive }}
                  thumbColor={C.surface}
                />
              </View>
              <View style={[styles.settingRow, { paddingHorizontal: SPACING.lg }]}>
                <Text style={[styles.settingLabel, { color: C.textSecondary, flex: 1 }]}>{t.settings.echoOnSavings}</Text>
                <Switch
                  value={!savingsEchoHidden}
                  onValueChange={(v) => { lightTap(); setSavingsEchoHidden(!v); }}
                  trackColor={{ false: C.border, true: C.positive }}
                  thumbColor={C.surface}
                />
              </View>
              <View style={[styles.settingRow, { paddingHorizontal: SPACING.lg }]}>
                <Text style={[styles.settingLabel, { color: C.textSecondary, flex: 1 }]}>{t.settings.echoOnPulse}</Text>
                <Switch
                  value={!pulseEchoHidden}
                  onValueChange={(v) => { lightTap(); setPulseEchoHidden(!v); }}
                  trackColor={{ false: C.border, true: C.positive }}
                  thumbColor={C.surface}
                />
              </View>
              <View style={[styles.settingRow, { paddingHorizontal: SPACING.lg, paddingBottom: echoDailyCheckin ? 0 : SPACING.md }]}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={[styles.settingLabel, { color: C.textSecondary }]}>{t.settings.echoCheckin}</Text>
                  <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: 2 }}>{t.settings.echoCheckinDesc}</Text>
                </View>
                <Switch
                  value={echoDailyCheckin}
                  onValueChange={(v) => {
                    lightTap();
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    applyCheckin(v, echoCheckinTimes.length ? echoCheckinTimes : ['21:00']);
                  }}
                  trackColor={{ false: C.border, true: C.positive }}
                  thumbColor={C.surface}
                />
              </View>
              {echoDailyCheckin && (
                <View style={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md }}>
                  <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginBottom: SPACING.xs }}>
                    {t.settings.checkinTimesLabel}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm }}>
                    {echoCheckinTimes.map((tm) => (
                      <Pressable
                        key={tm}
                        onPress={() => {
                          lightTap();
                          // Tap a chip to remove it (last one can't be removed —
                          // turn the toggle off instead, so "on" always reminds).
                          if (echoCheckinTimes.length <= 1) return;
                          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                          applyCheckin(true, echoCheckinTimes.filter((x) => x !== tm));
                        }}
                        style={[styles.checkinChip, neu.raised]}
                        accessibilityRole="button"
                      >
                        <Text style={{ fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary }}>
                          {formatCheckinTime(tm)}
                        </Text>
                        {echoCheckinTimes.length > 1 && <Feather name="x" size={13} color={C.textMuted} />}
                      </Pressable>
                    ))}
                    <Pressable
                      onPress={() => { lightTap(); setAddingCheckinTime(true); }}
                      style={[styles.checkinChip, neu.raised]}
                      accessibilityRole="button"
                      accessibilityLabel={t.settings.checkinAddTime}
                    >
                      <Feather name="plus" size={14} color={C.accent} />
                      <Text style={{ fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.accent }}>
                        {t.settings.checkinAddTime}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              )}

              </NeuGroup>
          </>
        )}

        {/* ── DATA ── */}
        {section === 'data' && (
          <>
            <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>{t.settings.data}</Text>
              <SettingRow
                icon="i/stats-chart"
                chipColor="#4F5104"
                label={t.settings.viewReports}
                onPress={handleViewReports}
              />
              <SettingRow
                icon="i/download"
                chipColor="#9A6400"
                label={t.settings.exportData}
                onPress={handleExportData}
              />
              <SettingRow
                icon="i/document-text-outline"
                chipColor="#6BA3BE"
                label={t.settings.importFromStatement}
                onPress={() => { lightTap(); navigation.navigate('ImportFromStatement' as never); }}
              />
              <SettingRow
                icon="i/document-attach-outline"
                chipColor="#6BA3BE"
                label={t.settings.importFromCsv}
                onPress={() => { lightTap(); navigation.navigate('ImportFromCsv' as never); }}
              />
              <SettingRow
                icon="i/cloud-upload-outline"
                chipColor="#4F5104"
                label={t.settings.backupsRestore}
                onPress={() => { lightTap(); navigation.navigate('BackupRestore' as never); }}
              />
              <SettingRow
                icon="m/database"
                chipColor="#A688B8"
                label={t.settings.loadSampleData}
                onPress={handleLoadSampleData}
                last
              />
          </>
        )}

        <View style={{ height: SPACING['3xl'] }} />
      </ScrollView>

      {/* Check-in time picker — overlay card (no inline dropdown, owner call).
          FullWindowOverlay so the dim covers the nav header too; explicit size
          because its window gives absoluteFill nothing to resolve against. */}
      {addingCheckinTime && (
        <FullWindowOverlay>
          <View style={[styles.timeOverlay, { width: winW, height: winH }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setAddingCheckinTime(false)} accessibilityLabel={t.common.close} />
            <View style={styles.timeCard}>
              <DateTimePicker
                value={checkinDraft}
                mode="time"
                display="spinner"
                themeVariant={isDark ? 'dark' : 'light'}
                accentColor={C.accent}
                style={styles.timeSpinner}
                onChange={(_e, d) => { if (d) setCheckinDraft(d); }}
              />
              <NeuButton
                icon="check"
                label={t.common.done}
                onPress={() => {
                  const hh = String(checkinDraft.getHours()).padStart(2, '0');
                  const mm = String(checkinDraft.getMinutes()).padStart(2, '0');
                  const next = `${hh}:${mm}`;
                  setAddingCheckinTime(false);
                  if (!echoCheckinTimes.includes(next)) {
                    applyCheckin(true, [...echoCheckinTimes, next].sort());
                  }
                }}
              />
            </View>
          </View>
        </FullWindowOverlay>
      )}

      {/* Business mode explainer */}
      <Modal
        visible={businessInfoVisible}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setBusinessInfoVisible(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: SPACING.lg }}
          onPress={() => setBusinessInfoVisible(false)}
        >
          <View
            onStartShouldSetResponder={() => true}
            style={[{ width: '100%', maxWidth: 440, borderRadius: RADIUS.xl, padding: SPACING.xl }, neu.raisedModal]}
          >
            <View style={[{ width: 52, height: 52, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center', marginBottom: SPACING.md }, neuFull.raised, { backgroundColor: withAlpha(C.accent, 0.12) }]}>
              <Feather name="briefcase" size={24} color={C.accent} />
            </View>
            <Text style={{ fontSize: TYPOGRAPHY.size.lg, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary, marginBottom: SPACING.sm }}>{t.settings.businessModeInfoTitle}</Text>
            <Text style={{ fontSize: TYPOGRAPHY.size.sm, lineHeight: 22, color: C.textSecondary, marginBottom: SPACING.lg }}>{t.settings.businessModeInfoBody}</Text>
            <NeuButton
              label={t.settings.businessModeInfoGotIt}
              onPress={() => setBusinessInfoVisible(false)}
            />
          </View>
        </Pressable>
      </Modal>

      {/* Demo-data profile picker */}
      <Modal
        visible={sampleModalVisible}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setSampleModalVisible(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: SPACING.lg }}
          onPress={() => setSampleModalVisible(false)}
        >
          <View
            onStartShouldSetResponder={() => true}
            style={[{ width: '100%', maxWidth: 440, borderRadius: RADIUS.xl, padding: SPACING.xl }, neu.raisedModal]}
          >
            <Text style={{ fontSize: TYPOGRAPHY.size.lg, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary, marginBottom: SPACING.xs }}>{t.sampleData.pickTitle}</Text>
            <Text style={{ fontSize: TYPOGRAPHY.size.sm, lineHeight: 20, color: C.textSecondary, marginBottom: SPACING.lg }}>{t.settings.loadSampleDataConfirm}</Text>

            {SAMPLE_PROFILES.map((p, i) => {
              const info = t.sampleData.profiles[p.id];
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => handlePickSampleProfile(p.id)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${info.name} · ${p.age}`}
                  style={[{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: SPACING.md,
                    paddingVertical: SPACING.md,
                    paddingHorizontal: SPACING.md,
                    borderRadius: RADIUS.lg,
                    marginTop: i === 0 ? 0 : SPACING.sm,
                  }, neu.raisedSoft]}
                >
                  <View style={{ width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: withAlpha(C.accent, 0.12), alignItems: 'center', justifyContent: 'center' }}>
                    <Feather name={p.icon as keyof typeof Feather.glyphMap} size={20} color={C.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary }}>{info.name} · {p.age}</Text>
                    <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary, marginTop: 1 }}>{info.blurb}</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={C.textMuted} />
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
        <ModalToastHost />
      </Modal>

      {__DEV__ && <OcrDebugHarness />}

      <AvatarPicker visible={avatarPickerVisible} onClose={() => setAvatarPickerVisible(false)} />
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
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
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
    paddingHorizontal: SPACING.lg,
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
  // Check-in time-picker overlay (FabChoiceModal centered-dialog recipe).
  timeOverlay: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  timeCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    // NO alignItems:'center' — it let the Done button shrink to its content;
    // children stretch by default so the CTA spans the card (owner: wider Done).
    ...SHADOWS.lg,
  },
  timeSpinner: { alignSelf: 'center' },
  // Daily check-in reminder-time chips (Neu Pills recipe: faintDark raised).
  checkinChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textPrimary, 0.03),
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

export default PersonalSettings;
