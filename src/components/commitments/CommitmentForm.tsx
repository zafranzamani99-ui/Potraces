import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, Modal, TextInput, TouchableOpacity,
  Switch, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { format, isValid } from 'date-fns';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, BILLING_CYCLES, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useCategories } from '../../hooks/useCategories';
import { useSettingsStore } from '../../store/settingsStore';
import { useWalletStore } from '../../store/walletStore';
import { useT } from '../../i18n';
import { lightTap, mediumTap } from '../../services/haptics';
import { Subscription } from '../../types';
import CategoryPicker from '../common/CategoryPicker';
import CalendarPicker from '../common/CalendarPicker';
import WalletLogo from '../common/WalletLogo';

type SubView = 'form' | 'calendar' | 'walletPicker';

type SavePayload = Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'>;

interface Props {
  visible: boolean;
  subscription: Subscription | null;          // null = add mode
  onClose: () => void;
  onSave: (payload: SavePayload) => void;
  onDelete?: (sub: Subscription) => void;
  onError?: (message: string) => void;
}

const CYCLE_OPTIONS: { value: Subscription['billingCycle']; label: string; short: string }[] = [
  { value: 'weekly',    label: 'weekly',    short: 'wk' },
  { value: 'monthly',   label: 'monthly',   short: 'mo' },
  { value: 'quarterly', label: 'quarterly', short: 'qtr' },
  { value: 'yearly',    label: 'yearly',    short: 'yr' },
];

