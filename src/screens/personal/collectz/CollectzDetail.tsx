// CollectzDetail — organizer console for one session. Live roster via
// realtime (subscribeToSession), progress rollup, share/remind/settle actions,
// and the proof-review flow (view → confirm / reject with a note).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Share,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../../constants';
import { useCalm } from '../../../hooks/useCalm';
import { useT } from '../../../i18n';
import { useToast } from '../../../context/ToastContext';
import BottomSheet from '../../../components/common/BottomSheet';
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
  fetchRosterProfiles,
  deleteSession,
  cancelSession,
  regenerateShareCode,
  duplicateSession,
  notifySession,
  clubImageUrl,
  type CollectzProfile,
} from '../../../services/collectzService';
import { AvatarView } from '../../../components/common/Avatar';
import MapPreviewCard from '../../../components/collectz/MapPreviewCard';
import { presetClubIcon } from '../../../constants/clubIcons';
import { fmtDateTime, fmtMoney, fill } from './collectzFormat';

const CollectzDetail: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
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

  useFocusEffect(
    useCallback(() => {
      load(true);
    }, [load],
    ),
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

  const sendReminders = () =>
    run(async () => {
      const sent = await remindUnpaid(sessionId);
      showToast(fill(t.collectz.remindSent, { count: sent }), 'success');
    });

  const settle = () => {
    Alert.alert(t.collectz.settleTitle, t.collectz.settleBody, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.collectz.actionSettle,
        onPress: () =>
          run(async () => {
            await updateSession(sessionId, { status: 'settled' });
            notifySession(sessionId, 'settled').catch(() => {}); // best-effort
          }, t.collectz.settledToast),
      },
    ]);
  };

  const reopen = () => run(() => updateSession(sessionId, { status: 'open' }), t.collectz.reopenedToast);

  // ── v2 session-level actions ──
  const edit = () => {
    lightTap();
    navigation.navigate('CollectzCreate', { editSessionId: sessionId });
  };

  const duplicate = () =>
    run(async () => {
      const created = await duplicateSession(sessionId);
      navigation.replace('CollectzDetail', { sessionId: created.id });
    }, t.collectz.duplicateDone);

  const regenLink = () => {
    Alert.alert(t.collectz.regenTitle, t.collectz.regenBody, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.collectz.actionRegenLink,
        onPress: () => run(async () => { await regenerateShareCode(sessionId); }, t.collectz.regenDone),
      },
    ]);
  };

  const cancelSess = () => {
    Alert.alert(t.collectz.cancelTitle, t.collectz.cancelBody, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.collectz.actionCancel,
        style: 'destructive',
        onPress: () =>
          run(async () => {
            await cancelSession(sessionId);
            notifySession(sessionId, 'cancelled').catch(() => {});
          }, t.collectz.cancelledToast),
      },
    ]);
  };

  const deleteSess = () => {
    const anyPaid = participants.some((p) => p.status === 'pending' || p.status === 'confirmed');
    Alert.alert(t.collectz.deleteTitle, anyPaid ? t.collectz.deleteBodyPaid : t.collectz.deleteBody, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: t.common.delete,
        style: 'destructive',
        onPress: async () => {
          // Notify FIRST (the join link dies with the row), then delete + leave.
          setBusy(true);
          try {
            await notifySession(sessionId, 'cancelled').catch(() => {});
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
      },
    ]);
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

  const undoConfirm = (p: CollectzParticipant) => {
    Alert.alert(t.collectz.actionUndo, p.name, [
      { text: t.common.cancel, style: 'cancel' },
      { text: t.collectz.actionUndo, onPress: () => run(() => resetParticipantToUnpaid(p.id), fill(t.collectz.undoToast, { name: p.name })) },
    ]);
  };

  const promote = (p: CollectzParticipant) =>
    run(() => updateParticipant(p.id, { slot: 'active' }), fill(t.collectz.promotedToast, { name: p.name }));

  const remove = (p: CollectzParticipant) => {
    const paid = p.status === 'pending' || p.status === 'confirmed';
    Alert.alert(
      paid ? fill(t.collectz.removePaidTitle, { name: p.name }) : fill(t.collectz.removeTitle, { name: p.name }),
      paid ? t.collectz.removePaidBody : t.collectz.removeBody,
      [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.common.delete, style: 'destructive', onPress: () => run(() => removeParticipant(p.id), fill(t.collectz.removedToast, { name: p.name })) },
      ],
    );
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

  const renderRow = (p: CollectzParticipant) => {
    const share = p.slot === 'reserve' ? null : shares.get(p.id);
    const color = statusColor(p.status);
    return (
      <Pressable
        key={p.id}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.9 }]}
        onPress={() => (p.status === 'pending' ? openProof(p) : undefined)}
        onLongPress={() => remove(p)}
        accessibilityRole="button"
        accessibilityLabel={p.name}
      >
        <View style={styles.rowMain}>
          <View style={styles.rowNameLine}>
            <AvatarView
              size={28}
              uri={p.user_id ? profiles[p.user_id]?.avatar_uri : null}
              presetId={p.user_id ? profiles[p.user_id]?.avatar_id : null}
              name={p.name}
            />
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

        <View style={styles.rowRight}>
          <View style={[styles.statusChip, { backgroundColor: withAlpha(color, 0.18) }]}>
            <Text style={[styles.statusChipText, { color }]}>{statusLabel(p.status)}</Text>
          </View>
          {p.status === 'pending' && (
            <Text style={styles.rowAction}>{t.collectz.viewProof}</Text>
          )}
          {p.status === 'confirmed' && (
            <Pressable onPress={() => undoConfirm(p)} hitSlop={6}>
              <Text style={styles.rowAction}>{t.collectz.actionUndo}</Text>
            </Pressable>
          )}
          {(p.status === 'unpaid' || p.status === 'rejected') && isOpen && (
            <Pressable onPress={() => manualConfirm(p)} hitSlop={6}>
              <Text style={styles.rowAction}>{t.collectz.actionMarkPaid}</Text>
            </Pressable>
          )}
          {p.slot === 'reserve' && isOpen && (
            <Pressable onPress={() => promote(p)} hitSlop={6}>
              <Text style={styles.rowAction}>{t.collectz.actionPromote}</Text>
            </Pressable>
          )}
        </View>
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
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header card */}
        <View style={styles.headerCard}>
          <View style={styles.titleRow}>
            {(() => {
              const preset = presetClubIcon(session.image_path);
              const uri = !preset && session.image_path ? clubImageUrl(session.image_path) : null;
              return preset || uri ? (
                <Image source={preset ? preset.source : { uri: uri! }} style={styles.clubImage} />
              ) : null;
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
          <View style={styles.metaRow}>
            <Feather name="link" size={13} color={C.textMuted} />
            <Text style={styles.meta}>{fill(t.collectz.shareCodeLabel, { code: session.share_code })}</Text>
          </View>
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
          <View style={styles.progressCard}>
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

        {/* Actions */}
        <View style={styles.actionsRow}>
          <Pressable style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.85 }]} onPress={shareAnnouncement}>
            <Feather name="share-2" size={15} color={C.accent} />
            <Text style={styles.actionBtnText}>{t.collectz.actionShare}</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.85 }]} onPress={sendReminders} disabled={busy}>
            <Feather name="bell" size={15} color={C.accent} />
            <Text style={styles.actionBtnText}>{t.collectz.actionRemind}</Text>
          </Pressable>
          {isOpen ? (
            <Pressable style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.85 }]} onPress={settle} disabled={busy}>
              <Feather name="check-circle" size={15} color={C.bronze} />
              <Text style={[styles.actionBtnText, { color: C.bronze }]}>{t.collectz.actionSettle}</Text>
            </Pressable>
          ) : (
            <Pressable style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.85 }]} onPress={reopen} disabled={busy}>
              <Feather name="rotate-ccw" size={15} color={C.accent} />
              <Text style={styles.actionBtnText}>{t.collectz.actionReopen}</Text>
            </Pressable>
          )}
        </View>

        {/* v2 actions: edit / duplicate / new link / cancel / delete */}
        <View style={styles.actionsRow}>
          <Pressable style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.85 }]} onPress={edit} disabled={busy}>
            <Feather name="edit-2" size={15} color={C.accent} />
            <Text style={styles.actionBtnText}>{t.collectz.actionEdit}</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.85 }]} onPress={duplicate} disabled={busy}>
            <Feather name="copy" size={15} color={C.accent} />
            <Text style={styles.actionBtnText}>{t.collectz.actionDuplicate}</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.85 }]} onPress={regenLink} disabled={busy}>
            <Feather name="refresh-cw" size={15} color={C.accent} />
            <Text style={styles.actionBtnText}>{t.collectz.actionRegenLink}</Text>
          </Pressable>
          {isOpen && (
            <Pressable style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.85 }]} onPress={cancelSess} disabled={busy}>
              <Feather name="x-circle" size={15} color={C.overdue} />
              <Text style={[styles.actionBtnText, { color: C.overdue }]}>{t.collectz.actionCancel}</Text>
            </Pressable>
          )}
          <Pressable style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.85 }]} onPress={deleteSess} disabled={busy}>
            <Feather name="trash-2" size={15} color={C.overdue} />
            <Text style={[styles.actionBtnText, { color: C.overdue }]}>{t.collectz.actionDelete}</Text>
          </Pressable>
        </View>

        {/* Roster */}
        <Text style={styles.sectionTitle}>{t.collectz.roster}</Text>
        {actives.length === 0 && reserves.length === 0 ? (
          <Text style={styles.emptyRoster}>{t.collectz.emptyRoster}</Text>
        ) : (
          <View style={styles.listCard}>{actives.map(renderRow)}</View>
        )}

        {reserves.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, styles.sectionGap]}>{t.collectz.waitingList}</Text>
            <View style={styles.listCard}>{reserves.map(renderRow)}</View>
          </>
        )}
      </ScrollView>

      {/* Proof review sheet */}
      <BottomSheet visible={!!proofFor} onClose={closeProof} maxHeightPct={0.85} closeLabel={t.common.close}>
        {proofFor && (
          <View style={styles.proofWrap}>
            <Text style={styles.proofTitle}>{fill(t.collectz.proofTitle, { name: proofFor.name })}</Text>
            {proofLoading ? (
              <ActivityIndicator size="large" color={C.accent} style={styles.proofLoader} />
            ) : proofUrl ? (
              proofIsPdf ? (
                <Pressable
                  style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
                  onPress={() => Linking.openURL(proofUrl).catch(() => showToast(t.collectz.proofError, 'error'))}
                >
                  <Feather name="file-text" size={16} color={C.onAccent} />
                  <Text style={styles.primaryBtnText}>{t.collectz.proofOpenPdf}</Text>
                </Pressable>
              ) : (
                <Image source={{ uri: proofUrl }} style={styles.proofImage} resizeMode="contain" />
              )
            ) : (
              <Text style={styles.hint}>{t.collectz.proofError}</Text>
            )}

            {proofFor.status === 'pending' && !rejectMode && (
              <View style={styles.proofActions}>
                <Pressable
                  style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]}
                  onPress={confirmFromSheet}
                  disabled={busy}
                >
                  <Text style={styles.primaryBtnText}>{t.collectz.actionConfirm}</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.rejectBtn, pressed && { opacity: 0.85 }]}
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
                  placeholderTextColor={C.textMuted}
                  multiline
                />
                <Pressable
                  style={({ pressed }) => [styles.rejectBtn, pressed && { opacity: 0.85 }]}
                  onPress={rejectFromSheet}
                  disabled={busy}
                >
                  <Text style={styles.rejectBtnText}>{t.collectz.actionReject}</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </BottomSheet>
    </View>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.background },
    content: { padding: SPACING.xl, paddingBottom: SPACING['5xl'] },
    loaderWrap: { flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' },
    headerCard: {
      backgroundColor: C.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: withAlpha(C.border, 0.6),
      padding: SPACING.md,
      gap: 6,
      marginBottom: SPACING.md,
    },
    title: { fontSize: TYPOGRAPHY.size.xl, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    clubImage: { width: 44, height: 44, borderRadius: 22 },
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
      backgroundColor: C.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: withAlpha(C.border, 0.6),
      padding: SPACING.md,
      gap: SPACING.sm,
      marginBottom: SPACING.md,
    },
    progressTrack: { height: 8, borderRadius: RADIUS.full, backgroundColor: C.pillBg, overflow: 'hidden' },
    progressFill: { height: 8, borderRadius: RADIUS.full, backgroundColor: C.accent },
    progressText: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary },
    actionsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.lg },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 44,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: withAlpha(C.accent, 0.5),
      backgroundColor: C.surface,
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
    listCard: {
      backgroundColor: C.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: withAlpha(C.border, 0.6),
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
    rowRight: { alignItems: 'flex-end', gap: 6 },
    statusChip: { borderRadius: RADIUS.full, paddingHorizontal: SPACING.sm, paddingVertical: 3 },
    statusChipText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.semibold },
    rowAction: { fontSize: TYPOGRAPHY.size.xs, fontWeight: TYPOGRAPHY.weight.semibold, color: C.accent },
    proofWrap: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.sm, gap: SPACING.md, alignItems: 'stretch' },
    proofTitle: { fontSize: TYPOGRAPHY.size.lg, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary, textAlign: 'center' },
    proofLoader: { marginVertical: SPACING['3xl'] },
    proofImage: { width: '100%', height: 320, borderRadius: RADIUS.lg, backgroundColor: '#FFFFFF' },
    proofActions: { gap: SPACING.sm },
    primaryBtn: {
      minHeight: 50,
      borderRadius: RADIUS.lg,
      backgroundColor: C.accent,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
    },
    primaryBtnText: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.bold, color: C.onAccent },
    rejectBtn: {
      minHeight: 44,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: C.overdue,
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
  });

export default CollectzDetail;
