// ─── QUICK ACTIONS (neumorphic, customizable) ──────────────────────────
// Drop-in replacement for the Dashboard's inline "Quick Actions" section.
// Neumorphic tiles, your existing icons, two horizontal-scroll rows (drag/swipe
// on device), press-spring inset.
//
// Users customize the inline rows from the "See all" sheet: Edit mode pins /
// unpins tiles and drag-reorders them (hold & drag, same pattern as
// CategoryManager). The layout persists in settingsStore.quickActionOrder;
// tiles missing from it sit under "More actions".
//
// PLACE AT: src/components/common/QuickActions.tsx
//
// WIRE IT IN (Dashboard.tsx) — delete the old `{/* Quick Actions */} <View …>…</View>`
// block and its getQuickActions/renderActionIcon defs, then render:
//   <QuickActions onAction={handleQuickAction} billsBadge={billsBadge} />
// (handleQuickAction is the existing `(screen) => { … navigation.navigate(screen); }`.)

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { CALM, SPACING, TYPOGRAPHY, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { lightTap } from '../../services/haptics';
import { DEFAULT_QUICK_ACTION_ORDER, useSettingsStore } from '../../store/settingsStore';
import { NeuSurface } from './neu';
import BottomSheet from './BottomSheet';

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
  { key: 'collectz' as const, icon: 'm/account-group', screen: 'CollectzHome', color: C.deepOlive },
];

type QuickAction = ReturnType<typeof getQuickActions>[number];

const renderActionIcon = (spec: string, color: string, size = 27) => {
  const [lib, name] = spec.includes('/') ? spec.split('/') : ['f', spec];
  if (lib === 'm') return <MaterialCommunityIcons name={name as any} size={size} color={color} />;
  if (lib === 'i') return <Ionicons name={name as any} size={size} color={color} />;
  return <Feather name={name as any} size={size} color={color} />;
};

interface Props {
  onAction: (screen: string) => void;
  billsBadge?: number;
  /** Count of receipt scans that failed and need review — badge on the Receipts tile. */
  receiptsBadge?: number;
}

