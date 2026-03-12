/**
 * Hook that tallies total BNPL / credit usage across all credit wallets.
 * "Future You Owes" — the total usedCredit across credit-type wallets.
 */

import { useMemo } from 'react';
import { useWalletStore } from '../store/walletStore';

interface BNPLSummary {
  totalUsed: number;
  totalLimit: number;
  walletCount: number;
  utilizationPercent: number;
}

export function useBNPLTotal(): BNPLSummary {
  const wallets = useWalletStore((s) => s.wallets);

  return useMemo(() => {
    const creditWallets = wallets.filter((w) => w.type === 'credit');
    const totalUsed = creditWallets.reduce(
      (sum, w) => sum + (w.usedCredit || 0),
      0
    );
    const totalLimit = creditWallets.reduce(
      (sum, w) => sum + (w.creditLimit || 0),
      0
    );
    const utilizationPercent =
      totalLimit > 0 ? Math.round((totalUsed / totalLimit) * 100) : 0;

    return {
      totalUsed,
      totalLimit,
      walletCount: creditWallets.length,
      utilizationPercent,
    };
  }, [wallets]);
}
