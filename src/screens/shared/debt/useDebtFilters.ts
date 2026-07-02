import { useState, useEffect } from 'react';

export type SplitTab = 'waiting' | 'youOwe' | 'settled' | 'drafts' | 'archive';
export type DebtTab = 'pending' | 'settled' | 'archive';
export type DebtFilter = 'pending' | 'partial' | 'settled' | null;
export type DebtTypeFilter = 'i_owe' | 'they_owe' | null;
export type DebtSort = 'newest' | 'oldest' | 'amount_high' | 'amount_low';

/**
 * Tab / sort / search UI filter state for the debts + splits tabs, plus the archive
 * snap-back effect (if archive is turned off while the user is in it, drop them back to
 * a visible tab). Output bundles into `useDebtDerived` as its filter input.
 */
export function useDebtFilters(debtsShowArchive: boolean) {
  // Split filter
  const [splitTab, setSplitTab] = useState<SplitTab>('waiting');
  const [debtTab, setDebtTab] = useState<DebtTab>('pending');

  // Search + debt filter
  const [searchQuery, setSearchQuery] = useState('');
  const [debtFilter, setDebtFilter] = useState<DebtFilter>(null);
  const [debtTypeFilter, setDebtTypeFilter] = useState<DebtTypeFilter>(null);
  const [debtSort, setDebtSort] = useState<DebtSort>('newest');
  const [splitSort, setSplitSort] = useState<DebtSort>('newest');

  // ── Snap back to a visible tab if archive is turned off while user is in it ──
  useEffect(() => {
    if (!debtsShowArchive) {
      if (splitTab === 'archive') setSplitTab('waiting');
      if (debtTab === 'archive') setDebtTab('pending');
    }
  }, [debtsShowArchive, splitTab, debtTab]);

  return {
    splitTab, setSplitTab,
    debtTab, setDebtTab,
    searchQuery, setSearchQuery,
    debtFilter, setDebtFilter,
    debtTypeFilter, setDebtTypeFilter,
    debtSort, setDebtSort,
    splitSort, setSplitSort,
  };
}
