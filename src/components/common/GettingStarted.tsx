import React, { useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useSettingsStore } from '../../store/settingsStore';
import { usePersonalStore } from '../../store/personalStore';
import { useWalletStore } from '../../store/walletStore';
import { lightTap } from '../../services/haptics';

const GettingStarted: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation<any>();
  const userName = useSettingsStore((s) => s.userName);
  const dismissed = useSettingsStore((s) => s.gettingStartedDismissed);
  const setDismissed = useSettingsStore((s) => s.setGettingStartedDismissed);
  const transactions = usePersonalStore((s) => s.transactions);
  const budgets = usePersonalStore((s) => s.budgets);
  const wallets = useWalletStore((s) => s.wallets);

  if (dismissed || transactions.length >= 5) return null;

  const items = [
    {
      label: t.gettingStarted.addFirstExpense,
      done: transactions.length > 0,
      onPress: () => { lightTap(); navigation.navigate('ExpenseEntry'); },
    },
    {
      label: t.gettingStarted.setUpWallet,
      done: wallets.length > 0,
      onPress: () => { lightTap(); navigation.navigate('WalletManagement'); },
    },
    {
      label: t.gettingStarted.setABudget,
      done: budgets.length > 0,
      onPress: () => { lightTap(); navigation.navigate('BudgetPlanning'); },
    },
    {
      label: t.gettingStarted.writeANote,
      done: false,
      onPress: () => { lightTap(); navigation.navigate('Notes'); },
    },
  ];

  const greeting = userName ? t.gettingStarted.hiName.replace('{name}', userName) : t.gettingStarted.letsGetStarted;

  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.card}>
      <Text style={styles.title}>{greeting}</Text>

      {items.map((item, i) => (
        <TouchableOpacity
          key={i}
          style={styles.row}
          onPress={item.onPress}
          activeOpacity={0.7}
        >
          <View style={[styles.circle, item.done && styles.circleDone]}>
            {item.done && <Feather name="check" size={12} color="#fff" />}
          </View>
          <Text style={[styles.rowLabel, item.done && styles.rowLabelDone]}>{item.label}</Text>
          <Feather name="chevron-right" size={16} color={C.textMuted} />
        </TouchableOpacity>
      ))}

      <TouchableOpacity
        style={styles.dismissRow}
        onPress={() => { lightTap(); setDismissed(true); }}
      >
        <Text style={styles.dismissText}>{t.gettingStarted.exploreOnMyOwn}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  circle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  circleDone: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  rowLabel: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },
  rowLabelDone: {
    color: C.textMuted,
    textDecorationLine: 'line-through',
  },
  dismissRow: {
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
  },
  dismissText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
  },
});

export default GettingStarted;
