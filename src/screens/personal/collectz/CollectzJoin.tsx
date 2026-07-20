// CollectzJoin — participant event page. Reached from the shared link/code
// (or from CollectzHome with just a sessionId). Public event facts + live
// roster for everyone; signed-in participants get the claim / pay / proof
// flow on top. Realtime refetch keeps statuses live.
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
  useWindowDimensions,
} from 'react-native';
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
} from '../../../services/collectzService';
import { fmtDateTime, fmtMoney, fill } from './collectzFormat';

const CollectzJoin: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
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
  const [busy, setBusy] = useState(false);
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
    } catch {
      setFailed(true);
      showToast(t.collectz.joinOpenError, 'error');
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

  const claim = async (participantId: string) => {
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
        showToast(t.collectz.claimError, 'error');
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
        showToast(t.collectz.addSelfError, 'error');
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
    lightTap();
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
            placeholderTextColor={C.textMuted}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={submitCode}
          />
          <Pressable style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]} onPress={submitCode}>
            <Text style={styles.primaryBtnText}>{t.collectz.joinOpen}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (failed || !view || !session) {
    return (
      <View style={styles.loaderWrap}>
        <Feather name="alert-circle" size={32} color={C.textMuted} />
        <Text style={styles.loaderText}>{t.collectz.joinOpenError}</Text>
        {!!code && (
          <Pressable style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.85 }]} onPress={() => { setLoading(true); load(); }}>
            <Text style={styles.primaryBtnText}>{t.common.retry}</Text>
          </Pressable>
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
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Event header */}
      <View style={styles.headerCard}>
        <Text style={styles.title}>{session.title}</Text>
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
      <View style={styles.progressCard}>
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
        <View style={styles.textCard}>
          <Text style={styles.textCardTitle}>{t.collectz.eventDetails}</Text>
          <Text style={styles.textCardBody}>{session.details_text}</Text>
        </View>
      )}
      {!!session.rules_text && (
        <View style={styles.textCard}>
          <Text style={styles.textCardTitle}>{t.collectz.rulesSection}</Text>
          <Text style={styles.textCardBody}>{session.rules_text}</Text>
        </View>
      )}

      {/* ── My area: claim / pay / status ── */}
      {!my && isOpen && (
        <View style={styles.myCard}>
          <Text style={styles.myTitle}>{t.collectz.claimTitle}</Text>
          {claimable.length > 0 ? (
            <>
              <Text style={styles.myHint}>{t.collectz.claimHint}</Text>
              <View style={styles.claimGrid}>
                {claimable.map((p) => (
                  <Pressable
                    key={p.id}
                    style={({ pressed }) => [styles.claimChip, pressed && { opacity: 0.85 }]}
                    onPress={() => claim(p.id)}
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
          <View style={styles.addSelfRow}>
            <TextInput
              style={styles.addSelfInput}
              value={selfName}
              onChangeText={setSelfName}
              placeholder={t.collectz.addSelfPlaceholder}
              placeholderTextColor={C.textMuted}
              returnKeyType="done"
              onSubmitEditing={addMyself}
            />
            <Pressable
              style={({ pressed }) => [styles.addSelfBtn, (pressed || busy) && { opacity: 0.85 }]}
              onPress={addMyself}
              disabled={busy}
            >
              <Text style={styles.addSelfBtnText}>{t.collectz.addSelf}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {my && (
        <View style={styles.myCard}>
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
                      <Pressable style={({ pressed }) => [styles.primaryBtn, styles.uploadBtn, pressed && { opacity: 0.85 }]} onPress={pickImage}>
                        <Feather name="image" size={15} color={C.onAccent} />
                        <Text style={styles.primaryBtnText}>{t.collectz.uploadImage}</Text>
                      </Pressable>
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
                  <ActivityIndicator size="small" color={C.gold} />
                  <Text style={styles.stateTitle}>{t.collectz.pendingTitle}</Text>
                  <Text style={styles.myHint}>{t.collectz.pendingBody}</Text>
                  {isOpen && (
                    <Pressable style={({ pressed }) => [styles.secondaryBtn, pressed && { opacity: 0.85 }]} onPress={withdraw} disabled={busy}>
                      <Text style={styles.secondaryBtnText}>{t.collectz.withdraw}</Text>
                    </Pressable>
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
        </View>
      )}

      {/* Roster */}
      <Text style={styles.sectionTitle}>{t.collectz.roster}</Text>
      <View style={styles.listCard}>
        {actives.map((p) => (
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
        ))}
      </View>

      {reserves.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, styles.sectionGap]}>{t.collectz.waitingList}</Text>
          <View style={styles.listCard}>
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
        </>
      )}
    </ScrollView>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.background },
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
      backgroundColor: C.surface,
      paddingHorizontal: SPACING.md,
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
      letterSpacing: 1,
    },
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
    textCard: {
      backgroundColor: C.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: withAlpha(C.border, 0.6),
      padding: SPACING.md,
      gap: 4,
      marginBottom: SPACING.md,
    },
    textCardTitle: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary },
    textCardBody: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary, lineHeight: 20 },
    myCard: {
      backgroundColor: C.surface,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: withAlpha(C.accent, 0.5),
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
      backgroundColor: C.pillBg,
      alignItems: 'center',
    },
    claimChipText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary },
    claimChipSub: { fontSize: 10, color: C.bronze },
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
      minHeight: 44,
      paddingHorizontal: SPACING.md,
      borderRadius: RADIUS.lg,
      backgroundColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addSelfBtnText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.bold, color: C.onAccent },
    joinedRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, alignSelf: 'stretch' },
    joinedText: { flex: 1, fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary },
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
    uploadBtn: { flex: 1, flexDirection: 'row', gap: 6 },
    uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, minHeight: 50 },
    primaryBtn: {
      minHeight: 48,
      borderRadius: RADIUS.lg,
      backgroundColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.bold, color: C.onAccent },
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
