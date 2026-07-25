/**
 * Preset club/session icons for the Collectz create/edit picker and everywhere a
 * session icon is shown (Home/Detail/Join cards).
 *
 * Each preset has BOTH:
 *  - `emoji`  — native emoji glyph, kept for the web share page (Noto PNGs) and
 *               backward compatibility with already-created sessions.
 *  - `icon`   — MaterialCommunityIcons glyph name; the premium in-app rendering
 *               (create picker, hero wells). Verified against the bundled
 *               @expo/vector-icons glyphmap.
 *
 * Grouped by session category so the create screen can focus the grid on the
 * picked category. Session.image_path stores 'preset:<id>' (vs a storage path
 * for uploaded club images) — renderers resolve via presetClubIcon(). IDs are
 * STABLE (never rename) so existing sessions keep their icon.
 */
export type ClubIconCategory = 'sport' | 'makan' | 'trip' | 'gift' | 'other';

export interface ClubIcon {
  id: string;
  emoji: string;
  /** MaterialCommunityIcons glyph name (premium in-app rendering). */
  icon: string;
  category: ClubIconCategory;
}

export const CLUB_ICONS: ClubIcon[] = [
  // ── Sport ──
  { id: 'badminton', emoji: '🏸', icon: 'badminton', category: 'sport' },
  { id: 'futsal', emoji: '⚽', icon: 'soccer', category: 'sport' },
  { id: 'basketball', emoji: '🏀', icon: 'basketball', category: 'sport' },
  { id: 'bowling', emoji: '🎳', icon: 'bowling', category: 'sport' },
  { id: 'tennis', emoji: '🎾', icon: 'tennis', category: 'sport' },
  { id: 'volleyball', emoji: '🏐', icon: 'volleyball', category: 'sport' },
  { id: 'pingpong', emoji: '🏓', icon: 'table-tennis', category: 'sport' },
  { id: 'cycling', emoji: '🚴', icon: 'bike', category: 'sport' },
  { id: 'stadium', emoji: '🏟️', icon: 'stadium', category: 'sport' },
  { id: 'golf', emoji: '⛳', icon: 'golf', category: 'sport' },
  { id: 'swim', emoji: '🏊', icon: 'swim', category: 'sport' },
  { id: 'run', emoji: '🏃', icon: 'run', category: 'sport' },
  { id: 'gym', emoji: '🏋️', icon: 'weight-lifter', category: 'sport' },
  { id: 'boxing', emoji: '🥊', icon: 'boxing-glove', category: 'sport' },
  { id: 'dart', emoji: '🎯', icon: 'target', category: 'sport' },

  // ── Makan (food) ──
  { id: 'makan', emoji: '🍜', icon: 'noodles', category: 'makan' },
  { id: 'coffee', emoji: '☕', icon: 'coffee', category: 'makan' },
  { id: 'pizza', emoji: '🍕', icon: 'pizza', category: 'makan' },
  { id: 'burger', emoji: '🍔', icon: 'hamburger', category: 'makan' },
  { id: 'bbq', emoji: '🍖', icon: 'grill', category: 'makan' },
  { id: 'sushi', emoji: '🍣', icon: 'fish', category: 'makan' },
  { id: 'hotpot', emoji: '🍲', icon: 'pot-steam', category: 'makan' },
  { id: 'chicken', emoji: '🍗', icon: 'food-drumstick', category: 'makan' },
  { id: 'cake', emoji: '🍰', icon: 'cake', category: 'makan' },
  { id: 'beer', emoji: '🍻', icon: 'beer', category: 'makan' },

  // ── Trip ──
  { id: 'trip', emoji: '✈️', icon: 'airplane', category: 'trip' },
  { id: 'beach', emoji: '🏖️', icon: 'beach', category: 'trip' },
  { id: 'camp', emoji: '🏕️', icon: 'tent', category: 'trip' },
  { id: 'mountain', emoji: '⛰️', icon: 'terrain', category: 'trip' },
  { id: 'island', emoji: '🏝️', icon: 'island', category: 'trip' },
  { id: 'car', emoji: '🚗', icon: 'car', category: 'trip' },
  { id: 'hotel', emoji: '🏨', icon: 'bed', category: 'trip' },
  { id: 'backpack', emoji: '🎒', icon: 'bag-personal', category: 'trip' },
  { id: 'ticket', emoji: '🎟️', icon: 'ticket', category: 'trip' },

  // ── Gift / celebration ──
  { id: 'gift', emoji: '🎁', icon: 'gift', category: 'gift' },
  { id: 'party', emoji: '🎉', icon: 'party-popper', category: 'gift' },
  { id: 'birthday', emoji: '🎂', icon: 'cake-variant', category: 'gift' },
  { id: 'balloon', emoji: '🎈', icon: 'balloon', category: 'gift' },
  { id: 'ring', emoji: '💍', icon: 'ring', category: 'gift' },
  { id: 'heart', emoji: '❤️', icon: 'heart', category: 'gift' },
  { id: 'sparkler', emoji: '🎇', icon: 'firework', category: 'gift' },

  // ── Other ──
  { id: 'money', emoji: '💰', icon: 'cash', category: 'other' },
  { id: 'calendar', emoji: '📅', icon: 'calendar', category: 'other' },
  { id: 'group', emoji: '👥', icon: 'account-group', category: 'other' },
  { id: 'music', emoji: '🎵', icon: 'music-note', category: 'other' },
  { id: 'game', emoji: '🎮', icon: 'gamepad-variant', category: 'other' },
  { id: 'movie', emoji: '🎬', icon: 'movie', category: 'other' },
  { id: 'home', emoji: '🏠', icon: 'home', category: 'other' },
];

export const CLUB_PRESET_PREFIX = 'preset:';

/**
 * Curated swatches for the icon color picker (Create icon sheet). Values are
 * stored inline in the preset marker ('preset:<id>:<hexNoHash>') — no DB
 * change, and older app versions simply ignore the color segment.
 */
export const CLUB_ICON_COLORS = [
  '4F5104', // deep olive (brand accent)
  '6BA3BE', // calm teal-blue
  '9A6400', // bronze
  'DEAB22', // gold
  '7C5CFC', // violet
  'A06CD5', // purple
  'C1694F', // terracotta
  '1A1A1A', // ink
] as const;

/** Resolve a session image_path: preset marker → ClubIcon; undefined otherwise.
 *  Tolerates the color-suffixed form 'preset:<id>:<hex>' — the id is the first
 *  segment, so older and newer markers resolve identically. */
export function presetClubIcon(imagePath: string | null | undefined): ClubIcon | undefined {
  if (!imagePath || !imagePath.startsWith(CLUB_PRESET_PREFIX)) return undefined;
  const id = imagePath.slice(CLUB_PRESET_PREFIX.length).split(':')[0];
  return CLUB_ICONS.find((c) => c.id === id);
}

/** The custom color in a preset marker ('preset:<id>:<hex>') as '#hex', or null. */
export function presetClubColor(imagePath: string | null | undefined): string | null {
  if (!imagePath || !imagePath.startsWith(CLUB_PRESET_PREFIX)) return null;
  const seg = imagePath.slice(CLUB_PRESET_PREFIX.length).split(':')[1];
  return seg && /^[0-9A-Fa-f]{6}$/.test(seg) ? `#${seg}` : null;
}

/** Icons for a category, or all when no category is chosen. */
export function clubIconsForCategory(category: ClubIconCategory | null | undefined): ClubIcon[] {
  if (!category) return CLUB_ICONS;
  return CLUB_ICONS.filter((c) => c.category === category);
}
