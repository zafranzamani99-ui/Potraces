import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Alert } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useNeu } from '../../components/common/neu';
import { useT } from '../../i18n';
import { lightTap } from '../../services/haptics';
import NeuButton from '../../components/common/NeuButton';
import { useNotificationStore } from '../../store/notificationStore';
import { iconFor, tintFor, relTime, sourceLabel } from '../../utils/notificationMeta';
import type { RootStackParamList } from '../../types';

type DetailRoute = RouteProp<RootStackParamList, 'NotificationDetail'>;

const NotificationDetail: React.FC = () => {
  const C = useCalm();
  // Onyx: faintDark neu for the card surfaces…
  const neu = useNeu(undefined, { faintDark: true });
  // …but the focal hero icon LIFTS with full neu (standalone-icon rule).
  const neuFull = useNeu();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<DetailRoute>();

  const item = useNotificationStore((s) => s.items.find((n) => n.id === route.params.id));
  const markRead = useNotificationStore((s) => s.markRead);
  const remove = useNotificationStore((s) => s.remove);

  // Safety: mark read when the detail is opened (the list already does this on
  // tap, but a notification could be reached another way).
  useEffect(() => {
    if (item && !item.read) markRead(item.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id]);

  if (!item) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Feather name="bell-off" size={44} color={C.textMuted} />
        <Text style={styles.emptyTitle}>{t.notifications.notFound}</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.goBackBtn} activeOpacity={0.7}>
          <Text style={styles.goBackText}>{t.notifications.goBack}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const tint = tintFor(item, C);
  const storeUrl = typeof item.data?.storeUrl === 'string' ? (item.data.storeUrl as string) : '';
  const canUpdate = item.type === 'update' && !!storeUrl;

  // Collectz pushes carry { type: 'collectz_*', sessionId } — offer the way
  // onward. Organizer-bound types open the console, participant types the join
  // screen; a removed participant's row is gone, so they land on Collectz home.
  const collectzType = typeof item.data?.type === 'string' && item.data.type.startsWith('collectz_') ? item.data.type : null;
  const collectzSessionId = typeof item.data?.sessionId === 'string' ? item.data.sessionId : null;
  const canViewSession = !!collectzType && (!!collectzSessionId || collectzType === 'collectz_removed');

  const handleViewSession = () => {
    lightTap();
    if (collectzType === 'collectz_removed') {
      (navigation as any).navigate('CollectzHome');
      return;
    }
    const organizer =
      collectzType === 'collectz_pending' ||
      collectzType === 'collectz_team_change' ||
      collectzType === 'collectz_join_requested';
    (navigation as any).navigate(organizer ? 'CollectzDetail' : 'CollectzJoin', { sessionId: collectzSessionId });
  };

  const handleUpdate = () => {
    lightTap();
    Linking.openURL(storeUrl).catch(() => {});
  };

  const handleDelete = () => {
    lightTap();
    Alert.alert(t.notifications.deleteNotification, t.notifications.deleteConfirmMsg, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.notifications.delete,
        style: 'destructive',
        onPress: () => {
          remove(item.id);
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingBottom: SPACING['3xl'] + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero card ── */}
        <View style={[styles.heroCard, neu.raisedSoft]}>
          <View style={styles.heroTop}>
            <View style={[styles.iconWrap, neuFull.raised, { backgroundColor: withAlpha(tint, 0.12) }]}>
              <Feather name={iconFor(item)} size={24} color={tint} />
            </View>
            <View style={styles.heroMeta}>
              <Text style={[styles.sourceLabel, { color: tint }]} numberOfLines={1}>
                {sourceLabel(item, t).toUpperCase()}
              </Text>
              <Text style={styles.relTime}>{relTime(item.createdAt, t)}</Text>
            </View>
          </View>

          <Text style={styles.title} selectable>{item.title}</Text>
          {!!item.body && (
            <Text style={styles.body} selectable>{item.body}</Text>
          )}
        </View>

        {/* ── Meta card ── */}
        <View style={[styles.metaCard, neu.raisedSoft]}>
          <DetailRow icon="send" label={t.notifications.from} value={sourceLabel(item, t)} C={C} />
          <View style={styles.divider} />
          <DetailRow
            icon="clock"
            label={t.notifications.received}
            value={format(new Date(item.createdAt), 'd MMM yyyy, h:mm a')}
            C={C}
          />
        </View>

        {/* ── Update CTA (update notices only) ── */}
        {canUpdate && (
          <View style={styles.actionWrap}>
            <NeuButton icon="download" label={t.notifications.updateNow} onPress={handleUpdate} />
          </View>
        )}

        {/* ── Collectz CTA (collectz pushes only) ── */}
        {canViewSession && (
          <View style={styles.actionWrap}>
            <NeuButton icon="users" label={t.collectz.viewSession} onPress={handleViewSession} />
          </View>
        )}

        {/* ── Delete ── */}
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete} activeOpacity={0.7}>
          <Feather name="trash-2" size={14} color={C.bronze} />
          <Text style={styles.deleteText}>{t.notifications.deleteNotification}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

// Label / value row — icon slot, fixed-width label, wrapping value.
const DetailRow = ({
  icon,
  label,
  value,
  C,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  C: typeof CALM;
}) => (
  <View style={styles_detailRow.row}>
    <View style={[styles_detailRow.iconCircle, { backgroundColor: withAlpha(C.textSecondary, 0.08) }]}>
      <Feather name={icon} size={13} color={C.textSecondary} />
    </View>
    <Text style={[styles_detailRow.label, { color: C.textSecondary }]}>{label}</Text>
    <Text style={[styles_detailRow.value, { color: C.textPrimary }]}>{value}</Text>
  </View>
);

const styles_detailRow = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  label: {
    fontSize: TYPOGRAPHY.size.sm,
    letterSpacing: 0.2,
    width: 84,
  },
  value: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    letterSpacing: 0.2,
    textAlign: 'right',
  },
});

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: C.background },
    container: { flex: 1, backgroundColor: C.background },
    content: { padding: SPACING.lg },
    centered: { justifyContent: 'center', alignItems: 'center', padding: SPACING.xl },

    // ── Hero card ──
    heroCard: {
      borderRadius: RADIUS.xl,
      backgroundColor: C.background,
      padding: SPACING.xl,
      marginBottom: SPACING.lg,
      // neu.raisedSoft (bg + shadow) spread at the call site — no overflow:'hidden'.
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: SPACING.lg,
    },
    iconWrap: {
      width: 52,
      height: 52,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: SPACING.md,
    },
    heroMeta: { flex: 1, minWidth: 0 },
    sourceLabel: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: TYPOGRAPHY.weight.semibold,
      letterSpacing: 0.6,
    },
    relTime: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      fontWeight: TYPOGRAPHY.weight.medium,
      marginTop: 3,
      letterSpacing: 0.1,
    },
    title: {
      fontSize: TYPOGRAPHY.size.xl,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      letterSpacing: -0.3,
      lineHeight: 28,
    },
    body: {
      fontSize: TYPOGRAPHY.size.base,
      color: C.textSecondary,
      lineHeight: 23,
      marginTop: SPACING.md,
    },

    // ── Meta card ──
    metaCard: {
      borderRadius: RADIUS.xl,
      backgroundColor: C.background,
      paddingVertical: SPACING.xs,
      marginBottom: SPACING.lg,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: C.border,
      marginHorizontal: SPACING.md,
    },

    // ── Update CTA ──
    actionWrap: { marginBottom: SPACING.sm },

    // ── Delete ──
    deleteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.xs,
      paddingVertical: SPACING.md,
      marginTop: SPACING.sm,
    },
    deleteText: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.bronze,
      fontWeight: TYPOGRAPHY.weight.medium,
      letterSpacing: 0.2,
    },

    // ── Not found ──
    emptyTitle: {
      fontSize: TYPOGRAPHY.size.lg,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      marginTop: SPACING.md,
    },
    goBackBtn: {
      marginTop: SPACING.lg,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.xl,
      backgroundColor: C.pillBg,
      borderRadius: RADIUS.full,
    },
    goBackText: { fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary },
  });

export default NotificationDetail;
