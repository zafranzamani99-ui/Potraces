import { format, differenceInDays, isValid } from 'date-fns';
import { DEBT_TYPES_SAFE, DEBT_STATUSES_SAFE, semantic } from '../constants';
import { Contact, Debt, SplitExpense } from '../types';

/**
 * Normalize a free-typed amount string: strip commas + non-numeric chars,
 * collapse to a single decimal point, and clamp the fraction to 2 digits.
 * Returns the normalized string (caller wires its own setX).
 */
export function normalizeAmountInput(raw: string): string {
  const stripped = raw.replace(/,/g, '').replace(/[^\d.]/g, '');
  const fd = stripped.indexOf('.');
  let normalized = stripped;
  if (fd !== -1) {
    normalized = stripped.slice(0, fd + 1) + stripped.slice(fd + 1).replace(/\./g, '');
    const [ip, fp = ''] = normalized.split('.');
    normalized = ip + '.' + fp.slice(0, 2);
  }
  return normalized;
}

/**
 * Safely format a date-ish value with the given date-fns format string.
 * Returns `fallback` when the value parses to an invalid date.
 */
export function safeFormatDate(
  value: string | number | Date,
  fmtStr: string,
  fallback: string
): string {
  const d = new Date(value);
  return isValid(d) ? format(d, fmtStr) : fallback;
}

/**
 * Normalize a Malaysian phone number to a wa.me-friendly form (60-prefixed,
 * no spaces/dashes/parens, no leading +).
 */
export function cleanPhoneNumber(phone: string): string {
  let cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '60' + cleaned.slice(1);
  }
  if (!cleaned.startsWith('+') && !cleaned.startsWith('60')) {
    cleaned = '60' + cleaned;
  }
  cleaned = cleaned.replace(/^\+/, '');
  return cleaned;
}

/** Compact age label for a debt: "today", "3d", "2w", "5mo", "1y". */
export function getDebtAge(createdAt: string | Date): string {
  const days = differenceInDays(new Date(), new Date(createdAt));
  if (days === 0) return 'today';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

/** Age-toned reminder copy for a "they owe me" debt. */
export function getReminderTone(
  createdAt: string | Date,
  contactName: string,
  amount: number,
  description: string,
  cur: string
): string {
  const days = differenceInDays(new Date(), new Date(createdAt));
  const amt = `${cur} ${amount.toFixed(2)}`;
  if (days < 7) {
    return `Hey ${contactName}, you owe me ${amt} for ${description}\n\nNo rush, just checking in!`;
  } else if (days < 30) {
    return `Hi ${contactName}, you owe me ${amt} for ${description}\n\nCan you settle when free? Thank you!`;
  } else {
    return `Hi ${contactName}, you owe me ${amt} for ${description}\n\nIt's been a while — can you settle when you get a chance? Thank you!`;
  }
}

/** Resolve a status's safe-table entry with its semantic color baked in. */
export function getStatusConfig(status: string, isDark: boolean) {
  const safe = DEBT_STATUSES_SAFE.find((s) => s.value === status) || DEBT_STATUSES_SAFE[0];
  return { ...safe, color: semantic(safe.color, isDark) };
}

/** Resolve a type's safe-table entry with its semantic color baked in. */
export function getTypeConfig(type: string, isDark: boolean) {
  const safe = DEBT_TYPES_SAFE.find((t) => t.value === type) || DEBT_TYPES_SAFE[0];
  return { ...safe, color: semantic(safe.color, isDark) };
}

/** Hero balance summary across active (non-archived) debts. */
export function computeBalanceSummary(modeDebts: Debt[]): {
  youOwe: number;
  owedToYou: number;
  collected: number;
  paid: number;
} {
  const activeDebts = modeDebts.filter((d) => !d.isArchived);

  const youOwe = activeDebts
    .filter((d) => d.type === 'i_owe' && d.status !== 'settled')
    .reduce((sum, d) => sum + (d.totalAmount - d.paidAmount), 0);

  const owedToYou = activeDebts
    .filter((d) => d.type === 'they_owe' && d.status !== 'settled')
    .reduce((sum, d) => sum + (d.totalAmount - d.paidAmount), 0);

  const collected = activeDebts
    .filter((d) => d.type === 'they_owe')
    .reduce((sum, d) => sum + d.payments.filter((p) => p.note !== 'netted').reduce((s, p) => s + p.amount, 0), 0);

  const paid = activeDebts
    .filter((d) => d.type === 'i_owe')
    .reduce((sum, d) => sum + d.payments.filter((p) => p.note !== 'netted').reduce((s, p) => s + p.amount, 0), 0);

  return { youOwe, owedToYou, collected, paid };
}

/** Up to 8 most-recent unique people from existing debts (quick-pick chips). */
export function getRecentDebtPeople(debts: Debt[]): Contact[] {
  const seen = new Set<string>();
  const out: Contact[] = [];
  const sorted = [...debts].sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime());
  for (const d of sorted) {
    const c = d.contact;
    const key = c?.name?.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= 8) break;
  }
  return out;
}

