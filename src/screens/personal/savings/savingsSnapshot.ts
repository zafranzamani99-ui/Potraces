/**
 * savingsSnapshot — builds the plain-text `contextSnapshot` that the Savings
 * screen hands to Echo (EchoInlineChat) so answers are grounded in THIS
 * portfolio. Mirrors buildWalletSnapshot / buildGoalSnapshot conventions:
 * `[X snapshot]` header, money as `${currency} ${n.toFixed(0)}`, `• name: value`
 * rows. Pure → tsx-testable.
 */
import { format } from 'date-fns';
import { SavingsAccount } from '../../../types';
import { Portfolio, AllocSlice, computeAccountDerived } from './savingsMath';
import { CustomResolver } from './investmentTypes';

export interface SnapshotInput {
  accounts: SavingsAccount[];
  portfolio: Portfolio;
  breakdown: AllocSlice[];
  currency: string;
  now: Date;
  resolveCustom?: CustomResolver;
}

const toDate = (v: Date | string | number): Date => (v instanceof Date ? v : new Date(v));

export function buildSavingsSnapshot(input: SnapshotInput): string {
  const { accounts, portfolio: p, breakdown, currency, now, resolveCustom } = input;
  const money = (n: number) => `${currency} ${Math.round(n).toLocaleString('en-MY')}`;
  const signed = (n: number) => `${n >= 0 ? '+' : ''}${money(n)}`;
  const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

  const lines: string[] = [];
  lines.push('[Savings & investments snapshot]');

  if (accounts.length === 0) {
    lines.push('No savings or investment accounts yet.');
    return lines.join('\n');
  }

  lines.push(`Portfolio value: ${money(p.totalCurrent)} across ${accounts.length} account${accounts.length === 1 ? '' : 's'}`);
  lines.push(`Invested: ${money(p.totalInvested)} | Gain: ${signed(p.totalGain)} (${pct(p.totalReturn)})`);
  // NOTE: we can't distinguish real deposits from market gains in history, so we do
  // NOT claim an "added" figure here — only the honest net value change for the month.
  lines.push(`Net value change this month: ${signed(p.monthValueChange)}`);

  if (breakdown.length) {
    lines.push('');
    lines.push('Allocation by type:');
    for (const b of breakdown) lines.push(`• ${b.name}: ${money(b.value)} (${b.pct.toFixed(0)}%)`);
  }

  lines.push('');
  lines.push('Accounts:');
  for (const a of accounts) {
    const d = computeAccountDerived(a, now, resolveCustom);
    const last = a.history.length ? toDate(a.history[a.history.length - 1].date) : null;
    const parts = [
      `• ${a.name} (${d.typeInfo.name}): ${money(a.currentValue)} [${pct(d.returnPct)}]`,
    ];
    if (a.target) parts.push(`target ${money(a.target)}`);
    if (a.annualRate) parts.push(`${a.annualRate}% p.a.`);
    parts.push(last ? `updated ${format(last, 'MMM d')}` : 'never updated');
    lines.push(parts.join(', '));
  }

  return lines.join('\n');
}
