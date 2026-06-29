import { useMemo } from 'react';
import { Debt, SplitExpense } from '../../../types';
import {
  computeBalanceSummary,
  computeDebtTabCounts,
  computeDebtFilterCounts,
  computeDebtTypeCounts,
  computeSplitWaitingTotal,
  computeSplitYouOweTotal,
  computeSplitSettledTotal,
} from '../../../utils/debtTracking';
import { SplitTab, DebtTab, DebtFilter, DebtTypeFilter, DebtSort } from './useDebtFilters';

interface UseDebtDerivedInput {
  debts: Debt[];
  splits: SplitExpense[];
  mode: string;
  splitTab: SplitTab;
  debtTab: DebtTab;
  searchQuery: string;
  debtFilter: DebtFilter;
  debtTypeFilter: DebtTypeFilter;
  debtSort: DebtSort;
  splitSort: DebtSort;
}

/**
 * Read-only filter / bucket / total memos for the debts + splits tabs.
 * Pure function of the store arrays + the UI filter state — holds no state, writes nothing.
 * Bucketing branch order is preserved exactly from the original component.
 */
export function useDebtDerived({
  debts,
  splits,
  mode,
  splitTab,
  debtTab,
  searchQuery,
  debtFilter,
  debtTypeFilter,
  debtSort,
  splitSort,
}: UseDebtDerivedInput) {
  // Filtered data
  const modeDebts = useMemo(() => debts.filter((d) => d.mode === mode), [debts, mode]);
  const modeSplits = useMemo(() => splits.filter((s) => s.mode === mode), [splits, mode]);

  // Search + type + status filtered + sorted debts
  const filteredDebts = useMemo(() => {
    let result = modeDebts;
    // Bucket by tab — archive is a separate world.
    if (debtTab === 'archive') {
      result = result.filter((d) => d.isArchived === true);
    } else {
      // Default views: exclude archived items entirely.
      result = result.filter((d) => !d.isArchived);
      if (debtTab === 'pending') {
        result = result.filter((d) => d.status !== 'settled');
      } else if (debtTab === 'settled') {
        result = result.filter((d) => d.status === 'settled');
      }
    }
    if (debtTypeFilter) {
      result = result.filter((d) => d.type === debtTypeFilter);
    }
    if (debtFilter) {
      result = result.filter((d) => d.status === debtFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (d) => d.contact.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q)
      );
    }
    result = [...result].sort((a, b) => {
      // Use updatedAt for settled/partial (reflects last payment), createdAt for pending
      const aTime = new Date(a.status === 'pending' ? a.createdAt : a.updatedAt).getTime();
      const bTime = new Date(b.status === 'pending' ? b.createdAt : b.updatedAt).getTime();
      switch (debtSort) {
        case 'newest': return bTime - aTime || b.id.localeCompare(a.id);
        case 'oldest': return aTime - bTime || a.id.localeCompare(b.id);
        case 'amount_high': return (b.totalAmount - b.paidAmount) - (a.totalAmount - a.paidAmount) || bTime - aTime;
        case 'amount_low': return (a.totalAmount - a.paidAmount) - (b.totalAmount - b.paidAmount) || bTime - aTime;
        default: return 0;
      }
    });
    return result;
  }, [modeDebts, debtTab, debtTypeFilter, debtFilter, searchQuery, debtSort]);

  // Bucket counts (always uses non-mode-filtered modeDebts so badges reflect totals)
  const debtTabCounts = useMemo(() => computeDebtTabCounts(modeDebts), [modeDebts]);

  const groupedDebts = useMemo(() => {
    const map = new Map<string, { contactId: string; contactName: string; contact: typeof filteredDebts[0]['contact']; debts: typeof filteredDebts; totalRemaining: number }>();
    filteredDebts.forEach((debt) => {
      const key = debt.groupId || debt.contact.id || debt.contact.name;
      if (!map.has(key)) {
        map.set(key, { contactId: key, contactName: debt.contact.name, contact: debt.contact, debts: [], totalRemaining: 0 });
      }
      const g = map.get(key)!;
      g.debts.push(debt);
      g.totalRemaining += Math.max(0, debt.totalAmount - debt.paidAmount);
    });
    return Array.from(map.values());
  }, [filteredDebts]);

  // Search filtered splits
  const searchedSplits = useMemo(() => {
    if (!searchQuery.trim()) return modeSplits;
    const q = searchQuery.toLowerCase().trim();
    return modeSplits.filter(
      (s) => s.description.toLowerCase().includes(q) ||
        s.participants.some((p) => p.contact.name.toLowerCase().includes(q))
    );
  }, [modeSplits, searchQuery]);

  // Bucket each split into one of: drafts | waiting (others owe me) | youOwe | settled.
  // Drafts are workflow stash, not a status — they always go to drafts regardless of payment state.
  // For finalised splits:
  //   - settled when every non-self participant has isPaid === true
  //   - youOwe when someone else fronted the cash AND my own share is unpaid
  //   - waiting otherwise (I fronted, or paidBy undefined and anyone unpaid)
  const splitBuckets = useMemo(() => {
    const groups: Record<'waiting' | 'youOwe' | 'settled' | 'drafts' | 'archive', SplitExpense[]> = {
      waiting: [], youOwe: [], settled: [], drafts: [], archive: [],
    };
    searchedSplits.forEach((s) => {
      // Archived splits go to the archive bucket — never appear in other buckets.
      if (s.isArchived) {
        groups.archive.push(s);
        return;
      }
      if (s.status === 'draft') {
        groups.drafts.push(s);
        return;
      }
      // "I still owe my share" must win over settled: the payer is auto-marked isPaid at
      // creation, so a "someone else paid" split would otherwise auto-bucket as settled
      // and hide my own unpaid share. Check youOwe BEFORE settled.
      if (s.paidBy && s.paidBy.id !== '__self__') {
        const me = s.participants.find((p) => p.contact.id === '__self__');
        if (me && !me.isPaid) {
          groups.youOwe.push(s);
          return;
        }
      }
      const nonSelf = s.participants.filter((p) => p.contact.id !== '__self__');
      const allPaid = nonSelf.length > 0 && nonSelf.every((p) => p.isPaid);
      if (allPaid) {
        groups.settled.push(s);
        return;
      }
      groups.waiting.push(s);
    });
    const sorter = (a: SplitExpense, b: SplitExpense) => {
      const aTime = new Date(a.createdAt).getTime();
      const bTime = new Date(b.createdAt).getTime();
      switch (splitSort) {
        case 'newest': return bTime - aTime;
        case 'oldest': return aTime - bTime;
        case 'amount_high': return b.totalAmount - a.totalAmount || bTime - aTime;
        case 'amount_low': return a.totalAmount - b.totalAmount || bTime - aTime;
        default: return 0;
      }
    };
    (Object.keys(groups) as Array<keyof typeof groups>).forEach((k) => groups[k].sort(sorter));
    return groups;
  }, [searchedSplits, splitSort]);

  // Hero numbers — what the user actually wants to know at a glance.
  const waitingTotal = useMemo(
    () => computeSplitWaitingTotal(splitBuckets.waiting),
    [splitBuckets.waiting]
  );
  const youOweTotal = useMemo(
    () => computeSplitYouOweTotal(splitBuckets.youOwe),
    [splitBuckets.youOwe]
  );
  const settledTotal = useMemo(
    () => computeSplitSettledTotal(splitBuckets.settled),
    [splitBuckets.settled]
  );

  // Currently visible bucket (drives the list under the segmented control).
  const filteredSplits = useMemo(() => splitBuckets[splitTab], [splitBuckets, splitTab]);

  const activeSplitCount = useMemo(
    () => splitBuckets.waiting.length + splitBuckets.youOwe.length,
    [splitBuckets.waiting.length, splitBuckets.youOwe.length]
  );
  const settledSplitCount = splitBuckets.settled.length;
  const draftSplitCount = splitBuckets.drafts.length;
  const archiveSplitCount = splitBuckets.archive.length;

  const searchedModeDebts = useMemo(() => {
    if (!searchQuery.trim()) return modeDebts;
    const q = searchQuery.toLowerCase().trim();
    return modeDebts.filter((d) =>
      d.contact.name.toLowerCase().includes(q) || d.description.toLowerCase().includes(q)
    );
  }, [modeDebts, searchQuery]);

  // Debt filter counts (respects type filter + search)
  const debtFilterCounts = useMemo(
    () => computeDebtFilterCounts(searchedModeDebts, debtTypeFilter),
    [searchedModeDebts, debtTypeFilter]
  );

  // Debt type filter counts (respects status filter + search)
  const debtTypeCounts = useMemo(
    () => computeDebtTypeCounts(searchedModeDebts, debtFilter),
    [searchedModeDebts, debtFilter]
  );

  // Balance summary
  const balanceSummary = useMemo(() => computeBalanceSummary(modeDebts), [modeDebts]);

  return {
    modeDebts,
    modeSplits,
    filteredDebts,
    debtTabCounts,
    groupedDebts,
    searchedSplits,
    splitBuckets,
    waitingTotal,
    youOweTotal,
    settledTotal,
    filteredSplits,
    activeSplitCount,
    settledSplitCount,
    draftSplitCount,
    archiveSplitCount,
    searchedModeDebts,
    debtFilterCounts,
    debtTypeCounts,
    balanceSummary,
  };
}
