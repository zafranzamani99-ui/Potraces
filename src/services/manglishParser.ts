/**
 * Local regex pre-filter for Manglish (mixed Malay+English) text.
 * Extracts RM amounts, keywords, and provides a quick intent hint
 * before hitting the AI pipeline. This saves API calls for obvious patterns.
 */

import { ExtractionIntent } from '../types';
import { useLearningStore } from '../store/learningStore';

export interface PreFilterResult {
  amounts: number[];
  keywords: string[];
  hintIntent: ExtractionIntent | null;
  isQuery: boolean;
  hasFinancialContent: boolean;
}

// RM amount patterns: "RM 12.50", "rm12", "RM12.5", "12 ringgit", "50sen"
const RM_PATTERN = /(?:rm\s*|ringgit\s*)(\d+(?:\.\d{1,2})?)/gi;
const BARE_AMOUNT_PATTERN = /\b(\d+(?:\.\d{1,2})?)\s*(?:ringgit|sen)\b/gi;
// "word-75" at end of line (netflix-75) OR "75-word" at start of line (100-faris)
const LINE_AMOUNT_SUFFIX = /[-–]\s*(\d+(?:\.\d{1,2})?)\s*$/gm;
const LINE_AMOUNT_PREFIX = /^\s*(\d+(?:\.\d{1,2})?)\s*[-–]/gm;

// Expense keywords (Malay + English)
const EXPENSE_KEYWORDS = [
  'beli', 'bayar', 'topup', 'top up', 'isi', 'makan', 'lunch', 'dinner',
  'breakfast', 'petrol', 'parking', 'grab', 'toll', 'groceries', 'grocery',
  'shopping', 'baju', 'kasut', 'ubat', 'doktor', 'clinic', 'hospital',
  'repair', 'servis', 'laundry', 'cuci', 'potong rambut', 'haircut',
  'wifi', 'bil', 'bill', 'sewa', 'rent', 'insurance', 'takaful',
  'netflix', 'spotify', 'gym', 'reload', 'tambah', 'spent', 'pay', 'paid',
  'bought', 'belanja', 'traktir',
  // Subscriptions & services
  'youtube', 'yt music', 'yt premium', 'disney', 'hbo', 'viu', 'wetv',
  'apple music', 'apple tv', 'icloud', 'google one', 'chatgpt', 'claude',
  'canva', 'figma', 'notion', 'github', 'copilot', 'adobe', 'microsoft 365',
  'office 365', 'zoom', 'dropbox', 'grammarly',
  // Malaysian services
  'astro', 'unifi', 'celcom', 'maxis', 'digi', 'umobile', 'yes 4g',
  'hotlink', 'tunetalk', 'xox', 'tnb', 'tenaga', 'indah water', 'syabas',
  // Food delivery & e-hailing
  'foodpanda', 'shopeefood', 'grabfood', 'grab food',
  // Insurance & finance
  'prudential', 'aia', 'great eastern', 'zurich', 'allianz', 'etiqa',
  'maybank', 'cimb', 'rhb', 'public bank', 'hong leong',
];

// Income keywords
const INCOME_KEYWORDS = [
  'gaji', 'salary', 'dapat', 'terima', 'received', 'masuk', 'came in',
  'freelance', 'payment', 'bonus', 'commission', 'duit masuk', 'transfer masuk',
  'earned', 'income',
];

// Debt keywords
const DEBT_KEYWORDS = [
  'hutang', 'pinjam', 'owe', 'owed', 'lend', 'borrow', 'loan',
  'bayar balik', 'pay back', 'utang', 'iou',
  'mereka hutang', 'aku hutang', 'dia hutang', 'kawan hutang',
  'i owe', 'they owe', 'he owe', 'she owe',
];

// Debt update keywords
const DEBT_UPDATE_KEYWORDS = [
  'dah bayar', 'already paid', 'settled', 'selesai', 'clear',
  'lunas', 'paid back', 'returned',
];

// BNPL keywords
const BNPL_KEYWORDS = [
  'spaylater', 'shopee pay later', 'grabpay later', 'atome', 'split',
  'ansuran', 'installment', 'instalment', 'pay later', 'bnpl',
  'credit card', 'kad kredit',
];

// Seller/business keywords
const SELLER_KEYWORDS = [
  'order', 'tempahan', 'customer', 'pelanggan', 'jual', 'sold',
  'deliver', 'hantar', 'pos', 'postage', 'cod',
];

// Seller cost keywords
const SELLER_COST_KEYWORDS = [
  'bahan', 'ingredient', 'packaging', 'label', 'sticker',
  'gas', 'minyak masak', 'tepung', 'gula', 'cost',
];

