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
  TextInput,
} from 'react-native';
import { KeyboardAvoidingView as KAView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ModalToastHost from '../../components/common/ModalToastHost';
import { lightTap } from '../../services/haptics';
import { markNewImportRows } from '../../utils/importDedup';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';
import WalletPicker from '../../components/common/WalletPicker';
import {
  pickStatementPdf,
  parseStatement,
  isParseError,
  ParsedTransaction,
  StatementParseResult,
  StatementParseError,
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
  const t = useT();
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
  const [passwordPrompt, setPasswordPrompt] = useState<{ base64: string; filename: string } | null>(null);
  const [passwordValue, setPasswordValue] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  // Inline error/empty state on the start screen (replaces Alert popups for the
  // parse phase — the pick button doubles as retry). See EmptyState.
  const [notice, setNotice] = useState<{ icon: string; title: string; message: string } | null>(null);

  // Apply a (successful or terminal-error) parse result to the screen.
  const finishParse = useCallback((res: StatementParseResult | StatementParseError) => {
    if (isParseError(res)) {
      setStep('start');
      setNotice({ icon: 'alert-triangle', title: t.importStatement.couldNotParse, message: res.message ?? res.error });
      return;
    }
    if (res.transactions.length === 0) {
      setStep('start');
      setNotice({ icon: 'inbox', title: t.importStatement.nothingFound, message: t.importStatement.nothingFoundMsg });
      return;
    }
    setNotice(null);
    setRemaining(res.remaining);
    // Own-account transfers were dropped server-side (double-count guard) —
    // tell the user so the "missing" rows aren't a mystery.
    if (res.transfersSkipped) {
      Alert.alert(
        t.importStatement.transfersSkippedTitle,
        t.importStatement.transfersSkippedMsg.replace('{n}', String(res.transfersSkipped)),
      );
    }
    setRows(
      res.transactions.map((tx, i) => ({
        ...tx,
        _id: `imp-${Date.now()}-${i}`,
        _include: true,
        // Store a category ID (what budgets/Echo match on), never a display NAME —
        // the AI may return either, so resolve it. Unknown → 'other' (a valid id),
        // so an imported txn can never carry an unmatchable name.
        _category: (() => {
          const s = (tx.suggested_category || '').toLowerCase().trim();
          const hit = [...expenseCategories, ...incomeCategories].find(
            (c: any) => String(c.id).toLowerCase() === s || String(c.name).toLowerCase() === s,
          );
          return hit ? hit.id : 'other';
        })(),
      })),
    );
    setStep('review');
  }, [t, expenseCategories, incomeCategories]);

  const handlePick = useCallback(async () => {
    lightTap();
    setNotice(null);
    try {
      const picked = await pickStatementPdf();
      if (!picked) return;
      setStep('parsing');
      const res = await parseStatement(picked.base64, picked.filename);
      // Locked statement (e.g. Maybank/CIMB IC-protected) — ask for the password.
      if (isParseError(res) && res.error === 'password_required') {
        setStep('start');
        setPasswordValue('');
        setPasswordError(false);
        setPasswordPrompt({ base64: picked.base64, filename: picked.filename });
        return;
      }
      finishParse(res);
    } catch (e: any) {
      setStep('start');
      setNotice({ icon: 'alert-triangle', title: t.importStatement.errorTitle, message: e?.message ?? t.importStatement.couldNotRead });
    }
  }, [finishParse, t]);

  const handleUnlock = useCallback(async () => {
    if (!passwordPrompt || !passwordValue.trim() || unlocking) return;
    lightTap();
    setUnlocking(true);
    setPasswordError(false);
    try {
      const res = await parseStatement(passwordPrompt.base64, passwordPrompt.filename, passwordValue);
      if (isParseError(res) && res.error === 'password_wrong') {
        setPasswordError(true);
        setUnlocking(false);
        return;
      }
      // Unlocked (or a different terminal error) — close the sheet and continue.
      setPasswordPrompt(null);
      setPasswordValue('');
      setUnlocking(false);
      finishParse(res);
    } catch (e: any) {
      setUnlocking(false);
      setPasswordError(true);
    }
  }, [passwordPrompt, passwordValue, unlocking, finishParse]);

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
      Alert.alert(t.importStatement.pickWallet, t.importStatement.pickWalletMsg);
      return;
    }
    Alert.alert(
      t.importStatement.importTransactions,
      t.importStatement.importConfirmMsg.replace('{n}', String(selectedCount)).replace('{wallet}', wallets.find((w) => w.id === selectedWalletId)?.name ?? ''),
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.importStatement.importBtn,
          onPress: () => {
            setStep('importing');
            try {
              // Skip rows already present in this wallet so a re-import can't double-book.
              const existing = usePersonalStore.getState().transactions;
              const included = rows
                .filter((r) => r._include)
                .map((r) => ({ r, date: new Date(r.date) }))
                .filter((x) => !isNaN(x.date.getTime()));
              const isNew = markNewImportRows(existing, included.map((x) => ({
                amount: x.r.amount,
                type: x.r.type,
                date: x.date,
                description: x.r.description,
                walletId: selectedWalletId,
              })));
              // Move the LIVE wallet balance too (reconcile replays these txns, so the net
              // is applied once) — otherwise the wallet stays wrong, permanently so with
              // sync off.
              let netDelta = 0; // + income (add), − expense (deduct)
              let imported = 0;
              included.forEach((x, i) => {
                if (!isNew[i]) return; // duplicate already in this wallet
                addTransaction({
                  amount: x.r.amount,
                  category: x.r._category ?? 'other',
                  description: x.r.description,
                  date: x.date,
                  type: x.r.type,
                  mode: 'personal',
                  inputMethod: 'statement-import' as any,
                  walletId: selectedWalletId,
                });
                netDelta += x.r.type === 'income' ? x.r.amount : -x.r.amount;
                imported++;
              });
              const skipped = included.length - imported;
              const walletName = wallets.find((w) => w.id === selectedWalletId)?.name ?? '';
              if (imported === 0) {
                setStep('review');
                Alert.alert(t.common.importAllDuplicates, t.common.importAllDuplicatesMsg.replace('{n}', String(skipped)).replace('{wallet}', walletName));
                return;
              }
              if (selectedWalletId) {
                if (netDelta > 0) useWalletStore.getState().addToWallet(selectedWalletId, netDelta);
                else if (netDelta < 0) useWalletStore.getState().deductFromWallet(selectedWalletId, -netDelta);
              }
              navigation.goBack();
              if (skipped > 0) {
                Alert.alert(t.common.importedTitle, t.common.importedWithSkipsMsg.replace('{imported}', String(imported)).replace('{skipped}', String(skipped)));
              }
            } catch (e: any) {
              setStep('review');
              Alert.alert(t.importStatement.importFailed, e?.message ?? t.importStatement.importFailedMsg);
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
            <Text numberOfLines={1} style={styles.rowDesc}>{item.description || t.importStatement.noDescription}</Text>
            <Text style={[styles.rowAmount, { color: item.type === 'income' ? C.positive : C.textPrimary }]}>
              {item.type === 'income' ? '+' : '−'}{currency} {item.amount.toFixed(2)}
            </Text>
          </View>
          <View style={styles.rowBottom}>
            <Text style={styles.rowMeta}>
              {bad ? t.importStatement.badDate : new Date(item.date).toLocaleDateString()}
            </Text>
            <TouchableOpacity
              onPress={() => setCategoryPicker({ rowId: item._id, type: item.type })}
              style={styles.categoryChip}
              accessibilityRole="button"
              accessibilityLabel={`change category, currently ${item._category ?? 'uncategorized'}`}
            >
              <Feather name="tag" size={12} color={C.textSecondary} />
              <Text style={styles.categoryChipText}>{item._category ?? t.importStatement.uncategorized}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }, [styles, toggleRow, C, currency]);

  const pickCategory = useCallback((id: string) => {
    if (!categoryPicker) return;
    setRows((prev) => prev.map((r) => (r._id === categoryPicker.rowId ? { ...r, _category: id } : r)));
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
          {step === 'parsing' ? t.importStatement.readingStatement : t.importStatement.importingTransactions}
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
          <Text style={styles.title}>{t.importStatement.title}</Text>
          <View style={{ width: 24 }} />
        </View>
        {notice ? (
          <EmptyState
            icon={notice.icon}
            title={notice.title}
            message={notice.message}
            actionLabel={t.importStatement.pickPdf}
            onAction={handlePick}
          />
        ) : (
          <View style={styles.startBody}>
            <View style={styles.heroIcon}>
              <Feather name="file-text" size={40} color={C.accent} />
            </View>
            <Text style={styles.heroTitle}>{t.importStatement.heroTitle}</Text>
            <Text style={styles.heroDesc}>
              {t.importStatement.heroDesc}
            </Text>
            <View style={{ height: SPACING.lg }} />
            <Button title={t.importStatement.pickPdf} onPress={handlePick} icon="upload" />
            <Text style={styles.fineprint}>
              {t.importStatement.freeImports}
            </Text>
          </View>
        )}

        {/* Password sheet — shown only when the statement PDF is locked */}
        <Modal
          visible={!!passwordPrompt}
          transparent
          statusBarTranslucent
          animationType="fade"
          onRequestClose={() => { if (!unlocking) { setPasswordPrompt(null); setPasswordValue(''); } }}
        >
          {/* KAView from react-native-keyboard-controller, behavior="padding" on BOTH
              platforms. RN's built-in KAV with behavior=undefined is inert, and inside an
              Android transparent Modal it wouldn't work anyway (docs/BUILDING_CHECKLIST.md)
              — this build is edge-to-edge so adjustResize never fires either. */}
          <KAView style={{ flex: 1 }} behavior="padding">
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => { if (!unlocking) { setPasswordPrompt(null); setPasswordValue(''); } }}
            >
              <Pressable style={styles.pickerCard} onPress={(e) => e.stopPropagation()}>
                <View style={styles.lockIconWrap}>
                  <Feather name="lock" size={22} color={C.accent} />
                </View>
                <Text style={[styles.pickerTitle, styles.lockedTitle]}>{t.importStatement.lockedTitle}</Text>
                <Text style={styles.lockedDesc}>{t.importStatement.lockedDesc}</Text>
                <TextInput
                  style={[styles.passwordInput, passwordError && styles.passwordInputError]}
                  value={passwordValue}
                  onChangeText={(v) => { setPasswordValue(v); if (passwordError) setPasswordError(false); }}
                  placeholder={t.importStatement.passwordPlaceholder}
                  placeholderTextColor={C.textSecondary}
                  secureTextEntry
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                  selectionColor={withAlpha(C.accent, 0.25)}
                  editable={!unlocking}
                  returnKeyType="go"
                  onSubmitEditing={handleUnlock}
                  accessibilityLabel="statement password"
                />
                {passwordError && (
                  <Text style={styles.passwordErrorText}>{t.importStatement.wrongPassword}</Text>
                )}
                <View style={{ height: SPACING.md }} />
                <Button
                  title={unlocking ? t.importStatement.unlocking : t.importStatement.unlockBtn}
                  onPress={handleUnlock}
                  disabled={unlocking || !passwordValue.trim()}
                />
              </Pressable>
            </Pressable>
          </KAView>
          <ModalToastHost />
        </Modal>
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
        <Text style={styles.title}>{t.importStatement.reviewTitle.replace('{n}', String(rows.length))}</Text>
        <View style={{ width: 24 }} />
      </View>

      <Card style={styles.walletCard}>
        <WalletPicker
          wallets={wallets}
          selectedId={selectedWalletId ?? null}
          onSelect={(id) => { lightTap(); setSelectedWalletId(id); }}
          label={t.importStatement.addToWallet}
        />

        <View style={styles.bulkActions}>
          <TouchableOpacity
            onPress={() => selectAll(true)}
            style={styles.bulkBtn}
            accessibilityRole="button"
            accessibilityLabel="select all rows"
          >
            <Text style={styles.bulkBtnText}>{t.importStatement.selectAll}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => selectAll(false)}
            style={styles.bulkBtn}
            accessibilityRole="button"
            accessibilityLabel={t.importStatement.clear}
          >
            <Text style={styles.bulkBtnText}>{t.importStatement.clear}</Text>
          </TouchableOpacity>
          {remaining !== null && (
            <Text style={styles.remainingText}>{t.importStatement.importsLeft.replace('{n}', String(remaining))}</Text>
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
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom, maxWidth: 680, width: '100%', alignSelf: 'center' }}
      />

      <View style={[styles.footer, { paddingBottom: SPACING.md + insets.bottom }]}>
        <Button
          title={selectedCount === 1 ? t.importStatement.importNTransactions.replace('{n}', '1') : t.importStatement.importNTransactionsPlural.replace('{n}', String(selectedCount))}
          onPress={handleImport}
          disabled={selectedCount === 0 || !selectedWalletId}
        />
      </View>

      {/* Category picker modal */}
      <Modal visible={!!categoryPicker} transparent animationType="fade" onRequestClose={() => setCategoryPicker(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCategoryPicker(null)}>
          <Pressable style={styles.pickerCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickerTitle}>{t.importStatement.chooseCategory}</Text>
            {categoriesForPicker.map((c: any) => (
              <TouchableOpacity
                key={c.id}
                onPress={() => pickCategory(c.id)}
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
    maxWidth: 420,
    maxHeight: '70%',
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: C.border,
    ...SHADOWS.lg,
  },
  lockIconWrap: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.accent, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  lockedTitle: { textAlign: 'center', marginBottom: SPACING.xs },
  lockedDesc: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: TYPOGRAPHY.size.sm * 1.5,
    marginBottom: SPACING.lg,
  },
  passwordInput: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    backgroundColor: C.background,
  },
  passwordInputError: { borderColor: C.gold },
  passwordErrorText: {
    marginTop: SPACING.xs,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.gold,
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
