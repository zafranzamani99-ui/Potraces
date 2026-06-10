/**
 * commitmentParse — turn free text ("rumah sewa 850 sebulan due 25hb", "atome kasut 3x49.90")
 * into a commitment schedule: billing cycle, due day, and installment count.
 *
 * Pure + dependency-light so it can be reused by the Notes AI confirm flow, Echo
 * actions, and the ConfirmationCard preview. Amount itself is parsed elsewhere —
 * this only derives the *schedule* (when/how often/how many).
 */
import {
  addMonths,
  addWeeks,
  addQuarters,
  addYears,
  getDaysInMonth,
  setDate,
  startOfDay,
  isBefore,
} from 'date-fns';

export type BillingCycle = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface CommitmentSchedule {
  billingCycle: BillingCycle;
  /** Day-of-month the bill is due (1–31), if stated. */
  dueDay?: number;
  /** Number of installments if it's a plan (e.g. "3x"). Only set when > 1. */
  installments?: number;
  /** True when the text clearly reads as a recurring commitment (not a one-off spend). */
  isRecurring: boolean;
}

// Cycle words — BM + EN. Order matters: check the more specific cycles before monthly.
const CYCLE_PATTERNS: { cycle: BillingCycle; re: RegExp }[] = [
  { cycle: 'weekly', re: /\b(weekly|mingguan|tiap minggu|setiap minggu|every week|per week|seminggu|wkly)\b/i },
  { cycle: 'quarterly', re: /\b(quarterly|suku tahun|tiap 3 bulan|every 3 months|per quarter|3 bulan sekali)\b/i },
  { cycle: 'yearly', re: /\b(yearly|annual|annually|tahunan|setahun|per year|every year|tiap tahun|sekali setahun)\b/i },
  { cycle: 'monthly', re: /\b(monthly|bulanan|tiap bulan|setiap bulan|sebulan|per month|every month|each month|mthly)\b/i },
];

// Any signal that this is an ongoing commitment, not a one-off purchase.
const RECURRING_HINTS = /\b(subscription|langganan|recurring|auto ?debit|standing instruction|sewa|rental|insurans|insurance|takaful|premium|yuran|loan|pinjaman|ptptn|commitment|komitmen|bil bulanan)\b/i;

// Due day-of-month. Each pattern is anchored on day context so it never grabs the amount.
const DUEDAY_PATTERNS: RegExp[] = [
  /\b(\d{1,2})\s*(?:hb|haribulan)\b/i,                                  // "25hb"
  /\bdue\s*(?:on\s*)?(?:the\s*)?(\d{1,2})(?:st|nd|rd|th)?\b/i,          // "due 25", "due on the 25th"
  /\b(\d{1,2})(?:st|nd|rd|th)\s*(?:of\s*)?(?:every|each)?\s*month\b/i,  // "25th of every month"
  // "every 25", "setiap 1hb" — but NOT "every 3 months" / "tiap 3 bulan" (that's a cycle, not a due day)
  /\b(?:on|every|each|setiap|tiap)\s+(?:the\s*)?(\d{1,2})(?:st|nd|rd|th|hb)?\b(?!\s*(?:month|bulan|minggu|week|tahun|year|hari|day))/i,
];

// Installment count. Avoid bnpl-only words (atome/ansuran are handled as bnpl upstream).
const INSTALLMENT_PATTERNS: RegExp[] = [
  // "3x49.90" / "3 x rm49.90" — a digit right after the x kills \b, so match the price
  // explicitly. The trailing \b forces the number to end at a boundary, so a quantity
  // like "3x100ml" (number glued to a unit) never matches.
  /\b(\d{1,2})\s*[x×]\s*(?:rm\s*)?\d+(?:\.\d{1,2})?\b/i,
  /\b(\d{1,2})\s*[x×](?=\s|$)/i,                                        // "3x " or trailing "3x"
  /\b[x×]\s*(\d{1,2})\b/i,                                              // "x3"
  /\b(\d{1,2})\s*(?:kali|installments?|instalments?|payments?)\b/i,     // "3 kali", "3 installments"
  /\b(?:installments?|instalments?)\s*(\d{1,2})\b/i,                    // "installment 3"
];

function detectCycle(text: string): BillingCycle | undefined {
  for (const { cycle, re } of CYCLE_PATTERNS) if (re.test(text)) return cycle;
  return undefined;
}

function detectDueDay(text: string): number | undefined {
  for (const re of DUEDAY_PATTERNS) {
    const m = re.exec(text);
    if (m && m[1]) {
      const d = parseInt(m[1], 10);
      if (d >= 1 && d <= 31) return d;
    }
  }
  return undefined;
}

function detectInstallments(text: string): number | undefined {
  for (const re of INSTALLMENT_PATTERNS) {
    const m = re.exec(text);
    if (m && m[1]) {
      const n = parseInt(m[1], 10);
      if (n >= 2 && n <= 60) return n;
    }
  }
  return undefined;
}

export function parseCommitmentSchedule(text: string): CommitmentSchedule {
  const t = (text || '').toLowerCase();
  const cycle = detectCycle(t);
  const dueDay = detectDueDay(t);
  const installments = detectInstallments(t);
  const isRecurring = !!cycle || dueDay != null || installments != null || RECURRING_HINTS.test(t);
  return {
    billingCycle: cycle || 'monthly',
    dueDay,
    installments,
    isRecurring,
  };
}

function advance(d: Date, cycle: BillingCycle): Date {
  switch (cycle) {
    case 'weekly': return addWeeks(d, 1);
    case 'quarterly': return addQuarters(d, 1);
    case 'yearly': return addYears(d, 1);
    default: return addMonths(d, 1);
  }
}

/**
 * The next due date for a brand-new commitment. With a monthly due day, it's the
 * upcoming occurrence of that day (this month if still ahead, else next month —
 * clamped for short months). Otherwise it's one cycle from `from`.
 */
export function computeNextBillingDate(from: Date, cycle: BillingCycle, dueDay?: number): Date {
  const today = startOfDay(from);
  if (dueDay && cycle === 'monthly') {
    let candidate = setDate(today, Math.min(dueDay, getDaysInMonth(today)));
    if (isBefore(candidate, today)) {
      const nextMonth = addMonths(candidate, 1);
      candidate = setDate(nextMonth, Math.min(dueDay, getDaysInMonth(nextMonth)));
    }
    return candidate;
  }
  return advance(today, cycle);
}
