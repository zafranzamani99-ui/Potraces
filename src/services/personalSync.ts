import { supabase } from './supabase';
import { usePersonalStore } from '../store/personalStore';
import { useWalletStore } from '../store/walletStore';
import { useDebtStore } from '../store/debtStore';
import { useReceiptStore } from '../store/receiptStore';
import { useSavingsStore } from '../store/savingsStore';
import { useSettingsStore } from '../store/settingsStore';
import { useTombstoneStore } from '../store/tombstoneStore';
import { autoReconcileWallets } from '../utils/walletReconcile';
import {
  txToRemote, walletToRemote, transferToRemote, subToRemote, budgetToRemote,
  goalToRemote, debtToRemote, splitToRemote, contactToRemote, savingsToRemote, receiptToRemote,
  txFromRemote, walletFromRemote, transferFromRemote, subFromRemote, budgetFromRemote,
  goalFromRemote, debtFromRemote, splitFromRemote, contactFromRemote, savingsFromRemote, receiptFromRemote,
} from './personalSyncMappers';
import type { Debt, Goal, SavingsAccount } from '../types';

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
  return (
    p.transactions.length + p.subscriptions.length + p.budgets.length + p.goals.length +
    w.wallets.length + d.debts.length + s.accounts.length
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
type PullResult<TLocal> = { remote: TLocal[]; remoteLocalIds: Set<string> } | null;

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
      .range(from, from + PULL_PAGE - 1);
    if (error) return null;
    if (data && data.length) allData.push(...data);
    if (!data || data.length < PULL_PAGE) break;
    from += PULL_PAGE;
  }
  const filtered = allData.filter(
    (r: any) => !r.local_id || !tombstoneIds?.has(r.local_id),
  );
  const remote = filtered.map(fromRemote);
  const ids = new Set<string>(filtered.map((r: any) => r.local_id).filter(Boolean));
  return { remote, remoteLocalIds: ids };
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

async function upsertBatch(table: string, rows: any[]): Promise<boolean> {
  if (rows.length === 0) return true;
  // Chunk to stay under PostgREST request-body limits for heavy users.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from(table).upsert(slice, { onConflict: 'user_id,local_id' });
    if (error) {
      // Capture in production too — a swallowed push failure silently diverges devices.
      console.warn(`[personalSync] upsert ${table} failed:`, error.message);
      // A missing-column / schema-cache error means the remote DB schema is out of
      // sync with the app (migrations not applied). Auto-disable personal sync so it
      // STOPS running against a broken backend — protects local data from further
      // round-trips until the schema is migrated and sync is re-enabled deliberately.
      const msg = error.message || '';
      if ((error as any).code === 'PGRST204' || /could not find|schema cache|column/i.test(msg)) {
        try {
          useSettingsStore.getState().setPersonalSyncEnabled(false);
          console.warn('[personalSync] DISABLED personal sync — remote schema is incomplete. Re-enable only after the Supabase migrations are applied.');
        } catch {}
      }
      return false;
    }
  }
  return true;
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
    ] = await Promise.all([
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
    ]);

    if (!transactions || !wallets || !transfers || !subscriptions || !budgets || !goals || !debts || !splits || !contacts || !savings || !receipts) {
      if (__DEV__) console.warn('[personalSync] pullAll: one or more tables failed to fetch');
      return false;
    }

    // Re-read snapshot post-fetch so local edits during pull aren't lost
    const personalState = usePersonalStore.getState();
    const walletState = useWalletStore.getState();
    const debtState = useDebtStore.getState();
    const receiptState = useReceiptStore.getState();
    const savingsState = useSavingsStore.getState();

    // All tombstoned IDs — durable + ephemeral combined. Used by mergeById
    // to prevent resurrecting items that were deleted locally.
    const allDeletedIds = durableTombstones;

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
    const mergeSavings = (l: SavingsAccount, r: SavingsAccount): SavingsAccount => {
      const base = newer(l, r);
      const history = childUnion<any>(l.history ?? [], r.history ?? []);
      let currentValue = base.currentValue;
      if (history.length) {
        const latest = history.reduce((a: any, b: any) =>
          (new Date(b.date).getTime() > new Date(a.date).getTime() ? b : a));
        currentValue = latest.value;
      }
      return { ...base, history, currentValue } as SavingsAccount;
    };

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
      for (const l of local) map.set(l.id, l);
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

    usePersonalStore.setState({
      transactions: mergeById(personalState.transactions, transactions.remote),
      subscriptions: mergeById(personalState.subscriptions, subscriptions.remote),
      budgets: mergeById(personalState.budgets, budgets.remote),
      goals: mergeById(personalState.goals, goals.remote, mergeGoal),
    });

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
      receipts: mergeById(receiptState.receipts, receipts.remote),
    });

    useSavingsStore.setState({
      accounts: mergeById(savingsState.accounts, savings.remote, mergeSavings),
    });

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
  ];
  const tombResults = await Promise.all(
    tombstones.map(([table, ids]) => deleteTombstones(table, userId, ids)),
  );

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
    upsertBatch('personal_receipts', (r.receipts ?? []).map((x) => receiptToRemote(userId, x))),
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
  ['personal_transactions', 'playbook_links'],
  ['personal_wallets', 'initial_balance'],
  ['personal_wallet_transfers', 'kind'],
  ['personal_subscriptions', 'payment_history'],
  ['personal_budgets', 'rollover'],
  ['personal_goals', 'icon'],
  ['personal_debts', 'group_id'],
  ['personal_splits', 'items'],
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

// Personal cloud sync is GATED, not hard-disabled. It runs ONLY when ALL hold:
//   1. settings.personalSyncEnabled === true (default false; forced false on
//      rehydrate — no UI enables it until personal sign-in ships)
//   2. a valid Supabase session exists
//   3. the schema preflight passes (every mapper column present remotely)
// A failed preflight (or a schema error mid-push, see upsertBatch) auto-disables
// sync. This layered guard replaced the blunt kill-switch after the 2026-06-11
// data-loss incident. See memory: personal-sync-critical-bugs.
export async function syncPersonal(): Promise<void> {
  if (inflight) return inflight;
  const settings = useSettingsStore.getState();
  if (!settings.personalSyncEnabled) return;

  const session = await getSession();
  if (!session) {
    if (_sessionExpired) {
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
    console.warn('[personalSync] DISABLED — remote schema incomplete. Apply the latest migrations, then re-enable.');
    return;
  }

  const run = async () => {
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
      throw new Error('push incomplete — will retry; sync state not advanced');
    }
    _syncIncomplete = false;
    useSettingsStore.getState().setLastPersonalSyncAt(new Date());
    useSettingsStore.getState().setLastSyncedUserId?.(session.user.id);

    // Reconcile ONLY after a fully successful pull+push (never on a failed push,
    // which would otherwise compute a balance from a half-synced state).
    try {
      autoReconcileWallets();
    } catch {
      // best-effort — sync succeeded, don't fail on reconciliation error
    }
  };

  inflight = run().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Disable sync + optionally wipe remote data (for sign-out / opt-out). */
export async function disablePersonalSync(wipeRemote = false): Promise<void> {
  const settings = useSettingsStore.getState();
  settings.setPersonalSyncEnabled(false);
  settings.setLastPersonalSyncAt(null);

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
