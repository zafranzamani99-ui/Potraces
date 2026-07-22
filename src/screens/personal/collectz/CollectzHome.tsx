// CollectzHome — Collectz/Kutipz landing: sessions I organize + sessions I
// joined, a join-with-code box, and the create FAB. Refresh on focus; rosters
// for organized sessions are fetched in one pass so each card can show a live
// progress line via computeProgress.
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  RefreshControl,
  Pressable,
  TextInput,
  ActivityIndicator,
  Keyboard,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../../constants';
import { useCalm } from '../../../hooks/useCalm';
import { useT } from '../../../i18n';
import { useToast } from '../../../context/ToastContext';
import FAB from '../../../components/common/FAB';
import PageScrollView from '../../../components/common/PageScrollView';
import NeuButton from '../../../components/common/NeuButton';
import ScreenGuide from '../../../components/common/ScreenGuide';
import PaywallModal from '../../../components/common/PaywallModal';
import { useNeu } from '../../../components/common/neu';
import { lightTap } from '../../../services/haptics';
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
  isCollectzAuthError,
  clubImageUrl,
  type JoinedRow,
} from '../../../services/collectzService';
import { presetClubIcon } from '../../../constants/clubIcons';
import { fmtDateTime, fmtMoney, fill } from './collectzFormat';

