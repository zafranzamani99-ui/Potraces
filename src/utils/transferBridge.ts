import { Transfer } from '../types';
import { newId } from './id';

export function createTransfer(
  amount: number,
  fromMode: 'business' | 'personal',
  toMode: 'business' | 'personal',
  note?: string,
  linkedBusinessTxId?: string,
  /** Destination personal wallet. When set, addTransferIncome credits it —
   *  without it the transfer records income but no wallet balance moves. */
  walletId?: string
): Transfer {
  return {
    id: newId(),
    amount,
    fromMode,
    toMode,
    note,
    linkedBusinessTxId,
    ...(walletId ? { walletId } : {}),
    date: new Date(),
  };
}
