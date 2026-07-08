import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '../common/BottomSheet';
import { NeuSurface } from '../common/neu';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { lightTap } from '../../services/haptics';
import { formatAmount } from '../../utils/formatters';
import { newId } from '../../utils/id';
import { roundMoney } from '../../utils/money';
import { computeEqualShares } from '../../utils/splitShares';
import { commitSplit } from '../../services/splitCommit';
import { useWalletStore } from '../../store/walletStore';
import { useAppStore } from '../../store/appStore';
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
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const wallets = useWalletStore((s) => s.wallets);

  const self: Contact = useMemo(() => ({ id: SELF_ID, name: t.quickSplit.me, isFromPhone: false }), [t.quickSplit.me]);
  const [others, setOthers] = useState<Contact[]>([]);
  const [payerId, setPayerId] = useState<string>(SELF_ID);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [description, setDescription] = useState('');

  const roundedTotal = roundMoney(total);
  const contacts = useMemo(() => [self, ...others], [self, others]);
  const shares = useMemo(
    () => computeEqualShares(roundedTotal, contacts, payerId),
    [roundedTotal, contacts, payerId]
  );
  // Show a representative (non-payer) share so the remainder assigned to the
  // payer doesn't make "each pays" look off.
  const each = shares.find((p) => p.contact.id !== payerId)?.amount ?? shares[0]?.amount ?? 0;
  const canSave = roundedTotal > 0 && others.length >= 1;

  const addPerson = () => {
    lightTap();
    setOthers((prev) => [
      ...prev,
      { id: newId(), name: `${t.quickSplit.person} ${prev.length + 1}`, isFromPhone: false },
    ]);
  };
  const renamePerson = (id: string, name: string) =>
    setOthers((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
  const removePerson = (id: string) => {
    setOthers((prev) => prev.filter((c) => c.id !== id));
    if (payerId === id) setPayerId(SELF_ID);
  };

  const save = () => {
    if (!canSave) return;
    lightTap();
    const payer = contacts.find((c) => c.id === payerId) ?? self;
    const participants = computeEqualShares(roundedTotal, contacts, payer.id);
    const splitId = commitSplit({
      description: description.trim() || t.quickSplit.title,
      totalAmount: roundedTotal,
      splitMethod: 'equal',
      participants,
      items: [],
      paidBy: payer,
      walletId: payer.id === SELF_ID ? walletId || undefined : undefined,
      mode: useAppStore.getState().mode,
    });
    onCreated?.(splitId);
    setOthers([]); setPayerId(SELF_ID); setWalletId(null); setDescription('');
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} header={<Text style={styles.title}>{t.quickSplit.title}</Text>}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Total */}
        <Text style={styles.label}>{t.quickSplit.total}</Text>
        <Text style={styles.total}>{formatAmount(roundedTotal)}</Text>

        {/* Description */}
        <Text style={styles.label}>{t.quickSplit.description}</Text>
        <TextInput
          style={styles.input}
          value={description}
          onChangeText={setDescription}
          placeholder={t.quickSplit.title}
          placeholderTextColor={C.textMuted}
        />

        {/* Who's in */}
        <Text style={styles.label}>{t.quickSplit.whosIn}</Text>
        <View style={styles.chipsWrap}>
          <View style={styles.meChip}><Text style={styles.meChipText}>{t.quickSplit.me}</Text></View>
          {others.map((p) => (
            <View key={p.id} style={styles.personChip}>
              <TextInput
                style={styles.personInput}
                value={p.name}
                onChangeText={(v) => renamePerson(p.id, v)}
              />
              <Pressable onPress={() => removePerson(p.id)} accessibilityLabel={`remove ${p.name}`} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={C.textMuted} />
              </Pressable>
            </View>
          ))}
          <Pressable style={styles.addChip} onPress={addPerson} accessibilityLabel={t.quickSplit.addPerson}>
            <Ionicons name="add" size={18} color={C.accent} />
            <Text style={styles.addChipText}>{t.quickSplit.addPerson}</Text>
          </Pressable>
        </View>

        {/* Who paid */}
        <Text style={styles.label}>{t.quickSplit.whoPaid}</Text>
        <View style={styles.chipsWrap}>
          {contacts.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => { lightTap(); setPayerId(c.id); }}
              accessibilityLabel={`${t.quickSplit.whoPaid} ${c.name}`}
            >
              <NeuSurface pressed={payerId === c.id} style={styles.payerChip}>
                <Text style={[styles.payerText, payerId === c.id && { color: C.accent }]}>{c.name}</Text>
              </NeuSurface>
            </Pressable>
          ))}
        </View>

        {/* Wallet (only when I paid) */}
        {payerId === SELF_ID && wallets.length > 0 && (
          <>
            <Text style={styles.label}>{t.quickSplit.wallet}</Text>
            <View style={styles.chipsWrap}>
              <Pressable onPress={() => { lightTap(); setWalletId(null); }}>
                <NeuSurface pressed={walletId === null} style={styles.payerChip}>
                  <Text style={styles.payerText}>{t.quickSplit.noWallet}</Text>
                </NeuSurface>
              </Pressable>
              {wallets.map((w) => (
                <Pressable key={w.id} onPress={() => { lightTap(); setWalletId(w.id); }}>
                  <NeuSurface pressed={walletId === w.id} style={styles.payerChip}>
                    <Text style={[styles.payerText, walletId === w.id && { color: C.accent }]}>{w.name}</Text>
                  </NeuSurface>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* Preview + Save */}
        <View style={styles.previewRow}>
          <Text style={styles.previewLabel}>{t.quickSplit.eachPays}</Text>
          <Text style={styles.previewValue}>{formatAmount(each)}</Text>
        </View>
        <Pressable
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={save}
          disabled={!canSave}
          accessibilityLabel={t.quickSplit.save}
        >
          <Text style={styles.saveText}>{canSave ? t.quickSplit.save : t.quickSplit.needTwo}</Text>
        </Pressable>
      </ScrollView>
    </BottomSheet>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  title: { fontSize: 18, fontWeight: '600', color: C.textPrimary, paddingHorizontal: 20, paddingTop: 8 },
  body: { padding: 20, gap: 8 },
  label: { fontSize: 12, fontWeight: '600', color: C.textMuted, marginTop: 12 },
  total: { fontSize: 34, fontWeight: '200', color: C.textPrimary, fontVariant: ['tabular-nums'] },
  input: {
    borderWidth: 1, borderColor: C.inputBorder, borderRadius: 12, paddingHorizontal: 12,
    paddingVertical: 10, color: C.textPrimary, fontSize: 15,
  },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  meChip: { backgroundColor: C.accent, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
  meChipText: { color: C.onAccent, fontWeight: '600', fontSize: 13 },
  personChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.pillBg,
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6,
  },
  personInput: { color: C.textPrimary, fontSize: 13, minWidth: 60, paddingVertical: 2 },
  addChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: C.accent,
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6,
  },
  addChipText: { color: C.accent, fontWeight: '600', fontSize: 13 },
  payerChip: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  payerText: { color: C.textPrimary, fontSize: 13, fontWeight: '500' },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 },
  previewLabel: { fontSize: 14, color: C.textSecondary },
  previewValue: { fontSize: 20, fontWeight: '600', color: C.textPrimary, fontVariant: ['tabular-nums'] },
  saveBtn: {
    marginTop: 16, backgroundColor: C.accent, borderRadius: 16, paddingVertical: 15,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveText: { color: C.onAccent, fontWeight: '700', fontSize: 15 },
});

export default QuickSplitSheet;
