import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ReanimatedSwipeable, { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, ICON_SIZE, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useNeu } from '../../components/common/neu';
import { lightTap } from '../../services/haptics';
import EmptyState from '../../components/common/EmptyState';
import { useNotificationStore, AppNotification } from '../../store/notificationStore';
import { iconFor, tintFor, relTime, isTransaction } from '../../utils/notificationMeta';

const NotificationRow: React.FC<{
  item: AppNotification;
  index: number;
  onPress: (n: AppNotification) => void;
  onDelete: (id: string) => void;
}> = ({ item, index, onPress, onDelete }) => {
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
    <TouchableOpacity activeOpacity={0.85} onPress={() => onPress(item)} accessibilityRole="button">
      <View style={styles.card}>
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
        <ReanimatedSwipeable
          ref={swipeRef}
          renderRightActions={renderRightActions}
          overshootRight={false}
          friction={1}
          rightThreshold={40}
        >
          {content}
        </ReanimatedSwipeable>
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

  const items = useNotificationStore((s) => s.items);
  const hasUnread = useNotificationStore((s) => s.items.some((n) => !n.read));
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const remove = useNotificationStore((s) => s.remove);

  const [filter, setFilter] = useState<NotifFilter>('all');

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
      lightTap();
      if (!n.read) markRead(n.id);
      navigation.navigate('NotificationDetail', { id: n.id });
    },
    [markRead, navigation],
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

      <FlatList
        data={filtered}
        keyExtractor={(n) => n.id}
        renderItem={({ item, index }) => (
          <NotificationRow item={item} index={index} onPress={onPress} onDelete={remove} />
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
    </View>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
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
  });

export default Notifications;
