// CollectzCreate — organizer setup form. Everything for a session in one
// scroll: event facts, payment scheme, roster editor, QR picker (payload-only),
// and the "paste WhatsApp announcement" AI prefill. On save it creates the
// session + roster rows, opens the detail screen, and fires the share sheet.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Share,
  KeyboardAvoidingView,
  Image,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../../constants';
import { useCalm, useIsDark } from '../../../hooks/useCalm';
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
  buildWhatsappAnnouncement,
  notifySession,
} from '../../../services/collectzService';
import { parseCollectzAnnouncement } from '../../../services/collectzParser';
import { CLUB_ICONS, presetClubIcon, CLUB_PRESET_PREFIX } from '../../../constants/clubIcons';
import { isMapsLink } from '../../../utils/mapLink';
import MapPreviewCard from '../../../components/collectz/MapPreviewCard';
import { fmtDate, fmtTime } from './collectzFormat';

type CategoryKey = 'sport' | 'makan' | 'trip' | 'gift' | 'other';
const CATEGORIES: CategoryKey[] = ['sport', 'makan', 'trip', 'gift', 'other'];

interface RosterRow {
  key: string;
  /** Set for rows loaded from the DB in edit mode — updates, not inserts. */
  id?: string;
  name: string;
  slot: CollectzSlot;
  amount: string;
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
  const styles = useMemo(() => makeStyles(C), [C]);
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
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [qrLabel, setQrLabel] = useState<string | null>(null);
  const [qrWarnLabel, setQrWarnLabel] = useState<string | null>(null);
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

