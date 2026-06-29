import { useEffect } from 'react';
import { differenceInDays } from 'date-fns';
import { Debt } from '../../../types';

/**
 * Auto-archive settled debts older than 30 days (respects groups — waits for all siblings).
 * Store-driven only: reads `debts` and calls `archiveDebt`.
 */
export function useDebtAutoArchive(debts: Debt[], archiveDebt: (id: string) => void) {
  useEffect(() => {
    const now = new Date();
    const stale = debts.filter(
      (d) => d.status === 'settled' && !d.isArchived && differenceInDays(now, new Date(d.updatedAt)) >= 30,
    );
    const safeToArchive = stale.filter((d) => {
      if (!d.groupId) return true;
      const groupSiblings = debts.filter((s) => s.groupId === d.groupId && s.id !== d.id && !s.isArchived);
      return groupSiblings.every((s) =>
        s.status === 'settled' && differenceInDays(now, new Date(s.updatedAt)) >= 30
      );
    });
    if (safeToArchive.length > 0) {
      safeToArchive.forEach((d) => archiveDebt(d.id));
    }
  }, [debts, archiveDebt]);
}
