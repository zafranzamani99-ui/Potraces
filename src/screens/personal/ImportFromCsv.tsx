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
import { matchTransactions, MatchResult } from '../../utils/transactionMatcher';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import WalletPicker from '../../components/common/WalletPicker';
import {
  pickCsv,
  parseDateCell,
  parseAmountCell,
  cleanupCsvFile,
  CsvParseResult,
} from '../../services/csvImport';
import { usePersonalStore } from '../../store/personalStore';
import { useWalletStore } from '../../store/walletStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useImportBatchStore } from '../../store/importBatchStore';
import { useToast } from '../../context/ToastContext';

type ColumnRole = 'ignore' | 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'type' | 'category';

// Role labels are now derived from translations inside the component via getRoleLabels().

const ROLE_ORDER: ColumnRole[] = ['ignore', 'date', 'description', 'amount', 'debit', 'credit', 'type', 'category'];

/** A mapped CSV row in the preview. Invalid rows (no date/amount) never match or import. */
type CsvPreviewRow = {
  rowIndex: number;
  date: Date | null;
  description: string;
  amount: number | null;
  type: 'income' | 'expense';
  category: string;
  valid: boolean;
};

// Single FlatList data array: section-header pseudo-items interleaved with rows.
type ListItem =
  | { kind: 'header'; id: string; title: string; collapsible?: boolean; open?: boolean }
  | { kind: 'row'; row: CsvPreviewRow };

const keyForItem = (item: ListItem) => (item.kind === 'header' ? item.id : `row-${item.row.rowIndex}`);

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

// Reconcile horizon compares on the LOCAL calendar day (logged rows carry time;
// CSV dates are day-level) — the same local y/m/d extraction importDedup's
// dayKey uses. YYYY-MM-DD keys compare chronologically as strings.
const localDayKey = (d: Date | string): string | null => {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
};

