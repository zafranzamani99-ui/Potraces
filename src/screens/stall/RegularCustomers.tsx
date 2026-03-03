import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useStallStore } from '../../store/stallStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { RegularCustomer } from '../../types';

const RegularCustomers: React.FC = () => {
  const {
    regularCustomers,
    addRegularCustomer,
    updateRegularCustomer,
    deleteRegularCustomer,
  } = useStallStore();

  // ─── State ─────────────────────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Add form state
  const [newName, setNewName] = useState('');
  const [newUsualOrder, setNewUsualOrder] = useState('');
  const [newNote, setNewNote] = useState('');

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editUsualOrder, setEditUsualOrder] = useState('');
  const [editNote, setEditNote] = useState('');

  // ─── Handlers ──────────────────────────────────────────
  const handleAdd = useCallback(() => {
    const name = newName.trim();
    if (!name) return;

    addRegularCustomer({
      name,
      usualOrder: newUsualOrder.trim() || undefined,
      note: newNote.trim() || undefined,
    });

    setNewName('');
    setNewUsualOrder('');
    setNewNote('');
    setShowAddForm(false);
  }, [newName, newUsualOrder, newNote, addRegularCustomer]);

  const handleStartEdit = useCallback((customer: RegularCustomer) => {
    setEditingId(customer.id);
    setEditName(customer.name);
    setEditUsualOrder(customer.usualOrder || '');
    setEditNote(customer.note || '');
    // Close add form if open
    setShowAddForm(false);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingId) return;
    const name = editName.trim();
    if (!name) return;

    updateRegularCustomer(editingId, {
      name,
      usualOrder: editUsualOrder.trim() || undefined,
      note: editNote.trim() || undefined,
    });

    setEditingId(null);
    setEditName('');
    setEditUsualOrder('');
    setEditNote('');
  }, [editingId, editName, editUsualOrder, editNote, updateRegularCustomer]);

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setEditName('');
    setEditUsualOrder('');
    setEditNote('');
  }, []);

  const handleDelete = useCallback(
    (customer: RegularCustomer) => {
      Alert.alert(
        'remove regular?',
        `Remove ${customer.name} from your regulars?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => {
              deleteRegularCustomer(customer.id);
              if (editingId === customer.id) {
                setEditingId(null);
              }
            },
          },
        ],
      );
    },
    [deleteRegularCustomer, editingId],
  );

  const handleToggleAdd = useCallback(() => {
    setShowAddForm((prev) => !prev);
    setEditingId(null);
    if (!showAddForm) {
      // Reset form when opening
      setNewName('');
      setNewUsualOrder('');
      setNewNote('');
    }
  }, [showAddForm]);

  const formatLastVisit = (date?: Date): string => {
    if (!date) return 'no visits yet';
    const d = date instanceof Date ? date : new Date(date);
    return format(d, 'd MMM yyyy');
  };

  // ─── Render customer card ─────────────────────────────
  const renderCustomer = useCallback(
    ({ item }: { item: RegularCustomer }) => {
      const isEditing = editingId === item.id;

      if (isEditing) {
        return (
          <View style={styles.customerCard}>
            <View style={styles.editForm}>
              <TextInput
                style={styles.editInput}
                value={editName}
                onChangeText={setEditName}
                placeholder="name"
                placeholderTextColor={CALM.textSecondary}
                autoFocus
                accessibilityLabel="Customer name"
              />
              <TextInput
                style={styles.editInput}
                value={editUsualOrder}
                onChangeText={setEditUsualOrder}
                placeholder="usual order (optional)"
                placeholderTextColor={CALM.textSecondary}
                accessibilityLabel="Usual order"
              />
              <TextInput
                style={styles.editInput}
                value={editNote}
                onChangeText={setEditNote}
                placeholder="note (optional)"
                placeholderTextColor={CALM.textSecondary}
                accessibilityLabel="Note about this customer"
              />

              <View style={styles.editActions}>
                <TouchableOpacity
                  style={styles.deleteAction}
                  onPress={() => handleDelete(item)}
                  accessibilityLabel={`Remove ${item.name}`}
                  accessibilityRole="button"
                >
                  <Text style={styles.deleteActionText}>remove</Text>
                </TouchableOpacity>

                <View style={styles.editActionRight}>
                  <TouchableOpacity
                    style={styles.cancelAction}
                    onPress={handleCancelEdit}
                    accessibilityLabel="Cancel editing"
                    accessibilityRole="button"
                  >
                    <Text style={styles.cancelActionText}>cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.saveAction,
                      !editName.trim() && styles.saveActionDisabled,
                    ]}
                    onPress={handleSaveEdit}
                    disabled={!editName.trim()}
                    accessibilityLabel="Save changes"
                    accessibilityRole="button"
                  >
                    <Text style={styles.saveActionText}>save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        );
      }

      return (
        <TouchableOpacity
          style={styles.customerCard}
          onPress={() => handleStartEdit(item)}
          activeOpacity={0.85}
          accessibilityLabel={`${item.name}${item.usualOrder ? `, usually orders ${item.usualOrder}` : ''}, ${item.visitCount} visits`}
          accessibilityHint="Tap to edit this regular"
          accessibilityRole="button"
        >
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.customerInfo}>
            <Text style={styles.customerName}>{item.name}</Text>

            {item.usualOrder && (
              <Text style={styles.usualOrder} numberOfLines={2}>
                usually: {item.usualOrder}
              </Text>
            )}

            <View style={styles.customerMeta}>
              <Text style={styles.metaText}>
                {item.visitCount} visit{item.visitCount !== 1 ? 's' : ''}
              </Text>
              <Text style={styles.metaDot}>{'\u00B7'}</Text>
              <Text style={styles.metaText}>
                {formatLastVisit(item.lastVisit)}
              </Text>
            </View>

            {item.note && (
              <Text style={styles.customerNote} numberOfLines={2}>
                {item.note}
              </Text>
            )}
          </View>

          <Feather name="chevron-right" size={16} color={CALM.neutral} />
        </TouchableOpacity>
      );
    },
    [editingId, editName, editUsualOrder, editNote, handleStartEdit, handleSaveEdit, handleCancelEdit, handleDelete],
  );

  // ─── Header with add form ─────────────────────────────
  const renderHeader = useCallback(() => {
    return (
      <View style={styles.headerContainer}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.heading}>regulars</Text>
            <Text style={styles.subheading}>
              the familiar faces{regularCustomers.length > 0 ? ` \u00B7 ${regularCustomers.length}` : ''}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.addToggle}
            onPress={handleToggleAdd}
            accessibilityLabel={showAddForm ? 'Close add form' : 'Add new regular'}
            accessibilityRole="button"
          >
            <Feather
              name={showAddForm ? 'x' : 'plus'}
              size={20}
              color={CALM.bronze}
            />
          </TouchableOpacity>
        </View>

        {/* Inline add form */}
        {showAddForm && (
          <View style={styles.addForm}>
            <TextInput
              style={styles.addInput}
              value={newName}
              onChangeText={setNewName}
              placeholder="name"
              placeholderTextColor={CALM.textSecondary}
              autoFocus
              accessibilityLabel="New customer name"
            />
            <TextInput
              style={styles.addInput}
              value={newUsualOrder}
              onChangeText={setNewUsualOrder}
              placeholder="e.g. 2 kuih seri muka + teh tarik"
              placeholderTextColor={CALM.textSecondary}
              accessibilityLabel="Usual order, optional"
            />
            <TextInput
              style={styles.addInput}
              value={newNote}
              onChangeText={setNewNote}
              placeholder="note (optional)"
              placeholderTextColor={CALM.textSecondary}
              accessibilityLabel="Note, optional"
            />
            <TouchableOpacity
              style={[
                styles.addSaveButton,
                !newName.trim() && styles.addSaveButtonDisabled,
              ]}
              onPress={handleAdd}
              disabled={!newName.trim()}
              accessibilityLabel="Save new regular customer"
              accessibilityRole="button"
            >
              <Text style={styles.addSaveText}>save</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }, [showAddForm, newName, newUsualOrder, newNote, handleToggleAdd, handleAdd]);

  const renderEmpty = useCallback(() => {
    return (
      <View style={styles.emptyContainer}>
        <Feather name="users" size={40} color={CALM.border} />
        <Text style={styles.emptyTitle}>no regulars yet</Text>
        <Text style={styles.emptyHint}>they'll show up.</Text>
      </View>
    );
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={regularCustomers}
          renderItem={renderCustomer}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  keyboardView: {
    flex: 1,
  },
  listContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING['4xl'],
    gap: SPACING.md,
  },

  // ─── Header ────────────────────────────────────────────
  headerContainer: {
    marginBottom: SPACING.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.lg,
  },
  heading: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  subheading: {
    ...TYPE.muted,
    marginTop: SPACING.xs,
  },
  addToggle: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: CALM.border,
    backgroundColor: CALM.surface,
  },

  // ─── Add form ──────────────────────────────────────────
  addForm: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.bronze,
    padding: SPACING.lg,
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  addInput: {
    ...TYPE.insight,
    color: CALM.textPrimary,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: CALM.border,
    minHeight: 44,
  },
  addSaveButton: {
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  addSaveButtonDisabled: {
    opacity: 0.4,
  },
  addSaveText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#FFFFFF',
  },

  // ─── Customer card ────────────────────────────────────
  customerCard: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withAlpha(CALM.bronze, 0.10),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  avatarText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.bronze,
  },
  customerInfo: {
    flex: 1,
    gap: SPACING.xs,
  },
  customerName: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  usualOrder: {
    ...TYPE.insight,
    color: CALM.textSecondary,
    fontStyle: 'italic',
  },
  customerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginTop: SPACING.xs,
  },
  metaText: {
    ...TYPE.muted,
  },
  metaDot: {
    ...TYPE.muted,
  },
  customerNote: {
    ...TYPE.muted,
    color: CALM.textSecondary,
    marginTop: SPACING.xs,
  },

  // ─── Edit form (inline) ───────────────────────────────
  editForm: {
    flex: 1,
    gap: SPACING.md,
  },
  editInput: {
    ...TYPE.insight,
    color: CALM.textPrimary,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: CALM.border,
    minHeight: 44,
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deleteAction: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  deleteActionText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.neutral,
  },
  editActionRight: {
    flexDirection: 'row',
    gap: SPACING.md,
    alignItems: 'center',
  },
  cancelAction: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  cancelActionText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  saveAction: {
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    minHeight: 44,
    justifyContent: 'center',
  },
  saveActionDisabled: {
    opacity: 0.4,
  },
  saveActionText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#FFFFFF',
  },

  // ─── Empty state ───────────────────────────────────────
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING['4xl'],
    gap: SPACING.md,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textSecondary,
  },
  emptyHint: {
    ...TYPE.muted,
    textAlign: 'center',
  },
});

export default RegularCustomers;
