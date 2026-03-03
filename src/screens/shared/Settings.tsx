import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Switch,
  TouchableOpacity,
  Alert,
  Keyboard,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useSettingsStore } from '../../store/settingsStore';
import { usePersonalStore } from '../../store/personalStore';
import { useBusinessStore } from '../../store/businessStore';
import { useAppStore } from '../../store/appStore';
import { usePremiumStore } from '../../store/premiumStore';
import { useWalletStore } from '../../store/walletStore';
import { CALM, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { FREE_TIER, PREMIUM_CONFIG } from '../../constants/premium';
import { RootStackParamList } from '../../types';
import ModeToggle from '../../components/common/ModeToggle';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import CategoryManager from '../../components/common/CategoryManager';
import UnitManager from '../../components/common/UnitManager';
import { useToast } from '../../context/ToastContext';
import { lightTap } from '../../services/haptics';

const CURRENCY_OPTIONS = ['RM', 'USD', 'EUR', 'GBP', 'SGD'];

const Settings: React.FC = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { showToast } = useToast();
  const mode = useAppStore((state) => state.mode);
  const setMode = useAppStore((state) => state.setMode);
  const incomeType = useBusinessStore((s) => s.incomeType);
  const tier = usePremiumStore((s) => s.tier);
  const subscribe = usePremiumStore((s) => s.subscribe);
  const unsubscribe = usePremiumStore((s) => s.unsubscribe);
  const getRemainingScans = usePremiumStore((s) => s.getRemainingScans);
  const walletCount = useWalletStore((s) => s.wallets.length);
  const budgetCount = usePersonalStore((s) => s.budgets.length);

  const [categoryManagerVisible, setCategoryManagerVisible] = useState(false);
  const [categoryManagerType, setCategoryManagerType] = useState<'expense' | 'income' | 'investment'>('expense');
  const [unitManagerVisible, setUnitManagerVisible] = useState(false);

  const {
    userName,
    currency,
    hapticEnabled,
    notificationsEnabled,
    businessModeEnabled,
    defaultMode,
    setUserName,
    setCurrency,
    setHapticEnabled,
    setNotificationsEnabled,
    setBusinessModeEnabled,
    setDefaultMode,
    clearAllData,
  } = useSettingsStore();

  const handleCurrencyPress = () => {
    lightTap();
    Alert.alert(
      'Select Currency',
      'Choose your preferred currency',
      [
        ...CURRENCY_OPTIONS.map((curr) => ({
          text: curr === currency ? `${curr}  \u2713` : curr,
          onPress: () => {
            setCurrency(curr);
            showToast(`Currency set to ${curr}`, 'success');
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ]
    );
  };

  const handleDefaultModePress = () => {
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
  };

  const handleViewReports = () => {
    lightTap();
    navigation.navigate(
      mode === 'personal' ? 'PersonalReports' : 'BusinessReports'
    );
  };

  const handleExportData = () => {
    lightTap();
    Alert.alert(
      'Export Data',
      'Export functionality will be available in a future update. Your data is safely stored locally on your device.',
      [{ text: 'OK' }]
    );
  };

  const handleClearData = () => {
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
  };

  return (
    <View style={styles.container}>
      <ModeToggle />
      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Profile */}
        <Text style={styles.sectionHeader}>Profile</Text>
        <Card style={styles.card}>
          <View style={styles.settingRow}>
            <View style={styles.settingLabelRow}>
              <Feather name="user" size={18} color={CALM.textSecondary} />
              <Text style={styles.settingLabel}>Name</Text>
            </View>
            <TextInput
              value={userName}
              onChangeText={setUserName}
              placeholder="Enter your name"
              placeholderTextColor={CALM.neutral}
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          </View>
        </Card>

        {/* Preferences */}
        <Text style={styles.sectionHeader}>Preferences</Text>
        <Card style={styles.card}>
          <TouchableOpacity
            style={styles.settingRow}
            onPress={handleCurrencyPress}
            activeOpacity={0.6}
          >
            <View style={styles.settingLabelRow}>
              <Feather name="dollar-sign" size={18} color={CALM.textSecondary} />
              <Text style={styles.settingLabel}>Currency</Text>
            </View>
            <View style={styles.valueRow}>
              <Text style={styles.settingValue}>{currency}</Text>
              <Feather name="chevron-right" size={18} color={CALM.neutral} />
            </View>
          </TouchableOpacity>

          {businessModeEnabled && (
            <>
              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.settingRow}
                onPress={handleDefaultModePress}
                activeOpacity={0.6}
              >
                <View style={styles.settingLabelRow}>
                  <Feather name="layout" size={18} color={CALM.textSecondary} />
                  <Text style={styles.settingLabel}>Default Mode</Text>
                </View>
                <View style={styles.valueRow}>
                  <Text style={styles.settingValue}>
                    {defaultMode === 'personal' ? 'Personal' : 'Business'}
                  </Text>
                  <Feather name="chevron-right" size={18} color={CALM.neutral} />
                </View>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.divider} />

          <View style={styles.settingRow}>
            <View style={styles.settingLabelRow}>
              <Feather name="smartphone" size={18} color={CALM.textSecondary} />
              <Text style={styles.settingLabel}>Haptic Feedback</Text>
            </View>
            <Switch
              value={hapticEnabled}
              onValueChange={(value) => {
                setHapticEnabled(value);
                if (value) lightTap();
              }}
              trackColor={{ false: CALM.border, true: CALM.positive }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.settingRow}>
            <View style={styles.settingLabelRow}>
              <Feather name="bell" size={18} color={CALM.textSecondary} />
              <Text style={styles.settingLabel}>Notifications</Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={(value) => {
                lightTap();
                setNotificationsEnabled(value);
                showToast(
                  value ? 'Notifications enabled' : 'Notifications disabled',
                  'success'
                );
              }}
              trackColor={{ false: CALM.border, true: CALM.positive }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.settingLabelRow}>
                <Feather name="briefcase" size={18} color={CALM.textSecondary} />
                <Text style={styles.settingLabel}>Business Mode</Text>
              </View>
              <Text style={styles.settingDescription}>
                Enable to switch between Personal and Business modes
              </Text>
            </View>
            <Switch
              value={businessModeEnabled}
              onValueChange={(value) => {
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
              }}
              trackColor={{ false: CALM.border, true: CALM.positive }}
              thumbColor="#FFFFFF"
            />
          </View>
        </Card>

        {/* Business Income Type */}
        {businessModeEnabled && mode === 'business' && (
          <>
            <Text style={styles.sectionHeader}>Business Setup</Text>
            <Card style={styles.card}>
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => {
                  lightTap();
                  navigation.navigate('BusinessSetup');
                }}
                activeOpacity={0.6}
              >
                <View style={styles.settingLabelRow}>
                  <Feather name="briefcase" size={18} color={CALM.textSecondary} />
                  <Text style={styles.settingLabel}>Change Income Type</Text>
                </View>
                <View style={styles.valueRow}>
                  <Text style={styles.settingValue}>
                    {incomeType || 'not set'}
                  </Text>
                  <Feather name="chevron-right" size={18} color={CALM.neutral} />
                </View>
              </TouchableOpacity>
            </Card>
          </>
        )}

        {/* Categories — show in personal mode, hide for seller & stall in business mode */}
        {(mode === 'personal' || (incomeType !== 'seller' && incomeType !== 'stall')) && (
          <>
            <Text style={styles.sectionHeader}>Categories</Text>
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
                  <Feather name="tag" size={18} color={CALM.textSecondary} />
                  <Text style={styles.settingLabel}>Expense Categories</Text>
                </View>
                <Feather name="chevron-right" size={18} color={CALM.neutral} />
              </TouchableOpacity>

              <View style={styles.divider} />

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
                  <Feather name="trending-up" size={18} color={CALM.textSecondary} />
                  <Text style={styles.settingLabel}>Income Categories</Text>
                </View>
                <Feather name="chevron-right" size={18} color={CALM.neutral} />
              </TouchableOpacity>

              <View style={styles.divider} />

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
                  <Feather name="pie-chart" size={18} color={CALM.textSecondary} />
                  <Text style={styles.settingLabel}>Investment Categories</Text>
                </View>
                <Feather name="chevron-right" size={18} color={CALM.neutral} />
              </TouchableOpacity>
            </Card>
          </>
        )}

        {/* Product Units — only for seller & stall in business mode */}
        {mode === 'business' && (incomeType === 'seller' || incomeType === 'stall') && (
          <>
            <Text style={styles.sectionHeader}>Product Units</Text>
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
                  <Feather name="box" size={18} color={CALM.textSecondary} />
                  <Text style={styles.settingLabel}>Manage Units</Text>
                </View>
                <Feather name="chevron-right" size={18} color={CALM.neutral} />
              </TouchableOpacity>
            </Card>
          </>
        )}

        <CategoryManager
          visible={categoryManagerVisible}
          onClose={() => setCategoryManagerVisible(false)}
          type={categoryManagerType}
          mode={mode}
        />

        <UnitManager
          visible={unitManagerVisible}
          onClose={() => setUnitManagerVisible(false)}
        />

        {/* Subscription */}
        <Text style={styles.sectionHeader}>Subscription</Text>
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
                    <Feather name="credit-card" size={16} color={CALM.textSecondary} />
                    <Text style={styles.usageLabel}>Wallets</Text>
                  </View>
                  <Text style={styles.usageValue}>{walletCount}/{FREE_TIER.maxWallets}</Text>
                </View>
                <View style={styles.usageRow}>
                  <View style={styles.settingLabelRow}>
                    <Feather name="pie-chart" size={16} color={CALM.textSecondary} />
                    <Text style={styles.usageLabel}>Budgets</Text>
                  </View>
                  <Text style={styles.usageValue}>{budgetCount}/{FREE_TIER.maxBudgets}</Text>
                </View>
                <View style={styles.usageRow}>
                  <View style={styles.settingLabelRow}>
                    <Feather name="camera" size={16} color={CALM.textSecondary} />
                    <Text style={styles.usageLabel}>Scans this month</Text>
                  </View>
                  <Text style={styles.usageValue}>{getRemainingScans()} left</Text>
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
        <Text style={styles.sectionHeader}>Wallets</Text>
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

        {/* Data */}
        <Text style={styles.sectionHeader}>Data</Text>
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
          <Button
            title="Clear All Data"
            onPress={handleClearData}
            variant="danger"
            icon="trash-2"
            fullWidth
          />
        </Card>

        {/* About */}
        <Text style={styles.sectionHeader}>About</Text>
        <Card style={styles.card}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>App</Text>
            <Text style={styles.settingValue}>Potraces</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>Version</Text>
            <Text style={styles.settingValue}>1.0.0</Text>
          </View>
        </Card>

        <View style={{ height: SPACING['3xl'] }} />
      </KeyboardAwareScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
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
    color: CALM.textSecondary,
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
    color: CALM.textPrimary,
  },
  settingDescription: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
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
    color: CALM.textSecondary,
  },
  input: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    textAlign: 'right',
    flex: 1,
    marginLeft: SPACING.lg,
    paddingVertical: SPACING.xs,
  },
  divider: {
    height: 1,
    backgroundColor: CALM.border,
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
    backgroundColor: CALM.accent,
  },
  premiumBadgeText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: '#fff',
  },
  unsubscribeText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.neutral,
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
    color: CALM.textPrimary,
  },
  usageValue: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  subscribeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    backgroundColor: CALM.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    marginTop: SPACING.md,
  },
  subscribeButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: '#fff',
  },
});

export default Settings;
