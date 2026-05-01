import { supabase } from './supabase';
import { usePersonalStore } from '../store/personalStore';
import { useWalletStore } from '../store/walletStore';
import { useDebtStore } from '../store/debtStore';
import { useReceiptStore } from '../store/receiptStore';
import { useSavingsStore } from '../store/savingsStore';
import { useSettingsStore } from '../store/settingsStore';
import type {
  Transaction,
  Subscription,
  Budget,
  Goal,
  Wallet,
  WalletTransfer,
  Debt,
  SplitExpense,
  Contact,
  SavingsAccount,
  SavedReceipt,
} from '../types';

// ─── Safe date parsing ────────────────────────────────────────────────────────
const sd = (v: any): Date => {
  if (!v) return new Date();
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? new Date() : d;
};

const iso = (d: any): string => {
  if (!d) return new Date().toISOString();
  if (d instanceof Date) return d.toISOString();
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const isoOrNull = (d: any): string | null => {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString();
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

// ─── Session helper ───────────────────────────────────────────────────────────
async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const expiresAt = session.expires_at ?? 0;
  if (expiresAt * 1000 < Date.now() + 60000) {
    const { data: { session: refreshed } } = await supabase.auth.refreshSession();
    return refreshed ?? session;
  }
  return session;
}

// ─── Mappers: Local → Remote ──────────────────────────────────────────────────
function txToRemote(userId: string, t: Transaction) {
  return {
    user_id: userId,
    local_id: t.id,
    amount: t.amount,
    category: t.category ?? null,
    description: t.description ?? null,
    date: iso(t.date),
    type: t.type,
    wallet_local_id: t.walletId ?? null,
    edit_log: (t.editLog ?? []).map((e) => ({
      ...e,
      editedAt: iso(e.editedAt),
    })),
    updated_at: iso(t.updatedAt),
  };
}

function walletToRemote(userId: string, w: Wallet) {
  return {
    user_id: userId,
    local_id: w.id,
    name: w.name,
    type: w.type ?? 'bank',
    balance: w.balance,
    is_default: !!w.isDefault,
    used_credit: w.usedCredit ?? null,
    credit_limit: w.creditLimit ?? null,
    color: w.color ?? null,
    icon: w.icon ?? null,
    bank_name: (w as any).bankName ?? null,
    updated_at: iso(w.updatedAt),
  };
}

function transferToRemote(userId: string, t: WalletTransfer) {
  return {
    user_id: userId,
    local_id: t.id,
    from_wallet_local_id: t.fromWalletId ?? null,
    to_wallet_local_id: t.toWalletId ?? null,
    amount: t.amount,
    date: iso(t.date),
    note: t.note ?? null,
  };
}

function subToRemote(userId: string, s: Subscription) {
  return {
    user_id: userId,
    local_id: s.id,
    name: s.name,
    amount: s.amount,
    billing_cycle: s.billingCycle ?? 'monthly',
    start_date: iso(s.startDate),
    next_billing_date: iso(s.nextBillingDate),
    category: s.category ?? null,
    wallet_local_id: (s as any).walletId ?? null,
    is_active: s.isActive ?? true,
    is_paused: !!s.isPaused,
    note: (s as any).note ?? null,
    updated_at: iso(s.updatedAt),
  };
}

function budgetToRemote(userId: string, b: Budget) {
  return {
    user_id: userId,
    local_id: b.id,
    category: b.category,
    allocated_amount: b.allocatedAmount,
    spent_amount: b.spentAmount,
    period: b.period ?? 'monthly',
    start_date: iso(b.startDate),
    end_date: isoOrNull(b.endDate),
    updated_at: iso(b.updatedAt),
  };
}

function goalToRemote(userId: string, g: Goal) {
  return {
    user_id: userId,
    local_id: g.id,
    name: g.name,
    target_amount: g.targetAmount,
    current_amount: g.currentAmount,
    deadline: isoOrNull(g.deadline),
    category: (g as any).category ?? null,
    contributions: g.contributions.map((c) => ({ ...c, date: iso(c.date) })),
    milestones: g.milestones.map((m) => ({
      ...m,
      reachedAt: m.reachedAt ? iso(m.reachedAt) : null,
    })),
    is_paused: !!g.isPaused,
    is_archived: !!g.isArchived,
    updated_at: iso(g.updatedAt),
  };
}

function debtToRemote(userId: string, d: Debt) {
  return {
    user_id: userId,
    local_id: d.id,
    contact_name: d.contact?.name ?? '',
    contact_phone: d.contact?.phone ?? null,
    type: d.type,
    total_amount: d.totalAmount,
    paid_amount: d.paidAmount,
    status: d.status,
    payments: d.payments.map((p) => ({
      ...p,
      date: iso(p.date),
      createdAt: iso(p.createdAt),
      editLog: (p.editLog ?? []).map((e) => ({ ...e, editedAt: iso(e.editedAt) })),
    })),
    due_date: isoOrNull(d.dueDate),
    note: (d as any).note ?? null,
    wallet_local_id: (d as any).walletId ?? null,
    updated_at: iso(d.updatedAt),
  };
}

function splitToRemote(userId: string, s: SplitExpense) {
  return {
    user_id: userId,
    local_id: s.id,
    title: (s as any).title ?? (s as any).description ?? 'split',
    total_amount: s.totalAmount,
    participants: s.participants,
    my_participant_id: (s as any).myParticipantId ?? null,
    category: (s as any).category ?? null,
    date: iso((s as any).date ?? s.createdAt),
    note: (s as any).note ?? null,
    updated_at: iso(s.updatedAt),
  };
}

function contactToRemote(userId: string, c: Contact) {
  return {
    user_id: userId,
    local_id: c.id,
    name: c.name,
    phone: c.phone ?? null,
    note: (c as any).note ?? null,
  };
}

function savingsToRemote(userId: string, a: SavingsAccount) {
  return {
    user_id: userId,
    local_id: a.id,
    name: a.name,
    balance: a.currentValue,
    target_amount: a.target ?? null,
    note: a.description ?? null,
    snapshots: a.history.map((h) => ({ ...h, date: iso(h.date) })),
    updated_at: iso(a.updatedAt),
  };
}

function receiptToRemote(userId: string, r: SavedReceipt) {
  return {
    user_id: userId,
    local_id: r.id,
    vendor: (r as any).vendor ?? (r as any).merchant ?? null,
    items: (r as any).items ?? [],
    total: (r as any).total ?? 0,
    date: iso((r as any).date),
    year: (r as any).year ?? null,
    my_tax_category: (r as any).myTaxCategory ?? null,
    transaction_local_id: (r as any).transactionId ?? null,
    image_url: (r as any).imageUri ?? (r as any).imageUrl ?? null,
    updated_at: iso(r.updatedAt),
  };
}

// ─── Mappers: Remote → Local ──────────────────────────────────────────────────
function txFromRemote(r: any): Transaction {
  return {
    id: r.local_id,
    amount: Number(r.amount),
    category: r.category,
    description: r.description ?? '',
    date: sd(r.date),
    type: r.type,
    mode: 'personal',
    inputMethod: 'manual',
    walletId: r.wallet_local_id ?? undefined,
    editLog: (r.edit_log ?? []).map((e: any) => ({ ...e, editedAt: sd(e.editedAt) })),
    createdAt: sd(r.created_at),
    updatedAt: sd(r.updated_at),
  } as Transaction;
}

function walletFromRemote(r: any): Wallet {
  return {
    id: r.local_id,
    name: r.name,
    type: r.type,
    balance: Number(r.balance),
    icon: r.icon ?? '',
    color: r.color ?? '',
    isDefault: !!r.is_default,
    usedCredit: r.used_credit != null ? Number(r.used_credit) : undefined,
    creditLimit: r.credit_limit != null ? Number(r.credit_limit) : undefined,
    createdAt: sd(r.created_at),
    updatedAt: sd(r.updated_at),
  };
}

function transferFromRemote(r: any): WalletTransfer {
  return {
    id: r.local_id,
    fromWalletId: r.from_wallet_local_id,
    toWalletId: r.to_wallet_local_id,
    amount: Number(r.amount),
    note: r.note ?? undefined,
    date: sd(r.date),
    createdAt: sd(r.created_at),
  };
}

function subFromRemote(r: any): Subscription {
  return {
    id: r.local_id,
    name: r.name,
    amount: Number(r.amount),
    billingCycle: r.billing_cycle,
    startDate: sd(r.start_date),
    nextBillingDate: sd(r.next_billing_date),
    category: r.category,
    isActive: !!r.is_active,
    isPaused: !!r.is_paused,
    createdAt: sd(r.created_at),
    updatedAt: sd(r.updated_at),
  } as Subscription;
}

function budgetFromRemote(r: any): Budget {
  return {
    id: r.local_id,
    category: r.category,
    allocatedAmount: Number(r.allocated_amount),
    spentAmount: Number(r.spent_amount),
    period: r.period,
    startDate: sd(r.start_date),
    endDate: r.end_date ? sd(r.end_date) : (undefined as any),
    createdAt: sd(r.created_at),
    updatedAt: sd(r.updated_at),
  } as Budget;
}

function goalFromRemote(r: any): Goal {
  return {
    id: r.local_id,
    name: r.name,
    targetAmount: Number(r.target_amount),
    currentAmount: Number(r.current_amount),
    deadline: r.deadline ? sd(r.deadline) : undefined,
    contributions: (r.contributions ?? []).map((c: any) => ({ ...c, date: sd(c.date) })),
    milestones: (r.milestones ?? []).map((m: any) => ({
      ...m,
      reachedAt: m.reachedAt ? sd(m.reachedAt) : undefined,
    })),
    isPaused: !!r.is_paused,
    isArchived: !!r.is_archived,
    createdAt: sd(r.created_at),
    updatedAt: sd(r.updated_at),
  } as Goal;
}

function debtFromRemote(r: any): Debt {
  return {
    id: r.local_id,
    contact: { id: 'synced', name: r.contact_name, phone: r.contact_phone ?? undefined } as any,
    type: r.type,
    totalAmount: Number(r.total_amount),
    paidAmount: Number(r.paid_amount),
    status: r.status,
    payments: (r.payments ?? []).map((p: any) => ({
      ...p,
      date: sd(p.date),
      createdAt: sd(p.createdAt),
      editLog: (p.editLog ?? []).map((e: any) => ({ ...e, editedAt: sd(e.editedAt) })),
    })),
    dueDate: r.due_date ? sd(r.due_date) : undefined,
    createdAt: sd(r.created_at),
    updatedAt: sd(r.updated_at),
  } as Debt;
}

function splitFromRemote(r: any): SplitExpense {
  return {
    id: r.local_id,
    totalAmount: Number(r.total_amount),
    participants: r.participants ?? [],
    createdAt: sd(r.created_at),
    updatedAt: sd(r.updated_at),
    ...(r.title ? { title: r.title } : {}),
    ...(r.category ? { category: r.category } : {}),
    ...(r.note ? { note: r.note } : {}),
    ...(r.date ? { date: sd(r.date) } : {}),
  } as any;
}

function contactFromRemote(r: any): Contact {
  return {
    id: r.local_id,
    name: r.name,
    phone: r.phone ?? undefined,
  } as Contact;
}

function savingsFromRemote(r: any): SavingsAccount {
  return {
    id: r.local_id,
    name: r.name,
    type: 'savings',
    currentValue: Number(r.balance),
    initialInvestment: Number(r.balance),
    target: r.target_amount != null ? Number(r.target_amount) : undefined,
    description: r.note ?? undefined,
    history: (r.snapshots ?? []).map((s: any) => ({ ...s, date: sd(s.date) })),
    createdAt: sd(r.created_at),
    updatedAt: sd(r.updated_at),
  } as SavingsAccount;
}

function receiptFromRemote(r: any): SavedReceipt {
  return {
    id: r.local_id,
    vendor: r.vendor ?? '',
    items: r.items ?? [],
    total: Number(r.total ?? 0),
    date: sd(r.date),
    year: r.year ?? new Date(r.date).getFullYear(),
    myTaxCategory: r.my_tax_category ?? null,
    transactionId: r.transaction_local_id ?? undefined,
    imageUri: r.image_url ?? undefined,
    createdAt: sd(r.created_at),
    updatedAt: sd(r.updated_at),
  } as any as SavedReceipt;
}

// ─── Generic pull / push / tombstone helpers ──────────────────────────────────
type PullResult<TLocal> = { remote: TLocal[]; remoteLocalIds: Set<string> } | null;

async function pullTable<TLocal>(
  table: string,
  userId: string,
  fromRemote: (r: any) => TLocal,
  tombstoneIds?: Set<string>,
): Promise<PullResult<TLocal>> {
  const { data, error } = await supabase.from(table).select('*').eq('user_id', userId);
  if (error) return null;
  const filtered = (data ?? []).filter(
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
    console.warn(`[personalSync] tombstone delete ${table} failed:`, error.message);
    return false;
  }
  return true;
}

async function upsertBatch(table: string, rows: any[]) {
  if (rows.length === 0) return;
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'user_id,local_id' });
  if (error) console.warn(`[personalSync] upsert ${table} failed:`, error.message);
}

