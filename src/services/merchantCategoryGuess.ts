/**
 * Merchant → category guesser for Apple Pay Auto Log. Auto Log arrives
 * headless (amount + merchant in `note` + card), category hardcoded to
 * 'other'. Before accepting 'other', guess the closest category from:
 *
 *   1. learned patterns  — the user's own teaching (learningStore, count ≥ 2)
 *   2. transaction history — what category did THIS merchant get before?
 *   3. built-in keywords  — common Malaysian merchants → default category ids
 *
 * Every layer is validated against the categories the user ACTUALLY has, so a
 * renamed/deleted default never misfires. Pure module (params in, answer out),
 * so tsx can test it.
 */

export interface MerchantGuessInput {
  /** The merchant string (Auto Log sends it as the note). */
  note: string;
  type: 'expense' | 'income';
  /** learningStore.getSuggestedCategory(note) result, if any. */
  learnedCategoryId?: string | null;
  /** The user's past transactions. */
  history: Array<{ description?: string; category: string; type: string }>;
  /** Ids of the categories the user actually has (expense or income set). */
  validCategoryIds: string[];
}

const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

// keyword → DEFAULT expense category id. First match wins, so keep specific
// tokens above generic ones. Validated against the user's real categories.
const MERCHANT_KEYWORDS: Array<[string, string]> = [
  // Food & dining
  ['mcdonald', 'food'], ['kfc', 'food'], ['starbucks', 'food'], ['coffee', 'food'],
  ['kopi', 'food'], ['tealive', 'food'], ['chatime', 'food'], ['mamak', 'food'],
  ['restoran', 'food'], ['restaurant', 'food'], ['makan', 'food'], ['nasi', 'food'],
  ['burger', 'food'], ['pizza', 'food'], ['domino', 'food'], ['subway', 'food'],
  ['nandos', 'food'], ['marrybrown', 'food'], ['oldtown', 'food'], ['sushi', 'food'],
  ['ramen', 'food'], ['kfry', 'food'], ['texaschicken', 'food'], ['burgerking', 'food'],
  ['pizzahut', 'food'], ['secretrecipe', 'food'], ['kkennyrogers', 'food'],
  // Groceries → food (no dedicated groceries category)
  ['tesco', 'food'], ['lotuss', 'food'], ['lotus', 'food'], ['aeon', 'food'],
  ['mydin', 'food'], ['giant', 'food'], ['nskgrocer', 'food'], ['villagegrocer', 'food'],
  ['jayagrocer', 'food'], ['99speedmart', 'food'], ['speedmart', 'food'],
  ['7eleven', 'food'], ['familymart', 'food'], ['mynews', 'food'],
  // Transport
  ['airasia', 'transport'], ['malindo', 'transport'], ['batikair', 'transport'],
  ['grab', 'transport'], ['shell', 'transport'], ['petronas', 'transport'],
  ['petron', 'transport'], ['caltex', 'transport'], ['bhpetrol', 'transport'],
  ['setel', 'transport'], ['parking', 'transport'], ['parkit', 'transport'],
  ['kiplepark', 'transport'], ['toll', 'transport'], ['rapidkl', 'transport'],
  ['klia', 'transport'],
  // Shopping
  ['shopee', 'shopping'], ['lazada', 'shopping'], ['uniqlo', 'shopping'],
  ['padini', 'shopping'], ['zalora', 'shopping'], ['ikea', 'shopping'],
  ['mrdiy', 'shopping'], ['daiso', 'shopping'], ['kaison', 'shopping'],
  // Entertainment
  ['netflix', 'entertainment'], ['spotify', 'entertainment'], ['tgv', 'entertainment'],
  ['gsc', 'entertainment'], ['cinema', 'entertainment'], ['youtube', 'entertainment'],
  ['disney', 'entertainment'], ['steam', 'entertainment'], ['playstation', 'entertainment'],
  ['nintendo', 'entertainment'], ['viu', 'entertainment'],
  // Healthcare
  ['watson', 'health'], ['guardian', 'health'], ['pharmacy', 'health'],
  ['farmasi', 'health'], ['klinik', 'health'], ['clinic', 'health'],
  ['hospital', 'health'], ['dental', 'health'],
  // Bills & utilities
  ['unifi', 'bills'], ['maxis', 'bills'], ['celcom', 'bills'], ['digi', 'bills'],
  ['umobile', 'bills'], ['tenaga', 'bills'], ['tnb', 'bills'], ['astro', 'bills'],
  ['syabas', 'bills'], ['airselangor', 'bills'], ['timeinternet', 'bills'],
];

/**
 * Returns a category id (from validCategoryIds) or null when nothing matches —
 * null means "keep 'other'", the honest fallback.
 */
export function guessMerchantCategory(input: MerchantGuessInput): string | null {
  const { note, type, learnedCategoryId, history, validCategoryIds } = input;
  const n = normalize(note || '');
  if (!n || validCategoryIds.length === 0) return null;
  const valid = (id: string | null | undefined): id is string =>
    !!id && validCategoryIds.includes(id);

  // 1. Learned pattern (explicit user teaching — strongest signal)
  if (valid(learnedCategoryId)) return learnedCategoryId;

  // 2. Own history: same merchant before → their most-used category for it
  const tally: Record<string, number> = {};
  for (const t of history) {
    if (!t.description || t.type !== type) continue;
    const d = normalize(t.description);
    if (!d || !(d === n || d.includes(n) || n.includes(d))) continue;
    if (validCategoryIds.includes(t.category)) {
      tally[t.category] = (tally[t.category] || 0) + 1;
    }
  }
  const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  if (best) return best[0];

  // 3. Built-in Malaysian merchant keywords
  for (const [keyword, categoryId] of MERCHANT_KEYWORDS) {
    if (n.includes(keyword) && validCategoryIds.includes(categoryId)) return categoryId;
  }

  return null;
}
