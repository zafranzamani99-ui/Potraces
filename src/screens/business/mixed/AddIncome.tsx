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
import { useMixedStore } from '../../../store/mixedStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../../constants';
import { useCalm } from '../../../hooks/useCalm';
import { useToast } from '../../../context/ToastContext';
import { lightTap, successNotification } from '../../../services/haptics';

const AddIncome: React.FC = () => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation();
  const { showToast } = useToast();
  const currency = useSettingsStore((s) => s.currency);
  const { addBusinessTransaction } = useBusinessStore();
  const { mixedDetails, lastUsedStream, setLastUsedStream, addStream } = useMixedStore();

  const amountRef = useRef<TextInput>(null);
  const newStreamRef = useRef<TextInput>(null);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedStream, setSelectedStream] = useState<string | null>(lastUsedStream);
  const [showNewStreamInput, setShowNewStreamInput] = useState(false);
  const [newStreamName, setNewStreamName] = useState('');
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

  const handleStreamTap = (stream: string) => {
    lightTap();
    if (selectedStream === stream) {
      setSelectedStream(null);
    } else {
      setSelectedStream(stream);
      setShowNewStreamInput(false);
      setNewStreamName('');
    }
  };

  const handleNewStreamTap = () => {
    lightTap();
    setSelectedStream(null);
    setShowNewStreamInput(true);
    setTimeout(() => newStreamRef.current?.focus(), 200);
  };

  const handleNewStreamSubmit = () => {
    const trimmed = newStreamName.trim();
    if (!trimmed) {
      setShowNewStreamInput(false);
      return;
    }
    addStream(trimmed);
    setSelectedStream(trimmed);
    setShowNewStreamInput(false);
    setNewStreamName('');
  };

  const handleSave = () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      showToast('Enter a valid amount.', 'error');
      return;
    }

    const resolvedStream = selectedStream || undefined;

    addBusinessTransaction({
      date,
      amount: parsedAmount,
      type: 'income',
      roadTransactionType: 'earning',
      streamLabel: resolvedStream,
      note: note.trim() || undefined,
      inputMethod: 'manual',
    });

    if (resolvedStream) {
      setLastUsedStream(resolvedStream);
    }

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

        {/* Stream pills */}
        {mixedDetails.streams.length > 0 && (
          <View style={styles.streamSection}>
            <View style={styles.streamRow}>
              {mixedDetails.streams.map((stream) => (
                <TouchableOpacity
                  key={stream}
                  style={[
                    styles.streamPill,
                    selectedStream === stream && styles.streamPillActive,
                  ]}
                  onPress={() => handleStreamTap(stream)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.streamText,
                      selectedStream === stream && styles.streamTextActive,
                    ]}
                  >
                    {stream}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[
                  styles.streamPill,
                  showNewStreamInput && styles.streamPillActive,
                ]}
                onPress={handleNewStreamTap}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.streamText,
                    showNewStreamInput && styles.streamTextActive,
                  ]}
                >
                  + new
                </Text>
              </TouchableOpacity>
            </View>

            {showNewStreamInput && (
              <TextInput
                ref={newStreamRef}
                style={styles.newStreamInput}
                value={newStreamName}
                onChangeText={setNewStreamName}
                placeholder="new source name"
                placeholderTextColor={C.textMuted}
                returnKeyType="done"
                onSubmitEditing={handleNewStreamSubmit}
                onBlur={handleNewStreamSubmit}
              />
            )}
          </View>
        )}

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
            placeholder="any notes?"
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

  streamSection: {
    paddingVertical: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  streamRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  streamPill: {
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: C.bar,
  },
  streamPillActive: {
    backgroundColor: C.bronze,
  },
  streamText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: C.textSecondary,
  },
  streamTextActive: {
    color: '#FFFFFF',
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  newStreamInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    marginTop: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingVertical: SPACING.sm,
    minHeight: 44,
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

export default AddIncome;
