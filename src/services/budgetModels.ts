/**
 * budgetModels.ts — pure, dependency-free "brain" for Echo-tailored budget plans.
 *
 * SAFE BY DESIGN: imports nothing, imported by nothing (yet). Deleting it leaves the
 * app byte-for-byte unchanged. See docs/budget-models-echo-spec.md.
 *
 * This is a KNOWLEDGE-ENCODED SCORING ENGINE, not an ML model — it encodes the
 * person→model matrix from docs/research/budgeting-models-research.md and is tuned
 * against a battery of real personas (see PERSONAS). No training data exists yet;
 * once real users do, the weights here become the thing to calibrate.
 *
 * The one idea that never bends: reserve the protected (Malaysian) commitments tier
 * FIRST, set savings aside BEFORE spending (pay-yourself-first), and only ever split
 * what's left ("breathing room"). User-facing words follow CALM vocabulary —
 * "set aside / breathing room / left to spend" — never the banned word "budget".
 *
 * It imports ONE pure data file — myEconomics.ts (dated, sourced MY figures) — to
 * sanity-check plans against the local cost of living. Still un-wired into the app.
 */

import { realityCheck as myRealityCheck, type RealityCheck, type TransportMode } from '../constants/myEconomics';

export type Cadence = 'steady' | 'irregular';
export type IncomeBand = 'tight' | 'modest' | 'comfortable' | 'high';
export type Risk = 'cautious' | 'balanced' | 'aggressive';
export type Discipline = 'low' | 'mid' | 'high';
export type Psychology = 'overspender' | 'reflective' | 'none';
export type Goal = 'breathe' | 'build_buffer' | 'clear_debt' | 'save_big' | 'grow_wealth';

export type BudgetModelId =
  | 'pay_yourself_first'
  | 'flexed_602020'
  | 'envelopes'
  | 'step_ladder'
  | 'zero_based'
  | 'conscious_spending';

/** A locked-in monthly outflow. Annual lumps (road tax, takaful, raya) are pre-divided to /month. */
export interface CommitmentInput {
  label: string;
  monthly: number;
}

export interface TailorInput {
  /** RM/month that actually lands in hand — net of EPF. Budget on take-home, not gross. */
  takeHomeIncome: number;
  cadence: Cadence;
  /** Protected, locked-in monthly outflows (rent, PTPTN, petrol, zakat if opted in, sinking accruals). */
  commitments: CommitmentInput[];
  /** Trailing 3–6mo average spend per category (RM/month). Fills the numbers; ratio only frames them. */
  trailingAvgByCategory: Record<string, number>;
  /** Explicit pay-yourself-first target (RM/month). Overrides the computed share if set. */
  setAsideGoalMonthly?: number;

  // --- signals that make the recommendation intelligent (all optional, sane defaults) ---
  hasHighInterestDebt?: boolean;
  /** does a ~3-month emergency cushion already exist? */
  hasEmergencyBuffer?: boolean;
  dependents?: number;
  riskAppetite?: Risk;
  discipline?: Discipline;
  psychology?: Psychology;
  goal?: Goal;
  /** how they get around — drives the petrol/toll estimate + cost-of-living benchmark */
  transportMode?: TransportMode;
}

export interface Allocation {
  category: string;
  amount: number;
}

export interface TailoredPlan {
  model: BudgetModelId;
  takeHomeIncome: number;
  incomeBand: IncomeBand;
  protectedTier: number;
  breathingRoom: number;
  /** taken FIRST, before spending */
  setAside: number;
  setAsidePct: number;
  /** where the set-aside slice goes, by risk + whether a buffer exists yet */
  setAsideBreakdown: { cushion: number; grow: number };
  leftToSpend: number;
  allocations: Allocation[];
  /** protectedTier / income — shown honestly, NEVER capped at 50% */
  realNeedsRatio: number;
  /** calm sanity-check of take-home vs the local modest cost of living (Belanjawanku) */
  realityCheck: RealityCheck;
  note?: string;
}

