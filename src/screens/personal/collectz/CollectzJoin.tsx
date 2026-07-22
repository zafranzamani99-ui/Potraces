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
import { Feather } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../../constants';
import { useCalm } from '../../../hooks/useCalm';
import { useT } from '../../../i18n';
import { useToast } from '../../../context/ToastContext';
import { lightTap, mediumTap, successNotification, errorNotification } from '../../../services/haptics';
import { useNeu } from '../../../components/common/neu';
import FloatingModal from '../../../components/common/FloatingModal';
import PageScrollView from '../../../components/common/PageScrollView';
import NeuButton from '../../../components/common/NeuButton';
import { supabasePersonal } from '../../../services/supabase';
import { embedAmount } from '../../../services/emvQr';
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
  joinErrorMessage,
} from '../../../services/collectzService';
import { presetClubIcon } from '../../../constants/clubIcons';
import MapPreviewCard from '../../../components/collectz/MapPreviewCard';
import { fmtDateTime, fmtMoney, fill, teamLabel, SOCIAL_PLATFORMS } from './collectzFormat';

// Leave/unclaim is wired below, but the collectz-join edge function has no
// 'leave' action yet (its whitelist stops at view/claim/add_self/set_team/
// set_team_name, so a tap would 400 'unknown action'). Gated OFF until the
// server half ships — flip this once collectz-join handles action:'leave'.
const LEAVE_ENABLED = false;

