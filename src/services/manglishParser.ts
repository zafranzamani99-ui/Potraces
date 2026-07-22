/**
 * Local regex pre-filter for Manglish (mixed Malay+English) text.
 * Extracts RM amounts, keywords, and provides a quick intent hint
 * before hitting the AI pipeline. This saves API calls for obvious patterns.
 */

import { ExtractionIntent } from '../types';
import { useLearningStore } from '../store/learningStore';
import { parseCommitmentSchedule, type BillingCycle } from '../utils/commitmentParse';

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
  'spaylater', 'spay later', 'spay', 'shopee pay later', 'shopeepay later',
  'grabpay later', 'grab paylater', 'grabpaylater', 'atome', 'split',
  'ansuran', 'installment', 'instalment', 'pay later', 'paylater', 'bnpl',
  'boost payflex', 'payflex', 'riipay', 'credit card', 'kad kredit',
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

// Recurring-commitment signals. Kept narrow on purpose: a bare service name
// ("netflix 55") stays an expense — only a clear recurring cue (cycle word, sewa,
// langganan, insurans, a known always-recurring service) promotes it to a commitment.
// Installment/atome words are intentionally absent — those stay bnpl.
const SUBSCRIPTION_KEYWORDS = [
  'subscription', 'langganan', 'recurring', 'auto debit', 'autodebit',
  'monthly', 'bulanan', 'tiap bulan', 'setiap bulan', 'sebulan',
  'yearly', 'tahunan', 'mingguan', 'weekly',
  'rumah sewa', 'sewa rumah', 'sewa kedai', 'sewa bilik',
  'insurans', 'takaful', 'yuran', 'ptptn',
  'netflix', 'spotify', 'youtube premium', 'yt premium', 'disney', 'hbo', 'viu',
  'icloud', 'apple music', 'google one', 'chatgpt', 'canva', 'unifi', 'streamyx', 'astro', 'gym',
];