interface ModelDef {
  id: BudgetModelId;
  /** user-facing, calm lowercase, no banned words */
  label: string;
  engine: 'proportional' | 'envelope' | 'ladder';
  /** baseline set-aside share of breathing room before personalisation */
  defaultSetAsideShare: number;
  /** show spendable money as one "left to spend" number vs per-category guides */
  splitByCategory: boolean;
  why: string;
}

export const BUDGET_MODELS: ModelDef[] = [
  {
    id: 'pay_yourself_first',
    label: 'set aside first',
    engine: 'proportional',
    defaultSetAsideShare: 0.2,
    splitByCategory: false,
    why: 'one slice set aside the day money lands, the rest is yours — simplest to actually stick to',
  },
  {
    id: 'flexed_602020',
    label: 'flexed 60/20/20',
    engine: 'proportional',
    defaultSetAsideShare: 0.2,
    splitByCategory: true,
    why: 'a little structure: needs come from your real commitments, not an assumed half',
  },
  {
    id: 'envelopes',
    label: 'envelopes',
    engine: 'envelope',
    defaultSetAsideShare: 0.15,
    splitByCategory: true,
    why: 'a firm ceiling per category — good when a few specific things keep running over',
  },
  {
    id: 'step_ladder',
    label: 'step ladder',
    engine: 'ladder',
    defaultSetAsideShare: 0.08,
    splitByCategory: false,
    why: 'an order, not ratios: tiny cushion → clear costly debt → build a buffer',
  },
  {
    id: 'zero_based',
    label: 'every ringgit a job',
    engine: 'proportional',
    defaultSetAsideShare: 0.2,
    splitByCategory: true,
    why: 'plan last month’s money down to zero — the honest fit for income that lands at odd times',
  },
  {
    id: 'conscious_spending',
    label: 'spend on what you love',
    engine: 'proportional',
    defaultSetAsideShare: 0.25,
    splitByCategory: true,
    why: 'automate saving + investing, then spend guilt-free on the few things you actually value',
  },
];

export function getModel(id: BudgetModelId): ModelDef {
  const m = BUDGET_MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`unknown budget model: ${id}`);
  return m;
}

// --- derived context -------------------------------------------------------

export function incomeBandOf(takeHome: number): IncomeBand {
  // individual take-home heuristic (NOT the DOSM household bands)
  if (takeHome < 2000) return 'tight';
  if (takeHome < 4000) return 'modest';
  if (takeHome < 8000) return 'comfortable';
  return 'high';
}

interface Ctx {
  income: number;
  band: IncomeBand;
  protectedTier: number;
  commitmentRatio: number;
  irregular: boolean;
  debt: boolean;
  hasBuffer: boolean;
  dependents: number;
  risk: Risk;
  discipline: Discipline;
  psychology: Psychology;
  goal: Goal;
}

function deriveCtx(input: TailorInput): Ctx {
  const income = Math.max(0, fin(input.takeHomeIncome));
  const protectedTier = round(input.commitments.reduce((s, c) => s + Math.max(0, fin(c.monthly)), 0));
  return {
    income,
    band: incomeBandOf(income),
    protectedTier,
    commitmentRatio: income > 0 ? protectedTier / income : 0,
    irregular: input.cadence === 'irregular',
    debt: !!input.hasHighInterestDebt,
    hasBuffer: !!input.hasEmergencyBuffer,
    dependents: input.dependents ?? 0,
    risk: input.riskAppetite ?? 'balanced',
    discipline: input.discipline ?? 'mid',
    psychology: input.psychology ?? 'none',
    goal: input.goal ?? 'breathe',
  };
}

// --- the scoring engine ----------------------------------------------------

export interface ModelScore {
  id: BudgetModelId;
  label: string;
  score: number;
  reasons: string[];
}

