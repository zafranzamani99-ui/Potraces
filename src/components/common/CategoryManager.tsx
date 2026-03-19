import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  Keyboard,
  Dimensions,
} from 'react-native';
import DraggableFlatList, {
  ScaleDecorator,
  RenderItemParams,
} from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useCategoryStore } from '../../store/categoryStore';
import { useCategories } from '../../hooks/useCategories';
import { CategoryOption } from '../../types';
import { lightTap } from '../../services/haptics';
import { useToast } from '../../context/ToastContext';

const ICON_OPTIONS: string[] = [
  'coffee', 'truck', 'shopping-bag', 'film', 'file-text', 'heart',
  'book', 'users', 'repeat', 'dollar-sign', 'briefcase', 'trending-up',
  'pie-chart', 'gift', 'home', 'wifi', 'phone', 'music',
  'camera', 'map-pin', 'scissors', 'tool', 'umbrella', 'globe',
  'star', 'zap', 'feather', 'award', 'tag', 'package',
];

const COLOR_OPTIONS: string[] = [
  '#4F5104', '#5E72E4', '#DEAB22', '#A06CD5', '#6BA3BE',
  '#B2780A', '#C4956A', '#7C5CFC', '#332D03', '#B8AFBC',
];

interface CategoryManagerProps {
  visible: boolean;
  onClose: () => void;
  type: 'expense' | 'income' | 'investment';
  mode?: 'personal' | 'business';
}

