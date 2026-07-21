// CollectzCreate — organizer setup form. Everything for a session in one
// scroll: event facts, payment scheme, roster editor, QR picker (scanned payload
// → exact-amount QR; photo-only QR → the picture is uploaded for participants),
// and the "paste WhatsApp announcement" AI prefill. On save it creates the
// session + roster rows, opens the detail screen, and fires the share sheet.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Platform,
  BackHandler,
  Share,
  Image,
  useWindowDimensions,
} from 'react-native';
// Renders into a UIWindow ABOVE the whole app — including the native-stack
// header and status bar — so the picker's dim backdrop covers them too. An
// in-screen absoluteFill can only ever cover the screen's content view, since
// react-navigation renders the header as a separate native view outside it.
import { FullWindowOverlay } from 'react-native-screens';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardAvoidingView as KAView } from 'react-native-keyboard-controller';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../../constants';
import { useCalm, useIsDark } from '../../../hooks/useCalm';
import { useKeyboardVisible } from '../../../hooks/useKeyboardVisible';
import { useT } from '../../../i18n';
import { useToast } from '../../../context/ToastContext';
import { useSettingsStore, type PaymentQr } from '../../../store/settingsStore';
import { lightTap, mediumTap, selectionChanged, successNotification, errorNotification } from '../../../services/haptics';
import {
  CollectzScheme,
  CollectzSlot,
  CollectzSession,
  CollectzParticipant,
  createSession,
  addParticipant,
  updateParticipant,
  removeParticipant,
  updateSession,
  getSessionWithRoster,
  uploadClubImage,
  uploadQrImage,
  buildWhatsappAnnouncement,
  notifySession,
} from '../../../services/collectzService';
import { parseCollectzAnnouncement } from '../../../services/collectzParser';
import { clubIconsForCategory, presetClubIcon, CLUB_PRESET_PREFIX } from '../../../constants/clubIcons';
import { isMapsLink } from '../../../utils/mapLink';
import MapPreviewCard from '../../../components/collectz/MapPreviewCard';
import { useNeu } from '../../../components/common/neu';
import PageScrollView from '../../../components/common/PageScrollView';
import NeuButton from '../../../components/common/NeuButton';
import NeuIconButton from '../../../components/common/NeuIconButton';
import KeyboardDoneFab from '../../../components/common/KeyboardDoneFab';
import CalendarPicker from '../../../components/common/CalendarPicker';
import { fmtDate, fmtTime, fill, teamLabel } from './collectzFormat';

type CategoryKey = 'sport' | 'makan' | 'trip' | 'gift' | 'other';
const CATEGORIES: CategoryKey[] = ['sport', 'makan', 'trip', 'gift', 'other'];

interface RosterRow {
  key: string;
  /** Set for rows loaded from the DB in edit mode — updates, not inserts. */
  id?: string;
  name: string;
  slot: CollectzSlot;
  amount: string;
  /** 1-based team (teams capacity mode only); null = not assigned yet. */
  team: number | null;
}

/** Loose money parse — accepts "45", "RM45.50", "45,50". */
function parseAmount(raw: string): number | null {
  const n = parseFloat(raw.replace(/,/g, '.').replace(/[^0-9.]/g, ''));
  return isNaN(n) || n <= 0 ? null : n;
}

