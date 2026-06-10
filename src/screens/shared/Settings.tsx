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
  Pressable,
  ActivityIndicator,
  Modal,
  InteractionManager,
  Image,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Share,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSettingsStore, clearBusinessLocalData } from '../../store/settingsStore';
import { usePersonalStore } from '../../store/personalStore';
import ModalToastHost from '../../components/common/ModalToastHost';
import { useBusinessStore } from '../../store/businessStore';
import { useAppStore } from '../../store/appStore';
import { usePremiumStore } from '../../store/premiumStore';
import { useWalletStore } from '../../store/walletStore';
import { useReceiptStore } from '../../store/receiptStore';
import { exportTransactionsCsv, exportWalletsCsv, exportSubscriptionsCsv, exportReceiptsCsv } from '../../services/exportService';
import { exportMonthlyStatement, exportTaxYearPdf } from '../../services/pdfExport';
import { MYTAX_CATEGORIES } from '../../constants/taxCategories';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { FREE_TIER, PREMIUM_CONFIG } from '../../constants/premium';
import { RootStackParamList } from '../../types';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import CategoryManager from '../../components/common/CategoryManager';
import PaymentMethodManager from '../../components/common/PaymentMethodManager';
import UnitManager from '../../components/common/UnitManager';
import { useToast } from '../../context/ToastContext';
import { lightTap } from '../../services/haptics';
import { tapToPayAvailable } from '../../services/tapToPay';
import * as Clipboard from 'expo-clipboard';
import { openQuickAdd } from '../../components/common/QuickAddExpense';
import { signOut } from '../../services/supabase';
import { clearProfileCache, syncAll } from '../../services/sellerSync';
import { useAuthStore } from '../../store/authStore';
import { useSellerStore } from '../../store/sellerStore';
import { syncPersonal, disablePersonalSync } from '../../services/personalSync';
import { resetBackoff } from '../../services/syncBackoff';
import { getOrCreateReferralCode, referralMessage } from '../../services/referrals';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { loadDummyData } from '../../utils/dummyData';
import type { ThemePreference, AppLanguage } from '../../store/settingsStore';

const CURRENCY_OPTIONS = [
  // Southeast Asia
  { code: 'RM', label: 'Malaysian Ringgit' },
  { code: 'SGD', label: 'Singapore Dollar' },
  { code: 'IDR', label: 'Indonesian Rupiah' },
  { code: 'THB', label: 'Thai Baht' },
  { code: 'PHP', label: 'Philippine Peso' },
  { code: 'VND', label: 'Vietnamese Dong' },
  { code: 'BND', label: 'Brunei Dollar' },
  { code: 'KHR', label: 'Cambodian Riel' },
  { code: 'LAK', label: 'Lao Kip' },
  { code: 'MMK', label: 'Myanmar Kyat' },
  // International
  { code: 'USD', label: 'US Dollar' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GBP', label: 'British Pound' },
  { code: 'AUD', label: 'Australian Dollar' },
  { code: 'JPY', label: 'Japanese Yen' },
  { code: 'INR', label: 'Indian Rupee' },
  { code: 'CNY', label: 'Chinese Yuan' },
  { code: 'KRW', label: 'South Korean Won' },
];

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
  settingDescription: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    marginTop: 2,
    marginLeft: 18 + SPACING.md,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  settingValue: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textSecondary,
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
  qrSubtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginBottom: SPACING.md,
  },
  qrSlots: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  qrSlot: {
    flex: 1,
  },
  qrSlotFilled: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withAlpha(C.accent, 0.06),
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  qrSlotIcon: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.sm,
    backgroundColor: withAlpha(C.accent, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrSlotLabel: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  qrSlotEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.lg,
    gap: SPACING.xs,
  },
  qrSlotAddText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.accent,
  },
  // QR Action Sheet
  qrActionOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: SPACING['2xl'],
  },
  qrActionSheet: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: C.border,
  },
  qrActionTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  qrActionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  qrActionIconBg: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrActionText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  qrActionDivider: {
    height: 1,
    backgroundColor: C.border,
  },

  // ── QR Label Prompt ──
  qrLabelOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING['2xl'],
  },
  qrLabelCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING['2xl'],
    width: '100%',
    maxWidth: 340,
    gap: SPACING.lg,
  },
  qrLabelTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  qrLabelInput: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    backgroundColor: C.background,
  },
  qrLabelCancel: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  qrLabelSave: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    backgroundColor: C.accent,
    borderRadius: RADIUS.md,
  },

  // ── QR Preview (matches Dashboard style) ──
  qrPreviewOverlay: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrPreviewClose: {
    position: 'absolute',
    top: 72,
    right: SPACING.xl,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  qrPreviewLabel: {
    position: 'absolute',
    top: 80,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.bold,
    color: '#fff',
    zIndex: 10,
  },
  qrPreviewImage: {
    width: Dimensions.get('window').width - SPACING['2xl'] * 2,
    height: Dimensions.get('window').width - SPACING['2xl'] * 2,
    borderRadius: RADIUS.lg,
    backgroundColor: '#fff',
  },
  qrPreviewTabs: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
    zIndex: 10,
  },
  qrPreviewTab: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  qrPreviewTabActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  qrPreviewTabText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: 'rgba(255,255,255,0.5)',
  },
  qrPreviewTabTextActive: {
    color: '#fff',
  },

  // ── Currency Picker ──
  currencyOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING['2xl'],
  },
  currencyCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    width: '100%',
    maxWidth: 340,
    maxHeight: 420,
  },
  currencyTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.xs,
  },
  currencyList: {
    maxHeight: 360,
  },
  currencyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    marginBottom: 2,
  },
  currencyItemSelected: {
    backgroundColor: withAlpha(C.accent, 0.08),
  },
  currencyCode: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  currencyCodeSelected: {
    color: C.accent,
  },
  currencyLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: 1,
  },
});

