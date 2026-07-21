import React from 'react';
import { View, Image } from 'react-native';
import { Feather, Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { ensureContrastOnDark } from '../../constants';
import { useIsDark } from '../../hooks/useCalm';
import { TYPE_LOGOS } from './typeLogos';

// Single renderer for every category / cost-category / product / payment-method icon.
//
// Icon specs are lib-prefixed:
//   i/<name>       -> Ionicons
//   m/<name>       -> MaterialCommunityIcons
//   fa/<name>      -> FontAwesome5
//   logo/<key>     -> brand-logo Image from TYPE_LOGOS (falls back to Feather if unknown)
//   photo:<uri>    -> user gallery photo (Basic+ "photo icons" perk) — circle-cropped Image
// A bare name with no "/" is treated as a Feather glyph. This is the safety net:
// every category created before this migration stored a plain Feather name, so it
// keeps rendering correctly — a category can never become a blank box.

// ── "photo:" icon convention helpers ─────────────────────────────────
// A photo icon rides INSIDE the existing icon string field ("photo:file://…"),
// so it persists through every store/sync path with no type changes. The file
// itself is copied out of the picker's tmp cache into documentDirectory
// (icon-<ts>.<ext>) so iOS can't purge it.

export const isPhotoIcon = (icon?: string | null): boolean => !!icon && icon.startsWith('photo:');
export const photoIconUri = (icon: string): string => icon.slice('photo:'.length);

/**
 * Best-effort delete of a photo-icon file we previously copied into documents.
 * Accepts either a "photo:<uri>" icon string or a raw uri. Only ever touches
 * our own icon-* files inside documentDirectory — legacy tmp-cache uris and
 * any other app files are left alone.
 */
export function deletePhotoIconFile(iconOrUri?: string | null): void {
  if (!iconOrUri) return;
  const uri = isPhotoIcon(iconOrUri) ? photoIconUri(iconOrUri) : iconOrUri;
  const dir = FileSystem.documentDirectory;
  if (!dir || !uri.startsWith(dir) || !uri.slice(dir.length).startsWith('icon-')) return;
  FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

/**
 * Launch the gallery picker (square crop) and copy the pick into documents so
 * it survives tmp-cache purges. Returns the durable file uri (raw, WITHOUT the
 * "photo:" prefix — callers prefix as needed) or null when cancelled.
 * `prevUnsavedUri`: a photo picked earlier in the SAME form session that was
 * never saved — replaced files that ARE persisted must be cleaned up at save
 * time by the caller instead (the user may still cancel the form).
 */
export async function pickPhotoIconAsync(prevUnsavedUri?: string | null): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
  });
  if (res.canceled || !res.assets[0]) return null;
  let uri = res.assets[0].uri;
  try {
    if (FileSystem.documentDirectory) {
      const rawExt = (uri.split('.').pop() || 'jpg').toLowerCase();
      const ext = /^[a-z0-9]{1,5}$/.test(rawExt) ? rawExt : 'jpg';
      const dest = `${FileSystem.documentDirectory}icon-${Date.now()}.${ext}`;
      await FileSystem.copyAsync({ from: uri, to: dest });
      uri = dest;
    }
  } catch {
    // copy failed — fall back to the picker uri (works until iOS purges tmp)
  }
  if (prevUnsavedUri) deletePhotoIconFile(prevUnsavedUri);
  return uri;
}
//
// In dark mode the icon colour is lightened just enough to stay legible (fixed
// category colours like olive #4F5104 / deep #332D03 otherwise vanish on the dark
// surface). Pass adaptDark={false} to keep a colour verbatim (e.g. EmptyState,
// which intentionally renders a faint border-grey icon).
interface CategoryIconProps {
  icon?: string | null;
  size?: number;
  color?: string;
  style?: any;
  adaptDark?: boolean;
}

const CategoryIcon: React.FC<CategoryIconProps> = ({ icon, size = 22, color = '#000', style, adaptDark = true }) => {
  const isDark = useIsDark();
  const c = adaptDark && isDark ? ensureContrastOnDark(color) : color;
  // "photo:" MUST be checked before the lib-prefix split — a file uri contains "/".
  if (icon && isPhotoIcon(icon)) {
    // Circle-cropped photo, slightly larger than a glyph so it fills the icon
    // slot's surrounding well tastefully (glyphs sit in ~1.8× wells). The clip
    // lives on the Image itself (borderRadius) — no overflow on any shadowed
    // ancestor (seam rule).
    const d = Math.round(size * 1.4);
    return (
      <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
        <Image
          source={{ uri: photoIconUri(icon) }}
          style={{ width: d, height: d, borderRadius: d / 2 }}
          resizeMode="cover"
        />
      </View>
    );
  }
  if (icon && icon.includes('/')) {
    const [lib, name] = icon.split('/');
    if (lib === 'm') return <MaterialCommunityIcons name={name as any} size={size} color={c} style={style} />;
    if (lib === 'i') return <Ionicons name={name as any} size={size} color={c} style={style} />;
    if (lib === 'fa') return <FontAwesome5 name={name as any} size={size} color={c} style={style} />;
    if (lib === 'logo' && TYPE_LOGOS[name]) {
      // Brand-logo tile: white app-icon-style tile with the logo CONTAINed inside.
      // Wide wordmark logos (Tabung Haji 310×213, TnG+ 361×192) must never be
      // cover-cropped; jpg white backgrounds blend into the tile. Never tinted.
      return (
        <View style={[{ width: size, height: size, borderRadius: Math.round(size * 0.24), backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }, style]}>
          <Image source={TYPE_LOGOS[name]} style={{ width: Math.round(size * 0.86), height: Math.round(size * 0.86) }} resizeMode="contain" />
        </View>
      );
    }
  }
  return <Feather name={(icon || 'tag') as any} size={size} color={c} style={style} />;
};

export default React.memo(CategoryIcon);
