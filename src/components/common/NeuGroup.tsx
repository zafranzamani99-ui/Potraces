import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, LayoutChangeEvent } from 'react-native';
import { RADIUS } from '../../constants';
import { useNeu } from './neu';

/**
 * "Neu Card" for the Settings surfaces — the raised soft-UI group that replaces
 * the old flat, bordered <Card>. This is the surface half of "Neu by default":
 * separation comes from the neu shadow, not a border outline (Onyx rule 2).
 *
 * Follows the LOCKED seam rule: the neu shadow (spread from `neu.raisedSoft`)
 * lives on the OUTER view, which has a radius but NO overflow. An INNER `clip`
 * view carries `overflow:'hidden'` to round the grouped row dividers. A shadow
 * and a clip must NEVER share one view or the boxShadow shears into the "neu
 * onyx vertical error" on device. (Same split as TransactionItem's rowShadow +
 * MapPreviewCard's clip + CollectzJoin's listCard/listClip.)
 *
 * Rows/content self-pad (SettingRow already pads); this group adds none, so the
 * dividers run edge-to-edge and read as a proper grouped list.
 */
const NeuGroup: React.FC<{
  style?: StyleProp<ViewStyle>;
  onLayout?: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
}> = ({ style, onLayout, children }) => {
  const neu = useNeu(undefined, { faintDark: true });
  return (
    <View style={[styles.card, neu.raisedSoft, style]} onLayout={onLayout}>
      <View style={styles.clip}>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: { borderRadius: RADIUS.lg }, // radius + neu shadow (spread), NO overflow
  clip: { borderRadius: RADIUS.lg, overflow: 'hidden' },
});

export default React.memo(NeuGroup);
