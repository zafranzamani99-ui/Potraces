/**
 * budgetReality.ts — turns the user's REAL tracked data into the engine's inputs.
 *
 * SAFE: pure functions, ZERO store/RN imports (only type-only imports of the engine
 * contracts, which are erased at build). Imported by nothing in the app yet — deleting
 * it leaves the app byte-for-byte unchanged. The thin `getState()` glue that reads the
 * live stores is deliberately NOT here; it belongs in the (gated) wiring step.
 *
 * WHY this shape: the budgeting engine must be fed by DETERMINISTIC, real numbers — the
 * LLM never invents ringgit. These helpers compute the parts of TailorInput/UserReality
 * that have a clean source in tracked data (trailing spend, income/spend averages, debt
 * owed, cash buffer). Fields the app does NOT track yet (true net take-home, the locked-in
 * commitments list, risk/discipline/psychology profile) are LEFT to the caller via
 * `overrides` — never guessed, because a confident wrong number is the one thing this
 * feature must avoid. The critic tolerates the resulting `undefined`s gracefully.
 *
 * All amounts RM/month. `asOf` is passed in (no Date.now here) so results are deterministic
 * and unit-testable.
 */

import { startOfMonth, endOfMonth, subMonths, isWithinInterval } from 'date-fns';
import type { TailorInput, CommitmentInput } from './budgetModels';
import type { UserReality } from './critic';

/** Narrow, structural views of the store records we read — real Transaction/Debt/Wallet
 *  are wider and assign to these by structural typing, so no coupling to types/index.ts. */
export interface RealityTxn {
  type: string; // 'income' | 'expense' (guarded by value; widened so live Transaction[] assigns cleanly)
  amount: number;
  category: string;
  date: Date | string;
}
export interface RealityDebt {
  type: string; // 'i_owe' | 'they_owe' (guarded by value)
  totalAmount: number;
  paidAmount: number;
  status: string; // 'pending' | 'partial' | 'settled'
}
export interface RealityWallet {
  type: string; // 'bank' | 'credit' | ...
  balance: number;
  usedCredit?: number;
}

const fin = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
const toDate = (d: Date | string): Date => (d instanceof Date ? d : new Date(d));

/** The window of the last `months` COMPLETE months before `asOf` (excludes the current,
 *  partial month so a half-finished month never understates the average). */
function completeMonthsWindow(asOf: Date, months: number): { start: Date; end: Date } {
  const m = Math.max(1, Math.floor(months));
  return { start: startOfMonth(subMonths(asOf, m)), end: endOfMonth(subMonths(asOf, 1)) };
}

function inWindow(d: Date | string, w: { start: Date; end: Date }): boolean {
  const dt = toDate(d);
  return !isNaN(dt.getTime()) && isWithinInterval(dt, w);
}

/**
 * Average expense per category over the last `months` complete months (RM/month).
 * Divides each category total by `months` — so a category absent in some months is
 * averaged as 0 across the window, which is the honest monthly figure (NOT the average
 * of only the months it appeared in). This is the engine's `trailingAvgByCategory`.
 */
export function trailingAvgByCategory(txns: RealityTxn[], asOf: Date, months = 3): Record<string, number> {
  const m = Math.max(1, Math.floor(months));
  const w = completeMonthsWindow(asOf, m);
  const totals: Record<string, number> = {};
  for (const t of txns) {
    if (t.type !== 'expense' || !inWindow(t.date, w)) continue;
    const cat = t.category || 'uncategorized';
    totals[cat] = (totals[cat] || 0) + fin(t.amount);
  }
  const avg: Record<string, number> = {};
  for (const cat of Object.keys(totals)) avg[cat] = totals[cat] / m;
  return avg;
}

/**
 * How many COMPLETE months of history exist (from the earliest transaction up to, but
 * excluding, the current month), capped at `cap`. Drives an adaptive trailing window so a
 * 6-week-old user isn't measured against a hard 3-month wall. 0 = brand-new (this month only).
 */
export function availableMonths(txns: RealityTxn[], asOf: Date, cap = 6): number {
  let earliest: Date | null = null;
  for (const t of txns) {
    const d = toDate(t.date);
    if (!isNaN(d.getTime()) && (!earliest || d < earliest)) earliest = d;
  }
  if (!earliest) return 0;
  const months = (asOf.getFullYear() - earliest.getFullYear()) * 12 + (asOf.getMonth() - earliest.getMonth());
  return Math.max(0, Math.min(cap, months));
}