function guessIntent(text: string, amounts: number[]): ExtractionIntent | null {
  const lower = text.toLowerCase();

  // Check specifics first (more specific before general)
  if (findKeywords(lower, DEBT_UPDATE_KEYWORDS).length > 0) return 'debt_update';
  if (findKeywords(lower, DEBT_KEYWORDS).length > 0) return 'debt';
  if (findKeywords(lower, BNPL_KEYWORDS).length > 0) return 'bnpl';
  if (findKeywords(lower, SUBSCRIPTION_KEYWORDS).length > 0) return 'subscription';
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
    ...findKeywords(text, SUBSCRIPTION_KEYWORDS),
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

// ── One-line commitment draft (for the Commitment screen quick-add) ──

export interface CommitmentDraft {
  name: string;
  amount: number;
  billingCycle: BillingCycle;
  dueDay?: number;
  installments?: number;
  category: string | null;
}

// Strip amount / schedule cues so what's left reads as the commitment name.
function cleanCommitmentName(text: string): string {
  let s = ` ${text} `;
  s = s.replace(/\b\d{1,2}\s*[x×]\s*(?:rm\s*)?\d+(?:\.\d{1,2})?\b/gi, ' '); // "3x49.90"
  s = s.replace(/\b[x×]\s*\d{1,2}\b/gi, ' ');                              // "x3"
  s = s.replace(/\b\d{1,2}\s*(?:kali|installments?|instalments?|payments?)\b/gi, ' ');
  // Due-day BEFORE the bare "25hb" strip (so "due 25hb" goes as one unit, no orphan "due").
  s = s.replace(/\bdue\s*(?:on\s*)?(?:the\s*)?\d{1,2}(?:st|nd|rd|th|hb)?\b/gi, ' ');
  s = s.replace(/\b(?:on|every|each|setiap|tiap)\s+(?:the\s*)?\d{1,2}(?:st|nd|rd|th|hb)?\b/gi, ' ');
  s = s.replace(/\b\d{1,2}\s*(?:hb|haribulan)\b/gi, ' ');                  // standalone "25hb"
  s = s.replace(/\b(weekly|mingguan|tiap minggu|setiap minggu|every week|per week|seminggu|wkly|quarterly|suku tahun|tiap 3 bulan|every 3 months|per quarter|yearly|annual|annually|tahunan|setahun|per year|every year|tiap tahun|monthly|bulanan|tiap bulan|setiap bulan|sebulan|per month|every month|each month|mthly|recurring|langganan|auto ?debit|subscription)\b/gi, ' ');
  s = s.replace(/\brm\s?\d+(?:[.,]\d+)?\b/gi, ' ');                        // "rm850"
  s = s.replace(/\b\d+(?:\.\d{1,2})?\b/g, ' ');                            // any leftover number
  s = s.replace(/\b(due|every|setiap|tiap)\b/gi, ' ');                     // orphaned connectors
  s = s.replace(/[-–]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}

/**
 * Parse one free-text line into a commitment draft for the Commitment screen's
 * quick-add (mirrors the Notes capture). Amount is the per-installment/period figure.
 */
// Commitment lines are free-form ("Hbo max 39.90 sebulan", "rumah sewa 850"), so the
// amount is usually a BARE number with no RM/ringgit cue. Read it with or without RM,
// ignoring the due-day and installment-count numbers.
function extractCommitmentAmount(text: string, dueDay?: number, installments?: number): number {
  // Installment "3x49.90" / "3 x rm49.90" → the amount is the price after the x.
  const inst = /\b\d{1,2}\s*[x×]\s*(?:rm\s*)?(\d+(?:\.\d{1,2})?)\b/i.exec(text);
  if (inst) { const v = parseFloat(inst[1]); if (v > 0) return v; }
  const nums: number[] = [];
  const re = /(?:rm\s*)?(\d+(?:\.\d{1,2})?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) { const v = parseFloat(m[1]); if (v > 0) nums.push(v); }
  const pool = nums.filter((v) => v !== dueDay && v !== installments);
  const use = pool.length ? pool : nums;
  // Prefer a decimal (a price like 39.90), else the last number (amount usually trails the name).
  const decimals = use.filter((v) => !Number.isInteger(v));
  if (decimals.length) return decimals[decimals.length - 1];
  return use.length ? use[use.length - 1] : 0;
}

export function parseCommitmentDraft(text: string): CommitmentDraft {
  const sched = parseCommitmentSchedule(text);
  const amount = extractCommitmentAmount(text, sched.dueDay, sched.installments);
  const name = cleanCommitmentName(text);
  return {
    name,
    amount,
    billingCycle: sched.billingCycle,
    dueDay: sched.dueDay,
    installments: sched.installments,
    category: matchCategory(text),
  };
}

// ── Structured line parsing ──

export interface StructuredLine {
  // 'expense' → a spending item (no person); 'debt' → owed money (has person + direction).
  kind: 'expense' | 'debt';
  amount: number;
  label: string;                              // item / description text
  person: string | null;                      // debt only
  note: string | null;                        // parenthetical text note, if any
  direction: 'they_owe' | 'i_owe' | null;     // debt only
  isDone: boolean;
  category: string | null;                    // best-guess category id
}

// Header patterns for debt context. THEY_OWE = others owe the user ("orang hutang",
// "mereka hutang"); I_OWE = the user owes others ("aku hutang").
const THEY_OWE_HEADER = /^(mereka semua|mereka|diorang|orang lain|orang|org|they|kawan|dia|customer|pelanggan)\s*(hutang|owe|owes|owing)/i;
const I_OWE_HEADER = /^(aku|saya|i|sy)\s*(hutang|owe|owes|owing)/i;
// Bare debt-section header on its own line: "hutang", "utang", "owe", "debt", "iou"
const DEBT_SECTION_HEADER = /^(hutang|utang|owe|owes|owing|debt|iou)\s*[:.\-–]?\s*$/i;

// A SPECIFIC named person heads the whole block that follows (every item line below
// belongs to THIS person — each line's text is the description, not a new person):
//   "nabil hutang aku" / "nabil hutang" / "nabil owes [me]" → nabil owes ME (they_owe)
//   "aku hutang nabil" / "hutang nabil" / "i owe nabil"     → I owe nabil (i_owe)
// Generic subjects (mereka/aku/orang…) are rejected here so they fall through to the
// generic headers above, where each line names a DIFFERENT person.
const GENERIC_DEBT_SUBJECTS = new Set([
  'mereka', 'diorang', 'orang', 'org', 'semua', 'they', 'kawan', 'dia',
  'customer', 'pelanggan', 'aku', 'saya', 'saye', 'sy', 'i', 'me',
]);
const NAMED_THEY_OWE_HEADER = /^([a-z][a-z]{1,20})\s+(?:hutang|utang|owe|owes|owing)(?:\s+(?:aku|saya|sy|saye|me|i))?\s*$/i;
const NAMED_I_OWE_HEADER = /^(?:aku|saya|sy|saye|i)?\s*(?:hutang|utang|owe|owes|owing)\s+([a-z][a-z]{1,20})\s*$/i;

function matchNamedDebtHeader(line: string): { person: string; direction: 'they_owe' | 'i_owe' } | null {
  let m = NAMED_THEY_OWE_HEADER.exec(line);
  if (m && !GENERIC_DEBT_SUBJECTS.has(m[1].trim().toLowerCase())) {
    return { person: m[1].trim(), direction: 'they_owe' };
  }
  m = NAMED_I_OWE_HEADER.exec(line);
  if (m && !GENERIC_DEBT_SUBJECTS.has(m[1].trim().toLowerCase())) {
    return { person: m[1].trim(), direction: 'i_owe' };
  }
  return null;
}

// Amount-first line item: "100-faris", "100- zarep", "300-mak(duit raya)"
const AMOUNT_FIRST = /^\s*(\d+(?:\.\d{1,2})?)\s*[-–]\s*(.+)$/;

// Done/settled markers (per-line)
const DONE_MARKER = /\b(done|selesai|settled|dah bayar|lunas|is done)\b/i;

// Checkmark marker (✅) — means already handled
const CHECKMARK = /✅/;

// Math/balance line — pure arithmetic like "110+20-3-7.5 = 76.7"
const MATH_LINE = /^\s*[\d.]+\s*[+\-*/][\d\s+\-*/=.]+$/;

// Person name line — just a word with no amount, not a keyword
const PERSON_NAME_LINE = /^\s*([a-zA-Z][a-zA-Z\s]{0,20})\s*$/;

/**
 * Safely evaluate a small arithmetic expression (digits, . + - * / and parens).
 * Used for notes where the amount is written as maths, e.g. "16-9+6" → 13,
 * "(16-9)+ 6" → 13. Returns null for anything it can't parse. Never uses eval().
 */
function evalArithmetic(expr: string): number | null {
  const s = expr.trim();
  if (!s || !/\d/.test(s) || !/^[\d.\s+\-*/()]+$/.test(s)) return null;
  const tokens = s.match(/\d+(?:\.\d+)?|[+\-*/()]/g);
  if (!tokens) return null;
  const prec: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2 };
  const out: string[] = [];
  const ops: string[] = [];
  for (const tk of tokens) {
    if (/\d/.test(tk)) out.push(tk);
    else if (tk === '(') ops.push(tk);
    else if (tk === ')') {
      while (ops.length && ops[ops.length - 1] !== '(') out.push(ops.pop()!);
      if (!ops.length) return null; // unbalanced
      ops.pop();
    } else {
      while (
        ops.length &&
        ops[ops.length - 1] !== '(' &&
        prec[ops[ops.length - 1]] >= prec[tk]
      ) out.push(ops.pop()!);
      ops.push(tk);
    }
  }
  while (ops.length) {
    const op = ops.pop()!;
    if (op === '(') return null; // unbalanced
    out.push(op);
  }
  const st: number[] = [];
  for (const tk of out) {
    if (/\d/.test(tk)) { st.push(parseFloat(tk)); continue; }
    const b = st.pop();
    const a = st.pop();
    if (a === undefined || b === undefined) return null;
    st.push(tk === '+' ? a + b : tk === '-' ? a - b : tk === '*' ? a * b : b === 0 ? NaN : a / b);
  }
  if (st.length !== 1 || !Number.isFinite(st[0])) return null;
  return st[0];
}

// Tidy a captured description: drop separator dashes, stray "rm", parens, extra spaces.
function cleanItemLabel(s: string): string {
  return s
    .replace(/[-–]+/g, ' ')
    .replace(/\brm\b/gi, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pull a single amount + label + optional text note out of one line, tolerating
 * the many shorthand shapes users actually write:
 *   "ayam -17", "netflix-75"          (trailing, dash)
 *   "nasi lemak RM8", "kuih -rm17"     (trailing, with/without currency prefix)
 *   "kari (18)"                        (amount in parentheses)
 *   "100-faris", "300-mak(duit raya)"  (amount first)
 *   "ali (16-9)+ 6(dinner)"            (arithmetic amount + text note)
 * Returns null when the line carries no usable amount.
 */
function extractLineAmount(
  line: string
): { amount: number; label: string; note: string | null } | null {
  let note: string | null = null;
  // Parentheses: a NUMERIC group is part of the amount (keep it); a TEXT group is a note.
  let s = line.replace(/\(([^)]*)\)/g, (full, inner: string) => {
    if (/\d/.test(inner) && /^[\d\s.+\-*/]+$/.test(inner)) return full; // numeric → amount
    if (note === null && inner.trim()) note = inner.trim();             // first text → note
    return ' ';
  });
  // Strip currency prefixes sitting directly before a number ("RM8", "-rm17", "ringgit 5").
  s = s.replace(/\b(?:rm|ringgit)\s*(?=\d)/gi, '');

  // Amount-first: "100-faris", "300-mak"
  const first = AMOUNT_FIRST.exec(s);
  if (first) {
    const amt = parseFloat(first[1]);
    const label = cleanItemLabel(first[2]);
    if (amt > 0 && label && !/\d/.test(label)) return { amount: amt, label, note };
  }

  // Amount-trailing: consume the longest run of arithmetic chars at the end of the line.
  let i = s.length;
  while (i > 0 && /[\d\s.+\-*/()]/.test(s[i - 1])) i--;
  // A leading + / - directly after the label is a separator ("ayam -17"), not a sign.
  const amountExpr = s.slice(i).replace(/^\s*[-+]\s*/, '');
  const amt = evalArithmetic(amountExpr);
  if (amt != null && amt > 0) {
    // label may be '' for a bare amount line ("-7", "8"); the caller decides what
    // to do with it (an expense under a category section, else skip).
    return { amount: amt, label: cleanItemLabel(s.slice(0, i)), note };
  }
  return null;
}

/**
 * Parse structured multi-line notes into per-line expense / debt items.
 * Returns the items, or null if nothing parseable was found.
 *
 * Supports:
 * - Debt headers: "mereka hutang", "aku hutang", or a bare "hutang" section line
 * - Person-scoped blocks: a bare single-word name followed by item lines → debts
 * - Category titles: a multi-word heading naming spend ("Makan harini") → the item
 *   lines under it are EXPENSES in that category (not debts, not a person)
 * - Amount shapes: dash / trailing / parenthetical / currency-prefixed / arithmetic
 * - Checkmark (✅) and pure math/balance lines are skipped
 */
export function parseStructuredLines(text: string): StructuredLine[] | null {
  const lines = text.split('\n');
  let currentDirection: 'they_owe' | 'i_owe' | null = null;
  let currentPerson: string | null = null;
  let inDebtSection = false;
  let categoryHint: string | null = null;
  let sectionLabel: string | null = null; // raw text of the current category header ("makan")
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

    // Skip checkmarked lines (already confirmed) and pure math/balance lines
    if (CHECKMARK.test(line)) continue;
    if (MATH_LINE.test(line)) continue;

    // A SPECIFIC named person heads the whole block ("nabil hutang aku") — scope every
    // item line below to that ONE person. Checked before the generic headers so a real
    // name wins; generic subjects (mereka/aku/orang…) fall through to them.
    const namedHeader = matchNamedDebtHeader(line);
    if (namedHeader && !allKeywords.includes(namedHeader.person.toLowerCase())) {
      currentPerson = namedHeader.person;
      currentDirection = namedHeader.direction;
      inDebtSection = true; categoryHint = null; sectionLabel = null;
      continue;
    }

    // Header lines switch the debt context
    if (THEY_OWE_HEADER.test(line)) {
      currentDirection = 'they_owe'; currentPerson = null; inDebtSection = true; categoryHint = null; sectionLabel = null;
      continue;
    }
    if (I_OWE_HEADER.test(line)) {
      currentDirection = 'i_owe'; currentPerson = null; inDebtSection = true; categoryHint = null; sectionLabel = null;
      continue;
    }
    if (DEBT_SECTION_HEADER.test(line)) {
      inDebtSection = true; currentPerson = null; categoryHint = null; sectionLabel = null;
      continue;
    }

    // Done/settled marker → strip it, remember the flag for this line
    const isDone = DONE_MARKER.test(line);
    const workLine = isDone ? line.replace(DONE_MARKER, '').trim() : line;

    const parsed = extractLineAmount(workLine);
    if (parsed) {
      const debtContext = inDebtSection || currentPerson != null;
      // Bare amount ("makan\n-7\n-8"): an expense in the current category section.
      // Skipped if there's no section context (a stray number is too ambiguous).
      if (parsed.label.length === 0) {
        if (categoryHint && !debtContext) {
          results.push({
            kind: 'expense',
            amount: parsed.amount,
            label: sectionLabel || categoryHint,
            person: null,
            note: parsed.note,
            direction: null,
            isDone,
            category: categoryHint,
          });
        }
        continue;
      }
      if (debtContext) {
        const person = currentPerson || parsed.label;
        results.push({
          kind: 'debt',
          amount: parsed.amount,
          label: parsed.label,
          person,
          note: currentPerson ? (parsed.note || parsed.label) : parsed.note,
          direction: currentDirection || 'i_owe',
          isDone,
          category: matchCategory(person) || matchCategory(parsed.label),
        });
      } else {
        results.push({
          kind: 'expense',
          amount: parsed.amount,
          label: parsed.label,
          person: null,
          note: parsed.note,
          direction: null,
          isDone,
          category: matchCategory(parsed.label) || categoryHint,
        });
      }
      continue;
    }

    // No amount → header / title / person-name line
    const nameMatch = PERSON_NAME_LINE.exec(line);
    if (!nameMatch) continue;
    const candidate = nameMatch[1].trim();
    const lc = candidate.toLowerCase();
    const cat = matchCategory(candidate);
    const words = candidate.split(/\s+/).filter(Boolean);

    // A heading that names a spend/earn category starts an EXPENSE section: a
    // multi-word title ("Makan harini") OR a single spend/earn keyword ("makan",
    // "lunch", "groceries"). It also ENDS any debt section, so
    // "aku hutang … \n makan \n -7" switches back to expenses.
    const isSpendSection = cat != null &&
      (words.length >= 2 || EXPENSE_KEYWORDS.includes(lc) || INCOME_KEYWORDS.includes(lc));
    if (isSpendSection) {
      categoryHint = cat; sectionLabel = candidate; currentPerson = null; inDebtSection = false;
      continue;
    }

    if (allKeywords.includes(lc)) {
      // A bare debt keyword opens a debt section; other keywords are noise.
      if (DEBT_KEYWORDS.includes(lc)) { inDebtSection = true; currentPerson = null; categoryHint = null; sectionLabel = null; }
      continue;
    }

    // Otherwise treat a bare single name as a person-scoped debt block.
    currentPerson = candidate;
    inDebtSection = true;
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