async function deleteMissing(
  table: string,
  userId: string,
  localIds: Set<string>,
  syncStart: string,
) {
  const { data: remote } = await supabase
    .from(table)
    .select('local_id, updated_at')
    .eq('user_id', userId);
  if (!remote) return;
  const toDelete = (remote as any[])
    .filter((r) => r.local_id && !localIds.has(r.local_id) && r.updated_at < syncStart)
    .map((r) => r.local_id);
  if (toDelete.length === 0) return;
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('user_id', userId)
    .in('local_id', toDelete);
  if (error) console.warn(`[personalSync] delete missing ${table} failed:`, error.message);
}

// ─── Pull all + merge into stores ─────────────────────────────────────────────
async function pullAll(userId: string): Promise<boolean> {
  try {
    const p = usePersonalStore.getState();
    const w = useWalletStore.getState();
    const d = useDebtStore.getState();
    const r = useReceiptStore.getState();
    const s = useSavingsStore.getState();

    const tsTx = new Set(p._deletedTransactionIds ?? []);
    const tsSub = new Set(p._deletedSubscriptionIds ?? []);
    const tsBud = new Set(p._deletedBudgetIds ?? []);
    const tsGoal = new Set(p._deletedGoalIds ?? []);
    const tsWallet = new Set(w._deletedWalletIds ?? []);
    const tsTransfer = new Set(w._deletedTransferIds ?? []);
    const tsDebt = new Set(d._deletedDebtIds ?? []);
    const tsSplit = new Set(d._deletedSplitIds ?? []);
    const tsContact = new Set(d._deletedContactIds ?? []);
    const tsSavings = new Set(s._deletedSavingsIds ?? []);
    const tsReceipt = new Set(r._deletedReceiptIds ?? []);

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
      console.warn('[personalSync] pullAll: one or more tables failed to fetch');
      return false;
    }

    // Re-read snapshot post-fetch so local edits during pull aren't lost
    const personalState = usePersonalStore.getState();
    const walletState = useWalletStore.getState();
    const debtState = useDebtStore.getState();
    const receiptState = useReceiptStore.getState();
    const savingsState = useSavingsStore.getState();

    const mergeById = <T extends { id: string; updatedAt?: Date }>(local: T[], remote: T[]): T[] => {
      const map = new Map<string, T>();
      for (const l of local) map.set(l.id, l);
      for (const r of remote) {
        const existing = map.get(r.id);
        if (!existing) map.set(r.id, r);
        else if ((r.updatedAt?.getTime() ?? 0) > (existing.updatedAt?.getTime() ?? 0)) {
          map.set(r.id, r);
        }
      }
      return Array.from(map.values());
    };

    usePersonalStore.setState({
      transactions: mergeById(personalState.transactions, transactions.remote as any),
      subscriptions: mergeById(personalState.subscriptions, subscriptions.remote as any),
      budgets: mergeById(personalState.budgets, budgets.remote as any),
      goals: mergeById(personalState.goals, goals.remote as any),
    } as any);

    useWalletStore.setState({
      wallets: mergeById(walletState.wallets, wallets.remote as any),
      transfers: mergeById(walletState.transfers as any, transfers.remote as any) as any,
    } as any);

    useDebtStore.setState({
      debts: mergeById(debtState.debts, debts.remote as any),
      splits: mergeById(debtState.splits as any, splits.remote as any) as any,
      contacts: mergeById(debtState.contacts as any, contacts.remote as any) as any,
    } as any);

    useReceiptStore.setState({
      receipts: mergeById(receiptState.receipts as any, receipts.remote as any) as any,
    } as any);

    useSavingsStore.setState({
      accounts: mergeById(savingsState.accounts, savings.remote as any),
    } as any);

    return true;
  } catch (e: any) {
    console.warn('[personalSync] pullAll exception:', e?.message);
    return false;
  }
}