const Settings: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<{ Settings: { scrollTo?: string } }, 'Settings'>>();
  const { showToast } = useToast();
  const [shortcutModalVisible, setShortcutModalVisible] = useState(false);
  const QUICK_ADD_LINK = 'potraces://add';
  const mode = useAppStore((state) => state.mode);
  const setMode = useAppStore((state) => state.setMode);
  const incomeType = useBusinessStore((s) => s.incomeType);
  const tier = usePremiumStore((s) => s.tier);
  const subscribe = usePremiumStore((s) => s.subscribe);
  const unsubscribe = usePremiumStore((s) => s.unsubscribe);
  const getRemainingScans = usePremiumStore((s) => s.getRemainingScans);
  const getRemainingAiCalls = usePremiumStore((s) => s.getRemainingAiCalls);
  const scanCount = usePremiumStore((s) => s.scanCount);
  const aiCallsCount = usePremiumStore((s) => s.aiCallsCount);
  const walletCount = useWalletStore((s) => s.wallets.length);
  const budgetCount = usePersonalStore((s) => s.budgets.length);

  const [ready, setReady] = useState(false);
  const [categoryManagerVisible, setCategoryManagerVisible] = useState(false);
  const [categoryManagerType, setCategoryManagerType] = useState<'expense' | 'income' | 'investment'>('expense');
  const [unitManagerVisible, setUnitManagerVisible] = useState(false);
  const [paymentMethodManagerVisible, setPaymentMethodManagerVisible] = useState(false);
  const [qrActionIndex, setQrActionIndex] = useState<number | null>(null);
  const [qrLoadingIndex, setQrLoadingIndex] = useState<number | null>(null);
  const [qrLabelModal, setQrLabelModal] = useState<{ visible: boolean; uri?: string; replaceIndex?: number; renameIndex?: number; defaultLabel: string }>({ visible: false, defaultLabel: '' });
  const [qrLabelInput, setQrLabelInput] = useState('');
  const [qrPreviewIndex, setQrPreviewIndex] = useState<number | null>(null);
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const scrollRef = useRef<any>(null);
  const sectionY = useRef<Record<string, number>>({});

  const userName = useSettingsStore((s) => s.userName);
  const currency = useSettingsStore((s) => s.currency);
  const hapticEnabled = useSettingsStore((s) => s.hapticEnabled);
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const businessModeEnabled = useSettingsStore((s) => s.businessModeEnabled);
  const walletEchoHidden = useSettingsStore((s) => s.walletEchoHidden);
  const setWalletEchoHidden = useSettingsStore((s) => s.setWalletEchoHidden);
  const budgetEchoHidden = useSettingsStore((s) => s.budgetEchoHidden);
  const setBudgetEchoHidden = useSettingsStore((s) => s.setBudgetEchoHidden);
  const commitmentEchoHidden = useSettingsStore((s) => s.commitmentEchoHidden);
  const setCommitmentEchoHidden = useSettingsStore((s) => s.setCommitmentEchoHidden);
  const defaultMode = useSettingsStore((s) => s.defaultMode);
  const setUserName = useSettingsStore((s) => s.setUserName);
  const setCurrency = useSettingsStore((s) => s.setCurrency);
  const setHapticEnabled = useSettingsStore((s) => s.setHapticEnabled);
  const setNotificationsEnabled = useSettingsStore((s) => s.setNotificationsEnabled);
  const setBusinessModeEnabled = useSettingsStore((s) => s.setBusinessModeEnabled);
  const setDefaultMode = useSettingsStore((s) => s.setDefaultMode);
  const biometricLockEnabled = useSettingsStore((s) => s.biometricLockEnabled);
  const setBiometricLockEnabled = useSettingsStore((s) => s.setBiometricLockEnabled);
  const biometricLockTimeoutMin = useSettingsStore((s) => s.biometricLockTimeoutMin);
  const setBiometricLockTimeoutMin = useSettingsStore((s) => s.setBiometricLockTimeoutMin);
  const personalSyncEnabled = useSettingsStore((s) => s.personalSyncEnabled);
  const setPersonalSyncEnabled = useSettingsStore((s) => s.setPersonalSyncEnabled);
  const lastPersonalSyncAt = useSettingsStore((s) => s.lastPersonalSyncAt);
  const spendingAlertsEnabled = useSettingsStore((s) => s.spendingAlertsEnabled);
  const setSpendingAlertsEnabled = useSettingsStore((s) => s.setSpendingAlertsEnabled);
  const quickAddConfirm = useSettingsStore((s) => s.quickAddConfirm);
  const setQuickAddConfirm = useSettingsStore((s) => s.setQuickAddConfirm);
  const tapToPayEnabled = useSettingsStore((s) => s.tapToPayEnabled);
  const setTapToPayEnabled = useSettingsStore((s) => s.setTapToPayEnabled);
  const personalQrs = useSettingsStore((s) => s.paymentQrs) || [];
  const businessQrs = useSettingsStore((s) => s.businessPaymentQrs) || [];
  const paymentQrs = mode === 'business' ? businessQrs : personalQrs;
  const addPaymentQr = useSettingsStore((s) => s.addPaymentQr);
  const removePaymentQr = useSettingsStore((s) => s.removePaymentQr);
  const replacePaymentQr = useSettingsStore((s) => s.replacePaymentQr);
  const updatePaymentQrLabel = useSettingsStore((s) => s.updatePaymentQrLabel);
  const clearAllData = useSettingsStore((s) => s.clearAllData);
  const clearBusinessData = useSettingsStore((s) => s.clearBusinessData);
  const themePreference = useSettingsStore((s) => s.themePreference);
  const setThemePreference = useSettingsStore((s) => s.setThemePreference);
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);

  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);

  useEffect(() => {
    if (ready) return;
    if (route.params?.scrollTo) {
      setReady(true);
      return;
    }
    // InteractionManager may never fire if a Modal is still animating when this
    // screen mounts (navigating from inside a Modal). The 400ms fallback ensures
    // the screen is never permanently blank/unresponsive.
    const task = InteractionManager.runAfterInteractions(() => setReady(true));
    const fallback = setTimeout(() => setReady(true), 400);
    return () => {
      task.cancel();
      clearTimeout(fallback);
    };
  }, [route.params?.scrollTo]);

  useEffect(() => {
    const target = route.params?.scrollTo;
    if (!target || !ready) return;
    // Small delay to let onLayout fire after deferred sections render
    const timer = setTimeout(() => {
      if (sectionY.current[target] !== undefined) {
        scrollRef.current?.scrollTo({ y: sectionY.current[target], animated: true });
      }
      navigation.setParams({ scrollTo: undefined });
    }, 100);
    return () => clearTimeout(timer);
  }, [route.params?.scrollTo, ready]);

  const handleCurrencyPress = useCallback(() => {
    lightTap();
    setCurrencyModalVisible(true);
  }, []);

  const handleDefaultModePress = useCallback(() => {
    lightTap();
    Alert.alert(t.settings.defaultModeAlertTitle, t.settings.defaultModeAlertMsg, [
      {
        text: `${t.settings.personal}${defaultMode === 'personal' ? '  \u2713' : ''}`,
        onPress: () => {
          setDefaultMode('personal');
          showToast(t.settings.defaultModeSetPersonal, 'success');
        },
      },
      {
        text: `${t.settings.business}${defaultMode === 'business' ? '  \u2713' : ''}`,
        onPress: () => {
          setDefaultMode('business');
          showToast(t.settings.defaultModeSetBusiness, 'success');
        },
      },
      { text: t.common.cancel, style: 'cancel' },
    ]);
  }, [defaultMode, setDefaultMode, showToast, t]);

  const handleViewReports = useCallback(() => {
    lightTap();
    navigation.navigate(
      mode === 'personal' ? 'PersonalReports' : 'BusinessReports'
    );
  }, [mode, navigation]);

  const handleExportData = useCallback(() => {
    lightTap();
    const userName = useSettingsStore.getState().userName;

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
          start, end, userName, currency,
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
          year, userName, currency,
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
    Alert.alert(
      t.settings.loadSampleData,
      t.settings.loadSampleDataConfirm,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.confirm,
          onPress: () => {
            setTimeout(() => {
              try {
                loadDummyData();
                showToast(t.settings.loadSampleDataSuccess, 'success');
              } catch {
                showToast('Failed to load sample data', 'error');
              }
            }, 50);
          },
        },
      ]
    );
  }, [t, showToast]);

  const handlePickQrImage = useCallback(async (replaceIndex?: number) => {
    lightTap();
    setQrLoadingIndex(replaceIndex ?? paymentQrs.length);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
      });
      if (result.canceled || !result.assets?.[0]) { setQrLoadingIndex(null); return; }
      const srcUri = result.assets[0].uri;
      let destUri = srcUri;
      try {
        const dir = `${FileSystem.documentDirectory}payment-qrs/`;
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
        const filename = `qr_${Date.now()}.jpg`;
        destUri = `${dir}${filename}`;
        await FileSystem.copyAsync({ from: srcUri, to: destUri });
      } catch {
        destUri = srcUri;
      }
      const defaultLabel = replaceIndex !== undefined ? (paymentQrs[replaceIndex]?.label || '') : '';
      setQrLoadingIndex(null);
      setTimeout(() => {
        setQrLabelInput(defaultLabel);
        setQrLabelModal({ visible: true, uri: destUri, replaceIndex, defaultLabel });
      }, 50);
    } catch {
      setQrLoadingIndex(null);
    }
  }, [paymentQrs]);

  const handleQrLongPress = useCallback((index: number) => {
    lightTap();
    setQrActionIndex(index);
  }, []);

  const handleQrAction = useCallback((action: 'replace' | 'rename' | 'delete') => {
    const index = qrActionIndex;
    if (index === null) return;
    const qr = paymentQrs[index];
    if (!qr) return;
    setQrActionIndex(null);

    if (action === 'replace') {
      // Close modal first, then launch picker after delay (onDismiss is iOS-only)
      setTimeout(() => handlePickQrImage(index), 100);
    } else if (action === 'rename') {
      setQrLabelInput(qr.label);
      setQrLabelModal({ visible: true, renameIndex: index, defaultLabel: qr.label });
    } else if (action === 'delete') {
      removePaymentQr(index, mode);
      showToast(t.settings.qrRemoved, 'success');
    }
  }, [qrActionIndex, paymentQrs, updatePaymentQrLabel, removePaymentQr, showToast, mode, t]);

  const handleDeleteAccount = useCallback(() => {
    // Step 1: initial warning
    Alert.alert(
      t.settings.deleteAccountTitle,
      t.settings.deleteAccountWarning,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.settings.continueLabel,
          style: 'destructive',
          onPress: () => {
            // Step 2: biometric (if enabled) — we don't gate with expo-local-auth here
            // because the clear operation is destructive and an attacker with the phone
            // already has full access. Instead require a final explicit confirmation.
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
                      // clearAllData now handles both personal + business cleanup,
                      // remote wipe, sign out, FileSystem deletion, and AsyncStorage clear.
                      await clearAllData();
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
  }, [clearAllData, showToast, t]);

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
            const { isAuthenticated, isVerified } = useAuthStore.getState();
            let syncData: { products: any; orders: any; seasons: any; sellerCustomers: any } | null = null;
            if (isAuthenticated && isVerified) {
              const { products, orders, seasons, sellerCustomers } = useSellerStore.getState();
              syncData = { products, orders, seasons, sellerCustomers };
            }

            // Reset auth + navigate IMMEDIATELY so sign-out feels instant.
            useAuthStore.getState().reset();
            clearProfileCache();
            if (navigation.canGoBack()) navigation.goBack();

            // Background cleanup — user already sees AuthScreen.
            if (syncData) syncAll(syncData.products, syncData.orders, syncData.seasons, syncData.sellerCustomers).catch(() => {});
            clearBusinessLocalData().catch(() => {});
            signOut().catch(() => {});
          },
        },
      ]
    );
  }, [showToast, t, navigation]);

  const handleHapticToggle = useCallback((value: boolean) => {
    setHapticEnabled(value);
    if (value) lightTap();
  }, [setHapticEnabled]);

  const handleBiometricToggle = useCallback(async (value: boolean) => {
    lightTap();
    if (!value) {
      setBiometricLockEnabled(false);
      return;
    }
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware) {
        Alert.alert(t.settings.notSupported, t.settings.biometricNotSupported);
        return;
      }
      if (!enrolled) {
        Alert.alert(
          t.settings.noBiometricsSetUp,
          t.settings.noBiometricsMsg
        );
        return;
      }
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: t.settings.enableAppLockPrompt,
      });
      if (res.success) {
        setBiometricLockEnabled(true);
        showToast(t.settings.appLockEnabled, 'success');
      }
    } catch (err: any) {
      Alert.alert(t.settings.errorLabel, err?.message || t.settings.appLockError);
    }
  }, [setBiometricLockEnabled, showToast, t]);

  const handlePersonalSyncToggle = useCallback(async (value: boolean) => {
    lightTap();
    if (!value) {
      // Disable: keep remote data intact by default, user can wipe later
      Alert.alert(
        t.settings.turnOffCloudSync,
        t.settings.turnOffCloudSyncMsg,
        [
          { text: t.common.cancel, style: 'cancel' },
          {
            text: t.settings.turnOff,
            onPress: async () => {
              await disablePersonalSync(false);
              showToast(t.settings.cloudSyncDisabled, 'info');
            },
          },
          {
            text: t.settings.turnOffWipe,
            style: 'destructive',
            onPress: async () => {
              await disablePersonalSync(true);
              showToast(t.settings.cloudSyncDisabledWiped, 'info');
            },
          },
        ],
      );
      return;
    }

    // Enable: require sign-in
    const { isAuthenticated, isVerified } = useAuthStore.getState();
    if (!isAuthenticated || !isVerified) {
      Alert.alert(
        t.settings.signInRequired,
        t.settings.signInRequiredMsg,
        [{ text: t.common.ok }],
      );
      return;
    }

    setPersonalSyncEnabled(true);
    showToast(t.settings.cloudSyncEnabledSyncing, 'success');
    try {
      await syncPersonal();
      showToast(t.settings.syncedToCloud, 'success');
    } catch {
      showToast(t.settings.syncFailedRetry, 'info');
    }
  }, [setPersonalSyncEnabled, showToast, t]);

  const handleManualSyncNow = useCallback(async () => {
    lightTap();
    // User-initiated — bypass any active backoff window
    resetBackoff('personalSync');
    showToast(t.settings.syncing, 'info');
    try {
      await syncPersonal();
      showToast(t.settings.synced, 'success');
    } catch {
      showToast(t.settings.syncFailed, 'info');
    }
  }, [showToast, t]);

  const handleNotificationsToggle = useCallback((value: boolean) => {
    lightTap();
    setNotificationsEnabled(value);
    showToast(
      value ? t.settings.notificationsEnabledToast : t.settings.notificationsDisabledToast,
      'success'
    );
  }, [setNotificationsEnabled, showToast, t]);

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

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
      >
        {/* Profile */}
        <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>{t.settings.profile}</Text>
        <Card style={styles.card}>
          <View style={styles.settingRow}>
            <View style={styles.settingLabelRow}>
              <Feather name="user" size={18} color={C.textSecondary} />
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
              selectionColor={C.accent}
            />
          </View>
        </Card>

        {/* Preferences */}
        <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>{t.settings.preferences}</Text>
        <Card style={styles.card}>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={handleCurrencyPress}
            activeOpacity={0.6}
          >
            <View style={styles.settingLabelRow}>
              <Feather name="dollar-sign" size={18} color={C.textSecondary} />
              <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.currency}</Text>
            </View>
            <View style={styles.valueRow}>
              <Text style={[styles.settingValue, { color: C.textSecondary }]}>{currency}</Text>
              <Feather name="chevron-right" size={18} color={C.neutral} />
            </View>
          </TouchableOpacity>

          {businessModeEnabled && (
            <>
              <View style={[styles.divider, { backgroundColor: C.border }]} />

              <TouchableOpacity
                style={styles.settingRow}
                onPress={handleDefaultModePress}
                activeOpacity={0.6}
              >
                <View style={styles.settingLabelRow}>
                  <Feather name="layout" size={18} color={C.textSecondary} />
                  <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.defaultMode}</Text>
                </View>
                <View style={styles.valueRow}>
                  <Text style={[styles.settingValue, { color: C.textSecondary }]}>
                    {defaultMode === 'personal' ? t.settings.personal : t.settings.business}
                  </Text>
                  <Feather name="chevron-right" size={18} color={C.neutral} />
                </View>
              </TouchableOpacity>
            </>
          )}

          <View style={[styles.divider, { backgroundColor: C.border }]} />

          <View style={styles.settingRow}>
            <View style={styles.settingLabelRow}>
              <Feather name="smartphone" size={18} color={C.textSecondary} />
              <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.hapticFeedback}</Text>
            </View>
            <Switch
              value={hapticEnabled}
              onValueChange={handleHapticToggle}
              trackColor={{ false: C.border, true: C.positive }}
              thumbColor={C.surface}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: C.border }]} />

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.settingLabelRow}>
                <Feather name="bell" size={18} color={C.textSecondary} />
                <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.notifications}</Text>
              </View>
              <Text style={styles.settingDescription}>
                {t.settings.notificationsDesc}
              </Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleNotificationsToggle}
              trackColor={{ false: C.border, true: C.positive }}
              thumbColor={C.surface}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: C.border }]} />

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.settingLabelRow}>
                <Feather name="trending-up" size={18} color={C.textSecondary} />
                <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.spendingAlerts}</Text>
              </View>
              <Text style={styles.settingDescription}>
                {t.settings.spendingAlertsDesc}
              </Text>
            </View>
            <Switch
              value={spendingAlertsEnabled}
              onValueChange={(v) => { lightTap(); setSpendingAlertsEnabled(v); }}
              trackColor={{ false: C.border, true: C.positive }}
              thumbColor={C.surface}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: C.border }]} />

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.settingLabelRow}>
                <Feather name="check-circle" size={18} color={C.textSecondary} />
                <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.quickAddConfirm}</Text>
              </View>
              <Text style={styles.settingDescription}>
                {t.settings.quickAddConfirmDesc}
              </Text>
            </View>
            <Switch
              value={quickAddConfirm}
              onValueChange={(v) => { lightTap(); setQuickAddConfirm(v); }}
              trackColor={{ false: C.border, true: C.positive }}
              thumbColor={C.surface}
            />
          </View>

          {/* Card payments (Tap to Pay) — iOS only. Status reflects why it's
              unavailable when the toggle is on but a gate isn't met. */}
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
              <>
                <View style={[styles.divider, { backgroundColor: C.border }]} />
                <View style={styles.settingRow}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.settingLabelRow}>
                      <Feather name="wifi" size={18} color={C.textSecondary} />
                      <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.tapToPay.settingsTitle}</Text>
                    </View>
                    <Text style={styles.settingDescription}>{status}</Text>
                  </View>
                  <Switch
                    value={tapToPayEnabled}
                    onValueChange={(v) => { lightTap(); setTapToPayEnabled(v); }}
                    trackColor={{ false: C.border, true: C.positive }}
                    thumbColor={C.surface}
                  />
                </View>
              </>
            );
          })()}

          <View style={[styles.divider, { backgroundColor: C.border }]} />

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.settingLabelRow}>
                <Feather name="briefcase" size={18} color={C.textSecondary} />
                <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.businessMode}</Text>
              </View>
              <Text style={styles.settingDescription}>
                {t.settings.businessModeDesc}
              </Text>
            </View>
            <Switch
              value={businessModeEnabled}
              onValueChange={handleBusinessModeToggle}
              trackColor={{ false: C.border, true: C.positive }}
              thumbColor={C.surface}
            />
          </View>
        </Card>

        {/* Security */}
        <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>{t.settings.security}</Text>
        <Card style={styles.card}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.settingLabelRow}>
                <Feather name="lock" size={18} color={C.textSecondary} />
                <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.appLock}</Text>
              </View>
              <Text style={styles.settingDescription}>
                {t.settings.appLockDesc}
              </Text>
            </View>
            <Switch
              value={biometricLockEnabled}
              onValueChange={handleBiometricToggle}
              trackColor={{ false: C.border, true: C.positive }}
              thumbColor={C.surface}
            />
          </View>

          {biometricLockEnabled && (
            <>
              <View style={[styles.divider, { backgroundColor: C.border }]} />
              <View style={styles.settingRow}>
                <View style={{ flex: 1 }}>
                  <View style={styles.settingLabelRow}>
                    <Feather name="clock" size={18} color={C.textSecondary} />
                    <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.lockAfter}</Text>
                  </View>
                  <Text style={styles.settingDescription}>
                    {t.settings.lockAfterDesc}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: SPACING.xs }}>
                  {[0, 1, 5, 15].map((m) => (
                    <TouchableOpacity
                      key={m}
                      onPress={() => { lightTap(); setBiometricLockTimeoutMin(m); }}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: RADIUS.full,
                        borderWidth: 1,
                        borderColor: biometricLockTimeoutMin === m ? C.accent : C.border,
                        backgroundColor: biometricLockTimeoutMin === m ? withAlpha(C.accent, 0.1) : 'transparent',
                      }}
                    >
                      <Text style={{
                        fontSize: TYPOGRAPHY.size.xs,
                        fontWeight: TYPOGRAPHY.weight.medium,
                        color: biometricLockTimeoutMin === m ? C.accent : C.textSecondary,
                      }}>{m === 0 ? t.settings.always : `${m}m`}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </>
          )}
        </Card>

        {/* Cloud Sync */}
        <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>{t.settings.cloudSync}</Text>
        <Card style={styles.card}>
          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.settingLabelRow}>
                <Feather name="cloud" size={18} color={C.textSecondary} />
                <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.syncPersonalData}</Text>
              </View>
              <Text style={styles.settingDescription}>
                {t.settings.syncPersonalDataDesc}
              </Text>
            </View>
            <Switch
              value={personalSyncEnabled}
              onValueChange={handlePersonalSyncToggle}
              trackColor={{ false: C.border, true: C.positive }}
              thumbColor={C.surface}
            />
          </View>

          {personalSyncEnabled && (
            <>
              <View style={[styles.divider, { backgroundColor: C.border }]} />
              <View style={styles.settingRow}>
                <View style={{ flex: 1 }}>
                  <View style={styles.settingLabelRow}>
                    <Feather name="refresh-cw" size={18} color={C.textSecondary} />
                    <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.lastSync}</Text>
                  </View>
                  <Text style={styles.settingDescription}>
                    {lastPersonalSyncAt
                      ? lastPersonalSyncAt.toLocaleString()
                      : t.settings.notSyncedYet}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleManualSyncNow}
                  style={{
                    paddingHorizontal: SPACING.md,
                    paddingVertical: 8,
                    borderRadius: RADIUS.full,
                    borderWidth: 1,
                    borderColor: C.accent,
                    backgroundColor: withAlpha(C.accent, 0.1),
                  }}
                >
                  <Text style={{
                    fontSize: TYPOGRAPHY.size.xs,
                    fontWeight: TYPOGRAPHY.weight.medium,
                    color: C.accent,
                  }}>{t.settings.syncNow}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </Card>

        {/* Appearance */}
        <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>{t.settings.appearance}</Text>
        <Card style={styles.card}>
          {/* Theme */}
          <View style={styles.settingRow}>
            <View style={styles.settingLabelRow}>
              <Feather name="moon" size={18} color={C.textSecondary} />
              <Text style={[styles.settingLabel, { color: C.textPrimary }]}>
                {t.settings.theme}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm }}>
            {(['light', 'dark', 'system'] as ThemePreference[]).map((opt) => (
              <TouchableOpacity
                key={opt}
                style={[
                  {
                    flex: 1,
                    paddingVertical: SPACING.sm,
                    borderRadius: RADIUS.full,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: themePreference === opt ? C.accent : C.border,
                    backgroundColor: themePreference === opt ? withAlpha(C.accent, 0.1) : 'transparent',
                  },
                ]}
                onPress={() => {
                  lightTap();
                  setThemePreference(opt);
                }}
                activeOpacity={0.6}
              >
                <Text
                  style={{
                    fontSize: TYPOGRAPHY.size.sm,
                    fontWeight: themePreference === opt ? TYPOGRAPHY.weight.semibold : TYPOGRAPHY.weight.medium,
                    color: themePreference === opt ? C.accent : C.textSecondary,
                  }}
                >
                  {opt === 'light' ? t.settings.themeLight : opt === 'dark' ? t.settings.themeDark : t.settings.themeSystem}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.divider, { backgroundColor: C.border }]} />

          {/* Language */}
          <View style={styles.settingRow}>
            <View style={styles.settingLabelRow}>
              <Feather name="globe" size={18} color={C.textSecondary} />
              <Text style={[styles.settingLabel, { color: C.textPrimary }]}>
                {t.settings.language}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
            {([{ key: 'en' as AppLanguage, label: 'English' }, { key: 'ms' as AppLanguage, label: 'Bahasa Melayu' }]).map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[
                  {
                    flex: 1,
                    paddingVertical: SPACING.sm,
                    borderRadius: RADIUS.full,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: language === opt.key ? C.accent : C.border,
                    backgroundColor: language === opt.key ? withAlpha(C.accent, 0.1) : 'transparent',
                  },
                ]}
                onPress={() => {
                  lightTap();
                  setLanguage(opt.key);
                }}
                activeOpacity={0.6}
              >
                <Text
                  style={{
                    fontSize: TYPOGRAPHY.size.sm,
                    fontWeight: language === opt.key ? TYPOGRAPHY.weight.semibold : TYPOGRAPHY.weight.medium,
                    color: language === opt.key ? C.accent : C.textSecondary,
                  }}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.divider, { backgroundColor: C.border }]} />

          {/* Echo assistant visibility */}
          <View style={[styles.settingRow, { paddingBottom: 4 }]}>
            <View style={styles.settingLabelRow}>
              <Feather name="zap" size={18} color={C.textSecondary} />
              <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.echoVisibility}</Text>
            </View>
          </View>
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: C.textSecondary, paddingLeft: 26 }]}>{t.settings.echoOnWallets}</Text>
            <Switch
              value={!walletEchoHidden}
              onValueChange={(v) => { lightTap(); setWalletEchoHidden(!v); }}
              trackColor={{ false: C.border, true: C.positive }}
              thumbColor={C.surface}
            />
          </View>
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: C.textSecondary, paddingLeft: 26 }]}>{t.settings.echoOnBudgets}</Text>
            <Switch
              value={!budgetEchoHidden}
              onValueChange={(v) => { lightTap(); setBudgetEchoHidden(!v); }}
              trackColor={{ false: C.border, true: C.positive }}
              thumbColor={C.surface}
            />
          </View>
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: C.textSecondary, paddingLeft: 26 }]}>{t.settings.echoOnCommitments}</Text>
            <Switch
              value={!commitmentEchoHidden}
              onValueChange={(v) => { lightTap(); setCommitmentEchoHidden(!v); }}
              trackColor={{ false: C.border, true: C.positive }}
              thumbColor={C.surface}
            />
          </View>
        </Card>

        {/* Quick add shortcut (Back Tap / Siri / Shortcuts) */}
        <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>{t.settings.quickAddShortcut}</Text>
        <Card style={styles.card}>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => { lightTap(); setShortcutModalVisible(true); }}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={t.settings.quickAddTitle}
          >
            <View style={[styles.settingLabelRow, { flex: 1 }]}>
              <Feather name="smartphone" size={18} color={C.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.quickAddTitle}</Text>
                <Text style={[styles.settingDescription, { color: C.textSecondary, marginLeft: 0 }]}>{t.settings.quickAddSubtitle}</Text>
              </View>
            </View>
            <Feather name="chevron-right" size={20} color={C.textMuted} />
          </TouchableOpacity>
        </Card>

        {ready && <>
        {/* Business Income Type — seller mode has this on the Manage screen instead */}
        {businessModeEnabled && mode === 'business' && incomeType !== 'seller' && (
          <>
            <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>{t.settings.businessSetup}</Text>
            <Card style={styles.card}>
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => {
                  lightTap();
                  useBusinessStore.getState().resetSetup();
                }}
                activeOpacity={0.6}
              >
                <View style={styles.settingLabelRow}>
                  <Feather name="briefcase" size={18} color={C.textSecondary} />
                  <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.changeIncomeType}</Text>
                </View>
                <View style={styles.valueRow}>
                  <Text style={[styles.settingValue, { color: C.textSecondary }]}>
                    {incomeType || t.settings.notSet}
                  </Text>
                  <Feather name="chevron-right" size={18} color={C.neutral} />
                </View>
              </TouchableOpacity>
            </Card>
          </>
        )}

        {/* Categories — show in personal mode, hide for seller & stall in business mode */}
        {(mode === 'personal' || (incomeType !== 'seller' && incomeType !== 'stall')) && (
          <>
            <Text style={[styles.sectionHeader, { color: C.textSecondary }]} onLayout={(e) => { sectionY.current.categories = e.nativeEvent.layout.y; }}>{t.settings.categories}</Text>
            <Card style={styles.card}>
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => {
                  lightTap();
                  setCategoryManagerType('expense');
                  setCategoryManagerVisible(true);
                }}
                activeOpacity={0.6}
              >
                <View style={styles.settingLabelRow}>
                  <Feather name="tag" size={18} color={C.textSecondary} />
                  <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.expenseCategories}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={C.neutral} />
              </TouchableOpacity>

              <View style={[styles.divider, { backgroundColor: C.border }]} />

              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => {
                  lightTap();
                  setCategoryManagerType('income');
                  setCategoryManagerVisible(true);
                }}
                activeOpacity={0.6}
              >
                <View style={styles.settingLabelRow}>
                  <Feather name="trending-up" size={18} color={C.textSecondary} />
                  <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.incomeCategories}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={C.neutral} />
              </TouchableOpacity>

              <View style={[styles.divider, { backgroundColor: C.border }]} />

              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => {
                  lightTap();
                  setCategoryManagerType('investment');
                  setCategoryManagerVisible(true);
                }}
                activeOpacity={0.6}
              >
                <View style={styles.settingLabelRow}>
                  <Feather name="pie-chart" size={18} color={C.textSecondary} />
                  <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.investmentCategories}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={C.neutral} />
              </TouchableOpacity>

              <View style={[styles.divider, { backgroundColor: C.border }]} />

              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => {
                  lightTap();
                  setPaymentMethodManagerVisible(true);
                }}
                activeOpacity={0.6}
              >
                <View style={styles.settingLabelRow}>
                  <Feather name="credit-card" size={18} color={C.textSecondary} />
                  <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.paymentMethods}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={C.neutral} />
              </TouchableOpacity>
            </Card>
          </>
        )}

        {/* Product Units — only for seller & stall in business mode */}
        {mode === 'business' && (incomeType === 'seller' || incomeType === 'stall') && (
          <>
            <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>{t.settings.productUnits}</Text>
            <Card style={styles.card}>
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => {
                  lightTap();
                  setUnitManagerVisible(true);
                }}
                activeOpacity={0.6}
              >
                <View style={styles.settingLabelRow}>
                  <Feather name="box" size={18} color={C.textSecondary} />
                  <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.manageUnits}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={C.neutral} />
              </TouchableOpacity>
            </Card>
          </>
        )}

        {categoryManagerVisible && (
        <CategoryManager
          visible
          onClose={() => setCategoryManagerVisible(false)}
          type={categoryManagerType}
          mode={mode}
        />
        )}

        {unitManagerVisible && (
        <UnitManager
          visible
          onClose={() => setUnitManagerVisible(false)}
        />
        )}

        {paymentMethodManagerVisible && (
        <PaymentMethodManager
          visible
          onClose={() => setPaymentMethodManagerVisible(false)}
        />
        )}

        {/* Subscription */}
        <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>{t.settings.subscription}</Text>
        <Card style={styles.card}>
          {tier === 'premium' ? (
            <View style={styles.premiumStatusRow}>
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
            <>
              <View style={styles.usageLimits}>
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
            </>
          )}
        </Card>

        {/* Wallets */}
        <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>{t.settings.wallets}</Text>
        <Card style={styles.card}>
          <Button
            title={t.settings.manageWallets}
            onPress={() => {
              lightTap();
              navigation.navigate('WalletManagement');
            }}
            variant="outline"
            icon="credit-card"
            fullWidth
          />
        </Card>

        {/* Payment QR */}
        <Text style={[styles.sectionHeader, { color: C.textSecondary }]} onLayout={(e) => { sectionY.current.qr = e.nativeEvent.layout.y; }}>{t.settings.paymentQr}</Text>
        <Card style={styles.card}>
          <Text style={styles.qrSubtitle}>
            {t.settings.qrSubtitle}
          </Text>
          <View style={styles.qrSlots}>
            {[0, 1].map((idx) => {
              const qr = paymentQrs[idx];
              return (
                <View key={idx} style={styles.qrSlot}>
                  {qr ? (
                    <TouchableOpacity
                      style={styles.qrSlotFilled}
                      onPress={() => setQrPreviewIndex(idx)}
                      onLongPress={() => handleQrLongPress(idx)}
                      delayLongPress={400}
                      activeOpacity={0.7}
                      disabled={qrLoadingIndex !== null}
                    >
                      <View style={styles.qrSlotIcon}>
                        {qrLoadingIndex === idx ? (
                          <ActivityIndicator size="small" color={C.accent} />
                        ) : (
                          <Feather name="check-circle" size={20} color={C.accent} />
                        )}
                      </View>
                      <Text style={styles.qrSlotLabel} numberOfLines={1}>
                        {qrLoadingIndex === idx ? t.settings.qrOpening : qr.label}
                      </Text>
                      {qrLoadingIndex !== idx && (
                        <Feather name="more-vertical" size={16} color={C.textMuted} />
                      )}
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={styles.qrSlotEmpty}
                      onPress={() => handlePickQrImage()}
                      activeOpacity={0.6}
                      disabled={qrLoadingIndex !== null}
                    >
                      {qrLoadingIndex === idx ? (
                        <ActivityIndicator size="small" color={C.accent} />
                      ) : (
                        <Feather name="plus" size={22} color={C.accent} />
                      )}
                      <Text style={styles.qrSlotAddText}>
                        {qrLoadingIndex === idx ? t.settings.qrOpening : t.settings.addQrShort}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        </Card>

        {/* Data */}
        <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>{t.settings.data}</Text>
        <Card style={styles.card}>
          <Button
            title={t.settings.viewReports}
            onPress={handleViewReports}
            variant="outline"
            icon="bar-chart-2"
            fullWidth
            style={{ marginBottom: SPACING.md }}
          />
          <Button
            title={t.settings.exportData}
            onPress={handleExportData}
            variant="outline"
            icon="download"
            fullWidth
            style={{ marginBottom: SPACING.md }}
          />
          <Button
            title={t.settings.importFromStatement}
            onPress={() => { lightTap(); navigation.navigate('ImportFromStatement' as never); }}
            variant="outline"
            icon="upload"
            fullWidth
            style={{ marginBottom: SPACING.md }}
          />
          <Button
            title={t.settings.importFromCsv}
            onPress={() => { lightTap(); navigation.navigate('ImportFromCsv' as never); }}
            variant="outline"
            icon="file-plus"
            fullWidth
            style={{ marginBottom: SPACING.md }}
          />
          <Button
            title={t.settings.inviteFriends}
            onPress={async () => {
              lightTap();
              const code = await getOrCreateReferralCode();
              if (!code) {
                Alert.alert(
                  t.settings.signInRequired,
                  t.settings.signInRequiredInvite,
                );
                return;
              }
              try {
                await Share.share({ message: referralMessage(code) });
              } catch {
                // ignore user-cancelled
              }
            }}
            variant="outline"
            icon="user-plus"
            fullWidth
            style={{ marginBottom: SPACING.md }}
          />
          <Button
            title={t.settings.loadSampleData}
            onPress={handleLoadSampleData}
            variant="outline"
            icon="database"
            fullWidth
            style={{ marginBottom: SPACING.md }}
          />
          {mode === 'business' && (
            <Button
              title={t.settings.signOut}
              onPress={handleSignOut}
              variant="outline"
              icon="log-out"
              fullWidth
              style={{ marginBottom: SPACING.md }}
            />
          )}
          {mode === 'business' && (
            <Button
              title={t.settings.clearBusinessDataBtn}
              onPress={handleClearBusinessData}
              variant="danger"
              icon="trash-2"
              fullWidth
              style={{ marginBottom: SPACING.md }}
            />
          )}
          <Button
            title={t.settings.deleteAccount}
            onPress={handleDeleteAccount}
            variant="danger"
            icon="trash-2"
            fullWidth
          />
        </Card>

        {/* About */}
        <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>{t.settings.aboutSection}</Text>
        <Card style={styles.card}>
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.appLabel}</Text>
            <Text style={[styles.settingValue, { color: C.textSecondary }]}>{t.settings.potracesApp}</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: C.border }]} />
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.version}</Text>
            <Text style={[styles.settingValue, { color: C.textSecondary }]}>1.0.0</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: C.border }]} />
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => Linking.openURL('https://potraces.vercel.app/privacy.html')}
            activeOpacity={0.7}
          >
            <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.privacyPolicy}</Text>
            <Feather name="external-link" size={16} color={C.textSecondary} />
          </TouchableOpacity>
        </Card>

        <View style={{ height: SPACING['3xl'] }} />
        </>}
      </ScrollView>

      {/* Quick add shortcut setup */}
      <Modal
        visible={shortcutModalVisible}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setShortcutModalVisible(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: withAlpha('#000000', isDark ? 0.6 : 0.4), justifyContent: 'center', alignItems: 'center', padding: SPACING.lg }}
          onPress={() => setShortcutModalVisible(false)}
        >
          <View
            onStartShouldSetResponder={() => true}
            style={{ width: '100%', maxWidth: 460, maxHeight: '86%', backgroundColor: C.surface, borderRadius: RADIUS.xl, borderWidth: 1, borderColor: C.border, overflow: 'hidden' }}
          >
            <ScrollView contentContainerStyle={{ padding: SPACING.xl }} showsVerticalScrollIndicator={false} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.sm }}>
                <View style={{ width: 40, height: 40, borderRadius: RADIUS.lg, backgroundColor: withAlpha(C.accent, 0.12), alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="smartphone" size={20} color={C.accent} />
                </View>
                <Text style={{ flex: 1, fontSize: TYPOGRAPHY.size.lg, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary }}>{t.settings.quickAddModalTitle}</Text>
                <TouchableOpacity onPress={() => setShortcutModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={t.settings.quickAddDone}>
                  <Feather name="x" size={22} color={C.textMuted} />
                </TouchableOpacity>
              </View>

              <Text style={{ fontSize: TYPOGRAPHY.size.sm, lineHeight: 21, color: C.textSecondary, marginBottom: SPACING.lg }}>{t.settings.quickAddModalIntro}</Text>

              <Text style={{ fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACING.xs }}>{t.settings.quickAddLinkLabel}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.lg }}>
                <View style={{ flex: 1, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.md, backgroundColor: withAlpha(C.accent, isDark ? 0.1 : 0.06), borderWidth: 1, borderColor: C.border }}>
                  <Text style={{ fontSize: TYPOGRAPHY.size.base, color: C.textPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>{QUICK_ADD_LINK}</Text>
                </View>
                <TouchableOpacity
                  onPress={async () => { lightTap(); await Clipboard.setStringAsync(QUICK_ADD_LINK); showToast(t.settings.quickAddCopied, 'success'); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.full, backgroundColor: withAlpha(C.accent, 0.12) }}
                  accessibilityRole="button"
                  accessibilityLabel={t.settings.quickAddCopy}
                >
                  <Feather name="copy" size={15} color={C.accent} />
                  <Text style={{ fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.accent }}>{t.settings.quickAddCopy}</Text>
                </TouchableOpacity>
              </View>

              <Text style={{ fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary, marginBottom: SPACING.sm }}>{t.settings.quickAddStepsTitle}</Text>
              {[t.settings.quickAddStep1, t.settings.quickAddStep2, t.settings.quickAddStep3].map((step, i) => (
                <Text key={i} style={{ fontSize: TYPOGRAPHY.size.sm, lineHeight: 21, color: C.textSecondary, marginBottom: SPACING.sm }}>{step}</Text>
              ))}

              <View style={{ flexDirection: 'row', gap: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.md, backgroundColor: withAlpha(C.bronze, isDark ? 0.14 : 0.08), marginTop: SPACING.xs, marginBottom: SPACING.md }}>
                <Feather name="info" size={15} color={C.bronze} style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, fontSize: TYPOGRAPHY.size.xs, lineHeight: 18, color: C.textSecondary }}>{t.settings.quickAddAndroid}</Text>
              </View>

              <Text style={{ fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginBottom: SPACING.lg }}>{t.settings.quickAddTip}</Text>

              <Button
                title={t.settings.quickAddTest}
                icon="zap"
                onPress={() => { lightTap(); setShortcutModalVisible(false); setTimeout(() => openQuickAdd('expense'), 350); }}
              />
            </ScrollView>
            <ModalToastHost />
          </View>
        </Pressable>
      </Modal>

      {/* QR Action Sheet — animationType="none" so dismiss is instant before image picker */}
      <Modal
        visible={qrActionIndex !== null}
        transparent
        statusBarTranslucent
        animationType="none"
        onRequestClose={() => setQrActionIndex(null)}
      >
        <Pressable style={styles.qrActionOverlay} onPress={() => setQrActionIndex(null)}>
          <View style={[styles.qrActionSheet, { backgroundColor: C.surface }]} onStartShouldSetResponder={() => true}>
            <Text style={styles.qrActionTitle}>
              {qrActionIndex !== null ? paymentQrs[qrActionIndex]?.label ?? '' : ''}
            </Text>

            <TouchableOpacity
              style={styles.qrActionItem}
              onPress={() => handleQrAction('replace')}
              activeOpacity={0.6}
            >
              <View style={[styles.qrActionIconBg, { backgroundColor: withAlpha(C.accent, 0.1) }]}>
                <Feather name="image" size={18} color={C.accent} />
              </View>
              <Text style={styles.qrActionText}>{t.settings.qrReplaceImage}</Text>
              <Feather name="chevron-right" size={16} color={C.textMuted} />
            </TouchableOpacity>

            <View style={styles.qrActionDivider} />

            <TouchableOpacity
              style={styles.qrActionItem}
              onPress={() => handleQrAction('rename')}
              activeOpacity={0.6}
            >
              <View style={[styles.qrActionIconBg, { backgroundColor: withAlpha(C.accent, 0.1) }]}>
                <Feather name="edit-2" size={18} color={C.accent} />
              </View>
              <Text style={styles.qrActionText}>{t.settings.qrRename}</Text>
              <Feather name="chevron-right" size={16} color={C.textMuted} />
            </TouchableOpacity>

            <View style={styles.qrActionDivider} />

            <TouchableOpacity
              style={styles.qrActionItem}
              onPress={() => handleQrAction('delete')}
              activeOpacity={0.6}
            >
              <View style={[styles.qrActionIconBg, { backgroundColor: withAlpha(C.neutral, 0.1) }]}>
                <Feather name="trash-2" size={18} color={C.neutral} />
              </View>
              <Text style={[styles.qrActionText, { color: C.neutral }]}>{t.settings.qrDelete}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
        <ModalToastHost />
      </Modal>

      {/* ─── QR Label Prompt Modal (cross-platform Alert.prompt replacement) ─── */}
      <Modal
        visible={qrLabelModal.visible}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setQrLabelModal((s) => ({ ...s, visible: false }))}
      >
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }}>
        <Pressable style={[styles.qrLabelOverlay, { backgroundColor: 'transparent' }]} onPress={() => setQrLabelModal((s) => ({ ...s, visible: false }))}>
          <Pressable style={[styles.qrLabelCard, { backgroundColor: C.surface }]} onPress={() => {}}>
            <Text style={styles.qrLabelTitle}>
              {qrLabelModal.renameIndex !== undefined ? t.settings.qrRenameTitle : t.settings.qrNameTitle}
            </Text>
            <TextInput
              style={[styles.qrLabelInput, { color: C.textPrimary }]}
              value={qrLabelInput}
              onChangeText={setQrLabelInput}
              placeholder={t.settings.qrNamePlaceholder}
              placeholderTextColor={C.textMuted}
              autoFocus
              selectTextOnFocus
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={C.accent}
            />
            <View style={{ flexDirection: 'row', gap: SPACING.md, justifyContent: 'flex-end' }}>
              <TouchableOpacity
                style={styles.qrLabelCancel}
                onPress={() => setQrLabelModal((s) => ({ ...s, visible: false }))}
              >
                <Text style={{ color: C.textSecondary, fontWeight: TYPOGRAPHY.weight.medium }}>{t.settings.qrCancel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.qrLabelSave}
                onPress={() => {
                  const label = qrLabelInput.trim();
                  if (qrLabelModal.renameIndex !== undefined) {
                    if (label) updatePaymentQrLabel(qrLabelModal.renameIndex, label, mode);
                  } else if (qrLabelModal.uri) {
                    const qrLabel = label || `QR ${qrLabelModal.replaceIndex !== undefined ? qrLabelModal.replaceIndex + 1 : paymentQrs.length + 1}`;
                    if (qrLabelModal.replaceIndex !== undefined) {
                      replacePaymentQr(qrLabelModal.replaceIndex, qrLabelModal.uri, qrLabel, mode);
                      showToast(t.settings.qrUpdated, 'success');
                    } else {
                      addPaymentQr(qrLabelModal.uri, qrLabel, mode);
                      showToast(t.settings.qrAdded, 'success');
                    }
                  }
                  setQrLabelModal((s) => ({ ...s, visible: false }));
                }}
              >
                <Text style={{ color: C.onAccent, fontWeight: TYPOGRAPHY.weight.semibold }}>{t.settings.qrSave}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
        <ModalToastHost />
      </Modal>

      {/* ─── Currency Picker Modal ─── */}
      {currencyModalVisible && (
      <Modal
        visible
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setCurrencyModalVisible(false)}
      >
        <Pressable style={styles.currencyOverlay} onPress={() => setCurrencyModalVisible(false)}>
          <View style={[styles.currencyCard, { backgroundColor: C.surface }]} onStartShouldSetResponder={() => true}>
            <Text style={styles.currencyTitle}>{t.settings.selectCurrency}</Text>
            <ScrollView style={styles.currencyList} showsVerticalScrollIndicator={false} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {CURRENCY_OPTIONS.map((opt) => {
                const selected = opt.code === currency;
                return (
                  <TouchableOpacity
                    key={opt.code}
                    style={[styles.currencyItem, selected && styles.currencyItemSelected]}
                    onPress={() => {
                      lightTap();
                      setCurrency(opt.code);
                      setCurrencyModalVisible(false);
                      showToast(t.settings.currencySetTo.replace('{code}', opt.code), 'success');
                    }}
                    activeOpacity={0.6}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.currencyCode, selected && styles.currencyCodeSelected]}>{opt.code}</Text>
                      <Text style={styles.currencyLabel}>{opt.label}</Text>
                    </View>
                    {selected && <Feather name="check" size={18} color={C.accent} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
        <ModalToastHost />
      </Modal>
      )}

      {/* ─── QR Fullscreen Preview ─── */}
      <Modal
        visible={qrPreviewIndex !== null}
        transparent
        statusBarTranslucent
        animationType="none"
        onRequestClose={() => setQrPreviewIndex(null)}
      >
        <View style={styles.qrPreviewOverlay}>
          <TouchableOpacity
            style={styles.qrPreviewClose}
            onPress={() => setQrPreviewIndex(null)}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          >
            <Feather name="x" size={28} color="#fff" />
          </TouchableOpacity>

          {qrPreviewIndex !== null && paymentQrs[qrPreviewIndex] && (
            <Text style={styles.qrPreviewLabel}>{paymentQrs[qrPreviewIndex].label}</Text>
          )}

          {qrPreviewIndex !== null && paymentQrs[qrPreviewIndex] && (
            <Image
              source={{ uri: paymentQrs[qrPreviewIndex].uri }}
              style={styles.qrPreviewImage}
              resizeMode="contain"
            />
          )}

          {paymentQrs.length > 1 && (
            <View style={styles.qrPreviewTabs}>
              {paymentQrs.map((qr, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.qrPreviewTab, qrPreviewIndex === i && styles.qrPreviewTabActive]}
                  onPress={() => { lightTap(); setQrPreviewIndex(i); }}
                >
                  <Text style={[styles.qrPreviewTabText, qrPreviewIndex === i && styles.qrPreviewTabTextActive]}>
                    {qr.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
        <ModalToastHost />
      </Modal>
    </View>
  );
};

export default Settings;
