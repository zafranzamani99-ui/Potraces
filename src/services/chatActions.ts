/**
 * Chat Actions — lets MoneyChat AI execute real actions in the app.
 *
 * The AI includes [ACTION]{...}[/ACTION] blocks in its response.
 * We parse them out, execute via stores, and return confirmations.
 */

import { format } from 'date-fns';
import { usePersonalStore } from '../store/personalStore';
import { useDebtStore } from '../store/debtStore';
import { useWalletStore } from '../store/walletStore';
import { useSavingsStore } from '../store/savingsStore';
import { useAppStore } from '../store/appStore';
import { usePlaybookStore } from '../store/playbookStore';
import { syncLinkAmount } from '../utils/playbookAttribution';
import { AppMode, Transaction, Subscription, Budget, Debt } from '../types';
import { useLearningStore } from '../store/learningStore';

// ─── Action Types ────────────────────────────────────────

export type ChatActionType =
  | 'add_expense'
  | 'add_income'
  | 'add_debt'
  | 'add_subscription'
  | 'split_bill'
  | 'debt_update'
  | 'transfer'
  | 'add_goal_contribution'
  | 'cancel_subscription'
  | 'forgive_debt'
  | 'update_subscription'
  | 'add_bnpl'
  | 'repay_credit'
  | 'update_savings'
  | 'add_savings_account'
  | 'create_goal'
  | 'withdraw_goal'
  | 'delete_transaction'
  | 'edit_transaction'
  | 'add_budget'
  | 'edit_budget'
  | 'delete_budget'
  | 'delete_debt'
  | 'edit_debt'
  | 'pause_goal'
  | 'archive_goal'
  | 'delete_goal'
  | 'pause_subscription'
  | 'add_wallet';

export interface ChatAction {
  type: ChatActionType;
  amount: number;
  description: string;
  category?: string;
  wallet?: string;
  person?: string;
  debtType?: 'i_owe' | 'they_owe';
  billingCycle?: 'monthly' | 'yearly' | 'weekly' | 'quarterly';
  people?: string[];      // for split_bill
  date?: string;          // ISO date override (default: now)
  fromWallet?: string;    // for transfer
  toWallet?: string;      // for transfer
  goalName?: string;      // for add_goal_contribution
  newAmount?: number;      // for update_subscription
  creditWallet?: string;   // for add_bnpl / repay_credit
  accountName?: string;    // for update_savings / add_savings_account
  accountType?: string;    // for add_savings_account
  initialInvestment?: number; // for add_savings_account
  goalTarget?: number;     // for create_goal
  goalDeadline?: string;   // ISO date for create_goal
  goalIcon?: string;       // for create_goal
  goalColor?: string;      // for create_goal
  matchType?: 'expense' | 'income';  // for delete/edit — filter by type
  newDescription?: string; // for edit_transaction
  newCategory?: string;    // for edit_transaction
  newDate?: string;        // for edit_transaction
  deleteAll?: boolean;     // for delete_transaction — delete all matches
  budgetCategory?: string; // for budget actions — category name to match
  newPerson?: string;      // for edit_debt — rename person
  walletType?: 'bank' | 'ewallet' | 'credit'; // for add_wallet
  walletColor?: string;    // for add_wallet
  walletIcon?: string;     // for add_wallet
  amend?: boolean;         // re-emit to update an existing pending chip (same description)
  clientId?: string;       // stable id stamped when queued (id-based queue ops)
  preparedAt?: number;     // epoch ms when the chip was prepared (date honesty)
}

export interface ActionResult {
  success: boolean;
  message: string;
  action: ChatAction;
}

/** What a successful executeAction mutated, so undo can be exact. */
export interface ActionReceipt {
  transactionIds?: string[];   // txns created — undo via personalStore.deleteTransaction
  debtId?: string;
  debtIds?: string[];          // debts created (add_debt / split_bill) — undo via deleteDebt
  debtPaymentId?: string;      // payment appended (if reversible)
  subscriptionId?: string;
  // edit_transaction: pre-edit values of the fields the edit changed — undo RESTORES
  // (never deletes) via updateTransaction(id, prev), which self-reconciles the wallet.
  edited?: { id: string; prev: Partial<Transaction> };
  // delete_transaction: full snapshot(s) of what was deleted — undo re-adds them and
  // re-applies the wallet adjustment the same way the add paths do.
  deletedTransactions?: Transaction[];
}

export interface ExecuteResult {
  success: boolean;
  message: string;
  action: ChatAction;
  receipt?: ActionReceipt;     // what was mutated
  noop?: boolean;              // true => nothing saved (e.g. amount<=0); success must be false
}

const DESTRUCTIVE_ACTIONS: Set<ChatActionType> = new Set([
  'delete_transaction', 'delete_budget', 'delete_debt', 'delete_goal',
  'forgive_debt', 'transfer', 'cancel_subscription',
  'edit_transaction', 'edit_budget', 'edit_debt',
  'repay_credit', 'withdraw_goal',
]);

/** Action types the owner must tap individually — excluded from Save-All. */
export const DESTRUCTIVE_ACTION_TYPES: ReadonlySet<ChatActionType> = DESTRUCTIVE_ACTIONS;

export function isDestructiveAction(a: ChatAction): boolean {
  return DESTRUCTIVE_ACTIONS.has(a.type);
}

/**
 * Strip model-control tokens from USER-authored text so a user can't inject an
 * [ACTION] block (or a stray confirmation marker) that parseActions would later
 * pick up. parseActions only ever runs on MODEL output (see moneyChat.ts), and
 * this is the matching guard for the user side.
 */
export function sanitizeUserText(text: string): string {
  if (!text) return text;
  return text
    .replace(/\[\/?ACTION\]/gi, '')
    .trim();
}

export interface PendingAction {
  action: ChatAction;
  requiresConfirmation: boolean;
}

export function classifyActions(actions: ChatAction[]): PendingAction[] {
  return actions.map((action) => ({
    action,
    requiresConfirmation: DESTRUCTIVE_ACTIONS.has(action.type),
  }));
}

// ─── Parser ──────────────────────────────────────────────

// Action types that legitimately carry no `amount` field — used by both the
// parser (accept the block without an amount) and the executor (skip the
// amount guard). Single source of truth.
const PARSE_NO_AMOUNT_TYPES: ChatActionType[] = [
  'delete_transaction', 'edit_transaction',
  'delete_budget', 'edit_budget',
  'delete_debt', 'edit_debt',
  'forgive_debt', 'cancel_subscription', 'update_subscription',
  'pause_goal', 'archive_goal', 'delete_goal',
  'pause_subscription', 'add_wallet', 'create_goal',
];

const ACTION_REGEX = /\[ACTION\]([\s\S]*?)\[\/ACTION\]/g;

/** Strip markdown code fences that the model might wrap around JSON. */
function cleanJson(raw: string): string {
  let s = raw.trim();
  // Strip ```json ... ``` or ``` ... ```
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return s.trim();
}

/**
 * Parse [ACTION] blocks out of MODEL OUTPUT only.
 *
 * SECURITY: never run this on user-authored text. The owner's own messages must
 * not be able to inject an [ACTION] block — user input is run through
 * `sanitizeUserText` (which strips [ACTION]/[/ACTION]) before it is echoed or
 * persisted. The only callers of parseActions are on Gemini's response text
 * (moneyChat's stream display + MoneyChat's post-processing of the final reply).
 */
export function parseActions(text: string): { cleanText: string; actions: ChatAction[] } {
  const actions: ChatAction[] = [];
  const cleanText = text.replace(ACTION_REGEX, (_, json) => {
    try {
      const parsed = JSON.parse(cleanJson(json));
      if (parsed.type && (typeof parsed.amount === 'number' || PARSE_NO_AMOUNT_TYPES.includes(parsed.type))) {
        actions.push(parsed as ChatAction);
      }
    } catch (e) {
      if (__DEV__) console.warn('[ChatActions] Failed to parse action block:', json, e);
    }
    return '';
  }).trim();

  return { cleanText, actions };
}

// ─── Soft pre-save checks ────────────────────────────────
// These only INFORM the owner before they tap to save a chip — they never
// block and never change what gets saved. Used to surface a calm heads-up.

const DUP_WINDOW_MS = 48 * 60 * 60 * 1000; // 48h

const normDesc = (s?: string) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

/** Fuzzy description match that avoids 1–2 char substring false positives. */
function descMatches(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  // Only treat a substring as a match when the shorter side is meaningful
  // (>= 3 chars) — guards against "a"/"e" matching everything.
  const short = a.length <= b.length ? a : b;
  const long = short === a ? b : a;
  if (short.length < 3) return false;
  return long.includes(short);
}

