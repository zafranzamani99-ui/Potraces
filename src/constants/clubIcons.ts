/**
 * Preset club/session icons for the Collectz create/edit picker and everywhere a
 * session icon is shown (Home/Detail/Join cards).
 *
 * These are native emoji GLYPHS (rendered as text), grouped by session category
 * so the create screen can focus the grid on the picked category. Emoji keeps the
 * set easy to expand (no bundled PNGs) and renders crisp at any size on-device.
 *
 * Session.image_path stores 'preset:<id>' for these (vs a storage path for
 * uploaded club images) — renderers resolve via presetClubIcon() and show the
 * `emoji` as text. IDs are STABLE (never rename) so existing sessions keep their
 * icon.
 */
export type ClubIconCategory = 'sport' | 'makan' | 'trip' | 'gift' | 'other';

export interface ClubIcon {
  id: string;
  emoji: string;
  category: ClubIconCategory;
}

export const CLUB_ICONS: ClubIcon[] = [
  // ── Sport ──
  { id: 'badminton', emoji: '🏸', category: 'sport' },
  { id: 'futsal', emoji: '⚽', category: 'sport' },
  { id: 'basketball', emoji: '🏀', category: 'sport' },
  { id: 'bowling', emoji: '🎳', category: 'sport' },
  { id: 'tennis', emoji: '🎾', category: 'sport' },
  { id: 'volleyball', emoji: '🏐', category: 'sport' },
  { id: 'pingpong', emoji: '🏓', category: 'sport' },
  { id: 'cycling', emoji: '🚴', category: 'sport' },
  { id: 'stadium', emoji: '🏟️', category: 'sport' },
  { id: 'golf', emoji: '⛳', category: 'sport' },
  { id: 'swim', emoji: '🏊', category: 'sport' },
  { id: 'run', emoji: '🏃', category: 'sport' },
  { id: 'gym', emoji: '🏋️', category: 'sport' },
  { id: 'boxing', emoji: '🥊', category: 'sport' },
  { id: 'dart', emoji: '🎯', category: 'sport' },

  // ── Makan (food) ──
  { id: 'makan', emoji: '🍜', category: 'makan' },
  { id: 'coffee', emoji: '☕', category: 'makan' },
  { id: 'pizza', emoji: '🍕', category: 'makan' },
  { id: 'burger', emoji: '🍔', category: 'makan' },
  { id: 'bbq', emoji: '🍖', category: 'makan' },
  { id: 'sushi', emoji: '🍣', category: 'makan' },
  { id: 'hotpot', emoji: '🍲', category: 'makan' },
  { id: 'chicken', emoji: '🍗', category: 'makan' },
  { id: 'cake', emoji: '🍰', category: 'makan' },
  { id: 'beer', emoji: '🍻', category: 'makan' },

  // ── Trip ──
  { id: 'trip', emoji: '✈️', category: 'trip' },
  { id: 'beach', emoji: '🏖️', category: 'trip' },
  { id: 'camp', emoji: '🏕️', category: 'trip' },
  { id: 'mountain', emoji: '⛰️', category: 'trip' },
  { id: 'island', emoji: '🏝️', category: 'trip' },
  { id: 'car', emoji: '🚗', category: 'trip' },
  { id: 'hotel', emoji: '🏨', category: 'trip' },
  { id: 'backpack', emoji: '🎒', category: 'trip' },
  { id: 'ticket', emoji: '🎟️', category: 'trip' },

  // ── Gift / celebration ──
  { id: 'gift', emoji: '🎁', category: 'gift' },
  { id: 'party', emoji: '🎉', category: 'gift' },
  { id: 'birthday', emoji: '🎂', category: 'gift' },
  { id: 'balloon', emoji: '🎈', category: 'gift' },
  { id: 'ring', emoji: '💍', category: 'gift' },
  { id: 'heart', emoji: '❤️', category: 'gift' },
  { id: 'sparkler', emoji: '🎇', category: 'gift' },

  // ── Other ──
  { id: 'money', emoji: '💰', category: 'other' },
  { id: 'calendar', emoji: '📅', category: 'other' },
  { id: 'group', emoji: '👥', category: 'other' },
  { id: 'music', emoji: '🎵', category: 'other' },
  { id: 'game', emoji: '🎮', category: 'other' },
  { id: 'movie', emoji: '🎬', category: 'other' },
  { id: 'home', emoji: '🏠', category: 'other' },
];

export const CLUB_PRESET_PREFIX = 'preset:';

/** Resolve a session image_path: preset marker → ClubIcon; undefined otherwise. */
export function presetClubIcon(imagePath: string | null | undefined): ClubIcon | undefined {
  if (!imagePath || !imagePath.startsWith(CLUB_PRESET_PREFIX)) return undefined;
  const id = imagePath.slice(CLUB_PRESET_PREFIX.length);
  return CLUB_ICONS.find((c) => c.id === id);
}

/** Icons for a category, or all when no category is chosen. */
export function clubIconsForCategory(category: ClubIconCategory | null | undefined): ClubIcon[] {
  if (!category) return CLUB_ICONS;
  return CLUB_ICONS.filter((c) => c.category === category);
}