// ─── Push each table ──────────────────────────────────────────────────────────
async function pushAll(userId: string, syncStart: string) {
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

  // 2) Upsert current state
  await Promise.allSettled([
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

  // 3) Fallback "missing from local" delete — catches edits from other clients
  //    that pushed rows we never saw locally. Only after first sync.
  const lastSync = useSettingsStore.getState().lastPersonalSyncAt;
  if (lastSync) {
    await Promise.allSettled([
      deleteMissing('personal_transactions', userId, new Set(p.transactions.map((t) => t.id)), syncStart),
      deleteMissing('personal_wallets', userId, new Set(w.wallets.map((x) => x.id)), syncStart),
      deleteMissing('personal_wallet_transfers', userId, new Set((w.transfers ?? []).map((x) => x.id)), syncStart),
      deleteMissing('personal_subscriptions', userId, new Set(p.subscriptions.map((x) => x.id)), syncStart),
      deleteMissing('personal_budgets', userId, new Set(p.budgets.map((x) => x.id)), syncStart),
      deleteMissing('personal_goals', userId, new Set(p.goals.map((x) => x.id)), syncStart),
      deleteMissing('personal_debts', userId, new Set(d.debts.map((x) => x.id)), syncStart),
      deleteMissing('personal_splits', userId, new Set(d.splits.map((x) => x.id)), syncStart),
      deleteMissing('personal_contacts', userId, new Set(d.contacts.map((x) => x.id)), syncStart),
      deleteMissing('personal_savings_accounts', userId, new Set(s.accounts.map((x) => x.id)), syncStart),
      deleteMissing('personal_receipts', userId, new Set((r.receipts ?? []).map((x) => x.id)), syncStart),
    ]);
  }

  // 4) Clear tombstones only if every tombstone delete succeeded
  const allTombstonesSucceeded = tombResults.every((ok) => ok);
  if (allTombstonesSucceeded) {
    p.clearPersonalTombstones?.();
    w.clearWalletTombstones?.();
    d.clearDebtTombstones?.();
    r.clearReceiptTombstones?.();
    s.clearSavingsTombstones?.();
  }
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────
let inflight: Promise<void> | null = null;

export async function syncPersonal(): Promise<void> {
  if (inflight) return inflight;
  const settings = useSettingsStore.getState();
  if (!settings.personalSyncEnabled) return;

  const session = await getSession();
  if (!session) {
    console.warn('[personalSync] no session — sync skipped');
    return;
  }

  const run = async () => {
    const syncStart = new Date().toISOString();
    const pulled = await pullAll(session.user.id);
    if (!pulled) {
      throw new Error('pull failed — aborted push to prevent data loss');
    }
    await pushAll(session.user.id, syncStart);
    useSettingsStore.getState().setLastPersonalSyncAt(new Date());
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
