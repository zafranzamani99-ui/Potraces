import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, ScrollView, TouchableOpacity, Pressable, Alert, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ReanimatedSwipeable, { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, ICON_SIZE, SHADOWS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useNeu } from '../../components/common/neu';
import { lightTap, selectionChanged } from '../../services/haptics';
import { supabasePersonal } from '../../services/supabase';
import EmptyState from '../../components/common/EmptyState';
import PullRefresh from '../../components/common/PullRefresh';
import { useNotificationStore, AppNotification, BroadcastRow } from '../../store/notificationStore';
import { iconFor, tintFor, relTime, isTransaction } from '../../utils/notificationMeta';

const DELETE_RED = '#E5484D';

const NotificationRow: React.FC<{
  item: AppNotification;
  index: number;
  onPress: (n: AppNotification) => void;
  onLongPress: (id: string) => void;
  onDelete: (id: string) => void;
  selectMode: boolean;
  isSelected: boolean;
}> = ({ item, index, onPress, onLongPress, onDelete, selectMode, isSelected }) => {
  const C = useCalm();
  const neu = useNeu();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const swipeRef = React.useRef<SwipeableMethods>(null);

  const handleDelete = useCallback(() => {
    swipeRef.current?.close();
    onDelete(item.id);
  }, [onDelete, item.id]);

  const deleteTap = useMemo(
    () => Gesture.Tap().runOnJS(true).onEnd(() => handleDelete()),
    [handleDelete],
  );

  const renderRightActions = useCallback(
    () => (
      <GestureDetector gesture={deleteTap}>
        <View style={styles.swipeDeleteBtn} accessibilityRole="button" accessibilityLabel={t.notifications.delete}>
          <Feather name="trash-2" size={20} color={C.surface} />
        </View>
      </GestureDetector>
    ),
    [deleteTap, styles.swipeDeleteBtn, t, C.surface],
  );

  const tint = tintFor(item, C);

  const content = (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item.id)}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityState={selectMode ? { checked: isSelected } : undefined}
    >
      <View style={[styles.card, isSelected && styles.cardSelected]}>
        {selectMode && (
          <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
            {isSelected && <Feather name="check" size={14} color={C.surface} />}
          </View>
        )}
        <View style={[styles.iconWrap, neu.well, { backgroundColor: withAlpha(tint, 0.14) }]}>
          <Feather name={iconFor(item)} size={ICON_SIZE.sm} color={tint} />
        </View>
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
            {!item.read && <View style={styles.unreadDot} />}
          </View>
          {!!item.body && <Text style={styles.bodyText} numberOfLines={3}>{item.body}</Text>}
          <Text style={styles.time}>{relTime(item.createdAt, t)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <Reanimated.View entering={FadeIn.duration(360).delay(Math.min(index, 8) * 40)}>
      {/* Neu shadow on the UNCLIPPED wrapper — the swipeable clips its children and
          would shear the shadow into a hard seam otherwise (the neu-onyx rule). */}
      <View style={[styles.rowShadow, neu.raisedSoft]}>
        {selectMode ? (
          // No swipe-to-delete in select mode — taps toggle the checkbox instead.
          content
        ) : (
          <ReanimatedSwipeable
            ref={swipeRef}
            renderRightActions={renderRightActions}
            overshootRight={false}
            friction={1}
            rightThreshold={40}
          >
            {content}
          </ReanimatedSwipeable>
        )}
      </View>
    </Reanimated.View>
  );
};

type NotifFilter = 'all' | 'transaction' | 'announcement';

