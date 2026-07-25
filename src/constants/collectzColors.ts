/**
 * Collectz category color identity.
 *
 * Every Collectz session carries a category ('sport' | 'makan' | 'trip' |
 * 'gift' | 'other' — see CollectzCreate / collectzParser). These tokens give
 * each category a stable color so heroes, icons and tints are instantly
 * recognizable across the Collectz screens. Flat fills only — no gradients
 * (per design feedback).
 *
 * Same CALM rule as the rest of the palette: NO red, NO bright green —
 * statuses stay semantic (accent/gold/overdue/neutral), categories stay muted.
 * Each token is `{ light, dark }` and is consumed via `semantic(token, isDark)`
 * or the helpers below; dark variants are lightened/desaturated for AA
 * contrast on the dark background (#121212), mirroring how CALM_DARK lifts
 * accents (e.g. accent #4F5104 → #A4A843).
 *
 * Category glyphs: premium MaterialCommunityIcons per category — displayed
 * instead of the native-emoji presets anywhere a polished look matters
 * (hero wells). The emoji presets stay only in the create-time picker.
 */
import { semantic, type SemanticToken } from './index';

export type CollectzCategory = 'sport' | 'makan' | 'trip' | 'gift' | 'other';

// ─── CATEGORY TOKENS ────────────────────────────────────────
// Consume via `semantic(row, isDark)` or `collectzCategoryColor(category, isDark)`.
export const COLLECTZ_CATEGORY_COLORS: Record<CollectzCategory, SemanticToken> = {
  sport: { light: '#6BA3BE', dark: '#8ABCD2' },  // calm teal-blue — 9.1:1 on dark
  makan: { light: '#9A6400', dark: '#D9BD55' },  // bronze → CALM_DARK gold
  trip:  { light: '#7C5CFC', dark: '#A795FC' },  // violet — 7.4:1 on dark
  gift:  { light: '#A06CD5', dark: '#C9A4EA' },  // purple — 8.9:1 on dark
  other: { light: '#4F5104', dark: '#A4A843' },  // accent olive (matches CALM/CALM_DARK accent)
};

/**
 * Themed color for a Collectz category. Unknown or missing categories
 * (sessions created before categories existed, parser returning null)
 * fall back to 'other'.
 */
export const collectzCategoryColor = (
  category: string | null | undefined,
  isDark: boolean,
): string => {
  const token =
    category != null && category in COLLECTZ_CATEGORY_COLORS
      ? COLLECTZ_CATEGORY_COLORS[category as CollectzCategory]
      : COLLECTZ_CATEGORY_COLORS.other;
  return semantic(token, isDark);
};

// ─── CATEGORY GLYPHS (MaterialCommunityIcons) ───────────────
// Premium category icon for hero wells — replaces native-emoji presets.
export const COLLECTZ_CATEGORY_ICONS: Record<CollectzCategory, string> = {
  sport: 'whistle',
  makan: 'silverware-fork-knife',
  trip: 'airplane',
  gift: 'gift',
  other: 'account-group',
};

/**
 * MaterialCommunityIcons glyph name for a Collectz category. Unknown or
 * missing categories fall back to 'other', same as collectzCategoryColor.
 */
export const collectzCategoryIcon = (category: string | null | undefined): string =>
  category != null && category in COLLECTZ_CATEGORY_ICONS
    ? COLLECTZ_CATEGORY_ICONS[category as CollectzCategory]
    : COLLECTZ_CATEGORY_ICONS.other;
