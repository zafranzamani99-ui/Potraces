/**
 * myDebtInstruments.ts — what Echo knows about Malaysian loans & pay-later.
 *
 * SAFE: pure data, zero app/RN imports. Part of the ONE shared brain — the same
 * file feeds both the budgeting critic AND (later) the Echo chat prompt, so they
 * never drift. Imported by nothing in the app yet; deleting it changes nothing.
 *
 * Everything here is written PLAIN — the way you'd explain it to a friend, not a
 * banker. Figures are dated, sourced, and configurable (rates/fees drift; the
 * Consumer Credit Act 2025 + Consumer Credit Commission, in force 1 Mar 2026, is
 * already reshaping BNPL + app loans). Mark anything uncertain `inferred`.
 */

export type InstrumentKind =
  | 'edu_loan'        // a real loan you repay (PTPTN)
  | 'convertible_loan' // a "maybe-loan" — free only if you keep your side (MARA, JPA)
  | 'scholarship'     // truly free if terms met (rare)
  | 'credit_card'
  | 'bnpl'            // pay-later (Atome, SPayLater, TikTok, Grab)
  | 'lending_app'     // instant cash loans in an app (SLoan, GOpinjam, Boost)
  | 'personal_loan';

export interface DebtInstrument {
  id: string;
  name: string;
  provider: string;
  kind: InstrumentKind;
  /** what it really costs, plain */
  typicalCost: string;
  lateFee?: string;
  /** the thing that bites young people, plain */
  trap: string;
  note?: string;
  inferred?: boolean;
}

export const DEBT_INSTRUMENTS_ASOF = '2026-06';

export const DEBT_INSTRUMENTS: DebtInstrument[] = [
  {
    id: 'ptptn', name: 'PTPTN', provider: 'PTPTN', kind: 'edu_loan',
    typicalCost: '1% a year (ujrah, a flat charge — not compound interest). usually RM30k–80k for a degree, more for medicine or overseas.',
    lateFee: 'no cash fine, but ignore it and they can deduct from your salary and blacklist you (CCRIS).',
    trap: "lots of people think it's free or that the grace period lasts forever. it's a real loan everyone repays. clear it within 12 months of finishing and you owe zero charge; leave it and from month 13 the 1% starts, then salary deduction.",
    note: 'repayment clock starts ~12 months after you finish. the Budget 2026 travel ban only hits ~0.7% of borrowers — long-term (5yr+) non-payers earning over RM6,000, or those working overseas — NOT fresh grads / B40 / M40.',
  },
  {
    id: 'mara_loan', name: 'MARA loan', provider: 'MARA', kind: 'convertible_loan',
    typicalCost: 'mostly written off if your grades are good (high CGPA can cut it by up to ~90%). fail or drop out and you repay the full amount.',
    trap: "feels free because good grades shrink it, but it's a loan until you hit the grade condition. slip below the tier or don't graduate and a big chunk — or all of it — snaps back as real debt.",
    note: 'CGPA tiers (~10/15/20%, up to ~90% off) are from finance blogs, not mara.gov.my — treat as rough.', inferred: true,
  },
  {
    id: 'jpa_convertible', name: "JPA loan (people call it 'biasiswa')", provider: 'JPA', kind: 'convertible_loan',
    typicalCost: 'new (from 1 Jun 2025): your final CGPA sets how much you repay (top grades 5%, then 10/15/20%, fail = 100%). old model: serve in government = 0%, GLC 25%, private 50%, abroad 100%.',
    trap: "everyone calls it 'biasiswa' so it feels free — but it's mostly a maybe-loan. break the bond, work abroad, or fail and you can owe the whole amount at once. some overseas cases hit ~RM500k.",
    note: 'the new CGPA model excludes medicine, dentistry, pharmacy and Dermasiswa recipients. people on the old 2016 model can switch to the CGPA model in stages from Jan 2026.',
  },
  {
    id: 'jpa_scholarship', name: 'JPA full scholarship', provider: 'JPA', kind: 'scholarship',
    typicalCost: 'nothing to repay if you meet the terms. only a minority of awards (e.g. B40 dermasiswa).',
    trap: "mixing this up with the maybe-loan version. only a true 'biasiswa penuh' has nothing to pay back — check which one you actually hold.",
  },
  {
    id: 'credit_card', name: 'Credit card', provider: 'any bank', kind: 'credit_card',
    typicalCost: '15–18% a year if you carry a balance. minimum payment is 5% of what you owe.',
    lateFee: '1% of the balance, min RM10, capped at RM100.',
    trap: "paying only the 5% minimum on RM5,000 takes about 6 years and roughly RM1,900 extra. the moment you don't pay in full, the interest-free window is gone.",
    note: 'rates are BNM-capped maximums, stable for years.',
  },
  {
    id: 'atome', name: 'Atome', provider: 'Atome', kind: 'bnpl',
    typicalCost: '0% interest if you pay on time; splits a buy into 3 (sometimes 6/9/12) monthly bits.',
    lateFee: 'late charge up to RM23 per overdue payment (+ ~RM7), about RM30 to reactivate.',
    trap: "the tiny '3 payments' feels free, so it's easy to open lots. miss one and the flat fees plus reactivation pile up fast.",
    note: 'late fee differs across sources (RM23 vs RM30) — rough.', inferred: true,
  },
  {
    id: 'spaylater', name: 'SPayLater (Shopee PayLater)', provider: 'Shopee', kind: 'bnpl',
    typicalCost: '~1.5% processing fee even on the 1-month plan (it is NOT free anymore); longer plans ~0.75–1.5% a month.',
    lateFee: 'flat RM10, account frozen until you settle plus RM10 to reactivate.',
    trap: "it's built into checkout, so it's the easy default tap. simple to forget it's a loan you owe next month — and the '1-month' plan now carries a 1.5% fee too.",
    note: 'Shopee added a 1.5% fee on the 1-month plan in 2024 — the old "0%" is out of date.',
  },
  {
    id: 'tiktok_paylater', name: 'TikTok PayLater', provider: 'TikTok', kind: 'bnpl',
    typicalCost: 'a credit line up to RM10,000, split over up to 12 months.',
    lateFee: 'flat fee per miss, account frozen.',
    trap: "a RM10k line sitting inside an app you scroll for fun. big limit plus impulse buys = a balance that creeps up quietly.",
  },
  {
    id: 'grab_paylater', name: 'Grab PayLater', provider: 'Grab', kind: 'bnpl',
    typicalCost: 'pay-in-4 (0% on time); longer 8/12-month plans carry ~1.5% a month — not free.',
    lateFee: 'RM10 per missed payment, capped at RM30.',
    trap: "you already use Grab for food and rides, so it's the easy default. lots of small 'later' buys add up across the month.",
  },
  {
    id: 'shopee_sloan', name: 'Shopee SLoan', provider: 'Shopee', kind: 'lending_app',
    typicalCost: 'a cash loan up to RM100,000 at ~18% a year, over 3/6/12 months.',
    lateFee: 'normal loan late charges.',
    trap: 'real cash, instant, from an app you shop in. bigger and longer than pay-later — much more to repay if you take the max.',
  },
  {
    id: 'tng_gopinjam', name: 'TNG GOpinjam', provider: "Touch 'n Go (via CIMB)", kind: 'lending_app',
    typicalCost: 'RM100–RM10,000, fixed 8–36% a year (36% on the shortest under-3-month loans). no processing fee, money lands instantly.',
    lateFee: 'normal loan late charges.',
    trap: "disburses in seconds into the wallet you already spend from. short, small, high-rate loans make it easy to re-borrow to cover the last one.",
  },
  {
    id: 'boost', name: 'Boost (PayFlex / loans)', provider: 'Boost', kind: 'lending_app',
    typicalCost: 'Shariah-compliant; PayFlex splits into 3/6/9/12 months; Wakalah fee RM5 (under RM100) / RM10 (over).',
    lateFee: 'late charge ~1% a year, worked out daily.',
    trap: "same instant-cash convenience inside an e-wallet — easy to treat as 'free money' instead of something you owe back.",
  },
];

