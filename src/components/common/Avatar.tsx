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

export interface AvatarViewProps {
  /** Remote photo URL (e.g. Google profile photo). Wins when present. */
  uri?: string | null;
  /** Bundled preset id (see constants/avatars.ts). */
  presetId?: string | null;
  /** Used for the initial-letter fallback. */
  name?: string;
  size?: number;
}

export function AvatarView({ uri, presetId, name = '', size = 36 }: AvatarViewProps) {
  const C = useCalm();
  const radius = size / 2;

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: C.border }}
      />
    );
  }

  const preset = presetAvatarById(presetId ?? null);
  if (preset) {
    return (
      <Image
        source={preset.source}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }

  const initial = (name.trim()[0] || '?').toUpperCase();
  return (
    <View
      style={[
        styles.initialCircle,
        { width: size, height: size, borderRadius: radius, backgroundColor: withAlpha(C.accent, 0.14) },
      ]}
    >
      <Text style={{ fontSize: size * 0.44, fontWeight: '700', color: C.accent }}>
        {initial}
      </Text>
    </View>
  );
}

interface AvatarProps {
  size?: number;
}

/** Device owner's avatar — reads the settings store. See AvatarView for others. */
export default function Avatar({ size = 36 }: AvatarProps) {
  const avatarId = useSettingsStore((s) => s.avatarId);
  const avatarUri = useSettingsStore((s) => s.avatarUri);
  const userName = useSettingsStore((s) => s.userName);
  return <AvatarView uri={avatarUri} presetId={avatarId} name={userName} size={size} />;
}

const styles = StyleSheet.create({
  initialCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