const isOnOrBeforeDay = (d: Date | string | null, horizon: string | undefined): boolean => {
  if (!horizon || d === null) return false;
  const k = localDayKey(d);
  return k !== null && k <= horizon;
};

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
  const transactions = usePersonalStore((s) => s.transactions);
  const expenseCategories = useCategoryStore((s) => s.getExpenseCategories?.() ?? []);
  const incomeCategories = useCategoryStore((s) => s.getIncomeCategories?.() ?? []);
  const { showToast } = useToast();

  const [step, setStep] = useState<'start' | 'map' | 'importing'>('start');
  const [csv, setCsv] = useState<CsvParseResult | null>(null);
  const [mapping, setMapping] = useState<ColumnRole[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string | undefined>(defaultWallet?.id);
  const [rolePicker, setRolePicker] = useState<number | null>(null);
  const [showLogged, setShowLogged] = useState(false);

  const handlePick = useCallback(async () => {
    lightTap();
    try {
      const result = await pickCsv();
      if (!result) return;
      // The whole file is parsed into memory by pickCsv — drop the cache copy now.
      void cleanupCsvFile(result.uri);
      if (result.rows.length === 0) {
        Alert.alert(t.importCsv.emptyCsv, t.importCsv.noDataRows);
        return;
      }
      setCsv(result);
      setMapping(result.headers.map(guessRole));
      setShowLogged(false);
      setStep('map');
    } catch (e: any) {
      Alert.alert(t.importCsv.errorTitle, e?.message ?? t.importCsv.couldNotRead);
    }
  }, []);

  /** Build preview Transaction rows from current mapping. Also flags which
   *  source rows are "bad" (missing date/amount) so user sees up front. */
  const preview = useMemo<CsvPreviewRow[]>(() => {
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
      // Store a category ID (what budgets/Echo match on), never the raw CSV
      // NAME — the cell may carry either, so resolve it. Unknown → 'other' (a
      // valid id), so an imported txn can never carry an unmatchable name.
      // Mirrors ImportFromStatement's resolver. No category cell → '' (import
      // falls back to 'other' there, and the preview meta stays blank).
      const rawCategory = categoryIdx >= 0 ? (row[categoryIdx] ?? '').trim().toLowerCase() : '';
      const category = rawCategory
        ? ([...expenseCategories, ...incomeCategories].find(
            (c: any) => String(c.id).toLowerCase() === rawCategory || String(c.name).toLowerCase() === rawCategory,
          )?.id ?? 'other')
        : '';

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
        // Word boundaries so 'CR'/'DR' match but 'Insurance' doesn't flip via 'in'.
        if (/\b(income|credit|cr|in|masuk|deposit)\b/.test(t)) type = 'income';
        else if (/\b(expense|debit|dr|out|keluar|withdraw)\b/.test(t)) type = 'expense';
      }

      const valid = !!date && amount != null && amount > 0;
      return { rowIndex, date, description, amount, type, category, valid };
    });
  }, [csv, mapping, expenseCategories, incomeCategories]);

  // Reconcile horizon (design §10 Phase 3) of the currently-selected wallet.
  const reconciledUntil = useMemo(
    () => wallets.find((w) => w.id === selectedWalletId)?.reconciledUntil,
    [wallets, selectedWalletId],
  );
  const frozenCount = useMemo(
    () => preview.filter((p) => p.valid && isOnOrBeforeDay(p.date, reconciledUntil)).length,
    [preview, reconciledUntil],
  );

  // Reconcile VALID preview rows against what's already logged (design §3 engine).
  // Invalid rows never match. Re-runs on mapping or wallet change.
  //
  // Reconcile horizon (design §10 Phase 3): a wallet "reconciled up to D" has its
  // period on/before D frozen — the wallet's existing rows on/before D leave the
  // engine's pool, and frozen preview rows are neither matched nor importable.
  // They enter the result map as tier 1 so they render greyed/read-only with the
  // already-logged treatment; the footnote under the summary explains them.
  const matches = useMemo(() => {
    const eligible = preview.filter((p) => p.valid && !isOnOrBeforeDay(p.date, reconciledUntil));
    const allTransactions = usePersonalStore.getState().transactions;
    const existing = reconciledUntil
      ? allTransactions.filter((tx) => !(tx.walletId === selectedWalletId && isOnOrBeforeDay(tx.date, reconciledUntil)))
      : allTransactions;
    const results = matchTransactions(
      existing,
      eligible.map((p) => ({
        amount: p.amount!,
        type: p.type,
        date: p.date!,
        description: p.description || t.importCsv.imported,
        walletId: selectedWalletId,
      })),
    );
    const map = new Map<number, MatchResult>();
    eligible.forEach((p, i) => map.set(p.rowIndex, results[i]));
    for (const p of preview) {
      if (p.valid && isOnOrBeforeDay(p.date, reconciledUntil)) map.set(p.rowIndex, { tier: 1 });
    }
    return map;
  }, [preview, selectedWalletId, reconciledUntil, t]);

  // Include state = tier default ('new' checked, tier 0/1/2 unchecked), flipped
  // per-row by user toggle. Overrides reset whenever the match inputs (mapping,
  // wallet) change — same rule as the statement screen: a re-match resets
  // tier/include states (predictable beats preserving toggles).
  const [skipOverrides, setSkipOverrides] = useState<Set<number>>(new Set());
  const [overrideBase, setOverrideBase] = useState<{ preview: CsvPreviewRow[]; wallet: string | undefined } | null>(null);
  if (overrideBase?.preview !== preview || overrideBase.wallet !== selectedWalletId) {
    setOverrideBase({ preview, wallet: selectedWalletId });
    setSkipOverrides(new Set());
  }

  const isSkipped = useCallback((p: CsvPreviewRow) => {
    if (!p.valid) return true;
    const tier = matches.get(p.rowIndex)?.tier ?? 'new';
    const defaultSkip = tier !== 'new';
    return skipOverrides.has(p.rowIndex) ? !defaultSkip : defaultSkip;
  }, [matches, skipOverrides]);

  const toggleSkip = useCallback((p: CsvPreviewRow) => {
    if (!p.valid) return;
    const tier = matches.get(p.rowIndex)?.tier ?? 'new';
    if (tier === 0 || tier === 1) return; // already-logged rows are view-only
    setSkipOverrides((prev) => {
      const next = new Set(prev);
      if (next.has(p.rowIndex)) next.delete(p.rowIndex);
      else next.add(p.rowIndex);
      return next;
    });
  }, [matches]);

  const newRows = useMemo(() => preview.filter((p) => p.valid && (matches.get(p.rowIndex)?.tier ?? 'new') === 'new'), [preview, matches]);
  const reviewRows = useMemo(() => preview.filter((p) => p.valid && matches.get(p.rowIndex)?.tier === 2), [preview, matches]);
  const loggedRows = useMemo(() => preview.filter((p) => {
    const tier = matches.get(p.rowIndex)?.tier;
    return p.valid && (tier === 0 || tier === 1);
  }), [preview, matches]);
  const invalidRows = useMemo(() => preview.filter((p) => !p.valid), [preview]);

  const importableCount = useMemo(
    () => preview.filter((p) => p.valid && !isSkipped(p)).length,
    [preview, isSkipped],
  );

  const badCount = useMemo(() => preview.filter((p) => !p.valid).length, [preview]);

  // Bulk actions apply to the New section only.
  const setAllNew = useCallback((skip: boolean) => {
    setSkipOverrides((prev) => {
      const next = new Set(prev);
      for (const p of newRows) {
        if (skip) next.add(p.rowIndex);
        else next.delete(p.rowIndex);
      }
      return next;
    });
  }, [newRows]);

  // Matched-tx lookup for the Needs-review context line ("you logged RM12.00 to Cash…").
  const txById = useMemo(() => new Map(transactions.map((tx) => [tx.id, tx])), [transactions]);

  // "1–30 Jun · 42 already logged · 19 new — we'll only add the new ones"
  const summaryLine = useMemo(() => {
    if (preview.length === 0) return '';
    let min = Infinity;
    let max = -Infinity;
    for (const p of preview) {
      if (!p.valid || !p.date) continue;
      const ts = p.date.getTime();
      if (ts < min) min = ts;
      if (ts > max) max = ts;
    }
    const fmt = (ts: number) => new Date(ts).toLocaleDateString([], { day: 'numeric', month: 'short' });
    return t.importCsv.reviewSummary
      .replace('{start}', isFinite(min) ? fmt(min) : '—')
      .replace('{end}', isFinite(max) ? fmt(max) : '—')
      .replace('{logged}', String(loggedRows.length))
      .replace('{fresh}', String(newRows.length));
  }, [preview, loggedRows.length, newRows.length, t]);

  const listData = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    if (newRows.length > 0 || invalidRows.length > 0) {
      items.push({ kind: 'header', id: 'sec-new', title: t.importCsv.sectionNew.replace('{n}', String(newRows.length)) });
      for (const r of newRows) items.push({ kind: 'row', row: r });
      // Invalid rows keep their dimmed alert-icon treatment at the foot of the
      // New section — they're explained by the "rows can't import" warn text.
      for (const r of invalidRows) items.push({ kind: 'row', row: r });
    }
    if (reviewRows.length > 0) {
      items.push({ kind: 'header', id: 'sec-review', title: t.importCsv.sectionReview.replace('{n}', String(reviewRows.length)) });
      for (const r of reviewRows) items.push({ kind: 'row', row: r });
    }
    if (loggedRows.length > 0) {
      items.push({
        kind: 'header',
        id: 'sec-logged',
        title: t.importCsv.sectionLogged.replace('{n}', String(loggedRows.length)),
        collapsible: true,
        open: showLogged,
      });
      if (showLogged) for (const r of loggedRows) items.push({ kind: 'row', row: r });
    }
    return items;
  }, [newRows, invalidRows, reviewRows, loggedRows, showLogged, t]);

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

  // Design §10 Phase 3 — file date wins: a tier-1 auto-match IS the logged
  // transaction, so align its date to the CSV row's date (calendar-day compare —
  // logged dates carry time). CSV dates are user-mapped, not bank-verified, but
  // their file is the source of truth they chose. Silent hygiene:
  // description/category/wallet/amount all stay; updateTransaction fires sync
  // dirty-tracking and moves no wallet balance on a date-only update.
  const applyTier1DateMerges = useCallback(() => {
    const store = usePersonalStore.getState();
    for (const p of loggedRows) {
      const m = matches.get(p.rowIndex);
      if (m?.tier !== 1 || !m.matchedTxId || !p.date) continue;
      const tx = store.transactions.find((x) => x.id === m.matchedTxId);
      if (!tx) continue;
      const txDate = new Date(tx.date);
      if (isNaN(txDate.getTime())) continue;
      const sameDay =
        p.date.getFullYear() === txDate.getFullYear() &&
        p.date.getMonth() === txDate.getMonth() &&
        p.date.getDate() === txDate.getDate();
      if (!sameDay) store.updateTransaction(m.matchedTxId, { date: p.date });
    }
  }, [loggedRows, matches]);

  const handleImport = useCallback(() => {
    if (!selectedWalletId) {
      Alert.alert(t.importCsv.pickWallet, t.importCsv.pickWalletMsg);
      return;
    }
    const walletName = wallets.find((w) => w.id === selectedWalletId)?.name ?? '';
    const candidates = preview.filter((p) => p.valid && !isSkipped(p));
    if (candidates.length === 0) {
      // Nothing importable chosen: New section empty + nothing included from
      // Needs review means everything here is already logged — say so, stay put.
      if (newRows.length === 0 && loggedRows.length > 0) {
        // An all-duplicates import is still a reconciliation — merge tier-1 dates.
        applyTier1DateMerges();
        Alert.alert(t.common.importAllDuplicates, t.common.importAllDuplicatesMsg.replace('{n}', String(loggedRows.length)).replace('{wallet}', walletName));
      } else {
        Alert.alert(t.importCsv.nothingToImport, t.importCsv.nothingToImportMsg);
      }
      return;
    }
    Alert.alert(
      t.importCsv.importTransactions,
      t.importCsv.importConfirmMsg.replace('{n}', String(candidates.length)).replace('{wallet}', walletName),
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.importCsv.importBtn,
          onPress: () => {
            setStep('importing');
            try {
              // Review-time matching already kept already-logged rows out of the
              // importable set — import exactly the checked rows (New + included
              // Needs-review). Add them in ONE store write (one persist) instead of
              // per-row — a large file no longer freezes the UI — then apply the
              // wallet net once below (same invariant as the old per-row addTransaction).
              const toAdd = candidates.map((p) => ({
                amount: p.amount!,
                category: p.category || 'other',
                description: p.description || t.importCsv.imported,
                date: p.date!,
                type: p.type,
                mode: 'personal' as const,
                inputMethod: 'csv-import' as const,
                walletId: selectedWalletId,
              }));
              // Track the net wallet effect so the LIVE balance actually moves on import.
              // Reconcile replays these same transactions, so applying the net once keeps
              // live + reconciled in agreement.
              const netDelta = toAdd.reduce((sum, tx) => sum + (tx.type === 'income' ? tx.amount : -tx.amount), 0);
              const imported = toAdd.length;
              const txIds = imported > 0 ? usePersonalStore.getState().addTransactions(toAdd) : [];
              // Tier-1 date merges run whether or not any new row was imported
              // (all-duplicates is still a reconciliation) — covers both the
              // imported === 0 branch below and the goBack success path.
              applyTier1DateMerges();
              // "skipped" for the toast = rows the engine recognized as already logged
              // (tier 0 + 1). Un-included Needs-review rows are undecided — neither
              // imported nor counted.
              const skipped = loggedRows.length;
              // All duplicates — nothing imported, nothing to undo. Stay on the mapping step.
              if (imported === 0) {
                setStep('map');
                Alert.alert(t.common.importAllDuplicates, t.common.importAllDuplicatesMsg.replace('{n}', String(skipped)).replace('{wallet}', walletName));
                return;
              }
              if (netDelta > 0) useWalletStore.getState().addToWallet(selectedWalletId, netDelta);
              else if (netDelta < 0) useWalletStore.getState().deductFromWallet(selectedWalletId, -netDelta);
              // Record the batch so the toast's Undo can roll the whole import back
              // (undoBatch deletes each created row, which reverses the wallet delta).
              const batchId = useImportBatchStore.getState().recordBatch({
                source: 'csv',
                walletId: selectedWalletId,
                filename: csv?.filename,
                txIds,
              });
              navigation.goBack();
              showToast(
                t.importCsv.importedToast.replace('{n}', String(imported)) + (skipped > 0 ? t.importCsv.skippedSuffix.replace('{n}', String(skipped)) : ''),
                'success',
                { label: t.importCsv.undo, onPress: () => useImportBatchStore.getState().undoBatch(batchId) },
              );
            } catch (e: any) {
              setStep('map');
              Alert.alert(t.importCsv.importFailed, e?.message ?? t.importCsv.importFailedMsg);
            }
          },
        },
      ],
    );
  }, [preview, isSkipped, newRows.length, loggedRows.length, selectedWalletId, wallets, addTransaction, navigation, showToast, csv, t, applyTier1DateMerges]);

  const renderPreviewRow = useCallback((item: CsvPreviewRow) => {
    // Invalid rows: dimmed alert-icon, non-toggleable, never matched or imported.
    if (!item.valid) {
      return (
        <View style={[styles.row, styles.rowInvalid]}>
          <View style={styles.checkbox}>
            <Feather name="alert-circle" size={20} color={C.bronze ?? C.accent} />
          </View>
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
    }

    const tier = matches.get(item.rowIndex)?.tier ?? 'new';

    // Already logged (tier 0/1): greyed, view-only — no checkbox.
    if (tier === 0 || tier === 1) {
      return (
        <View style={[styles.row, styles.rowLogged]}>
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
    }

    const skipped = isSkipped(item);
    // "you logged RM12.00 to Cash · 3d apart" — the point is "you already have this".
    const matchedTxId = matches.get(item.rowIndex)?.matchedTxId;
    const matchedTx = matchedTxId ? txById.get(matchedTxId) : undefined;
    const gap = matches.get(item.rowIndex)?.dateGapDays;
    const matchCtx = tier === 2
      ? (gap === 0 ? t.importCsv.matchContextSameDay : t.importCsv.matchContext.replace('{n}', String(gap ?? 0)))
          .replace('{amount}', `${currency} ${(matchedTx?.amount ?? item.amount ?? 0).toFixed(2)}`)
          .replace('{wallet}', wallets.find((w) => w.id === (matchedTx?.walletId ?? matches.get(item.rowIndex)?.matchedWalletId))?.name ?? '?')
      : '';

    return (
      <View style={[styles.row, skipped && styles.rowDim]}>
        <TouchableOpacity
          onPress={() => toggleSkip(item)}
          style={styles.checkbox}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: !skipped }}
        >
          <Feather
            name={skipped ? 'square' : 'check-square'}
            size={20}
            color={skipped ? C.textSecondary : C.accent}
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
          {tier === 2 && <Text style={styles.matchContext}>{matchCtx}</Text>}
        </View>
      </View>
    );
  }, [matches, isSkipped, toggleSkip, styles, C, currency, t, txById, wallets]);

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.kind === 'header') {
      if (item.collapsible) {
        return (
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => { lightTap(); setShowLogged((v) => !v); }}
            accessibilityRole="button"
            accessibilityLabel={item.title}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name={item.open ? 'chevron-down' : 'chevron-right'} size={14} color={C.textSecondary} />
            <Text style={styles.sectionHeaderText}>{item.title}</Text>
          </TouchableOpacity>
        );
      }
      return (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionHeaderText}>{item.title}</Text>
        </View>
      );
    }
    return renderPreviewRow(item.row);
  }, [styles, C, renderPreviewRow]);

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
        <View style={styles.bulkActions}>
          <TouchableOpacity
            onPress={() => setAllNew(false)}
            style={styles.bulkBtn}
            accessibilityRole="button"
            accessibilityLabel="select all rows"
          >
            <Text style={styles.bulkBtnText}>{t.importCsv.selectAll}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setAllNew(true)}
            style={styles.bulkBtn}
            accessibilityRole="button"
            accessibilityLabel={t.importCsv.clear}
          >
            <Text style={styles.bulkBtnText}>{t.importCsv.clear}</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {summaryLine !== '' && <Text style={styles.summaryText}>{summaryLine}</Text>}
      {frozenCount > 0 && reconciledUntil != null && (
        <Text style={styles.summaryText}>
          {t.importCsv.beforeReconciled.replace('{n}', String(frozenCount)).replace('{date}', reconciledUntil)}
        </Text>
      )}

      <FlatList
        data={listData}
        keyExtractor={keyForItem}
        renderItem={renderItem}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews
        contentContainerStyle={{ paddingBottom: 120 + insets.bottom, maxWidth: 680, width: '100%', alignSelf: 'center' }}
      />

      <View style={[styles.footer, { paddingBottom: SPACING.md + insets.bottom }]}>
        <Button
          title={importableCount === 1 ? t.importCsv.importNTransactions.replace('{n}', '1') : t.importCsv.importNTransactionsPlural.replace('{n}', String(importableCount))}
          onPress={handleImport}
          disabled={(importableCount === 0 && newRows.length > 0) || !selectedWalletId}
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
  summaryText: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.xs,
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    lineHeight: TYPOGRAPHY.size.xs * 1.5,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  sectionHeaderText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.semibold,
    textTransform: 'uppercase',
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
  rowLogged: { opacity: 0.5 },
  checkbox: { padding: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  rowDesc: { flex: 1, fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary, fontWeight: TYPOGRAPHY.weight.medium },
  rowAmount: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold },
  rowMeta: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary, marginTop: 4 },
  matchContext: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary, marginTop: 4 },
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