// Query patterns
const QUERY_PATTERNS = [
  /berapa/i, /how much/i, /total/i, /banyak mana/i,
  /\?$/, /spent on/i, /belanja untuk/i, /ada lagi/i,
  /balance/i, /baki/i, /left/i, /remaining/i,
];

// Savings keywords
const SAVINGS_KEYWORDS = [
  'simpan', 'save', 'saving', 'tabung', 'invest', 'tng+', 'esa',
  'asb', 'kwsp', 'epf', 'pelaburan',
];

function extractAmounts(text: string): number[] {
  const amounts: number[] = [];
  const seen = new Set<number>();

  let match: RegExpExecArray | null;

  // RM pattern
  const rm = new RegExp(RM_PATTERN.source, 'gi');
  while ((match = rm.exec(text)) !== null) {
    const val = parseFloat(match[1]);
    if (val > 0 && !seen.has(val)) {
      amounts.push(val);
      seen.add(val);
    }
  }

  // Bare amount with ringgit/sen suffix
  const bare = new RegExp(BARE_AMOUNT_PATTERN.source, 'gi');
  while ((match = bare.exec(text)) !== null) {
    let val = parseFloat(match[1]);
    if (text.slice(match.index).toLowerCase().includes('sen')) {
      val = val / 100;
    }
    if (val > 0 && !seen.has(val)) {
      amounts.push(val);
      seen.add(val);
    }
  }

  // "word-75" at end of line (netflix-75)
  const lineSuffix = new RegExp(LINE_AMOUNT_SUFFIX.source, 'gm');
  while ((match = lineSuffix.exec(text)) !== null) {
    const val = parseFloat(match[1]);
    if (val > 0 && !seen.has(val)) {
      amounts.push(val);
      seen.add(val);
    }
  }

  // "100-word" at start of line (100-faris)
  const linePrefix = new RegExp(LINE_AMOUNT_PREFIX.source, 'gm');
  while ((match = linePrefix.exec(text)) !== null) {
    const val = parseFloat(match[1]);
    if (val > 0 && !seen.has(val)) {
      amounts.push(val);
      seen.add(val);
    }
  }

  return amounts;
}

function findKeywords(text: string, keywords: string[]): string[] {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw));
}

function isQuery(text: string): boolean {
  return QUERY_PATTERNS.some((p) => p.test(text));
}

function guessIntent(text: string, amounts: number[]): ExtractionIntent | null {
  const lower = text.toLowerCase();

  // Check specifics first (more specific before general)
  if (findKeywords(lower, DEBT_UPDATE_KEYWORDS).length > 0) return 'debt_update';
  if (findKeywords(lower, DEBT_KEYWORDS).length > 0) return 'debt';
  if (findKeywords(lower, BNPL_KEYWORDS).length > 0) return 'bnpl';
  if (findKeywords(lower, SELLER_COST_KEYWORDS).length > 0) return 'seller_cost';
  if (findKeywords(lower, SELLER_KEYWORDS).length > 0) return 'seller_order';
  if (findKeywords(lower, SAVINGS_KEYWORDS).length > 0) return 'savings_goal';
  if (findKeywords(lower, INCOME_KEYWORDS).length > 0) return 'income';
  if (findKeywords(lower, EXPENSE_KEYWORDS).length > 0) return 'expense';

  // If there's an amount but no keyword match, likely expense
  if (amounts.length > 0) return 'expense';

  return null;
}

/**
 * Pre-filter text locally before sending to AI.
 * Returns extracted amounts, matched keywords, and a best-guess intent.
 */
export function preFilter(text: string): PreFilterResult {
  const amounts = extractAmounts(text);
  const queryFlag = isQuery(text);

  const allKeywords = [
    ...findKeywords(text, EXPENSE_KEYWORDS),
    ...findKeywords(text, INCOME_KEYWORDS),
    ...findKeywords(text, DEBT_KEYWORDS),
    ...findKeywords(text, DEBT_UPDATE_KEYWORDS),
    ...findKeywords(text, BNPL_KEYWORDS),
    ...findKeywords(text, SELLER_KEYWORDS),
    ...findKeywords(text, SELLER_COST_KEYWORDS),
    ...findKeywords(text, SAVINGS_KEYWORDS),
  ];

  const hintIntent = queryFlag ? 'query' : guessIntent(text, amounts);
  const hasFinancialContent = amounts.length > 0 || allKeywords.length > 0 || queryFlag;

  return {
    amounts,
    keywords: [...new Set(allKeywords)],
    hintIntent,
    isQuery: queryFlag,
    hasFinancialContent,
  };
}

/**
 * Category alias map — maps Manglish/Malay words to category IDs.
 * Used by the intent engine to match AI output to existing categories.
 */
