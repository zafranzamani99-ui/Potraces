/**
 * critic.ts — the deterministic critic. Two pure jobs:
 *
 *   1. reviewPlan()  — challenge a proposed budget plan against the anti-pattern
 *                      library (echoKnowledge.ts) + the user's tracked reality.
 *                      Wired into the planner loop (planner.ts).
 *   2. reviewReply() — make ECHO CHAT smarter & safer: gate any reply text for the
 *                      banned advice phrases / banned words / orphan confirmations
 *                      that the system prompt forbids (moneyChat.ts:55-56, 62-63).
 *                      Wired log-only into MoneyChat.processResponse (telemetry
 *                      first — never blocks a reply).
 *
 * SAFE: imports only budgetModels.ts + echoKnowledge.ts. Every objection is
 * EVIDENCE-GATED — no figure/source, no objection — so the critic can never raise
 * a vague or hallucinated complaint.
 */

import type { TailoredPlan, TailorInput, Lang } from './budgetModels';
import { FAILURE_MODES, THRESHOLDS, SEVERITY_WEIGHT, getFailureMode, type Severity, type FailureMode } from '../constants/echoKnowledge';

/** What the critic knows about the user's real situation (beyond the plan inputs). */
export interface UserReality {
  monthlyCameIn: number;
  monthlyWentOut?: number;
  unsecuredDebtTotal?: number; // cards + personal loans + BNPL
  carriesCardBalance?: boolean;
  bnplActivePlans?: number;
  bnplMonthly?: number;
  bufferMonths?: number; // months of went-out already saved
  cadence?: 'steady' | 'irregular';
  ptptnBalance?: number;
  ptptnRepaying?: boolean;
  wantsOnCreditZeroBuffer?: boolean;
  debtRoseSavingsFlat?: boolean;
  festiveSpikeOnCredit?: boolean;
  lifestyleInflation?: boolean;
  /** opened a new app loan (GOpinjam/SLoan/Boost) before the last one was clear */
  lendingAppReborrow?: boolean;
  lendingApp?: string;
  /** a JPA/MARA convertible "maybe-loan" whose grade/service condition is at risk */
  convertibleLoanAtRisk?: boolean;
  convertibleLoanProvider?: string;
}

export interface Objection {
  id: string;
  principle: string;
  severity: Severity;
  evidence: string; // a figure/quote — REQUIRED; objections without it are dropped
  nudge: string; // calm, filled copy
  source: string;
  suggestedRevision?: 'raise-set-aside-floor' | 'cap-to-trailing-actual';
}

const round = (n: number) => Math.round(n);

function obj(id: string, evidence: string, nudge: string, extra?: Partial<Objection>): Objection {
  const m = getFailureMode(id);
  return { id, principle: m.label || id.replace(/-/g, ' '), severity: m.severity, source: m.source, evidence, nudge, ...extra };
}