/** Average total income / expense per month over the window (RM/month each). */
function monthlyFlows(txns: RealityTxn[], asOf: Date, months: number): { cameIn: number; wentOut: number } {
  const m = Math.max(1, Math.floor(months));
  const w = completeMonthsWindow(asOf, m);
  let income = 0;
  let expense = 0;
  for (const t of txns) {
    if (!inWindow(t.date, w)) continue;
    if (t.type === 'income') income += fin(t.amount);
    else if (t.type === 'expense') expense += fin(t.amount);
  }
  return { cameIn: income / m, wentOut: expense / m };
}

/** Detect irregular income: any complete month with zero income, or a high spread
 *  (max month ≥ 1.6× min month) across the window → 'irregular'. Else 'steady'. */
export function detectCadence(txns: RealityTxn[], asOf: Date, months = 3): 'steady' | 'irregular' {
  const m = Math.max(1, Math.floor(months));
  const perMonth: number[] = [];
  for (let i = 1; i <= m; i++) {
    const start = startOfMonth(subMonths(asOf, i));
    const end = endOfMonth(subMonths(asOf, i));
    let income = 0;
    for (const t of txns) {
      if (t.type === 'income' && inWindow(t.date, { start, end })) income += fin(t.amount);
    }
    perMonth.push(income);
  }
  if (perMonth.length < 2) return 'steady';
  if (perMonth.some((v) => v <= 0)) return 'irregular';
  const max = Math.max(...perMonth);
  const min = Math.min(...perMonth);
  return min > 0 && max / min >= 1.6 ? 'irregular' : 'steady';
}

/** Outstanding money the user owes another party (i_owe debts not yet settled). */
function iOweOutstanding(debts: RealityDebt[]): number {
  return debts
    .filter((d) => d.type === 'i_owe' && d.status !== 'settled')
    .reduce((s, d) => s + Math.max(0, fin(d.totalAmount) - fin(d.paidAmount)), 0);
}

/** Credit/card balance currently carried across credit-type wallets. */
function creditUsed(wallets: RealityWallet[]): number {
  return wallets.filter((w) => w.type === 'credit').reduce((s, w) => s + fin(w.usedCredit), 0);
}

/** Cash on hand across non-credit wallets (the would-be emergency buffer). */
function cashOnHand(wallets: RealityWallet[]): number {
  return wallets.filter((w) => w.type !== 'credit').reduce((s, w) => s + fin(w.balance), 0);
}

export interface RealityStores {
  txns: RealityTxn[];
  debts: RealityDebt[];
  wallets: RealityWallet[];
  asOf: Date;
  /** trailing window length; 3 by default, up to 6 when enough history exists */
  months?: number;
}

/**
 * Build UserReality (the critic's view) from real tracked data. Only fills fields with a
 * trustworthy source; everything else stays `undefined` (the critic reads `undefined` as
 * "no signal" and simply doesn't raise that objection). Never fabricates a flag.
 *
 * Deliberately left undefined (no clean source yet): bnplActivePlans/bnplMonthly (the app
 * can't separate BNPL from cards), ptptn*, lendingApp*, convertibleLoan*, festiveSpikeOnCredit,
 * lifestyleInflation, debtRoseSavingsFlat, wantsOnCreditZeroBuffer. These need debt-instrument
 * classification or trend detection we add later.
 */
export function buildUserReality(s: RealityStores): UserReality {
  const months = s.months ?? 3;
  const { cameIn, wentOut } = monthlyFlows(s.txns, s.asOf, months);
  const unsecured = creditUsed(s.wallets) + iOweOutstanding(s.debts);
  const buffer = cashOnHand(s.wallets);
  const bufferMonths = wentOut > 0 ? buffer / wentOut : undefined;

  return {
    monthlyCameIn: cameIn,
    monthlyWentOut: wentOut,
    unsecuredDebtTotal: unsecured > 0 ? unsecured : undefined,
    carriesCardBalance: creditUsed(s.wallets) > 0 || undefined,
    bufferMonths,
    cadence: detectCadence(s.txns, s.asOf, months),
  };
}

/**
 * Build the engine's TailorInput from real data, with an `overrides` seam for the fields
 * the app does NOT track yet. Derived-from-data defaults:
 *   - takeHomeIncome  ← trailing average income (a stand-in for true net take-home until a
 *                        profile captures it; override with the real figure when known)
 *   - cadence         ← detected from income regularity
 *   - trailingAvgByCategory ← real per-category averages
 *   - hasHighInterestDebt   ← carries a credit balance
 *   - hasEmergencyBuffer    ← ≥ 3 months of spend sitting in cash
 * Caller-supplied (no store source — pass via overrides; left empty/undefined otherwise):
 *   commitments[], setAsideGoalMonthly, dependents, riskAppetite, discipline, psychology,
 *   goal, transportMode.
 */
