import React, { useCallback, useLayoutEffect, useMemo } from 'react';
import { View, Text, SectionList, TouchableOpacity, StyleSheet } from 'react-native';
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

const Notifications: React.FC = () => {
  const navigation = useNavigation<any>();
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);

  const items = useNotificationStore((s) => s.items);
  const hasUnread = useNotificationStore((s) => s.items.some((n) => !n.read));
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const remove = useNotificationStore((s) => s.remove);

  // Separate logged transactions from updates/announcements into their own
  // sections. Each section stays newest-first (items are already sorted). A
  // section is omitted entirely when empty so a header never floats alone.
  const sections = useMemo(() => {
    const txns = items.filter(isTransaction);
    const rest = items.filter((n) => !isTransaction(n));
    const out: { key: string; title: string; data: AppNotification[] }[] = [];
    if (txns.length) out.push({ key: 'txn', title: t.notifications.sectionTransactions, data: txns });
    if (rest.length) out.push({ key: 'ann', title: t.notifications.sectionAnnouncements, data: rest });
    return out;
  }, [items, t]);

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

  // Only draw a section header when there's more than one section — a lone
  // group doesn't need a label above it.
  const showHeaders = sections.length > 1;

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(n) => n.id}
        renderItem={({ item, index }) => (
          <NotificationRow item={item} index={index} onPress={onPress} onDelete={remove} />
        )}
        renderSectionHeader={
          showHeaders
            ? ({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>
            : undefined
        }
        stickySectionHeadersEnabled={false}
        contentContainerStyle={items.length ? styles.listContent : styles.listEmpty}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <EmptyState icon="bell" title={t.notifications.emptyTitle} message={t.notifications.emptyMessage} />
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
    sectionHeader: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
      marginTop: SPACING.sm,
      marginBottom: SPACING.md,
    },
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