/** True if a near-identical transaction was already logged in the last ~48h. */
export function isLikelyDuplicate(action: ChatAction): boolean {
  if (action.type !== 'add_expense' && action.type !== 'add_income') return false;
  if (!(action.amount > 0)) return false;
  const wantType = action.type === 'add_income' ? 'income' : 'expense';
  const target = normDesc(action.description);
  if (!target) return false;
  const now = Date.now();
  return usePersonalStore.getState().transactions.some((t) => {
    if (t.type !== wantType) return false;
    if (Math.abs(t.amount - action.amount) > 0.001) return false;
    const d = t.date instanceof Date ? t.date : new Date(t.date);
    const age = now - d.getTime();
    if (age < 0 || age > DUP_WINDOW_MS) return false;
    return descMatches(normDesc(t.description), target);
  });
}

/** True if the same add_expense/add_income is already sitting in the pending queue. */
export function isDuplicateOfPending(action: ChatAction, pending: ChatAction[]): boolean {
  if (action.type !== 'add_expense' && action.type !== 'add_income') return false;
  if (!(action.amount > 0)) return false;
  const target = normDesc(action.description);
  if (!target) return false;
  return pending.some((p) => {
    if (p === action) return false;
    if (p.clientId && action.clientId && p.clientId === action.clientId) return false;
    if (p.type !== action.type) return false;
    if (Math.abs((p.amount || 0) - action.amount) > 0.001) return false;
    return descMatches(normDesc(p.description), target);
  });
}

/** True when an expense is unusually large vs the user's recent spending. */
export function isUnusualAmount(action: ChatAction): boolean {
  if (action.type !== 'add_expense' && action.type !== 'add_bnpl') return false;
  if (!(action.amount > 0)) return false;
  const amounts = usePersonalStore.getState().transactions
    .filter((t) => t.type === 'expense' && t.amount > 0)
    .map((t) => t.amount)
    .sort((a, b) => a - b);
  let threshold = 2000;
  // Need a real sample before trusting a median (guards tiny/empty datasets).
  if (amounts.length >= 5) {
    const median = amounts[Math.floor(amounts.length / 2)];
    if (median > 0) threshold = Math.max(2000, median * 5);
  }
  return action.amount > threshold;
}

// Common Malaysian recurring merchants — nudge to "make it a subscription"
// even for a month-1 user who hasn't built 3 months of history yet.
const KNOWN_RECURRING = [
  'netflix', 'spotify', 'astro', 'unifi', 'maxis', 'celcom', 'digi', 'umobile',
  'tnb', 'air selangor', 'syabas', 'indah water', 'gym', 'youtube', 'icloud',
  'disney', 'viu', 'iflix', 'apple music', 'youtube premium', 'amazon prime',
  'adobe', 'microsoft 365', 'office 365', 'dropbox', 'notion', 'chatgpt',
  'time internet', 'yes', 'tunetalk', 'hotlink', 'xpax',
];

/** True if a description matches a well-known recurring merchant/service.
 * Short tokens (< 5 chars, e.g. "yes", "digi", "tnb") match on a whole word only
 * — never as a substring — so "yesterday lunch" no longer triggers a recurring
 * nudge. Longer tokens keep the fuzzy substring match. */
export function isKnownRecurringMerchant(description: string): boolean {
  const d = normDesc(description);
  if (!d) return false;
  const words = d.split(/\s+/);
  return KNOWN_RECURRING.some((m) =>
    m.length < 5 ? words.includes(m) : descMatches(d, m)
  );
}

/** If a description looks like a recurring expense the user keeps logging by
 * hand (appears across 2+ distinct months, OR is a known recurring merchant),
 * returns a summary (month count + median amount); else null. Used to offer
 * "make it recurring". Loosened from 3 → 2 months so it fires earlier. */
export function recurringCandidate(description: string): { months: number; amount: number } | null {
  const target = normDesc(description);
  if (target.length < 2) return null;
  const months = new Set<string>();
  const amounts: number[] = [];
  for (const t of usePersonalStore.getState().transactions) {
    if (t.type !== 'expense') continue;
    if (!descMatches(normDesc(t.description), target)) continue;
    const d = t.date instanceof Date ? t.date : new Date(t.date);
    if (isNaN(d.getTime())) continue;
    months.add(`${d.getFullYear()}-${d.getMonth()}`);
    amounts.push(t.amount);
  }
  if (amounts.length === 0) return null;
  const known = isKnownRecurringMerchant(description);
  // Known merchant nudges after a single logged month; unknown needs 2+ months.
  if (!known && months.size < 2) return null;
  amounts.sort((a, b) => a - b);
  return { months: months.size, amount: amounts[Math.floor(amounts.length / 2)] };
}

/** Heads-up reshape: does this entry read like a wallet→wallet transfer? */
export function looksLikeTransfer(a: ChatAction): boolean {
  if (a.type === 'transfer') return false; // already one
  const text = `${a.description || ''}`.toLowerCase();
  return /\b(transfer|pindah|pindahkan|move to|moved to|tukar duit)\b/.test(text);
}

/** Heads-up reshape: does this entry read like a person-debt rather than a plain txn? */
export function looksLikeDebt(a: ChatAction): boolean {
  if (a.type === 'add_debt' || a.type === 'debt_update' || a.type === 'split_bill') return false;
  const text = `${a.description || ''}`.toLowerCase();
  return /\b(owes?|owed|hutang|pinjam|pinjamkan|lend|lent|borrow|borrowed|bayar balik)\b/.test(text);
}

// ─── Wallet Resolver ─────────────────────────────────────

function findWalletId(name?: string): string | undefined {
  if (!name) return undefined;
  const wallets = useWalletStore.getState().wallets;
  const lower = name.toLowerCase();
  const match = wallets.find(
    (w) => w.name.toLowerCase() === lower || w.name.toLowerCase().includes(lower)
  );
  return match?.id;
}

// ─── Date resolver ───────────────────────────────────────

function resolveDate(dateStr?: string): Date {
  if (!dateStr) return new Date();
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
}

// ─── Target resolver (preview + disambiguation for delete/edit) ──────────

export interface ResolvedTarget {
  status: 'one' | 'many' | 'none';
  match?: { id: string; description: string; amount: number; date: Date; type: string };
  candidates?: Array<{ id: string; description: string; amount: number; date: Date; type: string }>; // when 'many', most-recent first
}

/** Resolve the saved transaction(s) a delete_transaction/edit_transaction action
 * targets, so the UI can preview the matched row before confirm and offer a pick
 * list on multiple matches. Mirrors the matching filter used by the executor. */
export function resolveTargetTransaction(a: ChatAction): ResolvedTarget {
  if (a.type !== 'delete_transaction' && a.type !== 'edit_transaction') return { status: 'none' };
  const { transactions } = usePersonalStore.getState();
  const desc = (a.description || '').toLowerCase();
  const matches = transactions
    .filter((t) => {
      if (a.matchType && t.type !== a.matchType) return false;
      if (a.amount && a.amount > 0 && Math.abs(t.amount - a.amount) > 0.01) return false;
      if (desc && !t.description.toLowerCase().includes(desc)) return false;
      if (a.date) {
        const target = resolveDate(a.date);
        const td = t.date instanceof Date ? t.date : new Date(t.date);
        if (format(target, 'yyyy-MM-dd') !== format(td, 'yyyy-MM-dd')) return false;
      }
      return true;
    })
    .map((t) => ({
      id: t.id,
      description: t.description,
      amount: t.amount,
      date: t.date instanceof Date ? t.date : new Date(t.date),
      type: t.type,
    }))
    .sort((x, y) => y.date.getTime() - x.date.getTime()); // most-recent first

  if (matches.length === 0) return { status: 'none' };
  if (matches.length === 1) return { status: 'one', match: matches[0] };
  return { status: 'many', match: matches[0], candidates: matches };
}

// ─── Budget impact helper ────────────────────────────────

function getBudgetImpact(category: string): string {
  const { budgets, transactions } = usePersonalStore.getState();
  const budget = budgets.find((b) => b.category.toLowerCase() === category.toLowerCase());
  if (!budget) return '';

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const spent = transactions
    .filter((t) => {
      const d = t.date instanceof Date ? t.date : new Date(t.date);
      return t.type === 'expense' && t.category === budget.category && d >= monthStart;
    })
    .reduce((s, t) => s + t.amount, 0);

  const left = budget.allocatedAmount - spent;
  if (left > 0) {
    return ` (${category}: RM ${spent.toFixed(0)}/${budget.allocatedAmount.toFixed(0)}, RM ${left.toFixed(0)} breathing room left)`;
  }
  return ` (${category}: RM ${spent.toFixed(0)}/${budget.allocatedAmount.toFixed(0)} — past breathing room)`;
}

// ─── ID generator ───────────────────────────────────────
let _idCounter = 0;
function uniqueId(suffix?: string): string {
  return `${Date.now()}-${++_idCounter}${suffix ? `-${suffix}` : ''}`;
}

