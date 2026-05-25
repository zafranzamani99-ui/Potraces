import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { lightTap } from '../../services/haptics';

interface ImageSourcePillsProps {
  onPick: (source: 'camera' | 'gallery') => void;
  cameraLabel: string;
  galleryLabel: string;
  loading?: boolean;
  loadingLabel?: string;
  disabled?: boolean;
}

/**
 * Shared camera/gallery source pills — the canonical "snap or pick" affordance.
 * Used by seller Products bulk import and CostManagement receipt scan.
 */
const ImageSourcePills: React.FC<ImageSourcePillsProps> = ({
  onPick,
  cameraLabel,
  galleryLabel,
  loading = false,
  loadingLabel,
  disabled = false,
}) => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);

  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color={C.bronze} />
        {loadingLabel ? <Text style={styles.pillText}>{loadingLabel}</Text> : null}
      </View>
    );
  }

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.pill, pressed && { opacity: 0.7 }]}
        onPress={() => { lightTap(); onPick('camera'); }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={cameraLabel}
      >
        <Feather name="camera" size={14} color={C.bronze} />
        <Text style={styles.pillText}>{cameraLabel}</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.pill, pressed && { opacity: 0.7 }]}
        onPress={() => { lightTap(); onPick('gallery'); }}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={galleryLabel}
      >
        <Feather name="image" size={14} color={C.bronze} />
        <Text style={styles.pillText}>{galleryLabel}</Text>
      </Pressable>
    </>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    backgroundColor: withAlpha(C.bronze, 0.08),
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: withAlpha(C.bronze, 0.15),
  },
  pillText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.bronze,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 6,
  },
});

export default ImageSourcePills;