// Pull a join code out of pasted text — either a bare code or a full share
// link (collectzUrl → SITE_BASE/<code>). Strip to the code alphabet + upper.
function extractShareCode(raw: string): string {
  let s = (raw ?? '').trim();
  if (!s) return '';
  const url = s.match(/https?:\/\/\S+/i);
  if (url) {
    const seg = url[0].split(/[/?#]/).filter(Boolean).pop();
    if (seg) s = seg;
  }
  try {
    s = decodeURIComponent(s);
  } catch {
    // not valid percent-encoding — use the raw segment as-is
  }
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const CollectzHome: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const neu = useNeu(undefined, { faintDark: true });
  const insets = useSafeAreaInsets();
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
    } catch (err) {
      // Signed-out is NOT an error: there's simply no account data to list.
      // The empty-state cards already explain the screen, and join-by-code
      // still works anonymously — so settle quietly instead of toasting
      // "couldn't load, pull to retry" at someone who just isn't signed in.
      if (isCollectzAuthError(err)) {
        setOrganizing([]);
        setJoined([]);
      } else {
        showToast(t.collectz.homeLoadError, 'error');
      }
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
    setJoinCode('');
    navigation.navigate('CollectzJoin', { code });
  };

  // Paste-to-fill: pull the code from the clipboard (bare code or share link)
  // so the user never has to type it out.
  const handlePaste = useCallback(async () => {
    lightTap();
    const code = extractShareCode(await Clipboard.getStringAsync());
    if (!code) {
      showToast(t.collectz.homePasteEmpty, 'info');
      return;
    }
    setJoinCode(code);
  }, [showToast, t]);

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
        style={({ pressed }) => [styles.card, neu.raisedSoft, pressed && { opacity: 0.9 }]}
        onPress={() => openSession(s, mine)}
        onLongPress={mine ? undefined : () => toggleArchive(s)}
        accessibilityRole="button"
        accessibilityLabel={s.title}
      >
        <View style={styles.cardTopRow}>
          {(() => {
            // Show the club icon / photo the organizer picked at create time.
            // Preset emoji PNGs are square artwork → contain in a square well;
            // uploaded club photos → cover (mirrors CollectzDetail's header).
            const preset = presetClubIcon(s.image_path);
            const uri = !preset && s.image_path ? clubImageUrl(s.image_path) : null;
            if (!preset && !uri) return null;
            return (
              <View style={styles.clubWell}>
                {preset ? (
                  <Text style={styles.clubEmoji}>{preset.emoji}</Text>
                ) : (
                  <Image source={{ uri: uri! }} style={styles.clubImagePhoto} resizeMode="cover" />
                )}
              </View>
            );
          })()}
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
    let used = 0;
    try {
      used = await countSessionsCreatedThisWeek();
    } catch (err) {
      // Signed-out: the count throws auth_required, and this rejection used to
      // be swallowed — the + button silently did nothing. Creating genuinely
      // needs an account (sessions live on the server under owner_id), so
      // prompt sign-in and come straight back here, same flow as CollectzJoin.
      if (isCollectzAuthError(err)) {
        Alert.alert(t.collectz.signInCreateTitle, t.collectz.signInCreateBody, [
          { text: t.common.cancel, style: 'cancel' },
          {
            text: t.collectz.signInCta,
            onPress: () => navigation.navigate('Account', { returnTo: 'CollectzHome' }),
          },
        ]);
        return;
      }
      // Any other failure keeps the documented fail-open: let them create.
    }
    if (!canCreate(tier, 'maxCollectzSessionsPerWeek', used)) {
      setWeeklyUsed(used);
      setPaywallVisible(true);
      return;
    }
    navigation.navigate('CollectzCreate');
  }, [navigation, t]);

  return (
    <View style={styles.screen}>
      <ScreenGuide
        id="guide_collectz"
        title={t.guide.collectzTitle}
        icon="users"
        accent="#6BA3BE"
        description={t.guide.descCollectz}
        points={[
          { icon: 'plus-circle', text: t.guide.collectzPoint1 },
          { icon: 'check-circle', text: t.guide.collectzPoint2 },
        ]}
      />
      <PageScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
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
              <View style={[styles.emptyCard, neu.raisedSoft]}>
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
              <View style={[styles.emptyCard, neu.raisedSoft]}>
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
              <View style={styles.joinInputWrap}>
                <TextInput
                  style={styles.joinInput}
                  value={joinCode}
                  onChangeText={setJoinCode}
                  placeholder={t.collectz.homeJoinPlaceholder}
                  placeholderTextColor={withAlpha(C.textMuted, 0.55)}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="go"
                  onSubmitEditing={submitJoinCode}
                />
                {joinCode.length > 0 ? (
                  <Pressable
                    onPress={() => { lightTap(); setJoinCode(''); }}
                    style={styles.joinAffordance}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t.common.clear}
                  >
                    <Feather name="x" size={18} color={C.textMuted} />
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={handlePaste}
                    style={styles.joinAffordance}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t.collectz.homePaste}
                  >
                    <Feather name="clipboard" size={17} color={C.textSecondary} />
                  </Pressable>
                )}
              </View>
              <NeuButton
                icon="log-in"
                label={t.collectz.homeJoin}
                onPress={submitJoinCode}
                style={styles.joinBtn}
              />
            </View>
          </>
        )}
      </PageScrollView>

      <FAB
        onPress={onCreatePress}
        icon="plus"
        style={{ bottom: Math.max(SPACING.xl, insets.bottom + SPACING.md) }}
      />
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
    scroll: { flex: 1 },
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
      // surface + elevation from neu.raisedSoft (base C.background)
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      gap: 6,
    },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    clubWell: {
      width: 40,
      height: 40,
      borderRadius: RADIUS.md,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    clubEmoji: { fontSize: 26 },
    clubImagePhoto: { width: 40, height: 40 },
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
      // surface + elevation from neu.raisedSoft (base C.background)
      borderRadius: RADIUS.lg,
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
    joinInputWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: C.inputBorder,
      backgroundColor: C.background,
    },
    joinInput: {
      flex: 1,
      alignSelf: 'stretch',
      paddingHorizontal: SPACING.md,
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
      letterSpacing: 1,
    },
    joinAffordance: {
      paddingHorizontal: SPACING.md,
      alignSelf: 'stretch',
      justifyContent: 'center',
    },
    joinBtn: {
      // inline NeuButton beside the input: undo the default 100% width and
      // match the input's 48 height
      width: undefined,
      minHeight: 48,
      paddingVertical: SPACING.sm,
      paddingHorizontal: SPACING.lg,
    },
  });

export default CollectzHome;