export function buildTailorInput(s: RealityStores, overrides?: Partial<TailorInput>): TailorInput {
  const months = s.months ?? 3;
  const { cameIn, wentOut } = monthlyFlows(s.txns, s.asOf, months);
  const buffer = cashOnHand(s.wallets);
  const commitments: CommitmentInput[] = overrides?.commitments ?? [];

  const base: TailorInput = {
    takeHomeIncome: cameIn,
    cadence: detectCadence(s.txns, s.asOf, months),
    commitments,
    trailingAvgByCategory: trailingAvgByCategory(s.txns, s.asOf, months),
    hasHighInterestDebt: creditUsed(s.wallets) > 0,
    hasEmergencyBuffer: wentOut > 0 ? buffer / wentOut >= 3 : false,
  };

  // overrides win for any field the caller knows better (real take-home, profile, commitments)
  return { ...base, ...overrides };
}

/**
 * Belanjawanku-inspired default monthly spending shape for someone with NO history yet —
 * proportions of spendable money across the app's default expense-category IDs. Food-forward
 * (the Malaysian reality). A STARTER the owner tweaks, NEVER presented as their real spend.
 */
export const STARTER_SPLIT: Record<string, number> = {
  food: 0.35,
  transport: 0.15,
  bills: 0.2,
  shopping: 0.1,
  entertainment: 0.08,
  other: 0.12,
};

/**
 * Split `spendable` into per-category budgets so EVERY user gets a one-tap starter budget,
 * not a blank form. Weights are the user's OWN trailing spend when they have it (real
 * categories), else the STARTER_SPLIT template (brand-new users). Only categories in
 * `validIds` survive. Sum is preserved (drift parked on the biggest, never negative).
 */
export function fallbackAllocations(
  spendable: number,
  trailing: Record<string, number>,
  validIds: Set<string>,
): { category: string; amount: number }[] {
  if (!(spendable > 0)) return [];
  const weights: Record<string, number> = {};
  for (const [cat, w] of Object.entries(trailing)) {
    if (w > 0 && validIds.has(cat)) weights[cat] = w;
  }
  if (Object.keys(weights).length === 0) {
    for (const [cat, w] of Object.entries(STARTER_SPLIT)) {
      if (validIds.has(cat)) weights[cat] = w;
    }
  }
  const sum = Object.values(weights).reduce((s, w) => s + w, 0);
  if (sum <= 0) return [];
  const allocs = Object.entries(weights).map(([category, w]) => ({
    category,
    amount: Math.round((w / sum) * spendable),
  }));
  const drift = Math.round(spendable) - allocs.reduce((s, a) => s + a.amount, 0);
  if (drift !== 0 && allocs.length) {
    const biggest = allocs.reduce((a, b) => (b.amount > a.amount ? b : a));
    biggest.amount = Math.max(0, biggest.amount + drift);
  }
  return allocs;
}

/**
 * Psychology of round numbers: people budget in clean figures (RM800, RM300, RM50), not
 * RM825.17. Rounds DOWN to a sensible step (bigger numbers round coarser) — clean to read AND
 * conservative (never allocates more than computed; the leftover flows to the absorber bucket).
 * e.g. 825→800, 472→450, 102→100.
 */
export function roundNice(n: number): number {
  if (!(n > 0)) return 0;
  if (n < 50) return Math.floor(n / 5) * 5; // < 50  → step 5
  if (n < 200) return Math.floor(n / 10) * 10; // 50–200 → step 10
  return Math.floor(n / 50) * 50; // ≥ 200 → step 50
}

/**
 * Round every allocation to a clean figure while keeping the TOTAL exact — the small remainder
 * is parked on the LARGEST bucket (the Malaysian "makan absorbs the leftover" pattern from real
 * salary plans). So the buckets read clean and the plan still adds up to the ringgit.
 */
export function roundAllocationsNice(
  allocs: { category: string; amount: number }[],
  total: number,
): { category: string; amount: number }[] {
  if (!allocs.length) return allocs;
  const rounded = allocs.map((a) => ({ ...a, amount: roundNice(a.amount) }));
  const drift = Math.round(total) - rounded.reduce((s, a) => s + a.amount, 0);
  if (drift !== 0) {
    const biggest = rounded.reduce((a, b) => (b.amount > a.amount ? b : a));
    biggest.amount = Math.max(0, biggest.amount + drift);
  }
  return rounded;
}
