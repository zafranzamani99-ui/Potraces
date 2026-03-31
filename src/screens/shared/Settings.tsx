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
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSettingsStore } from '../../store/settingsStore';
import { usePersonalStore } from '../../store/personalStore';
import { useBusinessStore } from '../../store/businessStore';
import { useAppStore } from '../../store/appStore';
import { usePremiumStore } from '../../store/premiumStore';
import { useWalletStore } from '../../store/walletStore';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { FREE_TIER, PREMIUM_CONFIG } from '../../constants/premium';
import { RootStackParamList } from '../../types';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import CategoryManager from '../../components/common/CategoryManager';
import PaymentMethodManager from '../../components/common/PaymentMethodManager';
import UnitManager from '../../components/common/UnitManager';
import { useToast } from '../../context/ToastContext';
import { lightTap } from '../../services/haptics';
import { signOut } from '../../services/supabase';
import { clearProfileCache } from '../../services/sellerSync';
import { useAuthStore } from '../../store/authStore';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
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
    color: '#fff',
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
    color: '#fff',
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
  const defaultMode = useSettingsStore((s) => s.defaultMode);
  const setUserName = useSettingsStore((s) => s.setUserName);
  const setCurrency = useSettingsStore((s) => s.setCurrency);
  const setHapticEnabled = useSettingsStore((s) => s.setHapticEnabled);
  const setNotificationsEnabled = useSettingsStore((s) => s.setNotificationsEnabled);
  const setBusinessModeEnabled = useSettingsStore((s) => s.setBusinessModeEnabled);
  const setDefaultMode = useSettingsStore((s) => s.setDefaultMode);
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
    Alert.alert('Default Mode', 'Choose which mode opens on app launch', [
      {
        text: `Personal${defaultMode === 'personal' ? '  \u2713' : ''}`,
        onPress: () => {
          setDefaultMode('personal');
          showToast('Default mode set to Personal', 'success');
        },
      },
      {
        text: `Business${defaultMode === 'business' ? '  \u2713' : ''}`,
        onPress: () => {
          setDefaultMode('business');
          showToast('Default mode set to Business', 'success');
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [defaultMode, setDefaultMode, showToast]);

  const handleViewReports = useCallback(() => {
    lightTap();
    navigation.navigate(
      mode === 'personal' ? 'PersonalReports' : 'BusinessReports'
    );
  }, [mode, navigation]);

  const handleExportData = useCallback(() => {
    lightTap();
    Alert.alert(
      'Export Data',
      'Export functionality will be available in a future update. Your data is safely stored locally on your device.',
      [{ text: 'OK' }]
    );
  }, []);

  const handlePickQrImage = useCallback(async (replaceIndex?: number) => {
    lightTap();
    setQrLoadingIndex(replaceIndex ?? paymentQrs.length);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
      });
      setQrLoadingIndex(null);
      if (result.canceled || !result.assets?.[0]) return;
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
      // Delay modal open — iOS needs time to fully dismiss the native image picker
      setTimeout(() => {
        setQrLabelInput(defaultLabel);
        setQrLabelModal({ visible: true, uri: destUri, replaceIndex, defaultLabel });
      }, 500);
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
      showToast('QR removed', 'success');
    }
  }, [qrActionIndex, paymentQrs, updatePaymentQrLabel, removePaymentQr, showToast, mode]);

  const handleClearData = useCallback(() => {
    Alert.alert(
      'Clear All Data',
      'This will permanently delete all transactions, subscriptions, budgets, products, sales, suppliers, debts, splits, customers, and orders. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            clearAllData();
            showToast('All data cleared', 'success');
          },
        },
      ]
    );
  }, [clearAllData, showToast]);

  const handleClearBusinessData = useCallback(() => {
    Alert.alert(
      'Clear Business Data',
      'This will permanently delete all business data (products, orders, seasons, customers) both locally and from the server, sign you out, and return to personal mode. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear & Sign Out',
          style: 'destructive',
          onPress: async () => {
            await clearBusinessData();
            showToast('Business data cleared & signed out', 'success');
          },
        },
      ]
    );
  }, [clearBusinessData, showToast]);

  const handleSignOut = useCallback(() => {
    Alert.alert(
      'Sign Out',
      'You will be signed out of your business account. Your data will remain on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          onPress: async () => {
            // Reset auth while Settings still covers the screen
            useAuthStore.getState().reset();
            clearProfileCache();
            try { await signOut(); } catch {}
            // Reveal AuthScreen underneath
            if (navigation.canGoBack()) navigation.goBack();
          },
        },
      ]
    );
  }, [showToast]);

  const handleHapticToggle = useCallback((value: boolean) => {
    setHapticEnabled(value);
    if (value) lightTap();
  }, [setHapticEnabled]);

  const handleNotificationsToggle = useCallback((value: boolean) => {
    lightTap();
    setNotificationsEnabled(value);
    showToast(
      value ? 'Notifications enabled' : 'Notifications disabled',
      'success'
    );
  }, [setNotificationsEnabled, showToast]);

  const handleBusinessModeToggle = useCallback((value: boolean) => {
    lightTap();
    setBusinessModeEnabled(value);
    if (!value) {
      navigation.goBack();
      setMode('personal');
    }
    showToast(
      value ? 'Business mode enabled' : 'Business mode disabled',
      'success'
    );
  }, [setBusinessModeEnabled, navigation, setMode, showToast]);

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
        <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>Profile</Text>
        <Card style={styles.card}>
          <View style={styles.settingRow}>
            <View style={styles.settingLabelRow}>
              <Feather name="user" size={18} color={C.textSecondary} />
              <Text style={[styles.settingLabel, { color: C.textPrimary }]}>Name</Text>
            </View>
            <TextInput
              value={userName}
              onChangeText={setUserName}
              placeholder="Enter your name"
              placeholderTextColor={C.neutral}
              style={[styles.input, { color: C.textPrimary }]}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          </View>
        </Card>

        {/* Preferences */}
        <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>Preferences</Text>
        <Card style={styles.card}>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={handleCurrencyPress}
            activeOpacity={0.6}
          >
            <View style={styles.settingLabelRow}>
              <Feather name="dollar-sign" size={18} color={C.textSecondary} />
              <Text style={[styles.settingLabel, { color: C.textPrimary }]}>Currency</Text>
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
                  <Text style={[styles.settingLabel, { color: C.textPrimary }]}>Default Mode</Text>
                </View>
                <View style={styles.valueRow}>
                  <Text style={[styles.settingValue, { color: C.textSecondary }]}>
                    {defaultMode === 'personal' ? 'Personal' : 'Business'}
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
              <Text style={[styles.settingLabel, { color: C.textPrimary }]}>Haptic Feedback</Text>
            </View>
            <Switch
              value={hapticEnabled}
              onValueChange={handleHapticToggle}
              trackColor={{ false: C.border, true: C.positive }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={[styles.divider, { backgroundColor: C.border }]} />

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.settingLabelRow}>
                <Feather name="bell" size={18} color={C.textSecondary} />
                <Text style={[styles.settingLabel, { color: C.textPrimary }]}>Notifications</Text>
              </View>
              <Text style={styles.settingDescription}>
                new orders from your web shop link
              </Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleNotificationsToggle}
              trackColor={{ false: C.border, true: C.positive }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={[styles.divider, { backgroundColor: C.border }]} />

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.settingLabelRow}>
                <Feather name="briefcase" size={18} color={C.textSecondary} />
                <Text style={[styles.settingLabel, { color: C.textPrimary }]}>Business Mode</Text>
              </View>
              <Text style={styles.settingDescription}>
                Enable to switch between Personal and Business modes
              </Text>
            </View>
            <Switch
              value={businessModeEnabled}
              onValueChange={handleBusinessModeToggle}
              trackColor={{ false: C.border, true: C.positive }}
              thumbColor="#FFFFFF"
            />
          </View>
        </Card>

        {/* Appearance */}
        <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>Appearance</Text>
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
        </Card>

        {ready && <>
        {/* Business Income Type */}
        {businessModeEnabled && mode === 'business' && (
          <>
            <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>Business Setup</Text>
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
                  <Text style={[styles.settingLabel, { color: C.textPrimary }]}>Change Income Type</Text>
                </View>
                <View style={styles.valueRow}>
                  <Text style={[styles.settingValue, { color: C.textSecondary }]}>
                    {incomeType || 'not set'}
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
            <Text style={[styles.sectionHeader, { color: C.textSecondary }]} onLayout={(e) => { sectionY.current.categories = e.nativeEvent.layout.y; }}>Categories</Text>
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
                  <Text style={[styles.settingLabel, { color: C.textPrimary }]}>Expense Categories</Text>
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
                  <Text style={[styles.settingLabel, { color: C.textPrimary }]}>Income Categories</Text>
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
                  <Text style={[styles.settingLabel, { color: C.textPrimary }]}>Investment Categories</Text>
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
                  <Text style={[styles.settingLabel, { color: C.textPrimary }]}>Payment Methods</Text>
                </View>
                <Feather name="chevron-right" size={18} color={C.neutral} />
              </TouchableOpacity>
            </Card>
          </>
        )}

        {/* Product Units — only for seller & stall in business mode */}
        {mode === 'business' && (incomeType === 'seller' || incomeType === 'stall') && (
          <>
            <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>Product Units</Text>
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
                  <Text style={[styles.settingLabel, { color: C.textPrimary }]}>Manage Units</Text>
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
        <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>Subscription</Text>
        <Card style={styles.card}>
          {tier === 'premium' ? (
            <View style={styles.premiumStatusRow}>
              <View style={styles.premiumBadge}>
                <Feather name="award" size={14} color="#fff" />
                <Text style={styles.premiumBadgeText}>Premium</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  Alert.alert(
                    'Unsubscribe',
                    'Are you sure you want to cancel your premium subscription?',
                    [
                      { text: 'Keep Premium', style: 'cancel' },
                      {
                        text: 'Unsubscribe',
                        style: 'destructive',
                        onPress: () => {
                          unsubscribe();
                          showToast('Subscription cancelled', 'success');
                        },
                      },
                    ]
                  );
                }}
              >
                <Text style={styles.unsubscribeText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.usageLimits}>
                <View style={styles.usageRow}>
                  <View style={styles.settingLabelRow}>
                    <Feather name="credit-card" size={16} color={C.textSecondary} />
                    <Text style={styles.usageLabel}>Wallets</Text>
                  </View>
                  <Text style={styles.usageValue}>{walletCount}/{FREE_TIER.maxWallets}</Text>
                </View>
                <View style={styles.usageRow}>
                  <View style={styles.settingLabelRow}>
                    <Feather name="pie-chart" size={16} color={C.textSecondary} />
                    <Text style={styles.usageLabel}>Budgets</Text>
                  </View>
                  <Text style={styles.usageValue}>{budgetCount}/{FREE_TIER.maxBudgets}</Text>
                </View>
                <View style={styles.usageRow}>
                  <View style={styles.settingLabelRow}>
                    <Feather name="camera" size={16} color={C.textSecondary} />
                    <Text style={styles.usageLabel}>Scans this month</Text>
                  </View>
                  <Text style={styles.usageValue}>{scanCount}/{FREE_TIER.maxScansPerMonth}</Text>
                </View>
                <View style={styles.usageRow}>
                  <View style={styles.settingLabelRow}>
                    <Feather name="cpu" size={16} color={C.textSecondary} />
                    <Text style={styles.usageLabel}>AI calls this month</Text>
                  </View>
                  <Text style={styles.usageValue}>{aiCallsCount}/{FREE_TIER.maxAiCallsPerMonth}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.subscribeButton}
                onPress={() => {
                  subscribe();
                  showToast('Welcome to Premium!', 'success');
                }}
                activeOpacity={0.7}
              >
                <Feather name="award" size={18} color="#fff" />
                <Text style={styles.subscribeButtonText}>
                  Subscribe - {PREMIUM_CONFIG.currency} {PREMIUM_CONFIG.price}/{PREMIUM_CONFIG.period}
                </Text>
              </TouchableOpacity>
            </>
          )}
        </Card>

        {/* Wallets */}
        <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>Wallets</Text>
        <Card style={styles.card}>
          <Button
            title="Manage Wallets"
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
        <Text style={[styles.sectionHeader, { color: C.textSecondary }]} onLayout={(e) => { sectionY.current.qr = e.nativeEvent.layout.y; }}>Payment QR</Text>
        <Card style={styles.card}>
          <Text style={styles.qrSubtitle}>
            Add up to 2 QR codes. View them from the Dashboard.
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
                        {qrLoadingIndex === idx ? 'Opening...' : qr.label}
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
                        {qrLoadingIndex === idx ? 'Opening...' : 'Add QR'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        </Card>

        {/* Data */}
        <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>Data</Text>
        <Card style={styles.card}>
          <Button
            title="View Reports"
            onPress={handleViewReports}
            variant="outline"
            icon="bar-chart-2"
            fullWidth
            style={{ marginBottom: SPACING.md }}
          />
          <Button
            title="Export Data"
            onPress={handleExportData}
            variant="outline"
            icon="download"
            fullWidth
            style={{ marginBottom: SPACING.md }}
          />
          {mode === 'business' && (
            <Button
              title="Sign Out"
              onPress={handleSignOut}
              variant="outline"
              icon="log-out"
              fullWidth
              style={{ marginBottom: SPACING.md }}
            />
          )}
          {mode === 'business' && (
            <Button
              title="Clear Business Data & Sign Out"
              onPress={handleClearBusinessData}
              variant="danger"
              icon="trash-2"
              fullWidth
              style={{ marginBottom: SPACING.md }}
            />
          )}
          <Button
            title="Clear All Data"
            onPress={handleClearData}
            variant="danger"
            icon="trash-2"
            fullWidth
          />
        </Card>

        {/* About */}
        <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>About</Text>
        <Card style={styles.card}>
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: C.textPrimary }]}>App</Text>
            <Text style={[styles.settingValue, { color: C.textSecondary }]}>Potraces</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: C.border }]} />
          <View style={styles.settingRow}>
            <Text style={[styles.settingLabel, { color: C.textPrimary }]}>Version</Text>
            <Text style={[styles.settingValue, { color: C.textSecondary }]}>1.0.0</Text>
          </View>
        </Card>

        <View style={{ height: SPACING['3xl'] }} />
        </>}
      </ScrollView>

      {/* QR Action Sheet — Modal is safe here (no native picker launched from inside) */}
      <Modal
        visible={qrActionIndex !== null}
        transparent
        statusBarTranslucent
        animationType="fade"
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
              <Text style={styles.qrActionText}>Replace Image</Text>
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
              <Text style={styles.qrActionText}>Rename</Text>
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
              <Text style={[styles.qrActionText, { color: C.neutral }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
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
              {qrLabelModal.renameIndex !== undefined ? 'rename QR' : 'name this QR'}
            </Text>
            <TextInput
              style={[styles.qrLabelInput, { color: C.textPrimary }]}
              value={qrLabelInput}
              onChangeText={setQrLabelInput}
              placeholder="e.g. Maybank, TnG, ShopeePay"
              placeholderTextColor={C.textMuted}
              autoFocus
              selectTextOnFocus
            />
            <View style={{ flexDirection: 'row', gap: SPACING.md, justifyContent: 'flex-end' }}>
              <TouchableOpacity
                style={styles.qrLabelCancel}
                onPress={() => setQrLabelModal((s) => ({ ...s, visible: false }))}
              >
                <Text style={{ color: C.textSecondary, fontWeight: TYPOGRAPHY.weight.medium }}>cancel</Text>
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
                      showToast('QR updated', 'success');
                    } else {
                      addPaymentQr(qrLabelModal.uri, qrLabel, mode);
                      showToast('QR added', 'success');
                    }
                  }
                  setQrLabelModal((s) => ({ ...s, visible: false }));
                }}
              >
                <Text style={{ color: '#fff', fontWeight: TYPOGRAPHY.weight.semibold }}>save</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
        </KeyboardAvoidingView>
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
            <Text style={styles.currencyTitle}>select currency</Text>
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
                      showToast(`Currency set to ${opt.code}`, 'success');
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
      </Modal>
    </View>
  );
};

export default Settings;
