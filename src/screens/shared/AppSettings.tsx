import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  Alert,
  Modal,
  Pressable,
  Platform,
  Linking,
  AppState,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SettingRow from '../../components/common/SettingRow';
import NeuGroup from '../../components/common/NeuGroup';
import { useNeu } from '../../components/common/neu';
import ModalToastHost from '../../components/common/ModalToastHost';
import { useSettingsStore } from '../../store/settingsStore';
import { useAppStore } from '../../store/appStore';
import {
  registerPushNotifications,
  unregisterOrderPushToken,
  registerPersonalDeviceToken,
  unregisterPersonalDeviceToken,
  registerBroadcastDevice,
  unregisterBroadcastDevice,
} from '../../services/pushNotifications';
import { isLiveAudioAvailable } from '../../services/liveAudioSource';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha, TERMS_URL, PRIVACY_URL, DISCORD_URL } from '../../constants';
import { useToast } from '../../context/ToastContext';
import { lightTap } from '../../services/haptics';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import type { SettingsSection } from '../../types';
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

/**
 * Shared app/device settings: appearance, currency, notifications, haptics,
 * voice engine, app-lock, privacy, about. Reached from both the Personal and
 * Business hubs via the 'preferences' | 'security' | 'about' sections. The
 * notifications row is mode-aware: business shows the web-shop orders toggle,
 * personal shows the master push toggle.
 */
