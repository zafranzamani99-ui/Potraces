import React, { useState, useRef, useEffect, useMemo } from 'react';
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
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../../constants';
import { useCalm } from '../../../hooks/useCalm';
import { useToast } from '../../../context/ToastContext';
import { lightTap, successNotification } from '../../../services/haptics';

const PLATFORMS = ['Grab', 'Foodpanda', 'Lalamove', 'ShopeeFood', 'Other'];

const AddEarnings: React.FC = () => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation();
  const { showToast } = useToast();
  const currency = useSettingsStore((s) => s.currency);
  const { addBusinessTransaction } = useBusinessStore();

  const amountRef = useRef<TextInput>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [platform, setPlatform] = useState<string | null>(null);
  const [customPlatform, setCustomPlatform] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => amountRef.current?.focus(), 300);
    return () => clearTimeout(timer);
  }, []);

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

  const handlePlatformTap = (p: string) => {
    lightTap();
    if (platform === p) {
      setPlatform(null);
      setCustomPlatform('');
    } else {
      setPlatform(p);
      if (p !== 'Other') setCustomPlatform('');
    }
  };

  const handleSave = () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      showToast('Enter a valid amount.', 'error');
      return;
    }

    const resolvedPlatform =
      platform === 'Other' && customPlatform.trim()
        ? customPlatform.trim()
        : platform === 'Other'
        ? undefined
        : platform || undefined;

    addBusinessTransaction({
      date,
      amount: parsedAmount,
      type: 'income',
      roadTransactionType: 'earning',
      platform: resolvedPlatform,
      note: note.trim() || undefined,
      inputMethod: 'manual',
    });

    successNotification();
    showToast('Earnings logged.', 'success');
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
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

        {/* Platform */}
        <View style={styles.platformSection}>
          <View style={styles.platformRow}>
            {PLATFORMS.map((p) => (
              <TouchableOpacity
                key={p}
                style={[
                  styles.platformPill,
                  platform === p && styles.platformPillActive,
                ]}
                onPress={() => handlePlatformTap(p)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.platformText,
                    platform === p && styles.platformTextActive,
                  ]}
                >
                  {p}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {platform === 'Other' && (
            <TextInput
              style={styles.customPlatformInput}
              value={customPlatform}
              onChangeText={setCustomPlatform}
              placeholder="which platform?"
              placeholderTextColor={C.textMuted}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
              autoFocus
            />
          )}
        </View>

        {/* Note */}
        <View style={styles.noteRow}>
          <Feather name="edit-3" size={18} color={C.textSecondary} />
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="good day? slow day?"
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

  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING['2xl'],
    marginTop: SPACING.xl,
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

  platformSection: {
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  platformRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  platformPill: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: C.bar,
  },
  platformPillActive: {
    backgroundColor: C.bronze,
  },
  platformText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
  platformTextActive: {
    color: '#FFFFFF',
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  customPlatformInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    marginTop: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: SPACING.sm,
    minHeight: 44,
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

export default AddEarnings;
