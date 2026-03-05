import React, { useState, useRef } from 'react';
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
  Keyboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { Contact } from '../../types';
import Button from './Button';

interface ContactPickerProps {
  selectedContacts: Contact[];
  onSelect: (contacts: Contact[]) => void;
  mode?: 'single' | 'multi';
  label?: string;
}

const ContactPicker: React.FC<ContactPickerProps> = ({
  selectedContacts,
  onSelect,
  mode = 'single',
  label = 'Contact',
}) => {
  const [phoneModalVisible, setPhoneModalVisible] = useState(false);
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [phoneContacts, setPhoneContacts] = useState<Contact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const phoneInputRef = useRef<TextInput>(null);

  const loadPhoneContacts = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
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
    setPhoneModalVisible(true);
  };

  const handleSelectPhoneContact = (contact: Contact) => {
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
  };

  const handleAddManual = () => {
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
  };

  const handleRemove = (contactId: string) => {
    onSelect(selectedContacts.filter((c) => c.id !== contactId));
  };

  const filteredPhoneContacts = phoneContacts.filter((c) =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>

      {/* Selected contacts pills */}
      {selectedContacts.length > 0 && (
        <View style={styles.pillContainer}>
          {selectedContacts.map((contact) => (
            <View key={contact.id} style={styles.pill}>
              <Feather name="user" size={14} color={CALM.accent} />
              <Text style={styles.pillText} numberOfLines={1}>{contact.name}</Text>
              <TouchableOpacity onPress={() => handleRemove(contact.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={14} color={CALM.textSecondary} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Action buttons */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionButton} onPress={loadPhoneContacts} activeOpacity={0.7}>
          <Feather name="book" size={18} color={CALM.accent} />
          <Text style={styles.actionText}>From Contacts</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton} onPress={() => setManualModalVisible(true)} activeOpacity={0.7}>
          <Feather name="edit-3" size={18} color={CALM.accent} />
          <Text style={styles.actionText}>Add Manually</Text>
        </TouchableOpacity>
      </View>

      {/* Phone Contacts Modal */}
      <Modal visible={phoneModalVisible} animationType="fade" transparent onRequestClose={() => setPhoneModalVisible(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={{ flex: 1 }} onPress={() => setPhoneModalVisible(false)} />
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Select Contact</Text>
                <TouchableOpacity onPress={() => { setPhoneModalVisible(false); setSearchQuery(''); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Feather name="x" size={24} color={CALM.textPrimary} />
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search contacts..."
                placeholderTextColor={CALM.textSecondary}
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={Keyboard.dismiss}
              />

              <FlatList
                data={filteredPhoneContacts}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                renderItem={({ item }) => {
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
                        <Feather name="check-circle" size={20} color={CALM.positive} />
                      )}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <Feather name="users" size={32} color={CALM.neutral} />
                    <Text style={styles.emptyText}>No contacts found</Text>
                  </View>
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
      <Modal visible={manualModalVisible} animationType="fade" transparent onRequestClose={() => setManualModalVisible(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <View style={styles.manualModalSheet} onStartShouldSetResponder={() => true}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Contact</Text>
                <TouchableOpacity onPress={() => { setManualModalVisible(false); setManualName(''); setManualPhone(''); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Feather name="x" size={24} color={CALM.textPrimary} />
                </TouchableOpacity>
              </View>

              <KeyboardAwareScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                bottomOffset={20}
              >
                <Text style={styles.inputLabel}>Name <Text style={{ color: CALM.neutral }}>*</Text></Text>
                <TextInput
                  style={styles.input}
                  value={manualName}
                  onChangeText={setManualName}
                  placeholder="John Doe"
                  placeholderTextColor={CALM.textSecondary}
                  returnKeyType="next"
                  autoFocus
                  onSubmitEditing={() => phoneInputRef.current?.focus()}
                />

                <Text style={styles.inputLabel}>Phone (optional)</Text>
                <TextInput
                  ref={phoneInputRef}
                  style={styles.input}
                  value={manualPhone}
                  onChangeText={setManualPhone}
                  placeholder="+60 12-345 6789"
                  placeholderTextColor={CALM.textSecondary}
                  keyboardType="phone-pad"
                  returnKeyType="done"
                  onSubmitEditing={Keyboard.dismiss}
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

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.sm,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: CALM.textPrimary,
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
    backgroundColor: withAlpha(CALM.accent, 0.1),
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
  },
  pillText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
    maxWidth: 120,
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.md,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  actionText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.accent,
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: CALM.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: CALM.border,
  },
  manualModalSheet: {
    backgroundColor: CALM.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: CALM.border,
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
    color: CALM.textPrimary,
  },
  searchInput: {
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: 16,
    color: CALM.textPrimary,
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
    backgroundColor: withAlpha(CALM.accent, 0.06),
  },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withAlpha(CALM.accent, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  contactAvatarText: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.accent,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  contactPhone: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: SPACING['3xl'],
    gap: SPACING.md,
  },
  emptyText: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textSecondary,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: CALM.textPrimary,
    marginBottom: SPACING.sm,
    marginTop: SPACING.lg,
  },
  input: {
    backgroundColor: CALM.background,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: CALM.textPrimary,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
});

export default ContactPicker;
