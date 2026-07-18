// Intent / category glyphs for the Notes "Echo" extraction cards + type picker.
// Deliberately MaterialCommunityIcons (not the app-wide thin Feather set): the
// finance glyphs here read far more clearly than generic arrows — cash-plus/minus,
// piggy-bank, hand-coin, calendar-sync — so a glance tells you what each item is.
import { MaterialCommunityIcons } from '@expo/vector-icons';

export type MciName = keyof typeof MaterialCommunityIcons.glyphMap;

export const INTENT_MCI: Record<string, MciName> = {
  expense: 'arrow-up-circle',     // money going out (up = spent, app-wide convention)
  income: 'arrow-down-circle',    // money coming in
  debt: 'hand-coin',             // lent / owed — matches the Debt quick-action icon
  debt_update: 'check-circle',    // a repayment landed
  bnpl: 'credit-card-outline',    // buy-now-pay-later / installment
  subscription: 'repeat',         // recurring bill
  seller_order: 'shopping',       // customer order
  seller_cost: 'package-variant', // stock / ingredient cost
  savings_goal: 'piggy-bank',     // saving / investing — matches the Savings quick-action icon
  query: 'magnify',               // a question about the money
  plain: 'note-text-outline',     // no financial content
  // playbook intentionally omitted — a v2 feature; falls back to the neutral glyph.
};

export const INTENT_MCI_FALLBACK: MciName = 'circle-outline';

export function intentGlyph(type: string): MciName {
  return INTENT_MCI[type] || INTENT_MCI_FALLBACK;
}
