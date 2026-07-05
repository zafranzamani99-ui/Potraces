/**
 * Pure inbox-row → logQuickExpense params mapping. Native-free (no supabase, no
 * expo-*) so it is unit-testable under tsx — same split rationale as the repo's
 * personalSyncMappers.ts. See docs/superpowers/specs/2026-07-05-background-quick-log-design.md.
 */
import type { QuickLogParams } from './quickLog';

export interface QuickLogInboxRow {
  id: string;
  user_id: string;
  amount: number;
  type: 'expense' | 'income';
  category: string | null;
  wallet: string | null;
  note: string | null;
  occurred_at: string;
  consumed_at: string | null;
}

/** Pure mapping: inbox row → logQuickExpense params. */
export function mapInboxRowToQuickLog(row: QuickLogInboxRow): QuickLogParams {
  const d = new Date(row.occurred_at);
  return {
    amount: Number(row.amount),
    type: row.type === 'income' ? 'income' : 'expense',
    category: row.category ?? undefined,
    wallet: row.wallet ?? undefined,
    note: row.note ?? undefined,
    date: Number.isNaN(d.getTime()) ? undefined : d,
  };
}
