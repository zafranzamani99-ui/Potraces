/**
 * personalSyncMappers — PURE local⇄remote field mappers for personal-mode sync.
 *
 * WHY THIS FILE EXISTS (and is separate from personalSync.ts):
 *   The 2026-06-11 data-loss incident was caused by mappers that silently DROPPED
 *   fields (debt.groupId/mode/description, split.items/splitMethod, goal.icon/color,
 *   wallet.initialBalance). The fix is twofold: (1) carry EVERY field both ways, and
 *   (2) make that completeness mechanically testable. A test can only run if the
 *   mappers are free of React-Native / Supabase imports — so all the shape logic
 *   lives HERE, with zero runtime dependencies (only `import type`), and is exercised
 *   by scripts/test-personal-sync-roundtrip.ts on every change.
 *
 * RULE: if you add a field to a synced type, add it to BOTH the *ToRemote and
 * *FromRemote mapper here AND add a column in the matching Supabase migration.
 * The round-trip test will FAIL until all three are in place. Do not weaken the
 * test to make it pass — that is exactly how data was lost.
 */
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
export const sd = (v: any): Date => {
  if (!v) return new Date();
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? new Date() : d;
};

export const iso = (d: any): string => {
  if (!d) return new Date().toISOString();
  if (d instanceof Date) return d.toISOString();
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

export const isoOrNull = (d: any): string | null => {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString();
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const numOrNull = (v: any): number | null => (v == null ? null : Number(v));
const numOrUndef = (v: any): number | undefined => (v == null ? undefined : Number(v));

// ─── Mappers: Local → Remote ──────────────────────────────────────────────────
export function txToRemote(userId: string, t: Transaction) {
  return {
    user_id: userId,
    local_id: t.id,
    amount: t.amount,
    category: t.category ?? null,
    description: t.description ?? null,
    date: iso(t.date),
    type: t.type,
    wallet_local_id: t.walletId ?? null,
    receipt_url: t.receiptUrl ?? null,
    tags: t.tags ?? [],
    raw_input: t.rawInput ?? null,
    input_method: t.inputMethod ?? null,
    linked_payment_id: t.linkedPaymentId ?? null,
    linked_debt_id: t.linkedDebtId ?? null,
    linked_goal_id: t.linkedGoalId ?? null,
    linked_goal_contribution_id: t.linkedGoalContributionId ?? null,
    playbook_links: t.playbookLinks ?? [],
    original_amount: numOrNull(t.originalAmount),
    original_currency: t.originalCurrency ?? null,
    fx_rate: numOrNull(t.fxRate),
    edit_log: (t.editLog ?? []).map((e) => ({ ...e, editedAt: iso(e.editedAt) })),
    updated_at: iso(t.updatedAt),
  };
}

export function walletToRemote(userId: string, w: Wallet) {
  return {
    user_id: userId,
    local_id: w.id,
    name: w.name,
    type: w.type ?? 'bank',
    balance: w.balance,
    initial_balance: w.initialBalance ?? w.balance,
    is_default: !!w.isDefault,
    used_credit: numOrNull(w.usedCredit),
    credit_limit: numOrNull(w.creditLimit),
    color: w.color ?? null,
    icon: w.icon ?? null,
    preset_id: w.presetId ?? null,
    credit_bank: w.creditBank ?? null,
    credit_network: w.creditNetwork ?? null,
    updated_at: iso(w.updatedAt),
  };
}

export function transferToRemote(userId: string, t: WalletTransfer) {
  return {
    user_id: userId,
    local_id: t.id,
    from_wallet_local_id: t.fromWalletId ?? null,
    to_wallet_local_id: t.toWalletId ?? null,
    amount: t.amount,
    date: iso(t.date),
    note: t.note ?? null,
    kind: t.kind ?? null,
    updated_at: iso((t as any).updatedAt ?? t.createdAt),
  };
}

export function subToRemote(userId: string, s: Subscription) {
  return {
    user_id: userId,
    local_id: s.id,
    name: s.name,
    amount: s.amount,
    billing_cycle: s.billingCycle ?? 'monthly',
    start_date: iso(s.startDate),
    next_billing_date: iso(s.nextBillingDate),
    category: s.category ?? null,
    wallet_local_id: s.walletId ?? null,
    is_active: s.isActive ?? true,
    is_paused: !!s.isPaused,
    note: s.note ?? null,
    reminder_days: s.reminderDays ?? null,
    is_installment: !!s.isInstallment,
    total_installments: s.totalInstallments ?? null,
    completed_installments: s.completedInstallments ?? null,
    image_uri: s.imageUri ?? null,
    icon_name: s.iconName ?? null,
    outstanding_balance: numOrNull(s.outstandingBalance),
    last_paid_at: isoOrNull(s.lastPaidAt),
    shared_sub_id: s.sharedSubId ?? null,
    payment_history: (s.paymentHistory ?? []).map((p) => ({
      ...p,
      paidAt: iso(p.paidAt),
      periodDate: iso(p.periodDate),
      undoneAt: p.undoneAt ? iso(p.undoneAt) : null,
    })),
    updated_at: iso(s.updatedAt),
  };
}

export function budgetToRemote(userId: string, b: Budget) {
  return {
    user_id: userId,
    local_id: b.id,
    category: b.category,
    allocated_amount: b.allocatedAmount,
    spent_amount: b.spentAmount,
    period: b.period ?? 'monthly',
    start_date: iso(b.startDate),
    end_date: isoOrNull(b.endDate),
    rollover: b.rollover ?? null,
    rollover_amount: numOrNull(b.rolloverAmount),
    updated_at: iso(b.updatedAt),
  };
}

export function goalToRemote(userId: string, g: Goal) {
  return {
    user_id: userId,
    local_id: g.id,
    name: g.name,
    target_amount: g.targetAmount,
    current_amount: g.currentAmount,
    deadline: isoOrNull(g.deadline),
    category: g.category ?? null,
    icon: g.icon ?? null,
    color: g.color ?? null,
    image_uri: g.imageUri ?? null,
    wallet_local_id: g.walletId ?? null,
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

export function debtToRemote(userId: string, d: Debt) {
  return {
    user_id: userId,
    local_id: d.id,
    contact_name: d.contact?.name ?? '',
    contact_phone: d.contact?.phone ?? null,
    contact_email: d.contact?.email ?? null,
    contact_local_id: d.contact?.id ?? null,
    contact_is_from_phone: d.contact ? !!d.contact.isFromPhone : null,
    type: d.type,
    total_amount: d.totalAmount,
    paid_amount: d.paidAmount,
    status: d.status,
    description: d.description ?? null,
    note: d.description ?? null, // legacy column — keep mirrored so old readers still work
    category: d.category ?? null,
    group_id: d.groupId ?? null,
    mode: d.mode ?? 'personal',
    split_id: d.splitId ?? null,
    shared_sub_id: d.sharedSubId ?? null,
    shared_sub_month: d.sharedSubMonth ?? null,
    is_archived: !!d.isArchived,
    archived_at: isoOrNull(d.archivedAt),
    payments: d.payments.map((p) => ({
      ...p,
      date: iso(p.date),
      createdAt: iso(p.createdAt),
      editLog: (p.editLog ?? []).map((e) => ({ ...e, editedAt: iso(e.editedAt) })),
    })),
    edit_log: (d.editLog ?? []).map((e) => ({ ...e, editedAt: iso(e.editedAt) })),
    due_date: isoOrNull(d.dueDate),
    wallet_local_id: (d as any).walletId ?? null,
    updated_at: iso(d.updatedAt),
  };
}

export function splitToRemote(userId: string, s: SplitExpense) {
  return {
    user_id: userId,
    local_id: s.id,
    title: s.description ?? 'split', // legacy NOT-NULL column — mirror description
    description: s.description ?? null,
    total_amount: s.totalAmount,
    split_method: s.splitMethod ?? 'custom',
    participants: (s.participants ?? []).map((p) => ({ ...p })),
    items: (s.items ?? []).map((it) => ({ ...it })),
    paid_by: s.paidBy ?? null,
    my_participant_id: (s as any).myParticipantId ?? null,
    category: s.category ?? null,
    tax_amount: numOrNull(s.taxAmount),
    tax_handling: s.taxHandling ?? null,
    linked_transaction_id: s.linkedTransactionId ?? null,
    wallet_local_id: s.walletId ?? null,
    mode: s.mode ?? 'personal',
    status: s.status ?? null,
    draft_receipt: s.draftReceipt ?? null,
    is_archived: !!s.isArchived,
    archived_at: isoOrNull(s.archivedAt),
    date: iso((s as any).date ?? s.createdAt),
    note: (s as any).note ?? null,
    updated_at: iso(s.updatedAt),
  };
}

export function contactToRemote(userId: string, c: Contact) {
  return {
    user_id: userId,
    local_id: c.id,
    name: c.name,
    phone: c.phone ?? null,
    email: c.email ?? null,
    is_from_phone: !!c.isFromPhone,
    note: (c as any).note ?? null,
  };
}

export function savingsToRemote(userId: string, a: SavingsAccount) {
  return {
    user_id: userId,
    local_id: a.id,
    name: a.name,
    balance: a.currentValue,
    initial_investment: numOrNull(a.initialInvestment),
    target_amount: numOrNull(a.target),
    note: a.description ?? null,
    account_type: a.type ?? 'savings',
    goal_name: a.goalName ?? null,
    annual_rate: numOrNull(a.annualRate),
    snapshots: a.history.map((h) => ({ ...h, date: iso(h.date) })),
    updated_at: iso(a.updatedAt),
  };
}

export function receiptToRemote(userId: string, r: SavedReceipt) {
  return {
    user_id: userId,
    local_id: r.id,
    title: r.title ?? null,
    vendor: r.vendor ?? (r as any).merchant ?? null,
    items: r.items ?? [],
    subtotal: numOrNull(r.subtotal),
    tax: numOrNull(r.tax),
    total: r.total ?? 0,
    date: iso(r.date),
    category: r.category ?? null,
    my_tax_category: r.myTaxCategory ?? null,
    payment_method: r.paymentMethod ?? null,
    location: r.location ?? null,
    wallet_local_id: r.walletId ?? null,
    verified: !!r.verified,
    year: r.year ?? null,
    transaction_local_id: r.transactionId ?? null,
    image_url: r.imageUri ?? (r as any).imageUrl ?? null,
    updated_at: iso(r.updatedAt),
  };
}

// ─── Mappers: Remote → Local ──────────────────────────────────────────────────
export function txFromRemote(r: any): Transaction {
  return {
    id: r.local_id,
    amount: Number(r.amount),
    category: r.category ?? '',
    description: r.description ?? '',
    date: sd(r.date),
    type: r.type,
    mode: 'personal',
    walletId: r.wallet_local_id ?? undefined,
    receiptUrl: r.receipt_url ?? undefined,
    tags: Array.isArray(r.tags) ? r.tags : undefined,
    rawInput: r.raw_input ?? undefined,
    inputMethod: r.input_method ?? undefined,
    linkedPaymentId: r.linked_payment_id ?? undefined,
    linkedDebtId: r.linked_debt_id ?? undefined,
    linkedGoalId: r.linked_goal_id ?? undefined,
    linkedGoalContributionId: r.linked_goal_contribution_id ?? undefined,
    playbookLinks: Array.isArray(r.playbook_links) ? r.playbook_links : undefined,
    originalAmount: numOrUndef(r.original_amount),
    originalCurrency: r.original_currency ?? undefined,
    fxRate: numOrUndef(r.fx_rate),
    editLog: (r.edit_log ?? []).map((e: any) => ({ ...e, editedAt: sd(e.editedAt) })),
    createdAt: sd(r.created_at),
    updatedAt: sd(r.updated_at),
  } as Transaction;
}

export function walletFromRemote(r: any): Wallet {
  return {
    id: r.local_id,
    name: r.name,
    type: r.type,
    balance: Number(r.balance),
    initialBalance: r.initial_balance != null ? Number(r.initial_balance) : Number(r.balance),
    icon: r.icon ?? '',
    color: r.color ?? '',
    isDefault: !!r.is_default,
    presetId: r.preset_id ?? undefined,
    creditBank: r.credit_bank ?? undefined,
    creditNetwork: r.credit_network ?? undefined,
    usedCredit: numOrUndef(r.used_credit),
    creditLimit: numOrUndef(r.credit_limit),
    createdAt: sd(r.created_at),
    updatedAt: sd(r.updated_at),
  };
}

export function transferFromRemote(r: any): WalletTransfer {
  return {
    id: r.local_id,
    fromWalletId: r.from_wallet_local_id,
    toWalletId: r.to_wallet_local_id,
    amount: Number(r.amount),
    note: r.note ?? undefined,
    kind: r.kind ?? undefined,
    date: sd(r.date),
    createdAt: sd(r.created_at),
  };
}

export function subFromRemote(r: any): Subscription {
  return {
    id: r.local_id,
    name: r.name,
    amount: Number(r.amount),
    billingCycle: r.billing_cycle,
    startDate: sd(r.start_date),
    nextBillingDate: sd(r.next_billing_date),
    category: r.category ?? '',
    walletId: r.wallet_local_id ?? undefined,
    isActive: !!r.is_active,
    isPaused: !!r.is_paused,
    note: r.note ?? undefined,
    reminderDays: r.reminder_days != null ? Number(r.reminder_days) : 3,
    isInstallment: !!r.is_installment,
    totalInstallments: r.total_installments != null ? Number(r.total_installments) : undefined,
    completedInstallments: r.completed_installments != null ? Number(r.completed_installments) : undefined,
    imageUri: r.image_uri ?? undefined,
    iconName: r.icon_name ?? undefined,
    outstandingBalance: numOrUndef(r.outstanding_balance),
    lastPaidAt: r.last_paid_at ? sd(r.last_paid_at) : undefined,
    sharedSubId: r.shared_sub_id ?? undefined,
    paymentHistory: (r.payment_history ?? []).map((p: any) => ({
      ...p,
      paidAt: sd(p.paidAt),
      periodDate: sd(p.periodDate ?? p.paidAt),
      undoneAt: p.undoneAt ? sd(p.undoneAt) : undefined,
    })),
    createdAt: sd(r.created_at),
    updatedAt: sd(r.updated_at),
  } as Subscription;
}

export function budgetFromRemote(r: any): Budget {
  return {
    id: r.local_id,
    category: r.category,
    allocatedAmount: Number(r.allocated_amount),
    spentAmount: Number(r.spent_amount),
    period: r.period,
    startDate: sd(r.start_date),
    endDate: r.end_date ? sd(r.end_date) : (undefined as any),
    rollover: r.rollover ?? undefined,
    rolloverAmount: numOrUndef(r.rollover_amount),
    createdAt: sd(r.created_at),
    updatedAt: sd(r.updated_at),
  } as Budget;
}

export function goalFromRemote(r: any): Goal {
  return {
    id: r.local_id,
    name: r.name,
    targetAmount: Number(r.target_amount),
    currentAmount: Number(r.current_amount),
    deadline: r.deadline ? sd(r.deadline) : undefined,
    category: r.category ?? '',
    icon: r.icon ?? '',
    color: r.color ?? '',
    imageUri: r.image_uri ?? undefined,
    walletId: r.wallet_local_id ?? undefined,
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

export function debtFromRemote(r: any): Debt {
  const contactKey = `${r.contact_name || ''}-${r.contact_phone || 'nophone'}`;
  return {
    id: r.local_id,
    // groupId is REQUIRED for DebtTracking to render a debt (it groups by contact).
    // Prefer the stored value; fall back to a deterministic key for rows written
    // before the group_id column existed so a pulled debt is never invisible.
    groupId: r.group_id ?? `grp-${contactKey}`,
    contact: {
      id: r.contact_local_id ?? `synced-${contactKey}`,
      name: r.contact_name,
      phone: r.contact_phone ?? undefined,
      email: r.contact_email ?? undefined,
      isFromPhone: r.contact_is_from_phone != null ? !!r.contact_is_from_phone : false,
    },
    type: r.type,
    totalAmount: Number(r.total_amount),
    paidAmount: Number(r.paid_amount),
    status: r.status,
    description: r.description ?? r.note ?? '',
    category: r.category ?? undefined,
    walletId: r.wallet_local_id ?? undefined,
    mode: r.mode ?? 'personal',
    splitId: r.split_id ?? undefined,
    sharedSubId: r.shared_sub_id ?? undefined,
    sharedSubMonth: r.shared_sub_month ?? undefined,
    isArchived: !!r.is_archived,
    archivedAt: r.archived_at ? sd(r.archived_at) : undefined,
    payments: (r.payments ?? []).map((p: any) => ({
      ...p,
      date: sd(p.date),
      createdAt: sd(p.createdAt),
      editLog: (p.editLog ?? []).map((e: any) => ({ ...e, editedAt: sd(e.editedAt) })),
    })),
    editLog: (r.edit_log ?? []).map((e: any) => ({ ...e, editedAt: sd(e.editedAt) })),
    dueDate: r.due_date ? sd(r.due_date) : undefined,
    createdAt: sd(r.created_at),
    updatedAt: sd(r.updated_at),
  } as Debt;
}

export function splitFromRemote(r: any): SplitExpense {
  return {
    id: r.local_id,
    description: r.description ?? r.title ?? '',
    totalAmount: Number(r.total_amount),
    splitMethod: r.split_method ?? 'custom',
    participants: Array.isArray(r.participants) ? r.participants : [],
    items: Array.isArray(r.items) ? r.items : [],
    paidBy: r.paid_by ?? undefined,
    category: r.category ?? undefined,
    taxAmount: numOrUndef(r.tax_amount),
    taxHandling: r.tax_handling ?? undefined,
    linkedTransactionId: r.linked_transaction_id ?? undefined,
    walletId: r.wallet_local_id ?? undefined,
    mode: r.mode ?? 'personal',
    status: r.status ?? undefined,
    draftReceipt: r.draft_receipt ?? undefined,
    isArchived: !!r.is_archived,
    archivedAt: r.archived_at ? sd(r.archived_at) : undefined,
    createdAt: sd(r.created_at),
    updatedAt: sd(r.updated_at),
  } as SplitExpense;
}

export function contactFromRemote(r: any): Contact {
  return {
    id: r.local_id,
    name: r.name,
    phone: r.phone ?? undefined,
    email: r.email ?? undefined,
    isFromPhone: !!r.is_from_phone,
  } as Contact;
}

export function savingsFromRemote(r: any): SavingsAccount {
  return {
    id: r.local_id,
    name: r.name,
    type: r.account_type ?? 'savings',
    currentValue: Number(r.balance),
    initialInvestment: r.initial_investment != null ? Number(r.initial_investment) : Number(r.balance),
    target: numOrUndef(r.target_amount),
    description: r.note ?? undefined,
    goalName: r.goal_name ?? undefined,
    annualRate: numOrUndef(r.annual_rate),
    history: (r.snapshots ?? []).map((s: any) => ({ ...s, date: sd(s.date) })),
    createdAt: sd(r.created_at),
    updatedAt: sd(r.updated_at),
  } as SavingsAccount;
}

export function receiptFromRemote(r: any): SavedReceipt {
  return {
    id: r.local_id,
    title: r.title ?? '',
    vendor: r.vendor ?? undefined,
    items: r.items ?? [],
    subtotal: numOrUndef(r.subtotal),
    tax: numOrUndef(r.tax),
    total: Number(r.total ?? 0),
    date: sd(r.date),
    category: r.category ?? '',
    myTaxCategory: r.my_tax_category ?? '',
    paymentMethod: r.payment_method ?? undefined,
    location: r.location ?? undefined,
    walletId: r.wallet_local_id ?? undefined,
    verified: !!r.verified,
    year: r.year ?? new Date(r.date).getFullYear(),
    transactionId: r.transaction_local_id ?? undefined,
    imageUri: r.image_url ?? undefined,
    createdAt: sd(r.created_at),
    updatedAt: sd(r.updated_at),
  } as any as SavedReceipt;
}
