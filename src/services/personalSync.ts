// Personal sync is a wholly-personal module — bind `supabase` to the personal
// client so every personal_* call routes to the personal account.
import { supabasePersonal as supabase } from './supabase';
import { usePersonalStore } from '../store/personalStore';
import { useWalletStore } from '../store/walletStore';
import { useDebtStore } from '../store/debtStore';
import { useReceiptStore } from '../store/receiptStore';
import { useSavingsStore } from '../store/savingsStore';
import { useNotesStore } from '../store/notesStore';
import { useSettingsStore } from '../store/settingsStore';
import { useTombstoneStore } from '../store/tombstoneStore';
import { autoReconcileWallets } from '../utils/walletReconcile';
import { roundMoney } from '../utils/money';
import { replayCapitalMoves } from '../screens/personal/savings/savingsMath';
import * as FileSystem from 'expo-file-system/legacy';
import { resolveReceiptImageUri } from '../utils/receiptImage';
import { uploadReceiptImage, ensureLocalReceiptImage } from './receiptImageSync';
import {
  txToRemote, walletToRemote, transferToRemote, subToRemote, budgetToRemote,
  goalToRemote, debtToRemote, splitToRemote, contactToRemote, savingsToRemote, receiptToRemote,
  txFromRemote, walletFromRemote, transferFromRemote, subFromRemote, budgetFromRemote,
  goalFromRemote, debtFromRemote, splitFromRemote, contactFromRemote, savingsFromRemote, receiptFromRemote,
  noteToRemote, noteFromRemote,
  mergeSubscription,
} from './personalSyncMappers';
import type { Debt, Goal, SavingsAccount, SavedReceipt } from '../types';

// ─── Session helper ───────────────────────────────────────────────────────────
let _sessionExpired = false;
export function isPersonalSessionExpired(): boolean { return _sessionExpired; }
export function clearPersonalSessionExpired(): void { _sessionExpired = false; }

// A push that did not fully succeed must NOT advance the sync clock or reconcile.
let _syncIncomplete = false;
export function isPersonalSyncIncomplete(): boolean { return _syncIncomplete; }
// Set when a different account signs in on this device while local data exists.
let _accountMismatch = false;
export function isPersonalAccountMismatch(): boolean { return _accountMismatch; }
export function clearPersonalAccountMismatch(): void { _accountMismatch = false; }

function hasLocalPersonalData(): boolean {
  const p = usePersonalStore.getState();
  const w = useWalletStore.getState();
  const d = useDebtStore.getState();
  const s = useSavingsStore.getState();
  const n = useNotesStore.getState();
  return (
    p.transactions.length + p.subscriptions.length + p.budgets.length + p.goals.length +
    w.wallets.length + d.debts.length + s.accounts.length + n.pages.length
  ) > 0;
}

async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const expiresAt = session.expires_at ?? 0;
  if (expiresAt * 1000 < Date.now() + 60000) {
    const { data: { session: refreshed }, error } = await supabase.auth.refreshSession();
    if (error || !refreshed) {
      console.warn('[personalSync] session refresh failed — marking expired:', error?.message ?? 'no refreshed session');
      _sessionExpired = true;
      return null;
    }
    _sessionExpired = false;
    return refreshed;
  }
  _sessionExpired = false;
  return session;
}

// ─── Mappers ─────────────────────────────────────────────────────────────────
// All local⇄remote field mappers live in ./personalSyncMappers (pure, no RN/Supabase
// imports) so they can be round-trip tested. See scripts/test-personal-sync-roundtrip.ts.

// ─── Generic pull / push / tombstone helpers ──────────────────────────────────
type PullResult<TLocal> = {
  remote: TLocal[];
  remoteLocalIds: Set<string>;
  // local_ids of rows the CLOUD reports soft-deleted (deleted_at set). Only
  // populated for soft-delete-aware tables (receipts, transactions).
  remoteDeletedIds: Set<string>;
} | null;

const PULL_PAGE = 1000;

async function pullTable<TLocal>(
  table: string,
  userId: string,
  fromRemote: (r: any) => TLocal,
  tombstoneIds?: Set<string>,
  opts?: { softDelete?: boolean },
): Promise<PullResult<TLocal>> {
  const allData: any[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      // Deterministic ordering is REQUIRED for correct pagination: without an
      // explicit order, PostgREST's row order between .range() pages is undefined,
      // so a >1000-row pull could skip or duplicate rows across page boundaries.
      .order('local_id', { ascending: true })
      .range(from, from + PULL_PAGE - 1);
    if (error) return null;
    if (data && data.length) allData.push(...data);
    if (!data || data.length < PULL_PAGE) break;
    from += PULL_PAGE;
  }
  // Cloud soft-delete partition (receipts + transactions only): a row with
  // deleted_at set is an authoritative CLOUD TOMBSTONE — exclude it from the
  // merge set and surface its local_id so pullAll can delete + durably tombstone
  // the local copy.
  const remoteDeletedIds = new Set<string>();
  let live = allData;
  if (opts?.softDelete) {
    live = allData.filter((r: any) => {
      if (r.deleted_at) {
        if (r.local_id) remoteDeletedIds.add(r.local_id);
        return false;
      }
      return true;
    });
  }
  const filtered = live.filter(
    (r: any) => !r.local_id || !tombstoneIds?.has(r.local_id),
  );
  const remote = filtered.map(fromRemote);
  const ids = new Set<string>(filtered.map((r: any) => r.local_id).filter(Boolean));
  return { remote, remoteLocalIds: ids, remoteDeletedIds };
}

