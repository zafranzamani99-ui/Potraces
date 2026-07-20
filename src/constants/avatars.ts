/**
 * Bundled preset avatars for the profile picker (Settings / onboarding /
 * dashboard greeting). Illustrated set — DiceBear "adventurer" style,
 * downloaded as 128px PNGs so they work offline with zero loading.
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
}

// Metro requires STATIC require() calls — keep this list literal.
export const PRESET_AVATARS: PresetAvatar[] = [
  { id: 'av00', source: require('../../assets/avatars/av00.png') },
  { id: 'av01', source: require('../../assets/avatars/av01.png') },
  { id: 'av02', source: require('../../assets/avatars/av02.png') },
  { id: 'av03', source: require('../../assets/avatars/av03.png') },
  { id: 'av04', source: require('../../assets/avatars/av04.png') },
  { id: 'av05', source: require('../../assets/avatars/av05.png') },
  { id: 'av06', source: require('../../assets/avatars/av06.png') },
  { id: 'av07', source: require('../../assets/avatars/av07.png') },
  { id: 'av08', source: require('../../assets/avatars/av08.png') },
  { id: 'av09', source: require('../../assets/avatars/av09.png') },
  { id: 'av10', source: require('../../assets/avatars/av10.png') },
  { id: 'av11', source: require('../../assets/avatars/av11.png') },
  { id: 'av12', source: require('../../assets/avatars/av12.png') },
  { id: 'av13', source: require('../../assets/avatars/av13.png') },
  { id: 'av14', source: require('../../assets/avatars/av14.png') },
  { id: 'av15', source: require('../../assets/avatars/av15.png') },
  { id: 'av16', source: require('../../assets/avatars/av16.png') },
  { id: 'av17', source: require('../../assets/avatars/av17.png') },
  { id: 'av18', source: require('../../assets/avatars/av18.png') },
  { id: 'av19', source: require('../../assets/avatars/av19.png') },
  { id: 'av20', source: require('../../assets/avatars/av20.png') },
];

export function presetAvatarById(id: string | null): PresetAvatar | undefined {
  return PRESET_AVATARS.find((a) => a.id === id);
}