const CommitmentForm: React.FC<Props> = ({ visible, subscription, onClose, onSave, onDelete, onError }) => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const expenseCategories = useCategories('expense');
  const wallets = useWalletStore(s => s.wallets);
  const currency = useSettingsStore(s => s.currency);

  const isEditMode = subscription !== null;

  // ── Form state ───────────────────────────────────────────
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<string>(expenseCategories[0]?.id || 'food');
  const [billingCycle, setBillingCycle] = useState<Subscription['billingCycle']>('monthly');
  const [reminderDays, setReminderDays] = useState('3');
  const [startDate, setStartDate] = useState(new Date());
  const [isInstallment, setIsInstallment] = useState(false);
  const [totalInstallments, setTotalInstallments] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [walletId, setWalletId] = useState<string | undefined>(undefined);
  const [outstandingBalance, setOutstandingBalance] = useState('');

  const [subView, setSubView] = useState<SubView>('form');

  // ── Reset / hydrate when opening ────────────────────────
  useEffect(() => {
    if (!visible) return;
    if (subscription) {
      setName(subscription.name);
      setAmount(subscription.amount.toString());
      setNote(subscription.note || '');
      setCategory(subscription.category);
      setBillingCycle(subscription.billingCycle);
      setReminderDays(subscription.reminderDays.toString());
      setStartDate(isValid(subscription.startDate) ? subscription.startDate : new Date());
      setIsInstallment(subscription.isInstallment || false);
      setTotalInstallments(subscription.totalInstallments?.toString() || '');
      setIsPaused(subscription.isPaused || false);
      setWalletId(subscription.walletId);
      setOutstandingBalance(subscription.outstandingBalance?.toString() || '');
    } else {
      setName('');
      setAmount('');
      setNote('');
      setCategory(expenseCategories[0]?.id || 'food');
      setBillingCycle('monthly');
      setReminderDays('3');
      setStartDate(new Date());
      setIsInstallment(false);
      setTotalInstallments('');
      setIsPaused(false);
      setWalletId(undefined);
      setOutstandingBalance('');
    }
    setSubView('form');
  }, [visible, subscription, expenseCategories]);

  const selectedWallet = useMemo(() => wallets.find(w => w.id === walletId), [wallets, walletId]);

  const handleSave = useCallback(() => {
    if (!name.trim()) { onError?.(t.subscriptions.enterName); return; }
    const amt = parseFloat(amount);
    if (!amt || isNaN(amt) || amt <= 0) { onError?.(t.subscriptions.enterValidAmount); return; }

    const validStart = isValid(startDate) ? startDate : new Date();

    const payload: SavePayload = {
      name: name.trim(),
      amount: amt,
      category,
      billingCycle,
      startDate: validStart,
      // nextBillingDate is recomputed by the store on save; pass startDate as a placeholder.
      nextBillingDate: subscription?.nextBillingDate || validStart,
      isActive: true,
      isPaused,
      reminderDays: parseInt(reminderDays) || 3,
      isInstallment,
      note: note.trim() || undefined,
      walletId,
      ...(isInstallment && { totalInstallments: parseInt(totalInstallments) || 1, completedInstallments: subscription?.completedInstallments || 0 }),
      ...(isInstallment && outstandingBalance && parseFloat(outstandingBalance) > 0 && {
        outstandingBalance: parseFloat(outstandingBalance),
      }),
    };
    mediumTap();
    onSave(payload);
  }, [name, amount, note, category, billingCycle, startDate, reminderDays, isInstallment, totalInstallments, isPaused, walletId, outstandingBalance, subscription, onSave, onError, t]);

  // ── Render ──────────────────────────────────────────────
  const renderFormBody = () => (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      nestedScrollEnabled
      contentContainerStyle={{ paddingBottom: SPACING.xl }}
    >
      {/* ── the basics ── */}
      <Text style={styles.sectionLabel}>the basics</Text>
      <View style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>name</Text>
        <TextInput
          style={styles.fieldInput}
          value={name}
          onChangeText={setName}
          placeholder={t.subscriptions.namePlaceholder}
          placeholderTextColor={C.textMuted}
          returnKeyType="next"
        />
      </View>
      <View style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>amount</Text>
        <View style={styles.amountRow}>
          <Text style={styles.amountPrefix}>{currency}</Text>
          <TextInput
            style={[styles.fieldInput, { flex: 1, paddingVertical: 0 }]}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="decimal-pad"
            placeholderTextColor={C.textMuted}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />
        </View>
      </View>
      <View style={styles.fieldCard}>
        <CategoryPicker
          categories={expenseCategories}
          selectedId={category}
          onSelect={setCategory}
          label="category"
          layout="dropdown"
        />
      </View>

      {/* ── schedule ── */}
      <Text style={styles.sectionLabel}>schedule</Text>
      <View style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>repeats</Text>
        <View style={styles.cyclePillRow}>
          {CYCLE_OPTIONS.map(opt => {
            const active = billingCycle === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[styles.cyclePill, active && styles.cyclePillActive]}
                onPress={() => { lightTap(); setBillingCycle(opt.value); }}
                activeOpacity={0.7}
              >
                <Text style={[styles.cyclePillText, active && styles.cyclePillTextActive]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <TouchableOpacity
        style={styles.fieldCard}
        onPress={() => { lightTap(); setSubView('calendar'); }}
        activeOpacity={0.7}
      >
        <Text style={styles.fieldLabel}>start date</Text>
        <View style={styles.fieldRow}>
          <Text style={styles.fieldValue}>
            {isValid(startDate) ? format(startDate, 'MMM dd, yyyy') : t.subscriptions.selectDate}
          </Text>
          <Feather name="calendar" size={16} color={C.textMuted} />
        </View>
      </TouchableOpacity>
      <View style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>remind me</Text>
        <View style={styles.reminderRow}>
          <TextInput
            style={styles.reminderInput}
            value={reminderDays}
            onChangeText={setReminderDays}
            placeholder="3"
            keyboardType="number-pad"
            placeholderTextColor={C.textMuted}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />
          <Text style={styles.reminderSuffix}>days before due</Text>
        </View>
      </View>

      {/* ── payment source ── */}
      <Text style={styles.sectionLabel}>payment source</Text>
      <TouchableOpacity
        style={styles.fieldCard}
        onPress={() => { lightTap(); setSubView('walletPicker'); }}
        activeOpacity={0.7}
      >
        <Text style={styles.fieldLabel}>wallet <Text style={styles.fieldLabelOptional}>(optional)</Text></Text>
        <View style={styles.fieldRow}>
          {selectedWallet ? (
            <View style={styles.walletRow}>
              <WalletLogo wallet={selectedWallet} size={20} />
              <Text style={styles.fieldValue}>{selectedWallet.name}</Text>
            </View>
          ) : (
            <Text style={[styles.fieldValue, { color: C.textMuted }]}>none — choose later</Text>
          )}
          <Feather name="chevron-down" size={16} color={C.textMuted} />
        </View>
      </TouchableOpacity>

      {/* ── installment plan ── */}
      <Text style={styles.sectionLabel}>installment plan</Text>
      <View style={styles.toggleCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleLabel}>{t.subscriptions.installmentLabel}</Text>
          <Text style={styles.toggleHint}>{t.subscriptions.installmentHint}</Text>
        </View>
        <Switch
          value={isInstallment}
          onValueChange={val => { lightTap(); setIsInstallment(val); }}
          trackColor={{ false: C.border, true: withAlpha(C.accent, 0.4) }}
          thumbColor={isInstallment ? C.accent : '#FFFFFF'}
        />
      </View>
      {isInstallment && (
        <>
          <View style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>total installments</Text>
            <TextInput
              style={styles.fieldInput}
              value={totalInstallments}
              onChangeText={setTotalInstallments}
              placeholder={t.subscriptions.totalInstallmentsPlaceholder}
              keyboardType="number-pad"
              placeholderTextColor={C.textMuted}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          </View>
          <View style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>outstanding balance <Text style={styles.fieldLabelOptional}>(optional)</Text></Text>
            <View style={styles.amountRow}>
              <Text style={styles.amountPrefix}>{currency}</Text>
              <TextInput
                style={[styles.fieldInput, { flex: 1, paddingVertical: 0 }]}
                value={outstandingBalance}
                onChangeText={setOutstandingBalance}
                placeholder="e.g. 24000 for a car loan"
                keyboardType="decimal-pad"
                placeholderTextColor={C.textMuted}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
            </View>
          </View>
        </>
      )}

      {/* ── status ── */}
      <Text style={styles.sectionLabel}>status</Text>
      <View style={[styles.toggleCard, isPaused && { backgroundColor: withAlpha(C.bronze, 0.06) }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleLabel}>{t.subscriptions.pauseThis}</Text>
          <Text style={styles.toggleHint}>{t.subscriptions.pauseHint}</Text>
        </View>
        <Switch
          value={isPaused}
          onValueChange={val => { lightTap(); setIsPaused(val); }}
          trackColor={{ false: C.border, true: withAlpha(C.bronze, 0.4) }}
          thumbColor={isPaused ? C.bronze : '#FFFFFF'}
        />
      </View>

      {/* ── note ── */}
      <Text style={styles.sectionLabel}>note</Text>
      <View style={styles.fieldCard}>
        <Text style={styles.fieldLabel}>add a note <Text style={styles.fieldLabelOptional}>(optional)</Text></Text>
        <TextInput
          style={[styles.fieldInput, { minHeight: 40, textAlignVertical: 'top' }]}
          value={note}
          onChangeText={setNote}
          placeholder="account login, cancellation date, linked card…"
          placeholderTextColor={C.textMuted}
          multiline
          returnKeyType="default"
        />
      </View>

      {/* ── save ── */}
      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.85}>
        <Text style={styles.saveBtnText}>
          {isEditMode ? t.common.save.toLowerCase() : t.subscriptions.addSubscription.toLowerCase()}
        </Text>
      </TouchableOpacity>

      {/* ── delete (edit mode) ── */}
      {isEditMode && onDelete && subscription && (
        <TouchableOpacity
          style={styles.deleteLink}
          onPress={() => onDelete(subscription)}
          activeOpacity={0.6}
        >
          <Text style={styles.deleteLinkText}>{t.subscriptions.deleteCommitment}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );

  const renderCalendarView = () => (
    <>
      <View style={styles.subModalHeader}>
        <TouchableOpacity onPress={() => setSubView('form')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.modalTitle}>{t.subscriptions.startDate}</Text>
        <View style={{ width: 32 }} />
      </View>
      <CalendarPicker
        value={startDate}
        onChange={(date) => { setStartDate(date); setSubView('form'); }}
      />
    </>
  );

  const renderWalletPickerView = () => (
    <>
      <View style={styles.subModalHeader}>
        <TouchableOpacity onPress={() => setSubView('form')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Feather name="arrow-left" size={20} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.modalTitle}>wallet</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        <TouchableOpacity
          style={[styles.pickerOption, !walletId && styles.pickerOptionActive]}
          onPress={() => { lightTap(); setWalletId(undefined); setSubView('form'); }}
          activeOpacity={0.6}
        >
          <Text style={[styles.pickerOptionText, !walletId && styles.pickerOptionTextActive]}>none</Text>
          {!walletId && <Feather name="check" size={18} color={C.accent} />}
        </TouchableOpacity>
        {wallets.map(wallet => {
          const isSelected = walletId === wallet.id;
          return (
            <TouchableOpacity
              key={wallet.id}
              style={[styles.pickerOption, isSelected && styles.pickerOptionActive]}
              onPress={() => { lightTap(); setWalletId(wallet.id); setSubView('form'); }}
              activeOpacity={0.6}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                <WalletLogo wallet={wallet} size={24} />
                <Text style={[styles.pickerOptionText, isSelected && styles.pickerOptionTextActive]}>{wallet.name}</Text>
              </View>
              {isSelected && <Feather name="check" size={18} color={C.accent} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </>
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={() => {
        if (subView !== 'form') { setSubView('form'); return; }
        onClose();
      }}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={() => {
          if (subView !== 'form') { setSubView('form'); return; }
          onClose();
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.kavWrapper}
        >
          <View
            style={[styles.modalCard, subView !== 'form' && { maxHeight: undefined }]}
            onStartShouldSetResponder={() => true}
          >
            {subView === 'form' && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {isEditMode ? t.subscriptions.editSubscription.toLowerCase() : t.subscriptions.addSubscription.toLowerCase()}
                  </Text>
                  <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Feather name="x" size={22} color={C.textPrimary} />
                  </TouchableOpacity>
                </View>
                {renderFormBody()}
              </>
            )}
            {subView === 'calendar' && renderCalendarView()}
            {subView === 'walletPicker' && renderWalletPickerView()}
          </View>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
};

// ─── Styles ───────────────────────────────────────────────
const makeStyles = (C: typeof CALM) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  kavWrapper: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  modalCard: {
    width: '92%',
    maxHeight: '88%',
    backgroundColor: C.background,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
    ...SHADOWS.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xl,
    paddingHorizontal: SPACING.xs,
  },
  subModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xl,
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },

  // section
  sectionLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    marginTop: SPACING.lg,
    marginBottom: SPACING.sm,
    paddingHorizontal: SPACING.xs,
  },

  // field card
  fieldCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: SPACING.sm,
  },
  fieldLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textMuted,
    marginBottom: 4,
  },
  fieldLabelOptional: {
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.textMuted,
  },
  fieldInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    paddingVertical: 4,
  },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fieldValue: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    flexShrink: 1,
  },

  // amount
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  amountPrefix: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },

  // cycle pills
  cyclePillRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
  },
  cyclePill: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: 'transparent',
  },
  cyclePillActive: {
    borderColor: C.accent,
    backgroundColor: withAlpha(C.accent, 0.08),
  },
  cyclePillText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textSecondary,
  },
  cyclePillTextActive: {
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // wallet row
  walletRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flexShrink: 1 },

  // reminder
  reminderRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  reminderInput: {
    width: 56,
    paddingVertical: 6,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  reminderSuffix: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },

  // toggle card
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: SPACING.sm,
    gap: SPACING.sm,
  },
  toggleLabel: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: 2,
  },
  toggleHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
  },

  // picker options (sub-views)
  pickerOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  pickerOptionActive: { backgroundColor: withAlpha(C.accent, 0.05) },
  pickerOptionText: { fontSize: TYPOGRAPHY.size.base, color: C.textPrimary },
  pickerOptionTextActive: { color: C.accent, fontWeight: TYPOGRAPHY.weight.semibold },

  // save / delete
  saveBtn: {
    backgroundColor: C.accent,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.xl,
    ...SHADOWS.sm,
  },
  saveBtnText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: '#FFFFFF',
  },
  deleteLink: {
    alignItems: 'center',
    paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
  },
  deleteLinkText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    textDecorationLine: 'underline',
  },
});

export default CommitmentForm;
