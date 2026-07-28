/**
 * Pure logic for learningStore (Echo's notebook) — no RN/AsyncStorage imports,
 * so scripts/test-learning-store.ts can exercise every rule directly.
 */

export interface CategoryPattern {
  keyword: string;
  category: string;
  count: number;
}

export interface PersonAlias {
  raw: string;
  preferred: string;
  count: number;
}

export interface WalletPreference {
  keyword: string;
  wallet: string;
  count: number;
}

export interface TypeCorrection {
  keyword: string;
  toType: string;
  count: number;
}

export const MAX_PATTERNS = 100;
/** A rule is trusted (auto-fills / goes into Echo's prompt) at this count. */
export const TRUST_COUNT = 2;
/** Shorter keywords are not learned — they misfire inside unrelated words. */
export const MIN_KEYWORD_LENGTH = 3;
/** Head start for a correction that contradicts an existing rule (1 + 2). */
export const CONFLICT_START_COUNT = 3;
/** How much an overridden rule is demoted per correction. */
export const CONFLICT_DEMOTE = 2;

/**
 * Generic first words that must NOT match on their own ("restoran …" would
 * fire on every restaurant). Distinctive names (speedmart, shell) still can.
 */
const FIRST_WORD_STOPWORDS = new Set([
  'restoran', 'restaurant', 'kedai', 'warung', 'gerai', 'kafe', 'cafe',
  'kopitiam', 'pasar', 'pasaraya', 'supermarket', 'mini', 'mart', 'the',
]);

/**
 * Canonical keyword form: lowercase, punctuation removed ("D.I.Y." → "diy"),
 * spaces collapsed. Long vendor strings keep only their first two words so
 * chain branches share one rule ("99 speedmart bukit bintang" → "99 speedmart"
 * → also matches the Gombak branch). Applied at learn time AND to query text
 * in match helpers, so both sides normalize identically.
 */
export function normalizeKeyword(text: string, shorten = false): string {
  const norm = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!shorten) return norm;
  const words = norm.split(' ');
  return words.length > 2 ? words.slice(0, 2).join(' ') : norm;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word/phrase containment — "may" no longer fires inside "maybe". */
export function matchesKeyword(text: string, keyword: string): boolean {
  if (keyword.length < MIN_KEYWORD_LENGTH) return false;
  return new RegExp(`\\b${escapeRegex(keyword)}\\b`).test(text);
}

/**
 * Fallback when no full keyword matches: a pattern's FIRST word may match on
 * its own if it's distinctive (≥4 chars, not a generic stopword). Lets "shell
 * jalan" teach something about "shell subang".
 */
export function matchesFirstWord(text: string, keyword: string): boolean {
  const first = keyword.split(' ')[0] || '';
  if (first.length < 4 || FIRST_WORD_STOPWORDS.has(first)) return false;
  return new RegExp(`\\b${escapeRegex(first)}\\b`).test(text);
}

export function upsert<T extends { count: number }>(
  arr: T[],
  match: (item: T) => boolean,
  create: () => T
): T[] {
  const idx = arr.findIndex(match);
  if (idx >= 0) {
    const updated = [...arr];
    updated[idx] = { ...updated[idx], count: updated[idx].count + 1 };
    return updated;
  }
  const next = [...arr, create()];
  // Cap at MAX_PATTERNS — evict lowest count
  if (next.length > MAX_PATTERNS) {
    next.sort((a, b) => b.count - a.count);
    return next.slice(0, MAX_PATTERNS);
  }
  return next;
}

/**
 * Correcting an existing rule: demote the old one (forgotten after ~2
 * overrides — habits change, the notebook should age with the user) and give
 * the new one a head start so it wins in days, not months.
 */
export function demoteConflicts<T extends { keyword: string; count: number }>(
  arr: T[],
  keyword: string,
  sameRule: (item: T) => boolean
): T[] {
  const next: T[] = [];
  for (const item of arr) {
    if (item.keyword === keyword && !sameRule(item)) {
      const demoted = item.count - CONFLICT_DEMOTE;
      if (demoted >= 1) next.push({ ...item, count: demoted });
      // else: forgotten — overridden into the ground
    } else {
      next.push(item);
    }
  }
  return next;
}

/** Full learn transition for a keyword→category table (pure — directly testable). */
export function applyLearnCategory(
  patterns: CategoryPattern[],
  keyword: string,
  category: string,
  startCount = 1
): CategoryPattern[] {
  const kw = normalizeKeyword(keyword, true);
  if (kw.length < MIN_KEYWORD_LENGTH || !category) return patterns;
  const hadConflict = patterns.some((p) => p.keyword === kw && p.category !== category);
  const demoted = demoteConflicts(patterns, kw, (p) => p.category === category);
  return upsert(
    demoted,
    (p) => p.keyword === kw && p.category === category,
    () => ({
      keyword: kw,
      category,
      count: hadConflict ? Math.max(startCount, CONFLICT_START_COUNT) : startCount,
    })
  );
}

