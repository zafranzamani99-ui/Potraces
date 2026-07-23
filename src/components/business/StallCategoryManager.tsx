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
import { StallCategory } from '../../types';

// Curated Feather icons offered when creating a category.
const CATEGORY_ICONS: (keyof typeof Feather.glyphMap)[] = [
  'coffee', 'shopping-bag', 'gift', 'box', 'package',
  'droplet', 'sun', 'star', 'tag', 'heart', 'zap', 'smile',
];

/**
 * Stall-owned product-category manager — the icon-carrying twin of StallUnitManager.
 * Lists `categories` (name + Feather icon) as neu (onyx) rows you hold-and-drag to
 * reorder, each with a delete. "Add new category" opens a small float sub-modal (via
 * FloatingModal's overlay slot) to type a name + pick an icon, then save; on save the
 * list auto-scrolls to reveal it. Opened from Business Settings → "Manage categories".
 */
interface StallCategoryManagerProps {
  visible: boolean;
  onClose: () => void;
}

const StallCategoryManager: React.FC<StallCategoryManagerProps> = ({ visible, onClose }) => {
  const C = useCalm();
  const isDark = useIsDark();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
  const neu = useNeu(undefined, { faintDark: true });
  const categories = useStallStore((s) => s.categories);
  const addCategory = useStallStore((s) => s.addCategory);
  const removeCategory = useStallStore((s) => s.removeCategory);
  const reorderCategories = useStallStore((s) => s.reorderCategories);

  const listRef = useRef<any>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [iconDraft, setIconDraft] = useState<keyof typeof Feather.glyphMap>(CATEGORY_ICONS[0]);
  const [focused, setFocused] = useState(false);

  const handleDragEnd = useCallback(({ data }: { data: StallCategory[] }) => {
    lightTap();
    reorderCategories(data);
  }, [reorderCategories]);

  const openAdd = useCallback(() => {
    lightTap();
    setDraft('');
    setIconDraft(CATEGORY_ICONS[0]);
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
    addCategory(clean, iconDraft);
    setDraft('');
    setAddOpen(false);
    // New categories append to the end — reveal the freshly added one.
    setTimeout(() => {
      try { listRef.current?.scrollToEnd?.({ animated: true }); } catch { /* no-op */ }
    }, 350);
  }, [draft, iconDraft, addCategory]);

  const renderCategory = useCallback(({ item, drag, isActive }: RenderItemParams<StallCategory>) => (
    <ScaleDecorator>
      {/* Neu (onyx) row; seam avoided by bleeding the list viewport (styles.listBleed).
          Spread neu FIRST, then the drag tint LAST. */}
      <TouchableOpacity
        style={[styles.row, neu.raised, isActive && styles.rowDragging]}
        onLongPress={drag}
        delayLongPress={150}
        disabled={isActive}
        activeOpacity={0.8}
        accessibilityLabel={item.name}
        accessibilityHint={t.stall.reorderHint}
      >
        <View style={styles.rowIcon}>
          <Feather name={item.icon as keyof typeof Feather.glyphMap} size={16} color={C.bronze} />
        </View>
        <Text style={styles.rowText}>{item.name}</Text>
        <Feather name="menu" size={16} color={isActive ? C.bronze : C.neutral} />
        <TouchableOpacity
          onPress={() => removeCategory(item.name)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`${t.common.close} ${item.name}`}
        >
          <Feather name="x" size={16} color={C.neutral} />
        </TouchableOpacity>
      </TouchableOpacity>
    </ScaleDecorator>
  ), [styles, neu, C, t, removeCategory]);

  return (
    <FloatingModal
      visible={visible}
      onClose={onClose}
      entrance="fade"
      showDragHandle={false}
      maxWidth={360}
      overlay={addOpen ? (
        // "Add new category" sub-modal — in THIS FloatingModal's overlay slot (iOS
        // won't show a second stacked Modal). Tap the dim to cancel; card absorbs taps.
        <Pressable
          style={styles.addOverlay}
          onPress={closeAdd}
          accessibilityRole="button"
          accessibilityLabel={t.common.close}
        >
          <KAView behavior="padding" style={styles.addKav} pointerEvents="box-none">
            <Pressable style={[styles.addCard, neu.raisedModal]} onStartShouldSetResponder={() => true}>
              <View style={styles.addHeader}>
                <Text style={styles.addTitle}>{t.stall.newCategoryTitle}</Text>
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
                placeholder={t.stall.addCategoryPlaceholder}
                placeholderTextColor={C.neutral}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSaveNew}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={withAlpha(C.textPrimary, 0.2)}
              />
              {/* Icon picker — selection GRID (Onyx-exempt: flat cells, bronze fill when picked) */}
              <Text style={styles.pickIconLabel}>{t.stall.pickIcon}</Text>
              <View style={styles.iconGrid}>
                {CATEGORY_ICONS.map((ic) => {
                  const sel = iconDraft === ic;
                  return (
                    <TouchableOpacity
                      key={ic}
                      style={[styles.iconTile, sel && styles.iconTileSel]}
                      onPress={() => { lightTap(); setIconDraft(ic); }}
                      accessibilityRole="button"
                      accessibilityState={{ selected: sel }}
                      accessibilityLabel={ic}
                    >
                      <Feather name={ic} size={18} color={sel ? C.onAccent : C.bronze} />
                    </TouchableOpacity>
                  );
                })}
              </View>
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
          <Text style={styles.title}>{t.stall.manageCategoriesTitle}</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={t.common.close}
          >
            <Feather name="x" size={20} color={C.textSecondary} />
          </TouchableOpacity>
        </View>

        {categories.length > 1 && (
          <Text style={styles.dragHint}>{t.stall.reorderHint}</Text>
        )}

        <View style={styles.listWrap}>
          <DraggableFlatList
            ref={listRef}
            data={categories}
            keyExtractor={(c) => c.name}
            renderItem={renderCategory}
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
                accessibilityLabel={t.stall.addNewCategory}
              >
                <Feather name="plus" size={16} color={C.bronze} />
                <Text style={styles.addNewText}>{t.stall.addNewCategory}</Text>
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
    listBleed: {
      marginHorizontal: -SPACING.lg,
    },
    list: {
      paddingHorizontal: SPACING.lg,
      paddingTop: SPACING.xs,
      paddingBottom: SPACING.xs,
    },
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

    // ─── Add-category sub-modal (FloatingModal overlay slot) ────
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
      maxWidth: 340,
      borderRadius: RADIUS.xl,
      padding: SPACING.lg,
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
    inputFill: {
      backgroundColor: withAlpha(C.textPrimary, 0.04),
    },
    pickIconLabel: {
      fontSize: TYPOGRAPHY.size.xs,
      color: C.textMuted,
      marginTop: SPACING.md,
      marginBottom: SPACING.sm,
      letterSpacing: 0.4,
    },
    iconGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACING.sm,
    },
    iconTile: {
      width: 44,
      height: 44,
      borderRadius: RADIUS.md,
      backgroundColor: withAlpha(C.textPrimary, 0.04),
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconTileSel: {
      backgroundColor: C.bronze,
    },
    saveBtn: {
      marginTop: SPACING.lg,
    },
  });

export default StallCategoryManager;
