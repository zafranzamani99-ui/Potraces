import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Keyboard,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { usePartTimeStore } from '../../../store/partTimeStore';
import { useBusinessStore } from '../../../store/businessStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../../constants';
import { useCalm } from '../../../hooks/useCalm';
import { useToast } from '../../../context/ToastContext';
import { lightTap, successNotification } from '../../../services/haptics';
import { RootStackParamList } from '../../../types';

const AddIncome: React.FC = () => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'PartTimeAddIncome'>>();
  const { showToast } = useToast();
  const currency = useSettingsStore((s) => s.currency);
  const { jobDetails } = usePartTimeStore();
  const { addBusinessTransaction } = useBusinessStore();

  const preSelectMain = route.params?.preSelectMain ?? false;

  const amountRef = useRef<TextInput>(null);
  const [amount, setAmount] = useState(
    preSelectMain && jobDetails.expectedMonthlyPay
      ? String(jobDetails.expectedMonthlyPay)
      : ''
  );
  const [stream, setStream] = useState<'main' | 'side'>(preSelectMain ? 'main' : 'side');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [note, setNote] = useState('');

  // Auto-focus amount
  useEffect(() => {
    const timer = setTimeout(() => amountRef.current?.focus(), 300);
    return () => clearTimeout(timer);
  }, []);

  // Auto-tag logic
  useEffect(() => {
    if (preSelectMain) return; // pre-selection overrides auto-tag
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setStream('side');
      return;
    }

    if (jobDetails.expectedMonthlyPay && jobDetails.payDay) {
      const ratio = parsedAmount / jobDetails.expectedMonthlyPay;
      const now = new Date();
      const dayOfMonth = now.getDate();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const effectivePayDay = Math.min(jobDetails.payDay, daysInMonth);
      const dayDiff = Math.abs(dayOfMonth - effectivePayDay);

      if (ratio >= 0.8 && ratio <= 1.2 && dayDiff <= 3) {
        setStream('main');
      } else {
        setStream('side');
      }
    }
  }, [amount]);

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

  const handleSave = () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      showToast('Enter a valid amount.', 'error');
      return;
    }

    addBusinessTransaction({
      date,
      amount: parsedAmount,
      type: 'income',
      incomeStream: stream,
      note: note.trim() || undefined,
      inputMethod: 'manual',
    });

    successNotification();
    showToast('Income logged.', 'success');
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

        {/* Stream toggle */}
        <View style={styles.streamToggle}>
          <TouchableOpacity
            style={[
              styles.streamButton,
              stream === 'main' && styles.streamButtonActive,
            ]}
            onPress={() => {
              lightTap();
              setStream('main');
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.streamButtonText,
                stream === 'main' && styles.streamButtonTextActive,
              ]}
            >
              main job
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.streamButton,
              stream === 'side' && styles.streamButtonActive,
            ]}
            onPress={() => {
              lightTap();
              setStream('side');
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.streamButtonText,
                stream === 'side' && styles.streamButtonTextActive,
              ]}
            >
              side income
            </Text>
          </TouchableOpacity>
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
            placeholder="what was this for?"
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
            save
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

  // Amount
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

  // Stream toggle
  streamToggle: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING['2xl'],
  },
  streamButton: {
    flex: 1,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderRadius: RADIUS.lg,
    backgroundColor: C.background,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 44,
    justifyContent: 'center',
  },
  streamButtonActive: {
    backgroundColor: C.bronze,
    borderColor: C.bronze,
  },
  streamButtonText: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textSecondary,
  },
  streamButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: TYPOGRAPHY.weight.semibold,
  },

  // Fields
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

  // Note
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

  // Save
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

export default AddIncome;