async function deleteTombstones(
  table: string,
  userId: string,
  ids: string[] | undefined,
): Promise<boolean> {
  if (!ids || ids.length === 0) return true;
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('user_id', userId)
    .in('local_id', ids);
  if (error) {
    if (__DEV__) console.warn(`[personalSync] tombstone delete ${table} failed:`, error.message);
    return false;
  }
  return true;
}

// B3: SOFT delete (set deleted_at) instead of a hard DELETE — receipts and
// transactions only. A hard DELETE leaves NO cloud record, so a device that still
// holds the row (and hasn't pulled) would re-upsert and resurrect it once the
// local tombstone TTL expires. A deleted_at tombstone is durable in the cloud:
// every other device learns of the deletion on its next pull. This closes the
// "authoritative cloud tombstone (audit doc 05, later phase)" gap for these two
// tables. (A re-upsert from a stale device omits deleted_at from its payload, so
// PostgREST's ON CONFLICT DO UPDATE never clears the tombstone.)
async function softDeleteTombstones(
  table: string,
  userId: string,
  ids: string[] | undefined,
): Promise<boolean> {
  if (!ids || ids.length === 0) return true;
  const { error } = await supabase
    .from(table)
    .update({ deleted_at: new Date().toISOString() })
    .eq('user_id', userId)
    .in('local_id', ids);
  if (error) {
    if (__DEV__) console.warn(`[personalSync] soft-delete ${table} failed:`, error.message);
    return false;
  }
  return true;
}

async function upsertBatch(table: string, rows: any[]): Promise<boolean> {
  if (rows.length === 0) return true;
  // Chunk to stay under PostgREST request-body limits for heavy users.
  const CHUNK = 500;
  let allOk = true;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from(table).upsert(slice, { onConflict: 'user_id,local_id' });
    if (error) {
      // Capture in production too — a swallowed push failure silently diverges devices.
      console.warn(`[personalSync] upsert ${table} chunk ${i / CHUNK} failed:`, error.message);
      // A missing-column / schema-cache error means the remote DB schema is out of
      // sync with the app (migrations not applied). Auto-disable personal sync so it
      // STOPS running against a broken backend — protects local data from further
      // round-trips until the schema is migrated and sync is re-enabled deliberately.
      const msg = error.message || '';
      if ((error as any).code === 'PGRST204' || /could not find|schema cache|column/i.test(msg)) {
        try {
          useSettingsStore.getState().setPersonalSyncEnabled(false);
          useSettingsStore.getState().setLastPersonalSyncError?.('schema');
          console.warn('[personalSync] DISABLED personal sync — remote schema is incomplete. Re-enable only after the Supabase migrations are applied.');
        } catch {}
        // Schema is broken for the ENTIRE table — the remaining chunks would hit the
        // same missing column, so stop early.
        return false;
      }
      // A DATA-level error (e.g. a single constraint-violating row) fails only THIS
      // chunk. Keep going so one poison row can't starve every record in the LATER
      // chunks; still report the batch as failed so the sync clock doesn't advance
      // and the whole push is retried next cycle.
      allOk = false;
    }
  }
  return allOk;
}

// NOTE: the old `deleteMissing` set-difference delete was REMOVED. It could
// permanently delete another device's just-created cloud rows it simply hadn't
// pulled yet (the #1 critical data-loss bug). Remote deletes are now driven
// EXCLUSIVELY by explicit tombstones (deleteTombstones). Propagating a delete to
// a device that still holds the row locally will be restored via an authoritative
// cloud tombstone table (audit doc 05, later phase).

