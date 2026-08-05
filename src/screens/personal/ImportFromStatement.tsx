import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import { syncStatementReminder } from '../../services/statementReminders';
import { matchTransactions, MatchTier } from '../../utils/transactionMatcher';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import EmptyState from '../../components/common/EmptyState';
import WalletPicker from '../../components/common/WalletPicker';
import {
  pickStatementPdf,
  parseStatement,
  isParseError,
  isCurrencyMismatch,
  cleanupStatementFile,
  ParsedTransaction,
  StatementParseResult,
  StatementParseError,
} from '../../services/statementImport';
import { usePersonalStore } from '../../store/personalStore';
import { useWalletStore } from '../../store/walletStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useCategoryStore } from '../../store/categoryStore';
import { useImportBatchStore } from '../../store/importBatchStore';
import { useToast } from '../../context/ToastContext';

type ReviewRow = ParsedTransaction & {
  _id: string;
  _include: boolean;
  _category?: string;
  _tier: MatchTier;
  _matchedTxId?: string;
  _matchedWalletId?: string;
  _dateGapDays?: number;
  // On/before the selected wallet's reconcile horizon: not importable, not
  // matchable — rendered with the greyed already-logged treatment.
  _frozen?: boolean;
};

// Single FlatList data array: section-header pseudo-items interleaved with rows.
// Multi-account (combined) statements add an 'account' pseudo-item before each
// account's group — it renders the group's sub-header + its own wallet picker.
type ListItem =
  | { kind: 'header'; id: string; title: string; collapsible?: boolean; open?: boolean }
  | { kind: 'account'; id: string; account: string }
  | { kind: 'row'; row: ReviewRow };

const keyForItem = (item: ListItem) => (item.kind === 'row' ? item.row._id : item.id);

// The per-row fields a matching pass (re)writes — applyMatching patches these
// onto rows while leaving user edits (category) and identity untouched.
type MatchPatch = Pick<
  ReviewRow,
  '_tier' | '_matchedTxId' | '_matchedWalletId' | '_dateGapDays' | '_include' | '_frozen'
>;

