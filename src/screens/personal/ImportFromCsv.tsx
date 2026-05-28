import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ModalToastHost from '../../components/common/ModalToastHost';
import { lightTap } from '../../services/haptics';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import WalletPicker from '../../components/common/WalletPicker';
import {
  pickCsv,
  parseDateCell,
  parseAmountCell,
  CsvParseResult,
} from '../../services/csvImport';
import { usePersonalStore } from '../../store/personalStore';
import { useWalletStore } from '../../store/walletStore';
import { useSettingsStore } from '../../store/settingsStore';

type ColumnRole = 'ignore' | 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'type' | 'category';

// Role labels are now derived from translations inside the component via getRoleLabels().

const ROLE_ORDER: ColumnRole[] = ['ignore', 'date', 'description', 'amount', 'debit', 'credit', 'type', 'category'];

/** Guess a reasonable role for a header. */
function guessRole(header: string): ColumnRole {
  const h = header.toLowerCase().trim();
  if (/date|tarikh|txn\s*date/.test(h)) return 'date';
  if (/description|desc|detail|particular|keterangan|narrative|memo/.test(h)) return 'description';
  if (/^debit$|withdraw|out|keluar|spent|dr\.?$/.test(h)) return 'debit';
  if (/^credit$|deposit|in$|masuk|cr\.?$/.test(h)) return 'credit';
  if (/amount|amt|jumlah|value/.test(h)) return 'amount';
  if (/type|kind|jenis/.test(h)) return 'type';
  if (/category|cat\.|kategori/.test(h)) return 'category';
  return 'ignore';
}