function scoreOne(id: BudgetModelId, c: Ctx): ModelScore {
  let s = 1; // small base so nothing is ever zero
  const r: string[] = [];
  const add = (n: number, why: string) => {
    s += n;
    if (n !== 0) r.push(why);
  };

  switch (id) {
    case 'step_ladder':
      if (c.debt && !c.hasBuffer) add(5, 'debt with no cushion yet');
      if (c.goal === 'clear_debt') add(3, 'goal is clearing debt');
      if (c.debt) add(1.5, 'carrying debt');
      if (!c.debt) add(-4, 'no debt to ladder out of');
      break;

    case 'zero_based':
      if (c.irregular) add(5, 'income lands at odd times');
      if (!c.hasBuffer) add(-2.5, 'build a cushion before a high-effort system'); // buffer-first beats give-every-ringgit-a-job
      if (c.discipline === 'high') add(2, 'happy with detail');
      if (c.goal === 'save_big') add(1, 'chasing a big goal');
      if (c.discipline === 'low') add(-3, 'too much daily effort');
      if (c.band === 'tight') add(-1.5, 'little to allocate when tight');
      break;

    case 'conscious_spending':
      if (c.band === 'high') add(2.5, 'real headroom');
      else if (c.band === 'comfortable') add(1.5, 'some headroom');
      if (c.risk !== 'cautious') add(1.5, 'open to investing');
      if (c.goal === 'grow_wealth') add(2, 'building wealth');
      if (c.band === 'tight') add(-3, 'needs headroom this lacks');
      break;

    case 'envelopes':
      if (c.psychology === 'overspender') add(4, 'tends to overspend');
      if (c.goal === 'build_buffer') add(1, 'wants tighter control');
      if (c.discipline === 'low') add(0.5, 'caps do the discipline');
      if (c.band === 'comfortable' || c.band === 'modest') add(0.5, 'enough to cap meaningfully');
      if (c.irregular) add(-1, 'awkward with odd timing');
      break;

    case 'flexed_602020':
      if (c.commitmentRatio >= 0.5 && c.commitmentRatio <= 0.78) add(2, 'commitments around half-to-most of pay');
      if (c.band === 'modest' || c.band === 'comfortable') add(1, 'a structured split fits');
      if (c.discipline !== 'low') add(0.5, 'fine with a little tracking');
      if (c.goal === 'build_buffer' || c.goal === 'grow_wealth') add(0.5, 'wants steady progress');
      if (c.dependents >= 2) add(1.5, 'a household needs to see where it goes');
      break;

    case 'pay_yourself_first':
      if (c.discipline === 'low') add(2, 'low-touch, nothing to track');
      if (!c.debt) add(1.5, 'no debt fire to fight');
      if (c.goal === 'grow_wealth' || c.goal === 'breathe') add(1, 'just wants the floor protected');
      if (c.psychology === 'overspender') add(-2, 'free-spend invites the leak');
      add(1, 'works at any income — the % scales');
      add(1.2, 'simplest to keep up');
      break;
  }
  return { id, label: getModel(id).label, score: Math.max(0, round1(s)), reasons: r };
}

export function scoreModels(input: TailorInput): ModelScore[] {
  const c = deriveCtx(input);
  // tie-break priority: simpler / lower-friction first
  const priority: BudgetModelId[] = [
    'pay_yourself_first',
    'flexed_602020',
    'envelopes',
    'step_ladder',
    'zero_based',
    'conscious_spending',
  ];
  return BUDGET_MODELS.map((m) => scoreOne(m.id, c)).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return priority.indexOf(a.id) - priority.indexOf(b.id);
  });
}

export interface Recommendation {
  id: BudgetModelId;
  label: string;
  why: string;
  runnerUp: { id: BudgetModelId; label: string } | null;
}

function leadReason(c: Ctx): string {
  if (c.debt && !c.hasBuffer) return 'card/BNPL debt and no cushion yet';
  if (c.irregular) return 'money lands at odd times';
  if (c.band === 'high') return 'you’ve got real headroom';
  if (c.band === 'tight') return 'money’s tight right now';
  if (c.commitmentRatio > 0.65) return 'commitments already eat most of your pay';
  if (c.psychology === 'overspender') return 'a few categories keep running over';
  if (c.dependents >= 2) return 'a household leans on this income';
  return 'steady pay with room to plan';
}

export function recommendModel(input: TailorInput): Recommendation {
  const ranked = scoreModels(input);
  const top = ranked[0];
  const c = deriveCtx(input);
  const model = getModel(top.id);
  return {
    id: top.id,
    label: top.label,
    why: `${leadReason(c)}, so i’d start you on ${model.label} — ${model.why}`,
    runnerUp: ranked[1] ? { id: ranked[1].id, label: ranked[1].label } : null,
  };
}

