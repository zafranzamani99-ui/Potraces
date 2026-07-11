import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, Modal, Pressable, TouchableOpacity, Alert, Keyboard } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, isValid } from 'date-fns';
import { CALM, SPACING, RADIUS, TYPOGRAPHY, SHADOWS, withAlpha } from '../../../constants';
import { useCalm } from '../../../hooks/useCalm';
import { useNeu } from '../../../components/common/neu';
import NeuButton from '../../../components/common/NeuButton';
import CategoryIcon from '../../../components/common/CategoryIcon';
import Sparkline from '../../../components/common/Sparkline';
import ModalToastHost from '../../../components/common/ModalToastHost';
import { useToast } from '../../../context/ToastContext';
import { useT } from '../../../i18n';
import { lightTap, successNotification } from '../../../services/haptics';
import { SavingsAccount, SnapshotType, SavingsSnapshot } from '../../../types';
import { SAVINGS_TYPE_OPTIONS, getTypeInfo } from './investmentTypes';

// ─────────────────────────── shared shell ───────────────────────────
const SheetShell: React.FC<{ visible: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }> = ({ visible, onClose, title, children, footer }) => {
  const C = useCalm();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => shellStyles(C), [C]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => { Keyboard.dismiss(); onClose(); }} />
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, SPACING.lg) }]}>
          <View style={s.handle} />
          <View style={s.header}>
            <View style={{ flex: 1 }}>{typeof title === 'string' ? <Text style={s.title}>{title}</Text> : title}</View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close">
              <Feather name="x" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>
          <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: SPACING.md }}>
            {children}
          </KeyboardAwareScrollView>
          {footer}
          <ModalToastHost />
        </View>
      </View>
    </Modal>
  );
};

// ─────────────────────────── field ───────────────────────────
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
  const C = useCalm();
  const s = useMemo(() => shellStyles(C), [C]);
  return <View style={s.field}><Text style={s.fieldLabel}>{label}</Text>{children}</View>;
};

// ═══════════════════ ADD / EDIT ═══════════════════
interface AddEditProps {
  visible: boolean;
  editing: SavingsAccount | null;
  currency: string;
  onClose: () => void;
  onAdd: (a: Omit<SavingsAccount, 'id' | 'history' | 'createdAt' | 'updatedAt'>) => void;
  onUpdate: (id: string, updates: Partial<SavingsAccount>) => void;
  onSnapshot: (id: string, value: number, note?: string, snapshotType?: SnapshotType) => void;
  onDelete: (id: string) => void;
  investmentCats?: unknown;
}

