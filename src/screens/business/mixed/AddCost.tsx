import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Keyboard,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useBusinessStore } from '../../../store/businessStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { CostCategory } from '../../../types';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../../constants';
import { useCalm } from '../../../hooks/useCalm';
import { useToast } from '../../../context/ToastContext';
import { lightTap, successNotification } from '../../../services/haptics';

const CATEGORIES: { type: CostCategory; emoji: string; label: string; placeholder: string }[] = [
  { type: 'petrol', emoji: '\u26FD', label: 'Petrol', placeholder: 'full tank? top up?' },
  { type: 'maintenance', emoji: '\u{1F527}', label: 'Maintenance', placeholder: 'what was fixed?' },
  { type: 'data', emoji: '\u{1F4F1}', label: 'Data/Phone', placeholder: 'monthly reload?' },
  { type: 'toll', emoji: '\u{1F6E3}\uFE0F', label: 'Toll', placeholder: 'which highway?' },
  { type: 'parking', emoji: '\u{1F17F}\uFE0F', label: 'Parking', placeholder: 'where?' },
  { type: 'insurance', emoji: '\u{1F6E1}\uFE0F', label: 'Insurance', placeholder: 'which coverage?' },
  { type: 'other', emoji: '\u270F\uFE0F', label: 'Other', placeholder: 'what was this?' },
];

