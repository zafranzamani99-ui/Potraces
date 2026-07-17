import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import BottomSheet from '../common/BottomSheet';
import ContactPicker from '../common/ContactPicker';
import WalletPicker from '../common/WalletPicker';
import { useNeu } from '../common/neu';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { lightTap } from '../../services/haptics';
import { formatAmount } from '../../utils/formatters';
import { roundMoney } from '../../utils/money';
import { computeEqualShares } from '../../utils/splitShares';
import { commitSplit } from '../../services/splitCommit';
import { useWalletStore } from '../../store/walletStore';
import { useAppStore } from '../../store/appStore';
import { SPACING, RADIUS, TYPOGRAPHY, withAlpha, CALM_DARK } from '../../constants';
import type { CALM } from '../../constants';
import type { Contact } from '../../types';

interface Props {
  visible: boolean;
  total: number;
  onClose: () => void;
  onCreated?: (splitId: string) => void;
}

const SELF_ID = '__self__';

const QuickSplitSheet: React.FC<Props> = ({ visible, total, onClose, onCreated }) => {
  const C = useCalm();
  const neuS = useNeu(undefined, { faintDark: true }); // cards sit on the sheet's C.background bg — blend, don't slab
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const wallets = useWalletStore((s) => s.wallets);

  const selfName = t.quickSplit.me;
  const self: Contact = useMemo(() => ({ id: SELF_ID, name: selfName, isFromPhone: false }), [selfName]);
  // "who's in" is a multi picker that starts with me — add others by typing or from contacts.
  const [participants, setParticipants] = useState<Contact[]>([self]);
  const [payerId, setPayerId] = useState<string>(SELF_ID);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [description, setDescription] = useState('');

  const roundedTotal = roundMoney(total);
  const shares = useMemo(
    () => computeEqualShares(roundedTotal, participants, payerId),
    [roundedTotal, participants, payerId]
  );
  // Representative (non-payer) share so the payer's rounding remainder doesn't
  // make "each pays" look off.
  const each = shares.find((p) => p.contact.id !== payerId)?.amount ?? shares[0]?.amount ?? 0;
  const canSave = roundedTotal > 0 && participants.length >= 2;

  const handleParticipantsChange = (list: Contact[]) => {
    setParticipants(list);
    // Keep the payer valid — fall back to me (or the first person) if they left.
    if (!list.some((c) => c.id === payerId)) {
      setPayerId(list.some((c) => c.id === SELF_ID) ? SELF_ID : (list[0]?.id ?? SELF_ID));
    }
  };

  const selectPayer = (id: string) => {
    lightTap();
    setPayerId(id);
    // Wallet only applies when I fronted the money.
    if (id !== SELF_ID) setWalletId(null);
  };

  const save = () => {
    if (!canSave) return;
    lightTap();
    const payer = participants.find((c) => c.id === payerId) ?? self;
    const parts = computeEqualShares(roundedTotal, participants, payer.id);
    const splitId = commitSplit({
      description: description.trim() || t.quickSplit.title,
      totalAmount: roundedTotal,
      splitMethod: 'equal',
      participants: parts,
      items: [],
      paidBy: payer,
      walletId: payer.id === SELF_ID ? walletId || undefined : undefined,
      mode: useAppStore.getState().mode,
    });
    onCreated?.(splitId);
    setParticipants([self]); setPayerId(SELF_ID); setWalletId(null); setDescription('');
    onClose();
  };

  // Title in the add-debt idiom: lead word plain, final word serif-italic accent.
  const titleWords = t.quickSplit.title.trim().split(/\s+/);
  const titleTail = (titleWords[titleWords.length - 1] || '').toLowerCase();
  const titleLead = titleWords.slice(0, -1).join(' ').toLowerCase();

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      header={
        <View style={styles.titleZone}>
          <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
            {titleLead ? titleLead + ' ' : ''}
            <Text style={styles.titleAccent}>{titleTail}</Text>
          </Text>
          <Text style={styles.subtitle}>{t.debts.subtitle}</Text>
        </View>
      }
    >
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Hero total */}
        <View style={[styles.heroCard, neuS.raisedSoft]}>
          <Text style={styles.cardLabel}>{t.quickSplit.total.toLowerCase()}</Text>
          <View style={styles.heroAmountRow}>
            <Text style={styles.heroCurrency}>RM</Text>
            <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
              {formatAmount(roundedTotal, '').trim()}
            </Text>
          </View>
          <Text style={styles.heroHint}>
            {t.quickSplit.eachPays.toLowerCase()} · {formatAmount(each)}
          </Text>
        </View>

        <View style={styles.divider} />

        {/* What for */}
        <View style={[styles.fieldCard, neuS.raisedSoft]}>
          <Text style={styles.cardLabel}>{t.quickSplit.description.toLowerCase()}</Text>
          <TextInput
            style={[styles.fieldInput, styles.fieldMultiline]}
            value={description}
            onChangeText={setDescription}
            placeholder={t.debts.descriptionPlaceholder}
            placeholderTextColor={withAlpha(C.textPrimary, 0.25)}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* Who's in — single input card (avatar + placeholder + contacts pill + recent chips) */}
        <View style={styles.pickerWrap}>
          <Text style={styles.pickerLabel}>{t.debts.whosIn}<Text style={styles.requiredStar}>*</Text></Text>
          <ContactPicker
            selectedContacts={participants}
            onSelect={handleParticipantsChange}
            mode="multi"
            includeSelf
            selfName={selfName}
            variant="input"
            hideLabel
            placeholder={t.debts.addNamePlaceholder}
          />
        </View>

        {/* Who paid — pick one of the people in the split */}
        <View style={styles.pickerWrap}>
          <Text style={styles.pickerLabel}>{t.debts.whoPaid}<Text style={styles.requiredStar}>*</Text></Text>
          <View style={styles.payerChips}>
            {participants.map((c) => {
              const active = payerId === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => selectPayer(c.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t.debts.paidByA11y.replace('{name}', c.name)}
                  accessibilityState={{ selected: active }}
                >
                  <View style={[styles.payerChip, neuS.raised, active && styles.payerChipActive]}>
                    <Text style={[styles.payerChipText, active && styles.payerChipTextActive]} numberOfLines={1}>{c.name}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Pay from — real WalletPicker, only when I fronted the money */}
        {payerId === SELF_ID && wallets.length > 0 && (
          <View style={styles.pickerWrap}>
            <WalletPicker
              wallets={wallets}
              selectedId={walletId}
              onSelect={setWalletId}
              onClear={() => setWalletId(null)}
              allowNone
              noneLabel={t.debts.noWallet}
              label={t.debts.payFrom}
              faintNeu
            />
          </View>
        )}

        {/* Save */}
        <Pressable
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={save}
          disabled={!canSave}
          accessibilityLabel={t.quickSplit.save}
        >
          <View style={styles.saveBtnInner}>
            <Feather name="check" size={16} color={canSave ? C.surface : C.textMuted} />
            <Text style={[styles.saveBtnText, !canSave && styles.saveBtnTextDisabled]}>
              {(canSave ? t.quickSplit.save : t.quickSplit.needTwo).toLowerCase()}
            </Text>
          </View>
        </Pressable>
      </ScrollView>
    </BottomSheet>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  // Title zone (mirrors the add-debt modal)
  titleZone: { alignItems: 'center', paddingHorizontal: SPACING.xl, paddingBottom: SPACING.lg },
  title: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? -0.2 : -0.4,
    textAlign: 'center',
  },
  titleAccent: {
    fontStyle: 'italic',
    fontFamily: 'serif',
    fontWeight: TYPOGRAPHY.weight.regular,
    color: C.accent,
  },
  subtitle: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textMuted,
    marginTop: SPACING.xs + 2,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  body: { paddingHorizontal: SPACING.xl, paddingBottom: SPACING.lg },

  // Hero total card
  heroCard: {
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.lg,
    marginBottom: SPACING.sm + 2,
  },
  cardLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  heroAmountRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: SPACING.xs },
  heroCurrency: {
    fontSize: 22,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    marginRight: 4,
    letterSpacing: -0.2,
  },
  heroAmount: {
    flex: 1,
    fontSize: 36,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.8,
  },
  heroHint: { fontSize: TYPOGRAPHY.size.xs, color: C.textMuted, marginTop: SPACING.xs, fontVariant: ['tabular-nums'] },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.10 : 0.06),
    marginVertical: SPACING.sm,
  },

  // What-for field card
  fieldCard: {
    backgroundColor: C.background,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.sm + 4,
    marginBottom: SPACING.sm + 2,
  },
  fieldInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
    paddingVertical: 2,
    minHeight: 22,
  },
  fieldMultiline: { minHeight: 44, paddingTop: 4, paddingBottom: 4, lineHeight: 20 },

  // Input-card picker sections (ContactPicker input variant renders its own card)
  pickerWrap: { marginBottom: SPACING.sm + 2 },
  pickerLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: C.textPrimary,
    marginBottom: SPACING.sm,
  },
  // Terracotta mandatory star — matches the add-debt modal's required indicator.
  requiredStar: {
    fontSize: TYPOGRAPHY.size.sm,
    color: '#C1694F',
    fontWeight: TYPOGRAPHY.weight.bold,
  },

  // Who-paid selector — chips across the split's participants
  payerChips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  payerChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: C.background,
  },
  payerChipActive: { backgroundColor: withAlpha(C.accent, 0.12) },
  payerChipText: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textSecondary, maxWidth: 140 },
  payerChipTextActive: { color: C.accent },

  // Save button (add-debt pill)
  saveBtn: {
    width: '100%',
    paddingVertical: SPACING.md + 2,
    borderRadius: RADIUS.full,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    marginTop: SPACING.lg,
  },
  saveBtnDisabled: { backgroundColor: withAlpha(C.textPrimary, C === CALM_DARK ? 0.12 : 0.08) },
  saveBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  saveBtnText: { fontSize: TYPOGRAPHY.size.base, fontWeight: TYPOGRAPHY.weight.semibold, color: C.surface, letterSpacing: 0.3 },
  saveBtnTextDisabled: { color: C.textMuted },
});

export default QuickSplitSheet;