export const AddEditAccountSheet: React.FC<AddEditProps> = ({ visible, editing, currency, onClose, onAdd, onUpdate, onSnapshot, onDelete }) => {
  const C = useCalm();
  const t = useT();
  const neu = useNeu(C.surface);
  const s = useMemo(() => shellStyles(C), [C]);
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [type, setType] = useState('bank');
  const [description, setDescription] = useState('');
  const [initial, setInitial] = useState('');
  const [current, setCurrent] = useState('');
  const [rate, setRate] = useState('');
  const [target, setTarget] = useState('');
  const [goalName, setGoalName] = useState('');

  useEffect(() => {
    if (!visible) return;
    if (editing) {
      setName(editing.name); setType(editing.type); setDescription(editing.description || '');
      setInitial(String(editing.initialInvestment)); setCurrent(String(editing.currentValue));
      setRate(editing.annualRate ? String(editing.annualRate) : ''); setTarget(editing.target ? String(editing.target) : '');
      setGoalName(editing.goalName || '');
    } else {
      setName(''); setType('bank'); setDescription(''); setInitial(''); setCurrent(''); setRate(''); setTarget(''); setGoalName('');
    }
  }, [visible, editing]);

  const isCustomLike = type === 'other' || type.startsWith('custom_');

  const save = useCallback(() => {
    if (!name.trim()) { showToast(t.savings.enterAccountName, 'error'); return; }
    const inv = parseFloat(initial); const cur = parseFloat(current);
    if (!inv || inv <= 0) { showToast(t.savings.enterValidInitial, 'error'); return; }
    if (isNaN(cur) || cur < 0) { showToast(t.savings.enterValidCurrent, 'error'); return; }
    const tgt = parseFloat(target) > 0 ? parseFloat(target) : undefined;
    const rt = parseFloat(rate) > 0 ? parseFloat(rate) : undefined;
    const gn = goalName.trim() || undefined;
    if (editing) {
      const changed = cur !== editing.currentValue;
      onUpdate(editing.id, { name: name.trim(), type, description: isCustomLike ? description.trim() : undefined, initialInvestment: inv, currentValue: cur, target: tgt, goalName: gn, annualRate: rt });
      if (changed) onSnapshot(editing.id, cur, 'Edit', 'manual');
      showToast(t.savings.accountUpdated, 'success');
    } else {
      onAdd({ name: name.trim(), type, description: isCustomLike ? description.trim() : undefined, initialInvestment: inv, currentValue: cur, target: tgt, goalName: gn, annualRate: rt });
      showToast(t.savings.accountAdded, 'success');
    }
    successNotification(); onClose();
  }, [name, type, description, initial, current, rate, target, goalName, editing, isCustomLike, onAdd, onUpdate, onSnapshot, onClose, showToast, t]);

  const confirmDelete = useCallback(() => {
    if (!editing) return;
    Alert.alert(t.savings.deleteAccountTitle, t.savings.deleteAccountMsg.replace('{name}', editing.name), [
      { text: t.savings.deleteCancel, style: 'cancel' },
      { text: t.savings.deleteConfirm, style: 'destructive', onPress: () => { onDelete(editing.id); showToast(t.savings.accountDeleted, 'success'); onClose(); } },
    ]);
  }, [editing, onDelete, onClose, showToast, t]);

  const title = (
    <Text style={s.title}>{editing ? t.savings.editAccount : t.savings.addAccount}</Text>
  );

  return (
    <SheetShell visible={visible} onClose={onClose} title={title}
      footer={
        <View style={s.footer}>
          <NeuButton label={t.savings.save} icon={editing ? 'check' : 'plus'} onPress={save} />
          {editing && (
            <TouchableOpacity onPress={confirmDelete} style={s.deleteLink}><Feather name="trash-2" size={14} color={C.overdue} /><Text style={[s.deleteText, { color: C.overdue }]}>{t.savings.deleteThisAccount}</Text></TouchableOpacity>
          )}
        </View>
      }
    >
      <Field label={t.savings.accountName}>
        <TextInput value={name} onChangeText={setName} placeholder={t.savings.accountNamePlaceholder} placeholderTextColor={C.textMuted} style={[s.input, neu.insetSoft]} selectionColor={withAlpha(C.accent, 0.25)} />
      </Field>

      <Field label={t.savings.typeLabel}>
        <View style={s.typeGrid}>
          {SAVINGS_TYPE_OPTIONS.map((ti) => {
            const on = type === ti.id;
            return (
              <TouchableOpacity key={ti.id} onPress={() => { setType(ti.id); lightTap(); }} style={[s.typeTile, neu.raised, on && { backgroundColor: withAlpha(ti.color, 0.14) }]} activeOpacity={0.8}>
                <CategoryIcon icon={ti.icon} size={16} color={ti.color} />
                <Text style={[s.typeText, on && { color: ti.color, fontWeight: '700' }]} numberOfLines={1}>{ti.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Field>

      {isCustomLike && (
        <Field label={t.savings.descriptionLabel}>
          <TextInput value={description} onChangeText={setDescription} placeholder={t.savings.descriptionPlaceholder} placeholderTextColor={C.textMuted} style={[s.input, neu.insetSoft]} selectionColor={withAlpha(C.accent, 0.25)} />
        </Field>
      )}

      <View style={s.row2}>
        <Field label={t.savings.putInLabel}>
          <View style={[s.amtField, neu.insetSoft]}><Text style={s.cur}>{currency}</Text><TextInput value={initial} onChangeText={setInitial} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.textMuted} style={s.amtInput} selectionColor={withAlpha(C.accent, 0.25)} /></View>
        </Field>
        <Field label={t.savings.nowLabel}>
          <View style={[s.amtField, neu.insetSoft]}><Text style={s.cur}>{currency}</Text><TextInput value={current} onChangeText={setCurrent} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.textMuted} style={s.amtInput} selectionColor={withAlpha(C.accent, 0.25)} /></View>
        </Field>
      </View>

      <Field label={t.savings.annualRateLabel}>
        <TextInput value={rate} onChangeText={setRate} keyboardType="decimal-pad" placeholder={t.savings.annualRatePlaceholder} placeholderTextColor={C.textMuted} style={[s.input, neu.insetSoft]} selectionColor={withAlpha(C.accent, 0.25)} />
      </Field>
      <Field label={t.savings.targetFieldLabel}>
        <View style={[s.amtField, neu.insetSoft]}><Text style={s.cur}>{currency}</Text><TextInput value={target} onChangeText={setTarget} keyboardType="decimal-pad" placeholder={t.savings.targetPlaceholder} placeholderTextColor={C.textMuted} style={s.amtInput} selectionColor={withAlpha(C.accent, 0.25)} /></View>
      </Field>
      {parseFloat(target) > 0 && (
        <Field label={t.savings.goalNameLabel}>
          <TextInput value={goalName} onChangeText={setGoalName} placeholder={t.savings.goalNamePlaceholder} placeholderTextColor={C.textMuted} style={[s.input, neu.insetSoft]} selectionColor={withAlpha(C.accent, 0.25)} />
        </Field>
      )}
    </SheetShell>
  );
};

// ═══════════════════ UPDATE VALUE ═══════════════════
const SNAP_TYPES: { key: SnapshotType; labelKey: 'updateType' | 'dividend' | 'withdrawalType'; icon: keyof typeof Feather.glyphMap }[] = [
  { key: 'manual', labelKey: 'updateType', icon: 'refresh-cw' },
  { key: 'dividend', labelKey: 'dividend', icon: 'gift' },
  { key: 'withdrawal', labelKey: 'withdrawalType', icon: 'arrow-down-left' },
];

export const UpdateValueSheet: React.FC<{ visible: boolean; account: SavingsAccount | null; currency: string; onClose: () => void; onSnapshot: (id: string, value: number, note?: string, snapshotType?: SnapshotType) => void }> = ({ visible, account, currency, onClose, onSnapshot }) => {
  const C = useCalm();
  const t = useT();
  const neu = useNeu(C.surface);
  const s = useMemo(() => shellStyles(C), [C]);
  const { showToast } = useToast();
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [snap, setSnap] = useState<SnapshotType>('manual');

  useEffect(() => {
    if (visible && account) { setValue(String(account.currentValue)); setNote(''); setSnap('manual'); }
  }, [visible, account]);

  const preview = useMemo(() => {
    if (!account) return null;
    const v = parseFloat(value);
    if (isNaN(v)) return null;
    const diff = v - account.currentValue;
    const pct = account.currentValue > 0 ? (diff / account.currentValue) * 100 : 0;
    return { diff, pct };
  }, [value, account]);

  const save = useCallback(() => {
    if (!account) return;
    const v = parseFloat(value);
    if (isNaN(v) || v < 0) { showToast(t.savings.enterValidValue, 'error'); return; }
    onSnapshot(account.id, v, note.trim() || undefined, snap);
    showToast(t.savings.valueUpdated, 'success'); successNotification(); onClose();
  }, [account, value, note, snap, onSnapshot, onClose, showToast, t]);

  const fmt = (v: number) => `${currency} ${v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <SheetShell visible={visible} onClose={onClose} title={`${t.savings.updateValue}${account ? ` · ${account.name}` : ''}`}
      footer={<View style={s.footer}><NeuButton label={t.savings.save} icon="check" onPress={save} /></View>}
    >
      <View style={s.snapRow}>
        {SNAP_TYPES.map((st) => {
          const on = snap === st.key;
          return (
            <TouchableOpacity key={st.key} onPress={() => { setSnap(st.key); lightTap(); }} style={[s.snapPill, neu.raised, on && { backgroundColor: withAlpha(C.accent, 0.14) }]} activeOpacity={0.8}>
              <Feather name={st.icon} size={13} color={on ? C.accent : C.textMuted} />
              <Text style={[s.snapText, on && { color: C.accent, fontWeight: '700' }]}>{t.savings[st.labelKey]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Field label={t.savings.newValueLabel}>
        <View style={[s.amtField, neu.insetSoft]}><Text style={s.cur}>{currency}</Text><TextInput value={value} onChangeText={setValue} keyboardType="decimal-pad" autoFocus placeholder="0" placeholderTextColor={C.textMuted} style={s.amtInput} selectionColor={withAlpha(C.accent, 0.25)} /></View>
      </Field>
      {preview && Math.abs(preview.diff) > 0.001 && (
        <View style={[s.preview, { backgroundColor: withAlpha(preview.diff >= 0 ? C.positive : C.neutral, 0.1) }]}>
          <Feather name={preview.diff >= 0 ? 'trending-up' : 'trending-down'} size={14} color={preview.diff >= 0 ? C.positive : C.neutral} />
          <Text style={[s.previewText, { color: preview.diff >= 0 ? C.positive : C.neutral }]}>
            {preview.diff >= 0 ? '+' : ''}{fmt(preview.diff)} ({preview.diff >= 0 ? '+' : ''}{preview.pct.toFixed(1)}%)
          </Text>
        </View>
      )}
      <Field label={t.savings.noteOptional}>
        <TextInput value={note} onChangeText={setNote} placeholder={t.savings.monthlyCheckPlaceholder} placeholderTextColor={C.textMuted} style={[s.input, neu.insetSoft]} selectionColor={withAlpha(C.accent, 0.25)} />
      </Field>
    </SheetShell>
  );
};

// ═══════════════════ HISTORY ═══════════════════
export const HistorySheet: React.FC<{ visible: boolean; account: SavingsAccount | null; currency: string; onClose: () => void }> = ({ visible, account, currency, onClose }) => {
  const C = useCalm();
  const t = useT();
  const neu = useNeu(C.surface);
  const s = useMemo(() => shellStyles(C), [C]);
  const fmt = (v: number) => `${currency} ${v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const data = useMemo(() => {
    if (!account) return null;
    const gain = account.currentValue - account.initialInvestment;
    const ret = account.initialInvestment > 0 ? (gain / account.initialInvestment) * 100 : 0;
    const sparkline = account.history.map((h) => h.value);
    const entries = account.history.slice().reverse();
    const groups: Record<string, SavingsSnapshot[]> = {};
    for (const snap of entries) {
      const d = snap.date instanceof Date ? snap.date : new Date(snap.date as any);
      const key = isValid(d) ? format(d, 'MMMM yyyy') : '—';
      (groups[key] ||= []).push(snap);
    }
    const grouped = Object.entries(groups).map(([month, items]) => ({ month, items }));
    return { gain, ret, sparkline, grouped };
  }, [account]);

  if (!account || !data) return <SheetShell visible={visible} onClose={onClose} title={t.savings.historyTitle}><View /></SheetShell>;

  return (
    <SheetShell visible={visible} onClose={onClose} title={`${t.savings.historyTitle} · ${account.name}`}>
      <View style={[s.histSummary, neu.raisedSoft, { backgroundColor: C.surface }]}>
        <View style={s.hsItem}><Text style={s.hsLabel}>{t.savings.historyInvested}</Text><Text style={s.hsValue}>{fmt(account.initialInvestment)}</Text></View>
        <View style={s.hsItem}><Text style={s.hsLabel}>{t.savings.historyCurrent}</Text><Text style={s.hsValue}>{fmt(account.currentValue)}</Text></View>
        <View style={s.hsItem}><Text style={s.hsLabel}>{t.savings.historyReturn}</Text><Text style={[s.hsValue, { color: data.gain >= 0 ? C.positive : C.neutral }]}>{data.gain >= 0 ? '+' : ''}{data.ret.toFixed(1)}%</Text></View>
      </View>
      {data.sparkline.length >= 2 && <View style={{ marginBottom: SPACING.md }}><Sparkline data={data.sparkline} height={60} color={data.gain >= 0 ? C.positive : C.neutral} showDot filled strokeWidth={2} /></View>}
      {data.grouped.map((g) => (
        <View key={g.month} style={{ marginBottom: SPACING.md }}>
          <Text style={s.histMonth}>{g.month}</Text>
          {g.items.map((snap, i) => {
            const d = snap.date instanceof Date ? snap.date : new Date(snap.date as any);
            return (
              <View key={snap.id || i} style={s.histRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.histVal}>{fmt(snap.value)}</Text>
                  {!!snap.note && <Text style={s.histNote} numberOfLines={1}>{snap.note}</Text>}
                </View>
                <Text style={s.histDate}>{isValid(d) ? format(d, 'MMM d') : ''}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </SheetShell>
  );
};

// ─────────────────────────── styles ───────────────────────────
const shellStyles = (C: typeof CALM) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: RADIUS['2xl'], borderTopRightRadius: RADIUS['2xl'], paddingHorizontal: SPACING.lg, paddingTop: 8, maxHeight: '92%', ...SHADOWS.lg },
  handle: { width: 38, height: 5, borderRadius: 3, backgroundColor: C.border, alignSelf: 'center', marginBottom: 10 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.md },
  title: { fontSize: TYPOGRAPHY.size.lg, fontWeight: '700', color: C.textPrimary, letterSpacing: -0.2 },
  field: { marginBottom: SPACING.md },
  fieldLabel: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, fontWeight: '600', marginBottom: 7, textTransform: 'lowercase' },
  input: { backgroundColor: C.surface, borderRadius: RADIUS.lg, paddingHorizontal: 14, paddingVertical: 13, fontSize: TYPOGRAPHY.size.base, color: C.textPrimary },
  amtField: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: RADIUS.lg, paddingHorizontal: 14, paddingVertical: 11 },
  cur: { fontSize: TYPOGRAPHY.size.base, color: C.textSecondary, fontWeight: '600', marginRight: 6 },
  amtInput: { flex: 1, fontSize: TYPOGRAPHY.size.lg, color: C.textPrimary, fontWeight: '600', fontVariant: ['tabular-nums'] },
  row2: { flexDirection: 'row', gap: SPACING.md },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeTile: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: RADIUS.full, backgroundColor: C.surface },
  typeText: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary, fontWeight: '600' },
  footer: { paddingTop: SPACING.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, gap: 10 },
  deleteLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 6 },
  deleteText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: '600' },
  snapRow: { flexDirection: 'row', gap: 8, marginBottom: SPACING.md },
  snapPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: RADIUS.full, backgroundColor: C.surface },
  snapText: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, fontWeight: '600' },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.full, marginBottom: SPACING.md },
  previewText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: '700', fontVariant: ['tabular-nums'] },
  histSummary: { flexDirection: 'row', borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md },
  hsItem: { flex: 1 },
  hsLabel: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4, color: C.textMuted, fontWeight: '600' },
  hsValue: { fontSize: TYPOGRAPHY.size.sm, fontWeight: '700', color: C.textPrimary, marginTop: 3, fontVariant: ['tabular-nums'] },
  histMonth: { fontSize: TYPOGRAPHY.size.xs, textTransform: 'uppercase', letterSpacing: 0.6, color: C.textMuted, fontWeight: '700', marginBottom: 8 },
  histRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  histVal: { fontSize: TYPOGRAPHY.size.sm, fontWeight: '600', color: C.textPrimary, fontVariant: ['tabular-nums'] },
  histNote: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: 2 },
  histDate: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, fontWeight: '600' },
});
