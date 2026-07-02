/**
 * playbookPlan.ts — the DETERMINISTIC Playbook planner (the "one brain" fusion).
 *
 * A Playbook is a one-time lump (a gig payment, bonus, Raya money, a sale) spent down over
 * ~30 days. This planner runs that lump through the SAME budgeting engine the budget surface
 * uses — budgetModels + planner + critic — so every ringgit is computed, never invented by
 * the LLM:
 *   - the lump            → the period's take-home (TailorInput.takeHomeIncome)
 *   - the Playbook's bills → protected commitments (engine's breathingRoom = lump − bills,
 *                            which is exactly the Playbook's "money left to work with")
 *   - the cushion          → engine's reality-sized set-aside (the "purpose decides" answer:
 *                            a survival lump keeps it tiny, a windfall keeps more)
 *   - the rest             → split across the user's REAL trailing categories, or a
 *                            Belanjawanku-style STARTER_SPLIT for a brand-new user
 *   - the one warning      → the critic's most serious grounded objection (or none)
 *
 * Output is a plain EchoPlanResponse, so the existing Playbook UI renders it with no changes.
 *
 * PURE + synchronous + offline: ZERO store/RN imports (only type-only imports), so it is fully
 * unit-testable. The thin getState() glue that reads live stores lives in playbookAI.ts
 * (buildPlaybookPlan), mirroring budgetReality.ts's split. askEchoPlan() layers OPTIONAL Gemini
 * narration on top of these fixed numbers.
 */

import { endOfMonth } from 'date-fns';
import type { EchoPlanResponse, EchoPlanItem, EchoPlanOpts } from './playbookAI';
import { proposeAndReview } from './planner';
import {
  buildTailorInput,
  buildUserReality,
  fallbackAllocations,
  roundNice,
  roundAllocationsNice,
  STARTER_SPLIT,
} from './budgetReality';
import type { RealityTxn, RealityDebt, RealityWallet } from './budgetReality';

// ─── Pure input ─────────────────────────────────────────────

export interface PlaybookPlanInput {
  sourceAmount: number;
  startDate: Date;
  /** bills/debts due in this period — already-committed money, protected first. */
  obligations: { label: string; amount: number }[];
  txns: RealityTxn[];
  debts: RealityDebt[];
  wallets: RealityWallet[];
  /** as-of for trailing averages (the playbook's start, kept deterministic). */
  asOf: Date;
  currency: string;
  opts?: EchoPlanOpts;
}

// ─── Helpers ────────────────────────────────────────────────

export const moneyStr = (currency: string, n: number) =>
  `${currency} ${Math.round(n).toLocaleString('en-MY')}`;

/** Days in the spend window — mirrors the app's existing daily-figure logic. */
function daysInPeriod(start: Date): number {
  if (isNaN(start.getTime())) return 30;
  const end = endOfMonth(start);
  const d = Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1;
  return d >= 7 && d <= 45 ? d : 30;
}

/** What the user said they want → 'last' (stretch it) | 'save' (keep more) | null. */
function intentGoal(intent?: string): 'last' | 'save' | null {
  const s = (intent || '').toLowerCase();
  if (/(last|stretch|survive|tight|cukup|bertahan|sampai|habis bulan)/.test(s)) return 'last';
  if (/(save|simpan|tabung|\bkeep\b|buffer|sisih)/.test(s)) return 'save';
  return null;
}

// ─── Pure planner ───────────────────────────────────────────

