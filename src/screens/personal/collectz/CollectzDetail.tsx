// CollectzDetail — organizer console for one session. Live roster via
// realtime (subscribeToSession), progress rollup, share/remind/settle actions,
// and the proof-review flow (view → confirm / reject with a note).
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Share,
} from 'react-native';
// Scrollers come from gesture-handler (DebtTracking recipe) — RNGH's ScrollView
// arbitrates with the app's GestureHandlerRootView so drags aren't lost. Debt
// uses it for its page scroller AND inside its modals, so both do here too.
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../../constants';
import { useCalm } from '../../../hooks/useCalm';
import { useT } from '../../../i18n';
import { useToast } from '../../../context/ToastContext';
import BottomSheet from '../../../components/common/BottomSheet';
import PageScrollView from '../../../components/common/PageScrollView';
import FloatingModal from '../../../components/common/FloatingModal';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import NeuButton from '../../../components/common/NeuButton';
import KeyboardDoneFab from '../../../components/common/KeyboardDoneFab';
import { useNeu } from '../../../components/common/neu';
import { useKeyboardVisible } from '../../../hooks/useKeyboardVisible';
import { lightTap, mediumTap, successNotification, errorNotification } from '../../../services/haptics';
import {
  CollectzSession,
  CollectzParticipant,
  CollectzParticipantStatus,
  getSessionWithRoster,
  updateSession,
  updateParticipant,
  removeParticipant,
  confirmParticipant,
  rejectParticipant,
  resetParticipantToUnpaid,
  remindUnpaid,
  proofSignedUrl,
  subscribeToSession,
  computeShares,
  computeProgress,
  buildWhatsappAnnouncement,
  collectzUrl,
  fetchRosterProfiles,
  deleteSession,
  cancelSession,
  regenerateShareCode,
  duplicateSession,
  clubImageUrl,
  buildRequestMessage,
  type CollectzProfile,
} from '../../../services/collectzService';
import { supabasePersonal } from '../../../services/supabase';
import { AvatarView } from '../../../components/common/Avatar';
import MapPreviewCard from '../../../components/collectz/MapPreviewCard';
import CostNotesSheet from '../../../components/collectz/CostNotesSheet';
import { presetClubIcon } from '../../../constants/clubIcons';
import { fmtDateTime, fmtMoney, fill, teamLabel } from './collectzFormat';

/** Payload for the shared ConfirmDialog. `summary` adds the settle breakdown. */
interface ConfirmState {
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
  summary?: boolean;
  onConfirm: () => void;
}

