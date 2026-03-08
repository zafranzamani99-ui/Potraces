import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
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
import { useSellerStore } from '../../store/sellerStore';
import { lightTap } from '../../services/haptics';
import { useToast } from '../../context/ToastContext';

const DEFAULT_UNITS = ['tin', 'bekas', 'balang', 'pack', 'piece', 'kotak', 'biji', 'keping'];

interface UnitManagerProps {
  visible: boolean;
  onClose: () => void;
}

interface UnitItem {
  name: string;
  isCustom: boolean;
}

const UnitManager: React.FC<UnitManagerProps> = ({ visible, onClose }) => {
  const { showToast } = useToast();
  const customUnits = useSellerStore((s) => s.customUnits);
  const unitOrder = useSellerStore((s) => s.unitOrder);
  const hiddenUnits = useSellerStore((s) => s.hiddenUnits);
  const addCustomUnit = useSellerStore((s) => s.addCustomUnit);
  const deleteCustomUnit = useSellerStore((s) => s.deleteCustomUnit);
  const renameCustomUnit = useSellerStore((s) => s.renameCustomUnit);
  const hideUnit = useSellerStore((s) => s.hideUnit);
  const unhideUnit = useSellerStore((s) => s.unhideUnit);
  const setUnitOrder = useSellerStore((s) => s.setUnitOrder);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [isNewUnit, setIsNewUnit] = useState(false);
  const [editingUnit, setEditingUnit] = useState<UnitItem | null>(null);
  const [editName, setEditName] = useState('');

  // Build ordered unit list (exclude hidden)
  const allUnits: UnitItem[] = (() => {
    const combined = [
      ...DEFAULT_UNITS.filter((u) => !hiddenUnits.includes(u)).map((u) => ({ name: u, isCustom: false })),
      ...customUnits.map((u) => ({ name: u, isCustom: true })),
    ];
    if (unitOrder.length === 0) return combined;
    const ordered = unitOrder
      .map((name) => combined.find((u) => u.name === name))
      .filter(Boolean) as UnitItem[];
    const remaining = combined.filter((u) => !unitOrder.includes(u.name));
    return [...ordered, ...remaining];
  })();

  // Hidden default units that can be restored
  const hiddenDefaultUnits = DEFAULT_UNITS.filter((u) => hiddenUnits.includes(u));

  const openEdit = (unit: UnitItem) => {
    lightTap();
    setEditingUnit(unit);
    setIsNewUnit(false);
    setEditName(unit.name);
    setEditModalVisible(true);
  };

  const openNew = () => {
    lightTap();
    setEditingUnit(null);
    setIsNewUnit(true);
    setEditName('');
    setEditModalVisible(true);
  };

  const handleSave = () => {
    Keyboard.dismiss();
    const trimmed = editName.trim().toLowerCase();
    if (!trimmed) {
      showToast('Unit name is required', 'error');
      return;
    }

    if (isNewUnit) {
      if (DEFAULT_UNITS.includes(trimmed) || customUnits.includes(trimmed)) {
        showToast('This unit already exists', 'error');
        return;
      }
      addCustomUnit(trimmed);
      showToast('Unit added', 'success');
    } else if (editingUnit) {
      if (trimmed !== editingUnit.name) {
        if (DEFAULT_UNITS.includes(trimmed) || customUnits.includes(trimmed)) {
          showToast('This unit already exists', 'error');
          return;
        }
        if (editingUnit.isCustom) {
          renameCustomUnit(editingUnit.name, trimmed);
        } else {
          // Renaming a default unit: hide the default, add as custom
          hideUnit(editingUnit.name);
          addCustomUnit(trimmed);
        }
        showToast('Unit updated', 'success');
      }
    }

    setEditModalVisible(false);
  };

  const handleDelete = () => {
    if (!editingUnit) return;

    const label = editingUnit.isCustom ? 'Delete' : 'Remove';
    Alert.alert(`${label} Unit`, `${label} "${editingUnit.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: label,
        style: 'destructive',
        onPress: () => {
          if (editingUnit.isCustom) {
            deleteCustomUnit(editingUnit.name);
          } else {
            hideUnit(editingUnit.name);
          }
          setEditModalVisible(false);
          showToast('Unit removed', 'success');
        },
      },
    ]);
  };

  const handleRestore = (unitName: string) => {
    lightTap();
    unhideUnit(unitName);
    showToast(`${unitName} restored`, 'success');
  };

  const handleDragEnd = useCallback(({ data }: { data: UnitItem[] }) => {
    lightTap();
    setUnitOrder(data.map((u) => u.name));
  }, [setUnitOrder]);

  const renderUnit = ({ item, drag, isActive }: RenderItemParams<UnitItem>) => (
    <ScaleDecorator>
      <TouchableOpacity
        style={[
          styles.unitRow,
          isActive && styles.unitRowDragging,
        ]}
        onPress={() => openEdit(item)}
        onLongPress={drag}
        delayLongPress={150}
        activeOpacity={0.6}
      >
        <View style={styles.unitIcon}>
          <Feather name="box" size={20} color={CALM.bronze} />
        </View>
        <View style={styles.unitInfo}>
          <Text style={styles.unitName}>{item.name}</Text>
          {item.isCustom && (
            <Text style={styles.customBadge}>Custom</Text>
          )}
        </View>
        <Feather name="menu" size={18} color={isActive ? CALM.accent : CALM.neutral} />
      </TouchableOpacity>
    </ScaleDecorator>
  );

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
            <Text style={styles.title}>Product Units</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={22} color={CALM.textPrimary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.dragHint}>Tap to edit · Hold & drag to reorder</Text>

          <GestureHandlerRootView style={{ maxHeight: Dimensions.get('window').height * 0.35 }}>
            <DraggableFlatList
              data={allUnits}
              keyExtractor={(item) => item.name}
              renderItem={renderUnit}
              onDragEnd={handleDragEnd}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}
              activationDistance={5}
            />
          </GestureHandlerRootView>

          {/* Hidden units restore section */}
          {hiddenDefaultUnits.length > 0 && (
            <View style={styles.hiddenSection}>
              <Text style={styles.hiddenLabel}>Removed units</Text>
              <View style={styles.hiddenRow}>
                {hiddenDefaultUnits.map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={styles.hiddenChip}
                    onPress={() => handleRestore(u)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.hiddenChipText}>{u}</Text>
                    <Feather name="plus" size={14} color={CALM.accent} />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <TouchableOpacity style={styles.addButton} onPress={openNew}>
            <Feather name="plus" size={18} color={CALM.accent} />
            <Text style={styles.addButtonText}>Add Custom Unit</Text>
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
        <Pressable
          style={styles.overlay}
          onPress={() => {
            Keyboard.dismiss();
            setEditModalVisible(false);
          }}
        >
          <Pressable
            style={styles.editModal}
            onPress={Keyboard.dismiss}
          >
            <View style={styles.header}>
              <Text style={styles.title}>
                {isNewUnit ? 'New Unit' : 'Edit Unit'}
              </Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Feather name="x" size={22} color={CALM.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.editContent}>
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={styles.input}
                value={editName}
                onChangeText={setEditName}
                placeholder="e.g. botol, beg, dozen"
                placeholderTextColor={CALM.neutral}
                returnKeyType="done"
                autoFocus
                autoCapitalize="none"
                onSubmitEditing={handleSave}
              />
            </View>

            <View style={styles.editActions}>
              {editingUnit && !isNewUnit && (
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={handleDelete}
                >
                  <Feather name="trash-2" size={16} color={CALM.neutral} />
                  <Text style={styles.deleteText}>
                    {editingUnit.isCustom ? 'Delete' : 'Remove'}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveText}>
                  {isNewUnit ? 'Add' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    paddingHorizontal: SPACING['2xl'],
  },
  modal: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    maxHeight: '70%',
    borderWidth: 1,
    borderColor: CALM.border,
  },
  editModal: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
  },
  title: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
  },
  dragHint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.neutral,
    textAlign: 'center',
    paddingTop: SPACING.sm,
  },
  listContent: {
    padding: SPACING.sm,
  },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
    borderRadius: RADIUS.md,
    backgroundColor: CALM.surface,
  },
  unitRowDragging: {
    backgroundColor: withAlpha(CALM.accent, 0.06),
    borderWidth: 1,
    borderColor: withAlpha(CALM.accent, 0.2),
  },
  unitIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(CALM.bronze, 0.15),
  },
  unitInfo: {
    flex: 1,
  },
  unitName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  customBadge: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.accent,
    fontWeight: TYPOGRAPHY.weight.medium,
    marginTop: 1,
  },
  hiddenSection: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
  },
  hiddenLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.neutral,
    marginBottom: SPACING.sm,
  },
  hiddenRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  hiddenChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(CALM.neutral, 0.08),
  },
  hiddenChipText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    padding: SPACING.lg,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
  },
  addButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
  },
  editContent: {
    padding: SPACING.lg,
  },
  fieldLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
    marginBottom: SPACING.sm,
  },
  input: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: SPACING.lg,
    paddingBottom: SPACING.lg,
    gap: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(CALM.neutral, 0.1),
    marginRight: 'auto',
  },
  deleteText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.neutral,
  },
  saveButton: {
    paddingHorizontal: SPACING['2xl'],
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md,
    backgroundColor: CALM.accent,
  },
  saveText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#FFFFFF',
  },
});

export default UnitManager;
