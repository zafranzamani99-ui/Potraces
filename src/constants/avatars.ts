/**
 * Bundled preset avatars for the profile picker (Settings / onboarding /
 * dashboard greeting). Illustrated set — DiceBear "adventurer" style,
 * downloaded as 128px PNGs so they work offline with zero loading.
 *
 * Backgrounds: the PNGs were converted to TRANSPARENT cutouts (2026-07) so the
 * user-chosen avatarBg shows through; `bg` preserves each preset's original
 * DiceBear backdrop as its DEFAULT when no custom color is picked.
 *
 * Attribution (required): avatar images by DiceBear (https://dicebear.com),
 * "adventurer" collection by Lisa Wischofsky, licensed CC BY 4.0
 * (https://creativecommons.org/licenses/by/4.0/). The picker surfaces this
 * credit in its footer.
 */
import { ImageSourcePropType } from 'react-native';

export interface PresetAvatar {
  id: string;
  source: ImageSourcePropType;
  /** Original baked backdrop, kept as this preset's default circle color. */
  bg: string;
}

// Metro requires STATIC require() calls — keep this list literal.
// Curated set (2026-07-21, owner request): 14 presets — 8 masc + 6 fem, chosen
// for variety of skin tone / age / style. Removed: av01, av07, av09, av10,
// av11, av14, av19 (files kept on disk; a user who had one selected falls back
// to their initial via presetAvatarById → undefined).
export const PRESET_AVATARS: PresetAvatar[] = [
  { id: 'av00', source: require('../../assets/avatars/av00.png'), bg: '#B6E3F4' },
  { id: 'av02', source: require('../../assets/avatars/av02.png'), bg: '#D1D4F9' },
  { id: 'av03', source: require('../../assets/avatars/av03.png'), bg: '#FFD5DC' },
  { id: 'av04', source: require('../../assets/avatars/av04.png'), bg: '#FFDFBF' },
  { id: 'av05', source: require('../../assets/avatars/av05.png'), bg: '#B6E3F4' },
  { id: 'av06', source: require('../../assets/avatars/av06.png'), bg: '#C0AEDE' },
  { id: 'av08', source: require('../../assets/avatars/av08.png'), bg: '#FFD5DC' },
  { id: 'av12', source: require('../../assets/avatars/av12.png'), bg: '#D1D4F9' },
  { id: 'av13', source: require('../../assets/avatars/av13.png'), bg: '#FFD5DC' },
  { id: 'av15', source: require('../../assets/avatars/av15.png'), bg: '#B6E3F4' },
  { id: 'av16', source: require('../../assets/avatars/av16.png'), bg: '#C0AEDE' },
  { id: 'av17', source: require('../../assets/avatars/av17.png'), bg: '#D1D4F9' },
  { id: 'av18', source: require('../../assets/avatars/av18.png'), bg: '#FFD5DC' },
  { id: 'av20', source: require('../../assets/avatars/av20.png'), bg: '#B6E3F4' },
];

export function presetAvatarById(id: string | null): PresetAvatar | undefined {
  return PRESET_AVATARS.find((a) => a.id === id);
}
