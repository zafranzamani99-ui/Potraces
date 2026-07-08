// ─── QUICK ACTIONS (neumorphic) ────────────────────────────────────────
// Drop-in replacement for the Dashboard's inline "Quick Actions" section.
// Neumorphic tiles, your existing icons, two horizontal-scroll rows (drag/swipe
// on device), press-spring inset.
//
// PLACE AT: src/components/common/QuickActions.tsx
//
// WIRE IT IN (Dashboard.tsx) — delete the old `{/* Quick Actions */} <View …>…</View>`
// block and its getQuickActions/renderActionIcon defs, then render:
//   <QuickActions onAction={handleQuickAction} billsBadge={billsBadge} />
// (handleQuickAction is the existing `(screen) => { … navigation.navigate(screen); }`.)

import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { lightTap } from '../../services/haptics';
import { NeuSurface } from './neu';

// Same set as the old Dashboard.getQuickActions — keep keys/screens identical.
const getQuickActions = (C: typeof CALM) => [
  { key: 'wallets' as const, icon: 'i/wallet', screen: 'WalletManagement', color: C.accent },
  { key: 'savings' as const, icon: 'm/piggy-bank', screen: 'SavingsTracker', color: C.gold },
  { key: 'debts' as const, icon: 'm/hand-coin', screen: 'DebtTracking', color: C.bronze },
  { key: 'bills' as const, icon: 'i/repeat', screen: 'SubscriptionList', color: C.accent },
  { key: 'reports' as const, icon: 'i/stats-chart', screen: 'PersonalReports', color: C.deepOlive },
  { key: 'calculator' as const, icon: 'i/calculator', screen: 'Calculator', color: C.accent },
  { key: 'goals' as const, icon: 'm/target', screen: 'Goals', color: C.gold },
  { key: 'receipts' as const, icon: 'i/receipt', screen: 'ReceiptHistory', color: C.deepOlive },
  { key: 'chat' as const, icon: 'i/flash', screen: 'MoneyChat', color: C.gold },
  { key: 'pulse' as const, icon: 'i/pulse', screen: 'FinancialPulse', color: C.accent },
];

const renderActionIcon = (spec: string, color: string, size = 27) => {
  const [lib, name] = spec.includes('/') ? spec.split('/') : ['f', spec];
  if (lib === 'm') return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
  if (lib === 'i') return <Ionicons name={name as any} size={size} color={color} />;
  return <Feather name={name as any} size={size} color={color} />;
};

interface Props {
  onAction: (screen: string) => void;
  billsBadge?: number;
}

const QuickActions: React.FC<Props> = ({ onAction, billsBadge = 0 }) => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const actions = useMemo(() => getQuickActions(C), [C]);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const rows = [actions.slice(0, 5), actions.slice(5, 10)];

  return (
    <View style={styles.section}>
      <Text style={styles.title}>{t.dashboard.quickActions}</Text>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={styles.rowWrap}>
          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
            style={styles.scroll}
          >
            {row.map((action) => (
              <Pressable
                key={action.key}
                onPressIn={() => setPressedKey(action.key)}
                onPressOut={() => setPressedKey(null)}
                onPress={() => { lightTap(); onAction(action.screen); }}
                style={styles.btn}
                accessibilityRole="button"
                accessibilityLabel={(t.dashboard as any)[action.key]}
              >
                <NeuSurface pressed={pressedKey === action.key} style={styles.chip}>
                  {renderActionIcon(action.icon, action.color, 27)}
                  {action.key === 'bills' && billsBadge > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{billsBadge}</Text>
                    </View>
                  )}
                </NeuSurface>
                <Text style={styles.label} numberOfLines={1}>{(t.dashboard as any)[action.key]}</Text>
              </Pressable>
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
      ))}
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  section: { marginTop: SPACING.sm, gap: SPACING.sm },
  title: {
    fontSize: 13,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: 0.2,
  },
  rowWrap: { position: 'relative', marginRight: -SPACING['2xl'] },
  scroll: { overflow: 'visible' },
  row: { flexDirection: 'row', gap: SPACING.md, paddingRight: SPACING['2xl'], paddingVertical: 4 },
  btn: { alignItems: 'center', gap: 6, width: 76 },
  chip: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.onAccent,
    fontVariant: ['tabular-nums'],
  },
  fade: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 40 },
});

export default React.memo(QuickActions);