// --- tailoring (turning the chosen model into ringgit) ---------------------

function round(n: number): number {
  return Math.round(n);
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
/** guard against NaN/Infinity poisoning the whole plan (C2) */
function fin(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function setAsidePctFor(c: Ctx): number {
  const base: Record<IncomeBand, number> = { tight: 0.06, modest: 0.12, comfortable: 0.18, high: 0.25 };
  let pct = base[c.band];
  if (c.goal === 'clear_debt') pct = Math.min(pct, 0.05);
  if (c.goal === 'grow_wealth') pct += 0.03;
  if (c.goal === 'breathe') pct -= 0.03;
  if (c.risk === 'aggressive') pct += 0.05;
  if (c.risk === 'cautious') pct -= 0.02;
  if (c.dependents >= 2) pct -= 0.03;
  // if there's no cushion yet, force a starter saving rate — unless money is genuinely tight or debt comes first
  if (!c.hasBuffer && c.band !== 'tight' && c.goal !== 'clear_debt') pct = Math.max(pct, 0.1);
  return clamp(pct, 0.02, 0.35);
}

function breakdownFor(c: Ctx): { cushion: number; grow: number } {
  if (c.goal === 'clear_debt' || !c.hasBuffer) return { cushion: 0.9, grow: 0.1 };
  if (c.risk === 'aggressive') return { cushion: 0.2, grow: 0.8 };
  if (c.risk === 'cautious') return { cushion: 0.6, grow: 0.4 };
  return { cushion: 0.4, grow: 0.6 };
}

/** Distribute `total` across categories weighted by trailing averages; sum stays exact. */
function distribute(total: number, weights: Record<string, number>): Allocation[] {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  const weightSum = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0 || weightSum <= 0) return [];
  const alloc: Allocation[] = entries.map(([category, w]) => ({ category, amount: round((w / weightSum) * total) }));
  const drift = total - alloc.reduce((s, a) => s + a.amount, 0);
  if (drift !== 0 && alloc.length > 0) {
    const biggest = alloc.reduce((a, b) => (b.amount > a.amount ? b : a));
    biggest.amount = Math.max(0, biggest.amount + drift); // never negative (C3)
  }
  return alloc;
}

/** Infer how they get around — explicit, else read it off the commitment labels. */
function inferTransportMode(input: TailorInput): TransportMode {
  if (input.transportMode) return input.transportMode;
  const labels = input.commitments.map((c) => c.label.toLowerCase()).join(' ');
  if (labels.includes('car') || labels.includes('mortgage') || labels.includes('car loan')) return 'car';
  if (labels.includes('motor') || labels.includes('motorcycle') || labels.includes('motorbike')) return 'motorcycle';
  return 'public';
}

/** Tailor a model (or Echo's recommended one, if omitted) to one person's real numbers. */
export function tailorPlan(input: TailorInput, modelId?: BudgetModelId): TailoredPlan {
  const c = deriveCtx(input);
  const id = modelId ?? recommendModel(input).id;
  const model = getModel(id);

  const breathingRoom = Math.max(0, round(c.income - c.protectedTier));
  // clamp an explicit goal to [0, …] so a negative/NaN target can't produce negative ringgit (C1)
  const explicit = input.setAsideGoalMonthly != null ? Math.max(0, fin(input.setAsideGoalMonthly)) : undefined;
  const pct = explicit != null && breathingRoom > 0 ? clamp(explicit / breathingRoom, 0, 1) : setAsidePctFor(c);
  const setAside = round(Math.min(breathingRoom, explicit != null ? explicit : breathingRoom * pct));
  const leftToSpend = Math.max(0, breathingRoom - setAside);

  const bd = breakdownFor(c);
  const cushion = round(setAside * bd.cushion);

  const allocations: Allocation[] = model.splitByCategory
    ? distribute(leftToSpend, input.trailingAvgByCategory)
    : [{ category: 'left to spend', amount: leftToSpend }];

  const plan: TailoredPlan = {
    model: model.id,
    takeHomeIncome: c.income,
    incomeBand: c.band,
    protectedTier: c.protectedTier,
    breathingRoom,
    setAside,
    setAsidePct: breathingRoom > 0 ? round1((setAside / breathingRoom) * 100) / 100 : 0,
    setAsideBreakdown: { cushion, grow: setAside - cushion },
    leftToSpend,
    allocations,
    realNeedsRatio: c.income > 0 ? c.protectedTier / c.income : 0,
    realityCheck: myRealityCheck(c.income, inferTransportMode(input)),
  };

  if (model.engine === 'envelope') plan.note = 'mvp: shown as a proportional split; hard per-envelope ceilings come later';
  else if (model.engine === 'ladder') plan.note = 'mvp: shown as set-aside + spendable; the debt-first step sequence comes later';
  return plan;
}

// --- persona battery (tuning + regression set) -----------------------------

export interface Persona {
  key: string;
  name: string;
  desc: string;
  /** what we expect Echo to land on — used by the self-test */
  expect: BudgetModelId;
  input: TailorInput;
}

// re-export the economics surface the playground/UI needs, so one bundle exposes it
export {
  MY_ECONOMICS,
  MY_ECONOMICS_SOURCES,
  estimateFromGross,
  estimateTransportMonthly,
  belanjawankuReference,
} from '../constants/myEconomics';

const C = (label: string, monthly: number): CommitmentInput => ({ label, monthly });

export const PERSONAS: Persona[] = [
  {
    key: 'student', name: 'student, part-time income', desc: 'RM900, tiny commitments, no debt, just wants to not run dry',
    expect: 'pay_yourself_first',
    input: { takeHomeIncome: 900, cadence: 'irregular', discipline: 'low', goal: 'breathe',
      commitments: [C('phone', 40), C('transport', 80)], trailingAvgByCategory: { makan: 350, fun: 120 } },
  },
  {
    key: 'fresh_grad', name: 'fresh grad + PTPTN', desc: 'RM2,800, first real paycheck, building a habit',
    expect: 'pay_yourself_first',
    input: { takeHomeIncome: 2800, cadence: 'steady', goal: 'build_buffer', discipline: 'mid', hasEmergencyBuffer: false,
      commitments: [C('rent (room)', 700), C('ptptn', 150), C('phone', 60), C('petrol+toll (motor)', 150)],
      trailingAvgByCategory: { makan: 600, shopping: 220, fun: 150, personal: 120 } },
  },
  {
    key: 'b40_parent', name: 'B40 single parent', desc: 'RM2,200, 2 kids, commitments eat most of it, cautious',
    expect: 'flexed_602020',
    input: { takeHomeIncome: 2200, cadence: 'steady', dependents: 2, riskAppetite: 'cautious', goal: 'breathe', discipline: 'mid',
      commitments: [C('rent', 800), C('utilities', 180), C('school/childcare', 300), C('transport', 200)],
      trailingAvgByCategory: { makan: 450, household: 220, kids: 150 } },
  },
  {
    key: 'gig_rider', name: 'gig rider, irregular pay', desc: 'RM2,500 average, lands whenever, no cushion',
    expect: 'pay_yourself_first', // buffer-first: no cushion yet → automate a savings floor before zero-based
    input: { takeHomeIncome: 2500, cadence: 'irregular', goal: 'build_buffer', discipline: 'mid', hasEmergencyBuffer: false,
      commitments: [C('rent (room)', 650), C('petrol (motor)', 200), C('phone', 60)],
      trailingAvgByCategory: { makan: 550, shopping: 200, fun: 150 } },
  },
  {
    key: 'seller', name: 'small seller / entrepreneur', desc: 'RM4,500 lumpy, detail-friendly, growing the business',
    expect: 'zero_based',
    input: { takeHomeIncome: 4500, cadence: 'irregular', discipline: 'high', riskAppetite: 'aggressive', goal: 'grow_wealth', hasEmergencyBuffer: true,
      commitments: [C('rent', 1100), C('petrol+toll (car)', 350), C('phone', 90), C('stock reserve', 400)],
      trailingAvgByCategory: { makan: 650, shopping: 300, fun: 250, personal: 150 } },
  },
  {
    key: 'debt_crusher', name: 'card-debt crusher', desc: 'RM3,000, high-interest cards, no buffer — get out of the hole',
    expect: 'step_ladder',
    input: { takeHomeIncome: 3000, cadence: 'steady', hasHighInterestDebt: true, hasEmergencyBuffer: false, goal: 'clear_debt', discipline: 'mid',
      commitments: [C('rent (room)', 750), C('petrol+toll (car)', 350), C('phone', 60)],
      trailingAvgByCategory: { makan: 550, shopping: 200, personal: 120 } },
  },
  {
    key: 'overspender', name: 'overspender wants control', desc: 'RM4,000, leaks on Shopee + makan, wants hard caps',
    expect: 'envelopes',
    input: { takeHomeIncome: 4000, cadence: 'steady', psychology: 'overspender', discipline: 'low', goal: 'build_buffer', hasEmergencyBuffer: true,
      commitments: [C('rent', 1000), C('petrol+toll (car)', 350), C('phone', 80)],
      trailingAvgByCategory: { makan: 700, shopping: 400, fun: 250, personal: 150 } },
  },
  {
    key: 'comfortable', name: 'comfortable office worker', desc: 'RM5,500, steady, wants to start building wealth',
    expect: 'conscious_spending',
    input: { takeHomeIncome: 5500, cadence: 'steady', riskAppetite: 'balanced', goal: 'grow_wealth', hasEmergencyBuffer: true, discipline: 'mid',
      commitments: [C('rent', 1400), C('petrol+toll (car)', 400), C('phone', 90), C('takaful (monthly)', 150)],
      trailingAvgByCategory: { makan: 800, shopping: 350, fun: 300, personal: 200 } },
  },
  {
    key: 't20_risktaker', name: 'T20 high earner, risk-taker', desc: 'RM12,000, aggressive investor, buffer already done',
    expect: 'conscious_spending',
    input: { takeHomeIncome: 12000, cadence: 'steady', riskAppetite: 'aggressive', discipline: 'high', goal: 'grow_wealth', hasEmergencyBuffer: true,
      commitments: [C('mortgage', 2800), C('petrol+toll (car)', 500), C('phone', 120), C('takaful (monthly)', 300)],
      trailingAvgByCategory: { makan: 1500, shopping: 800, travel: 700, personal: 400 } },
  },
  {
    key: 'frugal_saver', name: 'frugal saver, cautious', desc: 'RM3,500, saving hard for a house deposit',
    expect: 'pay_yourself_first',
    input: { takeHomeIncome: 3500, cadence: 'steady', riskAppetite: 'cautious', goal: 'save_big', hasEmergencyBuffer: true, discipline: 'mid',
      commitments: [C('rent (room)', 700), C('petrol (motor)', 150), C('phone', 60)],
      trailingAvgByCategory: { makan: 500, shopping: 150, personal: 100 } },
  },
  {
    key: 'm40_family', name: 'M40 family with a car', desc: 'RM7,000, 3 dependents, steady, balanced',
    expect: 'flexed_602020',
    input: { takeHomeIncome: 7000, cadence: 'steady', dependents: 3, riskAppetite: 'balanced', goal: 'build_buffer', hasEmergencyBuffer: true, discipline: 'mid',
      commitments: [C('mortgage', 1800), C('car loan', 700), C('petrol+toll', 450), C('utilities', 250), C('school', 400)],
      trailingAvgByCategory: { makan: 1100, household: 500, kids: 400, fun: 300 } },
  },
  {
    key: 'fixed_low', name: 'fixed low income, cautious', desc: 'RM1,800, no debt, just keep the lights on',
    expect: 'pay_yourself_first',
    input: { takeHomeIncome: 1800, cadence: 'steady', riskAppetite: 'cautious', goal: 'breathe', discipline: 'low',
      commitments: [C('rent (room)', 600), C('utilities', 120), C('transport', 120)],
      trailingAvgByCategory: { makan: 400, personal: 90 } },
  },
];
