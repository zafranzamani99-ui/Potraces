/**
 * coachingEngine — PURE selection of the single most useful nudge for the
 * Savings/Investments coaching band. Returns a structured {kind, data} so the
 * UI can render localized copy; no i18n / React here → tsx-testable.
 *
 * Priority (first applicable wins): stale → runway (savings) → concentration
 * (investments) → next milestone → best-performer / added-this-month.
 */
import { differenceInDays, startOfMonth } from 'date-fns';
import { SavingsAccount } from '../../../types';
import {
  Portfolio, AllocSlice, emergencyRunway, nextMilestone, topConcentration,
} from './savingsMath';

export type NudgeKind =
  | 'stale' | 'runway' | 'concentration' | 'milestone' | 'bestPerformer' | 'addedThisMonth';

export interface Nudge {
  kind: NudgeKind;
  tone: 'savings' | 'investment' | 'neutral';
  icon: string;             // Feather glyph for the coach icon
  data: Record<string, number | string>;
}

export interface CoachInput {
  tab: 'savings' | 'investment';
  accounts: SavingsAccount[];   // accounts in the ACTIVE tab
  portfolio: Portfolio;         // computed over the active tab
  breakdown: AllocSlice[];      // active tab allocation
  avgMonthlySpend: number;      // for the emergency-fund runway (0 if unknown)
  now: Date;
}

const CONCENTRATION_THRESHOLD = 60; // %
const STALE_DAYS = 7;

const toDate = (v: Date | string | number): Date => (v instanceof Date ? v : new Date(v));

function mostStale(accounts: SavingsAccount[], now: Date): { id: string; name: string; days: number } | null {
  let id: string | null = null;
  let name = '';
  let maxDays = 0;
  for (const a of accounts) {
    const last = a.history.length ? toDate(a.history[a.history.length - 1].date) : toDate(a.createdAt);
    const days = differenceInDays(now, last);
    if (days >= STALE_DAYS && days > maxDays) { maxDays = days; id = a.id; name = a.name; }
  }
  return id ? { id, name, days: maxDays } : null;
}

function bestPerformerThisMonth(accounts: SavingsAccount[], now: Date): { name: string; pct: number } | null {
  const mStart = startOfMonth(now);
  let name: string | null = null;
  let bestPct = 0;
  for (const a of accounts) {
    const before = a.history.filter((h) => toDate(h.date) < mStart);
    const startVal = before.length ? before[before.length - 1].value : a.initialInvestment;
    if (startVal <= 0) continue;
    const pct = ((a.currentValue - startVal) / startVal) * 100;
    if (pct > bestPct) { bestPct = pct; name = a.name; }
  }
  return name ? { name, pct: bestPct } : null;
}

/** All applicable nudges, in priority order. */
export function buildNudges(input: CoachInput): Nudge[] {
  const { tab, accounts, portfolio, breakdown, avgMonthlySpend, now } = input;
  const out: Nudge[] = [];
  if (accounts.length === 0) return out;

  // 1. Stale reminder
  const stale = mostStale(accounts, now);
  if (stale) out.push({ kind: 'stale', tone: 'neutral', icon: 'clock', data: stale });

  // 2. Emergency-fund runway (savings tab, needs spending data)
  if (tab === 'savings' && avgMonthlySpend > 0) {
    const r = emergencyRunway(portfolio.totalCurrent, avgMonthlySpend);
    if (r.months < r.targetMonths) {
      out.push({
        kind: 'runway', tone: 'savings', icon: 'shield',
        data: { months: Math.round(r.months * 10) / 10, gap: r.gapToTarget, targetMonths: r.targetMonths, saved: portfolio.totalCurrent },
      });
    }
  }

  // 3. Concentration (investments tab)
  if (tab === 'investment' && accounts.length >= 2) {
    const top = topConcentration(breakdown);
    if (top && top.pct >= CONCENTRATION_THRESHOLD) {
      out.push({ kind: 'concentration', tone: 'investment', icon: 'pie-chart', data: { name: top.name, pct: Math.round(top.pct) } });
    }
  }

  // 4. Next milestone
  const nm = nextMilestone(portfolio.totalCurrent);
  if (nm) out.push({ kind: 'milestone', tone: 'neutral', icon: 'flag', data: { value: nm.value, remaining: nm.remaining, pct: Math.round(nm.pct) } });

  // 5. Best performer / added this month (positive fallback)
  const best = bestPerformerThisMonth(accounts, now);
  if (best && best.pct > 0) {
    out.push({ kind: 'bestPerformer', tone: 'neutral', icon: 'award', data: { name: best.name, pct: Math.round(best.pct * 10) / 10 } });
  } else if (portfolio.monthContributed > 0) {
    out.push({ kind: 'addedThisMonth', tone: 'neutral', icon: 'plus-circle', data: { amount: Math.round(portfolio.monthContributed) } });
  }

  return out;
}

/** The single nudge to show (highest priority), or null. */
export function selectNudge(input: CoachInput): Nudge | null {
  return buildNudges(input)[0] ?? null;
}
