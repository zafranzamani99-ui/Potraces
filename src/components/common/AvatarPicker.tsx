/**
 * AvatarPicker — bottom sheet with the bundled preset avatars in a grid
 * (Google-account-style picker). Selecting a preset is an explicit user
 * choice, so it overrides the provider photo (clears avatarUri); the next
 * Google sign-in re-syncs the photo. Also offers "use initial" (clear both).
 */
import React from 'react';
import { View, Text, Image, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import BottomSheet from './BottomSheet';
import Avatar from './Avatar';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useSettingsStore } from '../../store/settingsStore';
import { PRESET_AVATARS } from '../../constants/avatars';
import { SPACING, RADIUS, TYPOGRAPHY, withAlpha } from '../../constants';
import { lightTap } from '../../services/haptics';

interface AvatarPickerProps {
  visible: boolean;
  onClose: () => void;
}

const TILE = 64;

export default function AvatarPicker({ visible, onClose }: AvatarPickerProps) {
  const C = useCalm();
  const t = useT();
  const avatarId = useSettingsStore((s) => s.avatarId);
  const avatarUri = useSettingsStore((s) => s.avatarUri);
  const setAvatarId = useSettingsStore((s) => s.setAvatarId);
  const setAvatarUri = useSettingsStore((s) => s.setAvatarUri);

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
    setAvatarId(null); // avatarUri wins while present — see Avatar.tsx
    onClose();
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
        <View style={styles.grid}>
          {/* Provider photo first when available — "it stays" unless a preset wins */}
          {avatarUri ? (
            <Pressable style={styles.tile} onPress={useProviderPhoto} accessibilityRole="button">
              <Image source={{ uri: avatarUri }} style={styles.tileImage} />
              {!avatarId && (
                <View style={[styles.check, { backgroundColor: C.accent }]}>
                  <Feather name="check" size={12} color="#fff" />
                </View>
              )}
            </Pressable>
          ) : null}

          {/* Initial-letter option */}
          <Pressable style={styles.tile} onPress={useInitial} accessibilityRole="button">
            <View style={[styles.tileImage, styles.initialTile, { backgroundColor: withAlpha(C.accent, 0.14) }]}>
              <Avatar size={TILE - 16} />
            </View>
            {!avatarId && !avatarUri && (
              <View style={[styles.check, { backgroundColor: C.accent }]}>
                <Feather name="check" size={12} color="#fff" />
              </View>
            )}
          </Pressable>

          {/* Bundled presets */}
          {PRESET_AVATARS.map((a) => (
            <Pressable key={a.id} style={styles.tile} onPress={() => pick(a.id)} accessibilityRole="button">
              <Image source={a.source} style={styles.tileImage} />
              {avatarId === a.id && !avatarUri && (
                <View style={[styles.check, { backgroundColor: C.accent }]}>
                  <Feather name="check" size={12} color="#fff" />
                </View>
              )}
            </Pressable>
          ))}
        </View>
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
