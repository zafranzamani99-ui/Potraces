import { Contact, SplitItem, SplitParticipant, TaxHandling } from '../types';

interface CalculateSplitInput {
  items: SplitItem[];
  participants: Contact[];
  confirmedTotal: number;
  taxAmount: number;
  taxHandling: TaxHandling;
  paidBy?: Contact | null;
}

interface PersonBreakdown {
  contact: Contact;
  itemShares: { name: string; amount: number; shared: boolean }[];
  taxShare: number;
  total: number;
}

export interface CalculateSplitResult {
  participants: SplitParticipant[];
  effectiveTotal: number;
  breakdown: PersonBreakdown[];
}

export function calculateSplit(input: CalculateSplitInput): CalculateSplitResult {
  const { items, participants, confirmedTotal, taxAmount, taxHandling, paidBy } = input;

  const hasTax = taxAmount > 0 && taxHandling === 'divide';
  const effectiveTotal = taxHandling === 'waive' ? confirmedTotal - taxAmount : confirmedTotal;

  // Calculate item share per person
  const personMap = new Map<string, { itemShares: { name: string; amount: number; shared: boolean }[]; itemTotal: number }>();
  participants.forEach((c) => personMap.set(c.id, { itemShares: [], itemTotal: 0 }));

  items.forEach((item) => {
    const assigneeCount = item.assignedTo.length || 1;
    const share = Math.round((item.amount / assigneeCount) * 100) / 100;
    item.assignedTo.forEach((c) => {
      const entry = personMap.get(c.id);
      if (entry) {
        entry.itemShares.push({ name: item.name, amount: share, shared: assigneeCount > 1 });
        entry.itemTotal += share;
      }
    });
  });

  // Only count participants with items for tax division
  const participantsWithItems = participants.filter((c) => {
    const entry = personMap.get(c.id);
    return entry && entry.itemTotal > 0;
  });
  const taxDivisor = participantsWithItems.length || participants.length;

  // Build breakdown with tax
  const breakdown: PersonBreakdown[] = [];
  const splitParticipants: SplitParticipant[] = [];

  participants.forEach((c) => {
    const entry = personMap.get(c.id)!;
    const hasItems = entry.itemTotal > 0;
    let taxShare = 0;
    if (hasTax && hasItems) {
      taxShare = Math.round((taxAmount / taxDivisor) * 100) / 100;
    }

    let total = Math.round((entry.itemTotal + taxShare) * 100) / 100;

    // Skip participants with zero total (no items assigned) unless they are the payer
    const isPayer = paidBy ? c.id === paidBy.id : false;
    if (total <= 0 && !isPayer) return;

    breakdown.push({ contact: c, itemShares: entry.itemShares, taxShare, total });
    splitParticipants.push({
      contact: c,
      amount: total,
      isPaid: isPayer,
    });
  });

  // Distribute rounding remainder to the first participant
  const sumOfAmounts = splitParticipants.reduce((sum, p) => sum + p.amount, 0);
  const remainder = Math.round((effectiveTotal - sumOfAmounts) * 100) / 100;
  if (remainder !== 0 && Math.abs(remainder) <= 0.02 && splitParticipants.length > 0) {
    splitParticipants[0].amount = Math.round((splitParticipants[0].amount + remainder) * 100) / 100;
    breakdown[0].total = splitParticipants[0].amount;
  }

  return { participants: splitParticipants, effectiveTotal, breakdown };
}
