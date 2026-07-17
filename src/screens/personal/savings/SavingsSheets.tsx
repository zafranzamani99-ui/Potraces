import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Modal, Pressable, TouchableOpacity, Alert, Keyboard, useWindowDimensions } from 'react-native';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS, interpolate, Extrapolation } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, isValid } from 'date-fns';
import { CALM, CALM_DARK, SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../../constants';
import { useCalm } from '../../../hooks/useCalm';
import { useNeu } from '../../../components/common/neu';
import CategoryPicker from '../../../components/common/CategoryPicker';
import Sparkline from '../../../components/common/Sparkline';
import ModalToastHost from '../../../components/common/ModalToastHost';
import { useToast } from '../../../context/ToastContext';
import { useT } from '../../../i18n';
import { lightTap, successNotification } from '../../../services/haptics';
import { SavingsAccount, SnapshotType, SavingsSnapshot } from '../../../types';
import { SAVINGS_TYPE_OPTIONS } from './investmentTypes';

// Strip grouping separators / stray chars before parseFloat — matches the
// app-wide money-input convention (AddEditWalletModal, TransferModal, …) so a
// pasted "12,500" doesn't silently truncate to 12. Also collapse any dots past
// the first so a mangled "1.2.3" reads as "1.23" (not parseFloat's "1.2") and
// scientific-notation paste "1.5e6" → "1.56" can't sneak through.
const normAmount = (x: string) => {
  const cleaned = x.replace(/,/g, '').replace(/[^\d.]/g, '');
  const dot = cleaned.indexOf('.');
  return dot === -1 ? cleaned : cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, '');
};

// ═══════════════════ ADD / EDIT ═══════════════════
interface AddEditProps {
  visible: boolean;
  editing: SavingsAccount | null;
  defaultType?: string;
  currency: string;
  onClose: () => void;
  onAdd: (a: Omit<SavingsAccount, 'id' | 'history' | 'createdAt' | 'updatedAt'>) => void;
  onUpdate: (id: string, updates: Partial<SavingsAccount>) => void;
  onSnapshot: (id: string, value: number, note?: string, snapshotType?: SnapshotType) => void;
  onDelete: (id: string) => void;
}

