/**
 * Bundled preset club/session icons for the Collectz create/edit picker
 * (badminton, futsal, bowling… clubs). Noto Color Emoji 128px PNGs — bundled
 * so they work offline with zero loading.
 *
 * License: Noto Emoji by Google, Apache License 2.0
 * (https://github.com/googlefonts/noto-emoji/blob/main/LICENSE).
 *
 * Session.image_path stores 'preset:<id>' for these (vs a storage path for
 * uploaded club images) — renderers resolve via presetClubIcon().
 */
import { ImageSourcePropType } from 'react-native';

export interface ClubIcon {
  id: string;
  source: ImageSourcePropType;
}

// Metro requires STATIC require() calls — keep this list literal.
export const CLUB_ICONS: ClubIcon[] = [
  { id: 'badminton', source: require('../../assets/clubs/club00.png') },
  { id: 'futsal', source: require('../../assets/clubs/club01.png') },
  { id: 'basketball', source: require('../../assets/clubs/club02.png') },
  { id: 'bowling', source: require('../../assets/clubs/club03.png') },
  { id: 'tennis', source: require('../../assets/clubs/club04.png') },
  { id: 'volleyball', source: require('../../assets/clubs/club05.png') },
  { id: 'pingpong', source: require('../../assets/clubs/club06.png') },
  { id: 'cycling', source: require('../../assets/clubs/club07.png') },
  { id: 'makan', source: require('../../assets/clubs/club08.png') },
  { id: 'trip', source: require('../../assets/clubs/club09.png') },
  { id: 'gift', source: require('../../assets/clubs/club10.png') },
  { id: 'stadium', source: require('../../assets/clubs/club11.png') },
];

export const CLUB_PRESET_PREFIX = 'preset:';

/** Resolve a session image_path: preset marker → bundled source; null otherwise. */
export function presetClubIcon(imagePath: string | null | undefined): ClubIcon | undefined {
  if (!imagePath || !imagePath.startsWith(CLUB_PRESET_PREFIX)) return undefined;
  const id = imagePath.slice(CLUB_PRESET_PREFIX.length);
  return CLUB_ICONS.find((c) => c.id === id);
}
