// CollectzHome — Collectz/Kutipz landing: sessions I organize + sessions I
// joined, a join-with-code box, and the create FAB. Refresh on focus; rosters
// for organized sessions are fetched in one pass so each card can show a live
// progress line via computeProgress.
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Pressable,
  TextInput,
  ActivityIndicator,
  Keyboard,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../../constants';
import { useCalm } from '../../../hooks/useCalm';
import { useT } from '../../../i18n';
import { useToast } from '../../../context/ToastContext';
import FAB from '../../../components/common/FAB';
import PaywallModal from '../../../components/common/PaywallModal';
import { lightTap, mediumTap } from '../../../services/haptics';
import { usePremiumStore } from '../../../store/premiumStore';
import { canCreate } from '../../../constants/tiers';
import {
  CollectzSession,
  CollectzParticipant,
  listMySessions,
  getSessionWithRoster,
  computeProgress,
  countSessionsCreatedThisWeek,
  viewByShareCode,
  archiveParticipant,
  unarchiveParticipant,
  listMyJoinedParticipantRows,
  type JoinedRow,
} from '../../../services/collectzService';
import { fmtDateTime, fmtMoney, fill } from './collectzFormat';

const CollectzHome: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation<any>();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [organizing, setOrganizing] = useState<CollectzSession[]>([]);
  const [joined, setJoined] = useState<CollectzSession[]>([]);
  // Free tier: 2 session creations per calendar week (joining is always free).
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [weeklyUsed, setWeeklyUsed] = useState(0);
  const [rosters, setRosters] = useState<Record<string, CollectzParticipant[]>>({});
  const [joinCode, setJoinCode] = useState('');
  // Joined-side: my participant rows (archive flags) + per-session progress.
  const [myJoinedRows, setMyJoinedRows] = useState<Record<string, JoinedRow>>({});
  const [joinedProgress, setJoinedProgress] = useState<Record<string, { active_count: number; confirmed_count: number; target_amount: number | null; confirmed_amount: number }>>({});
  const [archivedOpen, setArchivedOpen] = useState(false);

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const mine = await listMySessions();
      setOrganizing(mine.organizing);
      setJoined(mine.joined);
      // Rosters for organized sessions in one pass — cards need them for the
      // progress line. A failed roster fetch degrades to "no progress line".
      const entries = await Promise.all(
        mine.organizing.map(async (s) => {
          try {
            const { participants } = await getSessionWithRoster(s.id);
            return [s.id, participants] as const;
          } catch {
            return [s.id, []] as const;
          }
        }),
      );
      setRosters(Object.fromEntries(entries));

      // Joined-side: my participant rows (archive state) + progress per session
      // (the join view is the only place a participant sees full progress).
      const rows = await listMyJoinedParticipantRows();
      setMyJoinedRows(Object.fromEntries(rows.map((r) => [r.session_id, r])));
      const progEntries = await Promise.all(
        mine.joined.map(async (s) => {
          try {
            const view = await viewByShareCode(s.share_code);
            return [s.id, view.progress] as const;
          } catch {
            return null;
          }
        }),
      );
      setJoinedProgress(Object.fromEntries(progEntries.filter((e): e is NonNullable<typeof e> => e !== null)));
    } catch {
      showToast(t.collectz.homeLoadError, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast, t]);

  useFocusEffect(
    useCallback(() => {
      load(true);
    }, [load]),
  );

  const amountLine = useCallback(
    (s: CollectzSession): string => {
      if (s.scheme === 'flat' && s.default_share != null) {
        return fill(t.collectz.perPerson, { amount: fmtMoney(s.default_share, s.currency) });
      }
      if (s.scheme === 'equal' && s.total_amount != null) {
        return fill(t.collectz.totalAmount, { amount: fmtMoney(s.total_amount, s.currency) });
      }
      return t.collectz.customAmounts;
    },
    [t],
  );

  const openSession = (s: CollectzSession, mine: boolean) => {
    lightTap();
    if (mine) navigation.navigate('CollectzDetail', { sessionId: s.id });
    else navigation.navigate('CollectzJoin', { sessionId: s.id });
  };

  // Archive rules: explicit flag, or settled/cancelled and untouched 30+ days.
  const isArchived = useCallback(
    (s: CollectzSession): boolean => {
      const row = myJoinedRows[s.id];
      if (row?.archived_at) return true;
      if (s.status !== 'open') {
        const age = Date.now() - new Date(s.updated_at).getTime();
        return age > 30 * 86_400_000;
      }
      return false;
    },
    [myJoinedRows],
  );

  const activeJoined = joined.filter((s) => !isArchived(s));
  const archivedJoined = joined.filter(isArchived);

  const toggleArchive = (s: CollectzSession) => {
    const row = myJoinedRows[s.id];
    if (!row) return;
    const archived = isArchived(s);
    Alert.alert(s.title, undefined, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: archived ? t.collectz.unarchive : t.collectz.archive,
        onPress: async () => {
          try {
            if (archived) await unarchiveParticipant(row.id);
            else await archiveParticipant(row.id);
            showToast(archived ? t.collectz.unarchivedToast : t.collectz.archivedToast, 'success');
            load();
          } catch {
            showToast(t.collectz.actionError, 'error');
          }
        },
      },
    ]);
  };

  const submitJoinCode = () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    Keyboard.dismiss();
    mediumTap();
    setJoinCode('');
    navigation.navigate('CollectzJoin', { code });
  };

  const renderCard = (s: CollectzSession, mine: boolean) => {
    const progress = mine ? computeProgress(s, rosters[s.id] ?? []) : null;
    const jprog = !mine ? joinedProgress[s.id] : null;
    const dateLine = fmtDateTime(s.event_at);
    const pct =
      progress && progress.target && progress.target > 0
        ? Math.min(progress.confirmed / progress.target, 1)
        : progress && progress.activeCount > 0
          ? progress.confirmedCount / progress.activeCount
          : 0;
    const jpct =
      jprog && jprog.target_amount && jprog.target_amount > 0
        ? Math.min(jprog.confirmed_amount / jprog.target_amount, 1)
        : jprog && jprog.active_count > 0
          ? jprog.confirmed_count / jprog.active_count
          : 0;
    return (
      <Pressable
        key={s.id}
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
        onPress={() => openSession(s, mine)}
        onLongPress={mine ? undefined : () => toggleArchive(s)}
        accessibilityRole="button"
        accessibilityLabel={s.title}
      >
        <View style={styles.cardTopRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>{s.title}</Text>
          {s.status !== 'open' && (
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>
                {s.status === 'settled' ? t.collectz.settledBanner : t.collectz.cancelledBanner}
              </Text>
            </View>
          )}
          <Feather name="chevron-right" size={18} color={C.textMuted} />
        </View>
        {!!dateLine && (
          <View style={styles.cardMetaRow}>
            <Feather name="calendar" size={13} color={C.textMuted} />
            <Text style={styles.cardMeta}>{dateLine}</Text>
          </View>
        )}
        <View style={styles.cardMetaRow}>
          <Feather name="dollar-sign" size={13} color={C.textMuted} />
          <Text style={styles.cardMeta}>{amountLine(s)}</Text>
        </View>
        {progress && progress.activeCount > 0 && (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(pct * 100)}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {progress.target != null
                ? `${fill(t.collectz.progressOfTarget, {
                    confirmed: fmtMoney(progress.confirmed, s.currency),
                    target: fmtMoney(progress.target, s.currency),
                  })} · ${fill(t.collectz.confirmedCount, { n: progress.confirmedCount, m: progress.activeCount })}`
                : fill(t.collectz.confirmedCount, { n: progress.confirmedCount, m: progress.activeCount })}
            </Text>
          </View>
        )}
        {jprog && jprog.active_count > 0 && (
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(jpct * 100)}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {jprog.target_amount != null
                ? `${fill(t.collectz.progressOfTarget, {
                    confirmed: fmtMoney(jprog.confirmed_amount, s.currency),
                    target: fmtMoney(jprog.target_amount, s.currency),
                  })} · ${fill(t.collectz.confirmedCount, { n: jprog.confirmed_count, m: jprog.active_count })}`
                : fill(t.collectz.confirmedCount, { n: jprog.confirmed_count, m: jprog.active_count })}
            </Text>
          </View>
        )}
      </Pressable>
    );
  };

  // Free tier gate: 2 creations per calendar week; paid tiers unlimited.
  // Joining someone's session is never gated. Fail-open on count errors.
  const onCreatePress = useCallback(async () => {
    lightTap();
    const tier = usePremiumStore.getState().tier;
    const used = await countSessionsCreatedThisWeek();
    if (!canCreate(tier, 'maxCollectzSessionsPerWeek', used)) {
      setWeeklyUsed(used);
      setPaywallVisible(true);
      return;
    }
    navigation.navigate('CollectzCreate');
  }, [navigation]);

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.accent} />
        }
      >
        {loading ? (
          <ActivityIndicator size="large" color={C.accent} style={styles.loader} />
        ) : (
          <>
            {/* ── I organize ── */}
            <Text style={styles.sectionTitle}>{t.collectz.homeOrganize}</Text>
            {organizing.length === 0 ? (
              <View style={styles.emptyCard}>
                <Feather name="users" size={22} color={C.textMuted} />
                <Text style={styles.emptyTitle}>{t.collectz.homeEmptyOrganizeTitle}</Text>
                <Text style={styles.emptyBody}>{t.collectz.homeEmptyOrganizeBody}</Text>
              </View>
            ) : (
              organizing.map((s) => renderCard(s, true))
            )}

            {/* ── I joined ── */}
            <Text style={[styles.sectionTitle, styles.sectionGap]}>{t.collectz.homeJoined}</Text>
            {joined.length === 0 ? (
              <View style={styles.emptyCard}>
                <Feather name="inbox" size={22} color={C.textMuted} />
                <Text style={styles.emptyBody}>{t.collectz.homeEmptyJoinedBody}</Text>
              </View>
            ) : (
              <>
                {activeJoined.length === 0 && archivedJoined.length > 0 && (
                  <Text style={styles.emptyBody}>{t.collectz.homeEmptyJoinedBody}</Text>
                )}
                {activeJoined.map((s) => renderCard(s, false))}
                {archivedJoined.length > 0 && (
                  <>
                    <Pressable
                      style={styles.archivedHeader}
                      onPress={() => { lightTap(); setArchivedOpen((v) => !v); }}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: archivedOpen }}
                    >
                      <Text style={styles.archivedHeaderText}>
                        {fill(t.collectz.archivedSection, { count: archivedJoined.length })}
                      </Text>
                      <Feather name={archivedOpen ? 'chevron-down' : 'chevron-right'} size={16} color={C.textMuted} />
                    </Pressable>
                    {archivedOpen && archivedJoined.map((s) => renderCard(s, false))}
                  </>
                )}
              </>
            )}

            {/* ── Join with a code ── */}
            <Text style={[styles.sectionTitle, styles.sectionGap]}>{t.collectz.homeJoinTitle}</Text>
            <View style={styles.joinRow}>
              <TextInput
                style={styles.joinInput}
                value={joinCode}
                onChangeText={setJoinCode}
                placeholder={t.collectz.homeJoinPlaceholder}
                placeholderTextColor={C.textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={submitJoinCode}
              />
              <Pressable
                style={({ pressed }) => [styles.joinBtn, pressed && { opacity: 0.85 }]}
                onPress={submitJoinCode}
                accessibilityRole="button"
                accessibilityLabel={t.collectz.homeJoin}
              >
                <Text style={styles.joinBtnText}>{t.collectz.homeJoin}</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>

      <FAB onPress={onCreatePress} icon="plus" />
      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        feature="collectz"
        currentUsage={weeklyUsed}
      />
    </View>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.background },
    content: { padding: SPACING.xl, paddingBottom: 120 },
    loader: { marginTop: SPACING['4xl'] },
    sectionTitle: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      letterSpacing: 0.2,
      marginBottom: SPACING.sm,
    },
    sectionGap: { marginTop: SPACING.xl },
    archivedHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: SPACING.lg,
      marginBottom: SPACING.sm,
      paddingVertical: SPACING.xs,
    },
    archivedHeaderText: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    card: {
      backgroundColor: C.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: withAlpha(C.border, 0.6),
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      gap: 6,
    },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    cardTitle: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
    },
    statusPill: {
      borderRadius: RADIUS.full,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
      backgroundColor: withAlpha(C.neutral, 0.25),
    },
    statusPillText: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: TYPOGRAPHY.weight.medium,
      color: C.textSecondary,
    },
    cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    cardMeta: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary },
    progressWrap: { gap: 4, marginTop: 2 },
    progressTrack: {
      height: 6,
      borderRadius: RADIUS.full,
      backgroundColor: C.pillBg,
      overflow: 'hidden',
    },
    progressFill: { height: 6, borderRadius: RADIUS.full, backgroundColor: C.accent },
    progressText: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted },
    emptyCard: {
      backgroundColor: C.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: withAlpha(C.border, 0.6),
      borderStyle: 'dashed',
      padding: SPACING.xl,
      alignItems: 'center',
      gap: SPACING.sm,
    },
    emptyTitle: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
    },
    emptyBody: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textMuted,
      textAlign: 'center',
      lineHeight: 19,
    },
    joinRow: { flexDirection: 'row', gap: SPACING.sm },
    joinInput: {
      flex: 1,
      minHeight: 48,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: C.inputBorder,
      backgroundColor: C.surface,
      paddingHorizontal: SPACING.md,
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
      letterSpacing: 1,
    },
    joinBtn: {
      minHeight: 48,
      paddingHorizontal: SPACING.lg,
      borderRadius: RADIUS.lg,
      backgroundColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    joinBtnText: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.onAccent,
    },
  });

export default CollectzHome;