  // ── Roster editor ──
  const addRow = () => {
    lightTap();
    setRoster((rows) => [...rows, { key: nextKey(), name: '', slot: 'active', amount: '' }]);
  };
  const patchRow = (key: string, patch: Partial<RosterRow>) =>
    setRoster((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
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
  const changeSummary = (next: { venue: string | null; event_at: string | null; pay_by: string | null }): string | null => {
    const s = original.current;
    if (!s) return null;
    const parts: string[] = [];
    if ((s.venue ?? '') !== (next.venue ?? '')) parts.push(`${t.collectz.changeVenue.replace('{v}', next.venue ?? '—')}`);
    if ((s.event_at ?? '') !== (next.event_at ?? '')) parts.push(t.collectz.changeTime);
    if ((s.pay_by ?? '') !== (next.pay_by ?? '')) parts.push(t.collectz.changePayBy);
    return parts.length ? parts.join(' · ') : null;
  };

  // ── QR picker — payload-only: a photo-only QR can't render for others ──
  const pickQr = (qr: PaymentQr | null) => {
    lightTap();
    if (!qr) {
      setQrPayload(null);
      setQrLabel(null);
      setQrWarnLabel(null);
      return;
    }
    if (!qr.payload) {
      setQrWarnLabel(qr.label);
      return;
    }
    setQrPayload(qr.payload);
    setQrLabel(qr.label);
    setQrWarnLabel(null);
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
        setRoster(d.roster.map((r) => ({ key: nextKey(), name: r.name, slot: r.slot, amount: '' })));
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
          image_path: null as string | null,
        };
        next.image_path = await resolveImagePath(editSessionId);
        await updateSession(editSessionId, next);
        // Roster diff: removals first, then updates, then additions.
        for (const id of removedIds) await removeParticipant(id);
        for (const r of roster) {
          const amount = scheme === 'custom' ? parseAmount(r.amount) : null;
          if (r.id) await updateParticipant(r.id, { name: r.name.trim(), slot: r.slot, share_amount: amount });
          else await addParticipant(editSessionId, r.name.trim(), { slot: r.slot, share_amount: amount });
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
        image_path: imagePreset ? `${CLUB_PRESET_PREFIX}${imagePreset}` : oldImagePath,
      });
      // Upload comes after create — it needs the session id for its storage path.
      if (imageUpload) {
        const path = await uploadClubImage(session.id, imageUpload);
        await updateSession(session.id, { image_path: path });
        session.image_path = path;
      }
      const rows = roster.filter((r) => r.name.trim());
      for (const r of rows) {
        // Sequential keeps failures attributable to a specific name.
        await addParticipant(session.id, r.name.trim(), {
          slot: r.slot,
          share_amount: scheme === 'custom' ? parseAmount(r.amount) : null,
        });
      }
      successNotification();
      navigation.replace('CollectzDetail', { sessionId: session.id });
      // Straight into the share sheet — the announcement carries the join link.
      Share.share({
        message: buildWhatsappAnnouncement(session, rows.filter((r) => r.slot === 'active').length),
      }).catch(() => {});
    } catch {
      errorNotification();
      showToast(t.collectz.createError, 'error');
    } finally {
      setSaving(false);
    }
  }, [saving, isEdit, editSessionId, title, category, eventAt, venue, mapsUrl, details, rules, scheme, totalAmount, shareAmount, currency, payBy, qrPayload, imagePreset, imageUpload, oldImagePath, removedIds, roster, notifyChanges, navigation, showToast, t]);

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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t.collectz.fieldTitle}</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder={t.collectz.fieldTitlePlaceholder}
            placeholderTextColor={C.textMuted}
          />
        </View>

        {/* Category chips */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t.collectz.fieldCategory}</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((key) => (
              <Pressable
                key={key}
                style={[styles.chip, category === key && styles.chipActive]}
                onPress={() => { selectionChanged(); setCategory(category === key ? null : key); }}
              >
                <Text style={[styles.chipText, category === key && styles.chipTextActive]}>{catLabels[key]}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Club image / icon */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t.collectz.fieldImage}</Text>
          <View style={styles.chipRow}>
            {CLUB_ICONS.map((icon) => (
              <Pressable
                key={icon.id}
                style={[styles.iconTile, imagePreset === icon.id && styles.iconTileActive]}
                onPress={() => pickPreset(icon.id)}
                accessibilityRole="button"
                accessibilityLabel={icon.id}
              >
                <Image source={icon.source} style={styles.iconImage} />
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
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t.collectz.fieldVenue}</Text>
          <TextInput
            style={styles.input}
            value={venue}
            onChangeText={setVenue}
            placeholder={t.collectz.fieldVenuePlaceholder}
            placeholderTextColor={C.textMuted}
          />
        </View>

        {/* Maps link + preview */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t.collectz.fieldMaps}</Text>
          <TextInput
            style={styles.input}
            value={mapsUrl}
            onChangeText={setMapsUrl}
            placeholder={t.collectz.fieldMapsPlaceholder}
            placeholderTextColor={C.textMuted}
            autoCapitalize="none"
            keyboardType="url"
          />
          {!!mapsUrl.trim() && isMapsLink(mapsUrl.trim()) && (
            <MapPreviewCard mapsUrl={mapsUrl.trim()} compact />
          )}
        </View>

        {/* Details */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t.collectz.fieldDetails}</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={details}
            onChangeText={setDetails}
            placeholder={t.collectz.fieldDetailsPlaceholder}
            placeholderTextColor={C.textMuted}
            multiline
          />
        </View>

        {/* Scheme */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t.collectz.fieldScheme}</Text>
          <View style={styles.chipRow}>
            {(['flat', 'equal', 'custom'] as CollectzScheme[]).map((key) => (
              <Pressable
                key={key}
                style={[styles.chip, scheme === key && styles.chipActive]}
                onPress={() => { selectionChanged(); setScheme(key); }}
              >
                <Text style={[styles.chipText, scheme === key && styles.chipTextActive]}>{schemeLabels[key]}</Text>
              </Pressable>
            ))}
          </View>
          {scheme === 'flat' && (
            <TextInput
              style={[styles.input, styles.amountInput]}
              value={shareAmount}
              onChangeText={setShareAmount}
              placeholder={t.collectz.fieldShareAmount.replace('{currency}', currency)}
              placeholderTextColor={C.textMuted}
              keyboardType="decimal-pad"
            />
          )}
          {scheme === 'equal' && (
            <TextInput
              style={[styles.input, styles.amountInput]}
              value={totalAmount}
              onChangeText={setTotalAmount}
              placeholder={t.collectz.fieldTotalAmount.replace('{currency}', currency)}
              placeholderTextColor={C.textMuted}
              keyboardType="decimal-pad"
            />
          )}
        </View>

        {/* Currency */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t.collectz.fieldCurrency}</Text>
          <View style={styles.chipRow}>
            {Array.from(new Set([appCurrency, 'MYR', 'SGD', 'USD'])).map((cur) => (
              <Pressable
                key={cur}
                style={[styles.chip, currency === cur && styles.chipActive]}
                onPress={() => { selectionChanged(); setCurrency(cur); }}
              >
                <Text style={[styles.chipText, currency === cur && styles.chipTextActive]}>{cur}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {renderWhenRow(t.collectz.fieldPayBy, payBy, 'payBy', () => setPayBy(null))}

        {/* Rules */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t.collectz.fieldRules}</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={rules}
            onChangeText={setRules}
            placeholder={t.collectz.fieldRulesPlaceholder}
            placeholderTextColor={C.textMuted}
            multiline
          />
        </View>

        {/* Roster editor */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>{t.collectz.fieldRoster}</Text>
          {roster.map((row) => (
            <View key={row.key} style={styles.rosterRow}>
              <TextInput
                style={[styles.input, styles.rosterName]}
                value={row.name}
                onChangeText={(v) => patchRow(row.key, { name: v })}
                placeholder={t.collectz.rosterNamePlaceholder}
                placeholderTextColor={C.textMuted}
              />
              <Pressable
                style={[styles.reserveChip, row.slot === 'reserve' && styles.reserveChipActive]}
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
                  placeholderTextColor={C.textMuted}
                  keyboardType="decimal-pad"
                />
              )}
              <Pressable onPress={() => removeRow(row.key)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.common.delete}>
                <Feather name="x" size={18} color={C.textMuted} />
              </Pressable>
            </View>
          ))}
          <Pressable style={({ pressed }) => [styles.addRowBtn, pressed && { opacity: 0.85 }]} onPress={addRow}>
            <Feather name="plus" size={16} color={C.accent} />
            <Text style={styles.addRowText}>{t.collectz.rosterAdd}</Text>
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
                style={[styles.chip, qrPayload === null && qrWarnLabel === null && styles.chipActive]}
                onPress={() => pickQr(null)}
              >
                <Text style={[styles.chipText, qrPayload === null && qrWarnLabel === null && styles.chipTextActive]}>
                  {t.collectz.qrNone}
                </Text>
              </Pressable>
              {paymentQrs.map((qr, i) => (
                <Pressable
                  key={`${qr.label}-${i}`}
                  style={[styles.chip, qrLabel === qr.label && styles.chipActive]}
                  onPress={() => pickQr(qr)}
                >
                  <Text style={[styles.chipText, qrLabel === qr.label && styles.chipTextActive]}>{qr.label}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {!!qrWarnLabel && <Text style={styles.warnHint}>{t.collectz.qrNoPayload}</Text>}
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
        <Pressable
          style={({ pressed }) => [styles.saveBtn, (pressed || saving) && { opacity: 0.85 }]}
          onPress={handleSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={isEdit ? t.collectz.editSave : t.collectz.createSave}
        >
          {saving ? (
            <ActivityIndicator size="small" color={C.onAccent} />
          ) : (
            <Text style={styles.saveBtnText}>{isEdit ? t.collectz.editSave : t.collectz.createSave}</Text>
          )}
        </Pressable>
        </>
        )}
      </ScrollView>

      {/* Android renders the picker as a system dialog. */}
      {picker && Platform.OS === 'android' && (
        <DateTimePicker value={pickerValue} mode={picker.mode} onChange={onPickerChange} />
      )}
      {/* iOS renders inline — wrap it in a small modal card with a done button. */}
      <Modal visible={!!picker && Platform.OS === 'ios'} transparent animationType="fade">
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerCard}>
            <DateTimePicker
              value={pickerValue}
              mode={picker?.mode ?? 'date'}
              display="spinner"
              onChange={onPickerChange}
              themeVariant={isDark ? 'dark' : 'light'}
            />
            <Pressable style={styles.pickerDone} onPress={() => setPicker(null)}>
              <Text style={styles.pickerDoneText}>{t.common.done}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* Paste-parse modal */}
      <Modal visible={pasteOpen} transparent animationType="slide" onRequestClose={() => setPasteOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.pasteOverlay}>
          <View style={styles.pasteCard}>
            <View style={styles.pasteHeader}>
              <Text style={styles.pasteTitle}>{t.collectz.pasteTitle}</Text>
              <Pressable onPress={() => setPasteOpen(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t.common.close}>
                <Feather name="x" size={20} color={C.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.pasteHint}>{t.collectz.pasteHint}</Text>
            <TextInput
              style={styles.pasteInput}
              value={pasteText}
              onChangeText={setPasteText}
              placeholder={t.collectz.pastePlaceholder}
              placeholderTextColor={C.textMuted}
              multiline
              textAlignVertical="top"
              autoFocus
            />
            <Pressable
              style={({ pressed }) => [styles.saveBtn, (pressed || parsing) && { opacity: 0.85 }]}
              onPress={handleParse}
              disabled={parsing}
              accessibilityRole="button"
              accessibilityLabel={t.collectz.pasteParse}
            >
              {parsing ? (
                <View style={styles.parsingRow}>
                  <ActivityIndicator size="small" color={C.onAccent} />
                  <Text style={styles.saveBtnText}>{t.collectz.pasteParsing}</Text>
                </View>
              ) : (
                <Text style={styles.saveBtnText}>{t.collectz.pasteParse}</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.background },
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
      fontSize: TYPOGRAPHY.size.sm,
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
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
    chip: {
      borderRadius: RADIUS.full,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      backgroundColor: C.pillBg,
    },
    chipActive: { backgroundColor: C.accent },
    chipText: {
      fontSize: TYPOGRAPHY.size.sm,
      fontWeight: TYPOGRAPHY.weight.medium,
      color: C.textSecondary,
    },
    chipTextActive: { color: C.onAccent },
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
      backgroundColor: C.pillBg,
    },
    reserveChipActive: { backgroundColor: C.bronze },
    reserveChipText: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, fontWeight: TYPOGRAPHY.weight.medium },
    reserveChipTextActive: { color: C.onAccent },
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
    hint: { fontSize: TYPOGRAPHY.size.sm, color: C.textMuted, lineHeight: 19 },
    warnHint: { fontSize: TYPOGRAPHY.size.sm, color: C.bronze, lineHeight: 19 },
    saveBtn: {
      minHeight: 52,
      borderRadius: RADIUS.lg,
      backgroundColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: SPACING.sm,
    },
    saveBtnText: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.bold, color: C.onAccent },
    parsingRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
    pickerOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: SPACING.xl,
    },
    pickerCard: {
      backgroundColor: C.surface,
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
      width: '100%',
      maxWidth: 380,
      alignItems: 'center',
    },
    pickerDone: { marginTop: SPACING.sm, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.xl },
    pickerDoneText: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: C.accent },
    pasteOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    pasteCard: {
      backgroundColor: C.surface,
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
