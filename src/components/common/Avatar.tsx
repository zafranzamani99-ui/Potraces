/**
 * Avatar — the user's profile picture as a soft circle.
 *
 * Two layers:
 *  - AvatarView: presentational — pass uri / presetId / name explicitly. Use
 *    this for OTHER people's avatars (e.g. Collectz roster), where the data
 *    comes from the server, not the local store.
 *  - Avatar (default): connected — reads the local settings store for the
 *    device owner's avatar. Priority: provider photo (uri) → picked preset →
 *    name initial. Selection happens in AvatarPicker.
 */
import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useCalm } from '../../hooks/useCalm';
import { useSettingsStore } from '../../store/settingsStore';
import { presetAvatarById } from '../../constants/avatars';
import { withAlpha } from '../../constants';
import { useNeu } from './neu';

export interface AvatarViewProps {
  /** Remote photo URL (e.g. Google profile photo). Wins when present. */
  uri?: string | null;
  /** Bundled preset id (see constants/avatars.ts). */
  presetId?: string | null;
  /** Used for the initial-letter fallback. */
  name?: string;
  /** Custom background for the initial-letter circle (null = soft-accent default). */
  bg?: string | null;
  size?: number;
}

// White or near-black letter, whichever reads better on the chosen bg.
function letterInk(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  if (isNaN(n) || hex.replace('#', '').length !== 6) return '#FFFFFF';
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#1A1A1A' : '#FFFFFF';
}

export function AvatarView({ uri, presetId, name = '', bg = null, size = 36 }: AvatarViewProps) {
  const C = useCalm();
  const radius = size / 2;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: bg ?? C.border }}
      />
    );
  }

  const preset = presetAvatarById(presetId ?? null);
  if (preset) {
    // Transparent cutout over a colored circle: the user's custom bg wins,
    // else the preset's original DiceBear backdrop (default look unchanged).
    // Art is inset ~7% so the character doesn't touch the circle edge.
    const inset = Math.max(2, Math.round(size * 0.07));
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: bg ?? preset.bg,
          overflow: 'hidden',
          padding: inset,
        }}
      >
        <Image source={preset.source} style={{ width: '100%', height: '100%' }} />
      </View>
    );
  }

  const initial = (name.trim()[0] || '?').toUpperCase();
  const circleBg = bg ?? withAlpha(C.accent, 0.14);
  const ink = bg ? letterInk(bg) : C.accent;
  return (
    <View
      style={[
        styles.initialCircle,
        { width: size, height: size, borderRadius: radius, backgroundColor: circleBg },
      ]}
    >
      <Text style={{ fontSize: size * 0.44, fontWeight: '700', color: ink }}>{initial}</Text>
    </View>
  );
}

interface AvatarProps {
  size?: number;
  /** Float the avatar on a full-neu raised circle (the "Memoji tile" look).
   *  Full neu, not faintDark — a focal avatar LIFTS (locked focal-icon rule). */
  raised?: boolean;
}

/** Device owner's avatar — reads the settings store. See AvatarView for others. */
export default function Avatar({ size = 36, raised = false }: AvatarProps) {
  const C = useCalm();
  const neu = useNeu();
  const avatarId = useSettingsStore((s) => s.avatarId);
  const avatarUri = useSettingsStore((s) => s.avatarUri);
  const avatarBg = useSettingsStore((s) => s.avatarBg);
  const userName = useSettingsStore((s) => s.userName);
  const core = (
    <AvatarView uri={avatarUri} presetId={avatarId} name={userName} bg={avatarBg} size={size} />
  );
  if (!raised) return core;
  const pad = Math.max(5, Math.round(size * 0.16));
  const box = size + pad * 2;
  return (
    <View
      style={[
        {
          width: box,
          height: box,
          borderRadius: box / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: C.background,
        },
        neu.raised,
      ]}
    >
      {core}
    </View>
  );
}

const styles = StyleSheet.create({
  initialCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
