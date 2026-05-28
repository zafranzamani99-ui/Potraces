import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ModalToastHost from '../../components/common/ModalToastHost';
import { lightTap } from '../../services/haptics';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import WalletPicker from '../../components/common/WalletPicker';
import {
  pickStatementPdf,
  parseStatement,
  isParseError,
  ParsedTransaction,
} from '../../services/statementImport';
import { usePersonalStore } from '../../store/personalStore';
import { useWalletStore } from '../../store/walletStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useCategoryStore } from '../../store/categoryStore';

type ReviewRow = ParsedTransaction & {
  _id: string;
  _include: boolean;
  _category?: string;
};

const ImportFromStatement: React.FC = () => {
  const C = useCalm();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(C), [C]);
  const currency = useSettingsStore((s) => s.currency);
  const wallets = useWalletStore((s) => s.wallets);
  const defaultWallet = wallets.find((w) => w.isDefault) ?? wallets[0];
  const addTransaction = usePersonalStore((s) => s.addTransaction);
  const expenseCategories = useCategoryStore((s) => s.getExpenseCategories?.() ?? []);
  const incomeCategories = useCategoryStore((s) => s.getIncomeCategories?.() ?? []);

  const [step, setStep] = useState<'start' | 'parsing' | 'review' | 'importing'>('start');
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string | undefined>(defaultWallet?.id);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [categoryPicker, setCategoryPicker] = useState<{ rowId: string; type: 'income' | 'expense' } | null>(null);

  const handlePick = useCallback(async () => {
    lightTap();
    try {
      const picked = await pickStatementPdf();
      if (!picked) return;
      setStep('parsing');
      const res = await parseStatement(picked.base64, picked.filename);
      if (isParseError(res)) {
        setStep('start');
        Alert.alert('Could not parse', res.message ?? res.error);
        return;
      }
      if (res.transactions.length === 0) {
        setStep('start');
        Alert.alert('Nothing found', 'The AI could not extract any transactions from this PDF. Try a clearer statement or import via CSV.');
        return;
      }
      setRemaining(res.remaining);
      setRows(
        res.transactions.map((t, i) => ({
          ...t,
          _id: `imp-${Date.now()}-${i}`,
          _include: true,
          _category: t.suggested_category,
        })),
      );
      setStep('review');
    } catch (e: any) {
      setStep('start');
      Alert.alert('Error', e?.message ?? 'Could not read the PDF.');
    }
  }, []);

  const toggleRow = useCallback((id: string) => {
    setRows((prev) => prev.map((r) => (r._id === id ? { ...r, _include: !r._include } : r)));
  }, []);

  const selectAll = useCallback((value: boolean) => {
    setRows((prev) => prev.map((r) => ({ ...r, _include: value })));
  }, []);

  const selectedCount = useMemo(() => rows.filter((r) => r._include).length, [rows]);

  const handleImport = useCallback(() => {
    if (selectedCount === 0) return;
    if (!selectedWalletId) {
      Alert.alert('Pick a wallet', 'Choose which wallet these transactions belong to.');
      return;
    }
    Alert.alert(
      'Import transactions',
      `Add ${selectedCount} transactions to "${wallets.find((w) => w.id === selectedWalletId)?.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          onPress: () => {
            setStep('importing');
            try {
              for (const r of rows) {
                if (!r._include) continue;
                const date = new Date(r.date);
                if (isNaN(date.getTime())) continue;
                addTransaction({
                  amount: r.amount,
                  category: r._category ?? 'other',
                  description: r.description,
                  date,
                  type: r.type,
                  mode: 'personal',
                  inputMethod: 'statement-import' as any,
                  walletId: selectedWalletId,
                });
              }
              navigation.goBack();
            } catch (e: any) {
              setStep('review');
              Alert.alert('Import failed', e?.message ?? 'Some transactions did not import.');
            }
          },
        },
      ],
    );
  }, [rows, selectedWalletId, selectedCount, addTransaction, wallets, navigation]);

  const renderRow = useCallback(({ item }: { item: ReviewRow }) => {
    const bad = isNaN(new Date(item.date).getTime());
    return (
      <View style={[styles.row, !item._include && styles.rowDim]}>
        <TouchableOpacity
          onPress={() => toggleRow(item._id)}
          style={styles.checkbox}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item._include }}
          accessibilityLabel={`include ${item.description || 'transaction'}`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather
            name={item._include ? 'check-square' : 'square'}
            size={22}
            color={item._include ? C.accent : C.textSecondary}
          />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <View style={styles.rowTop}>
            <Text numberOfLines={1} style={styles.rowDesc}>{item.description || '(no description)'}</Text>
            <Text style={[styles.rowAmount, { color: item.type === 'income' ? C.positive : C.textPrimary }]}>
              {item.type === 'income' ? '+' : '−'}{currency} {item.amount.toFixed(2)}
            </Text>
          </View>
          <View style={styles.rowBottom}>
            <Text style={styles.rowMeta}>
              {bad ? 'bad date' : new Date(item.date).toLocaleDateString()}
            </Text>
            <TouchableOpacity
              onPress={() => setCategoryPicker({ rowId: item._id, type: item.type })}
              style={styles.categoryChip}
              accessibilityRole="button"
              accessibilityLabel={`change category, currently ${item._category ?? 'uncategorized'}`}
            >
              <Feather name="tag" size={12} color={C.textSecondary} />
              <Text style={styles.categoryChipText}>{item._category ?? 'uncategorized'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }, [styles, toggleRow, C, currency]);

  const pickCategory = useCallback((name: string) => {
    if (!categoryPicker) return;
    setRows((prev) => prev.map((r) => (r._id === categoryPicker.rowId ? { ...r, _category: name } : r)));
    setCategoryPicker(null);
  }, [categoryPicker]);

  const categoriesForPicker = useMemo(() => {
    if (!categoryPicker) return [];
    return categoryPicker.type === 'income' ? incomeCategories : expenseCategories;
  }, [categoryPicker, incomeCategories, expenseCategories]);

  // ─── RENDER ──────────────────────────────────────────────────────────────
  if (step === 'parsing' || step === 'importing') {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={C.accent} size="large" />
        <Text style={styles.loadingText}>
          {step === 'parsing' ? 'reading your statement…' : 'importing transactions…'}
        </Text>
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
          <Text style={styles.title}>import statement</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.startBody}>
          <View style={styles.heroIcon}>
            <Feather name="file-text" size={40} color={C.accent} />
          </View>
          <Text style={styles.heroTitle}>import from a bank statement</Text>
          <Text style={styles.heroDesc}>
            pick a pdf statement — we'll extract transactions and let you review before adding. works with most Malaysian banks.
          </Text>
          <View style={{ height: SPACING.lg }} />
          <Button title="pick pdf statement" onPress={handlePick} icon="upload" />
          <Text style={styles.fineprint}>
            5 imports free per month · your file is processed server-side and not stored
          </Text>
        </View>
      </View>
    );
  }

  // step === 'review'
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => { setStep('start'); setRows([]); }}
          accessibilityRole="button"
          accessibilityLabel="back to start"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="chevron-left" size={24} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>review {rows.length} rows</Text>
        <View style={{ width: 24 }} />
      </View>

      <Card style={styles.walletCard}>
        <WalletPicker
          wallets={wallets}
          selectedId={selectedWalletId ?? null}
          onSelect={(id) => { lightTap(); setSelectedWalletId(id); }}
          label="add to wallet"
        />

        <View style={styles.bulkActions}>
          <TouchableOpacity
            onPress={() => selectAll(true)}
            style={styles.bulkBtn}
            accessibilityRole="button"
            accessibilityLabel="select all rows"
          >
            <Text style={styles.bulkBtnText}>select all</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => selectAll(false)}
            style={styles.bulkBtn}
            accessibilityRole="button"
            accessibilityLabel="clear all selections"
          >
            <Text style={styles.bulkBtnText}>clear</Text>
          </TouchableOpacity>
          {remaining !== null && (
            <Text style={styles.remainingText}>{remaining} imports left this month</Text>
          )}
        </View>
      </Card>

      <FlatList
        data={rows}
        keyExtractor={(r) => r._id}
        renderItem={renderRow}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}
      />

      <View style={[styles.footer, { paddingBottom: SPACING.md + insets.bottom }]}>
        <Button
          title={`import ${selectedCount} transaction${selectedCount === 1 ? '' : 's'}`}
          onPress={handleImport}
          disabled={selectedCount === 0 || !selectedWalletId}
        />
      </View>

      {/* Category picker modal */}
      <Modal visible={!!categoryPicker} transparent animationType="fade" onRequestClose={() => setCategoryPicker(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCategoryPicker(null)}>
          <Pressable style={styles.pickerCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickerTitle}>choose a category</Text>
            {categoriesForPicker.map((c: any) => (
              <TouchableOpacity
                key={c.id}
                onPress={() => pickCategory(c.name)}
                style={styles.pickerItem}
                accessibilityRole="button"
                accessibilityLabel={`select category ${c.name}`}
              >
                <Feather name="tag" size={16} color={C.accent} />
                <Text style={styles.pickerItemText}>{c.name}</Text>
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
    width: 80, height: 80, borderRadius: RADIUS.full,
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
    lineHeight: TYPOGRAPHY.size.sm * 1.5,
  },
  fineprint: {
    textAlign: 'center',
    marginTop: SPACING.md,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
  },
  walletCard: { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, padding: SPACING.md },
  bulkActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  bulkBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: C.border,
  },
  bulkBtnText: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary },
  remainingText: { marginLeft: 'auto', fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary },
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
  checkbox: { padding: SPACING.xs },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  rowDesc: { flex: 1, fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary, fontWeight: TYPOGRAPHY.weight.medium },
  rowAmount: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.xs },
  rowMeta: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.accent, 0.08),
  },
  categoryChipText: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary },
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
    backgroundColor: withAlpha(C.dimBg, 0.5),
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

export default ImportFromStatement;
