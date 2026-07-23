import React, { useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  Dimensions,
  Pressable,
} from 'react-native';
import DraggableFlatList, {
  ScaleDecorator,
  RenderItemParams,
} from 'react-native-draggable-flatlist';
import { KeyboardAvoidingView as KAView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import FloatingModal from '../common/FloatingModal';
import NeuButton from '../common/NeuButton';
import { newstOutline } from './NewstInput';
import { useNeu } from '../common/neu';
import { useStallStore } from '../../store/stallStore';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { lightTap } from '../../services/haptics';
import { useT } from '../../i18n';

/**
 * Stall-owned product-unit manager. Lists the stall's own `units` (separate from
 * seller's UnitManager) as neu (onyx) rows you can hold-and-drag to reorder, each
 * with a delete. "Add new unit" opens a small float sub-modal (via FloatingModal's
 * overlay slot — iOS can't stack two RN Modals) to type + save; on save the list
 * auto-scrolls to reveal the new unit. Opened from Business Settings → "Manage units".
 */
interface StallUnitManagerProps {
  visible: boolean;
  onClose: () => void;
}

const StallUnitManager: React.FC<StallUnitManagerProps> = ({ visible, onClose }) => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const neu = useNeu(undefined, { faintDark: true });
  const units = useStallStore((s) => s.units);
  const addUnit = useStallStore((s) => s.addUnit);
  const removeUnit = useStallStore((s) => s.removeUnit);
  const reorderUnits = useStallStore((s) => s.reorderUnits);

  const listRef = useRef<any>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [focused, setFocused] = useState(false);

  const handleDragEnd = useCallback(({ data }: { data: string[] }) => {
    lightTap();
    reorderUnits(data);
  }, [reorderUnits]);

  const openAdd = useCallback(() => {
    lightTap();
    setDraft('');
    setAddOpen(true);
  }, []);

  const closeAdd = useCallback(() => {
    Keyboard.dismiss();
    setAddOpen(false);
  }, []);

  const handleSaveNew = useCallback(() => {
    const clean = draft.trim();
    if (!clean) return;
    Keyboard.dismiss();
    addUnit(clean);
    setDraft('');
    setAddOpen(false);
    // New units append to the end — reveal the freshly added one.
    setTimeout(() => {
      try { listRef.current?.scrollToEnd?.({ animated: true }); } catch { /* no-op */ }
    }, 350);
  }, [draft, addUnit]);

  const renderUnit = useCallback(({ item, drag, isActive }: RenderItemParams<string>) => (
    <ScaleDecorator>
      {/* Neu (onyx) row — single view, NO overflow here. The seam is avoided by
          bleeding the list viewport (styles.listBleed) so the boxShadow isn't
          clipped by the scroll bounds. Spread neu FIRST, then the drag tint LAST. */}
      <TouchableOpacity
        style={[styles.row, neu.raised, isActive && styles.rowDragging]}
        onLongPress={drag}
        delayLongPress={150}
        disabled={isActive}
        activeOpacity={0.8}
        accessibilityLabel={item}
        accessibilityHint={t.stall.reorderHint}
      >
        <View style={styles.rowIcon}>
          <Feather name="box" size={16} color={C.bronze} />
        </View>
        <Text style={styles.rowText}>{item}</Text>
        <Feather name="menu" size={16} color={isActive ? C.bronze : C.neutral} />
        <TouchableOpacity
          onPress={() => removeUnit(item)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`${t.common.close} ${item}`}
        >
          <Feather name="x" size={16} color={C.neutral} />
        </TouchableOpacity>
      </TouchableOpacity>
    </ScaleDecorator>
  ), [styles, neu, C, t, removeUnit]);

  return (
    <FloatingModal
      visible={visible}
      onClose={onClose}
      entrance="fade"
      showDragHandle={false}
      maxWidth={360}
      overlay={addOpen ? (
        // "Add new unit" sub-modal — lives in THIS FloatingModal's overlay slot so
        // it's one RN Modal (iOS won't show a second stacked Modal). Tap the dim to
        // cancel; the card absorbs taps. Sits high so the keyboard never covers it.
        <Pressable
          style={styles.addOverlay}
          onPress={closeAdd}
          accessibilityRole="button"
          accessibilityLabel={t.common.close}
        >
          {/* KAView centres the card in the space above the keyboard (behavior
              'padding' reserves the keyboard height), so it's neither pinned high
              nor hidden. box-none lets dim-taps fall through to close. */}
          <KAView behavior="padding" style={styles.addKav} pointerEvents="box-none">
            <Pressable style={[styles.addCard, neu.raisedModal]} onStartShouldSetResponder={() => true}>
              <View style={styles.addHeader}>
                <Text style={styles.addTitle}>{t.stall.newUnitTitle}</Text>
                <TouchableOpacity
                  onPress={closeAdd}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel={t.common.close}
                >
                  <Feather name="x" size={20} color={C.textSecondary} />
                </TouchableOpacity>
              </View>
              <TextInput
                style={[styles.input, newstOutline(C, focused), styles.inputFill]}
                value={draft}
                onChangeText={setDraft}
                placeholder={t.stall.addUnitPlaceholder}
                placeholderTextColor={C.neutral}
                autoFocus
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleSaveNew}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={withAlpha(C.textPrimary, 0.2)}
              />
              <NeuButton
                icon="check"
                label={t.stall.saveUnit}
                onPress={handleSaveNew}
                color={C.bronze}
                style={styles.saveBtn}
              />
            </Pressable>
          </KAView>
        </Pressable>
      ) : null}
    >
      <View style={styles.body}>
        <View style={styles.header}>
          <Text style={styles.title}>{t.stall.manageUnitsTitle}</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={t.common.close}
          >
            <Feather name="x" size={20} color={C.textSecondary} />
          </TouchableOpacity>
        </View>

        {units.length > 1 && (
          <Text style={styles.dragHint}>{t.stall.reorderHint}</Text>
        )}

        {/* FloatingModal already provides a GestureHandlerRootView (inside the Modal
            window); rely on that ancestor. listBleed widens the FlatList past the rows
            so its scroll clip can't shear the neu boxShadow (the onyx seam rule,
            Shape-3: flush-to-scroll rows). */}
        <View style={styles.listWrap}>
          <DraggableFlatList
            ref={listRef}
            data={units}
            keyExtractor={(u) => u}
            renderItem={renderUnit}
            onDragEnd={handleDragEnd}
            showsVerticalScrollIndicator={false}
            style={styles.listBleed}
            contentContainerStyle={styles.list}
            activationDistance={8}
            ListFooterComponent={
              <TouchableOpacity
                style={styles.addNewRow}
                onPress={openAdd}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t.stall.addNewUnit}
              >
                <Feather name="plus" size={16} color={C.bronze} />
                <Text style={styles.addNewText}>{t.stall.addNewUnit}</Text>
              </TouchableOpacity>
            }
          />
        </View>
      </View>
    </FloatingModal>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    body: {
      padding: SPACING.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    title: {
      fontSize: TYPOGRAPHY.size.lg,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
    },
    dragHint: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.neutral,
      textAlign: 'center',
      marginBottom: SPACING.sm,
    },
    listWrap: {
      maxHeight: Dimensions.get('window').height * 0.42,
    },
    // Bleed the FlatList out to the card edges so its scroll clip sits OUTSIDE the
    // row shadows; the content padding puts the rows back where they belong.
    listBleed: {
      marginHorizontal: -SPACING.lg,
    },
    list: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.xs,
      paddingBottom: SPACING.xs,
    },
    // Neu row — C.background surface comes from the neu fragment; no bg/overflow here.
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.md,
      paddingVertical: SPACING.md,
      paddingHorizontal: SPACING.md,
      borderRadius: RADIUS.lg,
      minHeight: 48,
      marginBottom: SPACING.sm,
    },
    rowDragging: {
      backgroundColor: withAlpha(C.bronze, 0.06),
    },
    rowIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: withAlpha(C.bronze, 0.08),
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowText: {
      flex: 1,
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.medium,
      color: C.textPrimary,
    },
    // "add new unit" footer — dashed bronze affordance below the last unit.
    addNewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.md,
      marginTop: SPACING.xs,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: withAlpha(C.bronze, 0.4),
      minHeight: 48,
    },
    addNewText: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.bronze,
    },

    // ─── Add-unit sub-modal (FloatingModal overlay slot) ────────
    addOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    addKav: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: SPACING.xl,
    },
    addCard: {
      width: '100%',
      maxWidth: 320,
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
      // Onyx dialog: neu.raisedModal (spread at the call site) supplies the
      // C.background surface + a single soft neutral drop (no halo on the scrim);
      // border per the floating-modal-outline rule.
      borderWidth: 1,
      borderColor: withAlpha(C.textPrimary, 0.12),
    },
    addHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACING.md,
    },
    addTitle: {
      fontSize: TYPOGRAPHY.size.lg,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.textPrimary,
    },
    input: {
      minHeight: 52,
      paddingHorizontal: SPACING.lg,
      fontSize: 16,
      color: C.textPrimary,
    },
    // Solid fill so the field reads clearly (newstOutline sets bg transparent).
    inputFill: {
      backgroundColor: withAlpha(C.textPrimary, 0.04),
    },
    saveBtn: {
      marginTop: SPACING.md,
    },
  });

export default StallUnitManager;