export function getInstrument(id: string): DebtInstrument | undefined {
  return DEBT_INSTRUMENTS.find((x) => x.id === id);
}

/**
 * Find instruments a free-text message mentions (by name, provider, or nickname).
 * Word-boundary matched so "cc"/"mara"/"s loan" don't hit "soccer"/"marathon"/"this loan".
 */
export function findInstruments(message: string): DebtInstrument[] {
  const nick: Record<string, string[]> = {
    ptptn: ['ptptn', 'pinjaman ptptn', 'pinjaman pelajaran'], mara_loan: ['mara'], jpa_convertible: ['jpa', 'biasiswa'],
    credit_card: ['credit card', 'kad kredit'],
    atome: ['atome'], spaylater: ['spaylater', 'shopee paylater', 'shopee pay later'],
    tiktok_paylater: ['tiktok paylater', 'tiktok pay later'], grab_paylater: ['grab paylater', 'grabpay'],
    shopee_sloan: ['sloan', 'shopee loan'], tng_gopinjam: ['gopinjam', 'go pinjam', 'tng loan', 'tng pinjam'], boost: ['boost payflex', 'payflex', 'boost loan'],
  };
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const hits = new Set<string>();
  for (const inst of DEBT_INSTRUMENTS) {
    const keys = nick[inst.id] || [inst.name.toLowerCase()];
    if (keys.some((k) => new RegExp(`\\b${esc(k)}\\b`, 'i').test(message))) hits.add(inst.id);
  }
  return DEBT_INSTRUMENTS.filter((i) => hits.has(i.id));
}

/** One plain line for a prompt/UI. */
export function instrumentLine(i: DebtInstrument): string {
  return `${i.name} (${i.kind.replace('_', ' ')}): ${i.typicalCost} trap: ${i.trap}`;
}
