// Personal sync is a wholly-personal module — bind `supabase` to the personal
// client so every personal_* call routes to the personal account.
import { supabasePersonal as supabase, PERSONAL_SYNC_TABLES } from './supabase';
import { usePersonalStore } from '../store/personalStore';
import { useWalletStore } from '../store/walletStore';
import { useDebtStore } from '../store/debtStore';
import { useReceiptStore } from '../store/receiptStore';
import { useSavingsStore } from '../store/savingsStore';
import { useNotesStore } from '../store/notesStore';
import { useSettingsStore } from '../store/settingsStore';
import { CLOUD_BACKUP_ENABLED, PERSONAL_SYNC_INCREMENTAL } from '../constants/flags';
import { useTombstoneStore } from '../store/tombstoneStore';
import { useBudgetProfileStore } from '../store/budgetProfileStore';
import { useCategoryStore } from '../store/categoryStore';
import { useLearningStore } from '../store/learningStore';
import { autoReconcileWallets } from '../utils/walletReconcile';
import * as FileSystem from 'expo-file-system/legacy';
import { resolveReceiptImageUri } from '../utils/receiptImage';
import { uploadReceiptImage, ensureLocalReceiptImage, removeAllPersonalReceiptImages } from './receiptImageSync';
import { reportBackupIssue } from './backupTelemetry';
import { planPushRows, planDirtyClear, type PushedSnapshot } from './personalSyncDirty';
import {
  txToRemote, walletToRemote, transferToRemote, subToRemote, budgetToRemote,
  goalToRemote, debtToRemote, splitToRemote, contactToRemote, savingsToRemote, receiptToRemote,
  txFromRemote, walletFromRemote, transferFromRemote, subFromRemote, budgetFromRemote,
  goalFromRemote, debtFromRemote, splitFromRemote, contactFromRemote, savingsFromRemote, receiptFromRemote,
  noteToRemote, noteFromRemote,
  mergeSubscription,
} from './personalSyncMappers';
// Pure conflict/merge rules — extracted to personalSyncMerge (tsx-testable, zero
// RN/store/supabase imports). Behavior identical to the old inline versions;
// mergeById now takes the tombstone set explicitly instead of a closure.
import {
  mergeById, mergeDebt, mergeGoal, mergeReceipt, mergeSavings, mergeWallet,
  dedupeBudgetsByCategory,
} from './personalSyncMerge';

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

