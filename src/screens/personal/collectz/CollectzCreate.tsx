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
  Image,
  ScrollView,
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
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  notifySession,
  clubImageUrl,
} from '../../../services/collectzService';
import { parseCollectzAnnouncement } from '../../../services/collectzParser';
import { supabasePersonal } from '../../../services/supabase';
import { clubIconsForCategory, presetClubIcon, presetClubColor, CLUB_PRESET_PREFIX, CLUB_ICON_COLORS } from '../../../constants/clubIcons';
import { collectzCategoryIcon } from '../../../constants/collectzColors';
import { isMapsLink } from '../../../utils/mapLink';
import { parseAmountLoose } from '../../../utils/parseAmountLoose';
import MapPreviewCard from '../../../components/collectz/MapPreviewCard';
import CollectzCreatedModal from '../../../components/collectz/CollectzCreatedModal';
import BottomSheet from '../../../components/common/BottomSheet';
import { useNeu } from '../../../components/common/neu';
import PageScrollView from '../../../components/common/PageScrollView';
import NeuButton from '../../../components/common/NeuButton';
import NeuIconButton from '../../../components/common/NeuIconButton';
import KeyboardDoneFab from '../../../components/common/KeyboardDoneFab';
import CalendarPicker from '../../../components/common/CalendarPicker';
import { fmtDate, fmtTime, fill, teamLabel, SOCIAL_PLATFORMS, normalizeSocial, socialHandleFromUrl, isWhatsappGroupUrl } from './collectzFormat';
import type { CollectzSocialKey, CollectzSocials } from '../../../services/collectzService';

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
  /** DB status for edit-mode rows — confirmed rows keep their share lock on save. */
  status?: CollectzParticipant['status'];
}

/**
 * Loose money parse — accepts "45", "RM45.50", "45,50", "1,500". Delegates to
 * the shared locale-tolerant parser: a comma followed by 3 digits is a
 * thousands separator (bank-app paste), NOT a decimal — the old naive
 * comma→dot swap turned "1,500" into 1.5, a silent 1000× error.
 */