/** Full learn transition for a keyword→wallet table (pure). */
export function applyLearnWallet(
  prefs: WalletPreference[],
  keyword: string,
  wallet: string,
  startCount = 1
): WalletPreference[] {
  const kw = normalizeKeyword(keyword, true);
  if (kw.length < MIN_KEYWORD_LENGTH || !wallet) return prefs;
  const hadConflict = prefs.some((p) => p.keyword === kw && p.wallet !== wallet);
  const demoted = demoteConflicts(prefs, kw, (p) => p.wallet === wallet);
  // Matching by keyword+wallet (not keyword alone) is what lets a changed habit
  // replace the old wallet instead of the first one sticking forever.
  return upsert(
    demoted,
    (p) => p.keyword === kw && p.wallet === wallet,
    () => ({
      keyword: kw,
      wallet,
      count: hadConflict ? Math.max(startCount, CONFLICT_START_COUNT) : startCount,
    })
  );
}

/** Full learn transition for person aliases (pure). Latest preferred name wins. */
export function applyLearnPersonAlias(
  aliases: PersonAlias[],
  raw: string,
  preferred: string
): PersonAlias[] {
  const r = raw.toLowerCase().trim();
  const p = preferred.trim();
  if (!r || !p || r === p.toLowerCase()) return aliases;
  const existing = aliases.find((a) => a.raw === r);
  // Aliases have no count gate — a stale first answer would stick forever, so
  // re-teaching the same raw name replaces the preferred form outright.
  if (existing && existing.preferred !== p) {
    return aliases.map((a) => (a.raw === r ? { ...a, preferred: p, count: a.count + 1 } : a));
  }
  return upsert(
    aliases,
    (a) => a.raw === r,
    () => ({ raw: r, preferred: p, count: 1 })
  );
}

/** Pick the highest-count trusted pattern matching the text (full keyword, then first-word fallback). */
export function suggestFrom<T extends { keyword: string; count: number }>(
  patterns: T[],
  text: string
): T | null {
  const lower = normalizeKeyword(text);
  let best: T | null = null;
  for (const p of patterns) {
    if (p.count >= TRUST_COUNT && matchesKeyword(lower, p.keyword)) {
      if (!best || p.count > best.count) best = p;
    }
  }
  if (best) return best;
  for (const p of patterns) {
    if (p.count >= TRUST_COUNT && matchesFirstWord(lower, p.keyword)) {
      if (!best || p.count > best.count) best = p;
    }
  }
  return best;
}

export interface LearningBlob {
  categoryPatterns?: CategoryPattern[];
  personAliases?: PersonAlias[];
  walletPreferences?: WalletPreference[];
  typeCorrections?: TypeCorrection[];
  skippedKeywords?: Record<string, number>;
  updatedAt?: number | null;
}

/**
 * v0 → v1: keywords moved to the normalized form (punctuation stripped,
 * vendors shortened to two words). Re-key, merge duplicates, drop the
 * too-short ones that can no longer match safely.
 */
export function migrateLearningV0toV1(persisted: LearningBlob): LearningBlob {
  if (!persisted) return persisted;
  const mergeBy = <T extends { count: number }>(
    arr: T[] | undefined,
    keyOf: (item: T) => string,
    fix: (item: T) => T | null
  ): T[] => {
    const map = new Map<string, T>();
    for (const item of arr || []) {
      const f = fix(item);
      if (!f) continue;
      const key = keyOf(f);
      const prev = map.get(key);
      map.set(key, prev ? { ...f, count: prev.count + f.count } : f);
    }
    return [...map.values()];
  };
  return {
    ...persisted,
    categoryPatterns: mergeBy(
      persisted.categoryPatterns,
      (p: CategoryPattern) => `${p.keyword}|${p.category}`,
      (p: CategoryPattern) => {
        const keyword = normalizeKeyword(p.keyword, true);
        return keyword.length >= MIN_KEYWORD_LENGTH ? { ...p, keyword } : null;
      }
    ),
    walletPreferences: mergeBy(
      persisted.walletPreferences,
      (p: WalletPreference) => `${p.keyword}|${p.wallet}`,
      (p: WalletPreference) => {
        const keyword = normalizeKeyword(p.keyword, true);
        return keyword.length >= MIN_KEYWORD_LENGTH ? { ...p, keyword } : null;
      }
    ),
    typeCorrections: mergeBy(
      persisted.typeCorrections,
      (t: TypeCorrection) => `${t.keyword}|${t.toType}`,
      (t: TypeCorrection) => {
        const keyword = normalizeKeyword(t.keyword, true);
        return keyword.length >= MIN_KEYWORD_LENGTH ? { ...t, keyword } : null;
      }
    ),
    personAliases: mergeBy(
      persisted.personAliases,
      (a: PersonAlias) => a.raw,
      (a: PersonAlias) => {
        const raw = (a.raw || '').toLowerCase().trim();
        return raw ? { ...a, raw } : null;
      }
    ),
  };
}