export const CATEGORY_ALIASES: Record<string, string[]> = {
  food: [
    'makan', 'lunch', 'dinner', 'breakfast', 'sarapan', 'tengahari', 'malam',
    'nasi', 'mee', 'roti', 'kopi', 'teh', 'air', 'snack', 'kuih',
    'kedai makan', 'restoran', 'restaurant', 'cafe', 'mamak', 'warung',
    'grab food', 'foodpanda', 'shopeefood',
  ],
  transport: [
    'petrol', 'minyak', 'grab', 'taxi', 'bas', 'bus', 'lrt', 'mrt',
    'ktm', 'toll', 'parking', 'touch n go', 'tng', 'train',
  ],
  shopping: [
    'beli', 'shopping', 'baju', 'kasut', 'shoes', 'clothes',
    'shopee', 'lazada', 'online', 'mall',
  ],
  entertainment: [
    'movie', 'wayang', 'game', 'concert', 'karaoke', 'bowling',
    'netflix', 'spotify', 'youtube', 'disney',
  ],
  bills: [
    'bil', 'bill', 'elektrik', 'air', 'wifi', 'internet', 'phone',
    'celcom', 'maxis', 'digi', 'umobile', 'hotlink', 'tunetalk', 'xox',
    'yes 4g', 'unifi', 'astro', 'indah water', 'syabas',
    'tnb', 'tenaga',
  ],
  health: [
    'ubat', 'medicine', 'doktor', 'doctor', 'clinic', 'klinik',
    'hospital', 'farmasi', 'pharmacy', 'supplement', 'vitamin',
  ],
  education: [
    'tuition', 'kelas', 'class', 'buku', 'book', 'course',
    'sekolah', 'school', 'uni', 'college',
  ],
  family: [
    'family', 'keluarga', 'anak', 'mak', 'ayah', 'adik', 'abang',
    'kakak', 'isteri', 'suami', 'wife', 'husband', 'kids',
  ],
  subscription: [
    'subscription', 'langganan', 'monthly', 'bulanan', 'auto debit',
    'recurring', 'netflix', 'spotify', 'gym',
    'youtube', 'yt music', 'yt premium', 'disney', 'hbo', 'viu', 'wetv',
    'apple music', 'apple tv', 'icloud', 'google one', 'chatgpt', 'claude',
    'canva', 'figma', 'notion', 'github', 'copilot', 'adobe', 'microsoft 365',
    'office 365', 'zoom', 'dropbox', 'grammarly',
  ],
  salary: [
    'gaji', 'salary', 'pay', 'wage', 'upah',
  ],
  freelance: [
    'freelance', 'project', 'projek', 'client', 'kerja lepas',
  ],
};

/**
 * Match a description to the best category ID using aliases.
 */
export function matchCategory(text: string): string | null {
  // Check learned patterns first (higher priority)
  const learned = useLearningStore.getState().getSuggestedCategory(text);
  if (learned) return learned;

  const lower = text.toLowerCase();
  for (const [categoryId, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.some((alias) => lower.includes(alias))) {
      return categoryId;
    }
  }
  return null;
}

// ── Structured line parsing ──

export interface StructuredLine {
  amount: number;
  person: string;
  note: string | null;
  direction: 'they_owe' | 'i_owe';
  isDone: boolean;
}

// Header patterns for debt context
const THEY_OWE_HEADER = /^(mereka|mereka semua|diorang|they|kawan|dia)\s*(hutang|owe)/i;
const I_OWE_HEADER = /^(aku|saya|i|sy)\s*(hutang|owe)/i;

// Line item: "100-faris", "100- zarep", "300-mak(duit raya)"
const AMOUNT_FIRST = /^\s*(\d+(?:\.\d{1,2})?)\s*[-–]\s*(.+)$/;
// Line item: "faris-100", "netflix-75"
const AMOUNT_LAST = /^\s*(.+?)[-–]\s*(\d+(?:\.\d{1,2})?)\s*$/;

// Parenthetical note extractor
const PAREN_NOTE = /\(([^)]+)\)/;

// Done/settled markers (per-line)
const DONE_MARKER = /\b(done|selesai|settled|dah bayar|lunas|is done)\b/i;

// Checkmark marker (✅) — means already handled
const CHECKMARK = /✅/;

// Math/balance line — pure arithmetic like "110+20-3-7.5 = 76.7"
const MATH_LINE = /^\s*[\d.]+\s*[+\-*/][\d\s+\-*/=.]+$/;

// Person name line — just a word with no amount, not a keyword
const PERSON_NAME_LINE = /^\s*([a-zA-Z][a-zA-Z\s]{0,20})\s*$/;

