/**
 * myEconomics.ts — a small, dated, sourced reference of Malaysian money figures.
 *
 * SAFE: pure data + tiny estimators. No app/RN imports; imported only by the
 * (also un-wired) budgetModels.ts brain. Deleting it changes nothing in the app.
 *
 * These are CONFIGURABLE DEFAULTS, not live data. Statutory rates and prices drift —
 * each block is stamped `asOf` with its source so we know when to refresh. Figures
 * mirror docs/research/budgeting-models-research.md. Anything I estimated (typical
 * fuel use, toll) is marked ESTIMATE — replace with the user's real number when known.
 */

export type TransportMode = 'car' | 'motorcycle' | 'public';

export const MY_ECONOMICS = {
  asOf: '2026-06',

  /** EPF/KWSP — deducted pre-paycheck. Budget on take-home (net of this), not gross. */
  epf: {
    employeeRate: 0.11, // under 60
    employeeRate60plus: 0.055,
    basicSavingsTargetBy55: 240_000, // long-standing RM240k (rising toward RM390k by 60)
    source: 'KWSP / EPF',
  },

  /** RON95 under BUDI95: fixed price for eligible citizens. */
  petrol: {
    pricePerLitre: 1.99, // RM/litre
    monthlyCapLitres: 300,
    from: '2025-09-30',
    source: 'BUDI95 (RON95 targeted subsidy)',
  },

  /** ESTIMATE — typical monthly fuel use + toll by vehicle. Override with real spend when known. */
  transport: {
    car: { litresPerMonth: 120, tollMonthly: 150 }, // ESTIMATE
    motorcycle: { litresPerMonth: 25, tollMonthly: 75 }, // ESTIMATE (motorbikes pay ~half car toll)
    public: { passMonthly: 100 }, // ESTIMATE — urban rail/bus pass-ish
  },

  /** Zakat pendapatan — Muslims, above nisab. Simple gross method here. */
  zakat: {
    rate: 0.025,
    note: 'gross 2.5%; nisab varies by state and updates ~twice/yr',
    source: 'state zakat authorities',
  },

  /** PTPTN — recommended repayment share of gross (5–8%); ask for the real instalment when possible. */
  ptptn: {
    suggestedShareOfGross: 0.06,
    source: 'PTPTN / RinggitPlus guidance',
  },

  /** Belanjawanku — EPF + UM SWRC reasonable monthly cost of living, single adult, Klang Valley. */
  belanjawanku: {
    singleAdultPublicTransport: 1_970,
    singleAdultWithCar: 2_800,
    singleAdultMotorcycle: 2_200, // ESTIMATE — interpolated between the two published figures
    asOf: '2024/2025',
    source: 'EPF + UM Social Wellbeing Research Centre, Belanjawanku',
  },

  /** DOSM Household Income Survey 2024 (released Oct 2025). HOUSEHOLD, not individual. */
  incomeBandsHousehold: {
    b40Max: 5_249,
    m40Max: 11_819,
    nationalMedian: 7_017,
    source: 'DOSM HIS 2024',
  },

  minimumWageMonthly: 1_700, // 2025

  /** Low-risk local savings vehicle, for "grow" framing. */
  asb: { indicativeReturn: 0.05, source: 'ASNB ASB historic ~5%+' },
} as const;

/** Human-readable source lines for a "what these are based on" footnote. */
export const MY_ECONOMICS_SOURCES: string[] = [
  `figures as of ${MY_ECONOMICS.asOf} — configurable defaults, not live data`,
  `EPF employee ${Math.round(MY_ECONOMICS.epf.employeeRate * 100)}% (KWSP)`,
  `RON95 RM${MY_ECONOMICS.petrol.pricePerLitre}/L, cap ${MY_ECONOMICS.petrol.monthlyCapLitres}L (BUDI95, from ${MY_ECONOMICS.petrol.from})`,
  `zakat ${MY_ECONOMICS.zakat.rate * 100}% gross (state authorities)`,
  `Belanjawanku single adult KL — public transport RM${MY_ECONOMICS.belanjawanku.singleAdultPublicTransport} / car RM${MY_ECONOMICS.belanjawanku.singleAdultWithCar} (EPF + UM SWRC ${MY_ECONOMICS.belanjawanku.asOf})`,
  `transport & toll figures are estimates — replace with your real spend`,
];