const CollectzCreate: React.FC = () => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  // Explicit size for the FullWindowOverlay child — its native view doesn't
  // give absoluteFill a box to resolve against, so the backdrop would collapse.
  const { width: winW, height: winH } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(C), [C]);
  const neuF = useNeu(undefined, { faintDark: true });
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { showToast } = useToast();
  const appCurrency = useSettingsStore((s) => s.currency);
  const paymentQrs = useSettingsStore((s) => s.paymentQrs);

  // Modes: blank create · edit existing (editSessionId) · template (templateFrom = duplicate-from-previous)
  const editSessionId: string | undefined = route.params?.editSessionId;
  const templateFrom: string | undefined = route.params?.templateFrom;
  const isEdit = !!editSessionId;

  // ── Form state ──
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<CategoryKey | null>(null);
  const [eventAt, setEventAt] = useState<Date | null>(null);
  const [venue, setVenue] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  const [details, setDetails] = useState('');
  const [scheme, setScheme] = useState<CollectzScheme>('flat');
  const [shareAmount, setShareAmount] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [payBy, setPayBy] = useState<Date | null>(null);
  const [rules, setRules] = useState('');
  const [roster, setRoster] = useState<RosterRow[]>([]);
  // Capacity — caps the ACTIVE roster. 'none' = no limit, 'total' = a plain max,
  // 'teams' = N teams × M per team (max = N × M). Joining is blocked at max.
  const [capMode, setCapMode] = useState<'none' | 'total' | 'teams'>('none');
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [teamCount, setTeamCount] = useState(2);
  // Editable team labels, index-aligned with teamCount. '' = fall back to "Team 1".
  const [teamNames, setTeamNames] = useState<string[]>([]);
  const [teamSize, setTeamSize] = useState(5);
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [qrLabel, setQrLabel] = useState<string | null>(null);
  // Photo-only QR (no decoded DuitNow payload): the picture is uploaded and shown
  // to participants, who scan it and type the amount themselves.
  const [qrImageUri, setQrImageUri] = useState<string | null>(null); // local, pending upload
  const [qrImagePath, setQrImagePath] = useState<string | null>(null); // already stored (edit)
  const [currency, setCurrency] = useState(appCurrency);
  const [saving, setSaving] = useState(false);

  // v2: club image + edit/template bookkeeping
  const [imagePreset, setImagePreset] = useState<string | null>(null); // CLUB_ICONS id
  const [imageUpload, setImageUpload] = useState<{ uri: string; mimeType?: string } | null>(null);
  const [oldImagePath, setOldImagePath] = useState<string | null>(null); // DB value on load (edit/template)
  const [removedIds, setRemovedIds] = useState<string[]>([]); // edit-mode roster deletions
  const [notifyChanges, setNotifyChanges] = useState(true);
  const [templateTitle, setTemplateTitle] = useState<string | null>(null);
  const [prefilling, setPrefilling] = useState(isEdit || !!templateFrom);
  const original = useRef<CollectzSession | null>(null); // change detection for edit-notify

  // ── Paste-parse modal ──
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [parsing, setParsing] = useState(false);

  // ── Date/time picker ──
  const [picker, setPicker] = useState<{ field: 'event' | 'payBy'; mode: 'date' | 'time' } | null>(null);

  // ── Note fields (details / rules) — gold keyboard-done FAB while focused ──
  const [multilineFocused, setMultilineFocused] = useState(false);
  const { keyboardVisible, keyboardHeight } = useKeyboardVisible(() => setMultilineFocused(false));

  // Android back button: the picker + paste layers are IN-SCREEN overlays, not RN
  // <Modal>s, so Android's back gesture would pop this whole screen and throw away
  // everything typed. Intercept it while an overlay is open and just close that.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!picker && !pasteOpen) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pasteOpen) { setPasteOpen(false); return true; }
      if (picker) { setPicker(null); return true; }
      return false;
    });
    return () => sub.remove();
  }, [picker, pasteOpen]);

  const keySeq = useRef(0);
  const nextKey = () => `row-${++keySeq.current}`;

  // Prefill for edit / template. Template shifts dates +7d and starts as a NEW session.
  useEffect(() => {
    const sourceId = editSessionId ?? templateFrom;
    if (!sourceId) return;
    let alive = true;
    getSessionWithRoster(sourceId)
      .then(({ session: s, participants }) => {
        if (!alive) return;
        const shift = (iso: string | null) =>
          iso ? new Date(new Date(iso).getTime() + 7 * 86_400_000) : null;
        const toDate = (iso: string | null) => {
          if (!iso) return null;
          const d = new Date(iso);
          return isNaN(d.getTime()) ? null : d;
        };
        const ev = toDate(s.event_at);
        const pb = toDate(s.pay_by);
        original.current = isEdit ? s : null;
        setTitle(s.title);
        setCategory((s.category as CategoryKey | null) ?? null);
        setEventAt(isEdit ? ev : (ev ? shift(s.event_at) : null));
        setVenue(s.venue ?? '');
        setMapsUrl(s.maps_url ?? '');
        setDetails(s.details_text ?? '');
        setScheme(s.scheme);
        setShareAmount(s.default_share != null ? String(s.default_share) : '');
        setTotalAmount(s.total_amount != null ? String(s.total_amount) : '');
        setPayBy(isEdit ? pb : (pb ? shift(s.pay_by) : null));
        setRules(s.rules_text ?? '');
        setCurrency(s.currency || appCurrency);
        setQrPayload(s.qr_payload ?? null);
        setQrLabel(null);
        setQrImagePath(s.qr_image_path ?? null);
        setQrImageUri(null);
        // Capacity: teams win (they imply the max), else a plain max, else no limit.
        if (s.team_count != null && s.team_size != null) {
          setCapMode('teams');
          setTeamNames(Array.isArray(s.team_names) ? s.team_names : []);
          setTeamCount(s.team_count);
          setTeamSize(s.team_size);
        } else if (s.max_participants != null) {
          setCapMode('total');
          setMaxPlayers(s.max_participants);
        } else {
          setCapMode('none');
        }
        const preset = presetClubIcon(s.image_path);
        setImagePreset(preset ? preset.id : null);
        setOldImagePath(preset ? null : (s.image_path ?? null));
        setRoster(
          participants.map((p) => ({
            key: nextKey(),
            id: isEdit ? p.id : undefined,
            name: p.name,
            slot: p.slot,
            amount: p.share_amount != null ? String(p.share_amount) : '',
            team: p.team_idx ?? null,
          })),
        );
        if (templateFrom) setTemplateTitle(s.title);
      })
      .catch(() => showToast(t.collectz.createError, 'error'))
      .finally(() => { if (alive) setPrefilling(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSessionId, templateFrom]);

  const catLabels: Record<CategoryKey, string> = {
    sport: t.collectz.catSport,
    makan: t.collectz.catMakan,
    trip: t.collectz.catTrip,
    gift: t.collectz.catGift,
    other: t.collectz.catOther,
  };
  const schemeLabels: Record<CollectzScheme, string> = {
    flat: t.collectz.schemeFlat,
    equal: t.collectz.schemeEqual,
    custom: t.collectz.schemeCustom,
  };

  // Effective cap (null = no limit) + how many active names are filled. Drives the
  // "x of y spots" counter and locks "Add name" once the roster is full.
  const capacityMax =
    capMode === 'total' ? maxPlayers : capMode === 'teams' ? teamCount * teamSize : null;
  const activeFilled = roster.filter((r) => r.name.trim() && r.slot === 'active').length;
  const rosterFull = capacityMax != null && activeFilled >= capacityMax;
  // How many ACTIVE players sit in each team (1-based index -> count). Reserves
  // hold no team slot, so they never fill one up.
  const teamFill = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const r of roster) {
      if (r.slot !== 'active' || r.team == null) continue;
      counts[r.team] = (counts[r.team] ?? 0) + 1;
    }
    return counts;
  }, [roster]);

  // Drop assignments that stopped being valid — the organizer shrank the team
  // count, switched capacity mode away from teams, or benched someone. Without
  // this a hidden team_idx would silently save and confuse the participant view.
  useEffect(() => {
    setRoster((rows) => {
      let changed = false;
      const next = rows.map((r) => {
        const invalid =
          r.team != null && (capMode !== 'teams' || r.team > teamCount);
        if (!invalid) return r;
        changed = true;
        return { ...r, team: null };
      });
      return changed ? next : rows;
    });
  }, [capMode, teamCount]);

  // ── Date/time picking ──
  const pickerValue = picker ? (picker.field === 'event' ? eventAt : payBy) ?? new Date() : new Date();

  const applyPicked = (date: Date) => {
    if (!picker) return;
    const current = picker.field === 'event' ? eventAt : payBy;
    const next = current ? new Date(current) : new Date();
    if (picker.mode === 'date') next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    else next.setHours(date.getHours(), date.getMinutes(), 0, 0);
    if (picker.field === 'event') setEventAt(next);
    else setPayBy(next);
  };

  const onPickerChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setPicker(null);
    if (event.type === 'dismissed' || !date) return;
    applyPicked(date);
  };

  const renderWhenRow = (
    label: string,
    value: Date | null,
    field: 'event' | 'payBy',
    onClear?: () => void,
  ) => (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.whenRow}>
        <Pressable style={styles.whenBtn} onPress={() => { selectionChanged(); setPicker({ field, mode: 'date' }); }}>
          <Feather name="calendar" size={15} color={C.textSecondary} />
          <Text style={[styles.whenText, !value && styles.whenTextDim]}>
            {value ? fmtDate(value.toISOString()) : t.collectz.pickDate}
          </Text>
        </Pressable>
        <Pressable style={styles.whenBtn} onPress={() => { selectionChanged(); setPicker({ field, mode: 'time' }); }}>
          <Feather name="clock" size={15} color={C.textSecondary} />
          <Text style={[styles.whenText, !value && styles.whenTextDim]}>
            {value ? fmtTime(value.toISOString()) : t.collectz.pickTime}
          </Text>
        </Pressable>
        {value && onClear && (
          <Pressable onPress={onClear} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.common.clear}>
            <Feather name="x-circle" size={18} color={C.textMuted} />
          </Pressable>
        )}
      </View>
    </View>
  );

  // ── Capacity stepper (− value +) ──
  const renderStepper = (
    label: string,
    value: number,
    setValue: (n: number) => void,
    min = 1,
    max = 99,
  ) => (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable
          style={({ pressed }) => [styles.stepperBtn, neuF.raised, pressed && { opacity: 0.85 }]}
          onPress={() => { selectionChanged(); setValue(Math.max(min, value - 1)); }}
          disabled={value <= min}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`${label} −`}
        >
          <Feather name="minus" size={16} color={value <= min ? C.textMuted : C.accent} />
        </Pressable>
        <Text style={styles.stepperValue}>{value}</Text>
        <Pressable
          style={({ pressed }) => [styles.stepperBtn, neuF.raised, pressed && { opacity: 0.85 }]}
          onPress={() => { selectionChanged(); setValue(Math.min(max, value + 1)); }}
          disabled={value >= max}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`${label} +`}
        >
          <Feather name="plus" size={16} color={value >= max ? C.textMuted : C.accent} />
        </Pressable>
      </View>
    </View>
  );

  // ── Roster editor ──
  const addRow = () => {
    lightTap();
    setRoster((rows) => [...rows, { key: nextKey(), name: '', slot: 'active', amount: '', team: null }]);
  };
  // Only send labels the organizer actually typed; an all-blank array is just null.
  const teamNamesPayload = () => {
    if (capMode !== 'teams') return null;
    const trimmed = Array.from({ length: teamCount }, (_, i) => (teamNames[i] ?? '').trim());
    return trimmed.some((n) => n) ? trimmed : null;
  };

  const patchRow = (key: string, patch: Partial<RosterRow>) =>
    setRoster((rows) =>
      rows.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        // Benching someone gives up their team slot so it frees up for the next player.
        if (next.slot !== 'active') next.team = null;
        return next;
      }),
    );
  const removeRow = (key: string) => {
    lightTap();
    setRoster((rows) => {
      const hit = rows.find((r) => r.key === key);
      if (hit?.id) setRemovedIds((ids) => [...ids, hit.id!]);
      return rows.filter((r) => r.key !== key);
    });
  };

  // ── Club image ──
  const pickPreset = (id: string) => {
    lightTap();
    setImagePreset((cur) => (cur === id ? null : id));
    setImageUpload(null);
  };
  const pickUpload = async () => {
    lightTap();
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    const a = res.assets?.[0];
    if (res.canceled || !a) return;
    setImageUpload({ uri: a.uri, mimeType: a.mimeType ?? 'image/jpeg' });
    setImagePreset(null);
  };

  /**
   * Final image_path for save: upload wins, then preset marker, then (edit)
   * keeping the old value when untouched. Uploaded images are stored per
   * session; preset markers are 'preset:<id>' strings, no storage involved.
   */
  const resolveImagePath = async (sessionId: string): Promise<string | null> => {
    if (imageUpload) return uploadClubImage(sessionId, imageUpload);
    if (imagePreset) return `${CLUB_PRESET_PREFIX}${imagePreset}`;
    return oldImagePath;
  };

  // One-line change summary for the edit-notify push ("Venue → X", etc.).
  /**
   * Same instant? Postgres returns "2026-07-23T14:00:00+00:00" while
   * Date.toISOString() gives "2026-07-23T14:00:00.000Z" — the same moment, but
   * DIFFERENT strings. Comparing the raw strings made every save report
   * "Date/time updated" even when only, say, the capacity changed.
   */
  const sameInstant = (a: string | null | undefined, b: string | null | undefined): boolean => {
    if (!a && !b) return true;
    if (!a || !b) return false;
    const ta = new Date(a).getTime();
    const tb = new Date(b).getTime();
    if (Number.isNaN(ta) || Number.isNaN(tb)) return a === b;
    return ta === tb;
  };

  const changeSummary = (next: {
    venue: string | null;
    event_at: string | null;
    pay_by: string | null;
    max_participants: number | null;
    team_count: number | null;
    team_size: number | null;
  }): string | null => {
    const s = original.current;
    if (!s) return null;
    const parts: string[] = [];
    if ((s.venue ?? '') !== (next.venue ?? '')) parts.push(`${t.collectz.changeVenue.replace('{v}', next.venue ?? '—')}`);
    if (!sameInstant(s.event_at, next.event_at)) parts.push(t.collectz.changeTime);
    if (!sameInstant(s.pay_by, next.pay_by)) parts.push(t.collectz.changePayBy);
    // Capacity changes were invisible to participants — now they're reported too.
    if ((s.max_participants ?? null) !== (next.max_participants ?? null)) {
      parts.push(
        next.max_participants == null
          ? t.collectz.changeCapacityNone
          : next.team_count != null && next.team_size != null
            // Say what the organizer actually set ("3 teams x 6"), not just the product.
            ? fill(t.collectz.changeCapacityTeams, { t: next.team_count, n: next.team_size })
            : fill(t.collectz.changeCapacity, { n: next.max_participants }),
      );
    }
    return parts.length ? parts.join(' · ') : null;
  };

  // ── QR picker — payload-only: a photo-only QR can't render for others ──
  const pickQr = (qr: PaymentQr | null) => {
    lightTap();
    if (!qr) {
      setQrPayload(null);
      setQrLabel(null);
      setQrImageUri(null);
      setQrImagePath(null);
      return;
    }
    if (qr.payload) {
      // Scanned DuitNow QR — we can re-render it with the exact amount embedded.
      setQrPayload(qr.payload);
      setQrImageUri(null);
      setQrImagePath(null);
    } else {
      // Photo-only — upload the picture instead; participants type the amount.
      setQrPayload(null);
      setQrImageUri(qr.uri);
      setQrImagePath(null);
    }
    setQrLabel(qr.label);
  };

  // ── Paste-parse ──
  const handleParse = async () => {
    if (parsing) return;
    setParsing(true);
    try {
      const d = await parseCollectzAnnouncement(pasteText);
      if (d.title) setTitle(d.title);
      if (d.event_at) {
        const dt = new Date(d.event_at);
        if (!isNaN(dt.getTime())) setEventAt(dt);
      }
      if (d.venue) setVenue(d.venue);
      if (d.details_text) setDetails(d.details_text);
      if (d.rules_text) setRules(d.rules_text);
      if (d.scheme) setScheme(d.scheme);
      if (d.total_amount != null) setTotalAmount(String(d.total_amount));
      if (d.default_share != null) setShareAmount(String(d.default_share));
      if (d.pay_by) {
        const dt = new Date(d.pay_by);
        if (!isNaN(dt.getTime())) setPayBy(dt);
      }
      if (d.roster.length > 0) {
        setRoster(d.roster.map((r) => ({ key: nextKey(), name: r.name, slot: r.slot, amount: '', team: null })));
      }
      setPasteOpen(false);
      setPasteText('');
      successNotification();
      showToast(t.collectz.pasteDone, 'success');
    } catch {
      errorNotification();
      showToast(t.collectz.pasteError, 'error');
    } finally {
      setParsing(false);
    }
  };

  // ── Save ──
  const doSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (isEdit && editSessionId) {
        // ── Edit path: update the session, reconcile the roster, maybe notify ──
        const next = {
          title: title.trim(),
          category,
          event_at: eventAt ? eventAt.toISOString() : null,
          venue: venue.trim() || null,
          maps_url: mapsUrl.trim() || null,
          details_text: details.trim() || null,
          rules_text: rules.trim() || null,
          scheme,
          total_amount: scheme === 'equal' ? parseAmount(totalAmount) : null,
          default_share: scheme === 'flat' ? parseAmount(shareAmount) : null,
          currency,
          pay_by: payBy ? payBy.toISOString() : null,
          qr_payload: qrPayload,
          max_participants: capacityMax,
          team_count: capMode === 'teams' ? teamCount : null,
          team_size: capMode === 'teams' ? teamSize : null,
          team_names: teamNamesPayload(),
          image_path: null as string | null,
          qr_image_path: null as string | null,
        };
        next.image_path = await resolveImagePath(editSessionId);
        // Photo QR: upload the newly-picked picture, else keep whatever was stored.
        next.qr_image_path = qrImageUri
          ? await uploadQrImage(editSessionId, { uri: qrImageUri })
          : qrImagePath;
        await updateSession(editSessionId, next);
        // Roster diff: removals first, then updates, then additions.
        for (const id of removedIds) await removeParticipant(id);
        for (const r of roster) {
          const amount = scheme === 'custom' ? parseAmount(r.amount) : null;
          const team = capMode === 'teams' && r.slot === 'active' ? r.team : null;
          if (r.id) await updateParticipant(r.id, { name: r.name.trim(), slot: r.slot, share_amount: amount, team_idx: team });
          else await addParticipant(editSessionId, r.name.trim(), { slot: r.slot, share_amount: amount, team_idx: team });
        }
        // Notify participants when the change matters and the box is ticked.
        const summary = changeSummary(next);
        if (notifyChanges && summary) {
          notifySession(editSessionId, 'edited', summary).catch(() => {});
        }
        successNotification();
        navigation.goBack();
        return;
      }

      // ── Create path (blank or template) ──
      const session = await createSession({
        title: title.trim(),
        category,
        event_at: eventAt ? eventAt.toISOString() : null,
        venue: venue.trim() || null,
        maps_url: mapsUrl.trim() || null,
        details_text: details.trim() || null,
        rules_text: rules.trim() || null,
        scheme,
        total_amount: scheme === 'equal' ? parseAmount(totalAmount) : null,
        default_share: scheme === 'flat' ? parseAmount(shareAmount) : null,
        currency,
        pay_by: payBy ? payBy.toISOString() : null,
        qr_payload: qrPayload,
        max_participants: capacityMax,
        team_count: capMode === 'teams' ? teamCount : null,
        team_size: capMode === 'teams' ? teamSize : null,
        team_names: teamNamesPayload(),
        image_path: imagePreset ? `${CLUB_PRESET_PREFIX}${imagePreset}` : oldImagePath,
        qr_image_path: qrImagePath,
      });
      // Uploads come after create — they need the session id for their storage path.
      // They are BEST-EFFORT: the session already exists, so a failed upload must not
      // fall into the catch below and report "couldn't create the session" — that lie
      // makes the user retry and create a duplicate. (Image uploads are the most
      // platform-fragile step: Android hands us content:// uris via FormData.)
      if (imageUpload) {
        try {
          const path = await uploadClubImage(session.id, imageUpload);
          await updateSession(session.id, { image_path: path });
          session.image_path = path;
        } catch {
          showToast(t.collectz.uploadFailedAfterCreate, 'error');
        }
      }
      if (qrImageUri) {
        try {
          const qrPath = await uploadQrImage(session.id, { uri: qrImageUri });
          await updateSession(session.id, { qr_image_path: qrPath });
          session.qr_image_path = qrPath;
        } catch {
          showToast(t.collectz.uploadFailedAfterCreate, 'error');
        }
      }
      const rows = roster.filter((r) => r.name.trim());
      for (const r of rows) {
        // Sequential keeps failures attributable to a specific name.
        await addParticipant(session.id, r.name.trim(), {
          slot: r.slot,
          share_amount: scheme === 'custom' ? parseAmount(r.amount) : null,
          team_idx: capMode === 'teams' && r.slot === 'active' ? r.team : null,
        });
      }
      successNotification();
      navigation.replace('CollectzDetail', { sessionId: session.id });
      // Straight into the share sheet — the announcement carries the join link.
      Share.share({
        message: buildWhatsappAnnouncement(session, rows.filter((r) => r.slot === 'active').length),
      }).catch(() => {});
    } catch (err) {
      errorNotification();
      // Keep the friendly copy in production, but append the real reason in dev —
      // a bare "try again" hid a plain schema error (missing column) for a whole
      // debugging round.
      const detail = err instanceof Error && err.message ? err.message : '';
      showToast(__DEV__ && detail ? `${t.collectz.createError} — ${detail}` : t.collectz.createError, 'error');
    } finally {
      setSaving(false);
    }
  }, [saving, isEdit, editSessionId, title, category, eventAt, venue, mapsUrl, details, rules, scheme, totalAmount, shareAmount, currency, payBy, qrPayload, qrImageUri, qrImagePath, imagePreset, imageUpload, oldImagePath, removedIds, roster, notifyChanges, capacityMax, capMode, teamCount, teamSize, teamNames, navigation, showToast, t]);

  const handleSave = () => {
    if (!title.trim()) {
      errorNotification();
      showToast(t.collectz.validationTitle, 'error');
      return;
    }
    if (scheme === 'flat' && parseAmount(shareAmount) == null) {
      errorNotification();
      showToast(t.collectz.validationShare, 'error');
      return;
    }
    if (scheme === 'equal' && parseAmount(totalAmount) == null) {
      errorNotification();
      showToast(t.collectz.validationTotal, 'error');
      return;
    }
    if (!roster.some((r) => r.name.trim())) {
      Alert.alert(t.collectz.warnNoRosterTitle, t.collectz.warnNoRosterBody, [
        { text: t.common.cancel, style: 'cancel' },
        { text: t.collectz.saveAnyway, onPress: doSave },
      ]);
      return;
    }
    mediumTap();
    doSave();
  };

  return (
    <View style={styles.screen}>
      {/* PageScrollView = keyboard-aware (iOS AND Android) + gesture-handler
          underneath. Multi-line fields also carry the gold KeyboardDoneFab. */}
      <PageScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        {prefilling ? (
          <ActivityIndicator size="small" color={C.accent} style={{ marginVertical: SPACING.xl }} />
        ) : (
        <>
        {/* Template banner — "same as previous" prefill */}
        {!!templateTitle && (
          <View style={[styles.templateBanner, { backgroundColor: withAlpha(C.accent, 0.08) }]}>
            <Feather name="copy" size={14} color={C.accent} />
            <Text style={[styles.templateBannerText, { color: C.accent }]}>
              {t.collectz.templateBanner.replace('{title}', templateTitle)}
            </Text>
          </View>
        )}

        {/* Paste prefill */}
        {!isEdit && (
        <Pressable style={({ pressed }) => [styles.pasteBtn, pressed && { opacity: 0.85 }]} onPress={() => { lightTap(); setPasteOpen(true); }}>
          <Feather name="clipboard" size={16} color={C.accent} />
          <Text style={styles.pasteBtnText}>{t.collectz.pasteWhatsapp}</Text>
        </Pressable>
        )}

        {/* Title */}
        <View style={[styles.fieldCard, neuF.raisedSoft]}>
          <Text style={styles.fieldCardLabel}>{t.collectz.fieldTitle} <Text style={styles.requiredStar}>*</Text></Text>
          <TextInput
            style={styles.fieldCardInput}
            value={title}
            onChangeText={setTitle}
            placeholder={t.collectz.fieldTitlePlaceholder}
            placeholderTextColor={withAlpha(C.textMuted, 0.55)}
          />
        </View>

        {/* Category chips */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t.collectz.fieldCategory}</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((key) => (
              <Pressable
                key={key}
                style={[styles.chip, neuF.raised, category === key && styles.chipActive]}
                onPress={() => { selectionChanged(); setCategory(category === key ? null : key); }}
              >
                <Text style={[styles.chipText, category === key && styles.chipTextActive]}>{catLabels[key]}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Club image / icon — the grid focuses on the picked category (tap a
            category above to filter it to related icons). */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t.collectz.fieldImage}</Text>
          <View style={styles.iconGrid}>
            {clubIconsForCategory(category).map((icon) => (
              <Pressable
                key={icon.id}
                style={[styles.iconTile, imagePreset === icon.id && styles.iconTileActive]}
                onPress={() => pickPreset(icon.id)}
                accessibilityRole="button"
                accessibilityLabel={icon.id}
              >
                <Text style={styles.iconEmoji}>{icon.emoji}</Text>
              </Pressable>
            ))}
            <Pressable
              style={[styles.iconTile, (imageUpload || (!imagePreset && oldImagePath)) && styles.iconTileActive]}
              onPress={pickUpload}
              accessibilityRole="button"
              accessibilityLabel={t.collectz.imageUpload}
            >
              {imageUpload ? (
                <Image source={{ uri: imageUpload.uri }} style={styles.iconImage} />
              ) : (
                <Feather name="upload" size={20} color={C.textSecondary} />
              )}
            </Pressable>
          </View>
        </View>

        {renderWhenRow(t.collectz.fieldEventAt, eventAt, 'event')}

        {/* Venue */}
        <View style={[styles.fieldCard, neuF.raisedSoft]}>
          <Text style={styles.fieldCardLabel}>{t.collectz.fieldVenue}</Text>
          <TextInput
            style={styles.fieldCardInput}
            value={venue}
            onChangeText={setVenue}
            placeholder={t.collectz.fieldVenuePlaceholder}
            placeholderTextColor={withAlpha(C.textMuted, 0.55)}
          />
        </View>

        {/* Maps link + preview */}
        <View style={[styles.fieldCard, neuF.raisedSoft]}>
          <Text style={styles.fieldCardLabel}>{t.collectz.fieldMaps}</Text>
          <TextInput
            style={styles.fieldCardInput}
            value={mapsUrl}
            onChangeText={setMapsUrl}
            placeholder={t.collectz.fieldMapsPlaceholder}
            placeholderTextColor={withAlpha(C.textMuted, 0.55)}
            autoCapitalize="none"
            keyboardType="url"
          />
          {!!mapsUrl.trim() && isMapsLink(mapsUrl.trim()) && (
            <MapPreviewCard mapsUrl={mapsUrl.trim()} compact />
          )}
        </View>

        {/* Details */}
        <View style={[styles.fieldCard, neuF.raisedSoft]}>
          <Text style={styles.fieldCardLabel}>{t.collectz.fieldDetails}</Text>
          <TextInput
            style={[styles.fieldCardInput, styles.fieldCardMultiline]}
            value={details}
            onChangeText={setDetails}
            placeholder={t.collectz.fieldDetailsPlaceholder}
            placeholderTextColor={withAlpha(C.textMuted, 0.55)}
            multiline
            textAlignVertical="top"
            onFocus={() => setMultilineFocused(true)}
            onBlur={() => setMultilineFocused(false)}
          />
        </View>

        {/* Scheme */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t.collectz.fieldScheme}</Text>
          <View style={styles.chipRow}>
            {(['flat', 'equal', 'custom'] as CollectzScheme[]).map((key) => (
              <Pressable
                key={key}
                style={[styles.chip, neuF.raised, scheme === key && styles.chipActive]}
                onPress={() => { selectionChanged(); setScheme(key); }}
              >
                <Text style={[styles.chipText, scheme === key && styles.chipTextActive]}>{schemeLabels[key]}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Amount — same debt-style card as the other fields */}
        {scheme === 'flat' && (
          <View style={[styles.fieldCard, neuF.raisedSoft]}>
            <Text style={styles.fieldCardLabel}>{t.collectz.fieldShareAmount.replace('{currency}', currency)}</Text>
            <TextInput
              style={styles.fieldCardInput}
              value={shareAmount}
              onChangeText={setShareAmount}
              placeholder="0.00"
              placeholderTextColor={withAlpha(C.textMuted, 0.55)}
              keyboardType="decimal-pad"
            />
          </View>
        )}
        {scheme === 'equal' && (
          <View style={[styles.fieldCard, neuF.raisedSoft]}>
            <Text style={styles.fieldCardLabel}>{t.collectz.fieldTotalAmount.replace('{currency}', currency)}</Text>
            <TextInput
              style={styles.fieldCardInput}
              value={totalAmount}
              onChangeText={setTotalAmount}
              placeholder="0.00"
              placeholderTextColor={withAlpha(C.textMuted, 0.55)}
              keyboardType="decimal-pad"
            />
          </View>
        )}

        {/* Currency is NOT chosen here — it follows the app currency (Settings).
            Editing an existing session keeps whatever it was created with. */}

        {renderWhenRow(t.collectz.fieldPayBy, payBy, 'payBy', () => setPayBy(null))}

        {/* Rules */}
        <View style={[styles.fieldCard, neuF.raisedSoft]}>
          <Text style={styles.fieldCardLabel}>{t.collectz.fieldRules}</Text>
          <TextInput
            style={[styles.fieldCardInput, styles.fieldCardMultiline]}
            value={rules}
            onChangeText={setRules}
            placeholder={t.collectz.fieldRulesPlaceholder}
            placeholderTextColor={withAlpha(C.textMuted, 0.55)}
            multiline
            textAlignVertical="top"
            onFocus={() => setMultilineFocused(true)}
            onBlur={() => setMultilineFocused(false)}
          />
        </View>

        {/* Capacity — cap the active roster. Teams mode just multiplies out to the
            max (the roster itself stays one flat list). */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t.collectz.capacity}</Text>
          <View style={styles.chipRow}>
            {([
              ['none', t.collectz.capacityNone],
              ['total', t.collectz.capacityTotal],
              ['teams', t.collectz.capacityTeams],
            ] as const).map(([key, lbl]) => (
              <Pressable
                key={key}
                style={[styles.chip, neuF.raised, capMode === key && styles.chipActive]}
                onPress={() => { selectionChanged(); setCapMode(key); }}
              >
                <Text style={[styles.chipText, capMode === key && styles.chipTextActive]}>{lbl}</Text>
              </Pressable>
            ))}
          </View>

          {capMode === 'total' && renderStepper(t.collectz.capacityMax, maxPlayers, setMaxPlayers, 1, 99)}
          {capMode === 'teams' && (
            <>
              {renderStepper(t.collectz.capacityTeamCount, teamCount, setTeamCount, 1, 20)}
              {renderStepper(t.collectz.capacityTeamSize, teamSize, setTeamSize, 1, 30)}
              <Text style={styles.capHint}>{fill(t.collectz.capacityMaxHint, { n: teamCount * teamSize })}</Text>
              {/* Team names are optional — blank just shows "Team 1". */}
              <Text style={styles.teamNamesLabel}>{t.collectz.teamRename}</Text>
              {Array.from({ length: teamCount }, (_, i) => i).map((i) => (
                <TextInput
                  key={i}
                  style={[styles.input, styles.teamNameInput]}
                  value={teamNames[i] ?? ''}
                  onChangeText={(v) =>
                    setTeamNames((prev) => {
                      const next = [...prev];
                      while (next.length < teamCount) next.push('');
                      next[i] = v;
                      return next;
                    })
                  }
                  placeholder={fill(t.collectz.teamN, { n: i + 1 })}
                  placeholderTextColor={withAlpha(C.textMuted, 0.55)}
                  maxLength={40}
                />
              ))}
            </>
          )}
          {capacityMax != null && (
            <Text style={[styles.capCount, activeFilled > capacityMax && styles.capCountOver]}>
              {activeFilled > capacityMax
                ? fill(t.collectz.capacityOver, { n: activeFilled, max: capacityMax })
                : fill(t.collectz.capacityCount, { n: activeFilled, max: capacityMax })}
            </Text>
          )}
        </View>

        {/* Roster editor */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t.collectz.fieldRoster}</Text>
          {roster.map((row) => (
          <React.Fragment key={row.key}>
            <View style={styles.rosterRow}>
              <TextInput
                style={[styles.input, styles.rosterName]}
                value={row.name}
                onChangeText={(v) => patchRow(row.key, { name: v })}
                placeholder={t.collectz.rosterNamePlaceholder}
                placeholderTextColor={withAlpha(C.textMuted, 0.55)}
              />
              <Pressable
                style={[styles.reserveChip, neuF.raised, row.slot === 'reserve' && styles.reserveChipActive]}
                onPress={() => { selectionChanged(); patchRow(row.key, { slot: row.slot === 'reserve' ? 'active' : 'reserve' }); }}
                accessibilityRole="button"
                accessibilityLabel={t.collectz.rosterReserve}
              >
                <Feather name={row.slot === 'reserve' ? 'check-square' : 'square'} size={14} color={row.slot === 'reserve' ? C.onAccent : C.textMuted} />
                <Text style={[styles.reserveChipText, row.slot === 'reserve' && styles.reserveChipTextActive]}>
                  {t.collectz.rosterReserve}
                </Text>
              </Pressable>
              {scheme === 'custom' && (
                <TextInput
                  style={[styles.input, styles.rosterAmount]}
                  value={row.amount}
                  onChangeText={(v) => patchRow(row.key, { amount: v })}
                  placeholder={t.collectz.rosterAmountPlaceholder.replace('{currency}', currency)}
                  placeholderTextColor={withAlpha(C.textMuted, 0.55)}
                  keyboardType="decimal-pad"
                />
              )}
              <Pressable onPress={() => removeRow(row.key)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.common.delete}>
                <Feather name="x" size={18} color={C.textMuted} />
              </Pressable>
            </View>
            {/* Team picker — only when capacity is BY TEAMS and this player is
                actually in (reserves hold no team slot). Leaving it on "No team"
                is fine: the participant can pick their own team from the link. */}
            {capMode === 'teams' && row.slot === 'active' && (
              <View style={styles.teamPickRow}>
                <Pressable
                  style={[styles.teamChip, neuF.raised, row.team == null && styles.teamChipActive]}
                  onPress={() => { selectionChanged(); patchRow(row.key, { team: null }); }}
                  accessibilityRole="button"
                >
                  <Text style={[styles.teamChipText, row.team == null && styles.teamChipTextActive]}>
                    {t.collectz.teamNoneLabel}
                  </Text>
                </Pressable>
                {Array.from({ length: teamCount }, (_, i) => i + 1).map((idx) => {
                  const mine = row.team === idx;
                  // Full means full for everyone EXCEPT whoever already sits there.
                  const full = !mine && (teamFill[idx] ?? 0) >= teamSize;
                  return (
                    <Pressable
                      key={idx}
                      disabled={full}
                      style={[styles.teamChip, neuF.raised, mine && styles.teamChipActive, full && styles.teamChipFull]}
                      onPress={() => { selectionChanged(); patchRow(row.key, { team: idx }); }}
                      accessibilityRole="button"
                    >
                      <Text style={[styles.teamChipText, mine && styles.teamChipTextActive]}>
                        {teamLabel(teamNames, idx, fill(t.collectz.teamN, { n: idx }))}
                        {full ? ` · ${t.collectz.teamFullShort}` : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </React.Fragment>
          ))}
          <Pressable
            style={({ pressed }) => [styles.addRowBtn, pressed && { opacity: 0.85 }, rosterFull && { opacity: 0.4 }]}
            onPress={addRow}
            disabled={rosterFull}
            accessibilityRole="button"
            accessibilityState={{ disabled: rosterFull }}
          >
            <Feather name={rosterFull ? 'slash' : 'plus'} size={16} color={C.accent} />
            <Text style={styles.addRowText}>{rosterFull ? t.collectz.sessionFull : t.collectz.rosterAdd}</Text>
          </Pressable>
        </View>

        {/* QR picker */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t.collectz.fieldQr}</Text>
          {paymentQrs.length === 0 ? (
            <Text style={styles.hint}>{t.collectz.qrEmptyHint}</Text>
          ) : (
            <View style={styles.chipRow}>
              <Pressable
                style={[styles.chip, neuF.raised, qrLabel === null && styles.chipActive]}
                onPress={() => pickQr(null)}
              >
                <Text style={[styles.chipText, qrLabel === null && styles.chipTextActive]}>
                  {t.collectz.qrNone}
                </Text>
              </Pressable>
              {paymentQrs.map((qr, i) => (
                <Pressable
                  key={`${qr.label}-${i}`}
                  style={[styles.chip, neuF.raised, qrLabel === qr.label && styles.chipActive]}
                  onPress={() => pickQr(qr)}
                >
                  <Text style={[styles.chipText, qrLabel === qr.label && styles.chipTextActive]}>{qr.label}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {/* Photo QR is allowed — just tell the organizer the amount won't auto-fill. */}
          {!qrPayload && (qrImageUri || qrImagePath) && (
            <Text style={styles.hint}>{t.collectz.qrNoPayload}</Text>
          )}
        </View>

        {/* Edit mode: notify participants of the change */}
        {isEdit && (
          <Pressable
            style={styles.notifyRow}
            onPress={() => { selectionChanged(); setNotifyChanges((v) => !v); }}
            accessibilityRole="button"
            accessibilityState={{ checked: notifyChanges }}
          >
            <Feather name={notifyChanges ? 'check-square' : 'square'} size={16} color={notifyChanges ? C.accent : C.textMuted} />
            <Text style={[styles.notifyText, { color: C.textPrimary }]}>{t.collectz.notifyChanges}</Text>
          </Pressable>
        )}

        {/* Save */}
        <NeuButton
          icon={isEdit ? 'check' : 'plus'}
          label={isEdit ? t.collectz.editSave : t.collectz.createSave}
          onPress={handleSave}
          disabled={saving}
          accessibilityLabel={isEdit ? t.collectz.editSave : t.collectz.createSave}
          style={{ marginTop: SPACING.sm }}
        />
        </>
        )}
      </PageScrollView>

      {/* Android renders the picker as a system dialog. */}
      {picker && Platform.OS === 'android' && (
        <DateTimePicker value={pickerValue} mode={picker.mode} onChange={onPickerChange} />
      )}
      {/* iOS: a FullWindowOverlay, NOT a native <Modal> — a transparent RN Modal
          leaves the parent unresponsive for ~1–2s after dismiss, so the user
          couldn't scroll right away; this unmounts instantly. It renders into its
          own UIWindow above the whole app, so the dim backdrop also covers the
          nav header + status bar (a plain in-screen absoluteFill can't — the
          native-stack header lives outside the screen's content view, and zIndex
          only orders siblings). Tap the backdrop OR "Done" to close. */}
      {!!picker && Platform.OS === 'ios' && (
        <FullWindowOverlay>
        {/* CalendarPicker scrolls its year grid with an RNGH ScrollView, and RNGH
            handlers aren't registered inside this separate window — so it needs a
            root of its own here. Sized explicitly (the overlay's absoluteFill has
            nothing to resolve against otherwise). */}
        <GestureHandlerRootView style={{ width: winW, height: winH }}>
        <View style={styles.pickerOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPicker(null)} accessibilityLabel={t.common.close} />
          {picker?.mode === 'date' ? (
            // Debt's picker design (DebtTracking `datePickerCard` + CalendarPicker):
            // a custom RN calendar, so it self-sizes — no native measurement pass
            // to fight, hence no open-tall-then-shrink.
            <View style={styles.datePickerCard}>
              <View style={styles.datePickerHeader}>
                <Text style={styles.datePickerTitle}>{t.collectz.pickDate}</Text>
                <Pressable onPress={() => setPicker(null)} hitSlop={8}>
                  <Text style={styles.datePickerDone}>{t.common.done}</Text>
                </Pressable>
              </View>
              <CalendarPicker
                value={pickerValue}
                onChange={(date) => { applyPicked(date); setPicker(null); }}
              />
            </View>
          ) : (
            // Time keeps the native spinner wheel — CalendarPicker is date-only.
            <View style={[styles.pickerCard, neuF.raisedModal]}>
              <DateTimePicker
                value={pickerValue}
                mode="time"
                display="spinner"
                onChange={onPickerChange}
                themeVariant={isDark ? 'dark' : 'light'}
                accentColor={C.accent}
              />
              <Pressable style={styles.pickerDone} onPress={() => setPicker(null)}>
                <Text style={styles.pickerDoneText}>{t.common.done}</Text>
              </Pressable>
            </View>
          )}
        </View>
        </GestureHandlerRootView>
        </FullWindowOverlay>
      )}

      {/* Paste-parse — in-screen overlay (not a native <Modal>, which lags ~2s on
          dismiss). KAView lifts the bottom card above the keyboard; tap outside to close. */}
      {pasteOpen && (
        <KAView behavior="padding" style={styles.pasteOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPasteOpen(false)} accessibilityLabel={t.common.close} />
          <View style={styles.pasteCard}>
            <View style={styles.pasteHeader}>
              <Text style={styles.pasteTitle}>{t.collectz.pasteTitle}</Text>
              <NeuIconButton size={36} onPress={() => setPasteOpen(false)} accessibilityLabel={t.common.close}>
                <Feather name="x" size={17} color={C.textPrimary} />
              </NeuIconButton>
            </View>
            <Text style={styles.pasteHint}>{t.collectz.pasteHint}</Text>
            <TextInput
              style={styles.pasteInput}
              value={pasteText}
              onChangeText={setPasteText}
              placeholder={t.collectz.pastePlaceholder}
              placeholderTextColor={withAlpha(C.textMuted, 0.55)}
              multiline
              textAlignVertical="top"
              autoFocus
            />
            <NeuButton
              icon="check"
              label={parsing ? t.collectz.pasteParsing : t.collectz.pasteParse}
              onPress={handleParse}
              disabled={parsing}
              accessibilityLabel={t.collectz.pasteParse}
            />
          </View>
        </KAView>
      )}

      {/* Gold keyboard-done FAB — floats above the keyboard while a note field is focused */}
      <KeyboardDoneFab visible={keyboardVisible && multilineFocused} keyboardHeight={keyboardHeight} />
    </View>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.background },
    scroll: { flex: 1 },
    content: { padding: SPACING.xl, paddingBottom: SPACING['5xl'] },
    pasteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      minHeight: 46,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: C.accent,
      borderStyle: 'dashed',
      marginBottom: SPACING.lg,
    },
    pasteBtnText: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.accent,
    },
    fieldGroup: { marginBottom: SPACING.lg, gap: SPACING.sm },
    label: {
      // base (15) — matches the input text size so the title never reads smaller
      // than the value it labels.
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
    },
    input: {
      minHeight: 46,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: C.inputBorder,
      backgroundColor: C.surface,
      paddingHorizontal: SPACING.md,
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
    },
    multiline: { minHeight: 84, paddingTop: SPACING.sm, textAlignVertical: 'top' },
    amountInput: { marginTop: SPACING.xs },
    // Debt-style field card — neu-raised surface on C.background, label inside,
    // borderless input (mirrors DebtTracking's dDebtFieldCard). Applied with
    // neuF.raisedSoft at the View; no border, no overflow (seam-safe).
    fieldCard: {
      backgroundColor: C.background,
      borderRadius: RADIUS.lg,
      paddingHorizontal: SPACING.md + 2,
      paddingVertical: SPACING.sm + 4,
      marginBottom: SPACING.md,
    },
    fieldCardLabel: {
      // sm (14), not xs (12) — the label is the field's TITLE, so it must not
      // read smaller/weaker than the 15px value+placeholder sitting under it.
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textSecondary,
      fontWeight: TYPOGRAPHY.weight.semibold,
      marginBottom: 4,
      letterSpacing: 0.2,
    },
    fieldCardInput: {
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
      fontWeight: TYPOGRAPHY.weight.medium,
      paddingVertical: 2,
      minHeight: 24,
    },
    fieldCardMultiline: { minHeight: 64, paddingTop: 4, lineHeight: 20 },
    requiredStar: { color: '#C1694F', fontWeight: TYPOGRAPHY.weight.bold }, // terracotta — required marker
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
    chip: {
      borderRadius: RADIUS.full,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
    },
    chipActive: { backgroundColor: C.accent },
    chipText: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.medium,
      color: C.textSecondary,
    },
    chipTextActive: { color: C.onAccent, fontWeight: TYPOGRAPHY.weight.bold },
    iconTile: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.pillBg,
      borderWidth: 2,
      borderColor: 'transparent',
      overflow: 'hidden',
    },
    iconTileActive: { borderColor: C.accent },
    iconImage: { width: 44, height: 44, borderRadius: 22 },
    iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
    iconEmoji: { fontSize: 26 },
    templateBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.md,
    },
    templateBannerText: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.medium,
    },
    notifyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.sm,
      marginBottom: SPACING.sm,
    },
    notifyText: { flex: 1, fontSize: TYPOGRAPHY.size.sm },
    whenRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    whenBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: C.inputBorder,
      backgroundColor: C.surface,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
    },
    whenText: { fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary },
    whenTextDim: { color: C.textMuted },
    rosterRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
    rosterName: { flex: 1, minHeight: 42 },
    rosterAmount: { width: 92, minHeight: 42 },
    reserveChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: RADIUS.full,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 6,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
    },
    reserveChipActive: { backgroundColor: C.accent },
    teamPickRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.xs,
      marginTop: -SPACING.xs,
      marginBottom: SPACING.sm,
      paddingLeft: SPACING.xs,
    },
    teamChip: {
      borderRadius: RADIUS.full,
      paddingHorizontal: SPACING.sm,
      paddingVertical: 5,
      backgroundColor: withAlpha(C.textPrimary, 0.03),
    },
    teamChipActive: { backgroundColor: C.accent },
    teamChipFull: { opacity: 0.4 },
    teamNamesLabel: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: SPACING.sm, marginBottom: SPACING.xs },
    teamNameInput: { minHeight: 42, marginBottom: SPACING.xs },
    teamChipText: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary, fontWeight: TYPOGRAPHY.weight.medium },
    teamChipTextActive: { color: C.onAccent, fontWeight: TYPOGRAPHY.weight.bold },
    reserveChipText: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, fontWeight: TYPOGRAPHY.weight.medium },
    reserveChipTextActive: { color: C.onAccent, fontWeight: TYPOGRAPHY.weight.bold },
    addRowBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 42,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: withAlpha(C.accent, 0.5),
      borderStyle: 'dashed',
    },
    addRowText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.accent },
    // Capacity steppers (− value +)
    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: SPACING.xs,
    },
    stepperLabel: { fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    stepperBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(C.textPrimary, 0.03),
    },
    stepperValue: {
      minWidth: 34,
      textAlign: 'center',
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    capHint: { fontSize: TYPOGRAPHY.size.xs, color: C.accent, marginTop: SPACING.xs, fontWeight: TYPOGRAPHY.weight.semibold },
    capCount: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: SPACING.xs },
    capCountOver: { color: C.overdue },
    hint: { fontSize: TYPOGRAPHY.size.sm, color: C.textMuted, lineHeight: 19 },
    warnHint: { fontSize: TYPOGRAPHY.size.sm, color: C.bronze, lineHeight: 19 },
    // In-screen overlay (not a <Modal>) → absolute-fill above the scroll, dim backdrop.
    pickerOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: SPACING.xl,
      zIndex: 50,
    },
    pickerCard: {
      backgroundColor: C.background,
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
      width: '100%',
      maxWidth: 380,
      alignItems: 'center',
    },
    // Date picker card — ported from DebtTracking's `datePickerCard`. No neu
    // shadow: it clips with overflow:'hidden' (header divider + rounded corners),
    // and a shadow must never share a view with a clip (the neu seam rule).
    datePickerCard: {
      backgroundColor: C.background,
      borderRadius: RADIUS.xl,
      overflow: 'hidden',
      width: '100%',
      maxWidth: 380,
    },
    datePickerHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.md,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    datePickerTitle: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
    },
    datePickerDone: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.accent,
    },
    pickerDone: { marginTop: SPACING.sm, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.xl },
    pickerDoneText: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: C.accent },
    pasteOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
      zIndex: 50,
    },
    pasteCard: {
      backgroundColor: C.background,
      borderTopLeftRadius: RADIUS.xl,
      borderTopRightRadius: RADIUS.xl,
      padding: SPACING.xl,
      gap: SPACING.sm,
    },
    pasteHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    pasteTitle: { fontSize: TYPOGRAPHY.size.lg, fontWeight: TYPOGRAPHY.weight.bold, color: C.textPrimary },
    pasteHint: { fontSize: TYPOGRAPHY.size.sm, color: C.textMuted, lineHeight: 19 },
    pasteInput: {
      minHeight: 160,
      maxHeight: 260,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: C.inputBorder,
      backgroundColor: C.background,
      padding: SPACING.md,
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
    },
  });

export default CollectzCreate;
