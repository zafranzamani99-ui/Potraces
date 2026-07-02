/**
 * budgetPlan.ts — the deterministic MONTHLY-BUDGET planner (sister to playbookPlan.ts).
 *
 * Same shared engine (budgetModels + planner + critic), recurring framing: take-home income →
 * Echo's recommended model → a reality-sized set-aside + protected commitments + per-category
 * spending budgets, every figure rounded clean (RM800 not RM825). The user can switch model or
 * tweak any category; the engine — never the LLM — computes the ringgit, so switching only
 * re-frames the same money.
 *
 * PURE + synchronous: ZERO store/RN imports. The BudgetPlannerSheet supplies live store data and
 * owns all state; this file is fully unit-testable.
 */

import type { RealityTxn, RealityDebt, RealityWallet } from './budgetReality';
import {
  buildTailorInput,
  buildUserReality,
  fallbackAllocations,
  roundNice,
  roundAllocationsNice,
  STARTER_SPLIT,
} from './budgetReality';
import { proposeAndReview } from './planner';
import { recommendModel, getModel } from './budgetModels';
import type { BudgetModelId, CommitmentInput } from './budgetModels';
import type { Objection } from './critic';
import type { RealityCheck } from '../constants/myEconomics';

export interface BudgetPlanRow {
  category: string;
  amount: number;
  /** the user's own trailing monthly spend on this category (0 if none) — the "spent ~RM/mo" anchor. */
  trailingAvg: number;
  /** true when the figure came from the Belanjawanku STARTER split (no real history yet). */
  fromStarter: boolean;
}

/** A calm honest note from the critic — the differentiator: grounded, evidence-backed. */
export interface BudgetNote {
  nudge: string;
  evidence: string;
  serious: boolean;
}

export interface BudgetPlan {
  modelId: BudgetModelId;
  modelLabel: string;
  /** plain-language reason — Echo's full pitch when on the recommendation, the model's own why after a switch. */
  reason: string;
  recommendedId: BudgetModelId;
  runnerUpId: BudgetModelId | null;
  takeHomeIncome: number;
  setAside: number;
  /** where the set-aside goes — a safety cushion first, then growth. */
  setAsideBreakdown: { cushion: number; grow: number };
  commitmentsTotal: number;
  leftToSpend: number;
  rows: BudgetPlanRow[];
  /** the Belanjawanku cost-of-living sanity check (calm, no-red, ready to show). */
  realityCheck: RealityCheck;
  /** up to 2 grounded critic notes (serious first) — honest, never alarmist. */
  notes: BudgetNote[];
}

export interface BudgetPlanInput {
  takeHomeIncome: number;
  commitments: CommitmentInput[];
  txns: RealityTxn[];
  debts: RealityDebt[];
  wallets: RealityWallet[];
  asOf: Date;
  /** optional model override; omitted → Echo's recommendation. */
  modelId?: BudgetModelId;
}

export function computeBudgetPlan(inp: BudgetPlanInput): BudgetPlan {
  const { takeHomeIncome, commitments, txns, debts, wallets, asOf, modelId } = inp;
  const stores = { txns, debts, wallets, asOf };
  const input = buildTailorInput(stores, { takeHomeIncome, commitments });
  const reality = buildUserReality(stores);

  const rec = recommendModel(input);
  const chosen = modelId ?? rec.id;
  const reviewed = proposeAndReview(input, reality, chosen);
  const plan = reviewed.plan;

  // Per-category spending budgets — engine's split if it has one, else a guaranteed starter
  // split (the budget screen is ABOUT category limits, so every model yields category rows).
  const trailing = input.trailingAvgByCategory;
  const hasTrailing = Object.values(trailing).some((v) => v > 0);
  const validIds = new Set<string>([...Object.keys(STARTER_SPLIT), ...Object.keys(trailing)]);
  const split = plan.allocations.filter((a) => a.amount > 0 && a.category !== 'left to spend');
  const living = split.length ? split : fallbackAllocations(plan.leftToSpend, trailing, validIds);

  // Round clean, keep the total exact (biggest bucket absorbs the drift).
  const setAside = roundNice(plan.setAside);
  const cushion = Math.min(setAside, roundNice(plan.setAsideBreakdown.cushion));
  const setAsideBreakdown = { cushion, grow: Math.max(0, setAside - cushion) };
  const leftToSpend = Math.max(0, Math.round(plan.leftToSpend + (plan.setAside - setAside)));

  // Critic's honest notes — serious first, at most two, evidence required.
  const notes: BudgetNote[] = reviewed.objections
    .filter((o: Objection) => o.nudge && o.evidence)
    .sort((a: Objection, b: Objection) => (a.severity === 'serious' ? 0 : 1) - (b.severity === 'serious' ? 0 : 1))
    .slice(0, 2)
    .map((o: Objection) => ({ nudge: o.nudge, evidence: o.evidence, serious: o.severity === 'serious' }));
  const niceRows = roundAllocationsNice(living, leftToSpend);
  const rows: BudgetPlanRow[] = niceRows
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .map((r) => ({
      category: r.category,
      amount: r.amount,
      trailingAvg: Math.round(trailing[r.category] || 0),
      fromStarter: !hasTrailing,
    }));

  return {
    modelId: chosen,
    modelLabel: getModel(chosen).label,
    reason: chosen === rec.id ? rec.why : getModel(chosen).why,
    recommendedId: rec.id,
    runnerUpId: rec.runnerUp ? rec.runnerUp.id : null,
    takeHomeIncome: input.takeHomeIncome,
    setAside,
    setAsideBreakdown,
    commitmentsTotal: plan.protectedTier,
    leftToSpend,
    rows,
    realityCheck: plan.realityCheck,
    notes,
  };
}

/** Monthly take-home derived from real income history (0 = no signal → the sheet asks via bands). */
export function derivedMonthlyIncome(txns: RealityTxn[], asOf: Date): number {
  return Math.round(buildTailorInput({ txns, debts: [], wallets: [], asOf }).takeHomeIncome);
}