export function computePlaybookPlan(inp: PlaybookPlanInput): EchoPlanResponse {
  const { sourceAmount, startDate, obligations, txns, debts, wallets, asOf, currency, opts = {} } = inp;
  const money = (n: number) => moneyStr(currency, n);

  // Bills/obligations → protected commitments (the engine carves these out first).
  const commitments = obligations
    .filter((o) => o.amount > 0)
    .map((o) => ({ label: o.label, monthly: o.amount }));
  const oblTotal = commitments.reduce((s, c) => s + c.monthly, 0);

  // Feed the engine: the lump is this period's take-home; cadence follows the steadiness toggle.
  const stores = { txns, debts, wallets, asOf };
  const cadenceOverride =
    opts.incomeSteady === false ? 'irregular' : opts.incomeSteady === true ? 'steady' : undefined;
  const input = buildTailorInput(stores, {
    takeHomeIncome: sourceAmount,
    commitments,
    ...(cadenceOverride ? { cadence: cadenceOverride } : {}),
  });
  const reality = buildUserReality(stores);

  // One pass, then a deterministic purpose nudge ONLY when the user clearly stated one.
  let result = proposeAndReview(input, reality);
  const br = result.plan.breathingRoom;
  const goal = intentGoal(opts.intent);
  if (br > 0 && goal === 'last') {
    const small = Math.min(Math.round(br * 0.05), 100);
    if (result.plan.setAside > small) result = proposeAndReview({ ...input, setAsideGoalMonthly: small }, reality);
  } else if (br > 0 && goal === 'save') {
    const target = Math.round(br * 0.2);
    if (target > result.plan.setAside) result = proposeAndReview({ ...input, setAsideGoalMonthly: target }, reality);
  }
  const plan = result.plan;

  // Living money split — engine's category split if it has one, else a guaranteed starter split
  // so EVERY user (even brand-new) gets real numbers, never a blank form.
  const hasTrailing = Object.values(input.trailingAvgByCategory).some((v) => v > 0);
  const validIds = new Set<string>([
    ...Object.keys(STARTER_SPLIT),
    ...Object.keys(input.trailingAvgByCategory),
  ]);
  const splitAllocs = plan.allocations.filter((a) => a.amount > 0 && a.category !== 'left to spend');
  const living = splitAllocs.length
    ? splitAllocs
    : fallbackAllocations(plan.leftToSpend, input.trailingAvgByCategory, validIds);

  // Psychology of round numbers — people budget in clean figures (RM800, RM300), not RM825.17.
  // Tidy the cushion + every category; the total stays EXACT (the largest bucket absorbs the
  // small drift, the "makan absorbs the leftover" pattern). Bills keep their real amounts.
  const setAside = roundNice(plan.setAside);
  const livingTotal = Math.max(0, Math.round(plan.leftToSpend + (plan.setAside - setAside)));
  const livingNice = roundAllocationsNice(living, livingTotal);

  // Assemble items in the Playbook's calm order: bills (handled) → set aside → living money.
  const items: EchoPlanItem[] = [];

  if (oblTotal > 0) {
    items.push({ label: 'bills', amount: 0, category: 'bills', rationale: 'this is handled — already kept aside for you' });
  }

  if (setAside > 0) {
    const r = goal === 'save'
      ? 'kept back first — building a little something for you'
      : 'a little kept back first, just in case';
    items.push({ label: 'set aside', amount: setAside, category: 'other', rationale: r });
  }

  const livingR = hasTrailing ? 'about what you usually spend here' : 'a starting point — nudge it to fit your life';
  const ranked = livingNice.filter((a) => a.amount > 0).sort((a, b) => b.amount - a.amount);
  const TOP = 5;
  const head = ranked.length > TOP ? ranked.slice(0, TOP) : ranked;
  const tailSum = ranked.length > TOP ? ranked.slice(TOP).reduce((s, a) => s + a.amount, 0) : 0;
  for (const a of head) {
    items.push({ label: a.category, amount: a.amount, category: a.category, rationale: livingR });
  }
  if (tailSum > 0) {
    const other = items.find((i) => i.category === 'other' && i.label === 'other');
    if (other) other.amount += tailSum;
    else items.push({ label: 'other', amount: tailSum, category: 'other', rationale: 'a little for everything else' });
  }

  // Safety net: a lump should never render an empty plan.
  if (items.length === 0) {
    const live = Math.max(0, Math.round(livingTotal || sourceAmount));
    items.push({ label: 'living money', amount: live, category: 'other', rationale: 'what you have to live on this round' });
  }

  // Reflection (Turn 1) — number-free by design.
  const reflection = 'okay — let me keep the important stuff safe first, then sort what’s left to live on. looking at your bills and the usual spend. sound right?';

  // Summary (the hero) — the daily figure, all from deterministic numbers.
  const days = daysInPeriod(startDate);
  const daily = days > 0 ? roundNice(livingTotal / days) : 0;
  let summary: string;
  if (livingTotal <= 0 && setAside <= 0) {
    summary = oblTotal > 0
      ? `bills come to ${money(oblTotal)} — that’s most of it this round. you’re covered, just go easy.`
      : 'it’s tight this round — go easy and you’ll be okay.';
  } else {
    const billsPart = oblTotal > 0 ? 'bills handled, ' : '';
    const setAsidePart = setAside > 0 ? `${money(setAside)} set aside, ` : '';
    summary = `${billsPart}${setAsidePart}about ${money(daily)} a day to live on — you’re okay.`;
  }

  // One gentle warning — the critic's most serious grounded objection, framed as-is. None is fine.
  const serious = result.objections.filter((o) => o.severity === 'serious' && o.nudge);
  const warnings = serious.length ? [serious[0].nudge] : [];

  return { greeting: reflection, reflection, items, warnings, summary };
}
