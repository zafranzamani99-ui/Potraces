/**
 * echoKnowledge.ts — the critic's "how people actually go broke" knowledge base.
 *
 * SAFE: pure data, zero app/RN imports. Imported only by the (un-wired) critic.ts
 * and the shared knowledge bridge. Deleting it leaves the app byte-for-byte unchanged.
 *
 * Human-curated, citation-backed anti-pattern library — NOT scraped from anyone's
 * posts (illegal under platform ToS + PDPA 2024; see docs/echo-planner-critic-plan.md).
 * Distilled from compliant MY sources (AKPK, BNM, MDI, PTPTN, KRI). Thresholds flagged
 * `inferred` are editorial, not literature figures — calibrate before hard alarms.
 *
 * COPY RULES (mandatory): plain everyday English a 23-year-old reads instantly.
 * Name the real app (Atome, GOpinjam). Lead with the observation, then offer an option.
 * Use ringgit + months, never ratios. Never "you should". No red/alarm. No banned words.
 */

export type Severity = 'note' | 'caution' | 'serious';

export interface FailureMode {
  id: string;
  label?: string;
  severity: Severity;
  /** illustrative EN nudge with {placeholders} the critic fills; final copy goes through useT() EN+BM */
  nudge: string;
  source: string;
  inferred?: boolean;
  scope: 'reality' | 'plan';
}

export const THRESHOLDS = {
  unsecuredDebtMultipleNote: 6,
  unsecuredDebtMultipleDistressed: 17,
  bnplStackCount: 3, // 3+ pay-later apps (2 alone only flags if also ≥12% of came-in; CCA-2025 reports misses to CTOS/CCRIS)
  bnplShareOfCameIn: 0.12, // inferred
  bufferMonthsMin: 1,
  thinIncomeCeil: 3000,
  thinCommitmentRatio: 0.45, // inferred
  undershootRatio: 0.85,
  undershootMinGap: 100,
  noCushionShareOfRoom: 0.05,
} as const;

export const SEVERITY_WEIGHT: Record<Severity, number> = { note: 1, caution: 3, serious: 6 };

export const FAILURE_MODES: FailureMode[] = [
  {
    id: 'unsecured-debt-multiple', scope: 'reality', severity: 'serious',
    nudge: "what you owe is about {mult}x a month's pay. just showing where the line sits — the plan can put more aside if you want.",
    source: 'AKPK 2024 (RM36k avg restructured vs ~RM2,062 median 20-29 income)',
  },
  {
    id: 'minimum-payment-revolver', scope: 'reality', severity: 'caution',
    nudge: "paying near the minimum on the card drags on for years — about RM1,900 extra per RM5k. just the maths. the plan can aim higher if you want.",
    source: 'BNM 15-18% p.a. card arithmetic; RM5k at 5% min ≈ 6 years',
  },
  {
    id: 'bnpl-stacking', scope: 'reality', severity: 'caution',
    nudge: "there are {n} pay-later apps running at once — Atome, Shopee, Grab, that kind. easy to lose track. want them in one list so you see the monthly total?",
    source: 'BNM FSR; ~40% of BNPL by under-30s; CCA 2025 reports misses to CTOS/CCRIS', inferred: true,
  },
  {
    id: 'lending-app-spiral', scope: 'reality', severity: 'serious',
    nudge: "looks like a new {app} loan came in before the last one was clear. just showing the pattern — the plan can put a line aside to break the loop.",
    source: 'BNM consumer warning on SLoan/GOpinjam; up to 36% p.a. on short app loans',
  },
  {
    id: 'wants-funded-by-credit', scope: 'reality', severity: 'caution',
    nudge: "that went on credit while there's nothing saved up. no judgement — just flagging the timing.",
    source: 'AKPK 2024 (38% bought things not needed); lifestyle = 21% of youth-debt drivers',
  },
  {
    id: 'no-buffer-irregular-income', scope: 'reality', severity: 'serious',
    nudge: "pay lands at odd times and there's under a month saved — that's the combo that usually trips people up. the plan can build a small cushion first.",
    source: 'BNM FSR (unstable income = top late-payment reason); SOCSO 2025',
  },
  {
    id: 'edu-loan-ignored', scope: 'reality', severity: 'caution',
    nudge: "nothing's going to PTPTN yet. left long enough it can turn into a salary deduction. clear it within 12 months of finishing and you skip the 1% charge — want a line for it?",
    source: 'PTPTN Act 1997 s.29 salary deduction; settle-in-12-months = zero ujrah',
  },
  {
    id: 'scholarship-bond-breakage', scope: 'reality', severity: 'serious',
    nudge: "this one's a maybe-loan (JPA/MARA) — free only if you keep your side. if the grade or service condition slips, the whole amount can come due at once. want to set a little aside just in case?",
    source: 'JPA/MARA bond breakage = full principal lump sum; reported JPA cases up to ~RM500k',
  },
  {
    id: 'festive-credit-spike', scope: 'reality', severity: 'note',
    nudge: "Raya tends to land as one big lump. setting aside about RM60 a month means it won't catch you out.",
    source: '"broke after Raya" pattern; BNPL-for-festive warnings', inferred: true,
  },
  {
    id: 'debt-outpacing-savings', scope: 'reality', severity: 'note',
    nudge: "what you owe crept up this month while savings stayed flat. just naming the direction, not the size.",
    source: 'KRI 2024 (90% of under-30 EPF off the RM240k target)',
  },
  {
    id: 'thin-income-overcommitted', scope: 'plan', severity: 'caution',
    nudge: "the locked-in stuff already takes about {pct}% before any fun money. the plan keeps the rest honest about that.",
    source: '~70% of grads under RM2,000; stagnant wages (Economic Outlook 2024)', inferred: true,
  },
  {
    id: 'lifestyle-inflation-ratchet', scope: 'reality', severity: 'note',
    nudge: "pay went up and so did everyday spending — but the amount saved stayed the same. just an observation, your call.",
    source: 'Gen Z spend trends / "flex culture" (softer, causal — nudge only)', inferred: true,
  },
  {
    id: 'plan-leaves-no-cushion', scope: 'plan', severity: 'caution',
    nudge: "this split barely saves anything and there's nothing put by yet — room to keep a bit more first if you'd rather.",
    source: 'engine + KRI savings-shortfall',
  },
  {
    id: 'plan-vs-actual-undershoot', scope: 'plan', severity: 'note',
    nudge: "the plan pencils {cat} at RM{plan} but the last few months ran about RM{actual}. set it to what's real, or keep it tight on purpose?",
    source: 'engine the-last-few-months vs allocation',
  },
];

export function getFailureMode(id: string): FailureMode {
  const m = FAILURE_MODES.find((x) => x.id === id);
  if (!m) throw new Error(`unknown failure mode: ${id}`);
  return m;
}