const CollectzDetail: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  // faintDark: the "soft neu dark" tier — cards + pills match Goals/Bills/Debt.
  const neu = useNeu(undefined, { faintDark: true });
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { showToast } = useToast();
  const sessionId: string = route.params?.sessionId;

  const [session, setSession] = useState<CollectzSession | null>(null);
  const [participants, setParticipants] = useState<CollectzParticipant[]>([]);
  // Avatars of claimed participants (user_id → profile); name-only → initials.
  const [profiles, setProfiles] = useState<Record<string, CollectzProfile>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Proof review sheet
  const [proofFor, setProofFor] = useState<CollectzParticipant | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofLoading, setProofLoading] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  // Request-payment sheet (per roster member — DebtTracking's request flow)
  const [reqFor, setReqFor] = useState<CollectzParticipant | null>(null);
  const [reqMsg, setReqMsg] = useState('');
  const [reqCopied, setReqCopied] = useState(false);
  // Share-code row inline feedback: which variant landed on the clipboard (null = idle)
  const [codeCopied, setCodeCopied] = useState<null | 'code' | 'link'>(null);
  // Participant action modal (tap a roster row)
  const [actionFor, setActionFor] = useState<CollectzParticipant | null>(null);
  // Team rename: which team is being renamed, and the draft label.
  const [renameTeamIdx, setRenameTeamIdx] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  // Screen-level confirm (duplicate / new link / cancel / delete / settle) and a
  // separate participant-level one that renders INSIDE the action FloatingModal.
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [pConfirm, setPConfirm] = useState<ConfirmState | null>(null);
  // Cost notes scratchpad (organizer calculator)
  const [costNotesVisible, setCostNotesVisible] = useState(false);
  // Proof preview inside the action modal (participant already paid)
  const [amProofUrl, setAmProofUrl] = useState<string | null>(null);
  const [amProofLoading, setAmProofLoading] = useState(false);

  // Load the proof image whenever the action modal opens on a paid participant.
  useEffect(() => {
    setAmProofUrl(null);
    setAmProofLoading(false);
    if (!actionFor?.proof_path) return;
    let alive = true;
    setAmProofLoading(true);
    proofSignedUrl(actionFor.proof_path)
      .then((url) => { if (alive && url) setAmProofUrl(url); })
      .catch(() => {})
      .finally(() => { if (alive) setAmProofLoading(false); });
    return () => { alive = false; };
  }, [actionFor]);
  // Note Fields standard: gold done-FAB while the multiline reject note is focused.
  const [multilineFocused, setMultilineFocused] = useState(false);
  const { keyboardVisible, keyboardHeight } = useKeyboardVisible(() => setMultilineFocused(false));

  const load = useCallback(
    async (showSpinner = false) => {
      if (showSpinner) setLoading(true);
      try {
        const { session: s, participants: p } = await getSessionWithRoster(sessionId);
        setSession(s);
        setParticipants(p);
        // Avatars ride along: claimed participants only, decorative (never fails).
        fetchRosterProfiles(p.map((x) => x.user_id).filter((id): id is string => !!id))
          .then(setProfiles)
          .catch(() => {});
      } catch {
        showToast(t.collectz.actionError, 'error');
      } finally {
        setLoading(false);
      }
    },
    [sessionId, showToast, t],
  );

  // Spinner ONLY on the first open. A re-focus (coming back from Edit, etc.)
  // refetches silently — showing the spinner unmounts the whole ScrollView, so
  // the screen would snap back to the top instead of restoring where you were.
  const firstLoadRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      load(firstLoadRef.current);
      firstLoadRef.current = false;
    }, [load]),
  );

  // Live roster: refetch on any participant/session change for this session.
  useEffect(() => subscribeToSession(sessionId, () => load()), [sessionId, load]);

  const shares = useMemo(
    () => (session ? computeShares(session, participants) : new Map<string, number | null>()),
    [session, participants],
  );
  const progress = useMemo(
    () => (session ? computeProgress(session, participants) : null),
    [session, participants],
  );

  const actives = participants.filter((p) => p.slot === 'active');
  const reserves = participants.filter((p) => p.slot === 'reserve');
  // Teams are on only when the organizer set capacity BY TEAMS. Reserves never
  // hold a team slot, so grouping only ever covers the active roster.
  const teamCount = session?.team_count ?? 0;
  const teamsOn = teamCount > 0;
  const teamSize = session?.team_size ?? null;
  const teamGroups = useMemo(() => {
    if (!teamsOn) return [];
    const groups: Array<{ idx: number; members: CollectzParticipant[] }> = Array.from(
      { length: teamCount },
      (_, i) => ({ idx: i + 1, members: [] as CollectzParticipant[] }),
    );
    for (const p of actives) {
      if (p.team_idx != null && p.team_idx >= 1 && p.team_idx <= teamCount) {
        groups[p.team_idx - 1].members.push(p);
      }
    }
    return groups;
  }, [teamsOn, teamCount, actives]);
  const unassigned = teamsOn ? actives.filter((p) => p.team_idx == null || p.team_idx > teamCount) : actives;
  const isOpen = session?.status === 'open';

  const statusColor = (status: CollectzParticipantStatus): string => {
    switch (status) {
      case 'confirmed': return C.accent;
      case 'pending': return C.gold;
      case 'rejected': return C.overdue;
      default: return C.neutral;
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

  /** Guard wrapper: one action at a time, uniform error toast, always refetch. */
  const run = useCallback(
    async (fn: () => Promise<void>, toast?: string) => {
      if (busy) return;
      setBusy(true);
      try {
        await fn();
        if (toast) {
          successNotification();
          showToast(toast, 'success');
        }
        await load();
      } catch {
        errorNotification();
        showToast(t.collectz.actionError, 'error');
      } finally {
        setBusy(false);
      }
    },
    [busy, load, showToast, t],
  );

  // ── Session-level actions ──
  const shareAnnouncement = () => {
    if (!session) return;
    mediumTap();
    Share.share({ message: buildWhatsappAnnouncement(session, progress?.activeCount ?? 0) }).catch(() => {});
  };

  // Tap copies the code, long-press copies the full join link. Inline swap on the
  // row itself (icon → check, hint → "code copied"/"link copied") so the user
  // always knows WHICH of the two landed — same mechanism as copyRequest below.
  const copyShareCode = async (asLink: boolean) => {
    if (!session) return;
    lightTap();
    await Clipboard.setStringAsync(asLink ? collectzUrl(session.share_code) : session.share_code);
    setCodeCopied(asLink ? 'link' : 'code');
    setTimeout(() => setCodeCopied(null), 1400);
  };

  // Not via run(): its catch shows a generic error, which would hide the real
  // reason — most importantly the 24h "already reminded" cooldown.
  const sendReminders = async () => {
    if (busy) return;
    lightTap();
    setBusy(true);
    try {
      const sent = await remindUnpaid(sessionId);
      successNotification();
      showToast(fill(t.collectz.remindSent, { count: sent }), 'success');
    } catch (e) {
      errorNotification();
      showToast(e instanceof Error && e.message ? e.message : t.collectz.actionError, 'error');
    } finally {
      setBusy(false);
    }
  };

  // Notify fanout with reach feedback — remind's honesty applied to notify: the
  // organizer must see "notified 2 of 9", not a silent fire-and-forget that may
  // have pushed nobody. M = app-linked roster (only they are reachable by push).
  // Never throws — the session change already landed by the time this runs.
  const notifyWithReach = async (kind: 'settled' | 'cancelled') => {
    const linked = participants.filter((p) => !!p.user_id).length;
    try {
      const { data, error } = await supabasePersonal.functions.invoke('collectz-notify', {
        body: { sessionId, kind },
      });
      if (error || (data as { error?: string } | null)?.error) throw new Error('notify_failed');
      // `reached`/`eligible` count PARTICIPANTS (a phone+tablet person is 1), so
      // n of m stays honest — `sent` counts tokens and can exceed the roster.
      const reached = (data as { reached?: number } | null)?.reached ?? 0;
      const eligible = (data as { eligible?: number } | null)?.eligible ?? linked;
      showToast(fill(t.collectz.notifyReach, { n: reached, m: eligible }), reached > 0 ? 'success' : 'info');
    } catch {
      showToast(t.collectz.notifyFailed, 'info');
    }
  };

  // Push can't reach organizer-typed names (no user_id) — after a cancel the
  // group chat is the only channel left, so offer a ready-made WhatsApp blast.
  const promptShareUpdate = (s: CollectzSession) => {
    const unlinked = participants.filter((p) => !p.user_id).length;
    const lines = [`*${s.title}*`, '', `❌ ${t.collectz.waCancelLine}`];
    const d = fmtDateTime(s.event_at);
    if (d) lines.push(`📅 ${d}`);
    if (s.venue) lines.push(`📍 ${s.venue}`);
    const message = lines.join('\n');
    Alert.alert(
      t.collectz.shareUpdateTitle,
      unlinked > 0 ? fill(t.collectz.shareUpdateBodyUnlinked, { n: unlinked }) : t.collectz.shareUpdateBody,
      [
        { text: t.collectz.shareUpdateSkip, style: 'cancel' },
        {
          text: t.collectz.requestWhatsapp,
          onPress: () => {
            // No group phone on file — WhatsApp opens its own chat picker; the
            // system share sheet is the fallback when WhatsApp isn't installed.
            Linking.openURL(`whatsapp://send?text=${encodeURIComponent(message)}`).catch(() =>
              Share.share({ message }).catch(() => {}),
            );
          },
        },
      ],
    );
  };

  const settle = () => {
    lightTap();
    setConfirm({
      title: t.collectz.settleTitle,
      message: t.collectz.settleBody,
      confirmLabel: t.collectz.actionSettle,
      // Settling is the irreversible "this is done" moment, so the dialog shows
      // who has actually paid and who hasn't before the organizer commits.
      summary: true,
      onConfirm: () => {
        setConfirm(null);
        run(async () => {
          await updateSession(sessionId, { status: 'settled' });
          await notifyWithReach('settled');
        }, t.collectz.settledToast);
      },
    });
  };

  const reopen = () => run(() => updateSession(sessionId, { status: 'open' }), t.collectz.reopenedToast);

  // ── v2 session-level actions ──
  const edit = () => {
    lightTap();
    navigation.navigate('CollectzCreate', { editSessionId: sessionId });
  };

  const duplicate = () => {
    lightTap();
    setConfirm({
      title: t.collectz.duplicateTitle,
      message: t.collectz.duplicateBody,
      confirmLabel: t.collectz.actionDuplicate,
      onConfirm: () => {
        setConfirm(null);
        run(async () => {
          const created = await duplicateSession(sessionId);
          navigation.replace('CollectzDetail', { sessionId: created.id });
        }, t.collectz.duplicateDone);
      },
    });
  };

  const regenLink = () => {
    lightTap();
    setConfirm({
      title: t.collectz.regenTitle,
      message: t.collectz.regenBody,
      confirmLabel: t.collectz.actionRegenLink,
      onConfirm: () => {
        setConfirm(null);
        run(async () => { await regenerateShareCode(sessionId); }, t.collectz.regenDone);
      },
    });
  };

  const cancelSess = () => {
    lightTap();
    setConfirm({
      title: t.collectz.cancelTitle,
      message: t.collectz.cancelBody,
      confirmLabel: t.collectz.actionCancel,
      destructive: true,
      // Not via run(): after the cancel lands we surface notify reach and then
      // offer the WhatsApp fallback — unclaimed names get no push at all.
      onConfirm: async () => {
        setConfirm(null);
        const s = session;
        setBusy(true);
        try {
          await cancelSession(sessionId);
          successNotification();
          showToast(t.collectz.cancelledToast, 'success');
          await notifyWithReach('cancelled');
          await load();
          if (s) promptShareUpdate(s);
        } catch {
          errorNotification();
          showToast(t.collectz.actionError, 'error');
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const deleteSess = () => {
    lightTap();
    const anyPaid = participants.some((p) => p.status === 'pending' || p.status === 'confirmed');
    setConfirm({
      title: t.collectz.deleteTitle,
      message: anyPaid ? t.collectz.deleteBodyPaid : t.collectz.deleteBody,
      confirmLabel: t.common.delete,
      destructive: true,
      onConfirm: async () => {
        setConfirm(null);
        // Notify FIRST (the join link dies with the row), then delete + leave.
        setBusy(true);
        try {
          await notifyWithReach('cancelled');
          await deleteSession(sessionId);
          successNotification();
          showToast(t.collectz.deletedToast, 'success');
          navigation.goBack();
        } catch {
          errorNotification();
          showToast(t.collectz.actionError, 'error');
        } finally {
          setBusy(false);
        }
      },
    });
  };

  // ── Participant-level actions ──
  const openProof = async (p: CollectzParticipant) => {
    lightTap();
    setProofFor(p);
    setRejectMode(false);
    setRejectNote('');
    setProofUrl(null);
    if (!p.proof_path) return;
    setProofLoading(true);
    const url = await proofSignedUrl(p.proof_path);
    setProofLoading(false);
    if (url) setProofUrl(url);
    else showToast(t.collectz.proofError, 'error');
  };

  const closeProof = () => {
    setProofFor(null);
    setProofUrl(null);
    setRejectMode(false);
    setRejectNote('');
  };

  const manualConfirm = (p: CollectzParticipant) =>
    run(() => confirmParticipant(p.id), fill(t.collectz.confirmedToast, { name: p.name }));

  // Participant confirms render INSIDE the action FloatingModal (asOverlay) and
  // leave it open — iOS can't present a second RN Modal over an open one, and
  // closing+presenting in the same commit is the flaky "present while dismissing"
  // case. Confirming closes both, then runs the action.
  const undoConfirm = (p: CollectzParticipant) => {
    setPConfirm({
      title: t.collectz.actionUndo,
      message: p.name,
      confirmLabel: t.collectz.actionUndo,
      onConfirm: () => {
        setPConfirm(null);
        setActionFor(null);
        run(() => resetParticipantToUnpaid(p.id), fill(t.collectz.undoToast, { name: p.name }));
      },
    });
  };

  const promote = (p: CollectzParticipant) =>
    run(() => updateParticipant(p.id, { slot: 'active' }), fill(t.collectz.promotedToast, { name: p.name }));

  const remove = (p: CollectzParticipant) => {
    const paid = p.status === 'pending' || p.status === 'confirmed';
    setPConfirm({
      title: paid ? fill(t.collectz.removePaidTitle, { name: p.name }) : fill(t.collectz.removeTitle, { name: p.name }),
      message: paid ? t.collectz.removePaidBody : t.collectz.removeBody,
      confirmLabel: t.common.delete,
      destructive: true,
      onConfirm: () => {
        setPConfirm(null);
        setActionFor(null);
        run(async () => {
          // Tell the removed person first — collectz-notify's 'removed' kind
          // pushes to the participant_user_id we pass (it does NOT read the row).
          // Best-effort: a missed push must never block the removal itself.
          if (p.user_id) {
            await supabasePersonal.functions
              .invoke('collectz-notify', { body: { sessionId, kind: 'removed', participant_user_id: p.user_id } })
              .catch(() => {});
          }
          await removeParticipant(p.id);
        }, fill(t.collectz.removedToast, { name: p.name }));
      },
    });
  };

  const confirmFromSheet = () => {
    if (!proofFor) return;
    const p = proofFor;
    closeProof();
    run(() => confirmParticipant(p.id), fill(t.collectz.confirmedToast, { name: p.name }));
  };

  const rejectFromSheet = () => {
    if (!proofFor) return;
    const p = proofFor;
    const note = rejectNote.trim();
    closeProof();
    run(() => rejectParticipant(p.id, note), t.collectz.rejectedToast);
  };

  // ── Request payment (per participant) ──
  const openRequest = (p: CollectzParticipant) => {
    if (!session) return;
    lightTap();
    setReqFor(p);
    setReqMsg(buildRequestMessage(session, p.name, shares.get(p.id) ?? null));
    setReqCopied(false);
  };

  const closeRequest = () => {
    setReqFor(null);
    setReqMsg('');
    setReqCopied(false);
  };

  const copyRequest = async () => {
    if (!reqMsg) return;
    lightTap();
    await Clipboard.setStringAsync(reqMsg);
    setReqCopied(true);
    setTimeout(() => setReqCopied(false), 3000);
  };

  const whatsappRequest = async () => {
    if (!reqMsg) return;
    lightTap();
    try {
      // No phone on roster entries — WhatsApp opens its own chat picker.
      await Linking.openURL(`whatsapp://send?text=${encodeURIComponent(reqMsg)}`);
      closeRequest();
    } catch {
      showToast(t.collectz.actionError, 'error');
    }
  };

  // ── Participant action modal ──
  /** Close the modal first, then run the participant action against it. */
  const actFromModal = (fn: (p: CollectzParticipant) => void) => {
    const p = actionFor;
    setActionFor(null);
    if (p) fn(p);
  };

  // WhatsApp straight from the action modal — same composed message, no preview stop.
  const whatsappDirect = async (p: CollectzParticipant) => {
    if (!session) return;
    lightTap();
    try {
      await Linking.openURL(
        `whatsapp://send?text=${encodeURIComponent(buildRequestMessage(session, p.name, shares.get(p.id) ?? null))}`,
      );
    } catch {
      showToast(t.collectz.actionError, 'error');
    }
  };

  // ── Cost notes (organizer scratchpad + calculator) ──
  const openCostNotes = () => {
    lightTap();
    setCostNotesVisible(true);
  };

  // Any dismiss path lands here — save only when the text actually changed.
  const closeCostNotes = (text: string | null, changed: boolean) => {
    setCostNotesVisible(false);
    if (!changed) return;
    run(() => updateSession(sessionId, { calc_notes: text }), t.collectz.costNotesSaved);
  };

  // Calculator result → session amount (flat = per-person, equal = total).
  const applyCalcAmount = (amount: number) => {
    if (!session) return;
    const updates = session.scheme === 'equal' ? { total_amount: amount } : { default_share: amount };
    run(() => updateSession(sessionId, updates), t.collectz.costNotesApplied);
  };

  // Rename a team. Labels live on the session as a text[] aligned to team_count,
  // so pad any short/absent array before writing the slot.
  const saveTeamName = () => {
    if (!session || renameTeamIdx == null) return;
    const names = Array.isArray(session.team_names) ? [...session.team_names] : [];
    while (names.length < teamCount) names.push('');
    names[renameTeamIdx - 1] = renameDraft.trim().slice(0, 40);
    setRenameTeamIdx(null);
    run(() => updateSession(sessionId, { team_names: names.some((n) => n) ? names : null }), t.collectz.teamRenamed);
  };

  // Move a player between teams. The organizer can shuffle anyone, but still not
  // past team_size — a full team is full for them too.
  const moveToTeam = (p: CollectzParticipant, idx: number | null) => {
    setActionFor(null);
    if (idx != null && teamSize != null) {
      const occupied = actives.filter((x) => x.team_idx === idx && x.id !== p.id).length;
      if (occupied >= teamSize) { showToast(t.collectz.teamFullToast, 'error'); return; }
    }
    run(() => updateParticipant(p.id, { team_idx: idx }), t.collectz.teamMoved);
  };

  const renderRow = (p: CollectzParticipant) => {
    const share = p.slot === 'reserve' ? null : shares.get(p.id);
    const color = statusColor(p.status);
    return (
      <Pressable
        key={p.id}
        style={({ pressed }) => [styles.rowCard, neu.raisedSoft, pressed && { opacity: 0.9 }]}
        onPress={() => { lightTap(); setActionFor(p); }}
        accessibilityRole="button"
        accessibilityLabel={p.name}
      >
        <AvatarView
          size={36}
          uri={p.user_id ? profiles[p.user_id]?.avatar_uri : null}
          presetId={p.user_id ? profiles[p.user_id]?.avatar_id : null}
          name={p.name}
        />
        <View style={styles.rowMain}>
          <View style={styles.rowNameLine}>
            <Text style={styles.rowName} numberOfLines={1}>{p.name}</Text>
            {!!p.user_id && (
              <View style={styles.claimedTag}>
                <Feather name="user-check" size={11} color={C.accent} />
                <Text style={styles.claimedTagText}>{t.collectz.claimed}</Text>
              </View>
            )}
          </View>
          <Text style={styles.rowShare}>
            {p.slot === 'reserve'
              ? t.collectz.reserveShare
              : share != null
                ? fmtMoney(share, session?.currency ?? 'RM')
                : t.collectz.shareUnknown}
          </Text>
        </View>

        <View style={[styles.statusChip, { backgroundColor: withAlpha(color, 0.18) }]}>
          <Text style={[styles.statusChipText, { color }]}>{statusLabel(p.status)}</Text>
        </View>
        <Feather name="chevron-right" size={16} color={C.textMuted} />
      </Pressable>
    );
  };

  if (loading || !session) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  const pct =
    progress && progress.target && progress.target > 0
      ? Math.min(progress.confirmed / progress.target, 1)
      : progress && progress.activeCount > 0
        ? progress.confirmedCount / progress.activeCount
        : 0;

  const dateLine = fmtDateTime(session.event_at);
  const proofIsPdf = proofFor?.proof_path?.toLowerCase().endsWith('.pdf') ?? false;

  return (
    <View style={styles.screen}>
      <PageScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        {/* Header card */}
        <View style={[styles.headerCard, neu.raisedSoft]}>
          <View style={styles.titleRow}>
            {(() => {
              const preset = presetClubIcon(session.image_path);
              const uri = !preset && session.image_path ? clubImageUrl(session.image_path) : null;
              if (!preset && !uri) return null;
              // Preset emoji PNGs are square artwork — a circular crop clips the
              // corners (the "cropped picture" bug). Square well + contain for
              // presets; full-bleed cover for uploaded club photos.
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
          {!!session.maps_url && <MapPreviewCard mapsUrl={session.maps_url} venue={session.venue} compact />}
          {/* SHARE CODE — its own Neu Card: the code is the hero (big, letter-spaced),
              the WHOLE card is the tap target (tap = bare code, long-press = join link),
              and the icon well flips to a check while the hint names WHICH variant
              landed ("code copied"/"link copied") for 1.4s. */}
          <Pressable
            onPress={() => copyShareCode(false)}
            onLongPress={() => copyShareCode(true)}
            delayLongPress={350}
            accessibilityRole="button"
            accessibilityLabel={t.collectz.codeCopyHint}
            style={({ pressed }) => [styles.codeCard, neu.raisedSoft, pressed && { opacity: 0.9 }]}
          >
            <View style={styles.codeCardLeft}>
              <Text style={styles.codeCardCode}>{session.share_code}</Text>
              <Text style={[styles.codeCopyHint, codeCopied && { color: C.accent, fontWeight: TYPOGRAPHY.weight.semibold }]}>
                {codeCopied ? (codeCopied === 'link' ? t.collectz.linkCopied : t.collectz.codeCopied) : t.collectz.codeCopyHint}
              </Text>
            </View>
            <View style={[styles.codeCardWell, neu.well, codeCopied && { backgroundColor: withAlpha(C.accent, 0.12) }]}>
              <Feather name={codeCopied ? 'check' : 'copy'} size={16} color={codeCopied ? C.accent : C.textSecondary} />
            </View>
          </Pressable>
          {!isOpen && (
            <View style={styles.closedBanner}>
              <Text style={styles.closedBannerText}>
                {session.status === 'settled' ? t.collectz.settledBanner : t.collectz.cancelledBanner}
              </Text>
            </View>
          )}
        </View>

        {/* Progress */}
        {progress && (
          <View style={[styles.progressCard, neu.raisedSoft]}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(pct * 100)}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {progress.target != null
                ? `${fill(t.collectz.progressOfTarget, {
                    confirmed: fmtMoney(progress.confirmed, session.currency),
                    target: fmtMoney(progress.target, session.currency),
                  })} · ${fill(t.collectz.confirmedCount, { n: progress.confirmedCount, m: progress.activeCount })}`
                : fill(t.collectz.confirmedCount, { n: progress.confirmedCount, m: progress.activeCount })}
            </Text>
          </View>
        )}

        {/* Cost notes entry — organizer scratchpad + calculator */}
        <Pressable
          style={({ pressed }) => [styles.notesEntry, neu.raisedSoft, pressed && { opacity: 0.9 }]}
          onPress={openCostNotes}
          accessibilityRole="button"
        >
          <View style={styles.notesEntryIcon}>
            <Feather name="percent" size={16} color={C.accent} />
          </View>
          <View style={styles.notesEntryMain}>
            <Text style={styles.notesEntryTitle}>{t.collectz.costNotesEntry}</Text>
            <Text style={styles.notesEntryHint}>{t.collectz.costNotesEntryHint}</Text>
          </View>
          <Feather name="chevron-right" size={16} color={C.textMuted} />
        </Pressable>

        {/* Primary actions — the organizer's daily trio */}
        <View style={styles.actionsRow}>
          <Pressable style={({ pressed }) => [styles.actionBtn, neu.raised, pressed && { opacity: 0.85 }]} onPress={shareAnnouncement}>
            <Feather name="share-2" size={15} color={C.accent} />
            <Text style={styles.actionBtnText}>{t.collectz.actionShare}</Text>
          </Pressable>
          {/* Remind only while open — the server rejects it (session_closed) once settled/cancelled */}
          {isOpen && (
            <Pressable style={({ pressed }) => [styles.actionBtn, neu.raised, pressed && { opacity: 0.85 }]} onPress={sendReminders} disabled={busy}>
              <Feather name="bell" size={15} color={C.accent} />
              <Text style={styles.actionBtnText}>{t.collectz.actionRemind}</Text>
            </Pressable>
          )}
          {isOpen ? (
            <Pressable style={({ pressed }) => [styles.actionBtn, neu.raised, pressed && { opacity: 0.85 }]} onPress={settle} disabled={busy}>
              <Feather name="check-circle" size={15} color={C.bronze} />
              <Text style={[styles.actionBtnText, { color: C.bronze }]}>{t.collectz.actionSettle}</Text>
            </Pressable>
          ) : (
            <Pressable style={({ pressed }) => [styles.actionBtn, neu.raised, pressed && { opacity: 0.85 }]} onPress={reopen} disabled={busy}>
              <Feather name="rotate-ccw" size={15} color={C.accent} />
              <Text style={styles.actionBtnText}>{t.collectz.actionReopen}</Text>
            </Pressable>
          )}
        </View>

        {/* Roster — who paid, right up front */}
        <Text style={styles.sectionTitle}>{t.collectz.roster}</Text>
        {actives.length === 0 && reserves.length === 0 ? (
          <Text style={styles.emptyRoster}>{t.collectz.emptyRoster}</Text>
        ) : teamsOn ? (
          <>
            {teamGroups.map((g) => (
              <View key={g.idx} style={styles.teamBlock}>
                <Pressable
                  style={styles.teamHeader}
                  onPress={() => {
                    lightTap();
                    setRenameDraft(session.team_names?.[g.idx - 1] ?? '');
                    setRenameTeamIdx(g.idx);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t.collectz.teamRename}
                >
                  <Text style={styles.teamHeaderName} numberOfLines={1}>
                    {teamLabel(session.team_names, g.idx, fill(t.collectz.teamN, { n: g.idx }))}
                  </Text>
                  <Text style={styles.teamHeaderCount}>
                    {teamSize != null ? `${g.members.length}/${teamSize}` : String(g.members.length)}
                  </Text>
                  <Feather name="edit-2" size={12} color={C.textMuted} />
                </Pressable>
                {g.members.length === 0 ? (
                  <Text style={styles.teamEmpty}>{t.collectz.teamEmpty}</Text>
                ) : (
                  <View style={styles.rosterList}>{g.members.map(renderRow)}</View>
                )}
              </View>
            ))}
            {unassigned.length > 0 && (
              <View style={styles.teamBlock}>
                <View style={styles.teamHeader}>
                  <Text style={styles.teamHeaderName}>{t.collectz.teamNoneLabel}</Text>
                  <Text style={styles.teamHeaderCount}>{String(unassigned.length)}</Text>
                </View>
                <View style={styles.rosterList}>{unassigned.map(renderRow)}</View>
              </View>
            )}
          </>
        ) : (
          <View style={styles.rosterList}>{actives.map(renderRow)}</View>
        )}

        {reserves.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, styles.sectionGap]}>{t.collectz.waitingList}</Text>
            <View style={styles.rosterList}>{reserves.map(renderRow)}</View>
          </>
        )}

        {/* Manage — edit / duplicate / new link */}
        <Text style={[styles.sectionTitle, styles.sectionGap]}>{t.collectz.manageSection}</Text>
        <View style={styles.actionsRow}>
          <Pressable style={({ pressed }) => [styles.actionBtn, neu.raised, pressed && { opacity: 0.85 }]} onPress={edit} disabled={busy}>
            <Feather name="edit-2" size={15} color={C.accent} />
            <Text style={styles.actionBtnText}>{t.collectz.actionEdit}</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.actionBtn, neu.raised, pressed && { opacity: 0.85 }]} onPress={duplicate} disabled={busy}>
            <Feather name="copy" size={15} color={C.accent} />
            <Text style={styles.actionBtnText}>{t.collectz.actionDuplicate}</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.actionBtn, neu.raised, pressed && { opacity: 0.85 }]} onPress={regenLink} disabled={busy}>
            <Feather name="refresh-cw" size={15} color={C.accent} />
            <Text style={styles.actionBtnText}>{t.collectz.actionRegenLink}</Text>
          </Pressable>
        </View>

        {/* Danger — cancel / delete, visually separated in red */}
        <View style={[styles.actionsRow, styles.dangerRow]}>
          {isOpen && (
            <Pressable style={({ pressed }) => [styles.actionBtn, neu.raised, pressed && { opacity: 0.85 }]} onPress={cancelSess} disabled={busy}>
              <Feather name="x-circle" size={15} color={C.overdue} />
              <Text style={[styles.actionBtnText, { color: C.overdue }]}>{t.collectz.actionCancel}</Text>
            </Pressable>
          )}
          <Pressable style={({ pressed }) => [styles.actionBtn, neu.raised, pressed && { opacity: 0.85 }]} onPress={deleteSess} disabled={busy}>
            <Feather name="trash-2" size={15} color={C.overdue} />
            <Text style={[styles.actionBtnText, { color: C.overdue }]}>{t.collectz.actionDelete}</Text>
          </Pressable>
        </View>
      </PageScrollView>

      {/* Cost notes sheet — scratchpad + calculator for the per-person math */}
      <CostNotesSheet
        visible={costNotesVisible}
        onClose={closeCostNotes}
        currency={session.currency}
        scheme={session.scheme}
        activeCount={actives.length}
        initialNotes={session.calc_notes}
        onApplyAmount={applyCalcAmount}
      />

      {/* Team rename — organizer taps a team header. Participants can rename
          from their join page too; last write wins, which is fine for a label. */}
      <FloatingModal visible={renameTeamIdx != null} onClose={() => setRenameTeamIdx(null)} entrance="fade">
        <View style={styles.renameWrap}>
          <Text style={styles.renameTitle}>{t.collectz.teamRename}</Text>
          <TextInput
            style={styles.renameInput}
            value={renameDraft}
            onChangeText={setRenameDraft}
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

      {/* Participant action modal — tap any roster row. Centered fade-in like
          the Repay Credit picker (NOT a bottom slide). */}
      <FloatingModal visible={!!actionFor} onClose={() => setActionFor(null)} entrance="fade">
        {actionFor && session && (() => {
          const p = actionFor;
          const share = p.slot === 'reserve' ? null : shares.get(p.id) ?? null;
          const color = statusColor(p.status);
          const canNudge = (p.status === 'unpaid' || p.status === 'rejected') && isOpen;
          const proofIsPdf = p.proof_path?.toLowerCase().endsWith('.pdf') ?? false;

          // DebtTracking detail pattern: one olive primary CTA on top, the rest
          // as a centered row of circular neu icon chips (one-color icons).
          let primary: { icon: React.ComponentProps<typeof Feather>['name']; label: string; onPress: () => void } | null = null;
          if (p.status === 'pending') {
            primary = { icon: 'check-circle', label: t.collectz.actionConfirm, onPress: () => actFromModal(manualConfirm) };
          } else if (p.slot === 'reserve' && isOpen) {
            primary = { icon: 'arrow-up-circle', label: t.collectz.actionPromote, onPress: () => actFromModal(promote) };
          } else if (canNudge) {
            primary = { icon: 'check-circle', label: t.collectz.actionMarkPaid, onPress: () => actFromModal(manualConfirm) };
          }

          // Team move — organizer shuffles anyone who is actually playing.
          const teamRow = teamsOn && p.slot === 'active' ? (
            <View style={styles.amTeamRow}>
              <Pressable
                style={[styles.teamChip, neu.raised, p.team_idx == null && styles.teamChipActive]}
                onPress={() => moveToTeam(p, null)}
                accessibilityRole="button"
              >
                <Text style={[styles.teamChipText, p.team_idx == null && styles.teamChipTextActive]}>
                  {t.collectz.teamNoneLabel}
                </Text>
              </Pressable>
              {Array.from({ length: teamCount }, (_, i) => i + 1).map((idx) => {
                const here = p.team_idx === idx;
                const occupied = actives.filter((x) => x.team_idx === idx && x.id !== p.id).length;
                const full = !here && teamSize != null && occupied >= teamSize;
                return (
                  <Pressable
                    key={idx}
                    disabled={full}
                    style={[styles.teamChip, neu.raised, here && styles.teamChipActive, full && styles.teamChipFull]}
                    onPress={() => moveToTeam(p, idx)}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.teamChipText, here && styles.teamChipTextActive]}>
                      {teamLabel(session.team_names, idx, fill(t.collectz.teamN, { n: idx }))}
                      {full ? ` \u00b7 ${t.collectz.teamFullShort}` : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null;

          const chips: Array<{ key: string; icon: string; color: string; label: string; onPress: () => void }> = [];
          if (p.status === 'pending') {
            chips.push({ key: 'proof', icon: 'eye', color: C.accent, label: t.collectz.viewProof, onPress: () => actFromModal(openProof) });
          }
          if (canNudge && p.slot === 'active') {
            chips.push({ key: 'request', icon: 'edit-3', color: C.accent, label: t.collectz.requestTitle, onPress: () => actFromModal(openRequest) });
            chips.push({ key: 'wa', icon: 'send', color: C.gold, label: t.collectz.requestWhatsapp, onPress: () => actFromModal(whatsappDirect) });
          }
          if (canNudge && p.slot === 'reserve') {
            chips.push({ key: 'paid', icon: 'check-circle', color: C.accent, label: t.collectz.actionMarkPaid, onPress: () => actFromModal(manualConfirm) });
          }
          if (p.status === 'confirmed') {
            // NOT actFromModal — these two confirm first, and their dialog renders
            // inside this sheet, so the sheet must stay open until confirmed.
            chips.push({ key: 'undo', icon: 'rotate-ccw', color: C.textSecondary, label: t.collectz.actionUndo, onPress: () => undoConfirm(p) });
          }
          chips.push({ key: 'remove', icon: 'trash-2', color: C.overdue, label: t.collectz.actionRemove, onPress: () => remove(p) });

          return (
            <View style={styles.amWrap}>
              {/* Header: who this is */}
              <View style={styles.amHeader}>
                <AvatarView
                  size={44}
                  uri={p.user_id ? profiles[p.user_id]?.avatar_uri : null}
                  presetId={p.user_id ? profiles[p.user_id]?.avatar_id : null}
                  name={p.name}
                />
                <View style={styles.amHeaderMain}>
                  <View style={styles.rowNameLine}>
                    <Text style={styles.amName} numberOfLines={1}>{p.name}</Text>
                    {!!p.user_id && (
                      <View style={styles.claimedTag}>
                        <Feather name="user-check" size={11} color={C.accent} />
                        <Text style={styles.claimedTagText}>{t.collectz.claimed}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.rowShare}>
                    {p.slot === 'reserve'
                      ? t.collectz.reserveShare
                      : share != null
                        ? fmtMoney(share, session.currency)
                        : t.collectz.shareUnknown}
                  </Text>
                </View>
                <View style={[styles.statusChip, { backgroundColor: withAlpha(color, 0.18) }]}>
                  <Text style={[styles.statusChipText, { color }]}>{statusLabel(p.status)}</Text>
                </View>
              </View>

              {/* Submitted proof, right in the modal — confirm below it. */}
              {p.status === 'pending' && !!p.proof_path && (
                amProofLoading ? (
                  <ActivityIndicator size="small" color={C.accent} style={styles.amProofLoader} />
                ) : amProofUrl ? (
                  proofIsPdf ? (
                    <Pressable
                      style={({ pressed }) => [styles.amProofPdf, neu.raised, pressed && { opacity: 0.85 }]}
                      onPress={() => Linking.openURL(amProofUrl).catch(() => showToast(t.collectz.proofError, 'error'))}
                      accessibilityRole="button"
                    >
                      <Feather name="file-text" size={16} color={C.accent} />
                      <Text style={styles.amProofPdfText}>{t.collectz.proofOpenPdf}</Text>
                    </Pressable>
                  ) : (
                    <Pressable onPress={() => actFromModal(openProof)} accessibilityRole="button" accessibilityLabel={t.collectz.viewProof}>
                      <Image source={{ uri: amProofUrl }} style={styles.amProofImage} resizeMode="cover" />
                    </Pressable>
                  )
                ) : null
              )}

              {teamRow}

              {primary && (
                <NeuButton icon={primary.icon} label={primary.label} onPress={primary.onPress} disabled={busy} />
              )}

              <View style={styles.amChipRow}>
                {chips.map((chip) => (
                  <Pressable
                    key={chip.key}
                    style={({ pressed }) => [styles.amChip, neu.raised, pressed && { opacity: 0.85 }]}
                    onPress={chip.onPress}
                    accessibilityRole="button"
                    accessibilityLabel={chip.label}
                  >
                    <Feather name={chip.icon as any} size={16} color={chip.color} />
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })()}
        {/* asOverlay: lives in THIS modal's window. A nested <Modal> would present
            behind the sheet and be invisible on iOS. */}
        <ConfirmDialog
          visible={!!pConfirm}
          title={pConfirm?.title ?? ''}
          message={pConfirm?.message}
          confirmLabel={pConfirm?.confirmLabel ?? ''}
          destructive={pConfirm?.destructive}
          busy={busy}
          onConfirm={() => pConfirm?.onConfirm()}
          onClose={() => setPConfirm(null)}
          asOverlay
        />
      </FloatingModal>

      {/* Proof review sheet */}
      <BottomSheet
        visible={!!proofFor}
        onClose={closeProof}
        maxHeightPct={0.85}
        closeLabel={t.common.close}
        keyboardAvoiding
        overlay={<KeyboardDoneFab visible={keyboardVisible && multilineFocused} keyboardHeight={keyboardHeight} />}
      >
        {proofFor && (
          <ScrollView
            style={{ flexGrow: 0, flexShrink: 1 }}
            contentContainerStyle={styles.proofWrap}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.proofTitle}>{fill(t.collectz.proofTitle, { name: proofFor.name })}</Text>
            {proofLoading ? (
              <ActivityIndicator size="large" color={C.accent} style={styles.proofLoader} />
            ) : proofUrl ? (
              proofIsPdf ? (
                <NeuButton
                  icon="file-text"
                  label={t.collectz.proofOpenPdf}
                  onPress={() => Linking.openURL(proofUrl).catch(() => showToast(t.collectz.proofError, 'error'))}
                />
              ) : (
                <Image source={{ uri: proofUrl }} style={styles.proofImage} resizeMode="contain" />
              )
            ) : (
              <Text style={styles.hint}>{t.collectz.proofError}</Text>
            )}

            {proofFor.status === 'pending' && !rejectMode && (
              <View style={styles.proofActions}>
                <NeuButton label={t.collectz.actionConfirm} onPress={confirmFromSheet} disabled={busy} />
                <Pressable
                  style={({ pressed }) => [styles.rejectBtn, neu.raised, pressed && { opacity: 0.85 }]}
                  onPress={() => { lightTap(); setRejectMode(true); }}
                >
                  <Text style={styles.rejectBtnText}>{t.collectz.actionReject}</Text>
                </Pressable>
              </View>
            )}

            {proofFor.status === 'pending' && rejectMode && (
              <View style={styles.rejectBox}>
                <Text style={styles.rejectTitle}>{t.collectz.rejectTitle}</Text>
                <TextInput
                  style={styles.rejectInput}
                  value={rejectNote}
                  onChangeText={setRejectNote}
                  placeholder={fill(t.collectz.rejectNotePlaceholder, { name: proofFor.name })}
                  placeholderTextColor={withAlpha(C.textMuted, 0.55)}
                  multiline
                  onFocus={() => setMultilineFocused(true)}
                  onBlur={() => setMultilineFocused(false)}
                />
                <Pressable
                  style={({ pressed }) => [styles.rejectBtn, neu.raised, pressed && { opacity: 0.85 }]}
                  onPress={rejectFromSheet}
                  disabled={busy}
                >
                  <Text style={styles.rejectBtnText}>{t.collectz.actionReject}</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        )}
      </BottomSheet>

      {/* Request-payment sheet — preview the composed message, edit freely,
          then copy it or hand off to WhatsApp (chat picker, roster has no phones). */}
      <BottomSheet
        visible={!!reqFor}
        onClose={closeRequest}
        maxHeightPct={0.85}
        closeLabel={t.common.close}
        keyboardAvoiding
        overlay={<KeyboardDoneFab visible={keyboardVisible && multilineFocused} keyboardHeight={keyboardHeight} />}
      >
        {reqFor && session && (
          <ScrollView
            style={{ flexGrow: 0, flexShrink: 1 }}
            contentContainerStyle={styles.reqWrap}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.proofTitle}>{t.collectz.requestTitle}</Text>
            <Text style={styles.reqSubtitle}>
              {reqFor.name}
              {shares.get(reqFor.id) != null ? ` · ${fmtMoney(shares.get(reqFor.id)!, session.currency)}` : ''}
            </Text>

            <Text style={styles.reqLabel}>{t.collectz.requestMessageLabel}</Text>
            <TextInput
              style={styles.reqInput}
              value={reqMsg}
              onChangeText={setReqMsg}
              multiline
              textAlignVertical="top"
              onFocus={() => setMultilineFocused(true)}
              onBlur={() => setMultilineFocused(false)}
            />

            <View style={styles.reqBtnRow}>
              <Pressable
                style={({ pressed }) => [styles.reqCopyBtn, neu.raised, pressed && { opacity: 0.85 }, reqCopied && { backgroundColor: withAlpha(C.accent, 0.12) }]}
                onPress={copyRequest}
              >
                <Feather name={reqCopied ? 'check' : 'copy'} size={16} color={C.accent} />
                <Text style={styles.reqCopyText}>{reqCopied ? t.common.copied : t.collectz.requestCopy}</Text>
              </Pressable>
              {/* WhatsApp-green buttons stay flat per the Onyx exemptions. */}
              <Pressable
                style={({ pressed }) => [styles.reqWaBtn, pressed && { opacity: 0.85 }]}
                onPress={whatsappRequest}
              >
                <Feather name="message-circle" size={16} color="#FFFFFF" />
                <Text style={styles.reqWaText}>{t.collectz.requestWhatsapp}</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}
      </BottomSheet>

      {/* Screen-level confirms. Safe as its own <Modal>: every action that opens
          this one fires from the page, not from inside a sheet. */}
      <ConfirmDialog
        visible={!!confirm}
        title={confirm?.title ?? ''}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel ?? ''}
        destructive={confirm?.destructive}
        busy={busy}
        onConfirm={() => confirm?.onConfirm()}
        onClose={() => setConfirm(null)}
      >
        {confirm?.summary && (() => {
          // Who has actually paid, before settling closes the session.
          const active = participants.filter((p) => p.slot === 'active');
          const paid = active.filter((p) => p.status === 'confirmed');
          const owing = active.filter((p) => p.status !== 'confirmed');
          // Pending = proof uploaded but unreviewed. Settling parks those people
          // on a closed "waiting for review" screen — call it out explicitly.
          const pendingProofs = active.filter((p) => p.status === 'pending');
          return (
            <View style={styles.settleSummary}>
              <View style={styles.settleRow}>
                <Feather name="check-circle" size={14} color={C.accent} />
                <Text style={styles.settleLabel}>
                  {t.collectz.settleSummaryPaid} ({paid.length})
                </Text>
              </View>
              <Text style={styles.settleNames}>{paid.length ? paid.map((p) => p.name).join(', ') : '—'}</Text>

              <View style={[styles.settleRow, styles.settleRowGap]}>
                <Feather name="alert-circle" size={14} color={owing.length ? C.overdue : C.textMuted} />
                <Text style={styles.settleLabel}>
                  {t.collectz.settleSummaryUnpaid} ({owing.length})
                </Text>
              </View>
              <Text style={styles.settleNames}>
                {owing.length ? owing.map((p) => p.name).join(', ') : t.collectz.settleAllPaid}
              </Text>

              {pendingProofs.length > 0 && (
                <Text style={styles.settlePendingNote}>
                  {fill(t.collectz.settlePendingProofs, { n: pendingProofs.length })}
                </Text>
              )}
            </View>
          );
        })()}
      </ConfirmDialog>
    </View>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.background },
    scroll: { flex: 1 },
    // Settle-confirm breakdown: who has paid vs who hasn't.
    settleSummary: {
      marginTop: SPACING.md,
      padding: SPACING.md,
      borderRadius: RADIUS.lg,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
    },
    settleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    settleRowGap: { marginTop: SPACING.sm },
    settleLabel: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
    },
    settleNames: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textSecondary,
      lineHeight: 19,
      marginTop: 2,
      marginLeft: 20,
    },
    settlePendingNote: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.gold,
      lineHeight: 19,
      marginTop: SPACING.sm,
    },
    codeCopyHint: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      marginTop: 2,
    },
    // SHARE CODE card — Neu Card recipe (raisedSoft on C.background, no border);
    // marginTop keeps the breathing room above that codeRowGap used to give.
    codeCard: {
      marginTop: SPACING.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.md,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.lg,
      borderRadius: RADIUS.lg,
      backgroundColor: C.background,
    },
    codeCardLeft: { flex: 1, minWidth: 0 },
    codeCardCode: {
      fontSize: TYPOGRAPHY.size['2xl'],
      fontWeight: TYPOGRAPHY.weight.bold,
      letterSpacing: 4,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    // small recessed icon slot inside the card (TransactionItem well pattern —
    // an indicator, not a standalone button, so it sits IN the surface)
    codeCardWell: {
      width: 40,
      height: 40,
      borderRadius: RADIUS.full,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(C.textPrimary, 0.04),
    },
    content: { padding: SPACING.xl, paddingBottom: SPACING['5xl'] },
    loaderWrap: { flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' },
    headerCard: {
      backgroundColor: C.background,
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
    clubEmoji: { fontSize: 32 },
    clubImagePhoto: { width: 52, height: 52 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    meta: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary },
    closedBanner: {
      marginTop: 4,
      borderRadius: RADIUS.md,
      backgroundColor: withAlpha(C.neutral, 0.25),
      paddingVertical: 6,
      alignItems: 'center',
    },
    closedBannerText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textSecondary },
    progressCard: {
      backgroundColor: C.background,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      gap: SPACING.sm,
      marginBottom: SPACING.md,
    },
    progressTrack: { height: 8, borderRadius: RADIUS.full, backgroundColor: C.pillBg, overflow: 'hidden' },
    progressFill: { height: 8, borderRadius: RADIUS.full, backgroundColor: C.accent },
    progressText: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary },
    // Cost notes entry card
    notesEntry: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      borderRadius: RADIUS.lg,
      backgroundColor: C.background,
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },
    notesEntryIcon: {
      width: 36,
      height: 36,
      borderRadius: RADIUS.md,
      backgroundColor: withAlpha(C.accent, 0.1),
      alignItems: 'center',
      justifyContent: 'center',
    },
    notesEntryMain: { flex: 1, gap: 1 },
    notesEntryTitle: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary },
    notesEntryHint: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted },
    actionsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
    dangerRow: { marginTop: SPACING.xs, marginBottom: SPACING.lg },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 44,
      borderRadius: RADIUS.lg,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
    },
    actionBtnText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.accent },
    sectionTitle: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
      marginBottom: SPACING.sm,
    },
    sectionGap: { marginTop: SPACING.lg },
    emptyRoster: { fontSize: TYPOGRAPHY.size.sm, color: C.textMuted, lineHeight: 19 },
    // Roster rows are standalone neu cards (spaced, not divided) — Onyx row standard.
    rosterList: { gap: SPACING.sm },
    rowCard: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: SPACING.md,
      borderRadius: RADIUS.lg,
      backgroundColor: C.background,
      gap: SPACING.sm,
    },
    rowMain: { flex: 1, gap: 2 },
    rowNameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    rowName: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary, flexShrink: 1 },
    claimedTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      borderRadius: RADIUS.full,
      backgroundColor: withAlpha(C.accent, 0.12),
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    claimedTagText: { fontSize: 10, color: C.accent, fontWeight: TYPOGRAPHY.weight.medium },
    rowShare: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted },
    statusChip: { borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
    statusChipText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.semibold },
    // Participant action modal
    amWrap: { padding: SPACING.lg, paddingTop: SPACING.sm, gap: SPACING.md },
    amHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    amHeaderMain: { flex: 1, gap: 2 },
    amName: { fontSize: TYPOGRAPHY.size.lg, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary, flexShrink: 1 },
    // Secondary actions — DebtTracking's debtIconRow/debtIconChip pattern.
    amChipRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm },
    amChip: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(C.textPrimary, 0.06),
    },
    amProofLoader: { marginVertical: SPACING.lg },
    teamBlock: { marginBottom: SPACING.md },
    teamHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.xs,
      paddingVertical: SPACING.xs,
    },
    teamHeaderName: { flex: 1, fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary },
    teamHeaderCount: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, fontWeight: TYPOGRAPHY.weight.semibold },
    teamEmpty: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, paddingHorizontal: SPACING.sm, paddingBottom: SPACING.xs },
    amTeamRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: SPACING.xs,
      marginBottom: SPACING.md,
    },
    teamChip: {
      borderRadius: RADIUS.full,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 6,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
    },
    teamChipActive: { backgroundColor: C.accent },
    teamChipFull: { opacity: 0.4 },
    teamChipText: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary, fontWeight: TYPOGRAPHY.weight.medium },
    teamChipTextActive: { color: C.onAccent, fontWeight: TYPOGRAPHY.weight.bold },
    renameWrap: { gap: SPACING.md },
    renameTitle: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary, textAlign: 'center' },
    renameInput: {
      minHeight: 46,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: C.inputBorder,
      paddingHorizontal: SPACING.md,
      color: C.textPrimary,
      fontSize: TYPOGRAPHY.size.sm,
    },
    amProofImage: { width: '100%', height: 220, borderRadius: RADIUS.lg, backgroundColor: '#FFFFFF' },
    amProofPdf: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 44,
      borderRadius: RADIUS.lg,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
    },
    amProofPdfText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.accent },
    proofWrap: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm, gap: SPACING.md, alignItems: 'stretch' },
    proofTitle: { fontSize: TYPOGRAPHY.size.lg, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary, textAlign: 'center' },
    proofLoader: { marginVertical: SPACING['3xl'] },
    proofImage: { width: '100%', height: 320, borderRadius: RADIUS.lg, backgroundColor: '#FFFFFF' },
    proofActions: { gap: SPACING.sm },
    rejectBtn: {
      minHeight: 44,
      borderRadius: RADIUS.lg,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
      alignItems: 'center',
      justifyContent: 'center',
    },
    rejectBtnText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.overdue },
    rejectBox: { gap: SPACING.sm },
    rejectTitle: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary },
    rejectInput: {
      minHeight: 72,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: C.inputBorder,
      backgroundColor: C.background,
      padding: SPACING.md,
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
      textAlignVertical: 'top',
    },
    hint: { fontSize: TYPOGRAPHY.size.sm, color: C.textMuted, textAlign: 'center' },
    // Request-payment sheet
    reqWrap: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm, gap: SPACING.sm, alignItems: 'stretch' },
    reqSubtitle: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary, textAlign: 'center' },
    reqLabel: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary, marginTop: SPACING.xs },
    reqInput: {
      minHeight: 180,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: C.inputBorder,
      backgroundColor: C.background,
      padding: SPACING.md,
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
      textAlignVertical: 'top',
      lineHeight: 22,
    },
    reqBtnRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
    reqCopyBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 48,
      borderRadius: RADIUS.lg,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
    },
    reqCopyText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.accent },
    reqWaBtn: {
      flex: 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 48,
      borderRadius: RADIUS.lg,
      backgroundColor: '#25D366',
    },
    reqWaText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: '#FFFFFF' },
  });

export default CollectzDetail;