export const AddEditAccountSheet: React.FC<AddEditProps> = ({ visible, editing, defaultType, currency, onClose, onAdd, onUpdate, onSnapshot, onDelete }) => {
  const C = useCalm();
  const t = useT();
  const neu = useNeu(undefined, { faintDark: true });
  const a = useMemo(() => addSheetStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [type, setType] = useState('bank');
  const [description, setDescription] = useState('');
  const [initial, setInitial] = useState('');
  const [current, setCurrent] = useState('');
  const [rate, setRate] = useState('');
  const [target, setTarget] = useState('');
  const [goalName, setGoalName] = useState('');

  // Guards a rapid double-tap on Save: the Modal stays mounted/interactive
  // through its slide-out, so without this a second tap re-runs save() and
  // creates a duplicate account / snapshot. Set in save(), auto-cleared there.
  const savingRef = useRef(false);

  // Reset the form when the sheet opens (or its target changes) — the
  // "adjust state during render on prop change" pattern, not an effect.
  const [syncKey, setSyncKey] = useState<string | null>(null);
  const opened = visible ? (editing?.id ?? 'new') : null;
  if (opened !== syncKey) {
    setSyncKey(opened);
    if (opened !== null) {
      setName(editing?.name ?? '');
      setType(editing?.type ?? defaultType ?? 'bank');
      setDescription(editing?.description ?? '');
      setInitial(editing ? String(editing.initialInvestment) : '');
      setCurrent(editing ? String(editing.currentValue) : '');
      setRate(editing?.annualRate ? String(editing.annualRate) : '');
      setTarget(editing?.target ? String(editing.target) : '');
      setGoalName(editing?.goalName ?? '');
    }
  }

  const isCustomLike = type === 'other' || type.startsWith('custom_');

  // ── Drag-to-dismiss + spring-in, ported from the Add Debt sheet ──
  const { height: SCREEN_H } = useWindowDimensions();
  const sheetY = useSharedValue(SCREEN_H);
  const dragStart = useSharedValue(0);
  const saveScale = useSharedValue(1);
  const closingRef = useRef(false);

  // Spring the sheet up each time it opens.
  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      sheetY.value = SCREEN_H;
      sheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
    }
  }, [visible, SCREEN_H, sheetY]);

  // Animated close — slide the sheet down, then hand off to the parent (which
  // flips `visible` and unmounts). Guarded so a drag + tap can't double-fire.
  const finishClose = useCallback(() => { closingRef.current = false; onClose(); }, [onClose]);
  // Re-arm the close guard when the user grabs the handle mid-slide-out: that
  // pan cancels the close-timing's callback (finished === false) so finishClose
  // never clears closingRef, which would otherwise wedge the sheet shut forever.
  const clearClosing = useCallback(() => { closingRef.current = false; }, []);
  const requestClose = useCallback(() => {
    Keyboard.dismiss();
    if (closingRef.current) return;
    closingRef.current = true;
    sheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => {
      if (finished) runOnJS(finishClose)();
    });
  }, [SCREEN_H, sheetY, finishClose]);

  // Pan on the handle+title zone. Downward only (≥10px) so upward gestures still
  // scroll the form; dismiss past 100px of drag or a fast flick, else spring back.
  const sheetGesture = useMemo(
    () => Gesture.Pan()
      .activeOffsetY([10, 9999])
      .onStart(() => { 'worklet'; runOnJS(clearClosing)(); dragStart.value = sheetY.value; })
      .onUpdate((e) => { 'worklet'; let y = dragStart.value + e.translationY; if (y < 0) y = y / 3; sheetY.value = y; })
      .onEnd((e) => {
        'worklet';
        if (e.translationY > 100 || e.velocityY > 800) runOnJS(requestClose)();
        else sheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [SCREEN_H, requestClose]
  );

  const sheetAnimStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetY.value }] }));
  const backdropAnimStyle = useAnimatedStyle(() => ({ opacity: interpolate(sheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP) }));
  const saveAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: saveScale.value }] }));

  const save = useCallback(() => {
    if (savingRef.current) return;
    if (!name.trim()) { showToast(t.savings.enterAccountName, 'error'); return; }
    const cur = parseFloat(normAmount(current));
    if (!Number.isFinite(cur) || cur < 0) { showToast(t.savings.enterValidCurrent, 'error'); return; }
    // "invested" is the cost basis (capital currently invested). When adding, if the
    // user only filled the current value, mirror it (no gain yet) rather than forcing
    // them to type the same number twice. Editing keeps whatever was entered.
    let inv = parseFloat(normAmount(initial));
    if (!editing && normAmount(initial) === '') {
      // Nothing to mirror from — the account has no value yet. Point the error at
      // the "now" field the user actually touched, not the untouched "put in".
      if (cur <= 0) { showToast(t.savings.enterValidCurrent, 'error'); return; }
      inv = cur;
    }
    if (!Number.isFinite(inv) || inv <= 0) { showToast(t.savings.enterValidInitial, 'error'); return; }
    const tgtNum = parseFloat(normAmount(target)); const tgt = Number.isFinite(tgtNum) && tgtNum > 0 ? tgtNum : undefined;
    const rtNum = parseFloat(normAmount(rate)); const rt = Number.isFinite(rtNum) && rtNum > 0 ? rtNum : undefined;
    const gn = goalName.trim() || undefined;
    const desc = isCustomLike ? description.trim() : undefined;
    const nm = name.trim();
    // Commit past this point — block re-entrant double-taps while the Modal
    // slides out. Auto-clears shortly after so the next open starts unlocked
    // (mirrors the Add Debt sheet's saving-flag + timeout), scheduled up front
    // so the lock always releases even if a store action throws.
    savingRef.current = true;
    setTimeout(() => { savingRef.current = false; }, 600);
    if (editing) {
      // Send ONLY the scalar fields the user actually changed. Re-asserting the
      // whole set (captured at open time) would clobber any field a background
      // sync / another device corrected while the sheet was open (scalars merge
      // by last-write-wins). currentValue goes through addSnapshot below.
      const patch: Partial<SavingsAccount> = {};
      if (nm !== editing.name) patch.name = nm;
      if (type !== editing.type) patch.type = type;
      if (desc !== editing.description) patch.description = desc;
      if (inv !== editing.initialInvestment) patch.initialInvestment = inv;
      if (tgt !== editing.target) patch.target = tgt;
      if (gn !== editing.goalName) patch.goalName = gn;
      if (rt !== editing.annualRate) patch.annualRate = rt;
      if (Object.keys(patch).length) onUpdate(editing.id, patch);
      if (cur !== editing.currentValue) onSnapshot(editing.id, cur, undefined, 'manual');
      showToast(t.savings.accountUpdated, 'success');
    } else {
      onAdd({ name: nm, type, description: desc, initialInvestment: inv, currentValue: cur, target: tgt, goalName: gn, annualRate: rt });
      showToast(t.savings.accountAdded, 'success');
    }
    successNotification(); requestClose();
  }, [name, type, description, initial, current, rate, target, goalName, editing, isCustomLike, onAdd, onUpdate, onSnapshot, requestClose, showToast, t]);

  const confirmDelete = useCallback(() => {
    if (!editing) return;
    Alert.alert(t.savings.deleteAccountTitle, t.savings.deleteAccountMsg.replace('{name}', editing.name), [
      { text: t.savings.deleteCancel, style: 'cancel' },
      { text: t.savings.deleteConfirm, style: 'destructive', onPress: () => { onDelete(editing.id); showToast(t.savings.accountDeleted, 'success'); requestClose(); } },
    ]);
  }, [editing, onDelete, requestClose, showToast, t]);

  const typeInfo = SAVINGS_TYPE_OPTIONS.find((o) => o.id === type);
  const subtitle = editing
    ? `${typeInfo?.name ?? ''}${rate ? ` · ${rate}% p.a.` : ''}`.trim()
    : t.savings.addAccountSubtitle;

  // Localized two-tone title: "verb" + serif-accent "noun". Both en/ms account
  // titles are two words ("Add Account" / "Tambah Akaun"), so split on the first
  // space to keep the accent working in either language.
  const firstSpace = (s: string) => { const i = s.trim().indexOf(' '); return i === -1 ? ['', s.trim()] : [s.trim().slice(0, i + 1), s.trim().slice(i + 1)]; };
  const [addVerb, addNoun] = firstSpace(t.savings.addAccount);
  const [editVerb] = firstSpace(t.savings.editAccount);
  const titleVerb = (editing ? editVerb : addVerb).toLowerCase();
  const titleNoun = (editing ? (editing.name || addNoun) : addNoun).toLowerCase();

  // Mirror save()'s effective validation so the button's enabled/disabled look
  // matches whether a tap will actually succeed (incl. the add-mode put-in mirror).
  const curNum = parseFloat(normAmount(current));
  const invRaw = normAmount(initial);
  const invNum = (!editing && invRaw === '') ? curNum : parseFloat(invRaw);
  const canSave = name.trim().length > 0 && Number.isFinite(curNum) && curNum >= 0 && Number.isFinite(invNum) && invNum > 0;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={requestClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Reanimated.View style={[a.backdrop, backdropAnimStyle]}>
          <Pressable style={{ flex: 1 }} onPress={requestClose} accessibilityLabel={t.savings.closeLabel} />
        </Reanimated.View>

        <Reanimated.View style={[a.sheetContainer, sheetAnimStyle]}>
          {/* Drag zone — handle + title both catch the downward pan-to-dismiss */}
          <GestureDetector gesture={sheetGesture}>
            <View collapsable={false}>
              <View style={a.topRow}><View style={a.handle} /></View>
              {/* Centered title — serif-italic accent on the noun (matches Add Debt) */}
              <View style={a.titleZone}>
                <Text style={a.title} numberOfLines={1} ellipsizeMode="tail">
                  {titleVerb}
                  <Text style={a.titleAccent}>{titleNoun}</Text>
                </Text>
                {!!subtitle && <Text style={a.subtitle} numberOfLines={1}>{subtitle}</Text>}
              </View>
            </View>
          </GestureDetector>

          <KeyboardAwareScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={a.scrollContent}
            bottomOffset={insets.bottom + 130}
            keyboardDismissMode="on-drag"
          >
            {/* Hero — current value */}
            <View style={[a.heroCard, neu.raisedSoft]}>
              <Text style={a.cardLabel}>{t.savings.nowLabel} <Text style={a.reqStar}>*</Text></Text>
              <View style={a.heroAmountRow}>
                <Text style={[a.heroCurrency, { color: C.accent }]} numberOfLines={1}>{currency}</Text>
                <TextInput value={current} onChangeText={(v) => setCurrent(normAmount(v))} keyboardType="decimal-pad" maxLength={13} placeholder="0" placeholderTextColor={withAlpha(C.textPrimary, 0.12)} style={a.heroAmountInput} selectionColor={withAlpha(C.accent, 0.25)} accessibilityLabel={t.savings.nowLabel} />
              </View>
            </View>

            {/* Account name */}
            <View style={[a.fieldCard, neu.raisedSoft]}>
              <Text style={a.cardLabel}>{t.savings.accountName} <Text style={a.reqStar}>*</Text></Text>
              <TextInput value={name} onChangeText={setName} placeholder={t.savings.accountNamePlaceholder} placeholderTextColor={withAlpha(C.textPrimary, 0.25)} style={a.fieldInput} selectionColor={withAlpha(C.accent, 0.25)} />
            </View>

            {/* Type — dropdown picker (same UX as the Add Debt category picker) */}
            <CategoryPicker
              categories={SAVINGS_TYPE_OPTIONS}
              selectedId={type}
              onSelect={setType}
              label={t.savings.typeLabel}
              layout="dropdown"
              showManageHint={false}
            />

            {isCustomLike && (
              <View style={[a.fieldCard, neu.raisedSoft]}>
                <Text style={a.cardLabel}>{t.savings.descriptionLabel}</Text>
                <TextInput value={description} onChangeText={setDescription} placeholder={t.savings.descriptionPlaceholder} placeholderTextColor={withAlpha(C.textPrimary, 0.25)} style={a.fieldInput} selectionColor={withAlpha(C.accent, 0.25)} />
              </View>
            )}

            {/* Put in */}
            <View style={[a.fieldCard, neu.raisedSoft]}>
              <Text style={a.cardLabel}>{t.savings.putInLabel}</Text>
              <View style={a.amtRow}>
                <Text style={a.amtCur}>{currency}</Text>
                <TextInput value={initial} onChangeText={(v) => setInitial(normAmount(v))} keyboardType="decimal-pad" maxLength={13} placeholder={!editing && current.trim() ? current : '0'} placeholderTextColor={withAlpha(C.textPrimary, 0.25)} style={a.amtInput} selectionColor={withAlpha(C.accent, 0.25)} accessibilityLabel={t.savings.putInLabel} />
              </View>
            </View>

            {/* Annual rate */}
            <View style={[a.fieldCard, neu.raisedSoft]}>
              <Text style={a.cardLabel}>{t.savings.annualRateLabel}</Text>
              <TextInput value={rate} onChangeText={(v) => setRate(normAmount(v))} keyboardType="decimal-pad" placeholder={t.savings.annualRatePlaceholder} placeholderTextColor={withAlpha(C.textPrimary, 0.25)} style={a.fieldInput} selectionColor={withAlpha(C.accent, 0.25)} />
            </View>

            {/* Target */}
            <View style={[a.fieldCard, neu.raisedSoft]}>
              <Text style={a.cardLabel}>{t.savings.targetFieldLabel} <Text style={a.optional}>{t.savings.optionalTag}</Text></Text>
              <View style={a.amtRow}>
                <Text style={a.amtCur}>{currency}</Text>
                <TextInput value={target} onChangeText={(v) => setTarget(normAmount(v))} keyboardType="decimal-pad" maxLength={13} placeholder={t.savings.targetPlaceholder} placeholderTextColor={withAlpha(C.textPrimary, 0.25)} style={a.amtInput} selectionColor={withAlpha(C.accent, 0.25)} accessibilityLabel={t.savings.targetFieldLabel} />
              </View>
            </View>

            {parseFloat(target) > 0 && (
              <View style={[a.fieldCard, neu.raisedSoft]}>
                <Text style={a.cardLabel}>{t.savings.goalNameLabel}</Text>
                <TextInput value={goalName} onChangeText={setGoalName} placeholder={t.savings.goalNamePlaceholder} placeholderTextColor={withAlpha(C.textPrimary, 0.25)} style={a.fieldInput} selectionColor={withAlpha(C.accent, 0.25)} />
              </View>
            )}

            {/* Delete — edit mode only, sits in scroll content */}
            {editing && (
              <Pressable style={a.deleteLink} onPress={confirmDelete} hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }} accessibilityRole="button" accessibilityLabel={t.savings.deleteThisAccount}>
                {({ pressed }) => (
                  <View style={[a.deleteLinkInner, pressed && { opacity: 0.55 }]}>
                    <Feather name="trash-2" size={13} color={C.textMuted} />
                    <Text style={a.deleteLinkText}>{t.savings.deleteThisAccount}</Text>
                  </View>
                )}
              </Pressable>
            )}
          </KeyboardAwareScrollView>

          {/* Anchored save zone — rides above the keyboard so the decimal-pad
              (which has no Done key) never buries the primary action. */}
          <KeyboardStickyView offset={{ opened: 0 }}>
            <View style={[a.saveZone, { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.sm) }]}>
              <Reanimated.View style={saveAnimStyle}>
                <Pressable
                  style={[a.saveBtn, neu.raised, { backgroundColor: C.accent }, !canSave && a.saveBtnDisabled]}
                  onPress={save}
                  onPressIn={() => { saveScale.value = withTiming(0.97, { duration: 120 }); }}
                  onPressOut={() => { saveScale.value = withSpring(1, { damping: 18, stiffness: 240 }); }}
                  accessibilityRole="button"
                  accessibilityLabel={editing ? t.savings.saveChanges : t.savings.addAccount.toLowerCase()}
                >
                  <View style={a.saveBtnInner}>
                    <Feather name={editing ? 'check' : 'plus'} size={16} color={canSave ? C.surface : C.textMuted} />
                    <Text style={[a.saveBtnText, !canSave && a.saveBtnTextDisabled]}>{editing ? t.savings.saveChanges : t.savings.addAccount.toLowerCase()}</Text>
                  </View>
                </Pressable>
              </Reanimated.View>
              <Pressable style={a.closeLink} onPress={requestClose} hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }} accessibilityRole="button" accessibilityLabel={t.savings.closeLabel}>
                {({ pressed }) => (
                  <View style={[a.closeLinkInner, pressed && { opacity: 0.55 }]}>
                    <Feather name="x" size={12} color={C.textMuted} />
                    <Text style={a.closeLinkText}>{t.savings.closeLabel}</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </KeyboardStickyView>

          <ModalToastHost />
        </Reanimated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

// ═══════════════════ UPDATE VALUE ═══════════════════
const SNAP_TYPES: { key: SnapshotType; labelKey: 'updateType' | 'depositType' | 'dividend' | 'withdrawalType'; icon: keyof typeof Feather.glyphMap }[] = [
  { key: 'manual', labelKey: 'updateType', icon: 'refresh-cw' },
  { key: 'deposit', labelKey: 'depositType', icon: 'plus-circle' },
  { key: 'dividend', labelKey: 'dividend', icon: 'gift' },
  { key: 'withdrawal', labelKey: 'withdrawalType', icon: 'arrow-down-left' },
];

export const UpdateValueSheet: React.FC<{ visible: boolean; account: SavingsAccount | null; currency: string; onClose: () => void; onSnapshot: (id: string, value: number, note?: string, snapshotType?: SnapshotType) => void }> = ({ visible, account, currency, onClose, onSnapshot }) => {
  const C = useCalm();
  const t = useT();
  const neu = useNeu(undefined, { faintDark: true });
  const a = useMemo(() => addSheetStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [snap, setSnap] = useState<SnapshotType>('manual');

  // Guards a rapid double-tap on Save: the Modal stays mounted/interactive
  // through its slide-out, so without this a second tap re-runs save() and
  // records a duplicate snapshot. Set in save(), auto-cleared there.
  const savingRef = useRef(false);

  // Reset when the sheet opens for a (new) account — adjust-during-render, not an effect.
  const [syncKey, setSyncKey] = useState<string | null>(null);
  const opened = visible && account ? account.id : null;
  if (opened !== syncKey) {
    setSyncKey(opened);
    if (opened !== null && account) { setValue(String(account.currentValue)); setNote(''); setSnap('manual'); savingRef.current = false; }
  }

  // ── Drag-to-dismiss + spring-in (same mechanism as the Add/Edit sheet) ──
  const { height: SCREEN_H } = useWindowDimensions();
  const sheetY = useSharedValue(SCREEN_H);
  const dragStart = useSharedValue(0);
  const saveScale = useSharedValue(1);
  const closingRef = useRef(false);
  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      sheetY.value = SCREEN_H;
      sheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 });
    }
  }, [visible, SCREEN_H, sheetY]);
  const finishClose = useCallback(() => { closingRef.current = false; onClose(); }, [onClose]);
  // Re-arm the close guard when the user grabs the handle mid-slide-out: that
  // pan cancels the close-timing's callback (finished === false) so finishClose
  // never clears closingRef, which would otherwise wedge the sheet shut forever.
  const clearClosing = useCallback(() => { closingRef.current = false; }, []);
  const requestClose = useCallback(() => {
    Keyboard.dismiss();
    if (closingRef.current) return;
    closingRef.current = true;
    sheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => { if (finished) runOnJS(finishClose)(); });
  }, [SCREEN_H, sheetY, finishClose]);
  const sheetGesture = useMemo(() => Gesture.Pan()
    .activeOffsetY([10, 9999])
    .onStart(() => { 'worklet'; runOnJS(clearClosing)(); dragStart.value = sheetY.value; })
    .onUpdate((e) => { 'worklet'; let y = dragStart.value + e.translationY; if (y < 0) y = y / 3; sheetY.value = y; })
    .onEnd((e) => { 'worklet'; if (e.translationY > 100 || e.velocityY > 800) runOnJS(requestClose)(); else sheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 }); }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [SCREEN_H, requestClose]);
  // Only the sheet's own drag position drives translateY now — the keyboard is
  // handled by the KeyboardAwareScrollView below (it keeps the focused field
  // visible), so lifting the whole sheet by the full keyboard height (which
  // clipped the title off the top on small devices) is no longer needed.
  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));
  const backdropAnimStyle = useAnimatedStyle(() => ({ opacity: interpolate(sheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP) }));
  const saveAnimStyle = useAnimatedStyle(() => ({ transform: [{ scale: saveScale.value }] }));

  const preview = useMemo(() => {
    if (!account) return null;
    const v = parseFloat(normAmount(value));
    if (isNaN(v)) return null;
    const diff = v - account.currentValue;
    const pct = account.currentValue > 0 ? (diff / account.currentValue) * 100 : 0;
    return { diff, pct };
  }, [value, account]);

  const canSave = normAmount(value) !== '' && Number.isFinite(parseFloat(normAmount(value))) && parseFloat(normAmount(value)) >= 0;

  const save = useCallback(() => {
    if (savingRef.current) return;
    if (!account) return;
    const v = parseFloat(normAmount(value));
    if (!Number.isFinite(v) || v < 0) { showToast(t.savings.enterValidValue, 'error'); return; }
    // Direction guard: a mistagged capital move (a "withdraw" that raises the value,
    // or an "add money" that lowers it) would push the delta into gain/loss instead
    // of the cost basis — steer the user to the right pill before committing.
    if (snap === 'withdrawal' && v > account.currentValue) { showToast(t.savings.withdrawMustLower, 'error'); return; }
    if (snap === 'deposit' && v < account.currentValue) { showToast(t.savings.depositMustRaise, 'error'); return; }
    // Commit past this point — block re-entrant double-taps while the Modal
    // slides out. Auto-clears shortly after so the next open starts unlocked
    // (mirrors the Add/Edit sheet's saving-flag + timeout).
    savingRef.current = true;
    setTimeout(() => { savingRef.current = false; }, 600);
    onSnapshot(account.id, v, note.trim() || undefined, snap);
    showToast(t.savings.valueUpdated, 'success'); successNotification(); requestClose();
  }, [account, value, note, snap, onSnapshot, requestClose, showToast, t]);

  const fmt = (v: number) => `${currency} ${v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const typeInfo = account ? SAVINGS_TYPE_OPTIONS.find((o) => o.id === account.type) : null;
  const subtitle = account ? `${typeInfo?.name ?? ''}${account.annualRate ? ` · ${account.annualRate}% p.a.` : ''}`.trim() : '';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={requestClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Reanimated.View style={[a.backdrop, backdropAnimStyle]}>
          <Pressable style={{ flex: 1 }} onPress={requestClose} accessibilityLabel={t.savings.closeLabel} />
        </Reanimated.View>

        <Reanimated.View style={[a.sheetContainer, sheetAnimStyle]}>
          {/* Drag zone — handle + title */}
          <GestureDetector gesture={sheetGesture}>
            <View collapsable={false}>
              <View style={a.topRow}><View style={a.handle} /></View>
              <View style={a.titleZone}>
                <Text style={a.title} numberOfLines={1} ellipsizeMode="tail">
                  {t.savings.update.toLowerCase()}{' '}
                  <Text style={a.titleAccent}>{(account?.name ?? '').toLowerCase()}</Text>
                </Text>
                {!!subtitle && <Text style={a.subtitle} numberOfLines={1}>{subtitle}</Text>}
              </View>
            </View>
          </GestureDetector>

          <KeyboardAwareScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={a.scrollContent}
            bottomOffset={insets.bottom + 130}
            keyboardDismissMode="on-drag"
          >
            {/* Hero — new value + live change preview */}
            <View style={[a.heroCard, neu.raisedSoft]}>
              <Text style={a.cardLabel}>{t.savings.newValueLabel} <Text style={a.reqStar}>*</Text></Text>
              <View style={a.heroAmountRow}>
                <Text style={[a.heroCurrency, { color: C.accent }]} numberOfLines={1}>{currency}</Text>
                <TextInput value={value} onChangeText={(v) => setValue(normAmount(v))} keyboardType="decimal-pad" maxLength={13} autoFocus placeholder="0" placeholderTextColor={withAlpha(C.textPrimary, 0.12)} style={a.heroAmountInput} selectionColor={withAlpha(C.accent, 0.25)} accessibilityLabel={t.savings.newValueLabel} />
              </View>
              {preview && Math.abs(preview.diff) > 0.001 && (
                <View style={[a.preview, { backgroundColor: withAlpha(preview.diff >= 0 ? C.positive : C.neutral, 0.1) }]}>
                  <Feather name={preview.diff >= 0 ? 'trending-up' : 'trending-down'} size={14} color={preview.diff >= 0 ? C.positive : C.neutral} />
                  <Text style={[a.previewText, { color: preview.diff >= 0 ? C.positive : C.neutral }]}>
                    {preview.diff >= 0 ? '+' : ''}{fmt(preview.diff)} ({preview.diff >= 0 ? '+' : ''}{preview.pct.toFixed(1)}%)
                  </Text>
                </View>
              )}
            </View>

            {/* Type of update */}
            <Text style={a.cardLabel}>{t.savings.typeOfUpdate}</Text>
            <View style={a.snapRow}>
              {SNAP_TYPES.map((st) => {
                const on = snap === st.key;
                return (
                  <TouchableOpacity key={st.key} onPress={() => { setSnap(st.key); lightTap(); }} style={[a.snapPill, neu.raised, on && { backgroundColor: withAlpha(C.accent, 0.14) }]} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t.savings[st.labelKey]} accessibilityState={{ selected: on }}>
                    <Feather name={st.icon} size={13} color={on ? C.accent : C.textMuted} />
                    <Text style={[a.snapText, on && { color: C.accent, fontWeight: '700' }]}>{t.savings[st.labelKey]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Note */}
            <View style={[a.fieldCard, neu.raisedSoft]}>
              <Text style={a.cardLabel}>{t.savings.noteOptional}</Text>
              <TextInput value={note} onChangeText={setNote} placeholder={t.savings.monthlyCheckPlaceholder} placeholderTextColor={withAlpha(C.textPrimary, 0.25)} style={a.fieldInput} selectionColor={withAlpha(C.accent, 0.25)} />
            </View>
          </KeyboardAwareScrollView>

          {/* Anchored save zone — rides above the keyboard so the decimal-pad
              (which has no Done key) never buries the primary action. */}
          <KeyboardStickyView offset={{ opened: 0 }}>
            <View style={[a.saveZone, { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.sm) }]}>
              <Reanimated.View style={saveAnimStyle}>
                <Pressable
                  style={[a.saveBtn, neu.raised, { backgroundColor: C.accent }, !canSave && a.saveBtnDisabled]}
                  onPress={save}
                  onPressIn={() => { saveScale.value = withTiming(0.97, { duration: 120 }); }}
                  onPressOut={() => { saveScale.value = withSpring(1, { damping: 18, stiffness: 240 }); }}
                  accessibilityRole="button"
                  accessibilityLabel={t.savings.save.toLowerCase()}
                >
                  <View style={a.saveBtnInner}>
                    <Feather name="check" size={16} color={canSave ? C.surface : C.textMuted} />
                    <Text style={[a.saveBtnText, !canSave && a.saveBtnTextDisabled]}>{t.savings.save.toLowerCase()}</Text>
                  </View>
                </Pressable>
              </Reanimated.View>
              <Pressable style={a.closeLink} onPress={requestClose} hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }} accessibilityRole="button" accessibilityLabel={t.savings.closeLabel}>
                {({ pressed }) => (
                  <View style={[a.closeLinkInner, pressed && { opacity: 0.55 }]}>
                    <Feather name="x" size={12} color={C.textMuted} />
                    <Text style={a.closeLinkText}>{t.savings.closeLabel}</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </KeyboardStickyView>

          <ModalToastHost />
        </Reanimated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

// ═══════════════════ HISTORY ═══════════════════
export const HistorySheet: React.FC<{ visible: boolean; account: SavingsAccount | null; currency: string; onClose: () => void }> = ({ visible, account, currency, onClose }) => {
  const C = useCalm();
  const t = useT();
  const neu = useNeu(undefined, { faintDark: true });
  const a = useMemo(() => addSheetStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const fmt = (v: number) => `${currency} ${v.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // ── Drag-to-dismiss + spring-in (same mechanism as the other sheets) ──
  const { height: SCREEN_H } = useWindowDimensions();
  const sheetY = useSharedValue(SCREEN_H);
  const dragStart = useSharedValue(0);
  const closingRef = useRef(false);
  useEffect(() => {
    if (visible) { closingRef.current = false; sheetY.value = SCREEN_H; sheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 }); }
  }, [visible, SCREEN_H, sheetY]);
  const finishClose = useCallback(() => { closingRef.current = false; onClose(); }, [onClose]);
  // Re-arm the close guard when the user grabs the handle mid-slide-out: that
  // pan cancels the close-timing's callback (finished === false) so finishClose
  // never clears closingRef, which would otherwise wedge the sheet shut forever.
  const clearClosing = useCallback(() => { closingRef.current = false; }, []);
  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    sheetY.value = withTiming(SCREEN_H, { duration: 220 }, (finished) => { if (finished) runOnJS(finishClose)(); });
  }, [SCREEN_H, sheetY, finishClose]);
  const sheetGesture = useMemo(() => Gesture.Pan()
    .activeOffsetY([10, 9999])
    .onStart(() => { 'worklet'; runOnJS(clearClosing)(); dragStart.value = sheetY.value; })
    .onUpdate((e) => { 'worklet'; let y = dragStart.value + e.translationY; if (y < 0) y = y / 3; sheetY.value = y; })
    .onEnd((e) => { 'worklet'; if (e.translationY > 100 || e.velocityY > 800) runOnJS(requestClose)(); else sheetY.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.5 }); }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [SCREEN_H, requestClose]);
  const sheetAnimStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetY.value }] }));
  const backdropAnimStyle = useAnimatedStyle(() => ({ opacity: interpolate(sheetY.value, [0, SCREEN_H], [1, 0], Extrapolation.CLAMP) }));

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

  const typeInfo = account ? SAVINGS_TYPE_OPTIONS.find((o) => o.id === account.type) : null;
  const subtitle = account ? `${typeInfo?.name ?? ''}${account.annualRate ? ` · ${account.annualRate}% p.a.` : ''}`.trim() : '';
  const pos = data ? data.gain >= 0 : true;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={requestClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Reanimated.View style={[a.backdrop, backdropAnimStyle]}>
          <Pressable style={{ flex: 1 }} onPress={requestClose} accessibilityLabel={t.savings.closeLabel} />
        </Reanimated.View>

        <Reanimated.View style={[a.sheetContainer, sheetAnimStyle]}>
          {/* Drag zone — handle + title */}
          <GestureDetector gesture={sheetGesture}>
            <View collapsable={false}>
              <View style={a.topRow}><View style={a.handle} /></View>
              <View style={a.titleZone}>
                <Text style={a.title} numberOfLines={1} ellipsizeMode="tail">
                  {t.savings.historyTitle.toLowerCase()}{' '}
                  <Text style={a.titleAccent}>{(account?.name ?? '').toLowerCase()}</Text>
                </Text>
                {!!subtitle && <Text style={a.subtitle} numberOfLines={1}>{subtitle}</Text>}
              </View>
            </View>
          </GestureDetector>

          {account && data && (
            <KeyboardAwareScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[a.scrollContent, { paddingBottom: Math.max(SPACING.lg, insets.bottom + SPACING.md) }]}
            >
              {/* Summary hero — current value + return, sparkline, invested/gain */}
              <View style={[a.histHero, neu.raisedSoft]}>
                <View style={a.histHeroTop}>
                  <View>
                    <Text style={a.cardLabel}>{t.savings.historyCurrent}</Text>
                    <Text style={a.histHeroValue}>{fmt(account.currentValue)}</Text>
                  </View>
                  <View style={[a.histRetPill, { backgroundColor: withAlpha(pos ? C.positive : C.neutral, 0.14) }]}>
                    <Text style={[a.histRetText, { color: pos ? C.positive : C.neutral }]}>{pos ? '+' : ''}{data.ret.toFixed(1)}%</Text>
                  </View>
                </View>
                {data.sparkline.length >= 2 && (
                  <View style={a.histSpark}><Sparkline data={data.sparkline} height={56} color={pos ? C.positive : C.neutral} showDot filled strokeWidth={2} /></View>
                )}
                <View style={a.histHeroStats}>
                  <View style={a.histStat}><Text style={a.histStatLabel}>{t.savings.historyInvested}</Text><Text style={a.histStatVal}>{fmt(account.initialInvestment)}</Text></View>
                  <View style={[a.histStat, a.histStatBorder]}><Text style={a.histStatLabel}>{t.savings.historyReturn}</Text><Text style={[a.histStatVal, { color: pos ? C.positive : C.neutral }]}>{pos ? '+' : ''}{fmt(data.gain)}</Text></View>
                </View>
              </View>

              {/* Grouped history */}
              {data.grouped.map((g) => (
                <View key={g.month} style={a.histGroup}>
                  <Text style={a.histMonthLabel}>{g.month}</Text>
                  <View style={[a.histGroupCard, neu.raisedSoft]}>
                    {g.items.map((snap, i) => {
                      const d = snap.date instanceof Date ? snap.date : new Date(snap.date as any);
                      const dotColor = snap.snapshotType === 'dividend' ? C.gold : snap.snapshotType === 'withdrawal' ? C.neutral : snap.snapshotType === 'deposit' ? C.bronze : C.accent;
                      return (
                        <View key={snap.id || i} style={[a.histEntry, i > 0 && a.histEntryBorder]}>
                          <View style={[a.histDot, { backgroundColor: dotColor }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={a.histEntryVal}>{fmt(snap.value)}</Text>
                            {!!snap.note && <Text style={a.histEntryNote} numberOfLines={1}>{snap.note}</Text>}
                          </View>
                          <Text style={a.histEntryDate}>{isValid(d) ? format(d, 'MMM d') : ''}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              ))}

              {/* Close */}
              <Pressable style={a.closeLink} onPress={requestClose} hitSlop={{ top: 12, bottom: 12, left: 14, right: 14 }} accessibilityRole="button" accessibilityLabel={t.savings.closeLabel}>
                {({ pressed }) => (
                  <View style={[a.closeLinkInner, pressed && { opacity: 0.55 }]}>
                    <Feather name="x" size={12} color={C.textMuted} />
                    <Text style={a.closeLinkText}>{t.savings.closeLabel}</Text>
                  </View>
                )}
              </Pressable>
            </KeyboardAwareScrollView>
          )}
        </Reanimated.View>
      </GestureHandlerRootView>
    </Modal>
  );
};

// ─────────────────────────── styles ───────────────────────────

// ─── Add/Edit Account sheet — mirrors the Add Debt modal's visual language ───
// (centered serif-accent title, hero amount card, neu field cards, anchored save)
const addSheetStyles = (C: typeof CALM) => StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheetContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: C.background, borderTopLeftRadius: RADIUS['2xl'], borderTopRightRadius: RADIUS['2xl'], maxHeight: '92%' },
  topRow: { alignItems: 'center', paddingTop: SPACING.sm, paddingBottom: SPACING.sm },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: withAlpha(C.textPrimary, 0.15) },
  titleZone: { alignItems: 'center', paddingHorizontal: SPACING.xl, paddingBottom: SPACING.lg },
  title: { fontSize: TYPOGRAPHY.size.xl, fontWeight: '600', color: C.textPrimary, letterSpacing: C === CALM_DARK ? -0.2 : -0.4, textAlign: 'center' },
  titleAccent: { fontStyle: 'italic', fontFamily: 'serif', fontWeight: '400', color: C.accent },
  subtitle: { fontSize: TYPOGRAPHY.size.sm, color: C.textMuted, marginTop: SPACING.xs + 2, letterSpacing: 0.1, textAlign: 'center' },
  scrollContent: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.lg },

  // Hero amount card
  heroCard: { backgroundColor: C.background, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.lg, marginBottom: SPACING.md },
  heroAmountRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: SPACING.xs },
  heroCurrency: { fontSize: 22, fontWeight: '500', fontVariant: ['tabular-nums'], marginRight: 4, letterSpacing: -0.2, maxWidth: '40%' },
  heroAmountInput: { flex: 1, fontSize: 36, fontWeight: '600', color: C.textPrimary, fontVariant: ['tabular-nums'], letterSpacing: -0.8, paddingVertical: 0 },

  // Labels
  cardLabel: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, fontWeight: '500', marginBottom: 4, letterSpacing: 0.2, textTransform: 'lowercase' },
  reqStar: { fontSize: TYPOGRAPHY.size.sm, color: '#C1694F', fontWeight: '700' },
  optional: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, fontWeight: '400', fontStyle: 'italic' },

  // Generic field card
  fieldCard: { backgroundColor: C.background, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md + 2, paddingVertical: SPACING.sm + 4, marginBottom: SPACING.md },
  fieldInput: { fontSize: TYPOGRAPHY.size.base, color: C.textPrimary, fontWeight: '500', paddingVertical: 2, minHeight: 22 },
  amtRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  amtCur: { fontSize: TYPOGRAPHY.size.base, color: C.textSecondary, fontWeight: '600', marginRight: 6 },
  amtInput: { flex: 1, fontSize: TYPOGRAPHY.size.lg, color: C.textPrimary, fontWeight: '600', fontVariant: ['tabular-nums'], paddingVertical: 2 },

  // Update-value: snapshot-type pills + change preview
  snapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2, marginBottom: SPACING.md },
  snapPill: { flexGrow: 1, flexBasis: '46%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: C.background },
  snapText: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, fontWeight: '600' },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.full, marginTop: 12 },
  previewText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: '700', fontVariant: ['tabular-nums'] },

  // Anchored save zone
  saveZone: { paddingHorizontal: SPACING.xl, paddingTop: SPACING.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(C.textPrimary, 0.06), backgroundColor: C.background },
  saveBtn: { width: '100%', paddingVertical: SPACING.md + 2, borderRadius: RADIUS.full, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', minHeight: 52 },
  saveBtnDisabled: { backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.12 : 0.08) },
  saveBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  saveBtnText: { fontSize: TYPOGRAPHY.size.base, fontWeight: '600', color: C.surface, letterSpacing: 0.3 },
  saveBtnTextDisabled: { color: C.textMuted },

  closeLink: { marginTop: SPACING.lg, alignSelf: 'center' },
  closeLinkInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm },
  closeLinkText: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, fontWeight: '500', letterSpacing: 0.2 },

  deleteLink: { marginTop: SPACING.md, alignSelf: 'center' },
  deleteLinkInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm },
  deleteLinkText: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, fontWeight: '500', letterSpacing: 0.2 },

  // ── History sheet ──
  histHero: { backgroundColor: C.background, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.md, marginBottom: SPACING.md },
  histHeroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  histHeroValue: { fontSize: TYPOGRAPHY.size['2xl'], fontWeight: '700', color: C.textPrimary, letterSpacing: -0.3, fontVariant: ['tabular-nums'], marginTop: 2 },
  histRetPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: RADIUS.full },
  histRetText: { fontSize: TYPOGRAPHY.size.xs, fontWeight: '700', fontVariant: ['tabular-nums'] },
  histSpark: { marginTop: 12, marginHorizontal: -2 },
  histHeroStats: { flexDirection: 'row', marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.10 : 0.06) },
  histStat: { flex: 1 },
  histStatBorder: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.10 : 0.06), paddingLeft: SPACING.md },
  histStatLabel: { fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.4, color: C.textMuted, fontWeight: '600' },
  histStatVal: { fontSize: TYPOGRAPHY.size.sm, fontWeight: '700', color: C.textPrimary, marginTop: 3, fontVariant: ['tabular-nums'] },
  histGroup: { marginBottom: SPACING.md },
  histMonthLabel: { fontSize: TYPOGRAPHY.size.xs, textTransform: 'uppercase', letterSpacing: 0.6, color: C.textMuted, fontWeight: '700', marginBottom: 8, marginLeft: 2 },
  histGroupCard: { backgroundColor: C.background, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: 2 },
  histEntry: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  histEntryBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.08 : 0.05) },
  histDot: { width: 8, height: 8, borderRadius: 4 },
  histEntryVal: { fontSize: TYPOGRAPHY.size.sm, fontWeight: '600', color: C.textPrimary, fontVariant: ['tabular-nums'] },
  histEntryNote: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: 2 },
  histEntryDate: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, fontWeight: '600' },
});