/** Date label for a contact's debt group: "settled MMM d" / "since MMM d" / null. */
export function getGroupDateLabel(groupDebts: Debt[]): string | null {
  const allSettled = groupDebts.every((d) => d.status === 'settled');
  if (allSettled) {
    const latestPayment = groupDebts
      .flatMap((d) => d.payments)
      .reduce((latest, p) => {
        const pd = new Date(p.createdAt);
        return pd > latest ? pd : latest;
      }, new Date(0));
    return isValid(latestPayment) && latestPayment.getTime() > 0
      ? `settled ${format(latestPayment, 'MMM d')}`
      : null;
  }
  const oldest = groupDebts.reduce((o, d) => {
    const cd = new Date(d.createdAt);
    return cd < o ? cd : o;
  }, new Date());
  return isValid(oldest) ? `since ${format(oldest, 'MMM d')}` : null;
}

/** Bucket counts for the debt tab badges (pending / settled / archive). */
export function computeDebtTabCounts(modeDebts: Debt[]): {
  pending: number;
  settled: number;
  archive: number;
} {
  return {
    pending: modeDebts.filter((d) => !d.isArchived && d.status !== 'settled').length,
    settled: modeDebts.filter((d) => !d.isArchived && d.status === 'settled').length,
    archive: modeDebts.filter((d) => d.isArchived === true).length,
  };
}

/** Status filter counts (respects an optional type filter + search-prefiltered list). */
export function computeDebtFilterCounts(
  searchedModeDebts: Debt[],
  debtTypeFilter: string | null
): { pending: number; partial: number; settled: number } {
  const active = searchedModeDebts.filter((d) => !d.isArchived);
  const base = debtTypeFilter ? active.filter((d) => d.type === debtTypeFilter) : active;
  return {
    pending: base.filter((d) => d.status === 'pending').length,
    partial: base.filter((d) => d.status === 'partial').length,
    settled: base.filter((d) => d.status === 'settled').length,
  };
}

/** Type filter counts (respects an optional status filter + search-prefiltered list). */
export function computeDebtTypeCounts(
  searchedModeDebts: Debt[],
  debtFilter: string | null
): { i_owe: number; they_owe: number } {
  const active = searchedModeDebts.filter((d) => !d.isArchived);
  const base = debtFilter ? active.filter((d) => d.status === debtFilter) : active;
  return {
    i_owe: base.filter((d) => d.type === 'i_owe').length,
    they_owe: base.filter((d) => d.type === 'they_owe').length,
  };
}

/** Sum of unpaid non-self shares across "waiting" splits. */
export function computeSplitWaitingTotal(waiting: SplitExpense[]): number {
  return waiting.reduce((sum, s) => {
    const nonSelf = s.participants.filter((p) => p.contact.id !== '__self__');
    return sum + nonSelf.filter((p) => !p.isPaid).reduce((a, p) => a + p.amount, 0);
  }, 0);
}

/** Sum of my own unpaid share across "you owe" splits. */
export function computeSplitYouOweTotal(youOwe: SplitExpense[]): number {
  return youOwe.reduce((sum, s) => {
    const me = s.participants.find((p) => p.contact.id === '__self__');
    return me && !me.isPaid ? sum + me.amount : sum;
  }, 0);
}

/** Sum of totals across "settled" splits. */
export function computeSplitSettledTotal(settled: SplitExpense[]): number {
  return settled.reduce((sum, s) => sum + s.totalAmount, 0);
}
