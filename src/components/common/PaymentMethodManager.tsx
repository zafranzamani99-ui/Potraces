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
  FlatList,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useSettingsStore } from '../../store/settingsStore';
import { DEFAULT_PAYMENT_METHODS } from '../../constants/taxCategories';
import { CategoryOption } from '../../types';
import { lightTap } from '../../services/haptics';
import { useToast } from '../../context/ToastContext';

const ICON_OPTIONS: string[] = [
  'dollar-sign', 'credit-card', 'smartphone', 'zap', 'shopping-bag',
  'globe', 'maximize', 'more-horizontal', 'briefcase', 'gift',
  'tag', 'star', 'heart', 'shield', 'layers',
];

const COLOR_OPTIONS: string[] = [
  '#4F5104', '#5E72E4', '#DEAB22', '#A06CD5', '#6BA3BE',
  '#B2780A', '#C4956A', '#7C5CFC', '#332D03', '#2E7D5B',
];

interface PaymentMethodManagerProps {
  visible: boolean;
  onClose: () => void;
}

const PaymentMethodManager: React.FC<PaymentMethodManagerProps> = ({ visible, onClose }) => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { showToast } = useToast();
  const getPaymentMethods = useSettingsStore((s) => s.getPaymentMethods);
  const addCustomPaymentMethod = useSettingsStore((s) => s.addCustomPaymentMethod);
  const removeCustomPaymentMethod = useSettingsStore((s) => s.removeCustomPaymentMethod);
  const updatePaymentMethodOverride = useSettingsStore((s) => s.updatePaymentMethodOverride);
  const overrides = useSettingsStore((s) => s.paymentMethodOverrides);

  const methods = useMemo(() => getPaymentMethods(), [getPaymentMethods, overrides]);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingMethod, setEditingMethod] = useState<CategoryOption | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [editColor, setEditColor] = useState('');

  const isCustom = (id: string) => id.startsWith('custom_pm_');
  const isDefault = (id: string) => DEFAULT_PAYMENT_METHODS.some((m) => m.id === id);

  const openEdit = useCallback((method: CategoryOption) => {
    lightTap();
    setEditingMethod(method);
    setIsNew(false);
    setEditName(method.name);
    setEditIcon(method.icon);
    setEditColor(method.color);
    setEditModalVisible(true);
  }, []);

  const openNew = useCallback(() => {
    lightTap();
    setEditingMethod(null);
    setIsNew(true);
    setEditName('');
    setEditIcon('credit-card');
    setEditColor(COLOR_OPTIONS[0]);
    setEditModalVisible(true);
  }, []);

  const handleSave = useCallback(() => {
    Keyboard.dismiss();
    const trimmedName = editName.trim();
    if (!trimmedName) {
      showToast('Name is required', 'error');
      return;
    }

    if (isNew) {
      const id = `custom_pm_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
      addCustomPaymentMethod({ id, name: trimmedName, icon: editIcon, color: editColor });
      showToast('Payment method added', 'success');
    } else if (editingMethod) {
      if (isCustom(editingMethod.id)) {
        removeCustomPaymentMethod(editingMethod.id);
        addCustomPaymentMethod({ id: editingMethod.id, name: trimmedName, icon: editIcon, color: editColor });
      } else {
        updatePaymentMethodOverride(editingMethod.id, { name: trimmedName, icon: editIcon, color: editColor });
      }
      showToast('Payment method updated', 'success');
    }
    setEditModalVisible(false);
  }, [editName, isNew, editIcon, editColor, editingMethod, addCustomPaymentMethod, removeCustomPaymentMethod, updatePaymentMethodOverride, showToast]);

  const handleDelete = useCallback(() => {
    if (!editingMethod) return;

    if (isCustom(editingMethod.id)) {
      Alert.alert('Delete', `Remove "${editingMethod.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            removeCustomPaymentMethod(editingMethod.id);
            setEditModalVisible(false);
            showToast('Payment method removed', 'success');
          },
        },
      ]);
    } else {
      // Hide default
      Alert.alert('Hide', `Hide "${editingMethod.name}" from the list?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Hide',
          onPress: () => {
            updatePaymentMethodOverride(editingMethod.id, { hidden: true } as any);
            setEditModalVisible(false);
            showToast('Payment method hidden', 'success');
          },
        },
      ]);
    }
  }, [editingMethod, removeCustomPaymentMethod, updatePaymentMethodOverride, showToast]);

  return (
    <Modal
      visible={visible}
      transparent
      statusBarTranslucent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.modal} onStartShouldSetResponder={() => true}>
          <View style={styles.header}>
            <Text style={styles.title}>Payment Methods</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={22} color={C.textPrimary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.hint}>Tap to edit, customise your list</Text>

          <FlatList
            data={methods}
            keyExtractor={(item) => item.id}
            style={{ maxHeight: Dimensions.get('window').height * 0.45 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.methodRow}
                onPress={() => openEdit(item)}
                activeOpacity={0.6}
              >
                <View style={[styles.methodIcon, { backgroundColor: withAlpha(item.color, 0.15) }]}>
                  <Feather name={item.icon as keyof typeof Feather.glyphMap} size={20} color={item.color} />
                </View>
                <View style={styles.methodInfo}>
                  <Text style={styles.methodName}>{item.name}</Text>
                  {isCustom(item.id) && <Text style={styles.customBadge}>Custom</Text>}
                </View>
                <Feather name="chevron-right" size={16} color={C.neutral} />
              </TouchableOpacity>
            )}
          />

          <TouchableOpacity style={styles.addButton} onPress={openNew}>
            <Feather name="plus" size={18} color={C.accent} />
            <Text style={styles.addButtonText}>Add Payment Method</Text>
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
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setEditModalVisible(false)}>
          <View style={styles.editModal} onStartShouldSetResponder={() => true}>
            <View style={styles.header}>
              <Text style={styles.title}>{isNew ? 'New Method' : 'Edit Method'}</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Feather name="x" size={22} color={C.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              style={{ maxHeight: Dimensions.get('window').height * 0.55 }}
            >
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={styles.input}
                value={editName}
                onChangeText={setEditName}
                placeholder="e.g. Sarawak Pay"
                placeholderTextColor={C.neutral}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />

              <Text style={styles.fieldLabel}>Icon</Text>
              <View style={styles.iconGrid}>
                {ICON_OPTIONS.map((iconName) => (
                  <TouchableOpacity
                    key={iconName}
                    style={[
                      styles.iconOption,
                      editIcon === iconName && { backgroundColor: withAlpha(editColor, 0.2), borderColor: editColor },
                    ]}
                    onPress={() => setEditIcon(iconName)}
                  >
                    <Feather name={iconName as keyof typeof Feather.glyphMap} size={18} color={editIcon === iconName ? editColor : C.textSecondary} />
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Color</Text>
              <View style={styles.colorGrid}>
                {COLOR_OPTIONS.map((color) => (
                  <TouchableOpacity
                    key={color}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      editColor === color && styles.colorOptionSelected,
                    ]}
                    onPress={() => setEditColor(color)}
                  />
                ))}
              </View>
            </ScrollView>

            <View style={styles.editActions}>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
              {editingMethod && (
                <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                  <Feather name="trash-2" size={16} color={C.bronze} />
                  <Text style={styles.deleteButtonText}>
                    {isCustom(editingMethod.id) ? 'Delete' : 'Hide'}
                  </Text>
                </TouchableOpacity>
              )}
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
    backgroundColor: withAlpha(C.textPrimary, 0.4),
    justifyContent: 'center',
    alignItems: 'center',
  },
  modal: {
    width: '88%',
    maxHeight: '80%',
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: C.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  title: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  hint: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginBottom: SPACING.md,
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm + 2,
    gap: SPACING.md,
  },
  methodIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  methodName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
  },
  customBadge: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.accent,
    backgroundColor: withAlpha(C.accent, 0.1),
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    marginTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  addButtonText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.accent,
  },
  editModal: {
    width: '88%',
    maxHeight: '80%',
    backgroundColor: C.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: C.border,
  },
  fieldLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    backgroundColor: C.pillBg,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    borderWidth: 1,
    borderColor: C.border,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  iconOption: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.pillBg,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  colorOption: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorOptionSelected: {
    borderColor: C.textPrimary,
    borderWidth: 3,
  },
  editActions: {
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  saveButton: {
    backgroundColor: C.accent,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm + 2,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  deleteButtonText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
  },
});

export default PaymentMethodManager;