const Notifications: React.FC = () => {
  const navigation = useNavigation<any>();
  const C = useCalm();
  const t = useT();
  const neu = useNeu(undefined, { faintDark: true }); // Neu Pills (Onyx rule 3)
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();

  const items = useNotificationStore((s) => s.items);
  const hasUnread = useNotificationStore((s) => s.items.some((n) => !n.read));
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const remove = useNotificationStore((s) => s.remove);
  const mergeBroadcasts = useNotificationStore((s) => s.mergeBroadcasts);

  const [filter, setFilter] = useState<NotifFilter>('all');

  // Pull-to-refresh — re-pull active admin broadcasts from Supabase and merge them
  // (local read/dismissed state wins). Mirrors App.tsx's refreshBroadcasts, which is
  // the only server source feeding this inbox; update/push notices are local.
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data } = await supabasePersonal
        .from('announcements')
        .select('id,title,body,created_at')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(50);
      if (data && data.length) mergeBroadcasts(data as BroadcastRow[]);
    } catch {
      /* best-effort */
    } finally {
      setRefreshing(false);
    }
  }, [mergeBroadcasts]);

  // ── Select mode (long-press to enter, tap to toggle — like TransactionsList) ──
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const enterSelectMode = useCallback((firstId: string) => {
    selectionChanged();
    setSelectMode(true);
    setSelectedIds(new Set([firstId]));
  }, []);

  const toggleSelect = useCallback((id: string) => {
    lightTap();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (next.size === 0) setSelectMode(false);
      return next;
    });
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    const n = selectedIds.size;
    Alert.alert(
      (n > 1 ? t.notifications.deleteNTitlePlural : t.notifications.deleteNTitle).replace('{n}', String(n)),
      t.notifications.deleteConfirmMsg,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: () => {
            for (const id of selectedIds) remove(id);
            exitSelectMode();
          },
        },
      ]
    );
  }, [selectedIds, remove, exitSelectMode, t]);

  // Split into logged transactions vs updates/announcements; the pills filter
  // between them. Each bucket stays newest-first (items are already sorted).
  const { filtered, pills } = useMemo(() => {
    const txns = items.filter(isTransaction);
    const anns = items.filter((n) => !isTransaction(n));
    const data = filter === 'transaction' ? txns : filter === 'announcement' ? anns : items;
    return {
      filtered: data,
      pills: [
        { key: 'all' as NotifFilter, label: t.notifications.filterAll, count: items.length },
        { key: 'transaction' as NotifFilter, label: t.notifications.filterTransactions, count: txns.length },
        { key: 'announcement' as NotifFilter, label: t.notifications.filterAnnouncements, count: anns.length },
      ],
    };
  }, [items, filter, t]);

  const onPress = useCallback(
    (n: AppNotification) => {
      if (selectMode) { toggleSelect(n.id); return; }
      lightTap();
      if (!n.read) markRead(n.id);
      navigation.navigate('NotificationDetail', { id: n.id });
    },
    [selectMode, toggleSelect, markRead, navigation],
  );

  const onLongPress = useCallback(
    (id: string) => {
      if (!selectMode) enterSelectMode(id);
    },
    [selectMode, enterSelectMode],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        hasUnread ? (
          <TouchableOpacity
            onPress={() => { lightTap(); markAllRead(); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.headerBtn}
          >
            <Text style={styles.headerBtnText}>{t.notifications.markAllRead}</Text>
          </TouchableOpacity>
        ) : undefined,
    });
  }, [navigation, hasUnread, markAllRead, styles, t]);

  return (
    <View style={styles.container}>
      {/* ── Neu Pills filter bar (fixed above the list) ── */}
      {items.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.pillScroll}
          contentContainerStyle={styles.pillRow}
        >
          {pills.map((p) => {
            const active = filter === p.key;
            return (
              <TouchableOpacity
                key={p.key}
                style={[styles.pill, neu.raised, active && styles.pillActive]}
                onPress={() => { lightTap(); setFilter(p.key); }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.pillText, active && styles.pillTextActive]}>
                  {p.label}{p.count > 0 && p.key !== 'all' ? ` ${p.count}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <PullRefresh refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent}>
        <FlatList
          style={styles.list}
          data={filtered}
          keyExtractor={(n) => n.id}
          renderItem={({ item, index }) => (
            <NotificationRow
              item={item}
              index={index}
              onPress={onPress}
              onLongPress={onLongPress}
              onDelete={remove}
              selectMode={selectMode}
              isSelected={selectedIds.has(item.id)}
            />
          )}
          contentContainerStyle={filtered.length ? styles.listContent : styles.listEmpty}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            items.length === 0 ? (
              <EmptyState icon="bell" title={t.notifications.emptyTitle} message={t.notifications.emptyMessage} />
            ) : (
              <EmptyState
                icon={filter === 'transaction' ? 'credit-card' : 'volume-2'}
                title={t.notifications.filterEmpty}
                message={t.notifications.emptyMessage}
              />
            )
          }
        />
      </PullRefresh>

      {/* Select mode — floating bar: cancel · N selected · delete (red on press), like TransactionsList */}
      {selectMode && (
        <View style={[styles.selectBar, { bottom: insets.bottom + SPACING.md }]}>
          <TouchableOpacity
            onPress={exitSelectMode}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.selectBarCloseBtn}
            accessibilityRole="button"
            accessibilityLabel={t.common.cancel}
          >
            <Feather name="x" size={18} color={C.textSecondary} />
          </TouchableOpacity>
          <Text style={styles.selectBarCount}>
            {selectedIds.size} {t.notifications.selected}
          </Text>
          <Pressable
            onPress={handleBulkDelete}
            accessibilityRole="button"
            accessibilityLabel={t.common.delete}
            style={({ pressed }) => [
              styles.selectBarDeleteBtn,
              pressed && styles.selectBarDeleteBtnPressed,
            ]}
          >
            {({ pressed }) => (
              <>
                <Feather name="trash-2" size={15} color={pressed ? DELETE_RED : C.textMuted} />
                <Text
                  style={[
                    styles.selectBarDeleteText,
                    pressed && styles.selectBarDeleteTextPressed,
                  ]}
                >
                  {t.common.delete}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    list: { flex: 1 },
    listContent: { padding: SPACING.lg, paddingBottom: SPACING['3xl'] },
    listEmpty: { flexGrow: 1, justifyContent: 'center', padding: SPACING.lg },
    headerBtn: { paddingHorizontal: SPACING.md },
    headerBtnText: {
      color: C.accent,
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
    },
    // ── Neu Pills filter bar ──
    pillScroll: { flexGrow: 0, flexShrink: 0 },
    pillRow: {
      flexDirection: 'row',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.md,
      paddingBottom: SPACING.sm,
    },
    pill: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.xs + 3,
      borderRadius: RADIUS.full,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
    },
    pillActive: { backgroundColor: C.accent },
    pillText: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.medium,
      color: C.textSecondary,
      letterSpacing: 0.1,
    },
    pillTextActive: { color: C.onAccent, fontWeight: TYPOGRAPHY.weight.bold },
    rowShadow: { borderRadius: RADIUS.xl, marginBottom: SPACING.sm + 6 },
    card: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      borderRadius: RADIUS.xl,
      backgroundColor: C.background,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.md,
    },
    iconWrap: {
      width: 42,
      height: 42,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: SPACING.md,
    },
    body: { flex: 1, minWidth: 0 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    title: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      flexShrink: 1,
      letterSpacing: -0.1,
    },
    unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent, flexShrink: 0 },
    bodyText: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textSecondary,
      marginTop: 3,
      lineHeight: 19,
    },
    time: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      fontWeight: TYPOGRAPHY.weight.medium,
      marginTop: 6,
      letterSpacing: 0.1,
    },
    swipeDeleteBtn: {
      backgroundColor: C.neutral,
      justifyContent: 'center',
      alignItems: 'center',
      width: 56,
      marginLeft: SPACING.sm,
      borderRadius: RADIUS.xl,
    },
    // ── Select mode — checkbox + card highlight (mirrors TransactionItem) ──
    cardSelected: {
      backgroundColor: withAlpha(C.accent, 0.06),
      borderWidth: 1,
      borderColor: withAlpha(C.accent, 0.25),
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: RADIUS.full,
      borderWidth: 2,
      borderColor: C.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: SPACING.sm,
      marginTop: 10,
    },
    checkboxChecked: {
      backgroundColor: C.accent,
      borderColor: C.accent,
    },
    // ── Select mode — floating bordered bar (cancel · N selected · delete) ──
    selectBar: {
      position: 'absolute',
      left: SPACING.lg,
      right: SPACING.lg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      backgroundColor: C.background,
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: C.border,
      ...SHADOWS.md,
    },
    selectBarCloseBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    selectBarCount: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    selectBarDeleteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 4,
      borderRadius: RADIUS.md,
    },
    selectBarDeleteBtnPressed: {
      backgroundColor: withAlpha(DELETE_RED, 0.12),
    },
    selectBarDeleteText: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textMuted,
    },
    selectBarDeleteTextPressed: {
      color: DELETE_RED,
      fontWeight: TYPOGRAPHY.weight.semibold,
    },
  });

export default Notifications;
