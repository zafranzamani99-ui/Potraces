/**
 * Pure card selection — no store/native imports, so it's tsx-testable.
 * `fillCards.ts` gathers a live snapshot and delegates here.
 *
 *  - `defaultCardKindForMessage` = the app-side FLOOR (question → a default kind).
 *  - `selectCards` = the suppression + model-spec-vs-floor decision.
 */
import { isSmallTalk } from '../smallTalk';
import { buildCard, CardSnapshot } from './builders';
import { EchoCard, EchoCardKind, EchoCardSpec } from './types';

/**
 * Map a question to a default card kind (single, best-guess) — mirrors
 * classifyScope's intents but returns ONE kind. Returns null on greetings / tiny
 * messages so "hi" never gets a card. First match wins, so more specific
 * patterns come first.
 */
export function defaultCardKindForMessage(message?: string): EchoCardKind | null {
  const m = (message || '').toLowerCase().trim();
  if (!m || m.length < 12) return null; // greeting / too short → no floor card
  if (/^(hi|hello|hey|yo|hai|sup|ok|okay|thanks|thank you|terima kasih|tq|noted|cool|nice)\b/.test(m)) return null;

  if (/biggest|largest|most expensive|paling mahal/.test(m)) return 'biggest_expenses';
  if (/\b(due|coming up|upcoming|renew|renewing)\b|bila.*bayar/.test(m)) return 'upcoming_bills';
  if (/subscri|subs|netflix|spotify|langganan|recurring|commitment|komitmen/.test(m)) return 'subscriptions';
  if (/hutang|owe|lend|borrow|debt|bayar balik|pinjam/.test(m)) return 'debt_overview';
  if (/invest|asb|tabung haji|portfolio|wahed|stashaway|versa|dividen/.test(m)) return 'savings_portfolio';
  if (/over budget|bajet|\bbudget\b/.test(m)) return 'budget_status';
  if (/afford|mampu|can i spend|pace this month/.test(m)) return 'month_outlook';
  if (/goal|target|save|saving|savings|simpan|emergency|kecemasan/.test(m)) return 'goals_overview';
  if (/net worth|net position|\bworth\b|kaya/.test(m)) return 'net_worth';
  if (/wallet|balance|baki|how much.*(have|left)|berapa.*ada|duit.*ada|left in/.test(m)) return 'wallet_liquid';
  if (/where.*shop|shop.*most|most.*shop|merchant|kedai mana/.test(m)) return 'top_merchants';
  if (/spend|spent|makan|grab|shop|where.*money|duit.*mana|belanja|kedai|food|transport|categor/.test(m)) return 'category_breakdown';
  if (/how.*doing|macam mana|overall|summary|apa jadi|this month|bulan ni/.test(m)) return 'cash_flow';
  return null;
}

/** Pure selection given a snapshot — the tsx-testable core. */
export function selectCards(
  specs: EchoCardSpec[],
  userMessage: string,
  hasAction: boolean,
  snap: CardSnapshot,
): EchoCard[] {
  if (hasAction) return [];              // recording turn — the action chip shows the number
  if (isSmallTalk(userMessage)) return []; // greeting / chit-chat

  if (specs.length) {
    const card = buildCard(specs[0], snap);
    return card ? [card] : [];
  }
  const kind = defaultCardKindForMessage(userMessage);
  if (!kind) return [];
  const card = buildCard({ kind }, snap);
  return card ? [card] : [];
}
