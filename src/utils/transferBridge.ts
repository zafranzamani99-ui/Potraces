import { Transfer } from '../types';
import { newId } from './id';

export function createTransfer(
  amount: number,
  fromMode: 'business' | 'personal',
  toMode: 'business' | 'personal',
  note?: string,
  linkedBusinessTxId?: string
): Transfer {
  return {
    id: newId(),
    amount,
    fromMode,
    toMode,
    note,
    linkedBusinessTxId,
    date: new Date(),
  };
}