/** Review a proposed plan against the library + the user's reality. Returns grounded objections. */
export function reviewPlan(plan: TailoredPlan, input: TailorInput, reality: UserReality, lang: Lang = 'en'): Objection[] {
  const out: Objection[] = [];
  // Pick the BM or EN nudge template BEFORE the critic fills {placeholders} (same tokens in both).
  const nudgeOf = (fm: FailureMode) => (lang === 'ms' ? fm.nudgeMs : fm.nudge);
  const cameIn = reality.monthlyCameIn || plan.takeHomeIncome;
  const hasBuffer = (reality.bufferMonths ?? 0) >= THRESHOLDS.bufferMonthsMin;

  // 1. unsecured-debt-multiple
  if (reality.unsecuredDebtTotal != null && cameIn > 0) {
    const mult = reality.unsecuredDebtTotal / cameIn;
    if (mult >= THRESHOLDS.unsecuredDebtMultipleNote) {
      const m = getFailureMode('unsecured-debt-multiple');
      out.push(obj('unsecured-debt-multiple',
        `unsecured debt RM${round(reality.unsecuredDebtTotal)} ≈ ${mult.toFixed(1)}x came-in (AKPK distressed ≈ ${THRESHOLDS.unsecuredDebtMultipleDistressed}x)`,
        nudgeOf(m).replace('{mult}', mult.toFixed(1)),
        { severity: mult >= THRESHOLDS.unsecuredDebtMultipleDistressed ? 'serious' : 'note' }));
    }
  }
  // 2. minimum-payment-revolver
  if (reality.carriesCardBalance) {
    const m = getFailureMode('minimum-payment-revolver');
    out.push(obj('minimum-payment-revolver', 'card balance carried + near-minimum payment at 15-18% p.a.', nudgeOf(m)));
  }
  // 3. bnpl-stacking
  const bnplShare = reality.bnplMonthly && cameIn > 0 ? reality.bnplMonthly / cameIn : 0;
  const bnplCount = reality.bnplActivePlans ?? 0;
  if (bnplCount >= THRESHOLDS.bnplStackCount || bnplShare >= THRESHOLDS.bnplShareOfCameIn) {
    const m = getFailureMode('bnpl-stacking');
    out.push(obj('bnpl-stacking',
      `${bnplCount >= 2 ? bnplCount + ' active BNPL plans' : 'pay-later'} ~${Math.round(bnplShare * 100)}% of came-in (BNM: 12% of users miss a payment)`,
      nudgeOf(m).replace('{n}', bnplCount >= 2 ? String(bnplCount) : 'a few')));
  }
  // 4. wants-funded-by-credit
  if (reality.wantsOnCreditZeroBuffer) {
    const m = getFailureMode('wants-funded-by-credit');
    out.push(obj('wants-funded-by-credit', 'discretionary buy on credit while cash buffer ≤ 0 (AKPK: 38% bought things not needed)', nudgeOf(m)));
  }
  // 5. no-buffer-irregular-income
  if ((reality.cadence ?? input.cadence) === 'irregular' && !hasBuffer) {
    const m = getFailureMode('no-buffer-irregular-income');
    out.push(obj('no-buffer-irregular-income', 'irregular came-in + under 1 month set aside (BNM: unstable income = top late-payment reason)',
      nudgeOf(m)));
  }
  // 6. edu-loan-ignored (PTPTN)
  if ((reality.ptptnBalance ?? 0) > 0 && !reality.ptptnRepaying) {
    const m = getFailureMode('edu-loan-ignored');
    out.push(obj('edu-loan-ignored', `PTPTN balance RM${round(reality.ptptnBalance!)} with nothing going to it (salary-deduction enforcement exists)`, nudgeOf(m)));
  }
  // 6b. lending-app-spiral (GOpinjam / SLoan / Boost re-borrow)
  if (reality.lendingAppReborrow) {
    const m = getFailureMode('lending-app-spiral');
    out.push(obj('lending-app-spiral',
      `new ${reality.lendingApp || 'app'} loan opened before the previous cleared (short app loans up to 36% p.a.)`,
      nudgeOf(m).replace('{app}', reality.lendingApp || 'app')));
  }
  // 6c. scholarship-bond-breakage (JPA/MARA convertible "maybe-loan" condition at risk)
  if (reality.convertibleLoanAtRisk) {
    const m = getFailureMode('scholarship-bond-breakage');
    out.push(obj('scholarship-bond-breakage',
      `${reality.convertibleLoanProvider || 'JPA/MARA'} convertible loan condition at risk — full amount can come due at once (cases up to ~RM500k)`,
      nudgeOf(m)));
  }
  // 7. festive-credit-spike
  if (reality.festiveSpikeOnCredit) {
    const m = getFailureMode('festive-credit-spike');
    out.push(obj('festive-credit-spike', 'festive-month spike financed by new credit rather than a sinking fund', nudgeOf(m)));
  }
  // 8. debt-outpacing-savings
  if (reality.debtRoseSavingsFlat) {
    const m = getFailureMode('debt-outpacing-savings');
    out.push(obj('debt-outpacing-savings', 'total owed rose month-over-month while set-aside held flat (KRI 2024)', nudgeOf(m)));
  }
  // 9. thin-income-overcommitted (plan-internal)
  if (cameIn > 0 && cameIn < THRESHOLDS.thinIncomeCeil && plan.realNeedsRatio > THRESHOLDS.thinCommitmentRatio) {
    const m = getFailureMode('thin-income-overcommitted');
    out.push(obj('thin-income-overcommitted',
      `locked-in ${Math.round(plan.realNeedsRatio * 100)}% of a sub-RM${THRESHOLDS.thinIncomeCeil} came-in (~70% of grads under RM2,000)`,
      nudgeOf(m).replace('{pct}', String(Math.round(plan.realNeedsRatio * 100)))));
  }
  // 10. lifestyle-inflation-ratchet
  if (reality.lifestyleInflation) {
    const m = getFailureMode('lifestyle-inflation-ratchet');
    out.push(obj('lifestyle-inflation-ratchet', 'discretionary rose after an income bump without a matching set-aside rise', nudgeOf(m)));
  }
  // 11. plan-leaves-no-cushion (plan-internal, auto-revisable) — but never fight a
  //     debt-first strategy, where the tiny set-aside is deliberate.
  if (
    plan.setAside < plan.breathingRoom * THRESHOLDS.noCushionShareOfRoom &&
    !hasBuffer && plan.breathingRoom > 0 &&
    input.goal !== 'clear_debt' && plan.model !== 'step_ladder'
  ) {
    const m = getFailureMode('plan-leaves-no-cushion');
    out.push(obj('plan-leaves-no-cushion', `set-aside rounds to RM${plan.setAside} of RM${plan.breathingRoom} breathing room, no buffer yet`,
      nudgeOf(m), { suggestedRevision: 'raise-set-aside-floor' }));
  }
  // 12. plan-vs-actual-undershoot (plan-internal): flag the biggest gap below run-rate
  let worst: { cat: string; plan: number; actual: number; gap: number } | null = null;
  for (const a of plan.allocations) {
    const actual = input.trailingAvgByCategory[a.category];
    if (actual == null || actual <= 0) continue;
    const gap = actual - a.amount;
    if (a.amount / actual < THRESHOLDS.undershootRatio && gap >= THRESHOLDS.undershootMinGap) {
      if (!worst || gap > worst.gap) worst = { cat: a.category, plan: a.amount, actual: round(actual), gap };
    }
  }
  if (worst) {
    const m = getFailureMode('plan-vs-actual-undershoot');
    out.push(obj('plan-vs-actual-undershoot', `${worst.cat}: plan RM${worst.plan} vs ~RM${worst.actual} trailing actual`,
      nudgeOf(m).replace('{cat}', worst.cat).replace('{plan}', String(worst.plan)).replace('{actual}', String(worst.actual)),
      { suggestedRevision: 'cap-to-trailing-actual' }));
  }

  // evidence gate: drop anything without a real figure/quote
  return out.filter((o) => o.evidence && o.evidence.trim().length > 0);
}