/**
 * Parse structured multi-line notes with debt headers and person-scoped blocks.
 * Returns per-line extractions with person names and directions,
 * or null if the text doesn't have structured debt format.
 *
 * Supports:
 * - Debt headers: "mereka hutang", "aku hutang"
 * - Person-scoped blocks: a bare name line followed by item lines
 * - Checkmark (✅) lines are skipped
 * - Math/balance lines are skipped
 */
export function parseStructuredLines(text: string): StructuredLine[] | null {
  const lines = text.split('\n');
  let currentDirection: 'they_owe' | 'i_owe' | null = null;
  let currentPerson: string | null = null;
  const results: StructuredLine[] = [];

  // All known keywords to avoid treating them as person names
  const allKeywords = [
    ...EXPENSE_KEYWORDS, ...INCOME_KEYWORDS, ...DEBT_KEYWORDS,
    ...DEBT_UPDATE_KEYWORDS, ...BNPL_KEYWORDS, ...SELLER_KEYWORDS,
    ...SELLER_COST_KEYWORDS, ...SAVINGS_KEYWORDS,
  ];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Skip checkmarked lines (already confirmed)
    if (CHECKMARK.test(line)) continue;

    // Skip math/balance lines
    if (MATH_LINE.test(line)) continue;

    // Check for header lines
    if (THEY_OWE_HEADER.test(line)) {
      currentDirection = 'they_owe';
      currentPerson = null;
      continue;
    }
    if (I_OWE_HEADER.test(line)) {
      currentDirection = 'i_owe';
      currentPerson = null;
      continue;
    }

    // Try amount-first: "100-faris", "300-mak(duit raya)"
    let amountMatch = AMOUNT_FIRST.exec(line);
    let amount: number | null = null;
    let rest: string | null = null;

    if (amountMatch) {
      amount = parseFloat(amountMatch[1]);
      rest = amountMatch[2].trim();
    } else {
      // Try amount-last: "faris-100", "netflix-75"
      const lastMatch = AMOUNT_LAST.exec(line);
      if (lastMatch) {
        rest = lastMatch[1].trim();
        amount = parseFloat(lastMatch[2]);
      }
    }

    // If no amount found, check if this is a person name line (bare name)
    if (amount == null || amount <= 0) {
      const nameMatch = PERSON_NAME_LINE.exec(line);
      if (nameMatch) {
        const candidate = nameMatch[1].trim().toLowerCase();
        // Only treat as person name if not a known keyword
        if (!allKeywords.includes(candidate)) {
          currentPerson = nameMatch[1].trim();
          continue;
        }
      }
      continue;
    }

    if (!rest) continue;

    // Extract parenthetical note: "mak(duit raya)" → note: "duit raya"
    let note: string | null = null;
    const parenMatch = PAREN_NOTE.exec(rest);
    if (parenMatch) {
      note = parenMatch[1].trim();
      rest = rest.replace(PAREN_NOTE, '').trim();
    }

    // Check for done/settled marker
    const isDone = DONE_MARKER.test(rest);
    if (isDone) {
      rest = rest.replace(DONE_MARKER, '').trim();
    }

    // Clean up trailing/leading dashes and spaces
    const itemName = rest.replace(/^[-–\s]+|[-–\s]+$/g, '').trim();
    if (!itemName) continue;

    // Determine person: use currentPerson context if this looks like an item (not a name)
    const person = currentPerson || itemName;

    // Use current header context, default to i_owe if no header
    const direction = currentDirection || 'i_owe';

    results.push({
      amount,
      person,
      note: currentPerson ? (note || itemName) : note,
      direction,
      isDone,
    });
  }

  return results.length > 0 ? results : null;
}

/**
 * Match a wallet name from user text.
 * Fuzzy match against known wallet names.
 */
export function matchWallet(
  text: string,
  walletNames: string[]
): string | null {
  const lower = text.toLowerCase();
  // Direct name match
  for (const name of walletNames) {
    if (lower.includes(name.toLowerCase())) return name;
  }
  // Common abbreviation mappings
  const abbreviations: Record<string, string[]> = {
    tng: ['touch n go', 'touch and go', 'touchngo'],
    maybank: ['mae', 'maybank2u', 'm2u'],
    cimb: ['cimb clicks'],
    boost: ['boost'],
    grabpay: ['grab pay', 'grab wallet'],
    shopeepay: ['shopee pay'],
    bigpay: ['big pay'],
  };

  for (const [abbr, aliases] of Object.entries(abbreviations)) {
    if (lower.includes(abbr) || aliases.some((a) => lower.includes(a))) {
      // Find wallet that matches
      const match = walletNames.find((w) =>
        w.toLowerCase().includes(abbr) ||
        aliases.some((a) => w.toLowerCase().includes(a))
      );
      if (match) return match;
    }
  }

  return null;
}
