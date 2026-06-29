import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Pressable,
  Modal,
  TextInput,
  FlatList,
  Alert,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { KeyboardAwareScrollView, KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { ScrollView } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { Contact } from '../../types';
import Button from './Button';

interface ContactPickerProps {
  selectedContacts: Contact[];
  onSelect: (contacts: Contact[]) => void;
  mode?: 'single' | 'multi';
  label?: string;
  includeSelf?: boolean;
  selfName?: string;
  /** When true, skip rendering the internal label — caller renders its own. */
  hideLabel?: boolean;
  /** 'input' renders a free-type name field (avatar + placeholder + contacts pill + recent chips), matching the seller New Order customer input. Single mode. */
  variant?: 'pills' | 'input';
  /** Recent people shown as quick-pick chips below the input (variant='input' only). */
  recent?: Contact[];
  /** Placeholder for the input variant. */
  placeholder?: string;
}

const ContactPicker: React.FC<ContactPickerProps> = ({
  selectedContacts,
  onSelect,
  mode = 'single',
  label = 'Contact',
  includeSelf = false,
  selfName = 'me',
  hideLabel = false,
  variant = 'pills',
  recent = [],
  placeholder = "who's this for?",
}) => {
  const C = useCalm();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const [phoneModalVisible, setPhoneModalVisible] = useState(false);
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [phoneContacts, setPhoneContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const phoneInputRef = useRef<TextInput>(null);

  const loadPhoneContacts = useCallback(async () => {
    // Open the picker instantly, then load contacts behind a spinner (the fetch can lag).
    setPhoneContacts([]);
    setContactsLoading(true);
    setPhoneModalVisible(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        setPhoneModalVisible(false);
        Alert.alert(
          'Permission Required',
          'Please grant contacts permission in Settings to use this feature.'
        );
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
        sort: Contacts.SortTypes.FirstName,
      });

      const mapped: Contact[] = data
        .filter((c) => c.name)
        .map((c) => ({
          id: c.id || Date.now().toString() + Math.random().toString(36),
          name: c.name || 'Unknown',
          phone: c.phoneNumbers?.[0]?.number,
          email: c.emails?.[0]?.email,
          isFromPhone: true,
        }));

      setPhoneContacts(mapped);
    } finally {
      setContactsLoading(false);
    }
  }, []);

  const handleSelectPhoneContact = useCallback((contact: Contact) => {
    if (mode === 'single') {
      onSelect([contact]);
      setPhoneModalVisible(false);
    } else {
      const alreadySelected = selectedContacts.some((c) => c.id === contact.id);
      if (alreadySelected) {
        onSelect(selectedContacts.filter((c) => c.id !== contact.id));
      } else {
        onSelect([...selectedContacts, contact]);
      }
    }
  }, [mode, onSelect, selectedContacts]);

  const handleAddManual = useCallback(() => {
    if (!manualName.trim()) {
      Alert.alert('Error', 'Please enter a name');
      return;
    }

    const contact: Contact = {
      id: Date.now().toString(),
      name: manualName.trim(),
      phone: manualPhone.trim() || undefined,
      isFromPhone: false,
    };

    if (mode === 'single') {
      onSelect([contact]);
    } else {
      onSelect([...selectedContacts, contact]);
    }

    setManualName('');
    setManualPhone('');
    setManualModalVisible(false);
  }, [manualName, manualPhone, mode, onSelect, selectedContacts]);

  const handleRemove = useCallback((contactId: string) => {
    onSelect(selectedContacts.filter((c) => c.id !== contactId));
  }, [onSelect, selectedContacts]);

  // ── Input variant: free-type name bound to a single contact ──
  const name = selectedContacts[0]?.name ?? '';
  const handleNameChange = useCallback((text: string) => {
    if (text.length === 0) { onSelect([]); return; }
    const existing = selectedContacts[0];
    onSelect([{
      id: existing?.id ?? `manual-${Date.now()}`,
      name: text,
      phone: existing?.phone,
      isFromPhone: existing?.isFromPhone ?? false,
    }]);
  }, [onSelect, selectedContacts]);

  const filteredPhoneContacts = useMemo(() => phoneContacts.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  ), [phoneContacts, searchQuery]);

  const renderPhoneContact = useCallback(({ item }: { item: Contact }) => {
    const isSelected = selectedContacts.some((c) => c.id === item.id);
    return (
      <TouchableOpacity
        style={[styles.contactRow, isSelected && styles.contactRowSelected]}
        onPress={() => handleSelectPhoneContact(item)}
        activeOpacity={0.7}
      >
        <View style={styles.contactAvatar}>
          <Text style={styles.contactAvatarText}>
            {item.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.contactInfo}>
          <Text style={styles.contactName}>{item.name}</Text>
          {item.phone && (
            <Text style={styles.contactPhone}>{item.phone}</Text>
          )}
        </View>
        {isSelected && (
          <Feather name="check-circle" size={20} color={C.positive} />
        )}
      </TouchableOpacity>
    );
  }, [selectedContacts, handleSelectPhoneContact]);

  return (
    <View style={styles.container}>
      {!hideLabel && <Text style={styles.label}>{label}</Text>}

      {variant === 'input' ? (
        <>
          <View style={styles.inputCard}>
            <View style={styles.inputMainRow}>
              <View style={[styles.avatarCircle, name.trim() ? styles.avatarCircleFilled : null]}>
                {name.trim() ? (
                  <Text style={styles.avatarText}>{name.trim()[0]?.toUpperCase() ?? ''}</Text>
                ) : (
                  <Feather name="user" size={14} color={C.textMuted} />
                )}
              </View>
              <TextInput
                style={styles.nameInput}
                value={name}
                onChangeText={handleNameChange}
                placeholder={placeholder}
                placeholderTextColor={withAlpha(C.textMuted, 0.6)}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={withAlpha(C.accent, 0.25)}
              />
              {!name.trim() && (
                <TouchableOpacity style={styles.contactsPill} onPress={loadPhoneContacts} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Import from contacts">
                  <Feather name="book" size={12} color={C.accent} />
                  <Text style={styles.contactsPillText}>contacts</Text>
                </TouchableOpacity>
              )}
              {name.length > 0 && (
                <TouchableOpacity onPress={() => onSelect([])} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.inputClearBtn} accessibilityRole="button" accessibilityLabel="Clear">
                  <Feather name="x" size={14} color={C.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>
          {recent.length > 0 && !name.trim() && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} nestedScrollEnabled contentContainerStyle={styles.recentScroll} keyboardShouldPersistTaps="handled">
              {recent.map((c, i) => (
                <Pressable
                  key={c.id ?? i}
                  onPress={() => onSelect([c])}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${c.name}`}
                  style={({ pressed }) => [styles.recentPill, pressed && styles.recentPillPressed]}
                >
                  {({ pressed }) => (
                    <>
                      <View style={[styles.recentPillAvatar, pressed && styles.recentPillAvatarPressed]}>
                        <Text style={[styles.recentPillAvatarText, pressed && styles.recentPillAvatarTextPressed]}>{c.name?.[0]?.toUpperCase() ?? '?'}</Text>
                      </View>
                      <Text style={[styles.recentName, pressed && styles.recentNamePressed]} numberOfLines={1}>{c.name}</Text>
                    </>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          )}
        </>
      ) : (
        <>
      {/* Selected contacts pills */}
      {selectedContacts.length > 0 && (
        <View style={styles.pillContainer}>
          {selectedContacts.map((contact) => (
            <View key={contact.id} style={styles.pill}>
              <Feather name="user" size={14} color={C.accent} />
              <Text style={styles.pillText} numberOfLines={1}>{contact.name}</Text>
              <TouchableOpacity onPress={() => handleRemove(contact.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={14} color={C.textSecondary} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.actionRow}>
        {includeSelf && (() => {
          const selfContact: Contact = { id: '__self__', name: selfName, isFromPhone: false };
          const selfSelected = selectedContacts.some((c) => c.id === '__self__');
          return (
            <TouchableOpacity
              style={[styles.actionButton, selfSelected && styles.actionButtonSelected]}
              onPress={() => {
                if (mode === 'single') {
                  onSelect(selfSelected ? [] : [selfContact]);
                } else {
                  onSelect(selfSelected
                    ? selectedContacts.filter((c) => c.id !== '__self__')
                    : [selfContact, ...selectedContacts.filter((c) => c.id !== '__self__')]
                  );
                }
              }}
              activeOpacity={0.7}
            >
              <Feather name="user" size={14} color={selfSelected ? C.onAccent : C.accent} />
              <Text style={[styles.actionText, selfSelected && styles.actionTextSelected]}>{selfName}</Text>
            </TouchableOpacity>
          );
        })()}
        <TouchableOpacity style={styles.actionButton} onPress={loadPhoneContacts} activeOpacity={0.7}>
          <Feather name="book" size={14} color={C.accent} />
          <Text style={styles.actionText}>from contacts</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => setManualModalVisible(true)} activeOpacity={0.7}>
          <Feather name="edit-3" size={14} color={C.accent} />
          <Text style={styles.actionText}>add manually</Text>
        </TouchableOpacity>
      </View>
        </>
      )}

      {/* Phone Contacts Modal */}
      <Modal visible={phoneModalVisible} animationType="fade" transparent statusBarTranslucent onRequestClose={() => setPhoneModalVisible(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior="padding"
        >
          <Pressable style={{ flex: 1 }} onPress={() => setPhoneModalVisible(false)} />
            <View style={[styles.modalContent, { paddingBottom: Math.max(24, insets.bottom + SPACING.lg) }]} onStartShouldSetResponder={() => true}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Contact</Text>
                <TouchableOpacity onPress={() => { setPhoneModalVisible(false); setSearchQuery(''); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Feather name="x" size={24} color={C.textPrimary} />
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search contacts..."
                placeholderTextColor={C.textSecondary}
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={Keyboard.dismiss}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={withAlpha(C.accent, 0.25)}
              />

              <FlatList
                data={filteredPhoneContacts}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                removeClippedSubviews
                windowSize={5}
                maxToRenderPerBatch={8}
                renderItem={renderPhoneContact}
                ListEmptyComponent={
                  contactsLoading ? (
                    <View style={styles.emptyContainer}>
                      <ActivityIndicator color={C.accent} />
                      <Text style={styles.emptyText}>loading contacts…</Text>
                    </View>
                  ) : (
                    <View style={styles.emptyContainer}>
                      <Feather name="users" size={32} color={C.neutral} />
                      <Text style={styles.emptyText}>No contacts found</Text>
                    </View>
                  )
                }
                showsVerticalScrollIndicator={false}
                style={{ maxHeight: 400 }}
              />

              {mode === 'multi' && (
                <Button
                  title={`Done (${selectedContacts.length} selected)`}
                  onPress={() => { setPhoneModalVisible(false); setSearchQuery(''); }}
                  style={{ marginTop: SPACING.md }}
                />
              )}
            </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Manual Entry Modal */}
      <Modal visible={manualModalVisible} animationType="fade" transparent statusBarTranslucent onRequestClose={() => setManualModalVisible(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <View style={[styles.manualModalSheet, { paddingBottom: Math.max(24, insets.bottom + SPACING.lg) }]} onStartShouldSetResponder={() => true}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Contact</Text>
                <TouchableOpacity onPress={() => { setManualModalVisible(false); setManualName(''); setManualPhone(''); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Feather name="x" size={24} color={C.textPrimary} />
                </TouchableOpacity>
              </View>

              <KeyboardAwareScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bottomOffset={20}
              >
                <Text style={styles.inputLabel}>Name <Text style={{ color: C.neutral }}>*</Text></Text>
                <TextInput
                  style={styles.input}
                  value={manualName}
                  onChangeText={setManualName}
                  placeholder="John Doe"
                  placeholderTextColor={C.textSecondary}
                  returnKeyType="next"
                  autoFocus
                  onSubmitEditing={() => phoneInputRef.current?.focus()}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={withAlpha(C.accent, 0.25)}
                />

                <Text style={styles.inputLabel}>Phone (optional)</Text>
                <TextInput
                  ref={phoneInputRef}
                  style={styles.input}
                  value={manualPhone}
                  onChangeText={setManualPhone}
                  placeholder="+60 12-345 6789"
                  placeholderTextColor={C.textSecondary}
                  keyboardType="phone-pad"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
                  keyboardAppearance={isDark ? 'dark' : 'light'}
                  selectionColor={withAlpha(C.accent, 0.25)}
                />

                <View style={styles.modalActions}>
                  <Button
                    title="Cancel"
                    onPress={() => { setManualModalVisible(false); setManualName(''); setManualPhone(''); }}
                    variant="outline"
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="Add"
                    onPress={handleAddManual}
                    icon="check"
                    style={{ flex: 1 }}
                  />
                </View>
              </KeyboardAwareScrollView>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    marginBottom: SPACING.sm,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: C.textPrimary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  pillContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    backgroundColor: withAlpha(C.accent, 0.1),
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
  },
  pillText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
    maxWidth: 120,
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.sm + 2,
    paddingHorizontal: SPACING.sm,
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: withAlpha(C.textPrimary, 0.08),
  },
  actionText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.accent,
    letterSpacing: 0.1,
  },
  actionButtonSelected: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  actionTextSelected: {
    color: C.onAccent,
  },

  // ── Input variant (matches seller New Order customer input) ──
  inputCard: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },
  inputMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    minHeight: 52,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.sm,
  },
  avatarCircleFilled: {
    backgroundColor: C.bronze,
    borderColor: C.bronze,
  },
  avatarText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.onAccent,
  },
  nameInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.textPrimary,
    paddingVertical: SPACING.sm,
  },
  contactsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.accent, 0.08),
  },
  contactsPillText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: C.accent,
  },
  inputClearBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: withAlpha(C.textMuted, C === CALM_DARK ? 0.16 : 0.08),
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.sm,
  },
  recentScroll: {
    gap: SPACING.xs,
    paddingVertical: SPACING.xs,
    paddingTop: SPACING.sm,
  },
  recentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(C.bronze, 0.06),
  },
  recentPillPressed: {
    backgroundColor: C.bronze,
  },
  recentPillAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: withAlpha(C.bronze, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentPillAvatarPressed: {
    backgroundColor: withAlpha(C.onAccent, 0.2),
  },
  recentPillAvatarText: {
    fontSize: 10,
    fontWeight: '700',
    color: C.bronze,
  },
  recentPillAvatarTextPressed: {
    color: C.onAccent,
  },
  recentName: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
    maxWidth: 100,
  },
  recentNamePressed: {
    color: C.onAccent,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: C.border,
  },
  manualModalSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: C.textPrimary,
  },
  searchInput: {
    backgroundColor: C.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    marginBottom: SPACING.md,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.md,
  },
  contactRowSelected: {
    backgroundColor: withAlpha(C.accent, 0.06),
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withAlpha(C.accent, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  contactAvatarText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: C.accent,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  contactPhone: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING['3xl'],
    gap: SPACING.md,
  },
  emptyText: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textSecondary,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: C.textPrimary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  input: {
    backgroundColor: C.background,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    borderWidth: 1,
    borderColor: C.border,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
});

export default React.memo(ContactPicker);