const CollectzJoin: React.FC = () => {
  const C = useCalm();
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
  // Team rename: which team is being renamed, plus the draft label.
  const [renameTeamIdx, setRenameTeamIdx] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [selfName, setSelfName] = useState('');
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

  useEffect(() => {
    if (code) load();
    else if (!paramSessionId) setLoading(false);
  }, [code, paramSessionId, load]);

  // Live updates — refetch the join view on any roster/session change.
  const sessionId = view?.session?.id ?? null;
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

  // One roster line — shared by the flat list and every team block.
  const renderMember = (p: CollectzJoinView['participants'][number]) => (
    <View key={p.id} style={styles.row}>
      <Text style={styles.rowName} numberOfLines={1}>{p.name}</Text>
      {!!p.claimed && (
        <View style={styles.claimedTag}>
          <Feather name="user-check" size={11} color={C.accent} />
        </View>
      )}
      <View style={styles.rowRight}>
        {p.effective_share != null && (
          <Text style={styles.rowShare}>{fmtMoney(p.effective_share, currency)}</Text>
        )}
        <View style={[styles.statusChip, { backgroundColor: withAlpha(statusColor(p.status), 0.18) }]}>
          <Text style={[styles.statusChipText, { color: statusColor(p.status) }]}>{statusLabel(p.status)}</Text>
        </View>
      </View>
    </View>
  );

  const statusLabel = (status: CollectzParticipantStatus): string => {
    switch (status) {
      case 'confirmed': return t.collectz.statusConfirmed;
      case 'pending': return t.collectz.statusPending;
      case 'rejected': return t.collectz.statusRejected;
      default: return t.collectz.statusUnpaid;
    }
  };
  const statusColor = (status: CollectzParticipantStatus): string => {
    switch (status) {
      case 'confirmed': return C.accent;
      case 'pending': return C.gold;
      case 'rejected': return C.overdue;
      default: return C.neutral;
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

  // Confirm before binding — a claimed name locks to your account, so one
  // fat-fingered chip tap shouldn't make you someone else.
  const claim = (p: { id: string; name: string }) => {
    if (!code || busy) return;
    lightTap();
    Alert.alert(fill(t.collectz.claimConfirmTitle, { name: p.name }), t.collectz.claimConfirmBody, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.collectz.claimConfirmCta, onPress: () => doClaim(p.id) },
    ]);
  };

  const doClaim = async (participantId: string) => {
    if (!code || busy) return;
    setBusy(true);
    try {
      await claimParticipant(code, participantId);
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
    setBusy(true);
    try {
      await addSelf(code, name);
      setSelfName('');
      successNotification();
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

  const dateLine = fmtDateTime(session.event_at);
  const payByLine = session.pay_by ? fill(t.collectz.payByLine, { date: fmtDateTime(session.pay_by) ?? '' }) : null;
  const progress = view.progress;
  const pct =
    progress.target_amount && progress.target_amount > 0
      ? Math.min(progress.confirmed_amount / progress.target_amount, 1)
      : progress.active_count > 0
        ? progress.confirmed_count / progress.active_count
        : 0;

  return (
    <View style={styles.screen}>
      <PageScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
      {/* Event header */}
      <View style={[styles.headerCard, neu.raisedSoft]}>
        <View style={styles.titleRow}>
          {(() => {
            const preset = presetClubIcon(session.image_path);
            const uri = !preset && session.image_path ? clubImageUrl(session.image_path) : null;
            if (!preset && !uri) return null;
            // Preset emoji PNGs are square artwork — a circular crop clips the
            // corners. Square well + contain for presets; full-bleed cover for
            // uploaded club photos.
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
          <View style={[styles.progressFill, { width: `${Math.round(pct * 100)}%` }]} />
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
          {maxParticipants != null && (
            <Text style={styles.myHint}>
              {fill(t.collectz.capacityCount, { n: activeCount, max: maxParticipants })}
            </Text>
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
        </View>
      )}

      {my && (
        <View style={[styles.myCard, neu.raisedSoft]}>
          <View style={styles.joinedRow}>
            <Feather name="user-check" size={14} color={C.accent} />
            <Text style={styles.joinedText}>{fill(t.collectz.joinedAs, { name: my.name })}</Text>
            <View style={[styles.statusChip, { backgroundColor: withAlpha(statusColor(my.status), 0.18) }]}>
              <Text style={[styles.statusChipText, { color: statusColor(my.status) }]}>{statusLabel(my.status)}</Text>
            </View>
          </View>

          {my.slot === 'reserve' ? (
            <Text style={styles.myHint}>{t.collectz.reserveNote}</Text>
          ) : (
            <>
              {(my.status === 'unpaid' || my.status === 'rejected') && isOpen && (
                <>
                  {my.status === 'rejected' && (
                    <Text style={styles.rejectedNote}>
                      {myRejectNote ? fill(t.collectz.rejectedNote, { note: myRejectNote }) : t.collectz.rejectedPlain}
                    </Text>
                  )}
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
                      <NeuButton icon="image" label={t.collectz.uploadImage} onPress={pickImage} style={[styles.uploadBtn, styles.uploadBtnNeu]} />
                      <Pressable style={({ pressed }) => [styles.secondaryBtn, styles.uploadBtn, pressed && { opacity: 0.85 }]} onPress={pickPdf}>
                        <Feather name="file-text" size={15} color={C.accent} />
                        <Text style={styles.secondaryBtnText}>{t.collectz.uploadPdf}</Text>
                      </Pressable>
                    </View>
                  )}
                </>
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
                  {/* Any roster member may rename the team — it's just a label. */}
                  {!!my && (
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
                      if I'm actually playing (reserves hold no team slot). */}
                  {!!my && my.slot === 'active' && isOpen && !here && (
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
                {!!my && my.slot === 'active' && isOpen && myTeam != null && (
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

      {/* Team rename — any roster member can retitle a team ("Reds", not "Team 1"). */}
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
    clubEmoji: { fontSize: 32 },
    clubImagePhoto: { width: 52, height: 52 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    meta: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary },
    // organizer contact chips — WhatsApp green stays FLAT per the Onyx exemptions
    contactChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginTop: 2 },
    waChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#25D366', borderRadius: RADIUS.full, paddingVertical: 8, paddingHorizontal: 14 },
    waChipText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: '#FFFFFF' },
    socialChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: withAlpha(C.textPrimary, 0.03), borderRadius: RADIUS.full, paddingVertical: 8, paddingHorizontal: 14 },
    socialChipText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.medium, color: C.textSecondary },
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
    fullHint: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.bronze,
      fontWeight: TYPOGRAPHY.weight.semibold,
      marginTop: SPACING.xs,
    },
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
    shareLabel: { fontSize: TYPOGRAPHY.size.sm, color: C.textMuted, marginTop: SPACING.xs },
    shareAmount: { fontSize: 36, lineHeight: 42, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary },
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
    uploadBtnNeu: { minHeight: 48, paddingVertical: SPACING.sm },
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
    statusChip: { borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
    statusChipText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.semibold },
  });

export default CollectzJoin;