// ─── Pull all + merge into stores ─────────────────────────────────────────────
async function pullAll(userId: string): Promise<boolean> {
  try {
    const p = usePersonalStore.getState();
    const w = useWalletStore.getState();
    const d = useDebtStore.getState();
    const r = useReceiptStore.getState();
    const s = useSavingsStore.getState();
    const n = useNotesStore.getState();

    // Durable tombstones survive push/clear cycles — the single source of truth
    // for "was this item deleted locally?". The ephemeral _deleted*Ids are still
    // used for the push phase (remote DELETE), but for pull filtering we use the
    // durable set which is a superset.
    const durableTombstones = useTombstoneStore.getState().allTombstonedIds();

    // Merge ephemeral + durable for each entity type (durable is a superset,
    // but include ephemeral for completeness in case tombstoneStore hasn't
    // persisted yet on a fresh delete).
    const mergeTs = (ephemeral: string[] | undefined): Set<string> => {
      const merged = new Set(durableTombstones);
      if (ephemeral) for (const id of ephemeral) merged.add(id);
      return merged;
    };

    const tsTx = mergeTs(p._deletedTransactionIds);
    const tsSub = mergeTs(p._deletedSubscriptionIds);
    const tsBud = mergeTs(p._deletedBudgetIds);
    const tsGoal = mergeTs(p._deletedGoalIds);
    const tsWallet = mergeTs(w._deletedWalletIds);
    const tsTransfer = mergeTs(w._deletedTransferIds);
    const tsDebt = mergeTs(d._deletedDebtIds);
    const tsSplit = mergeTs(d._deletedSplitIds);
    const tsContact = mergeTs(d._deletedContactIds);
    const tsSavings = mergeTs(s._deletedSavingsIds);
    const tsReceipt = mergeTs(r._deletedReceiptIds);
    const tsNote = mergeTs(n._deletedNoteIds);

    const [
      transactions,
      wallets,
      transfers,
      subscriptions,
      budgets,
      goals,
      debts,
      splits,
      contacts,
      savings,
      receipts,
      notes,
    ] = await Promise.all([
      // transactions + receipts are soft-delete-aware (deleted_at cloud tombstones)
      pullTable('personal_transactions', userId, txFromRemote, tsTx, { softDelete: true }),
      pullTable('personal_wallets', userId, walletFromRemote, tsWallet),
      pullTable('personal_wallet_transfers', userId, transferFromRemote, tsTransfer),
      pullTable('personal_subscriptions', userId, subFromRemote, tsSub),
      pullTable('personal_budgets', userId, budgetFromRemote, tsBud),
      pullTable('personal_goals', userId, goalFromRemote, tsGoal),
      pullTable('personal_debts', userId, debtFromRemote, tsDebt),
      pullTable('personal_splits', userId, splitFromRemote, tsSplit),
      pullTable('personal_contacts', userId, contactFromRemote, tsContact),
      pullTable('personal_savings_accounts', userId, savingsFromRemote, tsSavings),
      pullTable('personal_receipts', userId, receiptFromRemote, tsReceipt, { softDelete: true }),
      pullTable('personal_notes', userId, noteFromRemote, tsNote),
    ]);

    if (!transactions || !wallets || !transfers || !subscriptions || !budgets || !goals || !debts || !splits || !contacts || !savings || !receipts || !notes) {
      if (__DEV__) console.warn('[personalSync] pullAll: one or more tables failed to fetch');
      return false;
    }

    // Re-read snapshot post-fetch so local edits during pull aren't lost
    const personalState = usePersonalStore.getState();
    const walletState = useWalletStore.getState();
    const debtState = useDebtStore.getState();
    const receiptState = useReceiptStore.getState();
    const savingsState = useSavingsStore.getState();
    const notesState = useNotesStore.getState();

    // B3: apply CLOUD soft-delete tombstones. A remote receipt/transaction row
    // with deleted_at set means another device deleted it — record a DURABLE local
    // tombstone (so it survives this device's tombstone TTL and can never resurrect)
    // and fold the ids into allDeletedIds so mergeById both refuses to re-add them
    // AND drops any local copy this device still holds.
    const cloudDeletedIds = new Set<string>([
      ...transactions.remoteDeletedIds,
      ...receipts.remoteDeletedIds,
    ]);
    if (cloudDeletedIds.size > 0) {
      useTombstoneStore.getState().addTombstones([...cloudDeletedIds]);
    }

    // All tombstoned IDs — durable + ephemeral + cloud soft-deletes combined. Used
    // by mergeById to prevent resurrecting (and to locally remove) deleted items.
    const allDeletedIds = new Set<string>([...durableTombstones, ...cloudDeletedIds]);

    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    const newer = (a: any, b: any) =>
      (b.updatedAt?.getTime?.() ?? 0) >= (a.updatedAt?.getTime?.() ?? 0) ? b : a;
    // First value that's actually present. Unlike `??`, this treats '' as empty —
    // so an empty remote field can NEVER blank a real local one (descriptions etc.).
    const keep = (...vals: any[]) => vals.find((v) => v !== undefined && v !== null && v !== '');

    // Union nested money arrays (payments / contributions / snapshots) by stable
    // child id so a concurrent edit on another device can NEVER silently drop one
    // (whole-row LWW would). On a genuine id conflict keep the copy with the
    // longer editLog (more edits = newer).
    const childUnion = <C extends { id: string; editLog?: any[] }>(a: C[] = [], b: C[] = []): C[] => {
      const m = new Map<string, C>();
      for (const x of a) m.set(x.id, x);
      for (const x of b) {
        const ex = m.get(x.id);
        if (!ex || (x.editLog?.length ?? 0) > (ex.editLog?.length ?? 0)) m.set(x.id, x);
      }
      return Array.from(m.values());
    };
    // Append-only-safe merges: scalar fields by LWW, children UNIONED, derived
    // totals recomputed from the merged children (matches the store formulas).
    const mergeDebt = (l: Debt, r: Debt): Debt => {
      const base = newer(l, r);
      const payments = childUnion(l.payments ?? [], r.payments ?? []);
      const paidAmount = round2(Math.min(base.totalAmount, payments.reduce((s: number, p: any) => s + (p.amount || 0), 0)));
      const status = paidAmount >= base.totalAmount ? 'settled' : paidAmount > 0 ? 'partial' : 'pending';
      // These fields aren't carried in the remote schema yet — keep the local value
      // so a pull can't drop a debt's grouping/description and hide it from the list.
      return {
        ...base, payments, paidAmount, status,
        groupId: keep(base.groupId, l.groupId, r.groupId),
        description: keep(base.description, l.description, r.description) ?? '',
        category: keep(base.category, l.category, r.category),
        // walletId is carried through sync at runtime (debtFromRemote sets it) but
        // isn't declared on the Debt interface — read it off-type, params stay typed.
        walletId: keep((base as any).walletId, (l as any).walletId, (r as any).walletId),
        mode: keep(base.mode, l.mode, r.mode) ?? 'personal',
        isArchived: base.isArchived ?? l.isArchived,
        archivedAt: base.archivedAt ?? l.archivedAt,
        editLog: (base.editLog && base.editLog.length) ? base.editLog : (l.editLog ?? r.editLog),
        contact: (base.contact && base.contact.name) ? base.contact : (l.contact ?? r.contact),
      } as Debt;
    };
    const mergeGoal = (l: Goal, r: Goal): Goal => {
      const base = newer(l, r);
      const contributions = childUnion(l.contributions ?? [], r.contributions ?? []);
      const currentAmount = round2(contributions.reduce((s: number, c: any) => s + (c.amount || 0), 0));
      // icon/color/iconName/imageUri/category aren't round-tripped through Supabase
      // yet — keep the local values so a pull can't blank a goal's look.
      return {
        ...base, contributions, currentAmount,
        icon: keep(base.icon, l.icon, r.icon),
        color: keep(base.color, l.color, r.color),
        // iconName isn't on the Goal interface — read it off-type, params stay typed.
        iconName: keep((base as any).iconName, (l as any).iconName, (r as any).iconName),
        imageUri: keep(base.imageUri, l.imageUri, r.imageUri),
        category: keep(base.category, l.category, r.category),
      } as Goal;
    };
    // B2: LWW scalars, but NEVER clobber this device's local image reference.
    // imageUri is a device-local file path (receiptFromRemote leaves it undefined),
    // and remoteImagePath is the shared bucket path — keep whichever side has each
    // so a cross-device pull can't blank a receipt's image on this device.
    const mergeReceipt = (l: SavedReceipt, r: SavedReceipt): SavedReceipt => {
      const base = newer(l, r);
      return {
        ...base,
        imageUri: keep(base.imageUri, l.imageUri, r.imageUri),
        remoteImagePath: keep(base.remoteImagePath, l.remoteImagePath, r.remoteImagePath),
      } as SavedReceipt;
    };
    const mergeSavings = (l: SavingsAccount, r: SavingsAccount): SavingsAccount => {
      const base = newer(l, r);
      const dateMs = (d: any) => new Date(d).getTime(); // Date objects OR ISO strings
      // Union snapshots by id (whole-row LWW would drop one recorded on the other
      // device), then sort ASCENDING by date. childUnion returns them in insertion
      // order (local first, remote-only appended), but every consumer reads
      // history[history.length - 1] as the LATEST snapshot (stale-date detection,
      // Echo's "last updated", month-start baselines for gain math) — so an unsorted
      // array can surface an OLDER snapshot as "latest" after a multi-device merge.
      const history = childUnion<any>(l.history ?? [], r.history ?? []);
      history.sort((a: any, b: any) => dateMs(a.date) - dateMs(b.date));
      let currentValue = base.currentValue;
      if (history.length) {
        const latest = history.reduce((a: any, b: any) =>
          (dateMs(b.date) > dateMs(a.date) ? b : a));
        currentValue = latest.value;
      }
      // Cost basis is a RUNNING field: basis = seed + Σ(capital moves in history).
      // Both devices' deposit/withdrawal snapshots are already in the merged,
      // date-sorted history, so RE-DERIVE the basis from it — plain LWW would keep
      // only one device's basis and corrupt gain/return after concurrent capital
      // moves. Reconstruct each side's seed (basis minus its own capital moves); if
      // they agree use it, else fall back to the newer row's seed (a rare "put in"
      // edit conflict — a per-field edit timestamp would be the full fix, deferred).
      const sortAsc = (h: any[]) => [...(h ?? [])].sort((x: any, y: any) => dateMs(x.date) - dateMs(y.date));
      const seedOf = (acc: SavingsAccount) => roundMoney(acc.initialInvestment - replayCapitalMoves(sortAsc(acc.history)));
      const seedL = seedOf(l), seedR = seedOf(r);
      const seed = seedL === seedR ? seedL : seedOf(base);
      const initialInvestment = roundMoney(Math.max(0, seed + replayCapitalMoves(history)));
      // target / annualRate are user preferences (not money-critical), so keep plain
      // LWW from `base` until per-field edit timestamps ship.
      return { ...base, history, currentValue, initialInvestment } as SavingsAccount;
    };
    // Subscriptions carry paymentHistory (each entry ↔ a wallet debit + expense
    // transaction), so whole-row LWW would silently drop a payment recorded on
    // another device. mergeSubscription (pure, in personalSyncMappers) unions the
    // history and re-derives the schedule — see its comment for the full rationale.

    // skew-tolerant LWW: near-ties (within the window) fall back to a stable
    // deterministic tiebreak (higher id wins) so a slightly-fast device clock
    // can't silently invert which edit wins.
    const SKEW_MS = 2000;
    const remoteWinsScalar = (existing: any, r: any) => {
      const re = r.updatedAt?.getTime?.() ?? 0;
      const ex = existing.updatedAt?.getTime?.() ?? 0;
      if (Math.abs(re - ex) <= SKEW_MS) return String(r.id) > String(existing.id);
      return re > ex;
    };

    const mergeById = <T extends { id: string; updatedAt?: Date }>(
      local: T[],
      remote: T[],
      mergeFn?: (l: T, r: T) => T,
    ): T[] => {
      const map = new Map<string, T>();
      // Skip locally-tombstoned rows too: a durable tombstone (or a cloud
      // soft-delete folded into allDeletedIds) must REMOVE the local copy, not
      // just block the remote from re-adding it.
      for (const l of local) { if (allDeletedIds.has(l.id)) continue; map.set(l.id, l); }
      for (const r of remote) {
        if (allDeletedIds.has(r.id)) continue;
        const existing = map.get(r.id);
        if (!existing) { map.set(r.id, r); continue; }
        if (mergeFn) {
          map.set(r.id, mergeFn(existing, r));
        } else if (remoteWinsScalar(existing, r)) {
          map.set(r.id, r);
        }
      }
      return Array.from(map.values());
    };

    // Enforce the one-budget-per-category invariant that addBudget guarantees
    // locally but mergeById (keyed by id) can violate when two devices create the
    // same category. Keep the most-recently-edited budget per category and tombstone
    // the losers (delete remotely + block re-pull) — else the hero double-counts
    // both allocation and spend, and duplicate rings render.
    const mergedBudgets = mergeById(personalState.budgets, budgets.remote);
    const budgetWinners = new Map<string, (typeof mergedBudgets)[number]>();
    const budgetLoserIds: string[] = [];
    for (const b of mergedBudgets) {
      const key = (b.category ?? '').toLowerCase();
      const cur = budgetWinners.get(key);
      if (!cur) { budgetWinners.set(key, b); continue; }
      const bWins = remoteWinsScalar(cur as any, b as any); // b newer than cur? (latest edit, id tie-break)
      if (bWins) { budgetLoserIds.push(cur.id); budgetWinners.set(key, b); }
      else { budgetLoserIds.push(b.id); }
    }

    usePersonalStore.setState({
      transactions: mergeById(personalState.transactions, transactions.remote),
      subscriptions: mergeById(personalState.subscriptions, subscriptions.remote, mergeSubscription),
      budgets: Array.from(budgetWinners.values()),
      goals: mergeById(personalState.goals, goals.remote, mergeGoal),
      ...(budgetLoserIds.length
        ? { _deletedBudgetIds: [...(personalState._deletedBudgetIds ?? []), ...budgetLoserIds] }
        : {}),
    });
    if (budgetLoserIds.length) useTombstoneStore.getState().addTombstones(budgetLoserIds);

    useWalletStore.setState({
      wallets: mergeById(walletState.wallets, wallets.remote),
      transfers: mergeById(walletState.transfers, transfers.remote),
    });

    useDebtStore.setState({
      debts: mergeById(debtState.debts, debts.remote, mergeDebt),
      splits: mergeById(debtState.splits, splits.remote),
      contacts: mergeById(debtState.contacts, contacts.remote),
    });

    useReceiptStore.setState({
      receipts: mergeById(receiptState.receipts, receipts.remote, mergeReceipt),
    });

    useSavingsStore.setState({
      accounts: mergeById(savingsState.accounts, savings.remote, mergeSavings),
    });

    // Notes: whole-row LWW by updatedAt (client_edit_at). content + formatting +
    // extractions travel together, so a restored note keeps its rich text. Concurrent
    // multi-device edits are LWW for now — see docs/multi-device.md.
    useNotesStore.setState({
      pages: mergeById(notesState.pages, notes.remote),
    });

    // B1 (pull side): hydrate the local image file for receipts synced from
    // another device (they carry remoteImagePath but have no on-device photo yet).
    // Best-effort + idempotent — a failure just retries next sync. Set imageUri
    // WITHOUT bumping updatedAt (a local file cache hydration is not a user edit,
    // so it must not win LWW or force a re-push).
    for (const rec of useReceiptStore.getState().receipts) {
      const remotePath = rec.remoteImagePath;
      if (!remotePath) continue;
      let needsFetch = !rec.imageUri;
      if (!needsFetch && rec.imageUri && !/^https?:\/\//i.test(rec.imageUri)) {
        // A local reference exists — verify the file is still there (iOS re-installs
        // move the sandbox, orphaning absolute paths). Re-fetch if it's gone.
        const resolved = resolveReceiptImageUri(rec.imageUri);
        if (resolved) {
          try {
            const info = await FileSystem.getInfoAsync(resolved);
            needsFetch = !info.exists;
          } catch {
            needsFetch = true;
          }
        }
      }
      if (!needsFetch) continue;
      const localRel = await ensureLocalReceiptImage(remotePath, rec.id);
      if (localRel) {
        useReceiptStore.setState((state) => ({
          receipts: state.receipts.map((x) =>
            x.id === rec.id ? { ...x, imageUri: localRel } : x,
          ),
        }));
      }
    }

    return true;
  } catch (e: any) {
    if (__DEV__) console.warn('[personalSync] pullAll exception:', e?.message);
    return false;
  }
}