const AddCost: React.FC = () => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation();
  const { showToast } = useToast();
  const currency = useSettingsStore((s) => s.currency);
  const { addBusinessTransaction } = useBusinessStore();

  const amountRef = useRef<TextInput>(null);
  const [selectedCategory, setSelectedCategory] = useState<CostCategory | null>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [note, setNote] = useState('');
  const [customCategoryName, setCustomCategoryName] = useState('');
  const [justSaved, setJustSaved] = useState(false);

  const getDateLabel = () => {
    const today = new Date();
    if (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    ) {
      return 'today';
    }
    return format(date, 'MMM dd');
  };

  const handleCategoryTap = (type: CostCategory) => {
    lightTap();
    setSelectedCategory(type);
    setJustSaved(false);
    setTimeout(() => amountRef.current?.focus(), 200);
  };

  const getPlaceholder = () => {
    const cat = CATEGORIES.find((c) => c.type === selectedCategory);
    return cat?.placeholder || 'what was this?';
  };

  const resetForm = () => {
    setAmount('');
    setDate(new Date());
    setNote('');
    setCustomCategoryName('');
    setSelectedCategory(null);
    setJustSaved(true);
  };

  const handleSave = () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0 || !selectedCategory) {
      showToast('Enter a valid amount.', 'error');
      return;
    }

    addBusinessTransaction({
      date,
      amount: parsedAmount,
      type: 'cost',
      roadTransactionType: 'cost',
      costCategory: selectedCategory,
      costCategoryOther: selectedCategory === 'other' ? customCategoryName.trim() || undefined : undefined,
      note: note.trim() || undefined,
      inputMethod: 'manual',
    });

    successNotification();
    showToast('Cost saved.', 'success');
    resetForm();
  };

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {justSaved && !selectedCategory && (
          <View style={styles.savedBanner}>
            <Text style={styles.savedText}>saved. log another or go back.</Text>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
              style={styles.doneLink}
            >
              <Text style={styles.doneLinkText}>done</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Step 1 — Category tiles */}
        {!selectedCategory && (
          <>
            <Text style={styles.heading}>what kind of cost?</Text>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.type}
                  style={styles.categoryTile}
                  onPress={() => handleCategoryTap(cat.type)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                  <Text style={styles.categoryLabel}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Step 2 — Details */}
        {selectedCategory && (
          <>
            <TouchableOpacity
              style={styles.backToCategories}
              onPress={() => setSelectedCategory(null)}
              activeOpacity={0.7}
            >
              <Feather name="chevron-left" size={16} color={C.textSecondary} />
              <Text style={styles.backText}>
                {CATEGORIES.find((c) => c.type === selectedCategory)?.emoji}{' '}
                {CATEGORIES.find((c) => c.type === selectedCategory)?.label}
              </Text>
            </TouchableOpacity>

            {selectedCategory === 'other' && (
              <TextInput
                style={styles.customCategoryInput}
                value={customCategoryName}
                onChangeText={setCustomCategoryName}
                placeholder="what kind of cost?"
                placeholderTextColor={C.textMuted}
                returnKeyType="next"
              />
            )}

            {/* Amount */}
            <View style={styles.amountRow}>
              <Text style={styles.currencySymbol}>{currency}</Text>
              <TextInput
                ref={amountRef}
                style={styles.amountInput}
                value={amount}
                onChangeText={setAmount}
                placeholder="0"
                placeholderTextColor={C.border}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
            </View>

            {/* Date */}
            <TouchableOpacity
              style={styles.fieldRow}
              onPress={() => {
                lightTap();
                setShowDatePicker(!showDatePicker);
              }}
              activeOpacity={0.7}
            >
              <Feather name="calendar" size={18} color={C.textSecondary} />
              <Text style={styles.fieldText}>{getDateLabel()}</Text>
            </TouchableOpacity>

            {showDatePicker && (
              <DateTimePicker
                value={date}
                mode="date"
                display="spinner"
                onChange={(_, selectedDate) => {
                  if (selectedDate) setDate(selectedDate);
                  setShowDatePicker(false);
                }}
                maximumDate={new Date()}
              />
            )}

            {/* Note */}
            <View style={styles.noteRow}>
              <Feather name="edit-3" size={18} color={C.textSecondary} />
              <TextInput
                style={styles.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder={getPlaceholder()}
                placeholderTextColor={C.textMuted}
                returnKeyType="done"
                onSubmitEditing={Keyboard.dismiss}
              />
            </View>

            {/* Save */}
            <TouchableOpacity
              style={[
                styles.saveButton,
                (!amount || parseFloat(amount) <= 0) && styles.saveButtonDisabled,
              ]}
              onPress={handleSave}
              disabled={!amount || parseFloat(amount) <= 0}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.saveButtonText,
                  (!amount || parseFloat(amount) <= 0) && styles.saveButtonTextDisabled,
                ]}
              >
                done
              </Text>
            </TouchableOpacity>
          </>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
};

const makeStyles = (C: typeof CALM) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING['2xl'],
    paddingBottom: SPACING['5xl'],
  },

  heading: {
    fontSize: TYPOGRAPHY.size['2xl'],
    fontWeight: TYPOGRAPHY.weight.light,
    color: C.textPrimary,
    marginBottom: SPACING['2xl'],
    marginTop: SPACING.md,
  },

  savedBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    marginBottom: SPACING.lg,
  },
  savedText: {
    ...TYPE.muted,
    color: C.textSecondary,
  },
  doneLink: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
  },
  doneLinkText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.bronze,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  categoryTile: {
    width: '31%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.lg,
    borderRadius: RADIUS.lg,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.bar,
    minHeight: 80,
  },
  categoryEmoji: {
    fontSize: 24,
    marginBottom: SPACING.xs,
  },
  categoryLabel: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },

  backToCategories: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    marginBottom: SPACING.xl,
    paddingVertical: SPACING.sm,
  },
  backText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },

  customCategoryInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: SPACING.lg,
    marginBottom: SPACING.lg,
    minHeight: 44,
  },

  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING['2xl'],
  },
  currencySymbol: {
    ...TYPE.amount,
    color: C.textSecondary,
    marginRight: SPACING.sm,
  },
  amountInput: {
    ...TYPE.amount,
    color: C.textPrimary,
    minWidth: 100,
    textAlign: 'center',
  },

  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    minHeight: 44,
  },
  fieldText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },

  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  noteInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },

  saveButton: {
    backgroundColor: C.bronze,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
    marginTop: SPACING['2xl'],
    minHeight: 44,
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: C.border,
  },
  saveButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#FFFFFF',
  },
  saveButtonTextDisabled: {
    color: C.textMuted,
  },
});

export default AddCost;