const QuickActions: React.FC<Props> = ({ onAction, billsBadge = 0, receiptsBadge = 0 }) => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const actions = useMemo(() => getQuickActions(C), [C]);
  const specByKey = useMemo(() => new Map<string, QuickAction>(actions.map((a) => [a.key, a])), [actions]);

  const quickActionOrder = useSettingsStore((s) => s.quickActionOrder);
  const setQuickActionOrder = useSettingsStore((s) => s.setQuickActionOrder);

  // Pinned tiles in the user's saved order (unknown keys dropped — forward-
  // compatible if a tile is ever removed); everything else sits under More.
  const pinned = useMemo(
    () => quickActionOrder.map((k) => specByKey.get(k)).filter((a): a is QuickAction => !!a),
    [quickActionOrder, specByKey],
  );
  const unpinned = useMemo(
    () => actions.filter((a) => !quickActionOrder.includes(a.key)),
    [actions, quickActionOrder],
  );

  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState(false);
  // Split in half so a growing tile list never silently drops the last tile.
  const rows = [pinned.slice(0, Math.ceil(pinned.length / 2)), pinned.slice(Math.ceil(pinned.length / 2))];
  // On wide screens (tablet / landscape) all tiles fit, so center them instead of
  // left-packing a scroller. No-op on phones (where the row overflows & scrolls).
  const { width } = useWindowDimensions();
  const wide = width >= 700;

  const label = (key: QuickAction['key']) => (t.dashboard as any)[key];

  const pin = useCallback((key: QuickAction['key']) => {
    lightTap();
    setQuickActionOrder([...quickActionOrder, key]);
  }, [quickActionOrder, setQuickActionOrder]);

  const unpin = useCallback((key: QuickAction['key']) => {
    lightTap();
    setQuickActionOrder(quickActionOrder.filter((k) => k !== key));
  }, [quickActionOrder, setQuickActionOrder]);

  const resetLayout = useCallback(() => {
    lightTap();
    setQuickActionOrder([...DEFAULT_QUICK_ACTION_ORDER]);
  }, [setQuickActionOrder]);

  const closeSheet = useCallback(() => {
    setShowAll(false);
    setEditing(false);
  }, []);

  const renderTile = (action: QuickAction, onPress: () => void) => (
    <Pressable
      key={action.key}
      onPressIn={() => setPressedKey(action.key)}
      onPressOut={() => setPressedKey(null)}
      onPress={onPress}
      style={styles.btn}
      accessibilityRole="button"
      accessibilityLabel={label(action.key)}
    >
      <NeuSurface pressed={pressedKey === action.key} style={styles.chip}>
        {renderActionIcon(action.icon, action.color, 27)}
        {action.key === 'bills' && billsBadge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{billsBadge}</Text>
          </View>
        )}
        {action.key === 'receipts' && receiptsBadge > 0 && (
          <View style={[styles.badge, styles.badgeWarn]}>
            <Text style={styles.badgeText}>{receiptsBadge}</Text>
          </View>
        )}
      </NeuSurface>
      <Text style={styles.label} numberOfLines={1}>{label(action.key)}</Text>
    </Pressable>
  );

  const renderEditRow = ({ item, drag, isActive }: RenderItemParams<QuickAction>) => (
    <ScaleDecorator>
      <View style={[styles.editRow, isActive && styles.editRowActive]}>
        <Pressable
          onLongPress={drag}
          delayLongPress={150}
          style={styles.editRowMain}
          accessibilityRole="button"
          accessibilityLabel={label(item.key)}
        >
          <View style={[styles.editRowChip, { backgroundColor: withAlpha(item.color, 0.15) }]}>
            {renderActionIcon(item.icon, item.color, 20)}
          </View>
          <Text style={styles.editRowLabel} numberOfLines={1}>{label(item.key)}</Text>
        </Pressable>
        <Pressable
          onPress={() => unpin(item.key)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={label(item.key)}
        >
          <Feather name="minus-circle" size={22} color={C.overdue} />
        </Pressable>
        <Pressable onLongPress={drag} delayLongPress={150} hitSlop={10}>
          <Feather name="menu" size={18} color={isActive ? C.accent : C.neutral} />
        </Pressable>
      </View>
    </ScaleDecorator>
  );

  return (
    <View style={styles.section}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{t.dashboard.quickActions}</Text>
        <Pressable
          onPress={() => { lightTap(); setShowAll(true); }}
          style={styles.seeAllBtn}
          accessibilityRole="button"
          accessibilityLabel={t.dashboard.seeAll}
          hitSlop={8}
        >
          <Text style={styles.seeAllText}>{t.dashboard.seeAll}</Text>
          <Feather name="chevron-right" size={14} color={C.accent} />
        </Pressable>
      </View>
      {rows.map((row, rowIdx) => (
        <View key={rowIdx} style={[styles.rowWrap, wide && styles.rowWrapWide]}>
          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.row, wide && styles.rowWide]}
            style={styles.scroll}
            scrollEnabled={!wide}
          >
            {row.map((action) => renderTile(action, () => { lightTap(); onAction(action.screen); }))}
          </ScrollView>
          {!wide && (
            <LinearGradient
              colors={[withAlpha(C.background, 0), withAlpha(C.background, 1)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.fade}
              pointerEvents="none"
            />
          )}
        </View>
      ))}

      <BottomSheet
        visible={showAll}
        onClose={closeSheet}
        header={
          <View style={styles.sheetHeaderRow}>
            <Text style={styles.sheetTitle}>{t.dashboard.quickActions}</Text>
            <Pressable
              onPress={() => { lightTap(); setEditing((e) => !e); }}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={editing ? t.common.done : t.common.edit}
            >
              <Text style={styles.editToggle}>{editing ? t.common.done : t.common.edit}</Text>
            </Pressable>
          </View>
        }
        closeLabel={t.common.close}
        maxHeightPct={0.8}
      >
        {editing ? (
          <View style={styles.editWrap}>
            <Text style={styles.dragHint}>{t.dashboard.quickActionsReorderHint}</Text>
            <Text style={styles.editSectionLabel}>{t.dashboard.quickActionsShown}</Text>
            <DraggableFlatList
              data={pinned}
              keyExtractor={(item) => item.key}
              renderItem={renderEditRow}
              onDragEnd={({ data }) => setQuickActionOrder(data.map((a) => a.key))}
              showsVerticalScrollIndicator={false}
              activationDistance={5}
              style={styles.editList}
              ListEmptyComponent={
                <Text style={styles.emptyText}>{t.dashboard.quickActionsEmpty}</Text>
              }
            />
            {unpinned.length > 0 && (
              <>
                <Text style={styles.editSectionLabel}>{t.dashboard.quickActionsMore}</Text>
                {unpinned.map((action) => (
                  <View key={action.key} style={styles.editRow}>
                    <View style={styles.editRowMain}>
                      <View style={[styles.editRowChip, { backgroundColor: withAlpha(action.color, 0.15) }]}>
                        {renderActionIcon(action.icon, action.color, 20)}
                      </View>
                      <Text style={styles.editRowLabel} numberOfLines={1}>{label(action.key)}</Text>
                    </View>
                    <Pressable
                      onPress={() => pin(action.key)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={label(action.key)}
                    >
                      <Feather name="plus-circle" size={22} color={C.accent} />
                    </Pressable>
                  </View>
                ))}
              </>
            )}
            <Pressable onPress={resetLayout} style={styles.resetBtn} hitSlop={8}>
              <Text style={styles.resetText}>{t.dashboard.quickActionsReset}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.grid}>
            {[...pinned, ...unpinned].map((action) =>
              renderTile(action, () => {
                lightTap();
                closeSheet();
                onAction(action.screen);
              }),
            )}
          </View>
        )}
      </BottomSheet>
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  section: { marginTop: SPACING.sm, gap: SPACING.sm },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 13,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: 0.2,
  },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: {
    fontSize: 12,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
  rowWrap: { position: 'relative', marginRight: -SPACING['2xl'] },
  rowWrapWide: { marginRight: 0 },
  scroll: { overflow: 'visible' },
  row: { flexDirection: 'row', gap: SPACING.md, paddingRight: SPACING['2xl'], paddingVertical: 4 },
  rowWide: { flexGrow: 1, justifyContent: 'center', paddingRight: 0 },
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
  badgeWarn: {
    // "needs review" — bronze signals attention vs the neutral accent bills count.
    backgroundColor: C.bronze,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.onAccent,
    fontVariant: ['tabular-nums'],
  },
  fade: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 40 },
  sheetHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  editToggle: {
    fontSize: 13,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  editWrap: { paddingTop: SPACING.xs },
  // Let the pinned list shrink & scroll so "More actions" + reset stay visible
  // inside the sheet's maxHeight on smaller phones.
  editList: { flexShrink: 1, flexGrow: 0 },
  dragHint: {
    fontSize: 11,
    color: C.textMuted,
    marginBottom: SPACING.sm,
  },
  editSectionLabel: {
    fontSize: 11,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: SPACING.sm,
    marginBottom: 2,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  editRowActive: { opacity: 0.85 },
  editRowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  editRowChip: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editRowLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  emptyText: {
    fontSize: 12,
    color: C.textMuted,
    paddingVertical: SPACING.md,
    textAlign: 'center',
  },
  resetBtn: { alignSelf: 'center', marginTop: SPACING.md },
  resetText: {
    fontSize: 12,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.neutral,
  },
});

export default React.memo(QuickActions);
