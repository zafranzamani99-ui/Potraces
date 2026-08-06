// CollectzJoin — participant event page. Reached from the shared link/code
// (or from CollectzHome with just a sessionId). Public event facts + live
// roster for everyone; signed-in participants get the claim / pay / proof
// flow on top. Realtime refetch keeps statuses live.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  useWindowDimensions,
  Linking,
} from 'react-native';
// Page scroller = gesture-handler's ScrollView (the DebtTracking recipe). The
// app is wrapped in GestureHandlerRootView, and RNGH's ScrollView arbitrates
// with it so drags aren't lost — a plain RN ScrollView (and KeyboardAwareScrollView,
// which is built on one) can intermittently lose the pan ("mostly can't scroll,
// sometimes can"). KeyboardAwareScrollView stays for modals/sheets.
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../../constants';
import { useCalm, useIsDark } from '../../../hooks/useCalm';
import { useT } from '../../../i18n';
import { useToast } from '../../../context/ToastContext';
import { lightTap, mediumTap, selectionChanged, successNotification, errorNotification } from '../../../services/haptics';
import { useNeu } from '../../../components/common/neu';
import FloatingModal from '../../../components/common/FloatingModal';
import PageScrollView from '../../../components/common/PageScrollView';
import PullRefresh from '../../../components/common/PullRefresh';
import NeuButton from '../../../components/common/NeuButton';
import { newstOutline } from '../../../components/business/NewstInput';
import { supabasePersonal } from '../../../services/supabase';
import { embedAmount } from '../../../services/emvQr';
import { isCleanContent } from '../../../utils/contentFilter';
import { useCollectzBlockStore, blockKey } from '../../../store/collectzBlockStore';
import {
  CollectzJoinView,
  CollectzParticipantStatus,
  viewByShareCode,
  claimParticipant,
  addSelf,
  markPaidWithProof,
  withdrawProof,
  subscribeToSession,
  isCollectzAuthError,
  clubImageUrl,
  qrImageUrl,
  joinTeam,
  renameTeam,
  reportContent,
  setParticipantBlock,
  joinErrorMessage,
} from '../../../services/collectzService';
import { presetClubIcon, presetClubColor } from '../../../constants/clubIcons';
import { collectzCategoryColor, collectzCategoryIcon } from '../../../constants/collectzColors';
import MapPreviewCard from '../../../components/collectz/MapPreviewCard';
import StatusChip from '../../../components/collectz/StatusChip';
import { fmtDateTime, fmtEventRange, fmtMoney, fill, teamLabel, SOCIAL_PLATFORMS, requirementChips } from './collectzFormat';

// Leave/unclaim — undo a wrong claim or step out while still unpaid. The
// collectz-join edge function handles action:'leave' (migration 20260728000000
// added the self_added column it needs), so this is live.
const LEAVE_ENABLED = true;

