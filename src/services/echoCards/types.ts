/**
 * Echo reply cards — the data shape Echo attaches to a chat reply so the app can
 * render a rich visual card (big number, icon rows, breakdown) instead of only
 * plain text. Mirrors the `[ACTION]`/`[MEMORY]` directive pattern (see
 * chatActions.ts): the MODEL picks a card KIND (+ optional param); the APP fills
 * every number from the stores (echoCards/fillCards.ts). The model never supplies
 * amounts — that's the whole anti-hallucination guarantee.
 *
 * This module is a leaf (no store/component imports) so both the parser and the
 * renderer can depend on it without cycles. Every field is JSON-serializable —
 * cards are persisted whole inside AIMessage (aiInsightsStore), so icons are
 * STRINGS (CategoryIcon spec grammar), never component refs.
 */

// Every planned kind. `BUILT_KINDS` (below) gates which ones actually render —
// a model-emitted kind with no builder is parsed but drops to no card.
export type EchoCardKind =
  // core
  | 'cash_flow'
  | 'category_breakdown'
  | 'subscriptions'
  | 'wallet_liquid'
  | 'net_worth'
  | 'goals_overview'
  | 'debt_overview'
  | 'month_outlook'
  // parametric
  | 'goal_detail'
  | 'debt_detail'
  | 'category_detail'
  // extended
  | 'biggest_expenses'
  | 'top_merchants'
  | 'budget_status'
  | 'upcoming_bills'
  | 'savings_portfolio'
  | 'health_pulse'
  | 'season_stats'
  | 'tax_summary';

const ALL_KINDS: EchoCardKind[] = [
  'cash_flow', 'category_breakdown', 'subscriptions', 'wallet_liquid',
  'net_worth', 'goals_overview', 'debt_overview', 'month_outlook',
  'goal_detail', 'debt_detail', 'category_detail',
  'biggest_expenses', 'top_merchants', 'budget_status', 'upcoming_bills',
  'savings_portfolio', 'health_pulse', 'season_stats', 'tax_summary',
];

export function isEchoCardKind(s: unknown): s is EchoCardKind {
  return typeof s === 'string' && (ALL_KINDS as string[]).includes(s);
}

/** The tiny directive the model emits: kind + optional focus param. No amounts. */
export interface EchoCardSpec {
  kind: EchoCardKind;
  goalName?: string; // goal_detail
  contact?: string;  // debt_detail
  category?: string; // category_detail
}

// ─── The filled card (what the renderer draws) ───────────────

export type EchoCardAccent = 'olive' | 'gold' | 'teal' | 'warn';
export type EchoPillTone = 'neutral' | 'good' | 'warn' | 'up' | 'down';

export interface EchoCardPill {
  text: string;
  tone?: EchoPillTone;
}

/** A list row: icon + name (+ detail) on the left, an amount on the right. */
export interface EchoCardRow {
  icon?: string;       // CategoryIcon spec: `logo/<key>`, `photo:<uri>`, `m/ i/ fa/`, bare Feather, or undefined → letter tile
  iconColor?: string;
  name: string;
  detail?: string;
  amount?: number;     // rendered with the card currency (negative → "- RM x")
  amountText?: string; // pre-formatted override (used when the value isn't a plain currency amount)
  unit?: string;       // e.g. "/mo"
  pill?: EchoCardPill;
}

/** The big headline number. */
export interface EchoCardHero {
  amount?: number;
  amountText?: string; // override (e.g. a "72 / 100" score)
  unit?: string;       // e.g. "/ month"
  subline?: string;
}

/** A nested sub-card (e.g. "Biggest subscription"). */
export interface EchoCardTile {
  icon?: string;
  iconColor?: string;
  topLabel?: string;
  name: string;
  amount?: number;
  amountText?: string;
  unit?: string;
}

export interface EchoCardProgress {
  pct: number;        // 0..100
  footLeft?: string;
  footRight?: string;
}

export interface EchoCardTotal {
  label: string;
  amount?: number;
  amountText?: string;
  unit?: string;
}

export interface EchoCard {
  kind: EchoCardKind;
  label: string;             // uppercase accent label, e.g. "AVAILABLE BALANCE"
  currency: string;          // filled from settings — the renderer formats every amount with it
  accent?: EchoCardAccent;   // default 'olive'
  icon?: string;             // optional header glyph (Feather name) for aggregate cards
  hero?: EchoCardHero;
  tile?: EchoCardTile;
  rows?: EchoCardRow[];
  total?: EchoCardTotal;
  progress?: EchoCardProgress;
}
