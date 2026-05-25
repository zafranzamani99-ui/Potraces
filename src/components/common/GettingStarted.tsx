import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useSettingsStore } from '../../store/settingsStore';
import { usePersonalStore } from '../../store/personalStore';
import { useWalletStore } from '../../store/walletStore';
import { lightTap } from '../../services/haptics';
import { openQuickAdd } from './QuickAddExpense';

const GettingStarted: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation<any>();
  const dismissed = useSettingsStore((s) => s.gettingStartedDismissed);
  const setDismissed = useSettingsStore((s) => s.setGettingStartedDismissed);
  const transactions = usePersonalStore((s) => s.transactions);
  const budgets = usePersonalStore((s) => s.budgets);
  const wallets = useWalletStore((s) => s.wallets);

  if (dismissed || transactions.length >= 5) return null;

  // Ladder order: Wallet (rung 1) → Transactions (rung 2) → Budget (rung 4).
  // "write a note" (rung 3) is a power-user surface and is intentionally
  // omitted from first-run pills per audit FIRSTRUN-L2.
  const items: { icon: keyof typeof Feather.glyphMap; label: string; done: boolean; onPress: () => void }[] = [
    {
      icon: 'credit-card',
      label: t.gettingStarted.setUpWallet,
      done: wallets.length > 0,
      onPress: () => { lightTap(); navigation.getParent()?.navigate('WalletManagement'); },
    },
    {
      icon: 'plus-circle',
      label: t.gettingStarted.logMoneyInOrOut,
      done: transactions.length > 0,
      onPress: () => { lightTap(); openQuickAdd(); },
    },
    {
      icon: 'sliders',
      label: t.gettingStarted.setABudget,
      done: budgets.length > 0,
      onPress: () => { lightTap(); navigation.getParent()?.navigate('BudgetPlanning'); },
    },
  ];

  const pending = items.filter((i) => !i.done);
  if (pending.length === 0) return null;

  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>{t.gettingStarted.letsGetStarted}</Text>
        <TouchableOpacity
          onPress={() => { lightTap(); setDismissed(true); }}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          accessibilityRole="button"
          accessibilityLabel={t.gettingStarted.dismiss}
        >
          <Feather name="x" size={14} color={C.textMuted} />
        </TouchableOpacity>
      </View>
      <View style={styles.scrollWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          keyboardShouldPersistTaps="handled"
        >
          {pending.map((item, i) => (
            <TouchableOpacity
              key={i}
              style={styles.chip}
              onPress={item.onPress}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <View style={styles.chipIcon}>
                <Feather name={item.icon} size={14} color={C.accent} />
              </View>
              <Text style={styles.chipText} numberOfLines={1}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <LinearGradient
          colors={[withAlpha(C.background, 0), withAlpha(C.background, 1)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.fade}
          pointerEvents="none"
        />
      </View>
    </Animated.View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    marginBottom: SPACING.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  label: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    textTransform: 'lowercase',
  },
  scrollWrap: {
    position: 'relative',
    marginRight: -SPACING['2xl'],
  },
  chipRow: {
    gap: SPACING.sm,
    paddingRight: SPACING['2xl'],
  },
  fade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 40,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    gap: SPACING.xs,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipIcon: {
    width: 24,
    height: 24,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.accent, 0.08),
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
});

export default GettingStarted;
