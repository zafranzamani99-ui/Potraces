import { Transfer } from '../types';

export function createTransfer(
  amount: number,
  fromMode: 'business' | 'personal',
  toMode: 'business' | 'personal',
  note?: string,
  linkedBusinessTxId?: string
): Transfer {
  return {
    id: Date.now().toString(),
    amount,
    fromMode,
    toMode,
    note,
    linkedBusinessTxId,
    date: new Date(),
  };
}
