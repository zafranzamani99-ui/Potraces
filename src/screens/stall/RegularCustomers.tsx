import React, { useState, useCallback, useMemo } from 'react';
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
import { CALM, CALM_DARK, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { RegularCustomer } from '../../types';

const RegularCustomers: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(C), [C]);
  const {
    regularCustomers,
    addRegularCustomer,
    updateRegularCustomer,
    deleteRegularCustomer,
    loyalty,
    setLoyalty,
  } = useStallStore();

  // ─── State ─────────────────────────────────────────────
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Loyalty config (optional)
  const [loyaltyEvery, setLoyaltyEvery] = useState(loyalty.everyN ? String(loyalty.everyN) : '');
  const [loyaltyReward, setLoyaltyReward] = useState(loyalty.reward);
  const commitLoyalty = useCallback((everyStr: string, reward: string) => {
    const n = parseInt(everyStr, 10);
    setLoyalty({ everyN: isNaN(n) ? 0 : n, reward });
  }, [setLoyalty]);

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
        t.stallRegulars.removeTitle,
        t.stallRegulars.removeMsg.replace('{name}', customer.name),
        [
          { text: t.common.cancel, style: 'cancel' },
          {
            text: t.stallRegulars.removeBtn,
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
    if (!date) return t.stallRegulars.noVisitsYet;
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
                placeholder={t.stallRegulars.name}
                placeholderTextColor={C.textSecondary}
                autoFocus
                accessibilityLabel="Customer name"
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={C.accent}
              />
              <TextInput
                style={styles.editInput}
                value={editUsualOrder}
                onChangeText={setEditUsualOrder}
                placeholder={t.stallRegulars.usualOrderOptional}
                placeholderTextColor={C.textSecondary}
                accessibilityLabel="Usual order"
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={C.accent}
              />
              <TextInput
                style={styles.editInput}
                value={editNote}
                onChangeText={setEditNote}
                placeholder={t.stallRegulars.noteOptional}
                placeholderTextColor={C.textSecondary}
                accessibilityLabel="Note about this customer"
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={C.accent}
              />

              <View style={styles.editActions}>
                <TouchableOpacity
                  style={styles.deleteAction}
                  onPress={() => handleDelete(item)}
                  accessibilityLabel={`Remove ${item.name}`}
                  accessibilityRole="button"
                >
                  <Text style={styles.deleteActionText}>{t.stallRegulars.remove}</Text>
                </TouchableOpacity>

                <View style={styles.editActionRight}>
                  <TouchableOpacity
                    style={styles.cancelAction}
                    onPress={handleCancelEdit}
                    accessibilityLabel="Cancel editing"
                    accessibilityRole="button"
                  >
                    <Text style={styles.cancelActionText}>{t.stallRegulars.cancel}</Text>
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
                    <Text style={styles.saveActionText}>{t.stallRegulars.save}</Text>
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
                {t.stallRegulars.usually.replace('{order}', item.usualOrder!)}
              </Text>
            )}

            <View style={styles.customerMeta}>
              <Text style={styles.metaText}>
                {item.visitCount === 1 ? t.stallRegulars.nVisits.replace('{n}', '1') : t.stallRegulars.nVisitsPlural.replace('{n}', String(item.visitCount))}
              </Text>
              <Text style={styles.metaDot}>{'\u00B7'}</Text>
              <Text style={styles.metaText}>
                {formatLastVisit(item.lastVisit)}
              </Text>
            </View>

            {loyalty.everyN > 0 && !!loyalty.reward && (() => {
              const mod = item.visitCount % loyalty.everyN;
              const ready = item.visitCount > 0 && mod === 0;
              return (
                <Text style={[styles.loyaltyProgressText, ready && styles.loyaltyReadyText]}>
                  {ready
                    ? t.stall.loyaltyReady.replace('{reward}', loyalty.reward)
                    : t.stall.loyaltyProgress.replace('{count}', String(mod)).replace('{n}', String(loyalty.everyN))}
                </Text>
              );
            })()}

            {item.note && (
              <Text style={styles.customerNote} numberOfLines={2}>
                {item.note}
              </Text>
            )}
          </View>

          <Feather name="chevron-right" size={16} color={C.neutral} />
        </TouchableOpacity>
      );
    },
    [editingId, editName, editUsualOrder, editNote, handleStartEdit, handleSaveEdit, handleCancelEdit, handleDelete, loyalty],
  );

  // ─── Header with add form ─────────────────────────────
  const renderHeader = useCallback(() => {
    return (
      <View style={styles.headerContainer}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.heading}>{t.stallRegulars.heading}</Text>
            <Text style={styles.subheading}>
              {t.stallRegulars.subtitle}{regularCustomers.length > 0 ? ` \u00B7 ${regularCustomers.length}` : ''}
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
              color={C.bronze}
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
              placeholder={t.stallRegulars.name}
              placeholderTextColor={C.textSecondary}
              autoFocus
              accessibilityLabel={t.stallRegulars.name}
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={C.accent}
            />
            <TextInput
              style={styles.addInput}
              value={newUsualOrder}
              onChangeText={setNewUsualOrder}
              placeholder={t.stallRegulars.usualOrderPlaceholder}
              placeholderTextColor={C.textSecondary}
              accessibilityLabel="Usual order, optional"
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={C.accent}
            />
            <TextInput
              style={styles.addInput}
              value={newNote}
              onChangeText={setNewNote}
              placeholder="note (optional)"
              placeholderTextColor={C.textSecondary}
              accessibilityLabel="Note, optional"
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={C.accent}
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
              <Text style={styles.addSaveText}>{t.stallRegulars.save}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Loyalty config (optional) */}
        <View style={styles.loyaltyCard}>
          <Text style={styles.loyaltyHeading}>{t.stall.loyaltyHeading}</Text>
          <Text style={styles.loyaltyHint}>{t.stall.loyaltyHint}</Text>
          <View style={styles.loyaltyRow}>
            <Text style={styles.loyaltyWord}>{t.stall.loyaltyEvery}</Text>
            <TextInput
              style={styles.loyaltyEveryInput}
              value={loyaltyEvery}
              onChangeText={(v) => { const c = v.replace(/[^0-9]/g, ''); setLoyaltyEvery(c); commitLoyalty(c, loyaltyReward); }}
              placeholder="10"
              placeholderTextColor={C.neutral}
              keyboardType="number-pad"
              accessibilityLabel="Reward every how many visits"
              keyboardAppearance={isDark ? 'dark' : 'light'}
              selectionColor={C.accent}
            />
            <Text style={styles.loyaltyWord}>{t.stall.loyaltyVisitsWord}</Text>
          </View>
          <TextInput
            style={styles.loyaltyRewardInput}
            value={loyaltyReward}
            onChangeText={(v) => { setLoyaltyReward(v); commitLoyalty(loyaltyEvery, v); }}
            placeholder={t.stall.loyaltyRewardPlaceholder}
            placeholderTextColor={C.neutral}
            accessibilityLabel="Loyalty reward"
            keyboardAppearance={isDark ? 'dark' : 'light'}
            selectionColor={C.accent}
          />
        </View>
      </View>
    );
  }, [showAddForm, newName, newUsualOrder, newNote, handleToggleAdd, handleAdd, loyaltyEvery, loyaltyReward, commitLoyalty, isDark, C]);

  const renderEmpty = useCallback(() => {
    return (
      <View style={styles.emptyContainer}>
        <Feather name="users" size={40} color={C.border} />
        <Text style={styles.emptyTitle}>{t.stallRegulars.emptyTitle}</Text>
        <Text style={styles.emptyHint}>{t.stallRegulars.emptyHint}</Text>
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
          removeClippedSubviews
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={10}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  keyboardView: {
    flex: 1,
  },

  // ─── Loyalty config + progress ─────────────────────────
  loyaltyCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  loyaltyHeading: {
    ...TYPE.label,
  },
  loyaltyHint: {
    ...TYPE.muted,
  },
  loyaltyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  loyaltyWord: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textSecondary,
  },
  loyaltyEveryInput: {
    width: 60,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
    minHeight: 44,
  },
  loyaltyRewardInput: {
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    minHeight: 44,
  },
  loyaltyProgressText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: C.textMuted,
    marginTop: SPACING.xs,
  },
  loyaltyReadyText: {
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  listContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING['4xl'],
    gap: SPACING.md,
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center' as const,
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
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
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
    borderColor: C.border,
    backgroundColor: C.surface,
  },

  // ─── Add form ──────────────────────────────────────────
  addForm: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.bronze,
    padding: SPACING.lg,
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  addInput: {
    ...TYPE.insight,
    color: C.textPrimary,
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 44,
  },
  addSaveButton: {
    backgroundColor: C.bronze,
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
    color: C.onAccent,
  },

  // ─── Customer card ────────────────────────────────────
  customerCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withAlpha(C.bronze, 0.10),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  avatarText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
  },
  customerInfo: {
    flex: 1,
    gap: SPACING.xs,
  },
  customerName: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    letterSpacing: C === CALM_DARK ? 0.2 : 0,
  },
  usualOrder: {
    ...TYPE.insight,
    color: C.textSecondary,
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
    color: C.textSecondary,
    marginTop: SPACING.xs,
  },

  // ─── Edit form (inline) ───────────────────────────────
  editForm: {
    flex: 1,
    gap: SPACING.md,
  },
  editInput: {
    ...TYPE.insight,
    color: C.textPrimary,
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: C.border,
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
    color: C.neutral,
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
    color: C.textSecondary,
  },
  saveAction: {
    backgroundColor: C.bronze,
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
    color: C.onAccent,
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
    color: C.textSecondary,
  },
  emptyHint: {
    ...TYPE.muted,
    textAlign: 'center',
  },
});

export default RegularCustomers;
