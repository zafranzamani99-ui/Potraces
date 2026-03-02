import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  Keyboard,
  FlatList,
} from 'react-native';
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

const UnitManager: React.FC<UnitManagerProps> = ({ visible, onClose }) => {
  const { showToast } = useToast();
  const customUnits = useSellerStore((s) => s.customUnits);
  const addCustomUnit = useSellerStore((s) => s.addCustomUnit);
  const deleteCustomUnit = useSellerStore((s) => s.deleteCustomUnit);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newUnit, setNewUnit] = useState('');

  const allUnits = [
    ...DEFAULT_UNITS.map((u) => ({ name: u, isCustom: false })),
    ...customUnits.map((u) => ({ name: u, isCustom: true })),
  ];

  const handleAdd = () => {
    Keyboard.dismiss();
    const trimmed = newUnit.trim().toLowerCase();
    if (!trimmed) {
      showToast('Unit name is required', 'error');
      return;
    }
    if (DEFAULT_UNITS.includes(trimmed) || customUnits.includes(trimmed)) {
      showToast('This unit already exists', 'error');
      return;
    }
    addCustomUnit(trimmed);
    showToast('Unit added', 'success');
    setNewUnit('');
    setAddModalVisible(false);
  };

  const handleDelete = (unit: string) => {
    Alert.alert('Delete Unit', `Delete "${unit}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteCustomUnit(unit);
          showToast('Unit deleted', 'success');
        },
      },
    ]);
  };

  const renderUnit = ({ item }: { item: { name: string; isCustom: boolean } }) => (
    <View style={styles.unitRow}>
      <View style={styles.unitIcon}>
        <Feather name="box" size={18} color={CALM.bronze} />
      </View>
      <View style={styles.unitInfo}>
        <Text style={styles.unitName}>{item.name}</Text>
        {item.isCustom && <Text style={styles.customBadge}>Custom</Text>}
      </View>
      {item.isCustom && (
        <TouchableOpacity
          onPress={() => {
            lightTap();
            handleDelete(item.name);
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="trash-2" size={16} color={CALM.neutral} />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
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

          <FlatList
            data={allUnits}
            keyExtractor={(item) => item.name}
            renderItem={renderUnit}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            style={styles.list}
          />

          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              lightTap();
              setNewUnit('');
              setAddModalVisible(true);
            }}
          >
            <Feather name="plus" size={18} color={CALM.accent} />
            <Text style={styles.addButtonText}>Add Custom Unit</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {/* Add unit sub-modal */}
      <Modal
        visible={addModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setAddModalVisible(false)}
        >
          <View
            style={styles.addModal}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.header}>
              <Text style={styles.title}>New Unit</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)}>
                <Feather name="x" size={22} color={CALM.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.addContent}>
              <Text style={styles.fieldLabel}>Name</Text>
              <TextInput
                style={styles.input}
                value={newUnit}
                onChangeText={setNewUnit}
                placeholder="e.g. botol, beg, dozen"
                placeholderTextColor={CALM.neutral}
                returnKeyType="done"
                autoFocus
                autoCapitalize="none"
                onSubmitEditing={handleAdd}
              />
            </View>

            <View style={styles.addActions}>
              <TouchableOpacity style={styles.saveButton} onPress={handleAdd}>
                <Text style={styles.saveText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
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
  addModal: {
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
  list: {
    maxHeight: 400,
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
  },
  unitIcon: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withAlpha(CALM.bronze, 0.1),
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
  addContent: {
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
  addActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    padding: SPACING.lg,
    gap: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
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
