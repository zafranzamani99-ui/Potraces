// ─── FORMAT TOOLBAR ─────────────────────────────────────────────────────────
// iOS-Notes-style formatting bar pinned above the keyboard while the note body
// is focused. Block styles (Title / Heading / Body) + inline B / I / U / S.
// Purely presentational — the editor owns the selection + formatting state.

import React, { useMemo } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { CALM, SPACING, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useNeu } from '../common/neu';
import { lightTap } from '../../services/haptics';
import type { InlineAttr, BlockStyle } from '../../utils/richText';

interface Props {
  visible: boolean;
  active: Record<InlineAttr, boolean>;
  block: BlockStyle;
  onToggleInline: (attr: InlineAttr) => void;
  onSetBlock: (style: BlockStyle) => void;
  onDismiss: () => void;
}

const BLOCKS: { key: BlockStyle; icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }[] = [
  { key: 'title', icon: 'format-header-1', label: 'Title' },
  { key: 'heading', icon: 'format-header-2', label: 'Heading' },
  { key: 'body', icon: 'format-paragraph', label: 'Body' },
];

const INLINE: { key: InlineAttr; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { key: 'b', icon: 'format-bold' },
  { key: 'i', icon: 'format-italic' },
  { key: 'u', icon: 'format-underline' },
  { key: 's', icon: 'format-strikethrough-variant' },
];

// Expand the tap area so the compact buttons still clear the ~44pt touch target.
const HIT = { top: 6, bottom: 6, left: 3, right: 3 };

const FormatToolbar: React.FC<Props> = ({ visible, active, block, onToggleInline, onSetBlock, onDismiss }) => {
  const C = useCalm();
  const neu = useNeu(undefined, { faintDark: true });
  const styles = useMemo(() => makeStyles(C), [C]);
  if (!visible) return null;

  return (
    <KeyboardStickyView offset={{ opened: 0 }}>
      <View style={styles.bar}>
        {/* Block styles */}
        <View style={styles.group}>
          {BLOCKS.map((b) => {
            const on = block === b.key;
            return (
              <Pressable
                key={b.key}
                onPress={() => { lightTap(); onSetBlock(b.key); }}
                style={[styles.btn, neu.raised, on && styles.btnActive]}
                hitSlop={HIT}
                accessibilityRole="button"
                accessibilityLabel={b.label}
                accessibilityState={{ selected: on }}
              >
                <MaterialCommunityIcons name={b.icon} size={19} color={on ? C.onAccent : C.textSecondary} />
              </Pressable>
            );
          })}
        </View>

        {/* Inline formats */}
        <View style={styles.group}>
          {INLINE.map((it) => {
            const on = active[it.key];
            return (
              <Pressable
                key={it.key}
                onPress={() => { lightTap(); onToggleInline(it.key); }}
                style={[styles.btn, neu.raised, on && styles.btnActive]}
                hitSlop={HIT}
                accessibilityRole="button"
                accessibilityLabel={it.key === 'b' ? 'Bold' : it.key === 'i' ? 'Italic' : it.key === 'u' ? 'Underline' : 'Strikethrough'}
                accessibilityState={{ selected: on }}
              >
                <MaterialCommunityIcons name={it.icon} size={20} color={on ? C.onAccent : C.textSecondary} />
              </Pressable>
            );
          })}
        </View>

        {/* Dismiss keyboard */}
        <Pressable
          onPress={() => { lightTap(); onDismiss(); }}
          style={[styles.btn, neu.raised]}
          hitSlop={HIT}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Feather name="chevron-down" size={20} color={C.textSecondary} />
        </Pressable>
      </View>
    </KeyboardStickyView>
  );
};

export default FormatToolbar;

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    // Spread the three groups (blocks · inline · done) evenly across the bar so
    // the dismiss button isn't left floating alone on the right.
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: C.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: withAlpha(C.textPrimary, 0.08),
  },
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs + 1,
  },
  btn: {
    width: 42,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(C.textPrimary, 0.03),
  },
  btnActive: {
    backgroundColor: C.accent,
  },
});