const ImportFromCsv: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(C), [C]);
  const currency = useSettingsStore((s) => s.currency);

  const ROLE_LABELS: Record<ColumnRole, string> = useMemo(() => ({
    ignore: t.importCsv.roleIgnore,
    date: t.importCsv.roleDate,
    description: t.importCsv.roleDescription,
    amount: t.importCsv.roleAmount,
    debit: t.importCsv.roleDebit,
    credit: t.importCsv.roleCredit,
    type: t.importCsv.roleType,
    category: t.importCsv.roleCategory,
  }), [t]);
  const wallets = useWalletStore((s) => s.wallets);
  const defaultWallet = wallets.find((w) => w.isDefault) ?? wallets[0];
  const addTransaction = usePersonalStore((s) => s.addTransaction);

  const [step, setStep] = useState<'start' | 'map' | 'importing'>('start');
  const [csv, setCsv] = useState<CsvParseResult | null>(null);
  const [mapping, setMapping] = useState<ColumnRole[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string | undefined>(defaultWallet?.id);
  const [rolePicker, setRolePicker] = useState<number | null>(null);
  const [skipRows, setSkipRows] = useState<Set<number>>(new Set());

  const handlePick = useCallback(async () => {
    lightTap();
    try {
      const result = await pickCsv();
      if (!result) return;
      if (result.rows.length === 0) {
        Alert.alert(t.importCsv.emptyCsv, t.importCsv.noDataRows);
        return;
      }
      setCsv(result);
      setMapping(result.headers.map(guessRole));
      setSkipRows(new Set());
      setStep('map');
    } catch (e: any) {
      Alert.alert(t.importCsv.errorTitle, e?.message ?? t.importCsv.couldNotRead);
    }
  }, []);

  /** Build preview Transaction rows from current mapping. Also flags which
   *  source rows are "bad" (missing date/amount) so user sees up front. */
  const preview = useMemo(() => {
    if (!csv) return [];
    const dateIdx = mapping.indexOf('date');
    const descIdx = mapping.indexOf('description');
    const amountIdx = mapping.indexOf('amount');
    const debitIdx = mapping.indexOf('debit');
    const creditIdx = mapping.indexOf('credit');
    const typeIdx = mapping.indexOf('type');
    const categoryIdx = mapping.indexOf('category');

    return csv.rows.map((row, rowIndex) => {
      const date = dateIdx >= 0 ? parseDateCell(row[dateIdx] ?? '') : null;
      const description = descIdx >= 0 ? (row[descIdx] ?? '').trim() : '';
      const category = categoryIdx >= 0 ? (row[categoryIdx] ?? '').trim() : '';

      let amount: number | null = null;
      let type: 'income' | 'expense' = 'expense';

      if (debitIdx >= 0 || creditIdx >= 0) {
        const debit = debitIdx >= 0 ? parseAmountCell(row[debitIdx] ?? '') : null;
        const credit = creditIdx >= 0 ? parseAmountCell(row[creditIdx] ?? '') : null;
        if (credit && credit.amount > 0) { amount = credit.amount; type = 'income'; }
        else if (debit && debit.amount > 0) { amount = debit.amount; type = 'expense'; }
      } else if (amountIdx >= 0) {
        const a = parseAmountCell(row[amountIdx] ?? '');
        if (a) {
          amount = a.amount;
          type = a.isNegative ? 'expense' : 'income';
        }
      }

      // Explicit type column overrides the inferred type
      if (typeIdx >= 0) {
        const t = (row[typeIdx] ?? '').toLowerCase().trim();
        if (/(income|credit|in|masuk|deposit)/.test(t)) type = 'income';
        else if (/(expense|debit|out|keluar|withdraw)/.test(t)) type = 'expense';
      }

      const valid = !!date && amount != null && amount > 0;
      return { rowIndex, date, description, amount, type, category, valid };
    });
  }, [csv, mapping]);

  const importableCount = useMemo(
    () => preview.filter((p) => p.valid && !skipRows.has(p.rowIndex)).length,
    [preview, skipRows],
  );

  const badCount = useMemo(() => preview.filter((p) => !p.valid).length, [preview]);

  const updateColumnRole = useCallback((colIdx: number, role: ColumnRole) => {
    setMapping((prev) => {
      const next = [...prev];
      next[colIdx] = role;
      // Enforce single-assignment for date/description/amount/debit/credit/type/category
      if (role !== 'ignore') {
        for (let j = 0; j < next.length; j++) {
          if (j !== colIdx && next[j] === role) next[j] = 'ignore';
        }
      }
      return next;
    });
  }, []);

  const toggleSkip = useCallback((rowIndex: number) => {
    setSkipRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowIndex)) next.delete(rowIndex);
      else next.add(rowIndex);
      return next;
    });
  }, []);

  const handleImport = useCallback(() => {
    if (!selectedWalletId) {
      Alert.alert(t.importCsv.pickWallet, t.importCsv.pickWalletMsg);
      return;
    }
    if (importableCount === 0) {
      Alert.alert(t.importCsv.nothingToImport, t.importCsv.nothingToImportMsg);
      return;
    }
    Alert.alert(
      t.importCsv.importTransactions,
      t.importCsv.importConfirmMsg.replace('{n}', String(importableCount)).replace('{wallet}', wallets.find((w) => w.id === selectedWalletId)?.name ?? ''),
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.importCsv.importBtn,
          onPress: () => {
            setStep('importing');
            try {
              for (const p of preview) {
                if (!p.valid || skipRows.has(p.rowIndex)) continue;
                addTransaction({
                  amount: p.amount!,
                  category: p.category || 'other',
                  description: p.description || t.importCsv.imported,
                  date: p.date!,
                  type: p.type,
                  mode: 'personal',
                  inputMethod: 'csv-import' as any,
                  walletId: selectedWalletId,
                });
              }
              navigation.goBack();
            } catch (e: any) {
              setStep('map');
              Alert.alert(t.importCsv.importFailed, e?.message ?? t.importCsv.importFailedMsg);
            }
          },
        },
      ],
    );
  }, [preview, importableCount, skipRows, selectedWalletId, wallets, addTransaction, navigation]);

  const renderPreviewRow = useCallback(({ item }: { item: typeof preview[0] }) => {
    const skipped = skipRows.has(item.rowIndex);
    return (
      <View style={[styles.row, !item.valid && styles.rowInvalid, skipped && styles.rowDim]}>
        <TouchableOpacity
          onPress={() => item.valid && toggleSkip(item.rowIndex)}
          style={styles.checkbox}
          disabled={!item.valid}
        >
          <Feather
            name={!item.valid ? 'alert-circle' : skipped ? 'square' : 'check-square'}
            size={20}
            color={!item.valid ? C.bronze ?? C.accent : skipped ? C.textSecondary : C.accent}
          />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={styles.rowTop}>
            <Text numberOfLines={1} style={styles.rowDesc}>{item.description || t.importCsv.noDescription}</Text>
            {item.amount != null && (
              <Text style={[styles.rowAmount, { color: item.type === 'income' ? C.positive : C.textPrimary }]}>
                {item.type === 'income' ? '+' : '−'}{currency} {item.amount.toFixed(2)}
              </Text>
            )}
          </View>
          <Text style={styles.rowMeta}>
            {item.date ? item.date.toLocaleDateString() : t.importCsv.badDate}
            {item.category ? ` · ${item.category}` : ''}
          </Text>
        </View>
      </View>
    );
  }, [skipRows, styles, toggleSkip, C, currency]);

  // ─── RENDER ──────────────────────────────────────────────────────────────
  if (step === 'importing') {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.accent} size="large" />
        <Text style={styles.loadingText}>{t.importCsv.importingTransactions}</Text>
      </View>
    );
  }

  if (step === 'start') {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="back"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="chevron-left" size={24} color={C.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.title}>{t.importCsv.title}</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.startBody}>
          <View style={styles.heroIcon}>
            <Feather name="file-plus" size={40} color={C.accent} />
          </View>
          <Text style={styles.heroTitle}>{t.importCsv.heroTitle}</Text>
          <Text style={styles.heroDesc}>
            {t.importCsv.heroDesc}
          </Text>
          <View style={{ height: SPACING.lg }} />
          <Button title={t.importCsv.pickCsvFile} onPress={handlePick} icon="upload" />
        </View>
      </View>
    );
  }

  // step === 'map'
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => { setStep('start'); setCsv(null); }}
          accessibilityRole="button"
          accessibilityLabel="back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="chevron-left" size={24} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{t.importCsv.mapColumnsTitle.replace('{n}', String(csv?.rows.length ?? 0))}</Text>
        <View style={{ width: 24 }} />
      </View>

      <Card style={styles.walletCard}>
        <Text style={styles.walletLabel}>{t.importCsv.columnMapping}</Text>
        <FlatList
          horizontal
          data={csv?.headers ?? []}
          keyExtractor={(_, i) => `col-${i}`}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: SPACING.sm, paddingVertical: SPACING.xs }}
          renderItem={({ item, index }) => (
            <TouchableOpacity
              onPress={() => setRolePicker(index)}
              style={styles.colChip}
              accessibilityRole="button"
              accessibilityLabel={`${item} column, currently ${ROLE_LABELS[mapping[index] ?? 'ignore']}`}
            >
              <Text style={styles.colChipHeader} numberOfLines={1}>{item}</Text>
              <Text style={styles.colChipRole}>{ROLE_LABELS[mapping[index] ?? 'ignore']}</Text>
            </TouchableOpacity>
          )}
        />
        <View style={styles.walletPickerWrap}>
          <WalletPicker
            wallets={wallets}
            selectedId={selectedWalletId ?? null}
            onSelect={setSelectedWalletId}
            label={t.importCsv.wallet}
          />
        </View>
        {badCount > 0 && (
          <Text style={styles.warnText}>{t.importCsv.rowsCantImport.replace('{n}', String(badCount))}</Text>
        )}
      </Card>

      <FlatList
        data={preview}
        keyExtractor={(p) => `row-${p.rowIndex}`}
        renderItem={renderPreviewRow}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
      />

      <View style={[styles.footer, { paddingBottom: SPACING.md + insets.bottom }]}>
        <Button
          title={importableCount === 1 ? t.importCsv.importNTransactions.replace('{n}', '1') : t.importCsv.importNTransactionsPlural.replace('{n}', String(importableCount))}
          onPress={handleImport}
          disabled={importableCount === 0 || !selectedWalletId}
        />
      </View>

      <Modal visible={rolePicker !== null} transparent animationType="fade" onRequestClose={() => setRolePicker(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setRolePicker(null)}>
          <Pressable style={styles.pickerCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickerTitle}>
              {t.importCsv.whatIsColumn.replace('{name}', rolePicker !== null ? csv?.headers[rolePicker] ?? '' : '')}
            </Text>
            {ROLE_ORDER.map((role) => (
              <TouchableOpacity
                key={role}
                onPress={() => {
                  if (rolePicker !== null) updateColumnRole(rolePicker, role);
                  setRolePicker(null);
                }}
                style={styles.pickerItem}
                accessibilityRole="button"
                accessibilityLabel={ROLE_LABELS[role]}
              >
                <Text style={styles.pickerItemText}>{ROLE_LABELS[role]}</Text>
                {rolePicker !== null && mapping[rolePicker] === role && (
                  <Feather name="check" size={16} color={C.positive} />
                )}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
        <ModalToastHost />
      </Modal>
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  centered: { flex: 1, backgroundColor: C.background, alignItems: 'center', justifyContent: 'center' },
  loadingText: { marginTop: SPACING.lg, color: C.textSecondary, fontSize: TYPOGRAPHY.size.sm },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  title: { fontSize: TYPOGRAPHY.size.lg, fontWeight: TYPOGRAPHY.weight.semibold, color: C.textPrimary },
  startBody: { flex: 1, paddingHorizontal: SPACING.lg, justifyContent: 'center', alignItems: 'center' },
  heroIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: withAlpha(C.accent, 0.1),
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  heroTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    textAlign: 'center',
    marginBottom: SPACING.sm,
  },
  heroDesc: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  walletCard: { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, padding: SPACING.md },
  walletLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    textTransform: 'uppercase',
    marginBottom: SPACING.xs,
  },
  walletPickerWrap: {
    marginTop: SPACING.md,
  },
  colChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    minWidth: 100,
  },
  colChipHeader: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  colChipRole: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.semibold,
    marginTop: 2,
  },
  warnText: {
    marginTop: SPACING.sm,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  rowDim: { opacity: 0.4 },
  rowInvalid: { opacity: 0.6 },
  checkbox: { padding: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  rowDesc: { flex: 1, fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary, fontWeight: TYPOGRAPHY.weight.medium },
  rowAmount: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold },
  rowMeta: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary, marginTop: 4 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    backgroundColor: C.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: withAlpha(C.dimBg, 0.4),
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  pickerCard: {
    width: '90%',
    maxHeight: '70%',
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    ...SHADOWS.lg,
  },
  pickerTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: SPACING.md,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  pickerItemText: { flex: 1, fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary },
});

export default ImportFromCsv;