export function planPenalty(objections: Objection[]): number {
  return objections.reduce((s, o) => s + SEVERITY_WEIGHT[o.severity], 0);
}

// --- Echo chat safety: review any reply text -------------------------------

const ADVICE_PATTERNS: { re: RegExp; detail: string }[] = [
  { re: /\byou should\b/i, detail: '"you should" — advice, not observation' },
  { re: /\byou need to\b/i, detail: '"you need to" — advice' },
  { re: /\bi recommend\b/i, detail: '"I recommend" — advice' },
  { re: /\byou must\b/i, detail: '"you must" — advice' },
  { re: /\b(consider|try to)\b/i, detail: '"consider / try to" — soft advice' },
];
// "budget" excluded here — it's banned in COPY but appears in legit words; handled separately if needed.
const BANNED_WORDS = ['profit', 'loss', 'revenue', 'roi', 'inventory'];
const CONFIRM_PATTERNS = [/lined up/i, /dah sedia/i, /tap to confirm/i, /\bsaved it\b/i, /i'?ve saved/i, /dah simpan/i];

export type ReplyIssueKind = 'advice' | 'banned-word' | 'orphan-confirmation';
export interface ReplyIssue {
  kind: ReplyIssueKind;
  detail: string;
}

/**
 * Gate an Echo reply before its chips render.
 * @param hasAction whether the raw model output carried at least one [ACTION] block.
 */
export function reviewReply(text: string, hasAction: boolean): ReplyIssue[] {
  const issues: ReplyIssue[] = [];
  for (const p of ADVICE_PATTERNS) if (p.re.test(text)) issues.push({ kind: 'advice', detail: p.detail });
  for (const w of BANNED_WORDS) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(text)) issues.push({ kind: 'banned-word', detail: `banned word "${w}"` });
  }
  if (!hasAction && CONFIRM_PATTERNS.some((re) => re.test(text))) {
    issues.push({ kind: 'orphan-confirmation', detail: 'says it saved/lined up something but carries no [ACTION] to confirm' });
  }
  return issues;
}

// Deterministic, grammar-safe fixes applied to a reply before it's shown. ONLY
// the swaps that read correctly in every context: soften the clear advice openers
// ("you should"→"you could") and replace banned finance words with the app's own
// vocabulary ("profit"→"kept"). Idiom-risky words are deliberately NOT auto-fixed
// — "loss" ("at a loss"), "consider"/"try to", and orphan confirmations still get
// FLAGGED by reviewReply for telemetry, but are left to a human/prompt to handle.
const REPLY_FIXES: { re: RegExp; to: string }[] = [
  // grammar-safe advice softening ("you should save" → "you could save")
  { re: /\byou should\b/gi, to: 'you could' },
  { re: /\byou need to\b/gi, to: 'you could' },
  { re: /\byou must\b/gi, to: 'you could' },
  // banned finance words → the app's own vocabulary. ("I recommend" is left
  // alone — no verb-form-safe swap exists; reviewReply still flags it.)
  { re: /\bprofit\b/gi, to: 'kept' },
  { re: /\brevenue\b/gi, to: 'money in' },
  { re: /\broi\b/gi, to: 'return' },
  { re: /\binventory\b/gi, to: 'stock' },
];
const matchCase = (src: string, rep: string): string =>
  src[0] === src[0].toUpperCase() ? rep.charAt(0).toUpperCase() + rep.slice(1) : rep;

/** Clean a reply for display (advice softening + banned-word swaps). Unchanged when nothing matches. */
export function cleanReply(text: string): string {
  let out = text;
  for (const f of REPLY_FIXES) out = out.replace(f.re, (m) => matchCase(m, f.to));
  return out;
}
