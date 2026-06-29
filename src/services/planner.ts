/**
 * planner.ts — the bounded planner⇄critic loop, fully deterministic (no LLM).
 *
 * SAFE: imports only the (un-wired) budgetModels.ts + critic.ts. Imported by nothing
 * in the app. Deleting it leaves the app byte-for-byte unchanged.
 *
 * Flow: engine proposes a plan → critic reviews it → if a SAFE, deterministic
 * revision is suggested, apply ONE round and keep whichever plan scores better.
 * Hard-capped at 1 round, never blocks, always keeps the best plan. This mirrors the
 * Evaluator-Optimizer pattern, but the optimizer is the deterministic engine — so a
 * revision can never invent a worse-but-confident plan.
 */

import { tailorPlan, recommendModel, type TailorInput, type TailoredPlan, type BudgetModelId } from './budgetModels';
import { reviewPlan, planPenalty, type Objection, type UserReality } from './critic';

export interface PlanResult {
  model: BudgetModelId;
  plan: TailoredPlan;
  objections: Objection[];
  /** true if the critic's revision improved the plan and was kept */
  revised: boolean;
  rounds: number;
  penalty: number;
}

/** Apply a single deterministic revision implied by the critic's objections. */
function reviseInput(input: TailorInput, plan: TailoredPlan, objections: Objection[]): TailorInput | null {
  // raise the set-aside floor when the plan leaves no cushion (or debt/irregular pressure wants one)
  if (objections.some((o) => o.suggestedRevision === 'raise-set-aside-floor')) {
    const floor = Math.round(plan.breathingRoom * 0.06); // clears the 5% no-cushion trigger
    if (floor > plan.setAside) return { ...input, setAsideGoalMonthly: floor };
  }
  // (cap-to-trailing-actual is intentionally NOT auto-applied — being tight on a
  //  category can be deliberate; the critic surfaces it as a note for the user to choose.)
  return null;
}

/**
 * Propose a plan and run one bounded critic round.
 * @param modelId optional override; otherwise Echo's recommended model is used.
 */
export function proposeAndReview(input: TailorInput, reality: UserReality, modelId?: BudgetModelId): PlanResult {
  const model = modelId ?? recommendModel(input).id;

  let plan = tailorPlan(input, model);
  let objections = reviewPlan(plan, input, reality);
  let penalty = planPenalty(objections);
  let revised = false;
  let rounds = 0;

  const revisedInput = reviseInput(input, plan, objections);
  if (revisedInput) {
    rounds = 1; // hard cap — exactly one revision pass, never more
    const plan2 = tailorPlan(revisedInput, model);
    const obj2 = reviewPlan(plan2, revisedInput, reality);
    const pen2 = planPenalty(obj2);
    // keep the revision ONLY if it genuinely scores better
    if (pen2 < penalty) {
      plan = plan2;
      objections = obj2;
      penalty = pen2;
      revised = true;
    }
  }

  return { model, plan, objections, revised, rounds, penalty };
}
