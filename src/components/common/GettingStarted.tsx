/**
 * GettingStarted — the focused next-step card.
 *
 * One step at a time: a thin gold progress bar, ONE clearly-named next action
 * with its benefit line ("why this matters"), and four quiet step dots.
 * Complete a step and the card swaps to the next one with a soft transition —
 * progress you can feel without a single gimmick. Endowed progress: the
 * account dot arrives filled, so the bar never starts at zero.
 *
 * Pure flex layout — no absolute positioning, nothing that can collide or
 * overlap on any screen width.
 */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useSettingsStore } from '../../store/settingsStore';
import { usePersonalStore } from '../../store/personalStore';
import { useWalletStore } from '../../store/walletStore';
import { lightTap } from '../../services/haptics';
import { openQuickAdd } from './QuickAddExpense';
import DuoIcon, { FEATHER_TO_GLYPH } from './DuoIcon';

const GettingStarted: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const navigation = useNavigation<any>();
  const dismissed = useSettingsStore((s) => s.gettingStartedDismissed);
  const setDismissed = useSettingsStore((s) => s.setGettingStartedDismissed);
  const userName = useSettingsStore((s) => s.userName);
  const transactions = usePersonalStore((s) => s.transactions);
  const budgets = usePersonalStore((s) => s.budgets);
  const wallets = useWalletStore((s) => s.wallets);

  if (dismissed || transactions.length >= 5) return null;

  // Ladder order: wallet → first log → budget. "account" is the endowed
  // free step — done from first paint, so progress never reads 0%.
  const steps: {
    icon: keyof typeof Feather.glyphMap;
    title: string;
    benefit: string;
    done: boolean;
    onPress: () => void;
  }[] = [
    {
      icon: 'credit-card',
      title: t.gettingStarted.setUpWallet,
      benefit: t.gettingStarted.benefitWallet,
      done: wallets.length > 0,
      onPress: () => { lightTap(); navigation.getParent()?.navigate('WalletManagement'); },
    },
    {
      icon: 'plus-circle',
      title: t.gettingStarted.logMoneyInOrOut,
      benefit: t.gettingStarted.benefitLog,
      done: transactions.length > 0,
      onPress: () => { lightTap(); openQuickAdd(); },
    },
    {
      icon: 'sliders',
      title: t.gettingStarted.setABudget,
      benefit: t.gettingStarted.benefitBudget,
      done: budgets.length > 0,
      onPress: () => { lightTap(); navigation.getParent()?.navigate('BudgetPlanning'); },
    },
  ];

  const next = steps.find((s) => !s.done);
  if (!next) return null;

  const total = steps.length + 1; // +1 = the endowed "account ready" step
  const doneCount = 1 + steps.filter((s) => s.done).length;
  const title = userName
    ? t.gettingStarted.hiName.replace('{name}', userName)
    : t.gettingStarted.letsGetStarted;
  const progressText = t.gettingStarted.progressLabel
    .replace('{done}', String(doneCount))
    .replace('{total}', String(total));
  // Dot states: account (always done) + the three real steps.
  const dotsDone = [true, ...steps.map((s) => s.done)];
  const currentDot = dotsDone.findIndex((d) => !d);

  return (
    <Animated.View entering={FadeIn.duration(300)} style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Text style={styles.progressText}>{progressText}</Text>
        <TouchableOpacity
          onPress={() => { lightTap(); setDismissed(true); }}
          hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
          accessibilityRole="button"
          accessibilityLabel={t.gettingStarted.dismiss}
        >
          <Feather name="x" size={14} color={C.textMuted} />
        </TouchableOpacity>
      </View>

      {/* gold progress bar — never starts at zero */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(doneCount / total) * 100}%` }]} />
      </View>

      {/* the one next step — swaps with a soft entrance when completed */}
      <Animated.View key={next.title} entering={FadeInDown.duration(260)}>
        <TouchableOpacity
          style={styles.nextStep}
          onPress={next.onPress}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${next.title}. ${next.benefit}`}
        >
          <View style={styles.iconTile}>
            {FEATHER_TO_GLYPH[next.icon] ? (
              <DuoIcon glyph={FEATHER_TO_GLYPH[next.icon]} size={23} color={C.accent} />
            ) : (
              <Feather name={next.icon} size={20} color={C.accent} />
            )}
          </View>
          <View style={styles.nextTextWrap}>
            <Text style={styles.nextTitle} numberOfLines={1}>{next.title}</Text>
            <Text style={styles.nextBenefit} numberOfLines={2}>{next.benefit}</Text>
          </View>
          <Feather name="arrow-right" size={18} color={C.accent} />
        </TouchableOpacity>
      </Animated.View>

      {/* quiet step dots */}
      <View style={styles.dotsRow}>
        {dotsDone.map((done, i) => (
          <View
            key={`dot-${i}`}
            style={[
              styles.dot,
              done ? styles.dotDone : i === currentDot ? styles.dotCurrent : styles.dotFuture,
            ]}
          />
        ))}
      </View>
    </Animated.View>
  );
};

const makeStyles = (C: typeof CALM, isDark: boolean) => StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACING.lg,
    marginBottom: SPACING.md,
    ...(isDark ? SHADOWS.none : SHADOWS.xs),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  title: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    textTransform: 'lowercase',
  },
  progressText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.gold,
  },
  progressTrack: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: withAlpha(C.gold, 0.18),
    marginTop: SPACING.sm,
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    borderRadius: 1.5,
    backgroundColor: C.gold,
  },
  nextStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    backgroundColor: withAlpha(C.accent, isDark ? 0.1 : 0.05),
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginTop: SPACING.md,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(C.accent, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextTextWrap: {
    flex: 1,
  },
  nextTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  nextBenefit: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    lineHeight: TYPOGRAPHY.size.sm * 1.4,
    marginTop: 2,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  dot: {
    borderRadius: RADIUS.full,
  },
  dotDone: {
    width: 8,
    height: 8,
    backgroundColor: C.accent,
  },
  dotCurrent: {
    width: 8,
    height: 8,
    borderWidth: 1.5,
    borderColor: C.accent,
    backgroundColor: withAlpha(C.accent, 0.15),
  },
  dotFuture: {
    width: 6,
    height: 6,
    backgroundColor: withAlpha(C.textMuted, 0.3),
    alignSelf: 'center',
  },
});

export default GettingStarted;
