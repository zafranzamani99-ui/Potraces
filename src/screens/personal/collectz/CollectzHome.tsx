// CollectzHome — Collectz/Kutipz landing: sessions I organize + sessions I
// joined, a join-with-code box, and the create FAB. Refresh on focus; rosters
// for organized sessions are fetched in one pass so each row can show a live
// progress figure via computeProgress.
//
// Design: "statement" — a bank-ledger look. One typographic hero (amount left
// to collect + a one-line attention summary), then sessions as divided rows
// in a single surface per section. No emoji wells, no category washes, no
// stat tiles: the money and the typography do the talking. UI glyphs are
// Ionicons (premium iOS-native feel), not Feather.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  RefreshControl,
  Pressable,
  TextInput,
  ActivityIndicator,
  Keyboard,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import HowItWorksModal, { HowItWorksSection } from '../../../components/common/HowItWorksModal';
import { fetchReferralProgress } from '../../../services/entitlements';
import { useNeu } from '../../../components/common/neu';
import { lightTap } from '../../../services/haptics';
import { usePremiumStore } from '../../../store/premiumStore';
import { canCreate } from '../../../constants/tiers';
import {
  CollectzSession,
  CollectzParticipant,
  listMySessions,
  getRostersForSessions,
  computeProgress,
  countSessionsCreatedThisWeek,
  viewByShareCode,
  archiveParticipant,
  unarchiveParticipant,
  listMyJoinedParticipantRows,
  isCollectzAuthError,
  type JoinedRow,
} from '../../../services/collectzService';
import { fmtEventRange, fmtMoney, fill } from './collectzFormat';

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

  // Header buttons (top-right): how-it-works + Collectz reward explainers,
  // shown as grouped Bills-style HowItWorksModal cards. The reward one reads
  // as a quest — objective steps, then your progress as the final item.
  const [howOpen, setHowOpen] = useState(false);
  const [questOpen, setQuestOpen] = useState(false);
  const [quest, setQuest] = useState<{ have: number; needed: number; days: number; done: boolean } | null>(null);

  const openHowItWorks = useCallback(() => {
    lightTap();
    setHowOpen(true);
  }, []);

  const openRewardInfo = useCallback(async () => {
    lightTap();
    const p = await fetchReferralProgress(); // null when signed out / offline
    setQuest(p ? { have: p.milestoneHave, needed: p.milestoneNeeded, days: p.milestoneDays, done: p.milestoneDone } : null);
    setQuestOpen(true);
  }, []);

  const howSections: HowItWorksSection[] = useMemo(() => [
    {
      group: t.collectz.hiwGroupBasics,
      items: [
        { icon: 'plus-circle', bold: t.collectz.hiwCreateB, rest: t.collectz.hiwCreateR },
        { icon: 'users', bold: t.collectz.hiwRosterB, rest: t.collectz.hiwRosterR },
        { icon: 'link', bold: t.collectz.hiwJoinB, rest: t.collectz.hiwJoinR },
      ],
    },
    {
      group: t.collectz.hiwGroupTracking,
      items: [
        { icon: 'upload', bold: t.collectz.hiwProofB, rest: t.collectz.hiwProofR },
        { icon: 'check-circle', bold: t.collectz.hiwMarkB, rest: t.collectz.hiwMarkR },
        { icon: 'send', bold: t.collectz.hiwNudgeB, rest: t.collectz.hiwNudgeR },
      ],
    },
    {
      group: t.collectz.hiwGroupWrap,
      items: [
        { icon: 'check-square', bold: t.collectz.hiwSettleB, rest: t.collectz.hiwSettleR },
      ],
    },
  ], [t]);

  const questSections: HowItWorksSection[] = useMemo(() => {
    const steps = [
      { icon: 'share-2', bold: t.collectz.questShareB, rest: t.collectz.questShareR },
      { icon: 'user-check', bold: t.collectz.questSettleB, rest: t.collectz.questSettleR },
      quest
        ? {
            icon: 'award',
            bold: fill(t.collectz.questRewardB, { needed: quest.needed }),
            // Guard: days=0 means the server config row is MISSING (see
            // app_config.milestone_collectz_days) — never print "0 days of
            // Pro"; fall back to the number-free copy until it's fixed.
            rest: quest.days > 0 ? fill(t.collectz.questRewardR, { days: quest.days }) : t.collectz.questRewardGenericR,
          }
        : { icon: 'award', bold: t.collectz.questRewardGenericB, rest: t.collectz.questRewardGenericR },
    ];
    const progressItem = !quest
      ? { icon: 'log-in', bold: t.collectz.questProgressB, rest: t.collectz.questSignedOutR }
      : quest.done
        ? { icon: 'check-circle', bold: t.collectz.questDoneB, rest: fill(t.collectz.questDoneR, { days: quest.days }) }
        : { icon: 'flag', bold: t.collectz.questProgressB, rest: fill(t.collectz.questProgressR, { have: quest.have, needed: quest.needed }) };
    return [{ group: t.collectz.questGroup, items: [...steps, progressItem] }];
  }, [t, quest]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerBtns}>
          <Pressable
            onPress={openHowItWorks}
            hitSlop={8}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel={t.collectz.homeHowItWorks}
          >
            <Ionicons name="help-circle-outline" size={22} color={C.textPrimary} />
          </Pressable>
          <Pressable
            onPress={() => { void openRewardInfo(); }}
            hitSlop={8}
            style={styles.headerBtn}
            accessibilityRole="button"
            accessibilityLabel={t.collectz.rewardTitle}
          >
            <Ionicons name="gift-outline" size={21} color={C.textPrimary} />
          </Pressable>
        </View>
      ),
    });
  }, [navigation, styles, C, t, openHowItWorks, openRewardInfo]);

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const mine = await listMySessions();
      setOrganizing(mine.organizing);
      setJoined(mine.joined);
      // Rosters for every organized session in ONE query — rows need them for
      // the progress figure. Batched so Home load doesn't slow down as the
      // session count grows; a failed fetch degrades to "no progress".
      setRosters(await getRostersForSessions(mine.organizing.map((s) => s.id)));

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

  // ── Hero derivations ──
  // Attention counts, from state the rows already use.
  const statActive = organizing.filter((s) => s.status === 'open').length + activeJoined.length;
  const statToReview = Object.values(rosters).reduce(
    (sum, r) => sum + r.filter((p) => p.status === 'pending').length,
    0,
  );
  const statToPay = Object.values(myJoinedRows).filter(
    // join_status gate: a queued/declined join request owes nothing yet.
    (r) => r.join_status === 'active' && (r.status === 'unpaid' || r.status === 'rejected') && !r.archived_at,
  ).length;
  // "To collect" = Σ(target − confirmed) over open organized sessions with a
  // money target. Only shown when every contributing session shares one
  // currency (mixing currencies would lie); sessions without a target don't
  // contribute — their remainder is unknowable.
  const toCollectSessions = organizing.filter((s) => {
    if (s.status !== 'open') return false;
    const p = computeProgress(s, rosters[s.id] ?? []);
    return p.target != null && p.target > 0;
  });
  const toCollectCurrencies = [...new Set(toCollectSessions.map((s) => s.currency))];
  const toCollect =
    toCollectCurrencies.length === 1
      ? {
          currency: toCollectCurrencies[0],
          amount: toCollectSessions.reduce((sum, s) => {
            const p = computeProgress(s, rosters[s.id] ?? []);
            return sum + Math.max((p.target ?? 0) - p.confirmed, 0);
          }, 0),
        }
      : null;

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

  // One ledger row: title + date/scheme meta on the left, money progress on
  // the right. Pending-review organizer rows get a small gold dot by the title.
  const renderRow = (s: CollectzSession, mine: boolean, last: boolean) => {
    const progress = mine ? computeProgress(s, rosters[s.id] ?? []) : null;
    const jprog = !mine ? joinedProgress[s.id] : null;
    const dateLine = fmtEventRange(s.event_at, s.event_end);
    const settled = s.status !== 'open';
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
    // One money shape for both row kinds; only the source differs.
    const money =
      mine && progress && progress.activeCount > 0
        ? { confirmed: progress.confirmed, target: progress.target, n: progress.confirmedCount, m: progress.activeCount, frac: pct }
        : !mine && jprog && jprog.active_count > 0
          ? { confirmed: jprog.confirmed_amount, target: jprog.target_amount, n: jprog.confirmed_count, m: jprog.active_count, frac: jpct }
          : null;
    const pendingCount = mine ? (rosters[s.id] ?? []).filter((p) => p.status === 'pending').length : 0;
    const barColor = settled ? C.neutral : C.accent;
    return (
      <Pressable
        key={s.id}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
        onPress={() => openSession(s, mine)}
        onLongPress={mine ? undefined : () => toggleArchive(s)}
        accessibilityRole="button"
        accessibilityLabel={s.title}
      >
        <View style={styles.rowMain}>
          <View style={styles.rowTitleLine}>
            {pendingCount > 0 && <View style={styles.reviewDot} />}
            <Text style={styles.rowTitle} numberOfLines={1}>{s.title}</Text>
            {settled && (
              <Text style={styles.rowStatus} numberOfLines={1}>
                {s.status === 'settled' ? t.collectz.settledBanner : t.collectz.cancelledBanner}
              </Text>
            )}
            <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
          </View>
          <Text style={styles.rowMeta} numberOfLines={1}>
            {[dateLine || null, amountLine(s)].filter(Boolean).join('  ·  ')}
          </Text>
          {money && (
            <View style={styles.rowMoneyBlock}>
              <View style={styles.rowMoneyLine}>
                <Text style={styles.rowMoney}>
                  {money.target != null
                    ? `${fmtMoney(money.confirmed, s.currency)} / ${fmtMoney(money.target, s.currency)}`
                    : fmtMoney(money.confirmed, s.currency)}
                </Text>
                <Text style={styles.rowPaid}>
                  {fill(t.collectz.confirmedCount, { n: money.n, m: money.m })}
                </Text>
              </View>
              <View style={styles.rowTrack}>
                <View style={[styles.rowFill, { width: `${Math.round(money.frac * 100)}%`, backgroundColor: barColor }]} />
              </View>
            </View>
          )}
        </View>
        {!last && <View style={styles.rowDivider} pointerEvents="none" />}
      </Pressable>
    );
  };

  const renderRows = (sessions: CollectzSession[], mine: boolean) => (
    <View style={[styles.listCard, neu.raisedSoft]}>
      {sessions.map((s, i) => renderRow(s, mine, i === sessions.length - 1))}
    </View>
  );

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

  const hasAttention = statActive + statToReview + statToPay > 0;

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
            {/* ── Hero: the number that matters + one-line attention summary ── */}
            {(toCollect != null || hasAttention) && (
              <View style={styles.hero}>
                {toCollect != null && (
                  <>
                    <Text style={styles.heroLabel}>{t.collectz.homeToCollect}</Text>
                    <Text style={styles.heroAmount}>{fmtMoney(toCollect.amount, toCollect.currency)}</Text>
                  </>
                )}
                {hasAttention && (
                  <Text style={styles.heroMeta}>
                    {`${statActive} ${t.collectz.homeStatActive}`}
                    {statToReview > 0 && (
                      <Text style={{ color: C.gold }}>{`   ·   ${statToReview} ${t.collectz.homeStatToReview}`}</Text>
                    )}
                    {statToPay > 0 && (
                      <Text style={{ color: C.overdue }}>{`   ·   ${statToPay} ${t.collectz.homeStatToPay}`}</Text>
                    )}
                  </Text>
                )}
              </View>
            )}

            {/* ── I organize ── */}
            <Text style={styles.sectionLabel}>{t.collectz.homeOrganize}</Text>
            {organizing.length === 0 ? (
              <View style={[styles.emptyCard, neu.raisedSoft]}>
                <Text style={styles.emptyTitle}>{t.collectz.homeEmptyOrganizeTitle}</Text>
                <Text style={styles.emptyBody}>{t.collectz.homeEmptyOrganizeBody}</Text>
              </View>
            ) : (
              renderRows(organizing, true)
            )}

            {/* ── I joined ── */}
            <Text style={[styles.sectionLabel, styles.sectionGap]}>{t.collectz.homeJoined}</Text>
            {joined.length === 0 ? (
              <View style={[styles.emptyCard, neu.raisedSoft]}>
                <Text style={styles.emptyBody}>{t.collectz.homeEmptyJoinedBody}</Text>
              </View>
            ) : (
              <>
                {activeJoined.length === 0 && archivedJoined.length > 0 && (
                  <Text style={styles.emptyBody}>{t.collectz.homeEmptyJoinedBody}</Text>
                )}
                {activeJoined.length > 0 && renderRows(activeJoined, false)}
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
                      <Ionicons name={archivedOpen ? 'chevron-down' : 'chevron-forward'} size={15} color={C.textMuted} />
                    </Pressable>
                    {archivedOpen && renderRows(archivedJoined, false)}
                  </>
                )}
              </>
            )}

            {/* ── Join with a code ── */}
            <Text style={[styles.sectionLabel, styles.sectionGap]}>{t.collectz.homeJoinTitle}</Text>
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
                    <Ionicons name="close" size={18} color={C.textMuted} />
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={handlePaste}
                    style={styles.joinAffordance}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={t.collectz.homePaste}
                  >
                    <Ionicons name="clipboard-outline" size={17} color={C.textSecondary} />
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
        color={C.deepOlive}
        style={{ bottom: Math.max(SPACING.xl, insets.bottom + SPACING.md) }}
      />
      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        feature="collectz"
        currentUsage={weeklyUsed}
      />
      <HowItWorksModal
        visible={howOpen}
        onClose={() => setHowOpen(false)}
        title={t.collectz.homeHowItWorks}
        subtitle={t.collectz.homeHowItWorksSub}
        sections={howSections}
        dismissLabel={t.common.gotIt}
      />
      <HowItWorksModal
        visible={questOpen}
        onClose={() => setQuestOpen(false)}
        title={t.collectz.rewardTitle}
        subtitle={t.collectz.questSub}
        sections={questSections}
        dismissLabel={t.common.gotIt}
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
    headerBtns: { flexDirection: 'row', alignItems: 'center' },
    headerBtn: { padding: 6 },

    // ── Hero ──
    hero: { marginBottom: SPACING.xl, gap: 2 },
    heroLabel: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    heroAmount: {
      fontSize: TYPOGRAPHY.size['3xl'],
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
      letterSpacing: -0.5,
    },
    heroMeta: { fontSize: TYPOGRAPHY.size.sm, color: C.textMuted, marginTop: 2 },

    // ── Sections ──
    sectionLabel: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
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
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },

    // ── Ledger list ──
    listCard: {
      // surface + elevation from neu.raisedSoft (base C.background)
      borderRadius: RADIUS.lg,
      paddingVertical: SPACING.xs,
    },
    row: {
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
    },
    rowDivider: {
      position: 'absolute',
      left: SPACING.md,
      right: 0,
      bottom: 0,
      height: StyleSheet.hairlineWidth,
      backgroundColor: withAlpha(C.textPrimary, 0.08),
    },
    rowMain: { gap: 2 },
    rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    reviewDot: { width: 6, height: 6, borderRadius: RADIUS.full, backgroundColor: C.gold },
    rowTitle: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
    },
    rowStatus: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: TYPOGRAPHY.weight.medium,
      color: C.textMuted,
    },
    rowMeta: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary },
    rowMoneyBlock: { marginTop: 6, gap: 4 },
    rowMoneyLine: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: SPACING.sm,
    },
    rowMoney: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
    },
    rowPaid: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted },
    rowTrack: {
      height: 3,
      borderRadius: RADIUS.full,
      backgroundColor: C.pillBg,
      overflow: 'hidden',
    },
    rowFill: { height: 3, borderRadius: RADIUS.full },

    // ── Empty states ──
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

    // ── Join with a code ──
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