const CategoryManager: React.FC<CategoryManagerProps> = ({
  visible,
  onClose,
  type,
  mode,
}) => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { showToast } = useToast();
  const categories = useCategories(type, mode);
  const { updateCategoryOverride, addCustomCategory, deleteCustomCategory, setCategoryOrder } =
    useCategoryStore();

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryOption | null>(null);
  const [isNewCategory, setIsNewCategory] = useState(false);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [editColor, setEditColor] = useState('');

  const isCustom = (id: string) => id.startsWith('custom_');

  const openEdit = useCallback((category: CategoryOption) => {
    lightTap();
    setEditingCategory(category);
    setIsNewCategory(false);
    setEditName(category.name);
    setEditIcon(category.icon);
    setEditColor(category.color);
    setEditModalVisible(true);
  }, []);

  const openNew = useCallback(() => {
    lightTap();
    setEditingCategory(null);
    setIsNewCategory(true);
    setEditName('');
    setEditIcon('tag');
    setEditColor(COLOR_OPTIONS[0]);
    setEditModalVisible(true);
  }, []);

  const handleSave = useCallback(() => {
    Keyboard.dismiss();
    const trimmedName = editName.trim();
    if (!trimmedName) {
      showToast('Category name is required', 'error');
      return;
    }

    if (isNewCategory) {
      addCustomCategory(type, {
        name: trimmedName,
        icon: editIcon,
        color: editColor,
      }, mode);
      showToast('Category added', 'success');
    } else if (editingCategory) {
      if (isCustom(editingCategory.id)) {
        deleteCustomCategory(type, editingCategory.id, mode);
        addCustomCategory(type, {
          name: trimmedName,
          icon: editIcon,
          color: editColor,
        }, mode);
      } else {
        updateCategoryOverride(type, editingCategory.id, {
          name: trimmedName,
          icon: editIcon,
        }, mode);
      }
      showToast('Category updated', 'success');
    }

    setEditModalVisible(false);
  }, [editName, isNewCategory, editIcon, editColor, editingCategory, type, mode, addCustomCategory, deleteCustomCategory, updateCategoryOverride, showToast]);

  const handleDelete = useCallback(() => {
    if (!editingCategory || !isCustom(editingCategory.id)) return;

    Alert.alert('Delete Category', `Delete "${editingCategory.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteCustomCategory(type, editingCategory.id, mode);
          setEditModalVisible(false);
          showToast('Category deleted', 'success');
        },
      },
    ]);
  }, [editingCategory, type, mode, deleteCustomCategory, showToast]);

  const handleDragEnd = useCallback(({ data }: { data: CategoryOption[] }) => {
    lightTap();
    setCategoryOrder(type, data.map((c) => c.id), mode);
  }, [type, mode, setCategoryOrder]);

  const renderCategory = useCallback(({ item, drag, isActive }: RenderItemParams<CategoryOption>) => (
    <ScaleDecorator>
      <TouchableOpacity
        style={[
          styles.categoryRow,
          isActive && styles.categoryRowDragging,
        ]}
        onPress={() => openEdit(item)}
        onLongPress={drag}
        delayLongPress={150}
        activeOpacity={0.6}
      >
        <View
          style={[
            styles.categoryIcon,
            { backgroundColor: withAlpha(item.color, 0.15) },
          ]}
        >
          <Feather
            name={item.icon as keyof typeof Feather.glyphMap}
            size={20}
            color={item.color}
          />
        </View>
        <View style={styles.categoryInfo}>
          <Text style={styles.categoryName}>{item.name}</Text>
          {isCustom(item.id) && (
            <Text style={styles.customBadge}>Custom</Text>
          )}
        </View>
        <Feather name="menu" size={18} color={isActive ? C.accent : C.neutral} />
      </TouchableOpacity>
    </ScaleDecorator>
  ), [styles, C, openEdit]);

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.modal} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title}>
              {type === 'expense' ? 'Expense' : type === 'income' ? 'Income' : 'Investment'} Categories
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={22} color={C.textPrimary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.dragHint}>Hold & drag to reorder</Text>

          <GestureHandlerRootView style={{ maxHeight: Dimensions.get('window').height * 0.45 }}>
            <DraggableFlatList
              data={categories}
              keyExtractor={(item) => item.id}
              renderItem={renderCategory}
              onDragEnd={handleDragEnd}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              activationDistance={5}
            />
          </GestureHandlerRootView>

          <TouchableOpacity style={styles.addButton} onPress={openNew}>
            <Feather name="plus" size={18} color={C.accent} />
            <Text style={styles.addButtonText}>Add Custom Category</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {/* Edit / Add Sub-Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setEditModalVisible(false)}
        >
          <View
            style={styles.editModal}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.header}>
              <Text style={styles.title}>
                {isNewCategory ? 'New Category' : 'Edit Category'}
              </Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Feather name="x" size={22} color={C.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.editContent}>
              {/* Name */}
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={styles.input}
                value={editName}
                onChangeText={setEditName}
                placeholder="Category name"
                placeholderTextColor={C.neutral}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              {/* Icon Picker */}
              <Text style={styles.fieldLabel}>Icon</Text>
              <View style={styles.iconGrid}>
                {ICON_OPTIONS.map((iconName) => (
                  <TouchableOpacity
                    key={iconName}
                    style={[
                      styles.iconOption,
                      editIcon === iconName && {
                        backgroundColor: withAlpha(editColor, 0.2),
                        borderColor: editColor,
                      },
                    ]}
                    onPress={() => {
                      lightTap();
                      setEditIcon(iconName);
                    }}
                  >
                    <Feather
                      name={iconName as keyof typeof Feather.glyphMap}
                      size={20}
                      color={editIcon === iconName ? editColor : C.textSecondary}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Color Picker (only for custom categories) */}
              {(isNewCategory ||
                (editingCategory && isCustom(editingCategory.id))) && (
                <>
                  <Text style={styles.fieldLabel}>Color</Text>
                  <View style={styles.colorRow}>
                    {COLOR_OPTIONS.map((color) => (
                      <TouchableOpacity
                        key={color}
                        style={[
                          styles.colorOption,
                          { backgroundColor: color },
                          editColor === color && styles.colorSelected,
                        ]}
                        onPress={() => {
                          lightTap();
                          setEditColor(color);
                        }}
                      />
                    ))}
                  </View>
                </>
              )}
            </View>

            {/* Actions */}
            <View style={styles.editActions}>
              {editingCategory && isCustom(editingCategory.id) && !isNewCategory && (
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={handleDelete}
                >
                  <Feather name="trash-2" size={16} color={C.neutral} />
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveText}>
                  {isNewCategory ? 'Add' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </Modal>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: SPACING['2xl'],
  },
  modal: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: C.border,
  },
  editModal: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: C.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  title: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.textPrimary,
  },
  dragHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.neutral,
    textAlign: 'center',
    paddingTop: SPACING.sm,
  },
  listContent: {
    padding: SPACING.sm,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: C.surface,
  },
  categoryRowDragging: {
    backgroundColor: withAlpha(C.accent, 0.06),
    borderWidth: 1,
    borderColor: withAlpha(C.accent, 0.2),
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  customBadge: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.accent,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginTop: 1,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  addButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
  },
  editContent: {
    padding: SPACING.lg,
  },
  fieldLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.md,
  },
  input: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: C.border,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  iconOption: {
    width: 42,
    height: 42,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.background,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  colorOption: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.full,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSelected: {
    borderColor: C.textPrimary,
    borderWidth: 3,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: SPACING.lg,
    gap: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(C.neutral, 0.1),
    marginRight: 'auto',
  },
  deleteText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.neutral,
  },
  saveButton: {
    paddingHorizontal: SPACING['2xl'],
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: C.accent,
  },
  saveText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#FFFFFF',
  },
});

export default CategoryManager;
