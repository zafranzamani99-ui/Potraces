/**
 * AvatarPicker — bottom sheet with the bundled preset avatars in a grid
 * (Google-account-style picker). Selecting a preset is an explicit user
 * choice, so it overrides the provider photo (clears avatarUri); the next
 * Google sign-in re-syncs the photo. Also offers "use initial" (clear both).
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import BottomSheet from './BottomSheet';
import Avatar from './Avatar';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useSettingsStore } from '../../store/settingsStore';
import { uploadAvatarPhoto } from '../../services/profileSync';
import { getAuthSession, supabasePersonal } from '../../services/supabase';
import { PRESET_AVATARS } from '../../constants/avatars';
import { SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../constants';
import { lightTap } from '../../services/haptics';

interface AvatarPickerProps {
  visible: boolean;
  onClose: () => void;
}

const TILE = 64;

// Avatar backdrop choices — deliberately bright & cheerful (CALM palette rules
// waived here per design decision): avatar personalization should feel playful,
// and the muddy olive/bronze tones read as black blobs in dark mode.
const BG_OPTIONS = [
  '#FF6B6B', // coral
  '#FFA94D', // orange
  '#FFD43B', // amber
  '#A9E34B', // lime
  '#69DB7C', // green
  '#38D9A9', // teal
  '#4DABF7', // sky
  '#748FFC', // indigo
  '#B197FC', // violet
  '#F783AC', // pink
];

export default function AvatarPicker({ visible, onClose }: AvatarPickerProps) {
  const C = useCalm();
  const t = useT();
  const avatarId = useSettingsStore((s) => s.avatarId);
  const avatarUri = useSettingsStore((s) => s.avatarUri);
  const avatarBg = useSettingsStore((s) => s.avatarBg);
  const setAvatarId = useSettingsStore((s) => s.setAvatarId);
  const setAvatarUri = useSettingsStore((s) => s.setAvatarUri);
  const setAvatarBg = useSettingsStore((s) => s.setAvatarBg);

  // Google/provider profile photo — read from the CACHED auth session, not from
  // avatarUri. Picking a preset clears avatarUri, which used to make the Google
  // photo vanish from this grid until the next sign-in; the session still has
  // it, so the tile stays offered whenever the user is signed in with a photo.
  const [providerUrl, setProviderUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    getAuthSession(supabasePersonal)
      .then((s) => {
        const url = (s?.user as { user_metadata?: { avatar_url?: unknown } } | null)?.user_metadata?.avatar_url;
        setProviderUrl(typeof url === 'string' && url ? url : null);
      })
      .catch(() => setProviderUrl(null));
  }, [visible]);

  const pickBg = (color: string | null) => {
    lightTap();
    setAvatarBg(color);
  };

  const pick = (id: string) => {
    lightTap();
    setAvatarId(id);
    setAvatarUri(null); // explicit pick overrides the provider photo
    onClose();
  };

  const useInitial = () => {
    lightTap();
    setAvatarId(null);
    setAvatarUri(null);
    onClose();
  };

  const useProviderPhoto = () => {
    lightTap();
    // Restore the provider photo even after a preset pick cleared avatarUri.
    if (providerUrl) setAvatarUri(providerUrl);
    setAvatarId(null); // avatarUri wins while present — see Avatar.tsx
    onClose();
  };

  // Own photo (e.g. a saved Memoji sticker — transparent PNG sits on the colored
  // circle like a preset). No editing crop: iOS's editor flattens transparency.
  // The picked file is copied out of the picker's tmp cache into documents so it
  // survives; the previous local avatar file is cleaned up best-effort.
  // NOTE: local photo avatars stay on THIS device — profileSync deliberately
  // never pushes file:// paths to other people's rosters (they'd be dead links).
  const pickPhoto = async () => {
    lightTap();
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (res.canceled || !res.assets[0]) return;
    let uri = res.assets[0].uri;
    try {
      if (FileSystem.documentDirectory) {
        const ext = (uri.split('.').pop() || 'png').toLowerCase();
        const dest = `${FileSystem.documentDirectory}avatar-${Date.now()}.${ext}`;
        const prev = useSettingsStore.getState().avatarUri;
        if (prev && prev.startsWith(FileSystem.documentDirectory)) {
          FileSystem.deleteAsync(prev, { idempotent: true }).catch(() => {});
        }
        await FileSystem.copyAsync({ from: uri, to: dest });
        uri = dest;
      }
    } catch {
      // copy failed — fall back to the picker uri (works until iOS purges tmp)
    }
    setAvatarUri(uri);
    setAvatarId(null);
    onClose();
    // Background publish: upload to the public avatars bucket so OTHER users'
    // rosters render it too. On success swap to the https URL (profileSync
    // syncs it) and drop the now-redundant local copy. Offline / failure →
    // the avatar stays device-local and others see the preset/initial fallback.
    uploadAvatarPhoto(uri).then((publicUrl) => {
      if (!publicUrl) return;
      const s = useSettingsStore.getState();
      if (s.avatarUri !== uri) return; // user re-picked meanwhile — don't clobber
      s.setAvatarUri(publicUrl);
      if (FileSystem.documentDirectory && uri.startsWith(FileSystem.documentDirectory)) {
        FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      }
    }).catch(() => {});
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      maxHeightPct={0.72}
      header={
        <Text style={[styles.title, { color: C.textPrimary }]}>{t.settings.avatarTitle}</Text>
      }
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Background color — applies to the monogram AND the preset cutouts
            (transparent PNGs over a colored circle); the grid recolors live. */}
        <Text style={[styles.sectionLabel, { color: C.textMuted }]}>
          {t.settings.avatarBackground}
        </Text>
        <View style={styles.swatchRow}>
          <Pressable onPress={() => pickBg(null)} style={styles.swatch} accessibilityRole="button">
            <View style={[styles.swatchCircle, { backgroundColor: withAlpha(C.accent, 0.14) }]}>
              {avatarBg === null && <Feather name="check" size={14} color={C.accent} />}
            </View>
          </Pressable>
          {BG_OPTIONS.map((color) => (
            <Pressable
              key={color}
              onPress={() => pickBg(color)}
              style={styles.swatch}
              accessibilityRole="button"
            >
              <View style={[styles.swatchCircle, { backgroundColor: color }]}>
                {avatarBg === color && <Feather name="check" size={14} color="#fff" />}
              </View>
            </Pressable>
          ))}
        </View>
        <View style={styles.grid}>
          {/* Google/provider photo — ALWAYS offered while signed in with one
              (driven by the session, so it survives preset picks). */}
          {providerUrl ? (
            <Pressable style={styles.tile} onPress={useProviderPhoto} accessibilityRole="button">
              <Image source={{ uri: providerUrl }} style={styles.tileImage} />
              {!avatarId && avatarUri === providerUrl && (
                <View style={[styles.check, { backgroundColor: C.accent }]}>
                  <Feather name="check" size={12} color="#fff" />
                </View>
              )}
            </Pressable>
          ) : null}

          {/* The user's own uploaded photo (Memoji/photo), when it isn't the
              provider photo — kept selectable alongside it. */}
          {avatarUri && avatarUri !== providerUrl ? (
            <Pressable
              style={styles.tile}
              onPress={() => { lightTap(); setAvatarId(null); onClose(); }}
              accessibilityRole="button"
            >
              <Image source={{ uri: avatarUri }} style={styles.tileImage} />
              {!avatarId && (
                <View style={[styles.check, { backgroundColor: C.accent }]}>
                  <Feather name="check" size={12} color="#fff" />
                </View>
              )}
            </Pressable>
          ) : null}

          {/* Own photo / Memoji import */}
          <Pressable
            style={styles.tile}
            onPress={pickPhoto}
            accessibilityRole="button"
            accessibilityLabel={t.settings.avatarFromPhotos}
          >
            <View
              style={[
                styles.tileImage,
                styles.initialTile,
                { backgroundColor: withAlpha(C.accent, 0.14) },
              ]}
            >
              <Feather name="image" size={22} color={C.accent} />
            </View>
          </Pressable>

          {/* Initial-letter option */}
          <Pressable style={styles.tile} onPress={useInitial} accessibilityRole="button">
            <View
              style={[
                styles.tileImage,
                styles.initialTile,
                { backgroundColor: withAlpha(C.accent, 0.14) },
              ]}
            >
              <Avatar size={TILE - 16} />
            </View>
            {!avatarId && !avatarUri && (
              <View style={[styles.check, { backgroundColor: C.accent }]}>
                <Feather name="check" size={12} color="#fff" />
              </View>
            )}
          </Pressable>

          {/* Bundled presets — transparent cutouts; show the chosen bg (or each
              preset's original backdrop when no custom color is picked). The art
              is inset so the character doesn't touch the colored circle edge. */}
          {PRESET_AVATARS.map((a) => (
            <Pressable
              key={a.id}
              style={styles.tile}
              onPress={() => pick(a.id)}
              accessibilityRole="button"
            >
              <View
                style={[styles.tileImage, styles.tilePad, { backgroundColor: avatarBg ?? a.bg }]}
              >
                <Image source={a.source} style={styles.tileArt} />
              </View>
              {avatarId === a.id && !avatarUri && (
                <View style={[styles.check, { backgroundColor: C.accent }]}>
                  <Feather name="check" size={12} color="#fff" />
                </View>
              )}
            </Pressable>
          ))}
        </View>
        <Text style={[styles.credit, { color: C.textMuted }]}>{t.settings.avatarMemojiTip}</Text>
        <Text style={[styles.credit, { color: C.textMuted }]}>{t.settings.avatarCredit}</Text>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: TYPOGRAPHY.weight.semibold,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
  },
  swatch: { padding: 2 },
  swatchCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tile: {
    width: TILE,
    height: TILE,
    margin: SPACING.xs,
  },
  tileImage: {
    width: TILE,
    height: TILE,
    borderRadius: TILE / 2,
  },
  // Colored circle with breathing room: the art sits ~7% in from the edge.
  tilePad: { padding: 5, overflow: 'hidden' },
  tileArt: { width: '100%', height: '100%' },
  initialTile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  credit: {
    fontSize: TYPOGRAPHY.size.xs,
    textAlign: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
  },
});
