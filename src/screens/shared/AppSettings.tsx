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
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import * as LocalAuthentication from 'expo-local-authentication';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SettingRow from '../../components/common/SettingRow';
import Card from '../../components/common/Card';
import ModalToastHost from '../../components/common/ModalToastHost';
import { useSettingsStore } from '../../store/settingsStore';
import { isLiveAudioAvailable } from '../../services/liveAudioSource';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha, TERMS_URL, PRIVACY_URL } from '../../constants';
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
 * Shared, mode-agnostic app/device settings: appearance, currency,
 * notifications, haptics, voice engine, app-lock, privacy, about. Reached from
 * both the Personal and Business hubs via the 'preferences' | 'security' |
 * 'about' sections. Nothing here is personal- or business-specific.
 */
const AppSettings: React.FC<{ section: Extract<SettingsSection, 'preferences' | 'security' | 'about'> }> = ({ section }) => {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { showToast } = useToast();

  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);

  const currency = useSettingsStore((s) => s.currency);
  const setCurrency = useSettingsStore((s) => s.setCurrency);
  const hapticEnabled = useSettingsStore((s) => s.hapticEnabled);
  const setHapticEnabled = useSettingsStore((s) => s.setHapticEnabled);
  const notificationsEnabled = useSettingsStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useSettingsStore((s) => s.setNotificationsEnabled);
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

  const handleNotificationsToggle = useCallback((value: boolean) => {
    lightTap();
    setNotificationsEnabled(value);
    showToast(
      value ? t.settings.notificationsEnabledToast : t.settings.notificationsDisabledToast,
      'success'
    );
  }, [setNotificationsEnabled, showToast, t]);

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

            {/* Appearance: theme + language pills */}
            <Card style={styles.card}>
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
                    style={{
                      flex: 1,
                      paddingVertical: SPACING.sm,
                      borderRadius: RADIUS.full,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: themePreference === opt ? C.accent : C.border,
                      backgroundColor: themePreference === opt ? withAlpha(C.accent, 0.1) : 'transparent',
                    }}
                    onPress={() => { lightTap(); setThemePreference(opt); }}
                    activeOpacity={0.6}
                  >
                    <Text style={{
                      fontSize: TYPOGRAPHY.size.sm,
                      fontWeight: themePreference === opt ? TYPOGRAPHY.weight.semibold : TYPOGRAPHY.weight.medium,
                      color: themePreference === opt ? C.accent : C.textSecondary,
                    }}>
                      {opt === 'light' ? t.settings.themeLight : opt === 'dark' ? t.settings.themeDark : t.settings.themeSystem}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={[styles.divider, { backgroundColor: C.border }]} />

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
                    style={{
                      flex: 1,
                      paddingVertical: SPACING.sm,
                      borderRadius: RADIUS.full,
                      alignItems: 'center',
                      borderWidth: 1,
                      borderColor: language === opt.key ? C.accent : C.border,
                      backgroundColor: language === opt.key ? withAlpha(C.accent, 0.1) : 'transparent',
                    }}
                    onPress={() => { lightTap(); setLanguage(opt.key); }}
                    activeOpacity={0.6}
                  >
                    <Text style={{
                      fontSize: TYPOGRAPHY.size.sm,
                      fontWeight: language === opt.key ? TYPOGRAPHY.weight.semibold : TYPOGRAPHY.weight.medium,
                      color: language === opt.key ? C.accent : C.textSecondary,
                    }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Card>

            {/* Shared toggles */}
            <Card style={styles.card}>
              <SettingRow
                icon="m/cash"
                chipColor="#4F5104"
                label={t.settings.currency}
                value={currency}
                onPress={() => { lightTap(); setCurrencyModalVisible(true); }}
              />
              <SettingRow
                icon="i/notifications"
                chipColor="#B2780A"
                label={t.settings.notifications}
                sublabel={t.settings.notificationsDesc}
                rightElement={
                  <Switch
                    value={notificationsEnabled}
                    onValueChange={handleNotificationsToggle}
                    trackColor={{ false: C.border, true: C.positive }}
                    thumbColor={C.surface}
                  />
                }
              />
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
            </Card>

            {/* Voice input (device STT engine) — Android only */}
            {Platform.OS === 'android' && (
              <Card style={styles.card}>
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
              </Card>
            )}
          </>
        )}

        {section === 'security' && (
          <>
            <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>{t.settings.security}</Text>
            <Card style={styles.card}>
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
                last={false}
              />
              {biometricLockEnabled && (
                <View style={{ paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md }}>
                  <Text style={[styles.settingLabel, { color: C.textSecondary, marginBottom: SPACING.sm }]}>{t.settings.lockAfter}</Text>
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
                last
              />
            </Card>
          </>
        )}

        {section === 'about' && (
          <>
            <Text style={[styles.sectionHeader, { color: C.textSecondary }]}>{t.settings.aboutSection}</Text>
            <Card style={styles.card}>
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
                last
              />
            </Card>
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

export default AppSettings;
