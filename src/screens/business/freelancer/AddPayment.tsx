import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Keyboard,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format, differenceInDays } from 'date-fns';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useFreelancerStore } from '../../../store/freelancerStore';
import { useBusinessStore } from '../../../store/businessStore';
import { useSettingsStore } from '../../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../../constants';
import { useCalm } from '../../../hooks/useCalm';
import { useToast } from '../../../context/ToastContext';
import { lightTap, successNotification } from '../../../services/haptics';

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

const AddPayment: React.FC = () => {
  const C = useCalm();
  const styles = useMemo(() => makeStyles(C), [C]);
  const navigation = useNavigation();
  const { showToast } = useToast();
  const currency = useSettingsStore((s) => s.currency);
  const { clients, addClient, getClientPayments } = useFreelancerStore();
  const { addBusinessTransaction } = useBusinessStore();

  const amountRef = useRef<TextInput>(null);
  const [amount, setAmount] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [newClientName, setNewClientName] = useState('');
  const [isNewClient, setIsNewClient] = useState(false);
  const [date, setDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [note, setNote] = useState('');
  const [showClientPicker, setShowClientPicker] = useState(false);

  // Auto-detect prompt
  const [showAutoDetectPrompt, setShowAutoDetectPrompt] = useState(false);
  const [autoDetectName, setAutoDetectName] = useState('');
  const [autoDetectTxId, setAutoDetectTxId] = useState<string | null>(null);
  const promptOpacity = useRef(new Animated.Value(0)).current;

  // Auto-focus amount
  useEffect(() => {
    const timer = setTimeout(() => amountRef.current?.focus(), 300);
    return () => clearTimeout(timer);
  }, []);

  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => a.name.localeCompare(b.name)),
    [clients]
  );

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

  const handleSelectClient = (clientId: string | 'new') => {
    if (clientId === 'new') {
      setIsNewClient(true);
      setSelectedClientId(null);
    } else {
      setIsNewClient(false);
      setSelectedClientId(clientId);
    }
    setShowClientPicker(false);
  };

  const getSelectedClientName = () => {
    if (isNewClient) return newClientName || 'new client';
    if (selectedClientId) {
      return clients.find((c) => c.id === selectedClientId)?.name || 'select client';
    }
    return 'select client';
  };

  const handleSave = () => {
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      showToast('Enter a valid amount.', 'error');
      return;
    }

    let clientId = selectedClientId;

    // Create new client if needed
    if (isNewClient && newClientName.trim()) {
      const newClient = addClient({
        name: newClientName.trim(),
        isAutoDetected: false,
      });
      clientId = newClient.id;
    }

    // Calculate gap from last payment
    let gapFromLastPayment: number | undefined;
    if (clientId) {
      const prevPayments = getClientPayments(clientId);
      if (prevPayments.length > 0) {
        gapFromLastPayment = differenceInDays(
          date,
          toDate(prevPayments[0].date)
        );
      }
    }

    // Create business transaction
    const txId = addBusinessTransaction({
      date,
      amount: parsedAmount,
      type: 'income',
      clientId: clientId || undefined,
      note: note.trim() || undefined,
      gapFromLastPayment,
      inputMethod: 'manual',
    });

    // If no client was selected and there's a note that could be a name, show auto-detect prompt
    if (!clientId && note.trim() && !isNewClient) {
      const matchesExisting = clients.some(
        (c) => c.name.toLowerCase() === note.trim().toLowerCase()
      );
      if (!matchesExisting) {
        setAutoDetectName(note.trim());
        setAutoDetectTxId(txId as unknown as string);
        setShowAutoDetectPrompt(true);
        Animated.timing(promptOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();

        // Auto-dismiss after 3 seconds
        setTimeout(() => {
          Animated.timing(promptOpacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start(() => setShowAutoDetectPrompt(false));
        }, 3000);
      }
    }

    successNotification();
    showToast('Payment logged.', 'success');
    navigation.goBack();
  };

  const handleAutoDetectSave = () => {
    if (!autoDetectName.trim()) return;
    const newClient = addClient({
      name: autoDetectName.trim(),
      isAutoDetected: true,
    });

    // Link the transaction to this new client
    if (autoDetectTxId) {
      const bizState = useBusinessStore.getState();
      useBusinessStore.setState({
        businessTransactions: bizState.businessTransactions.map((t) =>
          t.id === autoDetectTxId
            ? { ...t, clientId: newClient.id }
            : t
        ),
      });
    }

    setShowAutoDetectPrompt(false);
    showToast('Client saved.', 'success');
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

        {/* Client picker */}
        <TouchableOpacity
          style={styles.fieldRow}
          onPress={() => {
            lightTap();
            setShowClientPicker(!showClientPicker);
          }}
          activeOpacity={0.7}
        >
          <Feather name="user" size={18} color={C.textSecondary} />
          <Text
            style={[
              styles.fieldText,
              !selectedClientId && !isNewClient && styles.fieldPlaceholder,
            ]}
          >
            {getSelectedClientName()}
          </Text>
          <Feather
            name={showClientPicker ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={C.textMuted}
          />
        </TouchableOpacity>

        {/* Client picker list */}
        {showClientPicker && (
          <View style={styles.clientPickerList}>
            {sortedClients.map((client) => (
              <TouchableOpacity
                key={client.id}
                style={styles.clientPickerItem}
                onPress={() => handleSelectClient(client.id)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.clientPickerText,
                    selectedClientId === client.id && styles.clientPickerTextActive,
                  ]}
                >
                  {client.name}
                </Text>
                {selectedClientId === client.id && (
                  <Feather name="check" size={16} color={C.bronze} />
                )}
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.clientPickerItem}
              onPress={() => handleSelectClient('new')}
              activeOpacity={0.7}
            >
              <Text style={styles.newClientText}>+ new client</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* New client inline input */}
        {isNewClient && (
          <TextInput
            style={styles.inlineInput}
            value={newClientName}
            onChangeText={setNewClientName}
            placeholder="client name"
            placeholderTextColor={C.textMuted}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />
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

      {/* Auto-detect prompt */}
      {showAutoDetectPrompt && (
        <Animated.View style={[styles.autoDetectPrompt, { opacity: promptOpacity }]}>
          <Text style={styles.autoDetectText}>
            new client?
          </Text>
          <TouchableOpacity onPress={handleAutoDetectSave}>
            <Text style={styles.autoDetectAction}>save as client</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
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
  fieldPlaceholder: {
    color: C.textMuted,
  },

  // Client picker
  clientPickerList: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: C.border,
  },
  clientPickerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    minHeight: 44,
  },
  clientPickerText: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },
  clientPickerTextActive: {
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
  },
  newClientText: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textSecondary,
  },

  // Inline input
  inlineInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: C.bronze,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.sm,
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

  // Auto-detect prompt
  autoDetectPrompt: {
    position: 'absolute',
    bottom: SPACING['2xl'],
    left: SPACING['2xl'],
    right: SPACING['2xl'],
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: C.border,
  },
  autoDetectText: {
    ...TYPE.muted,
    flex: 1,
  },
  autoDetectAction: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.bronze,
  },
});

export default AddPayment;
