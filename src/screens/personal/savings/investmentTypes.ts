/**
 * investmentTypes — single source of truth for savings/investment instrument
 * types: their display (name/icon/colour), Malay name, and RISK CLASS.
 *
 * The `class` field drives the Savings ⇄ Investments split on the screen.
 * This module is PURE (no React / native imports) so it is unit-testable with tsx.
 *
 * Background: the account `type` is a free string (types/index.ts:1403). Legacy /
 * seeded data has used coarse values ('savings', 'investment') and the old
 * 'robo_crypto' id. `getTypeInfo()` normalises all of these to a canonical entry,
 * and always returns a stable, unique `id` so lists can key by id (never by name —
 * the old `key={item.name}` collided when several types fell back to "Other").
 */

export type SavingsClass = 'savings' | 'investment';

export interface TypeInfo {
  /** canonical id (or the raw type for unknowns) — safe to use as a React key */
  id: string;
  name: string;
  nameBm: string;
  /** CategoryIcon spec string (i/ m/ fa/ or bare Feather) */
  icon: string;
  color: string;
  class: SavingsClass;
}

const SAVINGS = 'savings' as const;
const INVESTMENT = 'investment' as const;

/** Canonical registry, keyed by canonical id. */
export const INVESTMENT_TYPES: Record<string, TypeInfo> = {
  // ── Savings (capital-stable, rate/dividend based) ──
  bank:         { id: 'bank',         name: 'Bank Savings',   nameBm: 'Simpanan Bank',   icon: 'm/bank',            color: '#4F7CAC', class: SAVINGS },
  asb:          { id: 'asb',          name: 'ASB',            nameBm: 'ASB',             icon: 'i/lock-closed',     color: '#4F5104', class: SAVINGS },
  tabung_haji:  { id: 'tabung_haji',  name: 'Tabung Haji',    nameBm: 'Tabung Haji',     icon: 'm/book',            color: '#B8860B', class: SAVINGS },
  esa:          { id: 'esa',          name: 'ESA',            nameBm: 'ESA',             icon: 'i/shield-checkmark', color: '#6BA3BE', class: SAVINGS },
  tng_plus:     { id: 'tng_plus',     name: 'TNG GO+',        nameBm: 'TNG GO+',         icon: 'm/cellphone',       color: '#1E88A8', class: SAVINGS },
  fd:           { id: 'fd',           name: 'Fixed Deposit',  nameBm: 'Simpanan Tetap',  icon: 'm/safe',            color: '#7A8450', class: SAVINGS },
  save_generic: { id: 'save_generic', name: 'Savings',        nameBm: 'Simpanan',        icon: 'm/piggy-bank',      color: '#6B7C5A', class: SAVINGS },

  // ── Investments (market / growth, value can fall) ──
  robo:         { id: 'robo',         name: 'Robo-advisor',   nameBm: 'Robo-advisor',    icon: 'm/robot',           color: '#9A6400', class: INVESTMENT },
  crypto:       { id: 'crypto',       name: 'Crypto',         nameBm: 'Kripto',          icon: 'm/bitcoin',         color: '#C77A16', class: INVESTMENT },
  stocks:       { id: 'stocks',       name: 'Stocks & ETF',   nameBm: 'Saham & ETF',     icon: 'm/chart-line',      color: '#A06CD5', class: INVESTMENT },
  gold:         { id: 'gold',         name: 'Gold',           nameBm: 'Emas',            icon: 'm/gold',            color: '#C4956A', class: INVESTMENT },
  invest_generic: { id: 'invest_generic', name: 'Investment', nameBm: 'Pelaburan',       icon: 'm/trending-up',     color: '#8A6D3B', class: INVESTMENT },

  // ── Fallback ──
  other:        { id: 'other',        name: 'Other',          nameBm: 'Lain-lain',       icon: 'm/finance',         color: '#6B7596', class: SAVINGS },
};

/**
 * Legacy / coarse raw-type values → canonical id.
 * Keeps old stored data and seeded data rendering correctly.
 */
export const TYPE_ALIASES: Record<string, string> = {
  robo_crypto: 'robo',   // old id conflated robo + crypto; treat as robo, crypto is its own now
  investment: 'invest_generic',
  savings: 'save_generic',
  saving: 'save_generic',
  unit_trust: 'asb',
  fixed_deposit: 'fd',
  btc: 'crypto',
  bitcoin: 'crypto',
};

/** Optional resolver for user custom_* categories (name/icon/color come from the category store). */
export type CustomResolver = (id: string) => { name?: string; icon?: string; color?: string } | undefined;

/**
 * Resolve any raw `type` string to a display + class.
 * - canonical ids and known aliases → their registry entry
 * - `custom_*` → uses the resolver (defaults to savings class) if provided
 * - anything else → an "Other" entry that KEEPS the raw id (so lists keyed by
 *   id never collide even when two unknown types both display "Other")
 */
export function getTypeInfo(rawType: string | undefined | null, resolveCustom?: CustomResolver): TypeInfo {
  const raw = (rawType ?? '').trim();
  if (!raw) return INVESTMENT_TYPES.other;

  const canonical = TYPE_ALIASES[raw] ?? raw;
  if (INVESTMENT_TYPES[canonical]) return INVESTMENT_TYPES[canonical];

  if (raw.startsWith('custom_') && resolveCustom) {
    const c = resolveCustom(raw);
    if (c) {
      return {
        id: raw,
        name: c.name || 'Other',
        nameBm: c.name || 'Lain-lain',
        icon: c.icon || 'm/finance',
        color: c.color || INVESTMENT_TYPES.other.color,
        class: SAVINGS, // custom types default to the safe bucket
      };
    }
  }

  // Unknown: preserve the raw id so keys stay unique; present as "Other".
  return { ...INVESTMENT_TYPES.other, id: raw };
}

/** Risk class for a raw type. */
export function classOf(rawType: string | undefined | null, resolveCustom?: CustomResolver): SavingsClass {
  return getTypeInfo(rawType, resolveCustom).class;
}

/** Type ids valid for the store rehydrate allow-list (canonical + legacy aliases). */
export const VALID_TYPE_IDS: string[] = [
  ...Object.keys(INVESTMENT_TYPES),
  ...Object.keys(TYPE_ALIASES),
];

/** Options for the type picker, grouped by class (savings first). */
export const SAVINGS_TYPE_OPTIONS: TypeInfo[] = Object.values(INVESTMENT_TYPES).filter(
  (t) => t.id !== 'save_generic' && t.id !== 'invest_generic'
);