// Reconcile horizon compares on the LOCAL calendar day (statement rows are
// day-only; logged rows carry time) — the same local y/m/d extraction
// importDedup's dayKey uses. YYYY-MM-DD keys compare chronologically as strings.
const localDayKey = (d: Date | string): string | null => {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return null;
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${mm}-${dd}`;
};

const isOnOrBeforeDay = (d: Date | string, horizon: string | undefined): boolean => {
  if (!horizon) return false;
  const k = localDayKey(d);
  return k !== null && k <= horizon;
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
  const defaultWalletId = defaultWallet?.id;
  const addTransaction = usePersonalStore((s) => s.addTransaction);
  const transactions = usePersonalStore((s) => s.transactions);
  const expenseCategories = useCategoryStore((s) => s.getExpenseCategories?.() ?? []);
  const incomeCategories = useCategoryStore((s) => s.getIncomeCategories?.() ?? []);
  const { showToast } = useToast();

  const [step, setStep] = useState<'start' | 'parsing' | 'review' | 'importing'>('start');
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [selectedWalletId, setSelectedWalletId] = useState<string | undefined>(defaultWallet?.id);
  // Multi-account (combined) statements only: last-4 → chosen wallet. Populated
  // when parsed rows carry >1 distinct non-null `account`; single-account
  // statements leave this empty and keep using selectedWalletId alone.
  const [accountWallets, setAccountWallets] = useState<Record<string, string | undefined>>({});
  const [remaining, setRemaining] = useState<number | null>(null);
  const [showLogged, setShowLogged] = useState(false);
  const [categoryPicker, setCategoryPicker] = useState<{ rowId: string; type: 'income' | 'expense' } | null>(null);
  const [passwordPrompt, setPasswordPrompt] = useState<{ base64: string; filename: string } | null>(null);
  const [passwordValue, setPasswordValue] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  // Inline error/empty state on the start screen (replaces Alert popups for the
  // parse phase — the pick button doubles as retry). See EmptyState.
  const [notice, setNotice] = useState<{ icon: string; title: string; message: string } | null>(null);

  // The picker's cache-directory copy of the statement. Deleted on EVERY terminal
  // path (parse done, parse error, password sheet closed) — statements are sensitive.
  // The password-retry flow re-sends the in-memory base64, so the file is released
  // only when the whole parse sequence finishes, never between retries.
  const pickedFileRef = useRef<{ uri: string; filename: string } | null>(null);
  const [pickedFilename, setPickedFilename] = useState<string | undefined>(undefined);
  const cleanupPickedFile = useCallback(() => {
    const f = pickedFileRef.current;
    pickedFileRef.current = null;
    if (f) void cleanupStatementFile(f.uri);
  }, []);

  // Reconcile candidates against what's already logged (design §3 engine). Tier 0/1
  // rows are "already logged" — never importable; tier 2 starts unchecked (the human
  // decides); 'new' starts checked. Include states are (re)set by the tier — a wallet
  // change re-runs this and resets them (predictable beats preserving toggles).
  // User-picked categories survive a re-match.
  //
  // Rows are bucketed by the wallet they resolve to (walletForRow) and each bucket
  // gets ONE matchTransactions call with that wallet: a single-account statement
  // resolves every row to the same wallet → exactly one engine pass (the original
  // behavior); a combined statement runs one pass per account's wallet.
  //
  // Reconcile horizon (design §10 Phase 3): a wallet "reconciled up to D" has its
  // period on/before D frozen. Frozen rows leave BOTH sides of the match — the
  // wallet's existing rows on/before D are out of the engine's pool, and candidate
  // rows on/before D are neither matched nor importable (_tier 1 + _frozen, so they
  // render with the collapsed already-logged treatment; the footnote explains them).
  // The horizon is per bucket — each account's wallet freezes its own rows only.
  const applyMatching = useCallback((base: ReviewRow[], walletForRow: (r: ReviewRow) => string | undefined): ReviewRow[] => {
    const allTransactions = usePersonalStore.getState().transactions;
    const allWallets = useWalletStore.getState().wallets;
    const buckets = new Map<string | undefined, number[]>();
    base.forEach((r, i) => {
      const w = walletForRow(r);
      const arr = buckets.get(w);
      if (arr) arr.push(i);
      else buckets.set(w, [i]);
    });
    const patches: (MatchPatch | null)[] = base.map(() => null);
    buckets.forEach((idxs, walletId) => {
      const horizon = walletId
        ? allWallets.find((w) => w.id === walletId)?.reconciledUntil
        : undefined;
      const existing = horizon
        ? allTransactions.filter((tx) => !(tx.walletId === walletId && isOnOrBeforeDay(tx.date, horizon)))
        : allTransactions;
      const matchableIdxs = idxs.filter((i) => !isOnOrBeforeDay(base[i].date, horizon));
      const matches = matchTransactions(
        existing,
        matchableIdxs.map((i) => {
          const r = base[i];
          return {
            amount: r.amount,
            type: r.type,
            date: r.date,
            description: r.description,
            walletId,
            // FX originals (parser v2) let the engine's FX-exact pass upgrade these
            // rows to tier 1 against FX-carrying logged transactions.
            originalAmount: r.originalAmount,
            originalCurrency: r.originalCurrency,
          };
        }),
      );
      // Stitch results back by row index: matches come back in candidate order,
      // which is the bucket's row order minus the frozen rows.
      let mi = 0;
      for (const i of idxs) {
        const r = base[i];
        if (isOnOrBeforeDay(r.date, horizon)) {
          patches[i] = {
            _tier: 1 as MatchTier,
            _matchedTxId: undefined,
            _matchedWalletId: undefined,
            _dateGapDays: undefined,
            _include: false,
            _frozen: true,
          };
          continue;
        }
        const m = matches[mi++];
        patches[i] = {
          _tier: m.tier,
          _matchedTxId: m.matchedTxId,
          _matchedWalletId: m.matchedWalletId,
          _dateGapDays: m.dateGapDays,
          _include: m.tier === 'new',
          _frozen: false,
        };
      }
    });
    return base.map((r, i) => ({ ...r, ...(patches[i] as MatchPatch) }));
  }, []);

  // Apply a (successful or terminal-error) parse result to the screen.
  const finishParse = useCallback((res: StatementParseResult | StatementParseError) => {
    if (isParseError(res)) {
      setStep('start');
      // Known codes get actionable localized copy (design §5); everything else
      // keeps the server/service message as-is.
      if (res.error === 'timeout') {
        setNotice({ icon: 'alert-triangle', title: t.importStatement.timeoutTitle, message: t.importStatement.timeoutMsg });
      } else if (res.error === 'not_authenticated') {
        setNotice({ icon: 'lock', title: t.importStatement.notAuthenticatedTitle, message: t.importStatement.notAuthenticatedMsg });
      } else {
        setNotice({ icon: 'alert-triangle', title: t.importStatement.couldNotParse, message: res.message ?? res.error });
      }
      return;
    }
    if (res.transactions.length === 0) {
      setStep('start');
      setNotice({ icon: 'inbox', title: t.importStatement.nothingFound, message: t.importStatement.nothingFoundMsg });
      return;
    }
    // Currency guard — a statement in the wrong currency would import silent
    // garbage (USD figures booked as RM). Missing/unparseable currency never blocks.
    if (isCurrencyMismatch(res.currency, currency)) {
      setStep('start');
      setNotice({
        icon: 'alert-triangle',
        title: t.importStatement.currencyMismatchTitle,
        message: t.importStatement.currencyMismatchMsg
          .replace('{currency}', res.currency)
          .replace('{appCurrency}', currency),
      });
      return;
    }
    setNotice(null);
    setRemaining(res.remaining);
    setShowLogged(false);
    // Own-account transfers were dropped server-side (double-count guard) —
    // tell the user so the "missing" rows aren't a mystery.
    if (res.transfersSkipped) {
      Alert.alert(
        t.importStatement.transfersSkippedTitle,
        t.importStatement.transfersSkippedMsg.replace('{n}', String(res.transfersSkipped)),
      );
    }
    // Hoisted so multi-account detection can inspect the parsed last-4s.
    const mapped: ReviewRow[] = res.transactions.map((tx, i) => ({
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
      _tier: 'new' as MatchTier,
    }));
    // Multi-account (combined) statement: >1 distinct non-null last-4 across
    // rows. Each account gets its own wallet (defaulting to the app default)
    // and matching runs per account wallet; single-account statements keep the
    // one-wallet flow exactly as before.
    const distinctAccounts = [...new Set(mapped.map((tx) => tx.account).filter((a): a is string => Boolean(a)))].sort();
    if (distinctAccounts.length > 1) {
      const init: Record<string, string | undefined> = {};
      for (const a of distinctAccounts) init[a] = defaultWalletId;
      setAccountWallets(init);
      // A stray null account (parser contract says combined statements tag
      // every row) joins the first group so it can never vanish from review.
      setRows(applyMatching(mapped, (r) => init[r.account ?? distinctAccounts[0]] ?? defaultWalletId));
    } else {
      setAccountWallets({});
      setRows(applyMatching(mapped, () => selectedWalletId));
    }
    setStep('review');
  }, [t, currency, expenseCategories, incomeCategories, applyMatching, selectedWalletId, defaultWalletId]);

  const handlePick = useCallback(async () => {
    lightTap();
    setNotice(null);
    try {
      const picked = await pickStatementPdf();
      if (!picked) return;
      pickedFileRef.current = { uri: picked.uri, filename: picked.filename };
      setPickedFilename(picked.filename);
      setStep('parsing');
      const res = await parseStatement(picked.base64, picked.filename);
      // Locked statement (e.g. Maybank/CIMB IC-protected) — ask for the password.
      // The sheet takes over the picked file; it cleans up when the sequence ends.
      if (isParseError(res) && res.error === 'password_required') {
        setStep('start');
        setPasswordValue('');
        setPasswordError(false);
        setPasswordPrompt({ base64: picked.base64, filename: picked.filename });
        return;
      }
      finishParse(res);
      cleanupPickedFile();
    } catch (e: any) {
      cleanupPickedFile();
      setStep('start');
      setNotice({ icon: 'alert-triangle', title: t.importStatement.errorTitle, message: e?.message ?? t.importStatement.couldNotRead });
    }
  }, [finishParse, cleanupPickedFile, t]);

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
      cleanupPickedFile();
    } catch (e: any) {
      setUnlocking(false);
      setPasswordError(true);
    }
  }, [passwordPrompt, passwordValue, unlocking, finishParse, cleanupPickedFile]);

  // Multi-account (combined) statement: >1 distinct non-null last-4 across the
  // parsed rows. Drives the per-account wallet pickers, list grouping, and import.
  const accountGroups = useMemo(() => {
    const distinct = new Set<string>();
    for (const r of rows) if (r.account) distinct.add(r.account);
    return distinct.size > 1 ? [...distinct].sort() : null;
  }, [rows]);

  // Changing the wallet re-runs matching against that wallet (tiers depend on it).
  // Single-account mode only — multi-account groups use handleAccountWalletSelect.
  const handleWalletSelect = useCallback((id: string) => {
    lightTap();
    setSelectedWalletId(id);
    setRows((prev) => applyMatching(prev, () => id));
  }, [applyMatching]);

  // Multi-account mode: changing one account group's wallet re-runs matching for
  // THAT account's rows only — its tiers/include states reset, other groups keep
  // their toggles (their wallet, hence their match, didn't change).
  const handleAccountWalletSelect = useCallback((account: string, id: string) => {
    lightTap();
    setAccountWallets((prev) => ({ ...prev, [account]: id }));
    setRows((prev) => {
      const inGroup = (r: ReviewRow) => (r.account ?? accountGroups?.[0]) === account;
      const affected = prev.filter(inGroup);
      if (affected.length === 0) return prev;
      const rematched = applyMatching(affected, () => id);
      let ai = 0;
      return prev.map((r) => (inGroup(r) ? rematched[ai++] : r));
    });
  }, [applyMatching, accountGroups]);

  const toggleRow = useCallback((id: string) => {
    setRows((prev) => prev.map((r) => (r._id === id && r._tier !== 0 && r._tier !== 1 ? { ...r, _include: !r._include } : r)));
  }, []);

  // Bulk actions apply to the New section only.
  const selectAll = useCallback((value: boolean) => {
    setRows((prev) => prev.map((r) => (r._tier === 'new' ? { ...r, _include: value } : r)));
  }, []);

  const newRows = useMemo(() => rows.filter((r) => r._tier === 'new'), [rows]);
  const reviewRows = useMemo(() => rows.filter((r) => r._tier === 2), [rows]);
  const loggedRows = useMemo(() => rows.filter((r) => r._tier === 0 || r._tier === 1), [rows]);

  const selectedCount = useMemo(() => rows.filter((r) => r._include).length, [rows]);

  // Resolve the wallet a row matches/imports into in multi-account mode: its
  // account group's pick, falling back to the app default when somehow unset
  // (group pickers default to the app default and can't be cleared, so unset
  // means "no wallets exist"). A stray null account joins the first group —
  // same grouping as finishParse and listData, so the row can never vanish.
  const walletForAccountRow = useCallback(
    (r: ReviewRow): string | undefined => {
      const key = r.account ?? accountGroups?.[0];
      return (key ? accountWallets[key] : undefined) ?? defaultWalletId;
    },
    [accountWallets, accountGroups, defaultWalletId],
  );

  // Import (and the footer button) block while any target wallet is missing:
  // single-account — nothing picked (the original guard); multi-account — any
  // account group without a resolvable wallet.
  const missingWallet = accountGroups
    ? accountGroups.some((a) => !(accountWallets[a] ?? defaultWalletId))
    : !selectedWalletId;

  // Frozen-row footnote(s) under the summary: one line per distinct reconcile
  // horizon that froze rows. A single-account statement yields exactly one
  // line — the same one shown before multi-account support.
  const frozenNotes = useMemo(() => {
    const byHorizon = new Map<string, number>();
    for (const r of rows) {
      if (!r._frozen) continue;
      const walletId = accountGroups ? walletForAccountRow(r) : selectedWalletId;
      const h = wallets.find((w) => w.id === walletId)?.reconciledUntil;
      if (h) byHorizon.set(h, (byHorizon.get(h) ?? 0) + 1);
    }
    const notes: { date: string; n: number }[] = [];
    byHorizon.forEach((n, date) => notes.push({ date, n }));
    return notes;
  }, [rows, accountGroups, walletForAccountRow, selectedWalletId, wallets]);

  // Matched-tx lookup for the Needs-review context line ("you logged RM12.00 to Cash…").
  const txById = useMemo(() => new Map(transactions.map((tx) => [tx.id, tx])), [transactions]);

  // "1–30 Jun · 42 already logged · 19 new — we'll only add the new ones"
  const summaryLine = useMemo(() => {
    if (rows.length === 0) return '';
    let min = Infinity;
    let max = -Infinity;
    for (const r of rows) {
      const ts = new Date(r.date).getTime();
      if (isNaN(ts)) continue;
      if (ts < min) min = ts;
      if (ts > max) max = ts;
    }
    const fmt = (ts: number) => new Date(ts).toLocaleDateString([], { day: 'numeric', month: 'short' });
    return t.importStatement.reviewSummary
      .replace('{start}', isFinite(min) ? fmt(min) : '—')
      .replace('{end}', isFinite(max) ? fmt(max) : '—')
      .replace('{logged}', String(loggedRows.length))
      .replace('{fresh}', String(newRows.length));
  }, [rows, loggedRows.length, newRows.length, t]);

  const listData = useMemo<ListItem[]>(() => {
    const items: ListItem[] = [];
    // New → Needs review → Already logged (collapsed), same as ever — emitted
    // once for a single-account statement, once per account group for a
    // combined one. `prefix` keeps the single-account header ids unchanged.
    const pushSections = (prefix: string, groupRows: ReviewRow[]) => {
      const fresh = groupRows.filter((r) => r._tier === 'new');
      const review = groupRows.filter((r) => r._tier === 2);
      const logged = groupRows.filter((r) => r._tier === 0 || r._tier === 1);
      if (fresh.length > 0) {
        items.push({ kind: 'header', id: `${prefix}-new`, title: t.importStatement.sectionNew.replace('{n}', String(fresh.length)) });
        for (const r of fresh) items.push({ kind: 'row', row: r });
      }
      if (review.length > 0) {
        items.push({ kind: 'header', id: `${prefix}-review`, title: t.importStatement.sectionReview.replace('{n}', String(review.length)) });
        for (const r of review) items.push({ kind: 'row', row: r });
      }
      if (logged.length > 0) {
        items.push({
          kind: 'header',
          id: `${prefix}-logged`,
          title: t.importStatement.sectionLogged.replace('{n}', String(logged.length)),
          collapsible: true,
          open: showLogged,
        });
        if (showLogged) for (const r of logged) items.push({ kind: 'row', row: r });
      }
    };
    if (!accountGroups) {
      pushSections('sec', rows);
    } else {
      for (const account of accountGroups) {
        items.push({ kind: 'account', id: `acct-${account}`, account });
        pushSections(`sec-${account}`, rows.filter((r) => (r.account ?? accountGroups[0]) === account));
      }
    }
    return items;
  }, [rows, accountGroups, showLogged, t]);

  // Design §10 Phase 3 — bank date wins: a tier-1 auto-match IS the logged
  // transaction, so align its date to the statement's posting date (calendar-day
  // compare — logged dates carry time, statement dates are day-only; same
  // new Date(r.date) conversion the import below uses). Silent hygiene:
  // description/category/wallet/amount all stay; updateTransaction fires sync
  // dirty-tracking and moves no wallet balance on a date-only update.
  const applyTier1DateMerges = useCallback(() => {
    const store = usePersonalStore.getState();
    for (const r of rows) {
      if (r._tier !== 1 || !r._matchedTxId) continue;
      const rowDate = new Date(r.date);
      if (isNaN(rowDate.getTime())) continue;
      const tx = store.transactions.find((x) => x.id === r._matchedTxId);
      if (!tx) continue;
      const txDate = new Date(tx.date);
      if (isNaN(txDate.getTime())) continue;
      const sameDay =
        rowDate.getFullYear() === txDate.getFullYear() &&
        rowDate.getMonth() === txDate.getMonth() &&
        rowDate.getDate() === txDate.getDate();
      if (!sameDay) store.updateTransaction(r._matchedTxId, { date: rowDate });
    }
  }, [rows]);

  const handleImport = useCallback(() => {
    // Block while any target wallet is missing: single-account — no wallet
    // picked (the original guard); multi-account — an account group whose rows
    // have no wallet chosen.
    if (missingWallet) {
      Alert.alert(t.importStatement.pickWallet, t.importStatement.pickWalletMsg);
      return;
    }
    // Every row resolves to a wallet: single-account statements all go to
    // selectedWalletId (unchanged); multi-account rows use their account
    // group's pick, with the app default as last resort.
    const walletForRow = (r: ReviewRow): string | undefined =>
      accountGroups ? walletForAccountRow(r) : selectedWalletId;
    const checkedRows = rows.filter((r) => r._include);
    // Distinct import targets — for message copy and the single-wallet checks
    // below. The all-duplicates case (nothing checked) falls back to every
    // row's wallet so the alert still names the wallet(s) involved.
    const targetWalletIds = [...new Set(
      (checkedRows.length > 0 ? checkedRows : rows).map((r) => walletForRow(r)).filter((x): x is string => Boolean(x)),
    )];
    const walletName = targetWalletIds
      .map((id) => wallets.find((w) => w.id === id)?.name ?? '')
      .filter(Boolean)
      .join(', ');
    // Nothing importable chosen: New section empty + nothing included from Needs
    // review means everything parsed is already logged — say so, stay on screen.
    if (selectedCount === 0) {
      if (newRows.length === 0 && loggedRows.length > 0) {
        // An all-duplicates import is still a reconciliation — merge tier-1 dates.
        applyTier1DateMerges();
        Alert.alert(t.common.importAllDuplicates, t.common.importAllDuplicatesMsg.replace('{n}', String(loggedRows.length)).replace('{wallet}', walletName));
      }
      return;
    }
    Alert.alert(
      t.importStatement.importTransactions,
      t.importStatement.importConfirmMsg.replace('{n}', String(selectedCount)).replace('{wallet}', walletName),
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.importStatement.importBtn,
          onPress: () => {
            setStep('importing');
            try {
              // Review-time matching already kept already-logged rows out of the
              // importable set — import exactly the checked rows (New + included
              // Needs-review). Add them in ONE store write (one persist) instead of
              // per-row — a large statement no longer freezes the UI — then apply
              // the wallet net once below (same invariant as the old per-row addTransaction).
              const toAdd = rows
                .filter((r) => r._include)
                .map((r) => ({ r, date: new Date(r.date) }))
                .filter((x) => !isNaN(x.date.getTime()))
                .map((x) => ({
                  amount: x.r.amount,
                  category: x.r._category ?? 'other',
                  description: x.r.description,
                  date: x.date,
                  type: x.r.type,
                  mode: 'personal' as const,
                  inputMethod: 'statement-import' as const,
                  // Single-account: selectedWalletId for every row (unchanged);
                  // multi-account: the row's account-group wallet.
                  walletId: walletForRow(x.r),
                  // FX rows (parser v2): persist the foreign original + implied
                  // rate so future imports can FX-match them (FX-exact pass).
                  // fxRate = amount / originalAmount (MYR per 1 foreign unit,
                  // per Transaction.fxRate's contract), 6dp — round-trips the
                  // sen-rounded MYR amount.
                  ...(x.r.originalAmount != null &&
                    Number.isFinite(x.r.originalAmount) &&
                    x.r.originalAmount > 0 &&
                    x.r.originalCurrency != null
                    ? {
                        originalAmount: x.r.originalAmount,
                        originalCurrency: x.r.originalCurrency,
                        fxRate: Number((x.r.amount / x.r.originalAmount).toFixed(6)),
                      }
                    : {}),
                }));
              // Move the LIVE wallet balance too (reconcile replays these txns, so the net
              // is applied once) — otherwise the wallet stays wrong, permanently so with
              // sync off. Multi-account imports can span wallets: net PER WALLET, each
              // applied once below (a single-account import yields exactly one entry).
              const netByWallet = new Map<string, number>();
              for (const tx of toAdd) {
                if (!tx.walletId) continue;
                netByWallet.set(tx.walletId, (netByWallet.get(tx.walletId) ?? 0) + (tx.type === 'income' ? tx.amount : -tx.amount));
              }
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
              // All duplicates — nothing imported, nothing to undo. Stay on review.
              if (imported === 0) {
                setStep('review');
                Alert.alert(t.common.importAllDuplicates, t.common.importAllDuplicatesMsg.replace('{n}', String(skipped)).replace('{wallet}', walletName));
                return;
              }
              netByWallet.forEach((net, wid) => {
                if (net > 0) useWalletStore.getState().addToWallet(wid, net);
                else if (net < 0) useWalletStore.getState().deductFromWallet(wid, -net);
              });
              // Record the batch so the toast's Undo can roll the whole import back
              // (undoBatch deletes each created row, which reverses the wallet delta).
              // ONE batch for the whole import — txIds may span wallets, undoBatch
              // only deletes by id. The walletId metadata is set only when the
              // entire import landed in a single wallet.
              const batchId = useImportBatchStore.getState().recordBatch({
                source: 'statement',
                walletId: targetWalletIds.length === 1 ? targetWalletIds[0] : undefined,
                filename: pickedFilename,
                txIds,
              });
              // Re-arm next month's statement reminder (one-shot DATE trigger —
              // every sync schedules the 1st of the following month).
              void syncStatementReminder(useSettingsStore.getState().statementReminderEnabled);
              // Reconcile-horizon offer (design §10 Phase 3): a successful import
              // means the user just had the statement in hand — offer to freeze the
              // imported period so future imports skip it. Only forward moves are
              // offered; Alert before goBack so it doesn't fight the toast.
              // Offered only when the ENTIRE import landed in one wallet (single-
              // account statement, or every account group pointed at the same
              // wallet): a true multi-wallet import would need one horizon decision
              // per wallet, which a single alert can't carry — so it's skipped.
              let endDate: string | null = null;
              for (const tx of toAdd) {
                const k = localDayKey(tx.date);
                if (k !== null && (endDate === null || k > endDate)) endDate = k;
              }
              const offerWalletId = targetWalletIds.length === 1 ? targetWalletIds[0] : undefined;
              const currentHorizon = offerWalletId
                ? useWalletStore.getState().wallets.find((w) => w.id === offerWalletId)?.reconciledUntil
                : undefined;
              if (offerWalletId && endDate !== null && (!currentHorizon || endDate > currentHorizon)) {
                const offerDate = endDate;
                Alert.alert(
                  t.importStatement.reconcileOfferTitle,
                  t.importStatement.reconcileOfferMsg.replace('{wallet}', walletName).replace('{date}', offerDate),
                  [
                    { text: t.common.notNow, style: 'cancel' },
                    {
                      text: t.importStatement.reconcileOfferConfirm,
                      onPress: () => useWalletStore.getState().setReconciledUntil(offerWalletId, offerDate),
                    },
                  ],
                );
              }
              navigation.goBack();
              showToast(
                t.importStatement.importedToast.replace('{n}', String(imported)) + (skipped > 0 ? t.importStatement.skippedSuffix.replace('{n}', String(skipped)) : ''),
                'success',
                { label: t.importStatement.undo, onPress: () => useImportBatchStore.getState().undoBatch(batchId) },
              );
            } catch (e: any) {
              setStep('review');
              Alert.alert(t.importStatement.importFailed, e?.message ?? t.importStatement.importFailedMsg);
            }
          },
        },
      ],
    );
  }, [rows, selectedWalletId, selectedCount, newRows.length, loggedRows.length, addTransaction, wallets, navigation, showToast, pickedFilename, t, applyTier1DateMerges, accountGroups, walletForAccountRow, missingWallet]);

  const renderRow = useCallback((item: ReviewRow) => {
    const bad = isNaN(new Date(item.date).getTime());

    // Already logged (tier 0/1): greyed, view-only — no checkbox, no chip.
    if (item._tier === 0 || item._tier === 1) {
      return (
        <View style={[styles.row, styles.rowLogged]}>
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
            </View>
          </View>
        </View>
      );
    }

    const needsReview = item._tier === 2;
    // "you logged RM12.00 to Cash · 3d apart" — the point is "you already have this".
    const matchedTx = item._matchedTxId ? txById.get(item._matchedTxId) : undefined;
    const matchCtx = needsReview
      ? (item._dateGapDays === 0
          ? t.importStatement.matchContextSameDay
          : t.importStatement.matchContext.replace('{n}', String(item._dateGapDays ?? 0))
        )
          .replace('{amount}', `${currency} ${(matchedTx?.amount ?? item.amount).toFixed(2)}`)
          .replace('{wallet}', wallets.find((w) => w.id === (matchedTx?.walletId ?? item._matchedWalletId))?.name ?? '?')
      : '';

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
            {/* Needs-review rows get a category only once included (default 'other'
                or the AI-suggested one, resolved at parse time). */}
            <TouchableOpacity
              onPress={() => setCategoryPicker({ rowId: item._id, type: item.type })}
              style={[styles.categoryChip, needsReview && !item._include && styles.chipDisabled]}
              disabled={needsReview && !item._include}
              accessibilityRole="button"
              accessibilityLabel={`change category, currently ${item._category ?? 'uncategorized'}`}
            >
              <Feather name="tag" size={12} color={C.textSecondary} />
              <Text style={styles.categoryChipText}>{item._category ?? t.importStatement.uncategorized}</Text>
            </TouchableOpacity>
          </View>
          {needsReview && <Text style={styles.matchContext}>{matchCtx}</Text>}
        </View>
      </View>
    );
  }, [styles, toggleRow, C, currency, t, txById, wallets]);

  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.kind === 'account') {
      // Multi-account sub-header: last-4 label + this account's own wallet
      // picker (changing it re-matches only this account's rows).
      return (
        <Card style={styles.accountCard}>
          <View style={styles.accountTitleRow}>
            <Feather name="credit-card" size={14} color={C.textSecondary} />
            <Text style={styles.accountTitleText}>
              {t.importStatement.accountGroupTitle.replace('{account}', item.account)}
            </Text>
          </View>
          <WalletPicker
            wallets={wallets}
            selectedId={accountWallets[item.account] ?? null}
            onSelect={(id) => handleAccountWalletSelect(item.account, id)}
            label={t.importStatement.addToWallet}
          />
        </Card>
      );
    }
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
    return renderRow(item.row);
  }, [styles, C, renderRow, wallets, accountWallets, handleAccountWalletSelect, t]);

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
          onRequestClose={() => { if (!unlocking) { setPasswordPrompt(null); setPasswordValue(''); cleanupPickedFile(); } }}
        >
          {/* KAView from react-native-keyboard-controller, behavior="padding" on BOTH
              platforms. RN's built-in KAV with behavior=undefined is inert, and inside an
              Android transparent Modal it wouldn't work anyway (docs/BUILDING_CHECKLIST.md)
              — this build is edge-to-edge so adjustResize never fires either. */}
          <KAView style={{ flex: 1 }} behavior="padding">
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => { if (!unlocking) { setPasswordPrompt(null); setPasswordValue(''); cleanupPickedFile(); } }}
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
        {/* Single-account statements pick one wallet here. Multi-account
            (combined) statements pick per account group — see the account
            sub-headers inside the list below. */}
        {!accountGroups && (
          <WalletPicker
            wallets={wallets}
            selectedId={selectedWalletId ?? null}
            onSelect={handleWalletSelect}
            label={t.importStatement.addToWallet}
          />
        )}

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

      {summaryLine !== '' && <Text style={styles.summaryText}>{summaryLine}</Text>}
      {frozenNotes.map((note) => (
        <Text key={note.date} style={styles.summaryText}>
          {t.importStatement.beforeReconciled.replace('{n}', String(note.n)).replace('{date}', note.date)}
        </Text>
      ))}

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
          title={selectedCount === 1 ? t.importStatement.importNTransactions.replace('{n}', '1') : t.importStatement.importNTransactionsPlural.replace('{n}', String(selectedCount))}
          onPress={handleImport}
          disabled={(selectedCount === 0 && newRows.length > 0) || missingWallet}
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
  accountCard: { marginHorizontal: SPACING.lg, marginTop: SPACING.md, padding: SPACING.md },
  accountTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  accountTitleText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textSecondary,
    fontWeight: TYPOGRAPHY.weight.semibold,
    textTransform: 'uppercase',
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
  remainingText: { marginLeft: 'auto', fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary },
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
  rowLogged: { opacity: 0.5 },
  checkbox: { padding: SPACING.xs },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  rowDesc: { flex: 1, fontSize: TYPOGRAPHY.size.sm, color: C.textPrimary, fontWeight: TYPOGRAPHY.weight.medium },
  rowAmount: { fontSize: TYPOGRAPHY.size.sm, fontWeight: TYPOGRAPHY.weight.semibold },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.xs },
  rowMeta: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary },
  matchContext: { fontSize: TYPOGRAPHY.size.xs, color: C.textSecondary, marginTop: SPACING.xs },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.accent, 0.08),
  },
  chipDisabled: { opacity: 0.5 },
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