/** True when ANY personal-mode store holds user data locally. */
export function hasLocalPersonalData(): boolean {
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

/**
 * Cheap probe: does this account hold ANY personal cloud rows? Used by the
 * restore-on-new-device prompt to avoid offering an empty "restore". One
 * head-only count query against the canonical table — no row data transferred.
 */
export async function cloudHasPersonalData(): Promise<boolean> {
  try {
    const session = await getSession();
    if (!session) return false;
    const { count, error } = await supabase
      .from('personal_transactions')
      .select('local_id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .limit(1);
    if (error) return false;
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

// ─── Mappers ─────────────────────────────────────────────────────────────────
// All local⇄remote field mappers live in ./personalSyncMappers (pure, no RN/Supabase
// imports) so they can be round-trip tested. See scripts/test-personal-sync-roundtrip.ts.

// ─── Generic pull / push / tombstone helpers ──────────────────────────────────
type PullResult<TLocal> = {
  remote: TLocal[];
  remoteLocalIds: Set<string>;
  // local_ids of rows the CLOUD reports soft-deleted (deleted_at set) — the
  // authoritative cloud tombstones. M1: populated for EVERY synced table.
  remoteDeletedIds: Set<string>;
} | null;

const PULL_PAGE = 1000;

async function pullTable<TLocal>(
  table: string,
  userId: string,
  fromRemote: (r: any) => TLocal,
  tombstoneIds?: Set<string>,
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
  // Cloud soft-delete partition (M1: ALL synced tables): a row with deleted_at
  // set is an authoritative CLOUD TOMBSTONE — exclude it from the merge set and
  // surface its local_id so pullAll can delete + durably tombstone the local copy.
  const remoteDeletedIds = new Set<string>();
  const live = allData.filter((r: any) => {
    if (r.deleted_at) {
      if (r.local_id) remoteDeletedIds.add(r.local_id);
      return false;
    }
    return true;
  });
  const filtered = live.filter(
    (r: any) => !r.local_id || !tombstoneIds?.has(r.local_id),
  );
  const remote = filtered.map(fromRemote);
  const ids = new Set<string>(filtered.map((r: any) => r.local_id).filter(Boolean));
  return { remote, remoteLocalIds: ids, remoteDeletedIds };
}

// M1: SOFT delete (set deleted_at) instead of a hard DELETE — for EVERY synced
// personal table (extended 2026-07-22 from the receipts+transactions pilot, B3).
// A hard DELETE leaves NO cloud record, so a device that still holds the row
// (and hasn't pulled) would re-upsert and resurrect it once the local tombstone
// TTL expires — and for wallet-linked rows autoReconcileWallets then re-applies
// the zombie's wallet effect (audit M1's permanent split-brain). A deleted_at
// tombstone is durable in the cloud: every other device learns of the deletion
// on its next pull. (A re-upsert from a stale device omits deleted_at from its
// payload, so PostgREST's ON CONFLICT DO UPDATE never clears the tombstone.)
// The old hard-DELETE path (deleteTombstones) was removed with M1 — cloud rows
// are now only hard-deleted by purge_personal_tombstones' retention sweep or by
// disablePersonalSync(wipeRemote).
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

// onConflict defaults to the (user_id, local_id) unique index every personal_*
// table upserts on; personal_budget_profile overrides it (single row, PK user_id).
async function upsertBatch(table: string, rows: any[], onConflict = 'user_id,local_id'): Promise<boolean> {
  if (rows.length === 0) return true;
  // Chunk to stay under PostgREST request-body limits for heavy users.
  const CHUNK = 500;
  let allOk = true;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from(table).upsert(slice, { onConflict });
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
// pulled yet (the #1 critical data-loss bug). Remote deletes are driven
// EXCLUSIVELY by explicit tombstones (softDeleteTombstones). The "authoritative
// cloud tombstone" that propagates a delete to a device still holding the row
// locally is the deleted_at column — since M1 (2026-07-22) on EVERY synced
// table, closing the audit's "later phase" gap.

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
      // M1: EVERY table is soft-delete-aware — pullTable partitions deleted_at
      // rows into remoteDeletedIds (authoritative cloud tombstones).
      pullTable('personal_transactions', userId, txFromRemote, tsTx),
      pullTable('personal_wallets', userId, walletFromRemote, tsWallet),
      pullTable('personal_wallet_transfers', userId, transferFromRemote, tsTransfer),
      pullTable('personal_subscriptions', userId, subFromRemote, tsSub),
      pullTable('personal_budgets', userId, budgetFromRemote, tsBud),
      pullTable('personal_goals', userId, goalFromRemote, tsGoal),
      pullTable('personal_debts', userId, debtFromRemote, tsDebt),
      pullTable('personal_splits', userId, splitFromRemote, tsSplit),
      pullTable('personal_contacts', userId, contactFromRemote, tsContact),
      pullTable('personal_savings_accounts', userId, savingsFromRemote, tsSavings),
      pullTable('personal_receipts', userId, receiptFromRemote, tsReceipt),
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

    // M1: apply CLOUD soft-delete tombstones from EVERY table. A remote row with
    // deleted_at set means another device deleted it — record a DURABLE local
    // tombstone (so it survives this device's tombstone TTL and can never resurrect)
    // and fold the ids into allDeletedIds so mergeById both refuses to re-add them
    // AND drops any local copy this device still holds.
    const cloudDeletedIds = new Set<string>([
      ...transactions.remoteDeletedIds,
      ...wallets.remoteDeletedIds,
      ...transfers.remoteDeletedIds,
      ...subscriptions.remoteDeletedIds,
      ...budgets.remoteDeletedIds,
      ...goals.remoteDeletedIds,
      ...debts.remoteDeletedIds,
      ...splits.remoteDeletedIds,
      ...contacts.remoteDeletedIds,
      ...savings.remoteDeletedIds,
      ...receipts.remoteDeletedIds,
      ...notes.remoteDeletedIds,
    ]);
    if (cloudDeletedIds.size > 0) {
      useTombstoneStore.getState().addTombstones([...cloudDeletedIds]);
    }

    // All tombstoned IDs — durable + ephemeral + cloud soft-deletes combined. Used
    // by mergeById to prevent resurrecting (and to locally remove) deleted items.
    const allDeletedIds = new Set<string>([...durableTombstones, ...cloudDeletedIds]);

    // Conflict/merge rules are PURE and live in ./personalSyncMerge — see that
    // file for each table's rationale (debt/goal child unions, receipt image
    // guard, savings cost-basis re-derivation, wallet field-level merge).
    // allDeletedIds is passed into every mergeById below, so a tombstoned row is
    // REMOVED from the local copy and can never be re-added by the remote side.
    const merge = { deletedIds: allDeletedIds };

    // Subscriptions carry paymentHistory (each entry ↔ a wallet debit + expense
    // transaction), so whole-row LWW would silently drop a payment recorded on
    // another device. mergeSubscription (pure, in personalSyncMappers) unions the
    // history and re-derives the schedule — see its comment for the full rationale.

    // Enforce the one-budget-per-category invariant that addBudget guarantees
    // locally but mergeById (keyed by id) can violate when two devices create the
    // same category. dedupeBudgetsByCategory keeps the most-recently-edited budget
    // per category; tombstone the losers (delete remotely + block re-pull) — else
    // the hero double-counts both allocation and spend, and duplicate rings render.
    const { winners: budgetWinners, loserIds: budgetLoserIds } =
      dedupeBudgetsByCategory(mergeById(personalState.budgets, budgets.remote, merge));

    usePersonalStore.setState({
      transactions: mergeById(personalState.transactions, transactions.remote, merge),
      subscriptions: mergeById(personalState.subscriptions, subscriptions.remote, { ...merge, mergeFn: mergeSubscription }),
      budgets: budgetWinners,
      goals: mergeById(personalState.goals, goals.remote, { ...merge, mergeFn: mergeGoal }),
      ...(budgetLoserIds.length
        ? { _deletedBudgetIds: [...(personalState._deletedBudgetIds ?? []), ...budgetLoserIds] }
        : {}),
    });
    if (budgetLoserIds.length) useTombstoneStore.getState().addTombstones(budgetLoserIds);

    useWalletStore.setState({
      // Wallets get a FIELD-LEVEL merge (money fields from the newer side,
      // cosmetic fields per-field newer-wins) instead of the old whole-row LWW —
      // see mergeWallet in personalSyncMerge for the exact rules.
      wallets: mergeById(walletState.wallets, wallets.remote, { ...merge, mergeFn: mergeWallet }),
      transfers: mergeById(walletState.transfers, transfers.remote, merge),
    });

    useDebtStore.setState({
      debts: mergeById(debtState.debts, debts.remote, { ...merge, mergeFn: mergeDebt }),
      splits: mergeById(debtState.splits, splits.remote, merge),
      contacts: mergeById(debtState.contacts, contacts.remote, merge),
    });

    useReceiptStore.setState({
      receipts: mergeById(receiptState.receipts, receipts.remote, { ...merge, mergeFn: mergeReceipt }),
    });

    useSavingsStore.setState({
      accounts: mergeById(savingsState.accounts, savings.remote, { ...merge, mergeFn: mergeSavings }),
    });

    // Notes: whole-row LWW by updatedAt (client_edit_at). content + formatting +
    // extractions travel together, so a restored note keeps its rich text. Concurrent
    // multi-device edits are LWW for now — see docs/multi-device.md.
    useNotesStore.setState({
      pages: mergeById(notesState.pages, notes.remote, merge),
    });

    // ── M2: budget profile — ONE row per user, LWW blob on client_edit_at ─────
    // Pull side: adopt the remote profile only when its client_edit_at is
    // STRICTLY newer than this device's last local edit (updatedAt, epoch ms).
    // applySyncedProfile carries the REMOTE edit time without bumping it, so a
    // pulled profile is never mistaken for a fresh local edit (no re-push loop,
    // and a later real local edit still outranks it). Push side: pushBudgetProfile.
    {
      const { data: bpRows, error: bpError } = await supabase
        .from('personal_budget_profile')
        .select('*')
        .eq('user_id', userId)
        .limit(1);
      if (bpError) {
        if (__DEV__) console.warn('[personalSync] budget-profile pull failed:', bpError.message);
        return false;
      }
      const remoteBp = bpRows?.[0];
      if (remoteBp) {
        const bp = useBudgetProfileStore.getState();
        const remoteAt = new Date(remoteBp.client_edit_at ?? remoteBp.updated_at ?? 0).getTime() || 0;
        if (remoteAt > (bp.updatedAt ?? 0)) {
          bp.applySyncedProfile({
            takeHome: remoteBp.take_home != null ? Number(remoteBp.take_home) : null,
            commitments: Array.isArray(remoteBp.commitments) ? remoteBp.commitments : [],
            modelId: remoteBp.model_id ?? null,
            updatedAt: remoteAt,
          });
        }
      }
    }

    // Custom categories — ONE row per user, LWW blob on client_edit_at. Adopt the
    // remote blob only when its client_edit_at is STRICTLY newer than this device's
    // last local edit (updatedAt). applySyncedCategories carries the REMOTE edit
    // time WITHOUT bumping it (no re-push loop) — mirrors the budget-profile block.
    {
      const { data: catRows, error: catError } = await supabase
        .from('personal_categories')
        .select('*')
        .eq('user_id', userId)
        .limit(1);
      if (catError) {
        if (__DEV__) console.warn('[personalSync] categories pull failed:', catError.message);
        return false;
      }
      const remoteCat = catRows?.[0];
      if (remoteCat && remoteCat.data && typeof remoteCat.data === 'object') {
        const c = useCategoryStore.getState();
        const remoteAt = new Date(remoteCat.client_edit_at ?? remoteCat.updated_at ?? 0).getTime() || 0;
        if (remoteAt > (c.updatedAt ?? 0)) {
          c.applySyncedCategories(remoteCat.data, remoteAt);
        }
      }
    }

    // Learned AI hints — same single-row LWW blob keyed by user_id.
    {
      const { data: learnRows, error: learnError } = await supabase
        .from('personal_learning')
        .select('*')
        .eq('user_id', userId)
        .limit(1);
      if (learnError) {
        if (__DEV__) console.warn('[personalSync] learning pull failed:', learnError.message);
        return false;
      }
      const remoteLearn = learnRows?.[0];
      if (remoteLearn && remoteLearn.data && typeof remoteLearn.data === 'object') {
        const l = useLearningStore.getState();
        const remoteAt = new Date(remoteLearn.client_edit_at ?? remoteLearn.updated_at ?? 0).getTime() || 0;
        if (remoteAt > (l.updatedAt ?? 0)) {
          l.applySyncedLearning(remoteLearn.data, remoteAt);
        }
      }
    }

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
// M2: budget profile — a single-row LWW blob keyed by user_id (the PK; there is
// no local_id). Push ONLY when this device has ever recorded a user edit
// (updatedAt set): a never-edited device must not claim the row with an empty
// profile. After pullAll adopts a newer remote blob, local updatedAt EQUALS the
// remote client_edit_at, so this re-upsert is a same-value no-op — the same
// pull-then-push convention every other table follows.
async function pushBudgetProfile(userId: string): Promise<boolean> {
  const bp = useBudgetProfileStore.getState();
  if (!bp.updatedAt) return true;
  return upsertBatch('personal_budget_profile', [{
    user_id: userId,
    take_home: bp.takeHome != null && Number.isFinite(Number(bp.takeHome)) ? Number(bp.takeHome) : null,
    commitments: bp.commitments ?? [],
    model_id: bp.modelId ?? null,
    client_edit_at: new Date(bp.updatedAt).toISOString(),
  }], 'user_id');
}

// Custom categories (overrides, custom categories, order) — a single-row LWW blob
// keyed by user_id, same convention as pushBudgetProfile. The whole persisted
// settings object travels in one `data` jsonb column, so a field can't be dropped.
// Push ONLY when this device has recorded a user edit (updatedAt set): a never-
// customised device must not claim the row with an empty blob and wipe another's.
async function pushCategories(userId: string): Promise<boolean> {
  const c = useCategoryStore.getState();
  if (!c.updatedAt) return true;
  return upsertBatch('personal_categories', [{
    user_id: userId,
    data: c.getSyncData(),
    client_edit_at: new Date(c.updatedAt).toISOString(),
  }], 'user_id');
}

// Learned AI hints (category/person/wallet/type patterns) — same single-row LWW blob.
async function pushLearning(userId: string): Promise<boolean> {
  const l = useLearningStore.getState();
  if (!l.updatedAt) return true;
  return upsertBatch('personal_learning', [{
    user_id: userId,
    data: l.getSyncData(),
    client_edit_at: new Date(l.updatedAt).toISOString(),
  }], 'user_id');
}

async function pushAll(userId: string): Promise<boolean> {
  const settings = useSettingsStore.getState();
  const p = usePersonalStore.getState();
  const w = useWalletStore.getState();
  const d = useDebtStore.getState();
  const r = useReceiptStore.getState();
  const s = useSavingsStore.getState();
  const n = useNotesStore.getState();

  // Stage 2 (dirty-only push, docs/INCREMENTAL_SYNC_PLAN.md): with the flag on,
  // upsert only dirty-tracked rows instead of re-stamping the user's entire
  // history every cycle. FULL push stays for the first sync and after an
  // account switch — only a full re-stamp guarantees convergence at those
  // moments (and it's the instant-rollback path when the flag is off).
  const incremental =
    PERSONAL_SYNC_INCREMENTAL &&
    !!settings.lastPersonalSyncAt &&
    settings.lastSyncedUserId === userId;

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
  // M1: EVERY synced table SOFT-deletes (deleted_at) so the deletion survives in
  // the cloud and propagates to every other device on its next pull. The durable
  // LOCAL tombstone store stays as belt-and-braces (it still guards this device
  // during the pull→push window and against a retention purge racing a
  // long-offline device). The old per-table hard-DELETE split is gone.
  const tombResults = await Promise.all(
    tombstones.map(([table, ids]) => softDeleteTombstones(table, userId, ids)),
  );

  // 1.5) B1: upload personal receipt images to Supabase Storage BEFORE upserting
  //      receipt rows. setRemoteImagePath deliberately does NOT dirty-mark (a
  //      cloud-applied value is not a user edit); the uploaded ids are instead
  //      force-included in this cycle's push targets below, so the bucket path
  //      still propagates immediately without infinite dirty churn.
  const uploadedImageIds: string[] = [];
  for (const rec of r.receipts ?? []) {
    if (rec.remoteImagePath) continue;
    const localUri = resolveReceiptImageUri(rec.imageUri);
    if (!localUri || /^https?:\/\//i.test(localUri)) continue;
    const path = await uploadReceiptImage(localUri, userId, rec.id);
    if (path) {
      useReceiptStore.getState().setRemoteImagePath?.(rec.id, path);
      uploadedImageIds.push(rec.id);
    }
  }
  // Re-read receipts so the upsert below carries any freshly-set remoteImagePath.
  const receiptsForPush = useReceiptStore.getState().receipts ?? [];

  // 2) Upsert this cycle's rows — incremental mode pushes dirty (∖ deleted, so
  //    a stale/deleted dirty id can never push a ghost row); full mode pushes
  //    everything live. The pushed rows are snapshotted NOW so the post-success
  //    clear can keep rows edited mid-push dirty (race-safe). A swallowed push
  //    failure must NOT advance the sync clock or trigger reconcile/clears.
  interface TableSpec {
    key: string;
    table: string;
    rows: { id: string; updatedAt?: unknown }[];
    dirtyIds?: readonly string[];
    deletedIds?: readonly string[];
    toRemote: (u: string, row: any) => any;
  }
  const specs: TableSpec[] = [
    { key: 'transactions', table: 'personal_transactions', rows: p.transactions, dirtyIds: p._dirtyTransactionIds, deletedIds: p._deletedTransactionIds, toRemote: txToRemote },
    { key: 'wallets', table: 'personal_wallets', rows: w.wallets, dirtyIds: w._dirtyWalletIds, deletedIds: w._deletedWalletIds, toRemote: walletToRemote },
    { key: 'transfers', table: 'personal_wallet_transfers', rows: w.transfers ?? [], dirtyIds: w._dirtyTransferIds, deletedIds: w._deletedTransferIds, toRemote: transferToRemote },
    { key: 'subscriptions', table: 'personal_subscriptions', rows: p.subscriptions, dirtyIds: p._dirtySubscriptionIds, deletedIds: p._deletedSubscriptionIds, toRemote: subToRemote },
    { key: 'budgets', table: 'personal_budgets', rows: p.budgets, dirtyIds: p._dirtyBudgetIds, deletedIds: p._deletedBudgetIds, toRemote: budgetToRemote },
    { key: 'goals', table: 'personal_goals', rows: p.goals, dirtyIds: p._dirtyGoalIds, deletedIds: p._deletedGoalIds, toRemote: goalToRemote },
    { key: 'debts', table: 'personal_debts', rows: d.debts, dirtyIds: d._dirtyDebtIds, deletedIds: d._deletedDebtIds, toRemote: debtToRemote },
    { key: 'splits', table: 'personal_splits', rows: d.splits, dirtyIds: d._dirtySplitIds, deletedIds: d._deletedSplitIds, toRemote: splitToRemote },
    { key: 'contacts', table: 'personal_contacts', rows: d.contacts, dirtyIds: d._dirtyContactIds, deletedIds: d._deletedContactIds, toRemote: contactToRemote },
    { key: 'savings', table: 'personal_savings_accounts', rows: s.accounts, dirtyIds: s._dirtySavingsIds, deletedIds: s._deletedSavingsIds, toRemote: savingsToRemote },
    { key: 'receipts', table: 'personal_receipts', rows: receiptsForPush, dirtyIds: [...(r._dirtyReceiptIds ?? []), ...uploadedImageIds], deletedIds: r._deletedReceiptIds, toRemote: receiptToRemote },
    { key: 'notes', table: 'personal_notes', rows: n.pages, dirtyIds: n._dirtyNoteIds, deletedIds: n._deletedNoteIds, toRemote: noteToRemote },
  ];
  const pushedByKey = new Map<string, PushedSnapshot[]>();
  const upsertResults = await Promise.all([
    ...specs.map((spec) => {
      const targets = planPushRows(spec.rows, {
        incremental,
        dirtyIds: spec.dirtyIds,
        deletedIds: spec.deletedIds,
      });
      pushedByKey.set(spec.key, targets.map((t) => ({ id: t.id, updatedAt: t.updatedAt })));
      return upsertBatch(spec.table, targets.map((x) => spec.toRemote(userId, x)));
    }),
    pushBudgetProfile(userId),
    pushCategories(userId),
    pushLearning(userId),
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

    // Stage 2 race-safe dirty clear — in BOTH modes (a full push races mid-push
    // edits too). Keep: rows edited mid-push (updatedAt moved since the
    // snapshot) and live rows marked dirty mid-push. Drop: cleanly-pushed rows
    // and ids whose row was deleted mid-push (the tombstone path owns deletes).
    const scrub = (
      store: { getState: () => any; setState: (partial: object) => void },
      dirtyKey: string,
      rowsKey: string,
      snapKey: string,
    ) => {
      const st = store.getState();
      store.setState({
        [dirtyKey]: planDirtyClear(st[dirtyKey], st[rowsKey] ?? [], pushedByKey.get(snapKey) ?? []),
      });
    };
    scrub(usePersonalStore, '_dirtyTransactionIds', 'transactions', 'transactions');
    scrub(usePersonalStore, '_dirtySubscriptionIds', 'subscriptions', 'subscriptions');
    scrub(usePersonalStore, '_dirtyBudgetIds', 'budgets', 'budgets');
    scrub(usePersonalStore, '_dirtyGoalIds', 'goals', 'goals');
    scrub(useWalletStore, '_dirtyWalletIds', 'wallets', 'wallets');
    scrub(useWalletStore, '_dirtyTransferIds', 'transfers', 'transfers');
    scrub(useDebtStore, '_dirtyDebtIds', 'debts', 'debts');
    scrub(useDebtStore, '_dirtySplitIds', 'splits', 'splits');
    scrub(useDebtStore, '_dirtyContactIds', 'contacts', 'contacts');
    scrub(useSavingsStore, '_dirtySavingsIds', 'accounts', 'savings');
    scrub(useReceiptStore, '_dirtyReceiptIds', 'receipts', 'receipts');
    scrub(useNotesStore, '_dirtyNoteIds', 'pages', 'notes');
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
  // personal_wallets probes deleted_at (added LAST, in 20260722100000 — M1+M2):
  // its presence proves the soft-delete-everywhere + budget-profile migration ran.
  // That single migration adds deleted_at to ALL remaining synced tables AND
  // creates personal_budget_profile in one transaction, so neither the universal
  // soft-delete write path nor the profile pull/push can hit a missing
  // column/table — and, being newer than client_edit_at, it proves that column
  // is migrated too. Until applied, sync stays DISABLED (safe).
  ['personal_wallets', 'deleted_at'],
  ['personal_wallet_transfers', 'client_edit_at'],
  ['personal_subscriptions', 'client_edit_at'],
  ['personal_budgets', 'client_edit_at'],
  ['personal_goals', 'client_edit_at'],
  ['personal_debts', 'client_edit_at'],
  ['personal_splits', 'client_edit_at'],
  ['personal_contacts', 'is_from_phone'],
  // personal_categories + personal_learning ship together in 20260722110000 (the
  // newest personal migration). Probing them proves that migration ran, so on an
  // un-migrated DB personal sync stays DISABLED (safe) rather than erroring on the
  // categories/learning push. One probe per new table (both created in one txn).
  ['personal_categories', 'client_edit_at'],
  ['personal_learning', 'client_edit_at'],
];

// A2: the schema verdict is cached ONLY when it's definitive. `false` used to be
// cached on ANY probe error — including a transient network blip — which then
// auto-disabled sync for the rest of the session ("Sync Now" resets backoff but
// not this cache). Verdicts:
//   'ok'        → cached; probes stop for the session.
//   'missing'   → cached; the probe DEFINITIVELY reported a missing column/table
//                 (migrations not applied — that can't fix itself mid-session,
//                 and syncPersonal disables sync on it anyway).
//   'transient' → NOT cached (_schemaVerified stays null): this cycle is skipped
//                 WITHOUT disabling sync, and the next sync re-probes.
type SchemaVerdict = 'ok' | 'missing' | 'transient';
let _schemaVerified: boolean | null = null;

/**
 * Re-run the schema preflight on the next sync. A cached 'missing' verdict is
 * deliberately session-sticky (a missing migration can't fix itself), so call
 * this after applying migrations to a LIVE session to re-enable without an app
 * restart. NOTE: since the A2 fix, transient network errors no longer poison the
 * cache, so this is NOT needed for connectivity recovery anymore — it stays
 * exported solely for the "migrations just applied, re-probe now" path (zero
 * cost to keep, and the admin/dev tooling that applies migrations should use it).
 */
export function resetPersonalSchemaCheck(): void { _schemaVerified = null; }

// Codes that DEFINITIVELY mean the probed column/table is absent:
//   42703    undefined_column (Postgres, surfaced by PostgREST for a bad select)
//   42P01    undefined_table  (Postgres)
//   PGRST204 column missing from PostgREST's schema cache
//   PGRST205 table  missing from PostgREST's schema cache
// Anything else (fetch failures, 5xx, timeouts, gateway errors) is TRANSIENT:
// fail THIS attempt only, never poison the cache. Deliberately conservative —
// when in doubt, re-probe next cycle rather than freeze sync off.
const MISSING_SCHEMA_CODES = new Set(['42703', '42P01', 'PGRST204', 'PGRST205']);
function isDefinitelyMissingSchema(error: { code?: string; message?: string }): boolean {
  if (error.code && MISSING_SCHEMA_CODES.has(error.code)) return true;
  // Message fallback for layers that strip the code — ONLY the exact
  // undefined-column/table phrasings, never generic error text.
  const msg = error.message ?? '';
  return /column .+ does not exist|relation .+ does not exist|could not find the .+ column|could not find the table/i.test(msg);
}

async function verifyPersonalSchema(): Promise<SchemaVerdict> {
  if (_schemaVerified === true) return 'ok';
  if (_schemaVerified === false) return 'missing';
  for (const [table, col] of SCHEMA_PROBES) {
    let error: { code?: string; message?: string } | null;
    try {
      ({ error } = await supabase.from(table).select(col).limit(1));
    } catch (e: any) {
      // A thrown fetch (offline, DNS, aborted) is transient by definition.
      error = { message: e?.message ?? 'network error' };
    }
    if (error) {
      if (isDefinitelyMissingSchema(error)) {
        console.warn(`[personalSync] schema preflight FAILED: ${table}.${col} missing — ${error.message}`);
        _schemaVerified = false;
        return 'missing';
      }
      console.warn(`[personalSync] schema preflight TRANSIENT error on ${table}.${col} — will re-probe next sync:`, error.message);
      return 'transient'; // _schemaVerified stays null → re-probe next cycle
    }
  }
  _schemaVerified = true;
  return 'ok';
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
//   0. CLOUD_BACKUP_ENABLED build flag (the beta lock above — the actual
//      launch gate; everything below assumes it)
//   1. settings.personalSyncEnabled === true (default false; a persisted true
//      SURVIVES rehydrate — settingsStore only coerces non-boolean values)
//   2. a valid Supabase session exists
//   3. the schema preflight passes (every mapper column present remotely)
// A failed preflight (or a schema error mid-push, see upsertBatch) auto-disables
// sync. This layered guard replaced the blunt kill-switch after the 2026-06-11
// data-loss incident. See memory: personal-sync-critical-bugs.
export function syncPersonal(): Promise<void> {
  // Beta lock — cloud backup is disabled until launch; never push/pull tester
  // data to the production DB, even if a stale personalSyncEnabled survives.
  // See constants/flags.CLOUD_BACKUP_ENABLED.
  if (!CLOUD_BACKUP_ENABLED) return Promise.resolve();
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
      reportBackupIssue('account-mismatch', 'sync blocked: signed-in account differs from last-synced account with local data present');
      console.warn('[personalSync] account mismatch — sync blocked pending explicit merge decision');
      return;
    }
    _accountMismatch = false;

    // Schema preflight — never write a lossy round-trip against an incomplete DB.
    // A2: only a DEFINITIVE missing-column/table verdict disables sync; a
    // transient probe failure just skips this cycle and re-probes on the next.
    const schemaVerdict = await verifyPersonalSchema();
    if (schemaVerdict === 'missing') {
      settings.setPersonalSyncEnabled(false);
      settings.setLastPersonalSyncError?.('schema');
      reportBackupIssue('schema-disabled', 'remote schema incomplete — sync auto-disabled');
      console.warn('[personalSync] DISABLED — remote schema incomplete. Apply the latest migrations, then re-enable.');
      return;
    }
    if (schemaVerdict === 'transient') {
      // Leave sync ENABLED and the last-error state untouched — the next sync
      // trigger (foreground/mutation/Sync Now) re-probes with a clean slate.
      console.warn('[personalSync] schema preflight unavailable (transient) — sync skipped this cycle, will retry.');
      return;
    }

    // Prune expired durable tombstones (>180 days) before sync
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
  // PERSONAL_SYNC_TABLES is the single source of truth (supabase.ts) — the
  // .eq('user_id') filter covers every table shape, including the single-row
  // budget-profile/categories/learning blobs keyed by user_id alone.
  await Promise.allSettled(
    PERSONAL_SYNC_TABLES.map((t) => supabase.from(t).delete().eq('user_id', userId)),
  );
  // Rows alone leave the receipt PHOTOS orphaned in Storage — sweep them too.
  await removeAllPersonalReceiptImages(userId);
}