// --- estimators (turn real rates into ringgit) -----------------------------

const r = (n: number) => Math.round(n);

/** Monthly transport commitment (fuel + toll) under current prices, by vehicle. */
export function estimateTransportMonthly(mode: TransportMode): number {
  const t = MY_ECONOMICS.transport;
  if (mode === 'car') return r(t.car.litresPerMonth * MY_ECONOMICS.petrol.pricePerLitre + t.car.tollMonthly);
  if (mode === 'motorcycle') return r(t.motorcycle.litresPerMonth * MY_ECONOMICS.petrol.pricePerLitre + t.motorcycle.tollMonthly);
  return t.public.passMonthly;
}

export function estimateEpfEmployeeMonthly(grossMonthly: number, age60plus = false): number {
  return r(grossMonthly * (age60plus ? MY_ECONOMICS.epf.employeeRate60plus : MY_ECONOMICS.epf.employeeRate));
}

export function estimateZakatMonthly(grossMonthly: number): number {
  return r(grossMonthly * MY_ECONOMICS.zakat.rate);
}

export function suggestPtptnMonthly(grossMonthly: number): number {
  return r(grossMonthly * MY_ECONOMICS.ptptn.suggestedShareOfGross);
}

export function belanjawankuReference(mode: TransportMode): number {
  const b = MY_ECONOMICS.belanjawanku;
  if (mode === 'car') return b.singleAdultWithCar;
  if (mode === 'motorcycle') return b.singleAdultMotorcycle;
  return b.singleAdultPublicTransport;
}

export interface RealityCheck {
  level: 'below' | 'around' | 'above';
  referenceRM: number;
  message: string;
}

/** Calm, no-red sanity check of take-home against the local modest cost of living. */
export function realityCheck(takeHomeIncome: number, mode: TransportMode): RealityCheck {
  const ref = belanjawankuReference(mode);
  if (takeHomeIncome < ref * 0.9) {
    return {
      level: 'below',
      referenceRM: ref,
      message: `take-home is under the ~RM${ref.toLocaleString('en-MY')} modest monthly cost for a single adult in KL (Belanjawanku) — so the plan stays tight. that's the maths of the moment, not a failing.`,
    };
  }
  if (takeHomeIncome <= ref * 1.1) {
    return {
      level: 'around',
      referenceRM: ref,
      message: `take-home is right around the ~RM${ref.toLocaleString('en-MY')} modest baseline for a single adult in KL — enough to cover the basics with a little to steer.`,
    };
  }
  return {
    level: 'above',
    referenceRM: ref,
    message: `take-home clears the ~RM${ref.toLocaleString('en-MY')} modest baseline for a single adult in KL — there's real room to put the extra to work.`,
  };
}

/** Build an estimated take-home + locked-in tier from real MY rates (so users don't guess). */
export function estimateFromGross(opts: {
  grossMonthly: number;
  vehicle: TransportMode;
  rentMonthly: number;
  muslim?: boolean;
  hasPtptn?: boolean;
  age60plus?: boolean;
}): { takeHomeIncome: number; commitments: { label: string; monthly: number }[] } {
  const epf = estimateEpfEmployeeMonthly(opts.grossMonthly, opts.age60plus);
  const takeHomeIncome = r(opts.grossMonthly - epf); // EPF is pre-deducted → NOT a commitment line
  const commitments: { label: string; monthly: number }[] = [
    { label: 'rent', monthly: r(opts.rentMonthly) },
    { label: opts.vehicle === 'public' ? 'public transport' : `petrol+toll (${opts.vehicle})`, monthly: estimateTransportMonthly(opts.vehicle) },
  ];
  if (opts.hasPtptn) commitments.push({ label: 'ptptn', monthly: suggestPtptnMonthly(opts.grossMonthly) });
  if (opts.muslim) commitments.push({ label: 'zakat', monthly: estimateZakatMonthly(opts.grossMonthly) });
  return { takeHomeIncome, commitments };
}