// ─── Push each table ──────────────────────────────────────────────────────────
async function pushAll(userId: string): Promise<boolean> {
  const p = usePersonalStore.getState();
  const w = useWalletStore.getState();
  const d = useDebtStore.getState();
  const r = useReceiptStore.getState();
  const s = useSavingsStore.getState();
  const n = useNotesStore.getState();

  // 1) Explicit tombstone deletes first — authoritative against zombies
  const tombstones: Array<[string, string[] | undefined]> = [
    ['personal_transactions', p._deletedTransactionIds],
    ['personal_subscriptions', p._deletedSubscriptionIds],
    ['personal_budgets', p._deletedBudgetIds],
    ['personal_goals', p._deletedGoalIds],
    ['personal_wallets', w._deletedWalletIds],
    ['personal_wallet_transfers', w._deletedTransferIds],
    ['personal_debts', d._deletedDebtIds],
    ['personal_splits', d._deletedSplitIds],
    ['personal_contacts', d._deletedContactIds],
    ['personal_savings_accounts', s._deletedSavingsIds],
    ['personal_receipts', r._deletedReceiptIds],
    ['personal_notes', n._deletedNoteIds],
  ];
  // Receipts + transactions SOFT-delete (deleted_at) so the deletion survives in
  // the cloud and propagates to other devices; every other table keeps the hard
  // DELETE (their zombie protection is the durable local tombstone store).
  const SOFT_DELETE_TABLES = new Set(['personal_transactions', 'personal_receipts']);
  const tombResults = await Promise.all(
    tombstones.map(([table, ids]) =>
      SOFT_DELETE_TABLES.has(table)
        ? softDeleteTombstones(table, userId, ids)
        : deleteTombstones(table, userId, ids),
    ),
  );

  // 1.5) B1: upload personal receipt images to Supabase Storage BEFORE upserting
  //      receipt rows. For each local receipt that has a resolvable ON-DEVICE image
  //      but no remoteImagePath yet, upload it and record the bucket path on the
  //      local store. Best-effort — a failed upload just leaves remoteImagePath
  //      unset for the next cycle; skip receipts whose image is already remote (http).
  for (const rec of r.receipts ?? []) {
    if (rec.remoteImagePath) continue;
    const localUri = resolveReceiptImageUri(rec.imageUri);
    if (!localUri || /^https?:\/\//i.test(localUri)) continue;
    const path = await uploadReceiptImage(localUri, userId, rec.id);
    if (path) useReceiptStore.getState().updateReceipt(rec.id, { remoteImagePath: path });
  }
  // Re-read receipts so the upsert below carries any freshly-set remoteImagePath.
  const receiptsForPush = useReceiptStore.getState().receipts ?? [];

  // 2) Upsert current state (chunked; track success). A swallowed push failure
  //    must NOT advance the sync clock or trigger reconcile/tombstone-clear.
  const upsertResults = await Promise.all([
    upsertBatch('personal_transactions', p.transactions.map((t) => txToRemote(userId, t))),
    upsertBatch('personal_wallets', w.wallets.map((x) => walletToRemote(userId, x))),
    upsertBatch('personal_wallet_transfers', (w.transfers ?? []).map((x) => transferToRemote(userId, x))),
    upsertBatch('personal_subscriptions', p.subscriptions.map((x) => subToRemote(userId, x))),
    upsertBatch('personal_budgets', p.budgets.map((x) => budgetToRemote(userId, x))),
    upsertBatch('personal_goals', p.goals.map((x) => goalToRemote(userId, x))),
    upsertBatch('personal_debts', d.debts.map((x) => debtToRemote(userId, x))),
    upsertBatch('personal_splits', d.splits.map((x) => splitToRemote(userId, x))),
    upsertBatch('personal_contacts', d.contacts.map((x) => contactToRemote(userId, x))),
    upsertBatch('personal_savings_accounts', s.accounts.map((x) => savingsToRemote(userId, x))),
    upsertBatch('personal_receipts', receiptsForPush.map((x) => receiptToRemote(userId, x))),
    upsertBatch('personal_notes', n.pages.map((x) => noteToRemote(userId, x))),
  ]);
  const allUpsertsSucceeded = upsertResults.every((ok) => ok);

  // 3) Remote deletes are tombstone-driven ONLY now (the unsafe set-difference
  //    "deleteMissing" was removed). Clear ephemeral tombstones only if BOTH
  //    their deletes AND every upsert succeeded — so a failed push is retried.
  const allTombstonesSucceeded = tombResults.every((ok) => ok);
  if (allTombstonesSucceeded && allUpsertsSucceeded) {
    p.clearPersonalTombstones?.();
    w.clearWalletTombstones?.();
    d.clearDebtTombstones?.();
    r.clearReceiptTombstones?.();
    s.clearSavingsTombstones?.();
    n.clearNotesTombstones?.();
  }

  return allTombstonesSucceeded && allUpsertsSucceeded;
}

// ─── Schema preflight ─────────────────────────────────────────────────────────
// Before ANY write we verify the remote schema actually has the columns the
// mappers depend on. The 2026-06-11 loss happened because sync ran against an
// incomplete schema (missing initial_balance et al) and the mappers dropped
// fields. If a probe column is missing we DISABLE sync rather than write a lossy
// round-trip. One representative new column per table is probed (cheap; cached).
const SCHEMA_PROBES: Array<[string, string]> = [
  // Probe client_edit_at (added in 20260716000000): its presence proves the DB is
  // fully migrated (every earlier column exists too) AND that LWW's edit-time column
  // is available, so sync stays disabled on an un-migrated DB instead of erroring
  // mid-push. personal_contacts uses id-tiebreak LWW (no client_edit_at), so it
  // keeps probing an older column.
  // personal_transactions probes deleted_at (added LAST, in 20260718000000): its
  // presence proves the soft-delete migration ran — deleted_at lands on BOTH
  // personal_transactions and personal_receipts in that same migration, so the
  // soft-delete write path can never hit a missing column — AND, being newer than
  // client_edit_at, that it's migrated too.
  ['personal_transactions', 'deleted_at'],
  ['personal_notes', 'client_edit_at'],
  ['personal_wallets', 'client_edit_at'],
  ['personal_wallet_transfers', 'client_edit_at'],
  ['personal_subscriptions', 'client_edit_at'],
  ['personal_budgets', 'client_edit_at'],
  ['personal_goals', 'client_edit_at'],
  ['personal_debts', 'client_edit_at'],
  ['personal_splits', 'client_edit_at'],
  ['personal_contacts', 'is_from_phone'],
];

let _schemaVerified: boolean | null = null;
/** Re-run the schema preflight on next sync (call after applying migrations). */
export function resetPersonalSchemaCheck(): void { _schemaVerified = null; }

async function verifyPersonalSchema(): Promise<boolean> {
  if (_schemaVerified !== null) return _schemaVerified;
  for (const [table, col] of SCHEMA_PROBES) {
    const { error } = await supabase.from(table).select(col).limit(1);
    if (error) {
      console.warn(`[personalSync] schema preflight FAILED: ${table}.${col} missing — ${error.message}`);
      _schemaVerified = false;
      return false;
    }
  }
  _schemaVerified = true;
  return true;
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────
let inflight: Promise<void> | null = null;
// A mutation that requests a sync WHILE one is already inflight (i.e. after pushAll
// has snapshotted store state) would otherwise wait for the next foreground/mount
// trigger. Record that request and run exactly one more pass when the current run
// settles, so the late write is never stranded.
let _rerunRequested = false;
function scheduleRerun(): void {
  if (!_rerunRequested) return;
  _rerunRequested = false;
  // Re-enter the full orchestrator (re-checks the gates + inflight) to push the
  // late write. Fire-and-forget: any error is handled by the normal retry path.
  void syncPersonal().catch(() => {});
}

// Personal cloud sync is GATED, not hard-disabled. It runs ONLY when ALL hold:
//   1. settings.personalSyncEnabled === true (default false; forced false on
//      rehydrate — no UI enables it until personal sign-in ships)
//   2. a valid Supabase session exists
//   3. the schema preflight passes (every mapper column present remotely)
// A failed preflight (or a schema error mid-push, see upsertBatch) auto-disables
// sync. This layered guard replaced the blunt kill-switch after the 2026-06-11
// data-loss incident. See memory: personal-sync-critical-bugs.
export function syncPersonal(): Promise<void> {
  if (inflight) { _rerunRequested = true; return inflight; }
  const settings = useSettingsStore.getState();
  // Cheap SYNCHRONOUS gate — no await, so it's safe to short-circuit before we
  // claim the inflight lock.
  if (!settings.personalSyncEnabled) return Promise.resolve();

  // Claim the inflight lock SYNCHRONOUSLY — the whole gate+run body lives inside
  // this IIFE, and `inflight = settled` executes in the SAME tick as the
  // `if (inflight)` check above with no await between them. That makes the
  // re-entrancy guard a true single-threaded lock: two near-simultaneous callers
  // can never both pass the guard and run concurrent pull/pushes. Resetting the
  // trailing-rerun flag here (same tick) means it can only be armed by a genuine
  // re-entrant call while THIS run holds the lock.
  _rerunRequested = false;
  const settled = (async () => {
    const session = await getSession();
    if (!session) {
      if (_sessionExpired) {
        settings.setLastPersonalSyncError?.('session');
        console.warn('[personalSync] session expired — user must re-authenticate. Sync skipped.');
      } else if (__DEV__) {
        console.warn('[personalSync] no session — sync skipped');
      }
      return;
    }

    // Account-switch guard: if a DIFFERENT account is now signed in on this device
    // and local personal data still exists, refuse to auto-merge/push — otherwise
    // the previous account's money data leaks into (and pollutes) the new account.
    // The merge / account-switch UI resolves this explicitly.
    const lastUser = settings.lastSyncedUserId;
    if (lastUser && lastUser !== session.user.id && hasLocalPersonalData()) {
      _accountMismatch = true;
      console.warn('[personalSync] account mismatch — sync blocked pending explicit merge decision');
      return;
    }
    _accountMismatch = false;

    // Schema preflight — never write a lossy round-trip against an incomplete DB.
    const schemaOk = await verifyPersonalSchema();
    if (!schemaOk) {
      settings.setPersonalSyncEnabled(false);
      settings.setLastPersonalSyncError?.('schema');
      console.warn('[personalSync] DISABLED — remote schema incomplete. Apply the latest migrations, then re-enable.');
      return;
    }

    // Prune expired durable tombstones (>30 days) before sync
    const pruned = useTombstoneStore.getState().pruneExpired();
    if (pruned > 0 && __DEV__) {
      console.log(`[personalSync] pruned ${pruned} expired tombstones`);
    }

    const pulled = await pullAll(session.user.id);
    if (!pulled) {
      throw new Error('pull failed — aborted push to prevent data loss');
    }
    const pushed = await pushAll(session.user.id);
    if (!pushed) {
      // Surface incomplete — do NOT advance the clock, reconcile, or delete.
      _syncIncomplete = true;
      useSettingsStore.getState().setLastPersonalSyncError?.('incomplete');
      throw new Error('push incomplete — will retry; sync state not advanced');
    }
    _syncIncomplete = false;
    useSettingsStore.getState().setLastPersonalSyncAt(new Date());
    useSettingsStore.getState().setLastSyncedUserId?.(session.user.id);
    // A clean pull+push — clear any prior failure notice.
    useSettingsStore.getState().setLastPersonalSyncError?.(null);

    // Reconcile ONLY after a fully successful pull+push (never on a failed push,
    // which would otherwise compute a balance from a half-synced state).
    try {
      autoReconcileWallets();
    } catch {
      // best-effort — sync succeeded, don't fail on reconciliation error
    }
  })().finally(() => {
    inflight = null;
  });
  inflight = settled;
  // Run one more pass if a write landed mid-flight (see _rerunRequested). Attached
  // to a HANDLED continuation (both callbacks) so a rejected `settled` — which the
  // caller already catches — never surfaces as an unhandled rejection here.
  settled.then(scheduleRerun, scheduleRerun);
  return settled;
}

/** Disable sync + optionally wipe remote data (for sign-out / opt-out). */
export async function disablePersonalSync(wipeRemote = false): Promise<void> {
  const settings = useSettingsStore.getState();
  settings.setPersonalSyncEnabled(false);
  settings.setLastPersonalSyncAt(null);
  settings.setLastPersonalSyncError?.(null);

  if (!wipeRemote) return;
  const session = await getSession();
  if (!session) return;
  const userId = session.user.id;
  const tables = [
    'personal_transactions',
    'personal_wallets',
    'personal_wallet_transfers',
    'personal_subscriptions',
    'personal_budgets',
    'personal_goals',
    'personal_debts',
    'personal_splits',
    'personal_contacts',
    'personal_savings_accounts',
    'personal_receipts',
  ];
  await Promise.allSettled(
    tables.map((t) => supabase.from(t).delete().eq('user_id', userId)),
  );
}