const AppSettings: React.FC<{ section: Extract<SettingsSection, 'preferences' | 'security' | 'about'> }> = ({ section }) => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const C = useCalm();
  const t = useT();
  const neu = useNeu(undefined, { faintDark: true });
  const styles = useMemo(() => makeStyles(C), [C]);
  const { showToast } = useToast();

  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);

  const currency = useSettingsStore((s) => s.currency);
  const setCurrency = useSettingsStore((s) => s.setCurrency);
  const hapticEnabled = useSettingsStore((s) => s.hapticEnabled);
  const setHapticEnabled = useSettingsStore((s) => s.setHapticEnabled);
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useSettingsStore((s) => s.setNotificationsEnabled);
  const orderNotificationsEnabled = useSettingsStore((s) => s.orderNotificationsEnabled);
  const setOrderNotificationsEnabled = useSettingsStore((s) => s.setOrderNotificationsEnabled);
  const mode = useAppStore((s) => s.mode);
  const themePreference = useSettingsStore((s) => s.themePreference);
  const setThemePreference = useSettingsStore((s) => s.setThemePreference);
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);
  const businessModeEnabled = useSettingsStore((s) => s.businessModeEnabled);
  const defaultMode = useSettingsStore((s) => s.defaultMode);
  const setDefaultMode = useSettingsStore((s) => s.setDefaultMode);
  const biometricLockEnabled = useSettingsStore((s) => s.biometricLockEnabled);
  const setBiometricLockEnabled = useSettingsStore((s) => s.setBiometricLockEnabled);
  const biometricLockTimeoutMin = useSettingsStore((s) => s.biometricLockTimeoutMin);
  const setBiometricLockTimeoutMin = useSettingsStore((s) => s.setBiometricLockTimeoutMin);
  const malayCloudVoice = useSettingsStore((s) => s.malayCloudVoice);
  const setMalayCloudVoice = useSettingsStore((s) => s.setMalayCloudVoice);
  const malayLiveStreaming = useSettingsStore((s) => s.malayLiveStreaming);
  const setMalayLiveStreaming = useSettingsStore((s) => s.setMalayLiveStreaming);
  const setVoiceCloudNoticeSeen = useSettingsStore((s) => s.setVoiceCloudNoticeSeen);
  const liveAudioReady = isLiveAudioAvailable();

  useEffect(() => {
    const titles: Record<string, string> = {
      preferences: t.settings.preferences,
      security: t.settings.security,
      about: t.settings.aboutSection,
    };
    navigation.setOptions({ title: titles[section] });
  }, [section, navigation, t]);

  // Ask for the OS notification permission. The system dialog only ever shows
  // ONCE — if the user previously denied, requestPermissionsAsync returns
  // 'denied' without showing anything, so we point them at the OS Settings
  // instead of failing silently. Returns true when permission is granted.
  const ensurePushPermission = useCallback(async (): Promise<boolean> => {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === 'granted') return true;
    const req = await Notifications.requestPermissionsAsync();
    if (req.status === 'granted') return true;
    if (!req.canAskAgain) {
      Alert.alert(t.settings.notifPermissionTitle, t.settings.notifPermissionMsg, [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.settings.openSettings, onPress: () => Linking.openSettings() },
      ]);
    }
    return false;
  }, [t]);

  // Personal master push toggle: flips the flag AND un/registers this device's
  // push tokens (personal device_tokens + account-free broadcast push_devices),
  // so OFF is a real opt-out, not just a foreground-display mute.
  const handleNotificationsToggle = useCallback((value: boolean) => {
    lightTap();
    setNotificationsEnabled(value);
    if (value) {
      ensurePushPermission().then((granted) => {
        // Not granted (denied just now, or the user went to OS Settings and
        // didn't enable) — snap the toggle back OFF so it reflects reality.
        // No "enabled" toast either; the permission alert already explained.
        if (!granted) { setNotificationsEnabled(false); return; }
        registerPersonalDeviceToken().catch(() => {});
        registerBroadcastDevice().catch(() => {});
        showToast(t.settings.notificationsEnabledToast, 'success');
      });
      return;
    }
    unregisterPersonalDeviceToken().catch(() => {});
    unregisterBroadcastDevice().catch(() => {});
    showToast(t.settings.notificationsDisabledToast, 'success');
  }, [setNotificationsEnabled, ensurePushPermission, showToast, t]);

  // Business orders toggle: ON (re)writes seller_profiles.push_token (the
  // new-order DB trigger's target); OFF clears it so the trigger stops firing.
  const handleOrderNotificationsToggle = useCallback((value: boolean) => {
    lightTap();
    setOrderNotificationsEnabled(value);
    if (value) {
      ensurePushPermission().then((granted) => {
        if (!granted) { setOrderNotificationsEnabled(false); return; }
        registerPushNotifications().catch(() => {});
        showToast(t.settings.notificationsEnabledToast, 'success');
      });
      return;
    }
    unregisterOrderPushToken().catch(() => {});
    showToast(t.settings.notificationsDisabledToast, 'success');
  }, [setOrderNotificationsEnabled, ensurePushPermission, showToast, t]);

  // Keep both toggles honest about the OS-level switch: if permission is
  // revoked in the device Settings, snap the in-app toggles OFF the next time
  // this screen is shown / the app comes back to the foreground.
  useEffect(() => {
    const syncWithOs = async () => {
      const { status } = await Notifications.getPermissionsAsync();
      if (status === 'granted') return;
      if (useSettingsStore.getState().notificationsEnabled) setNotificationsEnabled(false);
      if (useSettingsStore.getState().orderNotificationsEnabled) setOrderNotificationsEnabled(false);
    };
    syncWithOs();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') syncWithOs();
    });
    return () => sub.remove();
  }, [setNotificationsEnabled, setOrderNotificationsEnabled]);

  const handleHapticToggle = useCallback((value: boolean) => {
    setHapticEnabled(value);
    if (value) lightTap();
  }, [setHapticEnabled]);

  const handleDefaultModePress = useCallback(() => {
    lightTap();
    Alert.alert(t.settings.defaultModeAlertTitle, t.settings.defaultModeAlertMsg, [
      {
        text: `${t.settings.personal}${defaultMode === 'personal' ? '  ✓' : ''}`,
        onPress: () => {
          setDefaultMode('personal');
          showToast(t.settings.defaultModeSetPersonal, 'success');
        },
      },
      {
        text: `${t.settings.business}${defaultMode === 'business' ? '  ✓' : ''}`,
        onPress: () => {
          setDefaultMode('business');
          showToast(t.settings.defaultModeSetBusiness, 'success');
        },
      },
      { text: t.common.cancel, style: 'cancel' },
    ]);
  }, [defaultMode, setDefaultMode, showToast, t]);

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
        Alert.alert(t.settings.noBiometricsSetUp, t.settings.noBiometricsMsg);
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

  return (
    <View style={[styles.container, { backgroundColor: C.background }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 88 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {section === 'preferences' && (
          <>
            <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>{t.settings.preferences}</Text>

            {/* Theme — its own card */}
            <NeuGroup style={styles.card}>
              <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xs }}>
                <View style={styles.settingLabelRow}>
                  <Feather name="moon" size={18} color={C.textSecondary} />
                  <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.theme}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md }}>
                {(['light', 'dark', 'system'] as ThemePreference[]).map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.segPill, neu.raised, themePreference === opt && styles.segPillActive]}
                    onPress={() => { lightTap(); setThemePreference(opt); }}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.segPillText, themePreference === opt && styles.segPillTextActive]}>
                      {opt === 'light' ? t.settings.themeLight : opt === 'dark' ? t.settings.themeDark : t.settings.themeSystem}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </NeuGroup>

            {/* Language — its own card */}
            <NeuGroup style={styles.card}>
              <View style={{ paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.xs }}>
                <View style={styles.settingLabelRow}>
                  <Feather name="globe" size={18} color={C.textSecondary} />
                  <Text style={[styles.settingLabel, { color: C.textPrimary }]}>{t.settings.language}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md }}>
                {([{ key: 'en' as AppLanguage, label: 'English' }, { key: 'ms' as AppLanguage, label: 'Bahasa Melayu' }]).map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.segPill, neu.raised, language === opt.key && styles.segPillActive]}
                    onPress={() => { lightTap(); setLanguage(opt.key); }}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.segPillText, language === opt.key && styles.segPillTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </NeuGroup>

            {/* Shared toggles — each its own card */}
              <SettingRow
                icon="m/cash"
                chipColor="#4F5104"
                label={t.settings.currency}
                value={currency}
                onPress={() => { lightTap(); setCurrencyModalVisible(true); }}
              />
              {/* Notifications — mode-aware: business gets the web-shop orders
                  toggle, personal gets the master push toggle. */}
              {mode === 'business' ? (
                <SettingRow
                  icon="i/notifications"
                  chipColor="#B2780A"
                  label={t.settings.notifications}
                  sublabel={t.settings.notificationsDesc}
                  rightElement={
                    <Switch
                      value={orderNotificationsEnabled}
                      onValueChange={handleOrderNotificationsToggle}
                      trackColor={{ false: C.border, true: C.positive }}
                      thumbColor={C.surface}
                    />
                  }
                />
              ) : (
                <SettingRow
                  icon="i/notifications"
                  chipColor="#B2780A"
                  label={t.settings.pushNotifications}
                  sublabel={t.settings.pushNotificationsDesc}
                  rightElement={
                    <Switch
                      value={notificationsEnabled}
                      onValueChange={handleNotificationsToggle}
                      trackColor={{ false: C.border, true: C.positive }}
                      thumbColor={C.surface}
                    />
                  }
                />
              )}
              <SettingRow
                icon="m/vibrate"
                chipColor="#6BA3BE"
                label={t.settings.hapticFeedback}
                rightElement={
                  <Switch
                    value={hapticEnabled}
                    onValueChange={handleHapticToggle}
                    trackColor={{ false: C.border, true: C.positive }}
                    thumbColor={C.surface}
                  />
                }
                last={!businessModeEnabled}
              />
              {businessModeEnabled && (
                <SettingRow
                  icon="m/swap-horizontal"
                  chipColor="#5A5320"
                  label={t.settings.defaultMode}
                  value={defaultMode === 'personal' ? t.settings.personal : t.settings.business}
                  onPress={handleDefaultModePress}
                  last
                />
              )}

            {/* Voice input (device STT engine) — Android only, each its own card */}
            {Platform.OS === 'android' && (
              <>
                <SettingRow
                  icon="i/mic"
                  chipColor="#8B7355"
                  label={t.settings.malayVoice}
                  sublabel={t.settings.malayVoiceCloudDesc}
                  rightElement={
                    <Switch
                      value={malayCloudVoice}
                      onValueChange={(v) => {
                        lightTap();
                        setMalayCloudVoice(v);
                        if (v) setVoiceCloudNoticeSeen(true); // turning it on IS the cloud-use consent
                      }}
                      trackColor={{ false: C.border, true: C.positive }}
                      thumbColor={C.surface}
                    />
                  }
                  last={!liveAudioReady}
                />
                {liveAudioReady && (
                  <SettingRow
                    icon="i/mic"
                    chipColor="#4F5104"
                    label={t.settings.liveMalayVoice}
                    sublabel={t.settings.liveMalayVoiceDesc}
                    rightElement={
                      <Switch
                        value={malayLiveStreaming}
                        onValueChange={(v) => {
                          lightTap();
                          setMalayLiveStreaming(v);
                          if (v) setVoiceCloudNoticeSeen(true);
                        }}
                        trackColor={{ false: C.border, true: C.positive }}
                        thumbColor={C.surface}
                      />
                    }
                    last
                  />
                )}
              </>
            )}
          </>
        )}

        {section === 'security' && (
          <>
            <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>{t.settings.security}</Text>
              <SettingRow
                icon="i/lock-closed"
                chipColor="#6BA3BE"
                label={t.settings.appLock}
                sublabel={t.settings.appLockDesc}
                rightElement={
                  <Switch
                    value={biometricLockEnabled}
                    onValueChange={handleBiometricToggle}
                    trackColor={{ false: C.border, true: C.positive }}
                    thumbColor={C.surface}
                  />
                }
              />
              {biometricLockEnabled && (
                <NeuGroup style={styles.card}>
                <View style={{ paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md }}>
                  <Text style={[styles.settingLabel, { color: C.textSecondary, marginBottom: SPACING.sm }]}>{t.settings.lockAfter}</Text>
                  <View style={{ flexDirection: 'row', gap: SPACING.xs }}>
                    {[0, 1, 5, 15].map((m) => (
                      <TouchableOpacity
                        key={m}
                        onPress={() => { lightTap(); setBiometricLockTimeoutMin(m); }}
                        activeOpacity={0.85}
                        style={[styles.timePill, neu.raised, biometricLockTimeoutMin === m && styles.timePillActive]}
                      >
                        <Text style={[styles.timePillText, biometricLockTimeoutMin === m && styles.timePillTextActive]}>{m === 0 ? t.settings.always : `${m}m`}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                </NeuGroup>
              )}
              <SettingRow
                icon="i/document-text-outline"
                chipColor="#4F5104"
                label={t.settings.termsOfUse}
                onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}
                external
              />
              <SettingRow
                icon="i/shield-checkmark"
                chipColor="#4F5104"
                label={t.settings.privacyPolicy}
                onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}
                external
              />
          </>
        )}

        {section === 'about' && (
          <>
            <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>{t.settings.helpCommunity}</Text>
              <SettingRow
                icon="i/bug-outline"
                chipColor="#B2780A"
                label={t.settings.reportProblem}
                sublabel={t.settings.reportProblemDesc}
                onPress={() => { lightTap(); navigation.navigate('FeedbackForm'); }}
              />
              <SettingRow
                icon="i/time-outline"
                chipColor="#6BA3BE"
                label={t.settings.yourReports}
                sublabel={t.settings.yourReportsDesc}
                onPress={() => { lightTap(); navigation.navigate('FeedbackReports'); }}
              />
              <SettingRow
                icon="i/logo-discord"
                chipColor="#5865F2"
                label={t.settings.joinDiscord}
                sublabel={t.settings.joinDiscordDesc}
                onPress={() => { lightTap(); Linking.openURL(DISCORD_URL).catch(() => {}); }}
                external
              />
            <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>{t.settings.aboutSection}</Text>
              <SettingRow
                icon="i/information-circle-outline"
                chipColor="#5A5320"
                label={t.settings.appLabel}
                value={t.settings.potracesApp}
              />
              <SettingRow
                icon="i/information-circle-outline"
                chipColor="#5A5320"
                label={t.settings.version}
                value="1.0.0"
              />
            <Text style={{ fontSize: TYPOGRAPHY.size.xs, lineHeight: 18, color: C.textMuted, textAlign: 'center', paddingHorizontal: SPACING.xl, marginTop: SPACING.md }}>
              {t.settings.financialDisclaimer}
            </Text>
          </>
        )}
      </ScrollView>

      {/* Currency Picker Modal */}
      {currencyModalVisible && (
        <Modal
          visible
          transparent
          statusBarTranslucent
          animationType="fade"
          onRequestClose={() => setCurrencyModalVisible(false)}
        >
          <Pressable style={styles.currencyOverlay} onPress={() => setCurrencyModalVisible(false)}>
            <View style={[styles.currencyCard, neu.raisedModal]} onStartShouldSetResponder={() => true}>
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
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: SPACING.xs,
  },
  // Neu Pills — segmented selectors (theme / language). faintDark raised idle,
  // olive fill when selected (Onyx rule 3). neu.raised is spread at the call site.
  segPill: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    backgroundColor: withAlpha(C.textPrimary, 0.03),
  },
  segPillActive: { backgroundColor: C.accent },
  segPillText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  segPillTextActive: { color: C.onAccent, fontWeight: TYPOGRAPHY.weight.bold },
  // Neu Pills — compact variant (lock-after timeout).
  timePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.textPrimary, 0.03),
  },
  timePillActive: { backgroundColor: C.accent },
  timePillText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  timePillTextActive: { color: C.onAccent, fontWeight: TYPOGRAPHY.weight.bold },
  currencyOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING['2xl'],
  },
  currencyCard: {
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

export default AppSettings;