// ─── Executor ────────────────────────────────────────────

// Types that legitimately carry no amount (lifecycle/delete/edit ops).
const NO_AMOUNT_TYPES: Set<ChatActionType> = new Set(PARSE_NO_AMOUNT_TYPES);

export function executeAction(action: ChatAction): ExecuteResult {
  const mode: AppMode = useAppStore.getState().mode;
  // Date honesty: a chip saved days after it was prepared books on the day it
  // was meant for — explicit date, else when it was prepared, else now.
  const actionDate = action.date
    ? resolveDate(action.date)
    : action.preparedAt
      ? new Date(action.preparedAt)
      : new Date();

  // Amount guard: any amount-bearing action with a missing / non-positive /
  // non-finite amount is a no-op — never report a phantom "saved RM0".
  if (!NO_AMOUNT_TYPES.has(action.type) && !(typeof action.amount === 'number' && isFinite(action.amount) && action.amount > 0)) {
    return {
      success: false,
      noop: true,
      message: 'This one needs an amount before it can be saved.',
      action,
    };
  }

  // Learn category + wallet associations from executed actions
  const learn = useLearningStore.getState();
  if (action.description && action.category) learn.learnCategory(action.description, action.category);
  if (action.description && action.wallet) learn.learnWallet(action.description, action.wallet);

  try {
    switch (action.type) {
      case 'add_expense': {
        const walletId = findWalletId(action.wallet);
        const txId = usePersonalStore.getState().addTransaction({
          amount: action.amount,
          description: action.description,
          category: action.category || 'other',
          type: 'expense',
          date: actionDate,
          mode,
          walletId,
        });
        if (walletId) useWalletStore.getState().deductFromWallet(walletId, action.amount);
        const impact = getBudgetImpact(action.category || 'other');

        // NEVER auto-attribute to a playbook — attribution is explicit opt-in.
        // Just nudge the user to link it themselves in Budget Planning.
        let pbNote = '';
        const activePbs = usePlaybookStore.getState().getActivePlaybooks();
        if (activePbs.length >= 1) {
          pbNote = ` (link it to a playbook in Budget Planning)`;
        }

        return {
          success: true,
          message: `Added expense: ${action.description} — RM ${action.amount.toFixed(2)}${impact}${pbNote}`,
          action,
          receipt: { transactionIds: txId ? [txId] : [] },
        };
      }

      case 'add_income': {
        const walletId = findWalletId(action.wallet);
        const txId = usePersonalStore.getState().addTransaction({
          amount: action.amount,
          description: action.description,
          category: action.category || 'income',
          type: 'income',
          date: actionDate,
          mode,
          walletId,
        });
        if (walletId) useWalletStore.getState().addToWallet(walletId, action.amount);
        let incomeMsg = `Added income: ${action.description} — RM ${action.amount.toFixed(2)}`;
        if (action.amount >= 500 && usePlaybookStore.getState().getActivePlaybooks().length < 2) {
          incomeMsg += `\n\nWant to track where this goes? Create a playbook in Budget Planning.`;
        }
        return {
          success: true,
          message: incomeMsg,
          action,
          receipt: { transactionIds: txId ? [txId] : [] },
        };
      }

      case 'add_debt': {
        const debtType = action.debtType || 'i_owe';
        const debtId = useDebtStore.getState().addDebt({
          contact: {
            id: uniqueId(),
            name: action.person || 'someone',
            isFromPhone: false,
          },
          type: debtType,
          totalAmount: action.amount,
          description: action.description,
          category: action.category,
          mode,
        });
        const label = debtType === 'i_owe' ? 'You owe' : 'Owed to you';
        return {
          success: true,
          message: `${label}: ${action.person || 'someone'} — RM ${action.amount.toFixed(2)} (${action.description})`,
          action,
          receipt: debtId ? { debtId, debtIds: [debtId] } : undefined,
        };
      }

      case 'add_subscription': {
        const now = actionDate;
        const cycle = action.billingCycle || 'monthly';
        const nextBilling = new Date(now);
        if (cycle === 'monthly') nextBilling.setMonth(nextBilling.getMonth() + 1);
        else if (cycle === 'quarterly') nextBilling.setMonth(nextBilling.getMonth() + 3);
        else if (cycle === 'yearly') nextBilling.setFullYear(nextBilling.getFullYear() + 1);
        else nextBilling.setDate(nextBilling.getDate() + 7);

        usePersonalStore.getState().addSubscription({
          name: action.description,
          amount: action.amount,
          billingCycle: cycle,
          startDate: now,
          nextBillingDate: nextBilling,
          category: action.category || 'subscription',
          isActive: true,
          reminderDays: 3,
          isInstallment: false,
        });
        return {
          success: true,
          message: `Added subscription: ${action.description} — RM ${action.amount.toFixed(2)}/${cycle}`,
          action,
        };
      }

      case 'split_bill': {
        const people = action.people || [];
        if (people.length === 0) {
          return { success: false, message: 'No people specified for split.', action };
        }
        const perPerson = Math.round((action.amount / (people.length + 1)) * 100) / 100;

        // Also record the full amount as an expense
        const walletId = findWalletId(action.wallet);
        const splitTxId = usePersonalStore.getState().addTransaction({
          amount: action.amount,
          description: action.description,
          category: action.category || 'food',
          type: 'expense',
          date: actionDate,
          mode,
          walletId,
        });
        if (walletId) useWalletStore.getState().deductFromWallet(walletId, action.amount);

        const splitId = useDebtStore.getState().addSplit({
          description: action.description,
          totalAmount: action.amount,
          splitMethod: 'equal',
          participants: people.map((name) => ({
            contact: { id: uniqueId(name), name, isFromPhone: false },
            amount: perPerson,
            isPaid: false,
          })),
          items: [],
          category: action.category,
          mode,
        });
        // Create individual debts for each person
        const splitDebtIds: string[] = [];
        for (const name of people) {
          const dId = useDebtStore.getState().addDebt({
            contact: { id: uniqueId(name), name, isFromPhone: false },
            type: 'they_owe',
            totalAmount: perPerson,
            description: action.description,
            category: action.category,
            mode,
            splitId,
          });
          if (dId) splitDebtIds.push(dId);
        }
        return {
          success: true,
          message: `Split RM ${action.amount.toFixed(2)} for "${action.description}" — ${people.length} people owe RM ${perPerson.toFixed(2)} each (expense recorded)`,
          action,
          receipt: {
            ...(splitTxId ? { transactionIds: [splitTxId] } : {}),
            ...(splitDebtIds.length ? { debtIds: splitDebtIds } : {}),
          },
        };
      }

      case 'debt_update': {
        const personName = action.person;
        if (!personName) {
          return { success: false, message: 'No person specified for debt payment.', action };
        }
        const debts = useDebtStore.getState().debts;
        const matchingDebt = debts.find(
          (d) =>
            d.contact.name.toLowerCase() === personName.toLowerCase() &&
            d.status !== 'settled'
        );
        if (!matchingDebt) {
          return { success: false, message: `No active debt found for ${personName}.`, action };
        }
        // Cap the payment at what's actually left so the wallet move never
        // exceeds the debt and remaining never goes negative.
        const before = Math.max(0, matchingDebt.totalAmount - matchingDebt.paidAmount);
        if (before <= 0) {
          return { success: false, message: `${personName}'s debt is already settled.`, action };
        }
        const payAmount = Math.min(action.amount, before);
        const walletId = findWalletId(action.wallet);

        // they_owe (they pay me back) → money comes IN. i_owe (I pay them) → money goes OUT.
        // Mirror DebtTracking.processPayment: create the linked transaction and let the
        // CALLER move the wallet (single-owner contract — addPayment never touches it).
        const txType: 'income' | 'expense' = matchingDebt.type === 'they_owe' ? 'income' : 'expense';
        const txDesc = action.description || `${matchingDebt.type === 'they_owe' ? 'repayment from' : 'payment to'} ${personName}`;
        const linkedTxId = usePersonalStore.getState().addTransaction({
          amount: payAmount,
          description: txDesc,
          category: matchingDebt.type === 'they_owe' ? 'debt_paid' : 'debt_payment',
          type: txType,
          date: actionDate,
          mode,
          walletId,
        });
        if (walletId) {
          if (txType === 'income') useWalletStore.getState().addToWallet(walletId, payAmount);
          else useWalletStore.getState().deductFromWallet(walletId, payAmount);
        }

        const paymentId = useDebtStore.getState().addPayment(matchingDebt.id, {
          amount: payAmount,
          date: actionDate,
          note: action.description || 'payment via chat',
          walletId,
          linkedTransactionId: linkedTxId || undefined,
        });
        // If the payment somehow didn't take, roll back the transaction + wallet
        // so we don't leave invisible cash. (addTransaction owns its own wallet
        // reversal via deleteTransaction.)
        if (!paymentId) {
          if (linkedTxId) usePersonalStore.getState().deleteTransaction(linkedTxId);
          return { success: false, message: `Couldn't record the payment for ${personName}.`, action };
        }

        const remaining = Math.max(0, before - payAmount);
        const remainMsg = remaining <= 0
          ? `${personName}'s debt is now settled!`
          : `${personName} has RM ${remaining.toFixed(2)} left`;
        return {
          success: true,
          message: `Recorded RM ${payAmount.toFixed(2)} payment — ${remainMsg}`,
          action,
          receipt: { debtId: matchingDebt.id, debtPaymentId: paymentId, transactionIds: linkedTxId ? [linkedTxId] : [] },
        };
      }

      case 'transfer': {
        const fromId = findWalletId(action.fromWallet);
        const toId = findWalletId(action.toWallet);
        if (!fromId || !toId) {
          const missing = !fromId ? action.fromWallet : action.toWallet;
          return { success: false, message: `Wallet "${missing}" not found.`, action };
        }
        useWalletStore.getState().transferBetweenWallets(
          fromId, toId, action.amount, action.description || 'transfer via chat'
        );
        return {
          success: true,
          message: `Transferred RM ${action.amount.toFixed(2)} from ${action.fromWallet} to ${action.toWallet}`,
          action,
        };
      }

      case 'add_goal_contribution': {
        const goalName = action.goalName || action.description;
        const goals = usePersonalStore.getState().goals;
        const goal = goals.find(
          (g) => g.name.toLowerCase().includes(goalName.toLowerCase()) ||
                 goalName.toLowerCase().includes(g.name.toLowerCase())
        );
        if (!goal) {
          return { success: false, message: `No savings goal matching "${goalName}" found.`, action };
        }
        usePersonalStore.getState().contributeToGoal(goal.id, action.amount, action.description || 'contribution via chat');
        const newAmount = Math.min(goal.currentAmount + action.amount, goal.targetAmount);
        const pct = goal.targetAmount > 0 ? Math.round((newAmount / goal.targetAmount) * 100) : 0;
        return {
          success: true,
          message: `Added RM ${action.amount.toFixed(2)} to "${goal.name}" — now at RM ${newAmount.toFixed(2)} (${pct}%)`,
          action,
        };
      }

      case 'cancel_subscription': {
        const subName = action.description;
        const subs = usePersonalStore.getState().subscriptions;
        const sub = subs.find(
          (s) => s.isActive && (
            s.name.toLowerCase().includes(subName.toLowerCase()) ||
            subName.toLowerCase().includes(s.name.toLowerCase())
          )
        );
        if (!sub) {
          return { success: false, message: `No active subscription matching "${subName}" found.`, action };
        }
        usePersonalStore.getState().deleteSubscription(sub.id);
        return {
          success: true,
          message: `Cancelled "${sub.name}" (was RM ${sub.amount.toFixed(2)}/${sub.billingCycle})`,
          action,
        };
      }

      case 'forgive_debt': {
        const personName = action.person;
        if (!personName) {
          return { success: false, message: 'No person specified.', action };
        }
        const debts = useDebtStore.getState().debts;
        const matchingDebt = debts.find(
          (d) =>
            d.contact.name.toLowerCase() === personName.toLowerCase() &&
            d.status !== 'settled'
        );
        if (!matchingDebt) {
          return { success: false, message: `No active debt found for ${personName}.`, action };
        }
        const remaining = matchingDebt.totalAmount - matchingDebt.paidAmount;
        useDebtStore.getState().updateDebt(matchingDebt.id, { status: 'settled' });
        return {
          success: true,
          message: `Forgiven ${personName}'s debt of RM ${remaining.toFixed(2)} — marked as settled`,
          action,
          receipt: { debtId: matchingDebt.id },
        };
      }

      case 'update_subscription': {
        const subName = action.description;
        const subs = usePersonalStore.getState().subscriptions;
        const sub = subs.find(
          (s) => s.isActive && (
            s.name.toLowerCase().includes(subName.toLowerCase()) ||
            subName.toLowerCase().includes(s.name.toLowerCase())
          )
        );
        if (!sub) {
          return { success: false, message: `No active subscription matching "${subName}" found.`, action };
        }
        const updates: Partial<Pick<Subscription, 'amount' | 'billingCycle'>> = {};
        if (action.newAmount !== undefined && action.newAmount > 0) updates.amount = action.newAmount;
        if (action.billingCycle) updates.billingCycle = action.billingCycle;
        if (Object.keys(updates).length === 0) {
          return { success: false, message: 'Nothing to update — provide newAmount or billingCycle.', action };
        }
        usePersonalStore.getState().updateSubscription(sub.id, updates);
        const amt = updates.amount || sub.amount;
        const cycle = updates.billingCycle || sub.billingCycle;
        return {
          success: true,
          message: `Updated "${sub.name}" — now RM ${amt.toFixed(2)}/${cycle}`,
          action,
        };
      }

      case 'add_bnpl': {
        const walletId = findWalletId(action.creditWallet || action.wallet);
        if (!walletId) {
          return { success: false, message: `Credit wallet "${action.creditWallet || action.wallet}" not found.`, action };
        }
        const wallet = useWalletStore.getState().wallets.find((w) => w.id === walletId);
        if (!wallet || wallet.type !== 'credit') {
          return { success: false, message: `"${action.creditWallet || action.wallet}" is not a credit wallet.`, action };
        }
        useWalletStore.getState().useCredit(walletId, action.amount);
        const bnplTxId = usePersonalStore.getState().addTransaction({
          amount: action.amount,
          description: action.description,
          category: action.category || 'shopping',
          type: 'expense',
          date: actionDate,
          mode,
          walletId,
        });
        const newUsed = (wallet.usedCredit || 0) + action.amount;
        const available = (wallet.creditLimit || 0) - newUsed;
        return {
          success: true,
          message: `BNPL purchase: ${action.description} — RM ${action.amount.toFixed(2)} on ${wallet.name} (RM ${available.toFixed(2)} available)`,
          action,
          receipt: bnplTxId ? { transactionIds: [bnplTxId] } : undefined,
        };
      }

      case 'repay_credit': {
        const creditId = findWalletId(action.creditWallet || action.wallet);
        if (!creditId) {
          return { success: false, message: `Credit wallet "${action.creditWallet || action.wallet}" not found.`, action };
        }
        const creditWallet = useWalletStore.getState().wallets.find((w) => w.id === creditId);
        if (!creditWallet || creditWallet.type !== 'credit') {
          return { success: false, message: `"${action.creditWallet || action.wallet}" is not a credit wallet.`, action };
        }
        // Deduct from source bank wallet if specified
        const fromId = findWalletId(action.fromWallet);
        if (fromId) {
          useWalletStore.getState().deductFromWallet(fromId, action.amount);
        }
        useWalletStore.getState().repayCredit(creditId, action.amount);
        // Record the source→credit movement so reconcileWalletBalances accounts
        // for the source deduction (mirrors WalletManagement.handleRepay).
        if (fromId) {
          useWalletStore.getState().logActivity(fromId, creditId, action.amount, 'repayment');
        }
        const newUsed = Math.max(0, (creditWallet.usedCredit || 0) - action.amount);
        return {
          success: true,
          message: `Paid RM ${action.amount.toFixed(2)} to ${creditWallet.name} — RM ${newUsed.toFixed(2)} remaining`,
          action,
        };
      }

      case 'update_savings': {
        const savingsStore = useSavingsStore.getState();
        const accounts = savingsStore.accounts;
        const name = action.accountName || action.description;
        const account = accounts.find(
          (a) => a.name.toLowerCase().includes(name.toLowerCase()) ||
                 name.toLowerCase().includes(a.name.toLowerCase())
        );
        if (!account) {
          const available = accounts.map(a => a.name).join(', ');
          return {
            success: false,
            message: `No savings account matching "${name}". You have: ${available || 'none'}`,
            action,
          };
        }
        savingsStore.addSnapshot(account.id, action.amount, action.description || 'updated via chat', 'manual');
        const gain = action.amount - account.initialInvestment;
        const ret = account.initialInvestment > 0 ? (gain / account.initialInvestment) * 100 : 0;
        return {
          success: true,
          message: `Updated ${account.name} to RM ${action.amount.toFixed(2)} (${ret >= 0 ? '+' : ''}${ret.toFixed(1)}% overall)`,
          action,
        };
      }

      case 'add_savings_account': {
        const savingsStore = useSavingsStore.getState();
        if (savingsStore.accounts.length >= 5) {
          return { success: false, message: 'Maximum 5 savings accounts — remove one first.', action };
        }
        savingsStore.addAccount({
          name: action.description || action.accountName || 'New Account',
          type: action.accountType || 'other',
          initialInvestment: action.initialInvestment ?? action.amount,
          currentValue: action.amount,
        });
        return {
          success: true,
          message: `Added savings account "${action.description || action.accountName}" with RM ${action.amount.toFixed(2)}`,
          action,
        };
      }

      case 'create_goal': {
        const goals = usePersonalStore.getState().goals;
        if (goals.length >= 10) {
          return { success: false, message: 'Maximum 10 goals — remove one first.', action };
        }
        const target = action.goalTarget || action.amount;
        if (!target || target <= 0) {
          return { success: false, message: 'Please specify a target amount.', action };
        }
        let deadline: Date | undefined;
        if (action.goalDeadline) {
          const d = new Date(action.goalDeadline);
          if (!isNaN(d.getTime())) deadline = d;
        }
        usePersonalStore.getState().addGoal({
          name: action.description || action.goalName || 'New Goal',
          targetAmount: target,
          deadline,
          category: 'general',
          icon: action.goalIcon || 'target',
          color: action.goalColor || '#4F5104',
        });
        return {
          success: true,
          message: `Created goal "${action.description || action.goalName}" — target RM ${target.toFixed(2)}${deadline ? ` by ${format(deadline, 'dd MMM yyyy')}` : ''}`,
          action,
        };
      }

      case 'withdraw_goal': {
        const goals = usePersonalStore.getState().goals;
        const name = action.goalName || action.description;
        const goal = goals.find(
          (g) => g.name.toLowerCase().includes(name.toLowerCase()) ||
                 name.toLowerCase().includes(g.name.toLowerCase())
        );
        if (!goal) {
          const available = goals.map(g => g.name).join(', ');
          return { success: false, message: `No goal matching "${name}". You have: ${available || 'none'}`, action };
        }
        if (action.amount > goal.currentAmount) {
          return { success: false, message: `Can't withdraw RM ${action.amount.toFixed(2)} — goal only has RM ${goal.currentAmount.toFixed(2)}.`, action };
        }
        usePersonalStore.getState().withdrawFromGoal(goal.id, action.amount, action.description || 'withdrawn via chat');
        const newAmount = goal.currentAmount - action.amount;
        const pct = goal.targetAmount > 0 ? Math.round((newAmount / goal.targetAmount) * 100) : 0;
        return {
          success: true,
          message: `Withdrew RM ${action.amount.toFixed(2)} from "${goal.name}" — now at RM ${newAmount.toFixed(2)} (${pct}%)`,
          action,
        };
      }

      case 'delete_transaction': {
        const { transactions } = usePersonalStore.getState();
        const desc = (action.description || '').toLowerCase();
        if (desc && desc.length < 3 && !(action.amount && action.amount > 0)) {
          return { success: false, message: `Search term "${action.description}" is too short — use at least 3 characters or provide an amount.`, action };
        }
        const matches = transactions.filter((t) => {
          if (action.matchType && t.type !== action.matchType) return false;
          if (action.amount && action.amount > 0 && Math.abs(t.amount - action.amount) > 0.01) return false;
          if (desc && !t.description.toLowerCase().includes(desc)) return false;
          if (action.date) {
            const target = resolveDate(action.date);
            const td = t.date instanceof Date ? t.date : new Date(t.date);
            if (format(target, 'yyyy-MM-dd') !== format(td, 'yyyy-MM-dd')) return false;
          }
          return true;
        });
        if (matches.length === 0) {
          return { success: false, message: `No transaction found matching "${action.description || ''}" RM ${(action.amount || 0).toFixed(2)}.`, action };
        }
        const MAX_DELETE_BATCH = 5;
        const toDelete = action.deleteAll ? matches.slice(0, MAX_DELETE_BATCH) : [matches[matches.length - 1]];
        for (const tx of toDelete) {
          // Wallet rollback is owned by personalStore.deleteTransaction — do not
          // reverse the wallet here (that double-counted the balance).
          // Clean up playbook links
          if (tx.playbookLinks?.length) {
            try { usePlaybookStore.getState().unlinkAllFromTransaction(tx.id); } catch (_) {}
          }
          usePersonalStore.getState().deleteTransaction(tx.id);
        }
        const count = toDelete.length;
        const totalAmt = toDelete.reduce((s, t) => s + t.amount, 0);
        return {
          success: true,
          message: count === 1
            ? `Deleted: ${toDelete[0].description} — RM ${toDelete[0].amount.toFixed(2)} (${toDelete[0].type}, ${format(toDelete[0].date instanceof Date ? toDelete[0].date : new Date(String(toDelete[0].date)), 'dd MMM')})`
            : `Deleted ${count} transactions totalling RM ${totalAmt.toFixed(2)}`,
          action,
          // Full snapshots so undo can re-add each record AND re-apply its wallet
          // adjustment exactly like the add path (never re-delete an absent id).
          receipt: { deletedTransactions: toDelete.map((t) => ({ ...t })) },
        };
      }

      case 'edit_transaction': {
        const { transactions } = usePersonalStore.getState();
        const desc = (action.description || '').toLowerCase();
        const matches = transactions.filter((t) => {
          if (action.matchType && t.type !== action.matchType) return false;
          if (action.amount && action.amount > 0 && Math.abs(t.amount - action.amount) > 0.01) return false;
          if (desc && !t.description.toLowerCase().includes(desc)) return false;
          if (action.date) {
            const target = resolveDate(action.date);
            const td = t.date instanceof Date ? t.date : new Date(t.date);
            if (format(target, 'yyyy-MM-dd') !== format(td, 'yyyy-MM-dd')) return false;
          }
          return true;
        });
        if (matches.length === 0) {
          return { success: false, message: `No transaction found matching "${action.description || ''}" RM ${(action.amount || 0).toFixed(2)}.`, action };
        }
        const tx = matches[matches.length - 1]; // most recent match
        const updates: Partial<Pick<Transaction, 'amount' | 'description' | 'category' | 'date'>> = {};
        if (action.newAmount !== undefined && action.newAmount > 0) updates.amount = action.newAmount;
        if (action.newDescription) updates.description = action.newDescription;
        if (action.newCategory) updates.category = action.newCategory;
        if (action.newDate) {
          const nd = resolveDate(action.newDate);
          updates.date = nd;
        }
        if (Object.keys(updates).length === 0) {
          return { success: false, message: 'Nothing to change — provide newAmount, newDescription, newCategory, or newDate.', action };
        }
        // Snapshot the PRE-edit value of exactly the fields this edit changes, so
        // undo can RESTORE them (updateTransaction self-reconciles the wallet) —
        // never delete the record (that was data loss).
        const prev: Partial<Transaction> = {};
        if (updates.amount !== undefined) prev.amount = tx.amount;
        if (updates.description !== undefined) prev.description = tx.description;
        if (updates.category !== undefined) prev.category = tx.category;
        if (updates.date !== undefined) prev.date = tx.date instanceof Date ? tx.date : new Date(tx.date);
        // Wallet reconciliation for an amount change is owned by
        // personalStore.updateTransaction (reverses old, applies new). Do not
        // adjust the wallet here — that double-applied the delta.
        usePersonalStore.getState().updateTransaction(tx.id, updates);
        // Keep the playbook drain amount in sync with an edited amount.
        if (updates.amount !== undefined) syncLinkAmount(tx.id, updates.amount);
        const changes: string[] = [];
        if (updates.amount) changes.push(`amount → RM ${updates.amount.toFixed(2)}`);
        if (updates.description) changes.push(`description → "${updates.description}"`);
        if (updates.category) changes.push(`category → ${updates.category}`);
        if (updates.date) changes.push(`date → ${format(updates.date, 'dd MMM')}`);
        return {
          success: true,
          message: `Updated "${tx.description}": ${changes.join(', ')}`,
          action,
          receipt: { edited: { id: tx.id, prev } },
        };
      }

      // ── Budget Management ────────────────────────────────
      case 'add_budget': {
        const cat = action.budgetCategory || action.category || action.description || 'other';
        const now = new Date();
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        usePersonalStore.getState().addBudget({
          category: cat,
          allocatedAmount: action.amount || 0,
          period: 'monthly',
          startDate: now,
          endDate: monthEnd,
        });
        return {
          success: true,
          message: `Budget set — RM ${(action.amount || 0).toFixed(2)} for ${cat}`,
          action,
        };
      }

      case 'edit_budget': {
        const { budgets } = usePersonalStore.getState();
        const cat = (action.budgetCategory || action.description || '').toLowerCase();
        const budget = budgets.find((b) => b.category.toLowerCase() === cat || b.category.toLowerCase().includes(cat) || cat.includes(b.category.toLowerCase()));
        if (!budget) {
          const available = budgets.map((b) => b.category).join(', ');
          return { success: false, message: `No budget matching "${cat}". You have: ${available || 'none'}`, action };
        }
        const updates: Partial<Pick<Budget, 'allocatedAmount'>> = {};
        if (action.amount && action.amount > 0) updates.allocatedAmount = action.amount;
        if (action.newAmount && action.newAmount > 0) updates.allocatedAmount = action.newAmount;
        if (Object.keys(updates).length === 0) {
          return { success: false, message: 'Nothing to change — provide an amount.', action };
        }
        usePersonalStore.getState().updateBudget(budget.id, updates);
        return {
          success: true,
          message: `Budget updated — ${budget.category} now RM ${(updates.allocatedAmount || budget.allocatedAmount).toFixed(2)}`,
          action,
        };
      }

      case 'delete_budget': {
        const { budgets } = usePersonalStore.getState();
        const cat = (action.budgetCategory || action.description || '').toLowerCase();
        const budget = budgets.find((b) => b.category.toLowerCase() === cat || b.category.toLowerCase().includes(cat) || cat.includes(b.category.toLowerCase()));
        if (!budget) {
          return { success: false, message: `No budget matching "${cat}".`, action };
        }
        usePersonalStore.getState().deleteBudget(budget.id);
        return {
          success: true,
          message: `Budget removed — ${budget.category}`,
          action,
        };
      }

      // ── Debt Management ─────────────────────────────────
      case 'delete_debt': {
        const personName = action.person;
        if (!personName) {
          return { success: false, message: 'No person specified for debt deletion.', action };
        }
        const debts = useDebtStore.getState().debts;
        const matchingDebt = debts.find(
          (d) => d.contact.name.toLowerCase() === personName.toLowerCase() && d.status !== 'settled'
        );
        if (!matchingDebt) {
          return { success: false, message: `No active debt found for ${personName}.`, action };
        }
        useDebtStore.getState().deleteDebt(matchingDebt.id);
        return {
          success: true,
          message: `Debt deleted — ${personName}'s RM ${matchingDebt.totalAmount.toFixed(2)}`,
          action,
          receipt: { debtId: matchingDebt.id },
        };
      }

      case 'edit_debt': {
        const personName = action.person;
        if (!personName) {
          return { success: false, message: 'No person specified for debt edit.', action };
        }
        const debts = useDebtStore.getState().debts;
        const matchingDebt = debts.find(
          (d) => d.contact.name.toLowerCase() === personName.toLowerCase() && d.status !== 'settled'
        );
        if (!matchingDebt) {
          return { success: false, message: `No active debt found for ${personName}.`, action };
        }
        const updates: Partial<Pick<Debt, 'totalAmount' | 'contact' | 'description'>> = {};
        if (action.amount && action.amount > 0) updates.totalAmount = action.amount;
        if (action.newAmount && action.newAmount > 0) updates.totalAmount = action.newAmount;
        if (action.newPerson) {
          updates.contact = { ...matchingDebt.contact, name: action.newPerson };
        }
        if (action.newDescription) updates.description = action.newDescription;
        if (Object.keys(updates).length === 0) {
          return { success: false, message: 'Nothing to change — provide amount, newPerson, or newDescription.', action };
        }
        useDebtStore.getState().updateDebt(matchingDebt.id, updates);
        const finalName = action.newPerson || personName;
        const finalAmt = updates.totalAmount || matchingDebt.totalAmount;
        return {
          success: true,
          message: `Debt updated — ${finalName} now RM ${finalAmt.toFixed(2)}`,
          action,
          receipt: { debtId: matchingDebt.id },
        };
      }

      // ── Goal Lifecycle ──────────────────────────────────
      case 'pause_goal': {
        const goals = usePersonalStore.getState().goals;
        const name = (action.goalName || action.description || '').toLowerCase();
        const goal = goals.find(
          (g) => g.name.toLowerCase().includes(name) || name.includes(g.name.toLowerCase())
        );
        if (!goal) {
          const available = goals.map((g) => g.name).join(', ');
          return { success: false, message: `No goal matching "${name}". You have: ${available || 'none'}`, action };
        }
        if (goal.isPaused) {
          usePersonalStore.getState().resumeGoal(goal.id);
          return { success: true, message: `Resumed "${goal.name}" — back on track`, action };
        }
        usePersonalStore.getState().pauseGoal(goal.id);
        return { success: true, message: `Paused "${goal.name}" — you can resume anytime`, action };
      }

      case 'archive_goal': {
        const goals = usePersonalStore.getState().goals;
        const name = (action.goalName || action.description || '').toLowerCase();
        const goal = goals.find(
          (g) => g.name.toLowerCase().includes(name) || name.includes(g.name.toLowerCase())
        );
        if (!goal) {
          const available = goals.map((g) => g.name).join(', ');
          return { success: false, message: `No goal matching "${name}". You have: ${available || 'none'}`, action };
        }
        usePersonalStore.getState().archiveGoal(goal.id);
        return { success: true, message: `Archived "${goal.name}" — nice work!`, action };
      }

      case 'delete_goal': {
        const goals = usePersonalStore.getState().goals;
        const name = (action.goalName || action.description || '').toLowerCase();
        const goal = goals.find(
          (g) => g.name.toLowerCase().includes(name) || name.includes(g.name.toLowerCase())
        );
        if (!goal) {
          const available = goals.map((g) => g.name).join(', ');
          return { success: false, message: `No goal matching "${name}". You have: ${available || 'none'}`, action };
        }
        usePersonalStore.getState().deleteGoal(goal.id);
        return { success: true, message: `Deleted goal "${goal.name}"`, action };
      }

      // ── Subscription & Wallet ──────────────────────────
      case 'pause_subscription': {
        const subs = usePersonalStore.getState().subscriptions;
        const name = (action.description || '').toLowerCase();
        const sub = subs.find(
          (s) => s.name.toLowerCase().includes(name) || name.includes(s.name.toLowerCase())
        );
        if (!sub) {
          return { success: false, message: `No subscription matching "${action.description}".`, action };
        }
        usePersonalStore.getState().toggleSubscriptionPause(sub.id);
        const wasPaused = sub.isPaused;
        return {
          success: true,
          message: wasPaused
            ? `Resumed "${sub.name}" — RM ${sub.amount.toFixed(2)}/${sub.billingCycle}`
            : `Paused "${sub.name}" — won't count until you resume`,
          action,
        };
      }

      case 'add_wallet': {
        const walletName = action.description || 'New Wallet';
        useWalletStore.getState().addWallet({
          name: walletName,
          type: action.walletType || 'ewallet',
          balance: action.amount || 0,
          color: action.walletColor || '#4F5104',
          icon: action.walletIcon || 'wallet',
          isDefault: false,
        });
        return {
          success: true,
          message: `Wallet added — ${walletName}${action.amount ? ` with RM ${action.amount.toFixed(2)}` : ''}`,
          action,
        };
      }

      default:
        return { success: false, message: `Unknown action: ${action.type}`, action };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return { success: false, message: `Failed: ${message}`, action };
  }
}

// ─── Prompt Instructions for Gemini ──────────────────────

export const ACTION_PROMPT = `
ACTION CAPABILITIES:
You can perform real actions in the user's app. When the user asks you to add, record, create, or track something, include an ACTION block in your response.

FORMAT — include this EXACTLY as shown (valid JSON between the tags):
[ACTION]{"type":"add_expense","amount":15.50,"description":"lunch nasi lemak","category":"food"}[/ACTION]

AVAILABLE ACTIONS:
1. add_expense — Record a spending
   {"type":"add_expense","amount":NUMBER,"description":"TEXT","category":"CATEGORY","wallet":"WALLET_NAME"}
   Categories: food, transport, shopping, bills, entertainment, health, education, groceries, other

2. add_income — Record money received
   {"type":"add_income","amount":NUMBER,"description":"TEXT","category":"income","wallet":"WALLET_NAME"}

3. add_debt — Track money owed
   {"type":"add_debt","amount":NUMBER,"description":"TEXT","person":"NAME","debtType":"i_owe"|"they_owe"}

4. add_subscription — Track recurring payment
   {"type":"add_subscription","amount":NUMBER,"description":"Netflix","billingCycle":"monthly"|"yearly"|"weekly"|"quarterly","category":"subscription"}

5. split_bill — Split expense with friends (records the expense AND creates debts)
   {"type":"split_bill","amount":NUMBER,"description":"TEXT","people":["name1","name2"],"category":"food","wallet":"WALLET_NAME"}

6. debt_update — Record a payment on an existing debt
   {"type":"debt_update","amount":NUMBER,"description":"TEXT","person":"NAME","wallet":"WALLET_NAME"}
   Use when someone pays back money or user pays off a debt. Matches the person name to find active debt.

7. transfer — Move money between wallets
   {"type":"transfer","amount":NUMBER,"description":"TEXT","fromWallet":"SOURCE_WALLET","toWallet":"DEST_WALLET"}
   Use when user wants to move money between bank accounts, e-wallets, etc.

8. add_goal_contribution — Save money toward a goal
   {"type":"add_goal_contribution","amount":NUMBER,"description":"TEXT","goalName":"GOAL_NAME"}
   Match goalName to the user's existing savings goals. Use when user says "simpan", "save for", "add to goal", etc.

9. cancel_subscription — Cancel/deactivate a subscription
   {"type":"cancel_subscription","amount":0,"description":"SUBSCRIPTION_NAME"}
   Fuzzy matches the name against active subscriptions. Use when user says "cancel", "stop", "batalkan".

10. forgive_debt — Forgive/write off someone's debt
   {"type":"forgive_debt","amount":0,"description":"TEXT","person":"NAME"}
   Marks the debt as settled without payment. Use when user says "cancel hutang", "lupakan", "forgive", "let it go".

11. update_subscription — Change subscription amount or billing cycle
   {"type":"update_subscription","amount":0,"description":"SUBSCRIPTION_NAME","newAmount":NUMBER,"billingCycle":"monthly"|"yearly"|"weekly"|"quarterly"}
   Fuzzy matches active subscription. Include newAmount and/or billingCycle.

12. add_bnpl — Record a buy-now-pay-later purchase
   {"type":"add_bnpl","amount":NUMBER,"description":"TEXT","category":"CATEGORY","creditWallet":"CREDIT_WALLET_NAME"}
   Records expense AND uses credit on the specified credit wallet (SPayLater, credit card, etc).

13. repay_credit — Pay off credit/BNPL balance
   {"type":"repay_credit","amount":NUMBER,"description":"TEXT","creditWallet":"CREDIT_WALLET_NAME","fromWallet":"BANK_WALLET_NAME"}
   Repays credit wallet balance. fromWallet is optional — if specified, deducts from that bank wallet.

14. update_savings — Update the current value of a savings/investment account
   {"type":"update_savings","amount":NUMBER,"description":"ACCOUNT_NAME","accountName":"ACCOUNT_NAME"}
   Fuzzy matches accountName against user's savings accounts (TNG+, ASB, Tabung Haji, etc).
   Use when user says "TNG+ now RM 5200", "update ASB", "my ASB is at RM 50000 now".

15. add_savings_account — Add a new savings/investment account
   {"type":"add_savings_account","amount":NUMBER,"description":"ACCOUNT_NAME","accountType":"TYPE","initialInvestment":NUMBER}
   Types: tng_plus, robo_crypto, esa, bank, asb, tabung_haji, stocks, gold, other
   Use when user says "add my ASB account", "I opened TNG+ with RM 1000".

16. create_goal — Create a new savings goal
   {"type":"create_goal","amount":NUMBER,"description":"GOAL_NAME","goalTarget":NUMBER,"goalDeadline":"YYYY-MM-DD"}
   amount and goalTarget should be the same (target amount). goalDeadline is optional.
   Use when user says "I want to save for X", "create goal for Y", "nak simpan untuk Z".

17. withdraw_goal — Withdraw/remove money from a goal
   {"type":"withdraw_goal","amount":NUMBER,"description":"GOAL_NAME","goalName":"GOAL_NAME"}
   Use when user says "take RM 500 from japan fund", "keluarkan duit dari goal", "withdraw from emergency fund".

18. delete_transaction — Delete a transaction from history
   {"type":"delete_transaction","amount":NUMBER,"description":"TEXT","matchType":"expense"|"income","date":"YYYY-MM-DD"}
   Matches by description (fuzzy) + amount (exact) + optional date + optional matchType. Deletes the most recent match.
   Use "deleteAll":true to delete ALL matches (e.g. duplicate entries).
   Wallet balance is automatically reversed. Use when user says "delete", "remove", "buang", "wrong entry", "salah".

19. edit_transaction — Edit/update an existing transaction
   {"type":"edit_transaction","amount":NUMBER,"description":"TEXT","newAmount":NUMBER,"newDescription":"TEXT","newCategory":"CATEGORY","newDate":"YYYY-MM-DD"}
   amount + description identify the transaction to edit. newAmount/newDescription/newCategory/newDate are the changes.
   Wallet balance is automatically adjusted if amount changes. Use when user says "change", "edit", "fix", "betulkan", "tukar".

20. add_budget — Set a monthly budget for a category
   {"type":"add_budget","amount":500,"budgetCategory":"food","description":"food budget"}
   Use when user says "set budget", "budget for", "bajet".

21. edit_budget — Change a budget amount
   {"type":"edit_budget","amount":600,"budgetCategory":"food","description":"food budget"}
   Fuzzy matches category name. Use when user says "change budget", "increase budget", "kurangkan bajet".

22. delete_budget — Remove a budget
   {"type":"delete_budget","budgetCategory":"food","description":"food budget"}
   Use when user says "remove budget", "buang bajet", "delete budget".

23. delete_debt — Remove a debt entry entirely
   {"type":"delete_debt","person":"ali","description":"ali's debt"}
   Use when user says "delete debt", "wrong debt entry", "buang hutang". NOT for settling — use forgive_debt for that.

24. edit_debt — Change debt amount or person
   {"type":"edit_debt","person":"ali","amount":500,"description":"ali's debt"}
   Use when user says "change debt amount", "actually ali owes RM 500", "betulkan hutang".

25. pause_goal — Pause or resume a savings goal (toggles)
   {"type":"pause_goal","goalName":"japan trip","description":"pause japan goal"}
   Use when user says "pause goal", "jeda", "resume goal", "sambung simpan".

26. archive_goal — Mark a goal as completed/done
   {"type":"archive_goal","goalName":"emergency fund","description":"archive goal"}
   Use when user says "done with goal", "archive", "siap", "goal completed".

27. delete_goal — Remove a goal entirely
   {"type":"delete_goal","goalName":"travel","description":"delete travel goal"}
   Use when user says "delete goal", "buang goal", "remove goal".

28. pause_subscription — Pause or unpause a subscription (toggles)
   {"type":"pause_subscription","description":"netflix"}
   Use when user says "pause subscription", "jeda netflix", "resume spotify".

29. add_wallet — Create a new wallet
   {"type":"add_wallet","description":"Emergency Fund","amount":0,"walletType":"ewallet"}
   walletType: bank, ewallet, credit. Use when user says "add wallet", "tambah wallet", "create wallet".

DATE OVERRIDE:
Any action can include "date":"YYYY-MM-DD" to record for a past/future date.
Example: {"type":"add_expense","amount":50,"description":"dinner yesterday","category":"food","date":"2026-03-12"}

RULES:
- Only include ACTION blocks when the user CLEARLY asks to add/record/create/delete/edit something
- NEVER include ACTION blocks when the user is just asking questions about their finances
- wallet is optional — only include if the user mentions a specific wallet/bank
- CONFIRMATION HONESTY: you NEVER save anything — you only PREPARE a chip the owner taps to save. NEVER say "recorded", "saved", "added", "done", "dah record", "dah simpan". Say "lined up" / "dah sedia" and ask them to tap to confirm.
- Use RM amounts — always a number, never a string
- ECHO BACK ambiguous amounts you computed so the owner can sanity-check the number on the chip: "RM3.50 x2 = RM7", "1.2k = RM1200", "half of RM90 = RM45". Put the final figure in the amount field.
- ONE [ACTION] block per item. A message with several items ("nasi RM8 and teh RM2") becomes SEPARATE [ACTION] blocks — one per entry — never one block summing them.
- You CAN include MULTIPLE action blocks in one response
- You can also reshape money between forms: a wallet-to-wallet move is a "transfer", money between you and a person is a "debt" (add_debt / debt_update), and a shared bill is a "split_bill". Pick the form that matches what the owner described.
- If info is MISSING (e.g. "share with 5 people" but no names), DO NOT guess — ASK the user for the names first
- For shared expenses: think about the FULL picture. Subscription sharing = 1 subscription action + multiple add_debt actions
- For debt_update: ALWAYS check the debts context to find the right person. If no matching debt exists, tell the user.
- For transfer: BOTH wallets must be named. If user only mentions one, ASK for the other.
- For add_goal_contribution: match the goal name fuzzy. If no match, tell the user which goals exist.
- After recording an expense, note the budget impact if relevant (the system will append this automatically).
- For update_subscription: only include fields that are changing (newAmount and/or billingCycle).
- For add_bnpl: the creditWallet must be a credit-type wallet (SPayLater, credit card). Records both the expense and credit usage.
- For repay_credit: fromWallet is the bank/ewallet paying off the credit. If user doesn't mention source, omit fromWallet.
- For delete_transaction: match using description + amount + matchType. If user wants to fix a wrong amount, prefer edit_transaction over deleting + re-adding. If there are duplicates, use deleteAll:true.
- For edit_transaction: match the OLD values (amount, description), then provide the NEW values (newAmount, newDescription, newCategory, newDate). NEVER add correction entries — just edit directly.
- ALWAYS prefer edit_transaction over "delete + re-add" or "add correction entry". Users want simple, direct fixes.
- ALWAYS prefer edit_budget over "delete + re-add budget". Same for edit_debt.
- For pause_goal / pause_subscription — if user says "unpause", "resume", "sambung", still use the same action type (it toggles automatically).
- For delete_debt vs forgive_debt: delete_debt REMOVES the record entirely (wrong entry). forgive_debt SETTLES it (intentional write-off). Ask if unsure.

EXAMPLES:

Shared subscription:
User: "netflix rm75 share with ali, abu, ahmad"
Response: I'll add the Netflix subscription and track who owes you.
[ACTION]{"type":"add_subscription","amount":75,"description":"Netflix","billingCycle":"monthly","category":"subscription"}[/ACTION]
[ACTION]{"type":"add_debt","amount":18.75,"description":"Netflix share","person":"Ali","debtType":"they_owe"}[/ACTION]
[ACTION]{"type":"add_debt","amount":18.75,"description":"Netflix share","person":"Abu","debtType":"they_owe"}[/ACTION]
[ACTION]{"type":"add_debt","amount":18.75,"description":"Netflix share","person":"Ahmad","debtType":"they_owe"}[/ACTION]

Debt payment:
User: "ali bayar rm50"
Response: I'll record Ali's payment.
[ACTION]{"type":"debt_update","amount":50,"description":"Ali's payment","person":"Ali"}[/ACTION]

Wallet transfer:
User: "transfer rm200 from maybank to tng"
Response: Moving RM 200 from Maybank to TNG.
[ACTION]{"type":"transfer","amount":200,"description":"transfer to tng","fromWallet":"Maybank","toWallet":"TNG"}[/ACTION]

Goal contribution:
User: "simpan rm500 for japan trip"
Response: Adding RM 500 to your Japan Trip goal!
[ACTION]{"type":"add_goal_contribution","amount":500,"description":"saving for japan","goalName":"Japan Trip"}[/ACTION]

Past date:
User: "semalam lunch rm12"
Response: Got it — yesterday's lunch, RM12. Tap to confirm.
[ACTION]{"type":"add_expense","amount":12,"description":"lunch","category":"food","date":"2026-03-12"}[/ACTION]

Multi-item — ONE block each, echo the math:
User: "nasi goreng rm8, teh ais rm2, parking rm3"
Response: Lined up 3 — RM8 nasi goreng, RM2 teh ais, RM3 parking (RM13 total). Tap each to confirm.
[ACTION]{"type":"add_expense","amount":8,"description":"nasi goreng","category":"food"}[/ACTION]
[ACTION]{"type":"add_expense","amount":2,"description":"teh ais","category":"food"}[/ACTION]
[ACTION]{"type":"add_expense","amount":3,"description":"parking","category":"transport"}[/ACTION]

Echo computed amount:
User: "kopi rm3.50 x 2"
Response: RM3.50 x2 = RM7 for kopi — tap to confirm.
[ACTION]{"type":"add_expense","amount":7,"description":"kopi x2","category":"food"}[/ACTION]

User: "gaji masuk 1.2k"
Response: 1.2k = RM1,200 income — tap to confirm.
[ACTION]{"type":"add_income","amount":1200,"description":"gaji","category":"income"}[/ACTION]

Cancel subscription:
User: "cancel gym subscription"
Response: Done — cancelled your gym subscription.
[ACTION]{"type":"cancel_subscription","amount":0,"description":"gym"}[/ACTION]

Forgive debt:
User: "lupakan la hutang ali tu"
Response: Okay — Ali's debt is forgiven.
[ACTION]{"type":"forgive_debt","amount":0,"description":"forgiven","person":"Ali"}[/ACTION]

Update subscription:
User: "netflix naik harga rm65 now"
Response: Updated your Netflix subscription.
[ACTION]{"type":"update_subscription","amount":0,"description":"Netflix","newAmount":65}[/ACTION]

BNPL purchase:
User: "beli phone rm2000 guna spaylater"
Response: Recording your SPayLater purchase.
[ACTION]{"type":"add_bnpl","amount":2000,"description":"phone","category":"shopping","creditWallet":"SPayLater"}[/ACTION]

Credit repayment:
User: "bayar spaylater rm500 from maybank"
Response: Paying off RM 500 on SPayLater.
[ACTION]{"type":"repay_credit","amount":500,"description":"monthly payment","creditWallet":"SPayLater","fromWallet":"Maybank"}[/ACTION]

Update savings:
User: "TNG+ sekarang RM 5200"
Response: Updated your TNG GO+ balance.
[ACTION]{"type":"update_savings","amount":5200,"description":"TNG+","accountName":"TNG+"}[/ACTION]

Add savings account:
User: "aku baru open ASB, letak RM 5000"
Response: Nice — added your ASB account!
[ACTION]{"type":"add_savings_account","amount":5000,"description":"ASB","accountType":"asb","initialInvestment":5000}[/ACTION]

Create goal:
User: "aku nak simpan untuk laptop baru, target RM 5000 by december"
Response: Created your laptop savings goal!
[ACTION]{"type":"create_goal","amount":5000,"description":"Laptop Baru","goalTarget":5000,"goalDeadline":"2026-12-31"}[/ACTION]

Withdraw from goal:
User: "ambil RM 500 dari emergency fund"
Response: Withdrawing from your Emergency Fund.
[ACTION]{"type":"withdraw_goal","amount":500,"description":"Emergency Fund","goalName":"Emergency Fund"}[/ACTION]

Delete transaction:
User: "delete the RM 2600 salary entry"
Response: Deleted the salary entry.
[ACTION]{"type":"delete_transaction","amount":2600,"description":"salary","matchType":"income"}[/ACTION]

Delete duplicate entries:
User: "there are two RM 2600 salary entries, delete both"
Response: Removing both duplicate entries.
[ACTION]{"type":"delete_transaction","amount":2600,"description":"salary","matchType":"income","deleteAll":true}[/ACTION]

Edit transaction amount:
User: "my salary is actually RM 2900, not RM 2600"
Response: Fixed — updated your salary to RM 2,900.00.
[ACTION]{"type":"edit_transaction","amount":2600,"description":"salary","matchType":"income","newAmount":2900}[/ACTION]

Edit transaction details:
User: "change yesterday's grab to transport category"
Response: Updated the category.
[ACTION]{"type":"edit_transaction","amount":0,"description":"grab","newCategory":"transport","date":"2026-03-18"}[/ACTION]

Set budget:
User: "set food budget RM 500"
Response: Budget set for food!
[ACTION]{"type":"add_budget","amount":500,"budgetCategory":"food","description":"food budget"}[/ACTION]

Edit budget:
User: "change food budget to RM 600"
Response: Updated your food budget.
[ACTION]{"type":"edit_budget","amount":600,"budgetCategory":"food","description":"food budget"}[/ACTION]

Delete budget:
User: "buang bajet transport"
Response: Removed your transport budget.
[ACTION]{"type":"delete_budget","budgetCategory":"transport","description":"transport budget"}[/ACTION]

Delete debt:
User: "delete ali's debt, salah masuk"
Response: Removed Ali's debt entry.
[ACTION]{"type":"delete_debt","person":"ali","description":"ali's debt"}[/ACTION]

Edit debt:
User: "actually ali owes RM 500 not RM 300"
Response: Fixed — Ali's debt updated.
[ACTION]{"type":"edit_debt","person":"ali","amount":500,"description":"ali's debt"}[/ACTION]

Pause goal:
User: "pause japan trip goal"
Response: Paused your Japan Trip goal.
[ACTION]{"type":"pause_goal","goalName":"japan trip","description":"pause japan goal"}[/ACTION]

Archive goal:
User: "dah siap emergency fund goal"
Response: Nice — archived your Emergency Fund goal!
[ACTION]{"type":"archive_goal","goalName":"emergency fund","description":"archive goal"}[/ACTION]

Delete goal:
User: "delete travel goal"
Response: Removed your Travel goal.
[ACTION]{"type":"delete_goal","goalName":"travel","description":"delete travel goal"}[/ACTION]

Pause subscription:
User: "pause netflix dulu"
Response: Paused your Netflix subscription.
[ACTION]{"type":"pause_subscription","description":"netflix"}[/ACTION]

Add wallet:
User: "add wallet called Tabung Kecemasan"
Response: Created your new wallet!
[ACTION]{"type":"add_wallet","description":"Tabung Kecemasan","amount":0,"walletType":"ewallet"}[/ACTION]`;