function parseAmount(raw: string): number | null {
  return parseAmountLoose(raw);
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
  const [eventEnd, setEventEnd] = useState<Date | null>(null);
  const [venue, setVenue] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  // Organizer contact (all optional): social handles + WhatsApp group link.
  const [socialHandles, setSocialHandles] = useState<Record<CollectzSocialKey, string>>({ ig: '', x: '', threads: '', fb: '', telegram: '' });
  const [groupUrl, setGroupUrl] = useState('');
  const [details, setDetails] = useState('');
  const [scheme, setScheme] = useState<CollectzScheme>('flat');
  const [shareAmount, setShareAmount] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [payBy, setPayBy] = useState<Date | null>(null);
  const [rules, setRules] = useState('');
  // Player requirements (all optional — null = open to all / not specified).
  const [skillLevel, setSkillLevel] = useState<'beginner' | 'intermediate' | 'advanced' | 'any' | null>(null);
  const [ageReq, setAgeReq] = useState<'below_18' | '18_above' | 'any' | null>(null);
  const [genderReq, setGenderReq] = useState<'male' | 'female' | 'any' | null>(null);
  const [bookingStatus, setBookingStatus] = useState<'booked' | 'later' | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  // Capacity — caps the ACTIVE roster. 'none' = no limit, 'total' = a plain max,
  // 'teams' = N teams × M per team (max = N × M). Joining is blocked at max.
  const [capMode, setCapMode] = useState<'none' | 'total' | 'teams'>('none');
  const [maxPlayers, setMaxPlayers] = useState(10);
  const [teamCount, setTeamCount] = useState(2);
  // Join approval — unknown self-adds queue for the organizer's OK. Pre-added
  // names always claim instantly; turning this on never touches the roster.
  const [joinApproval, setJoinApproval] = useState(false);
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
  const [iconColor, setIconColor] = useState<string | null>(null); // 6-char hex, no '#'
  const [imageUpload, setImageUpload] = useState<{ uri: string; mimeType?: string } | null>(null);
  const [oldImagePath, setOldImagePath] = useState<string | null>(null); // DB value on load (edit/template)
  const [removedIds, setRemovedIds] = useState<string[]>([]); // edit-mode roster deletions
  const [notifyChanges, setNotifyChanges] = useState(true);
  const [templateTitle, setTemplateTitle] = useState<string | null>(null);
  const [prefilling, setPrefilling] = useState(isEdit || !!templateFrom);
  const original = useRef<CollectzSession | null>(null); // change detection for edit-notify
  const linkedUserIds = useRef<Record<string, string>>({}); // edit mode: participant id → user_id (app-linked rows)

  // ── Paste-parse modal ──
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [parsing, setParsing] = useState(false);

  // ── "Session created" confirmation (summary + code/link to copy) ──
  const [createdSession, setCreatedSession] = useState<
    { session: CollectzSession; activeCount: number; rosterCount: number } | null
  >(null);

  // ── Date/time picker ──
  const [picker, setPicker] = useState<{ field: 'event' | 'eventEnd' | 'payBy'; mode: 'date' | 'time' } | null>(null);

  // ── Section sheets — tap a summary row, edit in a modal (keeps the form a
  // clean one-pager: grouped cards, not one endless scroll of fields). ──
  const [sheet, setSheet] = useState<null | 'category' | 'icon' | 'scheme' | 'details' | 'rules' | 'contact' | 'capacity' | 'qr' | 'requirements'>(null);
  const openSheet = (s: NonNullable<typeof sheet>) => { lightTap(); setSheet(s); };

  // ── Note fields (details / rules) — gold keyboard-done FAB while focused ──
  const [multilineFocused, setMultilineFocused] = useState(false);
  const { keyboardVisible, keyboardHeight } = useKeyboardVisible(() => setMultilineFocused(false));

  // Android back button: the picker + paste layers are IN-SCREEN overlays, not RN
  // <Modal>s, so Android's back gesture would pop this whole screen and throw away
  // everything typed. Intercept it while an overlay is open and just close that.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (!picker && !pasteOpen && !sheet) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheet) { setSheet(null); return true; }
      if (pasteOpen) { setPasteOpen(false); return true; }
      if (picker) { setPicker(null); return true; }
      return false;
    });
    return () => sub.remove();
  }, [picker, pasteOpen, sheet]);

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
        const evEnd = toDate(s.event_end);
        const pb = toDate(s.pay_by);
        original.current = isEdit ? s : null;
        setTitle(s.title);
        setCategory((s.category as CategoryKey | null) ?? null);
        setEventAt(isEdit ? ev : (ev ? shift(s.event_at) : null));
        setEventEnd(isEdit ? evEnd : (evEnd ? shift(s.event_end) : null));
        setVenue(s.venue ?? '');
        setMapsUrl(s.maps_url ?? '');
        setGroupUrl(s.group_url ?? '');
        setSocialHandles({
          ig: socialHandleFromUrl(s.socials?.ig),
          x: socialHandleFromUrl(s.socials?.x),
          threads: socialHandleFromUrl(s.socials?.threads),
          fb: socialHandleFromUrl(s.socials?.fb),
          telegram: socialHandleFromUrl(s.socials?.telegram),
        });
        setDetails(s.details_text ?? '');
        setScheme(s.scheme);
        setShareAmount(s.default_share != null ? String(s.default_share) : '');
        setTotalAmount(s.total_amount != null ? String(s.total_amount) : '');
        setPayBy(isEdit ? pb : (pb ? shift(s.pay_by) : null));
        setRules(s.rules_text ?? '');
        setSkillLevel(s.skill_level ?? null);
        setAgeReq(s.age_req ?? null);
        setGenderReq(s.gender_req ?? null);
        setBookingStatus(s.booking_status ?? null);
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
        setJoinApproval(s.join_requires_approval ?? false);
        const preset = presetClubIcon(s.image_path);
        setImagePreset(preset ? preset.id : null);
        setIconColor(presetClubColor(s.image_path)?.slice(1) ?? null);
        setOldImagePath(preset ? null : (s.image_path ?? null));
        if (isEdit) {
          const map: Record<string, string> = {};
          for (const p of participants) if (p.user_id) map[p.id] = p.user_id;
          linkedUserIds.current = map;
        }
        setRoster(
          // Join requests (pending/declined) are NOT roster rows — they're
          // managed from the detail screen's Requests section. Loading them
          // here would rewrite or duplicate them on save.
          participants.filter((p) => p.join_status === 'active').map((p) => ({
            key: nextKey(),
            id: isEdit ? p.id : undefined,
            name: p.name,
            slot: p.slot,
            amount: p.share_amount != null ? String(p.share_amount) : '',
            team: p.team_idx ?? null,
            status: isEdit ? p.status : undefined,
          })),
        );
        if (templateFrom) setTemplateTitle(s.title);
      })
      .catch(() => showToast(t.collectz.createError, 'error'))
      .finally(() => { if (alive) setPrefilling(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSessionId, templateFrom]);

  // ── Draft autosave — the whole form (minus image uploads) persists to
  // AsyncStorage 600ms after the last change. Coming back to a screen with a
  // draft shows a tappable banner — NOTHING is applied until you tap Restore;
  // typing something fresh quietly replaces the stored draft. ──
  const draftKey = `@potraces/collectzDraft/v1/${isEdit ? `edit-${editSessionId}` : templateFrom ? `tpl-${templateFrom}` : 'new'}`;
  const draftChecked = useRef(false);
  const [draftAvailable, setDraftAvailable] = useState<Record<string, any> | null>(null);

  const applyDraft = (d: Record<string, any>) => {
    setTitle(d.title ?? '');
    setCategory(d.category ?? null);
    setEventAt(d.eventAt ? new Date(d.eventAt) : null);
    setEventEnd(d.eventEnd ? new Date(d.eventEnd) : null);
    setVenue(d.venue ?? '');
    setMapsUrl(d.mapsUrl ?? '');
    setSocialHandles(d.socialHandles ?? { ig: '', x: '', threads: '', fb: '', telegram: '' });
    setGroupUrl(d.groupUrl ?? '');
    setDetails(d.details ?? '');
    setScheme(d.scheme ?? 'flat');
    setShareAmount(d.shareAmount ?? '');
    setTotalAmount(d.totalAmount ?? '');
    setPayBy(d.payBy ? new Date(d.payBy) : null);
    setRules(d.rules ?? '');
    setSkillLevel(d.skillLevel ?? null);
    setAgeReq(d.ageReq ?? null);
    setGenderReq(d.genderReq ?? null);
    setBookingStatus(d.bookingStatus ?? null);
    if (Array.isArray(d.roster)) {
      setRoster(d.roster);
      for (const r of d.roster) {
        const m = /^row-(\d+)$/.exec(r?.key ?? '');
        if (m) keySeq.current = Math.max(keySeq.current, Number(m[1]));
      }
    }
    setCapMode(d.capMode ?? 'none');
    setMaxPlayers(d.maxPlayers ?? 10);
    setTeamCount(d.teamCount ?? 2);
    setTeamNames(Array.isArray(d.teamNames) ? d.teamNames : []);
    setTeamSize(d.teamSize ?? 5);
    setJoinApproval(d.joinApproval ?? false);
    setQrPayload(d.qrPayload ?? null);
    setQrLabel(d.qrLabel ?? null);
    setQrImagePath(d.qrImagePath ?? null);
    setCurrency(d.currency ?? appCurrency);
    setImagePreset(d.imagePreset ?? null);
    setIconColor(d.iconColor ?? null);
    setOldImagePath(d.oldImagePath ?? null);
    if (isEdit && Array.isArray(d.removedIds)) setRemovedIds(d.removedIds);
  };

  const restoreDraft = () => {
    if (!draftAvailable) return;
    lightTap();
    applyDraft(draftAvailable);
    setDraftAvailable(null);
    showToast(t.collectz.draftRestored, 'info');
  };

  const discardDraft = () => {
    lightTap();
    setDraftAvailable(null);
    AsyncStorage.removeItem(draftKey).catch(() => {});
  };

  // The persistable form snapshot (everything but image uploads + savedAt,
  // which is added at write time). Compared against a baseline so only real
  // user edits trigger a write — never the mount run or the banner appearing.
  const serializeDraft = () => ({
    title, category,
    eventAt: eventAt ? eventAt.toISOString() : null,
    eventEnd: eventEnd ? eventEnd.toISOString() : null,
    venue, mapsUrl, socialHandles, groupUrl, details, scheme,
    shareAmount, totalAmount,
    payBy: payBy ? payBy.toISOString() : null,
    rules, roster, capMode, maxPlayers, teamCount, teamNames, teamSize,
    skillLevel, ageReq, genderReq, bookingStatus, joinApproval,
    qrPayload, qrLabel, qrImagePath, currency, imagePreset, iconColor, oldImagePath,
    removedIds,
  });
  const draftBaseline = useRef<string>('');

  // Check storage once (after any prefill) and OFFER the draft via the banner.
  useEffect(() => {
    if (prefilling || draftChecked.current) return;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(draftKey);
        if (raw) {
          const d = JSON.parse(raw);
          // Edit mode: a draft older than the server's last update is stale — drop it.
          if (isEdit && original.current?.updated_at && !(d.savedAt > new Date(original.current.updated_at).getTime())) {
            AsyncStorage.removeItem(draftKey).catch(() => {});
          } else {
            setDraftAvailable(d);
          }
        }
      } catch {
        // A corrupt draft is disposable — ignore it and start clean.
      } finally {
        // Baseline = the form as it stands now (fresh or server-prefilled).
        // Only a CHANGE from this point counts as user input for autosave.
        draftBaseline.current = JSON.stringify(serializeDraft());
        draftChecked.current = true;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilling, draftKey]);

  useEffect(() => {
    if (prefilling) return;
    const h = setTimeout(() => {
      if (!draftChecked.current) return;
      const json = JSON.stringify(serializeDraft());
      // No user edit since the baseline — do NOT write (and never dismiss the
      // banner). This is what kept auto-vanishing the restore offer.
      if (json === draftBaseline.current) return;
      draftBaseline.current = json;
      // Typing with the banner up = "start fresh": the offer goes away and the
      // new content becomes the draft.
      setDraftAvailable((cur) => (cur ? null : cur));
      AsyncStorage.setItem(draftKey, JSON.stringify({ savedAt: Date.now(), ...JSON.parse(json) })).catch(() => {});
    }, 600);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilling, draftKey, title, category, eventAt, eventEnd, venue, mapsUrl, socialHandles, groupUrl, details, scheme, shareAmount, totalAmount, payBy, rules, roster, capMode, maxPlayers, teamCount, teamNames, teamSize, skillLevel, ageReq, genderReq, bookingStatus, joinApproval, qrPayload, qrLabel, qrImagePath, currency, imagePreset, iconColor, oldImagePath, removedIds]);

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
  // Player-requirement value labels (null state = "Optional" in the row).
  const skillLabels: Record<string, string> = {
    beginner: t.collectz.reqSkillBeginner,
    intermediate: t.collectz.reqSkillIntermediate,
    advanced: t.collectz.reqSkillAdvanced,
    any: t.collectz.reqSkillAny,
  };
  const ageLabels: Record<string, string> = {
    below_18: t.collectz.reqAgeBelow18,
    '18_above': t.collectz.reqAge18Above,
    any: t.collectz.reqAgeAny,
  };
  const genderLabels: Record<string, string> = {
    male: t.collectz.reqGenderMale,
    female: t.collectz.reqGenderFemale,
    any: t.collectz.reqGenderAny,
  };
  const bookingLabels: Record<string, string> = {
    booked: t.collectz.reqBookingBooked,
    later: t.collectz.reqBookingLater,
  };
  // One summary row in the requirements card — every row opens the same sheet.
  const reqRow = (label: string, value: string | null) => (
    <Pressable style={styles.cardRow} onPress={() => openSheet('requirements')} accessibilityRole="button">
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowValueWrap}>
        <Text style={value ? styles.rowValue : styles.rowValueDim}>{value ?? t.collectz.optionalValue}</Text>
        <Feather name="chevron-right" size={15} color={C.textMuted} />
      </View>
    </Pressable>
  );

  // Effective cap (null = no limit) + how many active names are filled. Drives the
  // "x of y spots" counter and locks "Add name" once the roster is full.
  const capacityMax =
    capMode === 'total' ? maxPlayers : capMode === 'teams' ? teamCount * teamSize : null;
  const activeFilled = roster.filter((r) => r.name.trim() && r.slot === 'active').length;
  const rosterFull = capacityMax != null && activeFilled >= capacityMax;
  // Filled contact channels — drives the contact summary row ("2 added").
  const contactCount =
    SOCIAL_PLATFORMS.filter((p) => socialHandles[p.key].trim()).length +
    (isWhatsappGroupUrl(groupUrl) ? 1 : 0);
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
  const pickerValue = picker
    ? (picker.field === 'event' ? eventAt : picker.field === 'eventEnd' ? (eventEnd ?? eventAt) : payBy) ?? new Date()
    : new Date();

  // End is time-only in the UI: anchor its time-of-day to the START's calendar
  // day, and if that lands at/before the start it's an after-midnight end
  // (e.g. an 11pm–1am game), so roll it to the next day.
  const anchorEnd = (start: Date | null, h: number, m: number): Date => {
    const base = start ? new Date(start) : new Date();
    base.setHours(h, m, 0, 0);
    if (start && base.getTime() <= start.getTime()) base.setDate(base.getDate() + 1);
    return base;
  };

  const applyPicked = (date: Date) => {
    if (!picker) return;
    if (picker.field === 'eventEnd') {
      setEventEnd(anchorEnd(eventAt, date.getHours(), date.getMinutes()));
      return;
    }
    const current = picker.field === 'event' ? eventAt : payBy;
    const next = current ? new Date(current) : new Date();
    if (picker.mode === 'date') next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    else next.setHours(date.getHours(), date.getMinutes(), 0, 0);
    if (picker.field === 'event') {
      setEventAt(next);
      // Keep the end on the same night as the (edited) start — otherwise it stays
      // stuck on whatever day it was first set, and the window reads backwards.
      setEventEnd((prev) => (prev ? anchorEnd(next, prev.getHours(), prev.getMinutes()) : prev));
    } else setPayBy(next);
  };

  const onPickerChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') setPicker(null);
    if (event.type === 'dismissed' || !date) return;
    applyPicked(date);
  };

  // In-card date/time row: label left, small date/time pills right. Tapping a
  // pill opens the same picker overlay as before — only the presentation changed.
  const rowWhen = (
    label: string,
    value: Date | null,
    field: 'event' | 'eventEnd' | 'payBy',
    opts?: { timeOnly?: boolean; onClear?: () => void },
  ) => (
    <>
      <View style={styles.cardRow}>
        <Text style={styles.rowLabel}>{label}</Text>
        <View style={styles.rowValueWrap}>
          {!opts?.timeOnly && (
            <Pressable style={styles.whenPill} onPress={() => { selectionChanged(); setPicker({ field, mode: 'date' }); }}>
              <Text style={[styles.whenPillText, !value && styles.whenTextDim]}>
                {value ? fmtDate(value.toISOString()) : t.collectz.pickDate}
              </Text>
            </Pressable>
          )}
          <Pressable style={styles.whenPill} onPress={() => { selectionChanged(); setPicker({ field, mode: 'time' }); }}>
            <Text style={[styles.whenPillText, !value && styles.whenTextDim]}>
              {value ? fmtTime(value.toISOString()) : t.collectz.pickTime}
            </Text>
          </Pressable>
          {value && opts?.onClear && (
            <Pressable onPress={opts.onClear} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.common.clear}>
              <Feather name="x-circle" size={16} color={C.textMuted} />
            </Pressable>
          )}
        </View>
      </View>
      <View style={styles.rowDivider} />
    </>
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
    if (imagePreset) return `${CLUB_PRESET_PREFIX}${imagePreset}${iconColor ? `:${iconColor}` : ''}`;
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
    maps_url: string | null;
    qr_payload: string | null;
    qr_image_path: string | null;
    event_at: string | null;
    event_end: string | null;
    pay_by: string | null;
    max_participants: number | null;
    team_count: number | null;
    team_size: number | null;
    scheme: CollectzScheme;
    total_amount: number | null;
    default_share: number | null;
  }): string | null => {
    const s = original.current;
    if (!s) return null;
    const parts: string[] = [];
    if ((s.venue ?? '') !== (next.venue ?? '')) parts.push(`${t.collectz.changeVenue.replace('{v}', next.venue ?? '—')}`);
    if ((s.maps_url ?? '') !== (next.maps_url ?? '')) parts.push(t.collectz.changeMaps);
    if (!sameInstant(s.event_at, next.event_at) || !sameInstant(s.event_end, next.event_end)) parts.push(t.collectz.changeTime);
    if (!sameInstant(s.pay_by, next.pay_by)) parts.push(t.collectz.changePayBy);
    // QR changes move real money — participants must re-scan, never slip it in silently.
    if ((s.qr_payload ?? null) !== (next.qr_payload ?? null) || (s.qr_image_path ?? null) !== (next.qr_image_path ?? null)) {
      parts.push(t.collectz.changeQr);
    }
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
    // Money changes are the ones participants MUST hear about — a silent price
    // edit leaves people paying the old amount. Reuses the field labels in the
    // same "X → Y" shape as changeVenue.
    if (s.scheme !== next.scheme) {
      parts.push(`${t.collectz.fieldScheme} → ${schemeLabels[next.scheme]}`);
    }
    if ((s.default_share ?? null) !== (next.default_share ?? null) && next.default_share != null) {
      parts.push(`${t.collectz.fieldShareAmount.replace('{currency}', currency)} → ${next.default_share.toFixed(2)}`);
    }
    if ((s.total_amount ?? null) !== (next.total_amount ?? null) && next.total_amount != null) {
      parts.push(`${t.collectz.fieldTotalAmount.replace('{currency}', currency)} → ${next.total_amount.toFixed(2)}`);
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
      if (d.category) setCategory(d.category);
      let evAt: Date | null = null;
      if (d.event_at) {
        const dt = new Date(d.event_at);
        if (!isNaN(dt.getTime())) { evAt = dt; setEventAt(dt); }
      }
      if (d.event_end) {
        const dt = new Date(d.event_end);
        // Normalize like the picker: anchor the end's time to the start's day and
        // roll past midnight if it lands at/before the start. The model often
        // forgets the +1 day on "9pm-1am", which would otherwise render a
        // backwards range on the detail screen AND in the WhatsApp blast.
        if (!isNaN(dt.getTime())) setEventEnd(evAt ? anchorEnd(evAt, dt.getHours(), dt.getMinutes()) : dt);
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
      // Player requirements — only set what the message actually stated.
      if (d.skill_level) setSkillLevel(d.skill_level);
      if (d.age_req) setAgeReq(d.age_req);
      if (d.gender_req) setGenderReq(d.gender_req);
      if (d.booking_status) setBookingStatus(d.booking_status);
      // Numbered TEAM blocks → set the "teams" capacity so the roster keeps its
      // structure (4 teams × 5), and each player lands in their block.
      const teamed = d.team_count != null && d.team_size != null;
      if (teamed) {
        setCapMode('teams');
        setTeamCount(d.team_count!);
        setTeamSize(d.team_size!);
      } else if (d.max_participants != null) {
        // Flat roster + a closed session ("FULL", "20 slot sahaja") → total cap.
        setCapMode('total');
        setMaxPlayers(d.max_participants);
      }
      if (d.roster.length > 0) {
        setRoster(
          d.roster.map((r) => ({
            key: nextKey(),
            name: r.name,
            slot: r.slot,
            amount: '',
            // Only active players hold a team slot (matches doSave + reserve rule).
            team: teamed && r.slot === 'active' ? (r.team ?? null) : null,
          })),
        );
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
    // Organizer contact: normalize handles → canonical URLs, drop invalid group links.
    const socialsOut: CollectzSocials = {};
    for (const p of SOCIAL_PLATFORMS) {
      const url = normalizeSocial(p.key, socialHandles[p.key]);
      if (url) socialsOut[p.key] = url;
    }
    const contactPayload = {
      socials: Object.keys(socialsOut).length ? socialsOut : null,
      group_url: isWhatsappGroupUrl(groupUrl) ? groupUrl.trim() : null,
    };
    // Step tag for the dev error toast — RLS/Postgres errors don't name the
    // table, so without this we can't tell a QR upload failure from a roster one.
    let saveStep = 'prep';
    try {
      if (isEdit && editSessionId) {
        // ── Edit path: update the session, reconcile the roster, maybe notify ──
        const next = {
          title: title.trim(),
          category,
          event_at: eventAt ? eventAt.toISOString() : null,
          event_end: eventEnd ? eventEnd.toISOString() : null,
          venue: venue.trim() || null,
          maps_url: mapsUrl.trim() || null,
          ...contactPayload,
          details_text: details.trim() || null,
          rules_text: rules.trim() || null,
          scheme,
          skill_level: skillLevel,
          age_req: ageReq,
          gender_req: genderReq,
          booking_status: bookingStatus,
          // Persisted for ALL schemes: for 'equal' it's the split base, otherwise
          // the informational court/venue cost (never fed into share math).
          total_amount: parseAmount(totalAmount),
          default_share: scheme === 'flat' ? parseAmount(shareAmount) : null,
          currency,
          pay_by: payBy ? payBy.toISOString() : null,
          qr_payload: qrPayload,
          max_participants: capacityMax,
          team_count: capMode === 'teams' ? teamCount : null,
          team_size: capMode === 'teams' ? teamSize : null,
          team_names: teamNamesPayload(),
          join_requires_approval: joinApproval,
          image_path: null as string | null,
          qr_image_path: null as string | null,
        };
        saveStep = 'club-image';
        next.image_path = await resolveImagePath(editSessionId);
        // Photo QR: upload the newly-picked picture, else keep whatever was stored.
        saveStep = 'qr-upload';
        next.qr_image_path = qrImageUri
          ? await uploadQrImage(editSessionId, { uri: qrImageUri })
          : qrImagePath;
        saveStep = 'update-session';
        await updateSession(editSessionId, next);
        // Roster diff: removals first, then updates, then additions.
        saveStep = 'roster';
        for (const id of removedIds) {
          // Tell the removed person first — collectz-notify's 'removed' kind
          // pushes to the participant_user_id we pass, and must fire BEFORE the
          // row is deleted (mirrors CollectzDetail's remove flow). Best-effort:
          // a missed push must never block the removal itself.
          const uid = linkedUserIds.current[id];
          if (uid) {
            await supabasePersonal.functions
              .invoke('collectz-notify', { body: { sessionId: editSessionId, kind: 'removed', participant_user_id: uid } })
              .catch(() => {});
          }
          await removeParticipant(id);
        }
        for (const r of roster) {
          const amount = scheme === 'custom' ? parseAmount(r.amount) : null;
          const team = capMode === 'teams' && r.slot === 'active' ? r.team : null;
          if (r.id) {
            // Confirmed rows keep their confirm-time share lock: writing null on a
            // flat/equal save would re-derive their share from the new roster and
            // silently move money someone already paid.
            const patch: Parameters<typeof updateParticipant>[1] = { name: r.name.trim(), slot: r.slot, team_idx: team };
            if (scheme === 'custom' || r.status !== 'confirmed') patch.share_amount = amount;
            await updateParticipant(r.id, patch);
          } else {
            await addParticipant(editSessionId, r.name.trim(), { slot: r.slot, share_amount: amount, team_idx: team });
          }
        }
        // Notify participants when the change matters and the box is ticked.
        const summary = changeSummary(next);
        if (notifyChanges && summary) {
          notifySession(editSessionId, 'edited', summary).catch(() => {});
        }
        AsyncStorage.removeItem(draftKey).catch(() => {});
        successNotification();
        navigation.goBack();
        return;
      }

      // ── Create path (blank or template) ──
      saveStep = 'create-session';
      const session = await createSession({
        title: title.trim(),
        category,
        event_at: eventAt ? eventAt.toISOString() : null,
        event_end: eventEnd ? eventEnd.toISOString() : null,
        venue: venue.trim() || null,
        maps_url: mapsUrl.trim() || null,
        ...contactPayload,
        details_text: details.trim() || null,
        rules_text: rules.trim() || null,
        scheme,
        skill_level: skillLevel,
        age_req: ageReq,
        gender_req: genderReq,
        booking_status: bookingStatus,
        // Persisted for ALL schemes: for 'equal' it's the split base, otherwise
        // the informational court/venue cost (never fed into share math).
        total_amount: parseAmount(totalAmount),
        default_share: scheme === 'flat' ? parseAmount(shareAmount) : null,
        currency,
        pay_by: payBy ? payBy.toISOString() : null,
        qr_payload: qrPayload,
        max_participants: capacityMax,
        team_count: capMode === 'teams' ? teamCount : null,
        team_size: capMode === 'teams' ? teamSize : null,
        team_names: teamNamesPayload(),
        join_requires_approval: joinApproval,
        image_path: imagePreset ? `${CLUB_PRESET_PREFIX}${imagePreset}${iconColor ? `:${iconColor}` : ''}` : oldImagePath,
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
      saveStep = 'roster';
      for (const r of rows) {
        // Sequential keeps failures attributable to a specific name.
        await addParticipant(session.id, r.name.trim(), {
          slot: r.slot,
          share_amount: scheme === 'custom' ? parseAmount(r.amount) : null,
          team_idx: capMode === 'teams' && r.slot === 'active' ? r.team : null,
        });
      }
      successNotification();
      AsyncStorage.removeItem(draftKey).catch(() => {});
      // Confirmation first (was: navigate + auto-open the share sheet). The modal
      // shows a summary + the code/link to copy, and owns "Share" + "View session".
      setCreatedSession({
        session,
        activeCount: rows.filter((r) => r.slot === 'active').length,
        rosterCount: rows.length,
      });
    } catch (err) {
      errorNotification();
      // Keep the friendly copy in production, but append the real reason in dev —
      // a bare "try again" hid a plain schema error (missing column) for a whole
      // debugging round.
      const detail = err instanceof Error && err.message ? err.message : '';
      showToast(__DEV__ && detail ? `${t.collectz.createError} [${saveStep}] — ${detail}` : t.collectz.createError, 'error');
    } finally {
      setSaving(false);
    }
  }, [saving, isEdit, editSessionId, title, category, eventAt, eventEnd, venue, mapsUrl, socialHandles, groupUrl, details, rules, scheme, totalAmount, shareAmount, currency, payBy, qrPayload, qrImageUri, qrImagePath, imagePreset, imageUpload, oldImagePath, removedIds, roster, notifyChanges, capacityMax, capMode, teamCount, teamSize, teamNames, joinApproval, skillLevel, ageReq, genderReq, bookingStatus, navigation, showToast, t]);

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

        {/* Draft offer — nothing is applied unless you tap Restore; ✕ discards,
            typing something fresh replaces it. */}
        {!!draftAvailable && (
          <View style={[styles.draftBanner, neuF.raisedSoft]}>
            <Feather name="clock" size={14} color={C.textMuted} />
            <Text style={styles.draftBannerText} numberOfLines={1}>
              {fill(t.collectz.draftBannerTitle, {
                when: `${fmtDate(new Date(draftAvailable.savedAt).toISOString())} · ${fmtTime(new Date(draftAvailable.savedAt).toISOString())}`,
              })}
            </Text>
            <Pressable onPress={restoreDraft} hitSlop={8} accessibilityRole="button">
              <Text style={styles.draftRestore}>{t.collectz.draftRestore}</Text>
            </Pressable>
            <Pressable onPress={discardDraft} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.common.clear}>
              <Feather name="x" size={16} color={C.textMuted} />
            </Pressable>
          </View>
        )}

        {/* ── BASICS ── */}
        <Text style={styles.sectionLabel}>{t.collectz.secBasics}</Text>
        <View style={[styles.gCard, neuF.raisedSoft]}>
          <View style={[styles.cardRow, styles.cardRowCol]}>
            <Text style={styles.rowLabel}>{t.collectz.fieldTitle} <Text style={styles.requiredStar}>*</Text></Text>
            <TextInput
              style={styles.rowInput}
              value={title}
              onChangeText={setTitle}
              placeholder={t.collectz.fieldTitlePlaceholder}
              placeholderTextColor={withAlpha(C.textMuted, 0.55)}
              multiline
            />
          </View>
          <View style={styles.rowDivider} />
          <Pressable style={styles.cardRow} onPress={() => openSheet('category')} accessibilityRole="button">
            <Text style={styles.rowLabel}>{t.collectz.fieldCategory}</Text>
            <View style={styles.rowValueWrap}>
              {category ? (
                <MaterialCommunityIcons name={collectzCategoryIcon(category) as any} size={16} color={C.textSecondary} />
              ) : null}
              <Text style={category ? styles.rowValue : styles.rowValueDim}>
                {category ? catLabels[category] : t.collectz.chooseValue}
              </Text>
              <Feather name="chevron-right" size={15} color={C.textMuted} />
            </View>
          </Pressable>
          <View style={styles.rowDivider} />
          <Pressable style={styles.cardRow} onPress={() => openSheet('icon')} accessibilityRole="button">
            <Text style={styles.rowLabel}>{t.collectz.fieldImage}</Text>
            <View style={styles.rowValueWrap}>
              {imagePreset ? (
                <MaterialCommunityIcons
                  name={(presetClubIcon(`${CLUB_PRESET_PREFIX}${imagePreset}`)?.icon ?? 'account-group') as any}
                  size={20}
                  color={iconColor ? `#${iconColor}` : C.textSecondary}
                />
              ) : imageUpload ? (
                <Image source={{ uri: imageUpload.uri }} style={styles.rowThumb} />
              ) : oldImagePath ? (
                <Image source={{ uri: clubImageUrl(oldImagePath) }} style={styles.rowThumb} />
              ) : (
                <Text style={styles.rowValueDim}>{t.collectz.chooseValue}</Text>
              )}
              <Feather name="chevron-right" size={15} color={C.textMuted} />
            </View>
          </Pressable>
        </View>

        {/* ── PLAYER REQUIREMENTS ── */}
        <Text style={styles.sectionLabel}>{t.collectz.secRequirements}</Text>
        <View style={[styles.gCard, neuF.raisedSoft]}>
          {reqRow(t.collectz.reqSkill, skillLevel ? skillLabels[skillLevel] : null)}
          <View style={styles.rowDivider} />
          {reqRow(t.collectz.reqAge, ageReq ? ageLabels[ageReq] : null)}
          <View style={styles.rowDivider} />
          {reqRow(t.collectz.reqGender, genderReq ? genderLabels[genderReq] : null)}
          <View style={styles.rowDivider} />
          {reqRow(t.collectz.reqBooking, bookingStatus ? bookingLabels[bookingStatus] : null)}
        </View>

        {/* ── SCHEDULE ── */}
        <Text style={styles.sectionLabel}>{t.collectz.secSchedule}</Text>
        <View style={[styles.gCard, neuF.raisedSoft]}>
          {rowWhen(t.collectz.fieldEventAt, eventAt, 'event')}
          {rowWhen(t.collectz.fieldEventEnd, eventEnd, 'eventEnd', { timeOnly: true, onClear: () => setEventEnd(null) })}
          <View style={[styles.cardRow, styles.cardRowCol]}>
            <Text style={styles.rowLabel}>{t.collectz.fieldVenue}</Text>
            <TextInput
              style={styles.rowInput}
              value={venue}
              onChangeText={setVenue}
              placeholder={t.collectz.fieldVenuePlaceholder}
              placeholderTextColor={withAlpha(C.textMuted, 0.55)}
              multiline
            />
          </View>
          <View style={styles.rowDivider} />
          <View style={[styles.cardRow, styles.cardRowCol]}>
            <Text style={styles.rowLabel}>{t.collectz.fieldMaps}</Text>
            <TextInput
              style={styles.rowInput}
              value={mapsUrl}
              onChangeText={setMapsUrl}
              placeholder={t.collectz.fieldMapsPlaceholder}
              placeholderTextColor={withAlpha(C.textMuted, 0.55)}
              autoCapitalize="none"
              keyboardType="url"
              multiline
            />
            {!!mapsUrl.trim() && isMapsLink(mapsUrl.trim()) && (
              <MapPreviewCard mapsUrl={mapsUrl.trim()} compact />
            )}
          </View>
        </View>

        {/* ── PAYMENT ── */}
        <Text style={styles.sectionLabel}>{t.collectz.secPayment}</Text>
        <View style={[styles.gCard, neuF.raisedSoft]}>
          <Pressable style={styles.cardRow} onPress={() => openSheet('scheme')} accessibilityRole="button">
            <Text style={styles.rowLabel}>{t.collectz.fieldScheme}</Text>
            <View style={styles.rowValueWrap}>
              <Text style={styles.rowValue}>{schemeLabels[scheme]}</Text>
              <Feather name="chevron-right" size={15} color={C.textMuted} />
            </View>
          </Pressable>
          <View style={styles.rowDivider} />
          {scheme === 'flat' && (
            <>
              <View style={styles.cardRow}>
                <Text style={styles.rowLabel}>{t.collectz.fieldShareAmount.replace('{currency}', currency)}</Text>
                <TextInput
                  style={styles.rowAmountInput}
                  value={shareAmount}
                  onChangeText={setShareAmount}
                  placeholder="0.00"
                  placeholderTextColor={withAlpha(C.textMuted, 0.55)}
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.rowDivider} />
            </>
          )}
          {/* Total / court cost — always available. For "equal" it's the number that
              gets divided; for flat/custom it's the informational venue/court cost
              (e.g. "Harga Court: RM180") so it's never lost. */}
          <View style={styles.cardRow}>
            <Text style={styles.rowLabel}>
              {(scheme === 'equal' ? t.collectz.fieldTotalAmount : t.collectz.fieldCourtCost).replace('{currency}', currency)}
            </Text>
            <TextInput
              style={styles.rowAmountInput}
              value={totalAmount}
              onChangeText={setTotalAmount}
              placeholder="0.00"
              placeholderTextColor={withAlpha(C.textMuted, 0.55)}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.rowDivider} />
          {/* Currency is NOT chosen here — it follows the app currency (Settings).
              Editing an existing session keeps whatever it was created with. */}
          {rowWhen(t.collectz.fieldPayBy, payBy, 'payBy', { onClear: () => setPayBy(null) })}
          <Pressable style={styles.cardRow} onPress={() => openSheet('details')} accessibilityRole="button">
            <Text style={styles.rowLabel}>{t.collectz.fieldDetails}</Text>
            <View style={styles.rowValueWrap}>
              <Text style={details.trim() ? styles.rowValuePreview : styles.rowValueDim}>
                {details.trim() ? details.trim() : t.collectz.optionalValue}
              </Text>
              <Feather name="chevron-right" size={15} color={C.textMuted} />
            </View>
          </Pressable>
          <View style={styles.rowDivider} />
          <Pressable style={styles.cardRow} onPress={() => openSheet('rules')} accessibilityRole="button">
            <Text style={styles.rowLabel}>{t.collectz.fieldRules}</Text>
            <View style={styles.rowValueWrap}>
              <Text style={rules.trim() ? styles.rowValuePreview : styles.rowValueDim}>
                {rules.trim() ? rules.trim() : t.collectz.optionalValue}
              </Text>
              <Feather name="chevron-right" size={15} color={C.textMuted} />
            </View>
          </Pressable>
        </View>

        {/* ── CONTACT (single summary row — the 6 optional inputs live in the sheet) ── */}
        <Text style={styles.sectionLabel}>{t.collectz.fieldContact}</Text>
        <View style={[styles.gCard, neuF.raisedSoft]}>
          <Pressable style={styles.cardRow} onPress={() => openSheet('contact')} accessibilityRole="button">
            <Text style={styles.rowLabel}>{t.collectz.fieldContact}</Text>
            <View style={styles.rowValueWrap}>
              {contactCount > 0 ? (
                <Text style={styles.rowValue}>{fill(t.collectz.contactAdded, { n: contactCount })}</Text>
              ) : (
                <Text style={styles.rowValueDim}>{t.collectz.optionalValue}</Text>
              )}
              <Feather name="chevron-right" size={15} color={C.textMuted} />
            </View>
          </Pressable>
        </View>

        {/* ── ROSTER ── capacity is a summary row; the config lives in its sheet */}
        <Text style={styles.sectionLabel}>{t.collectz.fieldRoster}</Text>
        <View style={[styles.gCard, neuF.raisedSoft]}>
          <Pressable style={styles.cardRow} onPress={() => openSheet('capacity')} accessibilityRole="button">
            <Text style={styles.rowLabel}>{t.collectz.capacity}</Text>
            <View style={styles.rowValueWrap}>
              <Text style={styles.rowValue}>
                {capMode === 'none'
                  ? t.collectz.capacityNone
                  : capMode === 'total'
                    ? fill(t.collectz.capacityValueTotal, { n: maxPlayers })
                    : fill(t.collectz.capacityTeamsValue, { t: teamCount, n: teamSize })}
              </Text>
              <Feather name="chevron-right" size={15} color={C.textMuted} />
            </View>
          </Pressable>
          {capacityMax != null && (
            <Text style={[styles.capCount, styles.cardHint, activeFilled > capacityMax && styles.capCountOver]}>
              {activeFilled > capacityMax
                ? fill(t.collectz.capacityOver, { n: activeFilled, max: capacityMax })
                : fill(t.collectz.capacityCount, { n: activeFilled, max: capacityMax })}
            </Text>
          )}
        </View>

        {/* Join approval — self-adds queue for the organizer's OK. Off by
            default; names the organizer adds below always join instantly. */}
        <View style={[styles.gCard, neuF.raisedSoft]}>
          <Pressable
            style={styles.cardRow}
            onPress={() => { selectionChanged(); setJoinApproval((v) => !v); }}
            accessibilityRole="button"
            accessibilityState={{ checked: joinApproval }}
          >
            <Text style={styles.rowLabel}>{t.collectz.joinApproval}</Text>
            <View style={styles.rowValueWrap}>
              <Feather name={joinApproval ? 'check-square' : 'square'} size={16} color={joinApproval ? C.accent : C.textMuted} />
            </View>
          </Pressable>
          <Text style={styles.cardHint}>{t.collectz.joinApprovalHint}</Text>
        </View>

        {/* Roster editor — names stay inline; everything else moved to sheets */}
        <View style={styles.fieldGroup}>
          {roster.map((row) => (
          <React.Fragment key={row.key}>
            <View style={styles.rosterRow}>
              <TextInput
                style={[styles.input, styles.rosterName]}
                value={row.name}
                onChangeText={(v) => patchRow(row.key, { name: v })}
                placeholder={t.collectz.rosterNamePlaceholder}
                placeholderTextColor={withAlpha(C.textMuted, 0.55)}
                multiline
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

        {/* ── PAYMENT QR ── summary row; saved QRs are picked in the sheet */}
        <Text style={styles.sectionLabel}>{t.collectz.fieldQr}</Text>
        <View style={[styles.gCard, neuF.raisedSoft]}>
          <Pressable
            style={styles.cardRow}
            onPress={() => paymentQrs.length > 0 && openSheet('qr')}
            disabled={paymentQrs.length === 0}
            accessibilityRole="button"
          >
            <Text style={styles.rowLabel}>{t.collectz.fieldQr}</Text>
            <View style={styles.rowValueWrap}>
              <Text style={qrLabel ? styles.rowValue : styles.rowValueDim}>{qrLabel ?? t.collectz.qrNone}</Text>
              {paymentQrs.length > 0 && <Feather name="chevron-right" size={15} color={C.textMuted} />}
            </View>
          </Pressable>
          {paymentQrs.length === 0 && (
            <Text style={styles.cardHint}>{t.collectz.qrEmptyHint}</Text>
          )}
          {/* Photo QR is allowed — just tell the organizer the amount won't auto-fill. */}
          {!qrPayload && (qrImageUri || qrImagePath) && (
            <Text style={styles.cardHint}>{t.collectz.qrNoPayload}</Text>
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

      {/* ── Section sheets — summary rows above open these; the form stays a
          one-page overview while each editor gets full keyboard room. ── */}

      {/* Category picker */}
      <BottomSheet
        visible={sheet === 'category'}
        onClose={() => setSheet(null)}
        header={<Text style={styles.sheetTitle}>{t.collectz.fieldCategory}</Text>}
        maxHeightPct={0.55}
      >
        <View style={styles.sheetBody}>
          {CATEGORIES.map((key) => (
            <Pressable
              key={key}
              style={styles.sheetRow}
              onPress={() => { selectionChanged(); setCategory(category === key ? null : key); setSheet(null); }}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name={collectzCategoryIcon(key) as any} size={20} color={C.textSecondary} />
              <Text style={styles.sheetRowText}>{catLabels[key]}</Text>
              {category === key && <Feather name="check" size={17} color={C.accent} />}
            </Pressable>
          ))}
        </View>
      </BottomSheet>

      {/* Club icon picker — the grid moved here from the form (same tiles, plus
          upload). The grid focuses on the picked category. */}
      <BottomSheet
        visible={sheet === 'icon'}
        onClose={() => setSheet(null)}
        header={<Text style={styles.sheetTitle}>{t.collectz.fieldImage}</Text>}
        maxHeightPct={0.85}
      >
        <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          <View style={styles.iconGrid}>
            {clubIconsForCategory(category).map((icon) => (
              <Pressable
                key={icon.id}
                style={[styles.iconTile, imagePreset === icon.id && styles.iconTileActive]}
                onPress={() => { pickPreset(icon.id); }}
                accessibilityRole="button"
                accessibilityLabel={icon.id}
              >
                <MaterialCommunityIcons
                  name={icon.icon as any}
                  size={22}
                  color={imagePreset === icon.id ? (iconColor ? `#${iconColor}` : C.accent) : C.textSecondary}
                />
              </Pressable>
            ))}
            <Pressable
              style={[styles.iconTile, (imageUpload || (!imagePreset && oldImagePath)) && styles.iconTileActive]}
              onPress={async () => { await pickUpload(); setSheet(null); }}
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
          {/* Color swatches — appear once an icon is picked; tap the active one
              again to go back to the default accent. Stored in the preset marker. */}
          {imagePreset && (
            <>
              <Text style={styles.swatchLabel}>{t.collectz.iconColorLabel}</Text>
              <View style={styles.swatchRow}>
                {CLUB_ICON_COLORS.map((hex) => {
                  const active = iconColor === hex;
                  return (
                    <Pressable
                      key={hex}
                      style={[styles.swatch, { backgroundColor: `#${hex}` }, active && styles.swatchActive]}
                      onPress={() => { selectionChanged(); setIconColor(active ? null : hex); }}
                      accessibilityRole="button"
                      accessibilityLabel={`#${hex}`}
                    />
                  );
                })}
              </View>
            </>
          )}
        </ScrollView>
      </BottomSheet>

      {/* Payment scheme picker */}
      <BottomSheet
        visible={sheet === 'scheme'}
        onClose={() => setSheet(null)}
        header={<Text style={styles.sheetTitle}>{t.collectz.fieldScheme}</Text>}
        maxHeightPct={0.5}
      >
        <View style={styles.sheetBody}>
          {(['flat', 'equal', 'custom'] as CollectzScheme[]).map((key) => (
            <Pressable
              key={key}
              style={styles.sheetRow}
              onPress={() => { selectionChanged(); setScheme(key); setSheet(null); }}
              accessibilityRole="button"
            >
              <View style={styles.sheetRowMain}>
                <Text style={styles.sheetRowText}>{schemeLabels[key]}</Text>
                <Text style={styles.sheetRowDesc}>
                  {key === 'flat' ? t.collectz.schemeDescFlat : key === 'equal' ? t.collectz.schemeDescEqual : t.collectz.schemeDescCustom}
                </Text>
              </View>
              {scheme === key && <Feather name="check" size={17} color={C.accent} />}
            </Pressable>
          ))}
        </View>
      </BottomSheet>

      {/* Details editor */}
      <BottomSheet
        visible={sheet === 'details'}
        onClose={() => setSheet(null)}
        header={<Text style={styles.sheetTitle}>{t.collectz.fieldDetails}</Text>}
        keyboardAvoiding
        overlay={<KeyboardDoneFab visible={keyboardVisible && multilineFocused} keyboardHeight={keyboardHeight} />}
      >
        <View style={styles.sheetBody}>
          <TextInput
            style={styles.sheetMultiline}
            value={details}
            onChangeText={setDetails}
            placeholder={t.collectz.fieldDetailsPlaceholder}
            placeholderTextColor={withAlpha(C.textMuted, 0.55)}
            multiline
            textAlignVertical="top"
            autoFocus
            onFocus={() => setMultilineFocused(true)}
            onBlur={() => setMultilineFocused(false)}
          />
          {!keyboardVisible && (
            <NeuButton icon="check" label={t.common.done} onPress={() => setSheet(null)} accessibilityLabel={t.common.done} style={{ marginTop: SPACING.md }} />
          )}
        </View>
      </BottomSheet>

      {/* Rules editor */}
      <BottomSheet
        visible={sheet === 'rules'}
        onClose={() => setSheet(null)}
        header={<Text style={styles.sheetTitle}>{t.collectz.fieldRules}</Text>}
        keyboardAvoiding
        overlay={<KeyboardDoneFab visible={keyboardVisible && multilineFocused} keyboardHeight={keyboardHeight} />}
      >
        <View style={styles.sheetBody}>
          <TextInput
            style={styles.sheetMultiline}
            value={rules}
            onChangeText={setRules}
            placeholder={t.collectz.fieldRulesPlaceholder}
            placeholderTextColor={withAlpha(C.textMuted, 0.55)}
            multiline
            textAlignVertical="top"
            autoFocus
            onFocus={() => setMultilineFocused(true)}
            onBlur={() => setMultilineFocused(false)}
          />
          {!keyboardVisible && (
            <NeuButton icon="check" label={t.common.done} onPress={() => setSheet(null)} accessibilityLabel={t.common.done} style={{ marginTop: SPACING.md }} />
          )}
        </View>
      </BottomSheet>

      {/* Contact editor — organizer socials + WhatsApp group link. Shown to
          everyone who has the link; skipping it changes nothing. */}
      <BottomSheet
        visible={sheet === 'contact'}
        onClose={() => setSheet(null)}
        header={<Text style={styles.sheetTitle}>{t.collectz.fieldContact}</Text>}
        keyboardAvoiding
        overlay={<KeyboardDoneFab visible={keyboardVisible} keyboardHeight={keyboardHeight} />}
      >
        <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          <Text style={styles.contactHint}>{t.collectz.fieldContactHint}</Text>
          {SOCIAL_PLATFORMS.map((p) => (
            <View key={p.key} style={styles.contactRow}>
              <Feather name={p.icon as keyof typeof Feather.glyphMap} size={15} color={C.textMuted} />
              <TextInput
                style={[styles.sheetInput, styles.contactInput]}
                value={socialHandles[p.key]}
                onChangeText={(v) => setSocialHandles((prev) => ({ ...prev, [p.key]: v }))}
                placeholder={`${p.label} · @handle`}
                placeholderTextColor={withAlpha(C.textMuted, 0.55)}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
              />
            </View>
          ))}
          <View style={styles.contactRow}>
            <Feather name="users" size={15} color={C.textMuted} />
            <TextInput
              style={[styles.sheetInput, styles.contactInput]}
              value={groupUrl}
              onChangeText={setGroupUrl}
              placeholder={t.collectz.fieldGroupPlaceholder}
              placeholderTextColor={withAlpha(C.textMuted, 0.55)}
              autoCapitalize="none"
              keyboardType="url"
              multiline
            />
          </View>
          {!!groupUrl.trim() && !isWhatsappGroupUrl(groupUrl) && (
            <Text style={styles.contactWarn}>{t.collectz.groupLinkInvalid}</Text>
          )}
          {!keyboardVisible && (
            <NeuButton icon="check" label={t.common.done} onPress={() => setSheet(null)} accessibilityLabel={t.common.done} style={{ marginTop: SPACING.md }} />
          )}
        </ScrollView>
      </BottomSheet>

      {/* Capacity config — mode chips + steppers + optional team names */}
      <BottomSheet
        visible={sheet === 'capacity'}
        onClose={() => setSheet(null)}
        header={<Text style={styles.sheetTitle}>{t.collectz.capacity}</Text>}
        keyboardAvoiding
        overlay={<KeyboardDoneFab visible={keyboardVisible} keyboardHeight={keyboardHeight} />}
      >
        <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
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
                  multiline
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
          {!keyboardVisible && (
            <NeuButton icon="check" label={t.common.done} onPress={() => setSheet(null)} accessibilityLabel={t.common.done} style={{ marginTop: SPACING.md }} />
          )}
        </ScrollView>
      </BottomSheet>

      {/* Payment QR picker */}
      <BottomSheet
        visible={sheet === 'qr'}
        onClose={() => setSheet(null)}
        header={<Text style={styles.sheetTitle}>{t.collectz.fieldQr}</Text>}
        maxHeightPct={0.6}
      >
        <View style={styles.sheetBody}>
          <Pressable
            style={styles.sheetRow}
            onPress={() => { pickQr(null); setSheet(null); }}
            accessibilityRole="button"
          >
            <Text style={styles.sheetRowText}>{t.collectz.qrNone}</Text>
            {qrLabel === null && <Feather name="check" size={17} color={C.accent} />}
          </Pressable>
          {paymentQrs.map((qr, i) => (
            <Pressable
              key={`${qr.label}-${i}`}
              style={styles.sheetRow}
              onPress={() => { pickQr(qr); setSheet(null); }}
              accessibilityRole="button"
            >
              <Text style={styles.sheetRowText}>{qr.label}</Text>
              {qrLabel === qr.label && <Feather name="check" size={17} color={C.accent} />}
            </Pressable>
          ))}
        </View>
      </BottomSheet>

      {/* Player requirements — skill / age / gender / booking, all optional.
          One sheet, four chip groups; tapping the active chip clears it. */}
      <BottomSheet
        visible={sheet === 'requirements'}
        onClose={() => setSheet(null)}
        header={<Text style={styles.sheetTitle}>{t.collectz.secRequirements}</Text>}
      >
        <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          {([
            { label: t.collectz.reqSkill, options: ['beginner', 'intermediate', 'advanced', 'any'] as const, labels: skillLabels, value: skillLevel, set: setSkillLevel },
            { label: t.collectz.reqAge, options: ['below_18', '18_above', 'any'] as const, labels: ageLabels, value: ageReq, set: setAgeReq },
            { label: t.collectz.reqGender, options: ['male', 'female', 'any'] as const, labels: genderLabels, value: genderReq, set: setGenderReq },
            { label: t.collectz.reqBooking, options: ['booked', 'later'] as const, labels: bookingLabels, value: bookingStatus, set: setBookingStatus },
          ]).map((group) => (
            <View key={group.label} style={styles.sheetGroup}>
              <Text style={styles.sheetGroupLabel}>{group.label}</Text>
              <View style={styles.chipRow}>
                {group.options.map((key) => (
                  <Pressable
                    key={key}
                    style={[styles.chip, neuF.raised, group.value === key && styles.chipActive]}
                    onPress={() => { selectionChanged(); (group.set as (v: string | null) => void)(group.value === key ? null : key); }}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.chipText, group.value === key && styles.chipTextActive]}>{group.labels[key]}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
          {!keyboardVisible && (
            <NeuButton icon="check" label={t.common.done} onPress={() => setSheet(null)} accessibilityLabel={t.common.done} style={{ marginTop: SPACING.md }} />
          )}
        </ScrollView>
      </BottomSheet>

      {/* Gold keyboard-done FAB — floats above the keyboard for ANY focused
          field on the main form (sheets render their own via `overlay`). */}
      <KeyboardDoneFab visible={keyboardVisible && !sheet && !pasteOpen} keyboardHeight={keyboardHeight} />

      {/* "Session created" confirmation — summary + tap-to-copy code/link. Opening
          the session (button or backdrop) replaces this screen with the detail. */}
      <CollectzCreatedModal
        visible={!!createdSession}
        session={createdSession?.session ?? null}
        activeCount={createdSession?.activeCount ?? 0}
        rosterCount={createdSession?.rosterCount ?? 0}
        onOpen={() => {
          const id = createdSession?.session.id;
          setCreatedSession(null);
          if (id) navigation.replace('CollectzDetail', { sessionId: id });
        }}
      />
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
    fieldGroup: { marginTop: SPACING.md, marginBottom: SPACING.lg, gap: SPACING.sm },
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
    contactHint: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: 2, marginBottom: SPACING.sm },
    contactRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    contactInput: { flex: 1 },
    contactWarn: { fontSize: TYPOGRAPHY.size.xs, color: C.bronze, marginTop: 4 },
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

    // ── Grouped-form ("settings") layout ──
    sectionLabel: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      marginBottom: SPACING.sm,
      marginTop: SPACING.lg,
    },
    gCard: {
      // surface + elevation from neuF.raisedSoft (base C.background)
      borderRadius: RADIUS.lg,
      paddingVertical: SPACING.xs,
    },
    cardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: SPACING.sm,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 3,
    },
    cardRowCol: { flexDirection: 'column', alignItems: 'stretch', gap: 4 },
    rowLabel: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary },
    rowInput: {
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
      fontWeight: TYPOGRAPHY.weight.medium,
      paddingVertical: 2,
    },
    rowAmountInput: {
      minWidth: 96,
      textAlign: 'right',
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
      fontWeight: TYPOGRAPHY.weight.semibold,
      fontVariant: ['tabular-nums'],
      paddingVertical: 2,
    },
    rowValueWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
    rowValue: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary, fontWeight: TYPOGRAPHY.weight.medium },
    rowValueDim: { fontSize: TYPOGRAPHY.size.sm, color: C.textMuted },
    rowValuePreview: { fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary, flexShrink: 1 },
    rowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: withAlpha(C.textPrimary, 0.08),
      marginLeft: SPACING.md,
    },
    rowThumb: { width: 24, height: 24, borderRadius: 12 },
    whenPill: {
      borderRadius: RADIUS.full,
      backgroundColor: withAlpha(C.textPrimary, 0.05),
      paddingHorizontal: SPACING.sm,
      paddingVertical: 5,
    },
    whenPillText: { fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary },
    cardHint: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      lineHeight: 17,
      paddingHorizontal: SPACING.md,
      paddingBottom: SPACING.sm,
    },
    // Sheets
    sheetTitle: {
      fontSize: TYPOGRAPHY.size.lg,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
      paddingHorizontal: SPACING.xl,
    },
    sheetScroll: { flexShrink: 1 },
    sheetBody: { padding: SPACING.xl, gap: SPACING.sm },
    sheetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.sm + 2,
    },
    sheetRowMain: { flex: 1, gap: 2 },
    sheetRowText: { flex: 1, fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.medium, color: C.textPrimary },
    sheetRowDesc: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted },
    sheetGroup: { gap: SPACING.sm, marginBottom: SPACING.sm },
    sheetGroupLabel: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary },
    sheetMultiline: {
      minHeight: 160,
      maxHeight: 260,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: C.inputBorder,
      backgroundColor: C.background,
      padding: SPACING.md,
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
      lineHeight: 20,
    },
    sheetInput: {
      minHeight: 42,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: C.inputBorder,
      backgroundColor: C.surface,
      paddingHorizontal: SPACING.md,
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
    },
    swatchLabel: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: SPACING.sm },
    swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
    swatch: { width: 30, height: 30, borderRadius: 15 },
    swatchActive: { borderWidth: 3, borderColor: C.textPrimary },
    draftBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.sm,
      borderRadius: RADIUS.lg,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      marginBottom: SPACING.lg,
    },
    draftBannerText: { flex: 1, fontSize: TYPOGRAPHY.size.sm, color: C.textSecondary },
    draftRestore: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.bold, color: C.accent },

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