const CollectzJoin: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const neu = useNeu(undefined, { faintDark: true });
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { showToast } = useToast();
  const { width } = useWindowDimensions();

  const paramCode: string | undefined = route.params?.code;
  const paramSessionId: string | undefined = route.params?.sessionId;

  const [code, setCode] = useState<string | null>(paramCode?.trim().toUpperCase() || null);
  const [codeInput, setCodeInput] = useState('');
  const [view, setView] = useState<CollectzJoinView | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [failMsg, setFailMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Team rename: which team is being renamed, plus the draft label.
  const [renameTeamIdx, setRenameTeamIdx] = useState<number | null>(null);
  const [renameFocused, setRenameFocused] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [selfName, setSelfName] = useState('');
  // Moderation (Apple 1.2 UGC): tap a roster member → report/block menu.
  const [memberMenu, setMemberMenu] = useState<CollectzJoinView['participants'][number] | null>(null);
  // 'menu' = the report/block actions; 'report' = pick a preset reason.
  const [memberMenuMode, setMemberMenuMode] = useState<'menu' | 'report'>('menu');
  const blockedMap = useCollectzBlockStore((s) => s._blocked);
  // Server-side (account-level) blocks ride the join view as participant ids.
  const serverBlocked = useMemo(() => new Set(view?.blocked_participant_ids ?? []), [view]);
  // Teams sessions: joining requires picking a team up front (claim + add-self
  // both send it). null = not chosen yet — the join actions gate on this.
  const [joinTeamIdx, setJoinTeamIdx] = useState<number | null>(null);
  const [myRejectNote, setMyRejectNote] = useState<string | null>(null);

  // Claiming / paying needs a personal account. Route the user to the Account
  // hub and come straight back here (returnParams carries the share code).
  const promptSignIn = useCallback(() => {
    Alert.alert(t.collectz.signInTitle, t.collectz.signInBody, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.collectz.signInCta,
        onPress: () =>
          navigation.navigate('Account', {
            returnTo: 'CollectzJoin',
            returnParams: paramSessionId ? { sessionId: paramSessionId } : { code: paramCode ?? code },
          }),
      },
    ]);
  }, [t, navigation, paramCode, paramSessionId, code]);

  // Resolve the share code when we only got a sessionId (from CollectzHome).
  // Participant RLS allows reading that one session row once joined.
  useEffect(() => {
    if (code || !paramSessionId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabasePersonal
        .from('collectz_sessions')
        .select('share_code')
        .eq('id', paramSessionId)
        .single();
      if (cancelled) return;
      if (error || !data?.share_code) {
        setFailed(true);
        setLoading(false);
        return;
      }
      setCode(data.share_code);
    })();
    return () => {
      cancelled = true;
    };
  }, [code, paramSessionId]);

  const load = useCallback(async () => {
    if (!code) return;
    try {
      const v = await viewByShareCode(code);
      setView(v);
      setFailed(false);
      setFailMsg(null);
    } catch (err) {
      // Keep the server's reason ("This session was cancelled.", "Session not
      // found — check the link.") — a generic wall with a doomed Retry hides
      // what actually happened from someone who may have already paid.
      const msg = err instanceof Error && err.message ? err.message : null;
      setFailMsg(msg);
      setFailed(true);
      showToast(msg ?? t.collectz.joinOpenError, 'error');
    } finally {
      setLoading(false);
    }
  }, [code, showToast, t]);

  // Pull-to-refresh — re-run the join-view loader, hold the spinner until it settles.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  useEffect(() => {
    if (code) load();
    else if (!paramSessionId) setLoading(false);
  }, [code, paramSessionId, load]);

  // Live updates — refetch the join view on any roster/session change.
  const sessionId = view?.session?.id ?? null;
  // Scope for name-keyed blocks (roster entries carry no account id).
  const blockScope = sessionId ?? code ?? '';
  useEffect(() => {
    if (!sessionId) return;
    return subscribeToSession(sessionId, () => load());
  }, [sessionId, load]);

  // The join view's my_participant omits reject_note — fetch our own row for it.
  const myId = view?.my_participant?.id ?? null;
  const myStatus = view?.my_participant?.status ?? null;
  useEffect(() => {
    if (myStatus !== 'rejected' || !myId) {
      setMyRejectNote(null);
      return;
    }
    let cancelled = false;
    supabasePersonal
      .from('collectz_participants')
      .select('reject_note')
      .eq('id', myId)
      .single()
      .then(({ data }) => {
        if (!cancelled) setMyRejectNote(data?.reject_note ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [myId, myStatus]);

  const session = view?.session ?? null;
  const my = view?.my_participant ?? null;
  const isOpen = session?.status === 'open';
  const currency = session?.currency ?? 'RM';

  const actives = useMemo(() => (view?.participants ?? []).filter((p) => p.slot === 'active'), [view]);
  const reserves = useMemo(() => (view?.participants ?? []).filter((p) => p.slot === 'reserve'), [view]);
  const claimable = useMemo(() => (view?.participants ?? []).filter((p) => !p.claimed), [view]);

  // Capacity: adding yourself creates a NEW active player, so it's blocked once the
  // roster is full (the edge function enforces it too). Claiming an existing name
  // still works — that slot is already counted.
  const maxParticipants = session?.max_participants ?? null;
  const activeCount = view?.progress?.active_count ?? actives.length;
  const isFull = maxParticipants != null && activeCount >= maxParticipants;

  // Teams — only when the organizer set capacity BY TEAMS. Reserves hold no team
  // slot, so only active players are grouped. Teams never change what anyone pays.
  const teamCount = session?.team_count ?? 0;
  const teamsOn = teamCount > 0;
  const teamSize = session?.team_size ?? null;
  const teamNames = session?.team_names ?? null;
  const myTeam = useMemo(
    () => (my ? (view?.participants ?? []).find((p) => p.id === my.id)?.team_idx ?? null : null),
    [my, view],
  );
  const teamGroups = useMemo(() => {
    if (!teamsOn) return [];
    const groups = Array.from({ length: teamCount }, (_, i) => ({ idx: i + 1, members: [] as typeof actives }));
    for (const p of actives) {
      if (p.team_idx != null && p.team_idx >= 1 && p.team_idx <= teamCount) groups[p.team_idx - 1].members.push(p);
    }
    return groups;
  }, [teamsOn, teamCount, actives]);
  const unassigned = useMemo(
    () => (teamsOn ? actives.filter((p) => p.team_idx == null || p.team_idx > teamCount) : actives),
    [teamsOn, teamCount, actives],
  );

  const myShare = my?.effective_share ?? null;

  // Pay step indicator — a rejection sends the flow back to the Unpaid step
  // (the proof must be redone) but keeps its terracotta. Same colour semantics
  // as StatusChip (unpaid → neutral lavender).
  const myPayStep: 'unpaid' | 'pending' | 'confirmed' =
    my?.status === 'pending' ? 'pending' : my?.status === 'confirmed' ? 'confirmed' : 'unpaid';
  const myStepColor = my?.status === 'rejected' ? C.overdue : C.neutral;

  // Category identity — tints the hero wash, club well and progress/capacity fills.
  const catColor = collectzCategoryColor(session?.category, isDark);

  // Exact-amount DuitNow QR — same visual pattern as QrPaySheet (white card so
  // it scans in dark mode). Falls back to the raw payload if embedding fails.
  const qrValue = useMemo(() => {
    if (!view?.qr_payload) return null;
    if (myShare == null) return view.qr_payload;
    try {
      return embedAmount(view.qr_payload, Math.round(myShare * 100));
    } catch {
      return view.qr_payload;
    }
  }, [view?.qr_payload, myShare]);
  const qrSize = Math.min(Math.round(width * 0.62), 260);
  // Fallback for a photo-only QR (organizer saved a picture, not a scanned payload).
  const qrPhotoUrl = useMemo(
    () => (!view?.qr_payload && view?.qr_image_path ? qrImageUrl(view.qr_image_path) : null),
    [view?.qr_payload, view?.qr_image_path],
  );

  // One roster line — shared by the flat list and every team block. Tapping a
  // member (not yourself) opens the report/block menu; a blocked member's name
  // is masked (Apple 1.2 UGC) — locally by the block store, and account-wide
  // via the server blocks that ride the join view.
  const renderMember = (p: CollectzJoinView['participants'][number]) => {
    const isSelf = !!my && my.id === p.id;
    const blocked = !!blockedMap[blockKey(blockScope, { name: p.name })] || serverBlocked.has(p.id);
    const inner = (
      <>
        <Text style={styles.rowName} numberOfLines={1}>{blocked ? t.collectz.blockedUser : p.name}</Text>
        {!!p.claimed && !blocked && (
          <View style={styles.claimedTag}>
            <Feather name="user-check" size={11} color={C.accent} />
          </View>
        )}
        <View style={styles.rowRight}>
          {p.effective_share != null && (
            <Text style={styles.rowShare}>{fmtMoney(p.effective_share, currency)}</Text>
          )}
          <StatusChip status={p.status} label={statusLabel(p.status)} />
        </View>
      </>
    );
    if (isSelf) return <View key={p.id} style={styles.row}>{inner}</View>;
    return (
      <Pressable
        key={p.id}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
        onPress={() => { lightTap(); setMemberMenu(p); setMemberMenuMode('menu'); }}
        accessibilityRole="button"
        accessibilityLabel={blocked ? t.collectz.blockedUser : p.name}
      >
        {inner}
      </Pressable>
    );
  };

  // ── Moderation actions (Apple 1.2 UGC) ──
  const closeMemberMenu = () => {
    setMemberMenu(null);
    setMemberMenuMode('menu');
  };

  // Preset report reasons — shown localized, SENT as stable tags so moderation
  // reads one vocabulary regardless of the reporter's language.
  const reportReasons: { tag: string; label: string }[] = [
    { tag: 'offensive', label: t.collectz.reportReasonOffensive },
    { tag: 'spam', label: t.collectz.reportReasonSpam },
    { tag: 'harassment', label: t.collectz.reportReasonHarassment },
    { tag: 'other', label: t.collectz.reportReasonOther },
  ];

  // Reports go to the public report-content edge function — this page is
  // reachable signed OUT, and the function flood-caps per reporter server-side.
  const submitReport = async (p: CollectzJoinView['participants'][number], reasonTag: string) => {
    closeMemberMenu();
    const ok = await reportContent({ context: 'collectz-member', targetId: p.id, reason: reasonTag });
    if (ok) { successNotification(); showToast(t.collectz.reportedToast, 'success'); }
    else { errorNotification(); showToast(t.collectz.reportFailedToast, 'error'); }
  };

  const toggleBlock = (p: CollectzJoinView['participants'][number]) => {
    const key = blockKey(blockScope, { name: p.name });
    const store = useCollectzBlockStore.getState();
    const nowBlocked = !store.isBlocked(key);
    if (nowBlocked) {
      mediumTap();
      store.block(key);
      showToast(t.collectz.blockedToast, 'success');
    } else {
      store.unblock(key);
      showToast(t.collectz.unblockedToast, 'success');
    }
    closeMemberMenu();
    // Server-side block too (signed-in only, account-backed entries only —
    // both fail soft and the local mask above already applied). An account
    // block also hides their pools on CollectzHome and masks them here on
    // every session via blocked_participant_ids, so refresh the view.
    if (code) {
      setParticipantBlock(code, p.id, nowBlocked).then((res) => {
        if (res === 'account') load();
      });
    }
  };

  const statusLabel = (status: CollectzParticipantStatus): string => {
    switch (status) {
      case 'confirmed': return t.collectz.statusConfirmed;
      case 'pending': return t.collectz.statusPending;
      case 'rejected': return t.collectz.statusRejected;
      default: return t.collectz.statusUnpaid;
    }
  };

  // ── Actions ──
  const submitCode = () => {
    const next = codeInput.trim().toUpperCase();
    if (!next) return;
    mediumTap();
    setCodeInput('');
    setView(null);
    setLoading(true);
    setFailed(false);
    setCode(next);
  };

  // Teams sessions: a team must be picked BEFORE claiming or adding yourself —
  // the organizer wants balanced teams from the start, not a shuffle later.
  const teamGate = (): boolean => {
    if (!teamsOn || joinTeamIdx != null) return true;
    errorNotification();
    showToast(t.collectz.joinTeamRequired, 'info');
    return false;
  };

  // Confirm before binding — a claimed name locks to your account, so one
  // fat-fingered chip tap shouldn't make you someone else.
  const claim = (p: { id: string; name: string }) => {
    if (!code || busy || !teamGate()) return;
    lightTap();
    Alert.alert(fill(t.collectz.claimConfirmTitle, { name: p.name }), t.collectz.claimConfirmBody, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.collectz.claimConfirmCta, onPress: () => doClaim(p.id, joinTeamIdx ?? undefined) },
    ]);
  };

  const doClaim = async (participantId: string, teamIdx?: number) => {
    if (!code || busy) return;
    setBusy(true);
    try {
      await claimParticipant(code, participantId, teamIdx);
      successNotification();
      await load();
    } catch (err) {
      if (isCollectzAuthError(err)) {
        promptSignIn();
      } else {
        errorNotification();
        // Surface the real reason ("That name was already claimed.") and refresh —
        // losing the claim race must not leave the taken name looking tappable.
        showToast(err instanceof Error && err.message ? err.message : t.collectz.claimError, 'error');
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  const addMyself = async () => {
    const name = selfName.trim();
    if (!code || !name || busy) return;
    // Content filter (Apple 1.2): your name is shown to everyone on the roster.
    if (!isCleanContent(name)) {
      errorNotification();
      showToast(t.collectz.validationContent, 'error');
      return;
    }
    // Teams gate: adding yourself into a TEAMS session needs a team pick —
    // unless the join queues for approval anyway (the team is picked from the
    // join page once the organizer approves).
    if (!session?.join_requires_approval && !teamGate()) return;
    setBusy(true);
    try {
      const { requested } = await addSelf(code, name, joinTeamIdx ?? undefined);
      setSelfName('');
      successNotification();
      // Queued for approval — say so, or the silent roster-less state reads
      // like the join failed.
      if (requested) showToast(t.collectz.requestSentToast, 'success');
      await load();
    } catch (err) {
      if (isCollectzAuthError(err)) {
        promptSignIn();
      } else {
        errorNotification();
        // Surface the server's reason (e.g. "This session is full.") — the cap is a
        // real, explainable outcome, not a generic failure.
        showToast(err instanceof Error && err.message ? err.message : t.collectz.addSelfError, 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  // Move MYSELF into a team (or out with null). The edge function re-checks that
  // the target still has room, so a race with someone else just gets refused.
  const pickTeam = async (idx: number | null) => {
    if (!code || busy || idx === myTeam) return;
    mediumTap();
    setBusy(true);
    try {
      await joinTeam(code, idx);
      successNotification();
      await load();
    } catch (err) {
      if (isCollectzAuthError(err)) {
        promptSignIn();
      } else {
        errorNotification();
        showToast(err instanceof Error && err.message ? err.message : t.collectz.actionError, 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  // Anyone on the roster may rename a team — it's a group label, not a permission.
  const saveTeamName = async () => {
    if (!code || renameTeamIdx == null || busy) return;
    const idx = renameTeamIdx;
    const name = renameDraft.trim().slice(0, 40);
    // Content filter (Apple 1.2): team names are shown to the whole roster.
    if (name && !isCleanContent(name)) {
      errorNotification();
      showToast(t.collectz.validationContent, 'error');
      return;
    }
    setRenameTeamIdx(null);
    setBusy(true);
    try {
      await renameTeam(code, idx, name);
      successNotification();
      await load();
    } catch (err) {
      if (isCollectzAuthError(err)) {
        promptSignIn();
      } else {
        errorNotification();
        showToast(err instanceof Error && err.message ? err.message : t.collectz.actionError, 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const uploadProof = async (file: { uri: string; name: string; mimeType: string }) => {
    if (!sessionId || !my || busy) return;
    setBusy(true);
    try {
      await markPaidWithProof(sessionId, my.id, file);
      successNotification();
      showToast(t.collectz.uploadDone, 'success');
      await load();
    } catch (err) {
      if (isCollectzAuthError(err)) {
        promptSignIn();
      } else {
        errorNotification();
        showToast(t.collectz.uploadError, 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const pickImage = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (res.canceled || !res.assets[0]) return;
    const a = res.assets[0];
    await uploadProof({ uri: a.uri, name: a.fileName ?? 'proof.jpg', mimeType: a.mimeType ?? 'image/jpeg' });
  };

  const pickPdf = async () => {
    lightTap();
    const res = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    await uploadProof({ uri: a.uri, name: a.name ?? 'proof.pdf', mimeType: a.mimeType ?? 'application/pdf' });
  };

  const withdraw = async () => {
    if (!my || busy) return;
    setBusy(true);
    try {
      await withdrawProof(my.id);
      successNotification();
      showToast(t.collectz.withdrawDone, 'success');
      await load();
    } catch {
      errorNotification();
      showToast(t.collectz.withdrawError, 'error');
    } finally {
      setBusy(false);
    }
  };

  // Leave / unclaim — undo a wrong claim or step out while still unpaid. The
  // edge action frees the name (or drops a self-added row). collectzService has
  // no wrapper for it yet, so parse the error body the same way its invokeJoin
  // does (every collectz-join error rides in a non-2xx body).
  const leaveNow = async () => {
    if (!code) return;
    setBusy(true);
    try {
      const { data, error } = await supabasePersonal.functions.invoke('collectz-join', {
        body: { share_code: code, action: 'leave' },
      });
      if (error) {
        let errCode: string | null = null;
        const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
        if (ctx?.json) {
          try {
            const parsed = (await ctx.json()) as { error?: string } | null;
            if (parsed && typeof parsed.error === 'string') errCode = parsed.error;
          } catch {
            // body not JSON — fall through to the generic message
          }
        }
        throw new Error(errCode ? joinErrorMessage(errCode) : error.message || 'Could not reach the server.');
      }
      const payload = data as { error?: string } | null;
      if (payload?.error) throw new Error(joinErrorMessage(payload.error));
      successNotification();
      showToast(t.collectz.leaveDone, 'success');
      await load();
    } catch (err) {
      errorNotification();
      showToast(err instanceof Error && err.message ? err.message : t.collectz.actionError, 'error');
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    if (busy) return;
    lightTap();
    Alert.alert(t.collectz.leaveTitle, t.collectz.leaveBody, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.collectz.leaveCta, style: 'destructive', onPress: leaveNow },
    ]);
  };

  // ── Loading / failure / code-entry states ──
  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color={C.accent} />
        <Text style={styles.loaderText}>{t.collectz.loading}</Text>
      </View>
    );
  }

  if (!code && !paramSessionId) {
    return (
      <View style={styles.screen}>
        <View style={styles.codeEntry}>
          <TextInput
            style={styles.codeInput}
            value={codeInput}
            onChangeText={setCodeInput}
            placeholder={t.collectz.joinCodePlaceholder}
            placeholderTextColor={withAlpha(C.textMuted, 0.55)}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={submitCode}
          />
          <NeuButton label={t.collectz.joinOpen} onPress={submitCode} />
        </View>
      </View>
    );
  }

  if (failed || !view || !session) {
    return (
      <View style={styles.loaderWrap}>
        <Feather name="alert-circle" size={32} color={C.textMuted} />
        <Text style={styles.loaderText}>{failMsg ?? t.collectz.joinOpenError}</Text>
        {!!code && (
          <NeuButton label={t.common.retry} onPress={() => { setLoading(true); load(); }} style={styles.retryBtn} />
        )}
      </View>
    );
  }

  const dateLine = fmtEventRange(session.event_at, session.event_end);
  const payByLine = session.pay_by ? fill(t.collectz.payByLine, { date: fmtDateTime(session.pay_by) ?? '' }) : null;
  // Pay-by urgency chip — bronze nudge next to the deadline for anyone who
  // still owes (or hasn't joined) inside the final week. Calendar-day diff, so
  // "due later today" reads 'due today', never '1d left'.
  const payByChipLabel = (() => {
    if (!session.pay_by || !isOpen) return null;
    // A queued/declined join owes nothing — no deadline nudge until they're in.
    if (my && my.join_status !== 'active') return null;
    if (my && my.status !== 'unpaid' && my.status !== 'rejected') return null;
    const due = new Date(session.pay_by);
    if (isNaN(due.getTime())) return null;
    const now = new Date();
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const days = Math.round((startOfDay(due) - startOfDay(now)) / 86_400_000);
    if (days > 7) return null;
    return days >= 1 ? fill(t.collectz.joinPayByDaysLeft, { days }) : t.collectz.joinPayByDueToday;
  })();
  const progress = view.progress;
  const pct =
    progress.target_amount && progress.target_amount > 0
      ? Math.min(progress.confirmed_amount / progress.target_amount, 1)
      : progress.active_count > 0
        ? progress.confirmed_count / progress.active_count
        : 0;

  return (
    <View style={styles.screen}>
      <PullRefresh refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent}>
      <PageScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
      {/* Event header */}
      <View style={[styles.headerCard, neu.raisedSoft]}>
        {/* Category tint — inner absolute-fill layer (the neu shadow lives on
            the card, so no overflow clip here; corners rounded to match).
            Flat fill, no gradient. */}
        <View
          style={[StyleSheet.absoluteFillObject, { borderRadius: RADIUS.lg, backgroundColor: withAlpha(catColor, isDark ? 0.12 : 0.07) }]}
          pointerEvents="none"
        />
        <View style={styles.titleRow}>
          {(() => {
            const preset = presetClubIcon(session.image_path);
            const uri = !preset && session.image_path ? clubImageUrl(session.image_path) : null;
            // An organizer-chosen icon color (preset:<id>:<hex>) wins over the
            // category tint; uploaded club photos show full-bleed either way.
            const tint = presetClubColor(session.image_path) ?? catColor;
            return (
              <View style={[styles.clubWell, { backgroundColor: withAlpha(tint, 0.12) }]}>
                {uri ? (
                  <Image source={{ uri }} style={styles.clubImagePhoto} resizeMode="cover" />
                ) : (
                  <MaterialCommunityIcons
                    name={(preset ? preset.icon : collectzCategoryIcon(session.category)) as any}
                    size={26}
                    color={tint}
                  />
                )}
              </View>
            );
          })()}
          <Text style={[styles.title, { flex: 1 }]}>{session.title}</Text>
        </View>
        {!!dateLine && (
          <View style={styles.metaRow}>
            <Feather name="calendar" size={13} color={C.textMuted} />
            <Text style={styles.meta}>{dateLine}</Text>
          </View>
        )}
        {!!session.venue && (
          <View style={styles.metaRow}>
            <Feather name="map-pin" size={13} color={C.textMuted} />
            <Text style={styles.meta}>{session.venue}</Text>
          </View>
        )}
        {/* Player requirements (skill / age / gender / booking) — only the
            ones the organizer set, as quiet chips under the meta rows. */}
        {requirementChips(t, session).length > 0 && (
          <View style={styles.reqRow}>
            {requirementChips(t, session).map((chip) => (
              <View key={chip.label} style={styles.reqChip}>
                <Feather name={chip.icon as keyof typeof Feather.glyphMap} size={11} color={C.textSecondary} />
                <Text style={styles.reqChipText}>{chip.label}</Text>
              </View>
            ))}
          </View>
        )}
        {!!session.maps_url && <MapPreviewCard mapsUrl={session.maps_url} venue={session.venue} />}
        {/* Organizer contact (optional): WhatsApp group + socials. Only https
            values render — server data never reaches openURL unchecked. */}
        {!!(session.group_url || (session.socials && Object.keys(session.socials).length)) && (
          <View style={styles.contactChips}>
            {!!session.group_url && /^https:\/\/chat\.whatsapp\.com\//i.test(session.group_url) && (
              <Pressable
                style={({ pressed }) => [styles.waChip, pressed && { opacity: 0.85 }]}
                onPress={() => { lightTap(); Linking.openURL(session.group_url!).catch(() => {}); }}
                accessibilityRole="link"
              >
                <Feather name="message-circle" size={14} color="#FFFFFF" />
                <Text style={styles.waChipText}>{t.collectz.joinGroupChip}</Text>
              </Pressable>
            )}
            {SOCIAL_PLATFORMS.map((p) => {
              const url = session.socials?.[p.key];
              if (!url || !/^https?:\/\//i.test(url)) return null;
              return (
                <Pressable
                  key={p.key}
                  style={({ pressed }) => [styles.socialChip, neu.raised, pressed && { opacity: 0.85 }]}
                  onPress={() => { lightTap(); Linking.openURL(url).catch(() => {}); }}
                  accessibilityRole="link"
                >
                  <Feather name={p.icon as keyof typeof Feather.glyphMap} size={13} color={C.textSecondary} />
                  <Text style={styles.socialChipText}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        {!!payByLine && (
          <View style={styles.metaRow}>
            <Feather name="clock" size={13} color={C.bronze} />
            <Text style={[styles.meta, { color: C.bronze }]}>{payByLine}</Text>
            {!!payByChipLabel && (
              <View style={styles.payByChip}>
                <Text style={styles.payByChipText}>{payByChipLabel}</Text>
              </View>
            )}
          </View>
        )}
        {!isOpen && (
          <View style={styles.closedBanner}>
            <Text style={styles.closedBannerText}>
              {session.status === 'settled' ? t.collectz.settledBanner : t.collectz.cancelledBanner}
            </Text>
          </View>
        )}
      </View>

      {/* Progress */}
      <View style={[styles.progressCard, neu.raisedSoft]}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: catColor }]} />
        </View>
        <Text style={styles.progressText}>
          {progress.target_amount != null
            ? `${fill(t.collectz.progressOfTarget, {
                confirmed: fmtMoney(progress.confirmed_amount, currency),
                target: fmtMoney(progress.target_amount, currency),
              })} · ${fill(t.collectz.confirmedCount, { n: progress.confirmed_count, m: progress.active_count })}`
            : fill(t.collectz.confirmedCount, { n: progress.confirmed_count, m: progress.active_count })}
        </Text>
      </View>

      {/* Details / rules */}
      {!!session.details_text && (
        <View style={[styles.textCard, neu.raisedSoft]}>
          <Text style={styles.textCardTitle}>{t.collectz.eventDetails}</Text>
          <Text style={styles.textCardBody}>{session.details_text}</Text>
        </View>
      )}
      {/* Court / venue cost — informational. Skipped for 'equal', where the total
          is the split base already surfaced in the progress bar. */}
      {session.total_amount != null && session.scheme !== 'equal' && (
        <View style={[styles.textCard, neu.raisedSoft]}>
          <Text style={styles.textCardTitle}>{t.collectz.totalCostLabel}</Text>
          <Text style={styles.textCardBody}>{fmtMoney(session.total_amount, currency)}</Text>
        </View>
      )}
      {!!session.rules_text && (
        <View style={[styles.textCard, neu.raisedSoft]}>
          <Text style={styles.textCardTitle}>{t.collectz.rulesSection}</Text>
          <Text style={styles.textCardBody}>{session.rules_text}</Text>
        </View>
      )}

      {/* ── My area: claim / pay / status ── */}
      {!my && isOpen && (
        <View style={[styles.myCard, neu.raisedSoft]}>
          <Text style={styles.myTitle}>{t.collectz.claimTitle}</Text>
          {claimable.length > 0 ? (
            <>
              <Text style={styles.myHint}>{t.collectz.claimHint}</Text>
              <View style={styles.claimGrid}>
                {claimable.map((p) => (
                  <Pressable
                    key={p.id}
                    style={({ pressed }) => [styles.claimChip, neu.raised, pressed && { opacity: 0.85 }]}
                    onPress={() => claim(p)}
                    disabled={busy}
                  >
                    <Text style={styles.claimChipText}>{p.name}</Text>
                    {p.slot === 'reserve' && <Text style={styles.claimChipSub}>{t.collectz.rosterReserve}</Text>}
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <Text style={styles.myHint}>{t.collectz.allClaimed}</Text>
          )}
          {/* Teams sessions: pick your team up front — required before claiming
              a name or adding yourself (full teams are disabled). */}
          {teamsOn && (
            <>
              <Text style={[styles.myHint, styles.joinTeamLabel]}>{t.collectz.joinPickTeam}</Text>
              <View style={styles.claimGrid}>
                {teamGroups.map((g) => {
                  const full = teamSize != null && g.members.length >= teamSize;
                  const active = joinTeamIdx === g.idx;
                  return (
                    <Pressable
                      key={g.idx}
                      style={({ pressed }) => [
                        styles.claimChip,
                        neu.raised,
                        active && styles.claimTeamChipActive,
                        full && { opacity: 0.4 },
                        pressed && { opacity: 0.85 },
                      ]}
                      onPress={() => { if (!full) { selectionChanged(); setJoinTeamIdx(active ? null : g.idx); } }}
                      disabled={busy || full}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active, disabled: full }}
                    >
                      <Text style={[styles.claimChipText, active && styles.claimTeamChipTextActive]}>
                        {teamLabel(teamNames, g.idx, fill(t.collectz.teamN, { n: g.idx }))}
                      </Text>
                      {teamSize != null && (
                        <Text style={[styles.claimChipSub, active && styles.claimTeamChipTextActive]}>
                          {g.members.length}/{teamSize}
                        </Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}
          {maxParticipants != null && (
            <View style={styles.capacityWrap}>
              <Text style={styles.myHint}>
                {fill(t.collectz.capacityCount, { n: activeCount, max: maxParticipants })}
              </Text>
              <View style={styles.capacityTrack}>
                <View
                  style={[
                    styles.capacityFill,
                    {
                      width: `${Math.min(activeCount / Math.max(maxParticipants, 1), 1) * 100}%`,
                      backgroundColor: catColor,
                    },
                  ]}
                />
              </View>
            </View>
          )}
          {isFull ? (
            <Text style={styles.fullHint}>{t.collectz.sessionFull}</Text>
          ) : (
            <View style={styles.addSelfRow}>
              <TextInput
                style={styles.addSelfInput}
                value={selfName}
                onChangeText={setSelfName}
                placeholder={t.collectz.addSelfPlaceholder}
                placeholderTextColor={withAlpha(C.textMuted, 0.55)}
                returnKeyType="done"
                onSubmitEditing={addMyself}
              />
              <NeuButton
                label={t.collectz.addSelf}
                onPress={addMyself}
                disabled={busy}
                style={styles.addSelfBtn}
              />
            </View>
          )}
          {/* Approval-gated: self-adds queue for the organizer, so say it up
              front instead of letting the silent queue surprise people. */}
          {!isFull && !!session?.join_requires_approval && (
            <Text style={styles.myHint}>{t.collectz.joinApprovalNote}</Text>
          )}
        </View>
      )}

      {my && (
        <View style={[styles.myCard, neu.raisedSoft]}>
          <View style={styles.joinedRow}>
            <Feather name="user-check" size={14} color={C.accent} />
            <Text style={styles.joinedText}>{fill(t.collectz.joinedAs, { name: my.name })}</Text>
            {my.join_status === 'requested' ? (
              <StatusChip status="pending" label={t.collectz.statusRequested} />
            ) : my.join_status === 'rejected' ? (
              <StatusChip status="rejected" label={statusLabel('rejected')} />
            ) : (
              <StatusChip status={my.status} label={statusLabel(my.status)} />
            )}
          </View>

          {my.join_status === 'requested' ? (
            // Self-add on an approval-gated session — queued until the
            // organizer approves (realtime refetch flips this automatically).
            <View style={styles.stateBox}>
              <ActivityIndicator size="small" color={C.gold} />
              <Text style={styles.stateTitle}>{t.collectz.requestedTitle}</Text>
              <Text style={styles.myHint}>{t.collectz.requestedBody}</Text>
            </View>
          ) : my.join_status === 'rejected' ? (
            // Declined — the row is kept precisely so the requester sees this.
            <View style={styles.stateBox}>
              <Feather name="x-circle" size={28} color={C.overdue} />
              <Text style={styles.stateTitle}>{t.collectz.joinRequestDeclinedTitle}</Text>
              <Text style={styles.myHint}>{t.collectz.joinRequestDeclinedBody}</Text>
            </View>
          ) : my.slot === 'reserve' ? (
            <Text style={styles.myHint}>{t.collectz.reserveNote}</Text>
          ) : (
            <>
              {(my.status === 'unpaid' || my.status === 'rejected') && isOpen && (
                <View style={styles.payFlow}>
                  {my.status === 'rejected' && (
                    <Text style={styles.rejectedNote}>
                      {myRejectNote ? fill(t.collectz.rejectedNote, { note: myRejectNote }) : t.collectz.rejectedPlain}
                    </Text>
                  )}

                  {/* Pay steps — static Unpaid → Pending → Confirmed indicator.
                      The current step takes its status colour; non-current dots
                      and labels stay pillBg/muted. */}
                  <View style={styles.stepRow}>
                    {(['unpaid', 'pending', 'confirmed'] as const).map((step, i, arr) => {
                      const isCurrent = step === myPayStep;
                      return (
                        <View key={step} style={styles.stepItem}>
                          <View style={styles.stepDotRow}>
                            <View style={[styles.stepHalfLine, i === 0 && styles.stepHalfLineHidden]} />
                            <View style={[styles.stepDot, { backgroundColor: isCurrent ? myStepColor : C.pillBg }]} />
                            <View style={[styles.stepHalfLine, i === arr.length - 1 && styles.stepHalfLineHidden]} />
                          </View>
                          <Text
                            style={[
                              styles.stepLabel,
                              isCurrent && { color: myStepColor, fontWeight: TYPOGRAPHY.weight.semibold },
                            ]}
                          >
                            {statusLabel(step)}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  <Text style={styles.shareLabel}>{t.collectz.yourShare}</Text>
                  <Text style={styles.shareAmount}>
                    {myShare != null ? fmtMoney(myShare, currency) : t.collectz.shareUnknown}
                  </Text>

                  {qrValue ? (
                    <>
                      <View style={[styles.qrCard, { width: qrSize + SPACING.xl, height: qrSize + SPACING.xl }]}>
                        <QRCode value={qrValue} size={qrSize} color="#111111" backgroundColor="#FFFFFF" ecl="M" />
                      </View>
                      <Text style={styles.qrNote}>{t.collectz.qrAutoFillNote}</Text>
                    </>
                  ) : qrPhotoUrl ? (
                    // Photo-only QR: show the organizer's picture. No amount can be
                    // embedded in an image, so the payer types it in their bank app.
                    <>
                      <View style={[styles.qrCard, { width: qrSize + SPACING.xl, height: qrSize + SPACING.xl }]}>
                        <Image
                          source={{ uri: qrPhotoUrl }}
                          style={{ width: qrSize, height: qrSize }}
                          resizeMode="contain"
                        />
                      </View>
                      <Text style={styles.qrNote}>{t.collectz.qrPhotoNote}</Text>
                    </>
                  ) : (
                    <Text style={styles.myHint}>{t.collectz.noQrNote}</Text>
                  )}

                  <Text style={styles.uploadTitle}>{t.collectz.uploadTitle}</Text>
                  {busy ? (
                    <View style={styles.uploadingRow}>
                      <ActivityIndicator size="small" color={C.accent} />
                      <Text style={styles.myHint}>{t.collectz.uploading}</Text>
                    </View>
                  ) : (
                    <View style={styles.uploadRow}>
                      <Pressable style={({ pressed }) => [styles.secondaryBtn, styles.uploadBtn, pressed && { opacity: 0.85 }]} onPress={pickImage}>
                        <Feather name="image" size={15} color={C.accent} />
                        <Text style={styles.secondaryBtnText}>{t.collectz.uploadImage}</Text>
                      </Pressable>
                      <Pressable style={({ pressed }) => [styles.secondaryBtn, styles.uploadBtn, pressed && { opacity: 0.85 }]} onPress={pickPdf}>
                        <Feather name="file-text" size={15} color={C.accent} />
                        <Text style={styles.secondaryBtnText}>{t.collectz.uploadPdf}</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              )}

              {my.status === 'pending' && (
                <View style={styles.stateBox}>
                  {isOpen ? (
                    <>
                      <ActivityIndicator size="small" color={C.gold} />
                      <Text style={styles.stateTitle}>{t.collectz.pendingTitle}</Text>
                      <Text style={styles.myHint}>{t.collectz.pendingBody}</Text>
                      <Pressable style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.85 }]} onPress={withdraw} disabled={busy}>
                        <Text style={styles.secondaryBtnText}>{t.collectz.withdraw}</Text>
                      </Pressable>
                    </>
                  ) : (
                    // Session settled/cancelled with the proof still unreviewed —
                    // a spinner promising a review would wait forever. Say so.
                    <>
                      <Feather name="help-circle" size={28} color={C.gold} />
                      <Text style={styles.stateTitle}>{t.collectz.pendingClosedTitle}</Text>
                      <Text style={styles.myHint}>{t.collectz.pendingClosedBody}</Text>
                    </>
                  )}
                </View>
              )}

              {my.status === 'confirmed' && (
                <View style={styles.stateBox}>
                  <Feather name="check-circle" size={28} color={C.accent} />
                  <Text style={styles.stateTitle}>{t.collectz.confirmedTitle}</Text>
                  <Text style={styles.myHint}>{t.collectz.confirmedBody}</Text>
                </View>
              )}

              {(my.status === 'unpaid' || my.status === 'rejected') && !isOpen && (
                <Text style={styles.myHint}>{t.collectz.sessionClosed}</Text>
              )}
            </>
          )}

          {/* Wrong name, or plans changed? Only while unpaid — money that
              already moved is the organizer's to sort out. */}
          {LEAVE_ENABLED && isOpen && my.status === 'unpaid' && (
            <Pressable
              style={({ pressed }) => [styles.leaveBtn, pressed && { opacity: 0.7 }]}
              onPress={leave}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t.collectz.leaveBtn}
            >
              <Feather name="log-out" size={13} color={C.textMuted} />
              <Text style={styles.leaveBtnText}>{t.collectz.leaveBtn}</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Roster */}
      <Text style={styles.sectionTitle}>{t.collectz.roster}</Text>
      {teamsOn ? (
        <>
          {teamGroups.map((g) => {
            const full = teamSize != null && g.members.length >= teamSize;
            const here = myTeam === g.idx;
            return (
              <View key={g.idx} style={styles.teamBlock}>
                <View style={styles.teamHeader}>
                  <Text style={styles.teamHeaderName} numberOfLines={1}>
                    {teamLabel(teamNames, g.idx, fill(t.collectz.teamN, { n: g.idx }))}
                  </Text>
                  <Text style={styles.teamHeaderCount}>
                    {teamSize != null ? `${g.members.length}/${teamSize}` : String(g.members.length)}
                  </Text>
                  {/* Any roster member may rename the team — it's just a label.
                      (A queued join request isn't a member yet.) */}
                  {!!my && my.join_status === 'active' && (
                    <Pressable
                      onPress={() => { lightTap(); setRenameDraft(teamNames?.[g.idx - 1] ?? ''); setRenameTeamIdx(g.idx); }}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t.collectz.teamRename}
                    >
                      <Feather name="edit-2" size={13} color={C.textMuted} />
                    </Pressable>
                  )}
                  {/* Move myself — only into a team that still has room, and only
                      if I'm actually playing (reserves hold no team slot, and a
                      queued join request isn't on the roster yet). */}
                  {!!my && my.join_status === 'active' && my.slot === 'active' && isOpen && !here && (
                    <Pressable
                      disabled={full || busy}
                      style={[styles.teamJoinChip, neu.raised, (full || busy) && { opacity: 0.4 }]}
                      onPress={() => pickTeam(g.idx)}
                      accessibilityRole="button"
                    >
                      <Text style={styles.teamJoinChipText}>
                        {full ? t.collectz.teamFullShort : t.collectz.teamJoinCta}
                      </Text>
                    </Pressable>
                  )}
                  {here && (
                    <View style={styles.teamMineChip}>
                      <Text style={styles.teamMineChipText}>{t.collectz.teamMine}</Text>
                    </View>
                  )}
                </View>
                <View style={[styles.listCard, neu.raisedSoft]}>
                  <View style={styles.listClip}>
                    {g.members.length === 0 ? (
                      <Text style={styles.teamEmpty}>{t.collectz.teamEmpty}</Text>
                    ) : (
                      g.members.map(renderMember)
                    )}
                  </View>
                </View>
              </View>
            );
          })}
          {unassigned.length > 0 && (
            <View style={styles.teamBlock}>
              <View style={styles.teamHeader}>
                <Text style={styles.teamHeaderName}>{t.collectz.teamNoneLabel}</Text>
                <Text style={styles.teamHeaderCount}>{String(unassigned.length)}</Text>
                {!!my && my.join_status === 'active' && my.slot === 'active' && isOpen && myTeam != null && (
                  <Pressable
                    disabled={busy}
                    style={[styles.teamJoinChip, neu.raised, busy && { opacity: 0.4 }]}
                    onPress={() => pickTeam(null)}
                    accessibilityRole="button"
                  >
                    <Text style={styles.teamJoinChipText}>{t.collectz.teamLeaveCta}</Text>
                  </Pressable>
                )}
              </View>
              <View style={[styles.listCard, neu.raisedSoft]}>
                <View style={styles.listClip}>{unassigned.map(renderMember)}</View>
              </View>
            </View>
          )}
        </>
      ) : (
        <View style={[styles.listCard, neu.raisedSoft]}>
          <View style={styles.listClip}>{actives.map(renderMember)}</View>
        </View>
      )}

      {reserves.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, styles.sectionGap]}>{t.collectz.waitingList}</Text>
          <View style={[styles.listCard, neu.raisedSoft]}>
            <View style={styles.listClip}>
            {reserves.map((p) => (
              <View key={p.id} style={styles.row}>
                <Text style={styles.rowName} numberOfLines={1}>{p.name}</Text>
                {!!p.claimed && (
                  <View style={styles.claimedTag}>
                    <Feather name="user-check" size={11} color={C.accent} />
                  </View>
                )}
              </View>
            ))}
            </View>
          </View>
        </>
      )}
      </PageScrollView>
      </PullRefresh>

      {/* Team rename — any roster member can retitle a team ("Reds", not "Team 1"). */}
      <FloatingModal visible={renameTeamIdx != null} onClose={() => setRenameTeamIdx(null)} entrance="fade" borderless>
        <View style={styles.renameWrap}>
          <Text style={styles.renameTitle}>{t.collectz.teamRename}</Text>
          <TextInput
            style={[styles.renameInput, newstOutline(C, renameFocused)]}
            value={renameDraft}
            onChangeText={setRenameDraft}
            onFocus={() => setRenameFocused(true)}
            onBlur={() => setRenameFocused(false)}
            placeholder={renameTeamIdx != null ? fill(t.collectz.teamN, { n: renameTeamIdx }) : ''}
            placeholderTextColor={withAlpha(C.textMuted, 0.55)}
            maxLength={40}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={saveTeamName}
          />
          <NeuButton icon="check" label={t.common.save} onPress={saveTeamName} disabled={busy} />
        </View>
      </FloatingModal>

      {/* Member report/block menu (Apple 1.2 UGC) */}
      <FloatingModal visible={!!memberMenu} onClose={closeMemberMenu} entrance="fade" borderless>
        {memberMenu && (() => {
          const m = memberMenu;
          if (!m) return null;
          const blocked = !!blockedMap[blockKey(blockScope, { name: m.name })] || serverBlocked.has(m.id);
          if (memberMenuMode === 'report') {
            // Reason picker — one tap files the report (RN Alert caps Android
            // at 3 buttons, so the preset reasons get their own sheet mode).
            return (
              <View style={styles.memberMenuWrap}>
                <Text style={styles.memberMenuTitle} numberOfLines={1}>{t.collectz.reportTitle}</Text>
                {reportReasons.map((r) => (
                  <Pressable
                    key={r.tag}
                    style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.7 }]}
                    onPress={() => submitReport(m, r.tag)}
                    accessibilityRole="button"
                    accessibilityLabel={r.label}
                  >
                    <Feather name="flag" size={18} color={C.gold} />
                    <Text style={styles.menuRowText}>{r.label}</Text>
                  </Pressable>
                ))}
              </View>
            );
          }
          return (
            <View style={styles.memberMenuWrap}>
              <Text style={styles.memberMenuTitle} numberOfLines={1}>
                {blocked ? t.collectz.blockedUser : m.name}
              </Text>
              <Pressable
                style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.7 }]}
                onPress={() => setMemberMenuMode('report')}
                accessibilityRole="button"
                accessibilityLabel={t.collectz.report}
              >
                <Feather name="flag" size={18} color={C.gold} />
                <Text style={styles.menuRowText}>{t.collectz.report}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.menuRow, pressed && { opacity: 0.7 }]}
                onPress={() => toggleBlock(m)}
                accessibilityRole="button"
                accessibilityLabel={blocked ? t.collectz.unblock : t.collectz.block}
              >
                <Feather name={blocked ? 'user-check' : 'slash'} size={18} color={blocked ? C.textSecondary : C.overdue} />
                <Text style={[styles.menuRowText, !blocked && { color: C.overdue }]}>
                  {blocked ? t.collectz.unblock : t.collectz.block}
                </Text>
              </Pressable>
            </View>
          );
        })()}
      </FloatingModal>
      {/* Screen-level "Done" bar for the add-your-name input (Debt does the same). */}
    </View>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.background },
    scroll: { flex: 1 },
    content: { padding: SPACING.xl, paddingBottom: SPACING['5xl'] },
    loaderWrap: {
      flex: 1,
      backgroundColor: C.background,
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.md,
      padding: SPACING.xl,
    },
    loaderText: { fontSize: TYPOGRAPHY.size.sm, color: C.textMuted, textAlign: 'center' },
    codeEntry: { padding: SPACING.xl, gap: SPACING.sm },
    codeInput: {
      minHeight: 48,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: C.inputBorder,
      backgroundColor: C.background,
      paddingHorizontal: SPACING.md,
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
      letterSpacing: 1,
    },
    headerCard: {
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      gap: 6,
      marginBottom: SPACING.md,
    },
    title: { fontSize: TYPOGRAPHY.size.xl, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    clubWell: {
      width: 52,
      height: 52,
      borderRadius: RADIUS.lg,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    clubImagePhoto: { width: 52, height: 52 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    reqRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginTop: 2 },
    reqChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: RADIUS.full,
      backgroundColor: withAlpha(C.textPrimary, 0.05),
      paddingHorizontal: SPACING.sm,
      paddingVertical: 4,
    },
    reqChipText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.medium, color: C.textSecondary },
    meta: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary },
    // pay-by urgency — flat bronze alpha tint (no red per CALM)
    payByChip: {
      borderRadius: RADIUS.full,
      backgroundColor: withAlpha(C.bronze, 0.14),
      paddingHorizontal: SPACING.sm,
      paddingVertical: 2,
    },
    payByChipText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.semibold, color: C.bronze },
    // organizer contact chips — WhatsApp green stays FLAT per the Onyx exemptions
    contactChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: 2 },
    waChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#25D366', borderRadius: RADIUS.full, paddingVertical: 8, paddingHorizontal: 14 },
    waChipText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: '#FFFFFF' },
    socialChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: withAlpha(C.textPrimary, 0.03), borderRadius: RADIUS.full, paddingVertical: 8, paddingHorizontal: 14 },
    socialChipText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.medium, color: C.textSecondary },
    // Closed-session banner — neutral, informational.
    closedBanner: {
      marginTop: 4,
      borderRadius: RADIUS.md,
      backgroundColor: withAlpha(C.neutral, 0.25),
      paddingVertical: 6,
      alignItems: 'center',
    },
    closedBannerText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textSecondary },
    progressCard: {
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      gap: SPACING.sm,
      marginBottom: SPACING.md,
    },
    progressTrack: { height: 8, borderRadius: RADIUS.full, backgroundColor: C.pillBg, overflow: 'hidden' },
    progressFill: { height: 8, borderRadius: RADIUS.full, backgroundColor: C.accent },
    progressText: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary },
    textCard: {
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      gap: 4,
      marginBottom: SPACING.md,
    },
    textCardTitle: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary },
    textCardBody: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary, lineHeight: 20 },
    myCard: {
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      gap: SPACING.sm,
      marginBottom: SPACING.lg,
      alignItems: 'center',
    },
    myTitle: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary, alignSelf: 'flex-start' },
    myHint: { fontSize: TYPOGRAPHY.size.sm, color: C.textMuted, lineHeight: 19, alignSelf: 'flex-start' },
    claimGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, alignSelf: 'stretch' },
    claimChip: {
      borderRadius: RADIUS.full,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
      alignItems: 'center',
    },
    claimChipText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary },
    claimChipSub: { fontSize: 10, color: C.bronze },
    joinTeamLabel: { marginTop: SPACING.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary },
    claimTeamChipActive: { backgroundColor: C.accent },
    claimTeamChipTextActive: { color: C.onAccent },
    fullHint: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.bronze,
      fontWeight: TYPOGRAPHY.weight.semibold,
      marginTop: SPACING.xs,
    },
    // capacity meter — same track/fill idiom as progressTrack, thinner
    capacityWrap: { alignSelf: 'stretch', gap: 6 },
    capacityTrack: { height: 6, borderRadius: RADIUS.full, backgroundColor: C.pillBg, overflow: 'hidden' },
    capacityFill: { height: 6, borderRadius: RADIUS.full },
    addSelfRow: { flexDirection: 'row', gap: SPACING.sm, alignSelf: 'stretch', marginTop: SPACING.xs },
    addSelfInput: {
      flex: 1,
      minHeight: 44,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: C.inputBorder,
      backgroundColor: C.background,
      paddingHorizontal: SPACING.md,
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
    },
    addSelfBtn: {
      width: 'auto',
      minHeight: 44,
      paddingVertical: 0,
      paddingHorizontal: SPACING.md,
      borderRadius: RADIUS.lg,
    },
    joinedRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, alignSelf: 'stretch' },
    joinedText: { flex: 1, fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary },
    leaveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: SPACING.xs },
    leaveBtnText: { fontSize: TYPOGRAPHY.size.sm, color: C.textMuted, fontWeight: TYPOGRAPHY.weight.medium },
    rejectedNote: { fontSize: TYPOGRAPHY.size.sm, color: C.overdue, lineHeight: 19, alignSelf: 'stretch' },
    // unified payment column: steps → share → QR → upload
    payFlow: { alignSelf: 'stretch', alignItems: 'center', gap: SPACING.sm },
    stepRow: { flexDirection: 'row', alignSelf: 'stretch', marginTop: SPACING.xs },
    stepItem: { flex: 1, alignItems: 'center', gap: 6 },
    stepDotRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
    stepHalfLine: { flex: 1, height: 1, backgroundColor: withAlpha(C.textMuted, 0.3) },
    stepHalfLineHidden: { backgroundColor: 'transparent' },
    stepDot: { width: 10, height: 10, borderRadius: RADIUS.full },
    stepLabel: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, textAlign: 'center' },
    shareLabel: { fontSize: TYPOGRAPHY.size.sm, color: C.textMuted, marginTop: SPACING.xs },
    // money stays neutral (CALM) — no category colour on the amount
    shareAmount: { fontSize: TYPOGRAPHY.size['3xl'], lineHeight: 36, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary, textAlign: 'center' },
    qrCard: {
      backgroundColor: '#FFFFFF',
      borderRadius: RADIUS.lg,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: SPACING.sm,
      borderWidth: 1,
      borderColor: 'rgba(0,0,0,0.06)',
    },
    qrNote: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, textAlign: 'center' },
    uploadTitle: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary, marginTop: SPACING.sm },
    uploadRow: { flexDirection: 'row', gap: SPACING.sm, alignSelf: 'stretch' },
    uploadBtn: { flex: 1, width: 'auto', flexDirection: 'row', gap: 6 },
    uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, minHeight: 50 },
    retryBtn: { width: 'auto', paddingHorizontal: SPACING.xl },
    secondaryBtn: {
      minHeight: 48,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryBtnText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.accent },
    stateBox: { alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm },
    stateTitle: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary, textAlign: 'center' },
    sectionTitle: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary, marginBottom: SPACING.sm },
    sectionGap: { marginTop: SPACING.lg },
    teamBlock: { marginBottom: SPACING.md },
    teamHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.xs,
      paddingBottom: SPACING.xs,
    },
    teamHeaderName: { flex: 1, fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary },
    teamHeaderCount: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, fontWeight: TYPOGRAPHY.weight.semibold },
    teamEmpty: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, padding: SPACING.md },
    teamJoinChip: {
      borderRadius: RADIUS.full,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 5,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
    },
    teamJoinChipText: { fontSize: TYPOGRAPHY.size.xs, color: C.accent, fontWeight: TYPOGRAPHY.weight.bold },
    teamMineChip: {
      borderRadius: RADIUS.full,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 5,
      backgroundColor: withAlpha(C.accent, 0.18),
    },
    teamMineChipText: { fontSize: TYPOGRAPHY.size.xs, color: C.accent, fontWeight: TYPOGRAPHY.weight.bold },
    renameWrap: { gap: SPACING.md, padding: SPACING.xl },
    renameTitle: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary, textAlign: 'center' },
    memberMenuWrap: { padding: SPACING.lg, gap: SPACING.xs },
    memberMenuTitle: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary, textAlign: 'center', marginBottom: SPACING.sm },
    menuRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: SPACING.md, paddingHorizontal: SPACING.sm },
    menuRowText: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.medium, color: C.textPrimary },
    // Layout + type only — the ONE input border comes from newstOutline in the JSX.
    renameInput: {
      minHeight: 46,
      paddingHorizontal: SPACING.md,
      color: C.textPrimary,
      fontSize: TYPOGRAPHY.size.sm,
    },
    listCard: {
      borderRadius: RADIUS.lg,
      // Onyx seam fix: neu.raisedSoft (spread at the call site) lives on THIS
      // unclipped card. overflow:'hidden' on the shadowed view cuts the boxShadow
      // into a hard vertical seam — the row divider clip moves to listClip below.
      // (Same pattern as TransactionItem's rowShadow + MapPreviewCard's clip.)
    },
    listClip: {
      borderRadius: RADIUS.lg,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: withAlpha(C.border, 0.4),
      gap: SPACING.sm,
    },
    rowName: { flex: 1, fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary },
    claimedTag: {
      borderRadius: RADIUS.full,
      backgroundColor: withAlpha(C.accent, 0.12),
      padding: 4,
    },
    rowRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    rowShare: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted },
  });

export default CollectzJoin;
