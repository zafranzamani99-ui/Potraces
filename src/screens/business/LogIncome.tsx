import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useNavigation } from '@react-navigation/native';
import { useBusinessStore } from '../../store/businessStore';
import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { parseTextInput } from '../../services/aiService';
import { transcribeAudio } from '../../services/speechService';
import { createTransfer } from '../../utils/transferBridge';

type InputMode = 'text' | 'voice';

const PLACEHOLDERS: Record<string, string> = {
  freelance: 'who paid you and how much? e.g. client sarah rm800',
  parttime: 'log your pay e.g. shift pay rm150 or bonus rm200',
  rider: 'log your transfer e.g. grab weekly rm620',
  mixed: 'what came in? e.g. rm300 freelance logo job',
  seller: 'describe what came in e.g. sold 5 nasi lemak rm50',
};

const LogIncome: React.FC = () => {
  const { incomeType, incomeStreams, addBusinessTransaction, addRiderCost, addTransfer } =
    useBusinessStore();
  const { addTransferIncome } = usePersonalStore();
  const currency = useSettingsStore((s) => s.currency);
  const navigation = useNavigation<any>();

  const [mode, setMode] = useState<InputMode>('text');
  const [textInput, setTextInput] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [selectedStreamId, setSelectedStreamId] = useState<string | undefined>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lastTxId, setLastTxId] = useState<string | null>(null);
  const [showTransferPrompt, setShowTransferPrompt] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [showCostEntry, setShowCostEntry] = useState(false);
  const [costType, setCostType] = useState<'petrol' | 'maintenance' | 'data' | 'other'>('petrol');
  const [costAmount, setCostAmount] = useState('');
  const recordingRef = useRef<Audio.Recording | null>(null);
  const transferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (transferTimerRef.current) clearTimeout(transferTimerRef.current);
    };
  }, []);

  const placeholder = PLACEHOLDERS[incomeType || 'seller'] || PLACEHOLDERS.seller;

  const handleTextParse = useCallback(async () => {
    if (!textInput.trim()) return;
    setIsProcessing(true);
    const result = await parseTextInput(textInput.trim());
    if (result) {
      setAmount(result.amount.toString());
      setNote(result.description);
    }
    setIsProcessing(false);
  }, [textInput]);

  const handleVoiceStart = useCallback(async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
    } catch {
      // silently fail
    }
  }, []);

  const handleVoiceStop = useCallback(async () => {
    if (!recordingRef.current) return;
    setIsRecording(false);
    setIsProcessing(true);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      if (uri) {
        const transcript = await transcribeAudio(uri);
        if (transcript) {
          setTextInput(transcript);
          const result = await parseTextInput(transcript);
          if (result) {
            setAmount(result.amount.toString());
            setNote(result.description);
          }
        }
      }
    } catch {
      // silently fail
    }
    setIsProcessing(false);
  }, []);

  const handleSave = useCallback(() => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) return;

    const txId = addBusinessTransaction({
      date: new Date(),
      amount: numAmount,
      type: 'income',
      streamId: selectedStreamId,
      note: note || undefined,
      rawInput: textInput || undefined,
      inputMethod: mode === 'voice' ? 'voice' : textInput ? 'text' : 'manual',
    });

    setLastTxId(txId || '');
    setSaved(true);
    setShowTransferPrompt(true);
    setTransferAmount(amount);

    // Auto-dismiss transfer prompt after 3 seconds
    transferTimerRef.current = setTimeout(() => {
      setShowTransferPrompt(false);
    }, 3000);
  }, [amount, note, textInput, selectedStreamId, mode, addBusinessTransaction]);

  const handleTransfer = useCallback(() => {
    const numAmount = parseFloat(transferAmount);
    if (!numAmount || numAmount <= 0) return;

    const transfer = createTransfer(numAmount, 'business', 'personal', undefined, lastTxId || undefined);
    addTransfer(transfer);
    addTransferIncome(transfer);
    setShowTransferPrompt(false);
    if (transferTimerRef.current) clearTimeout(transferTimerRef.current);
  }, [transferAmount, lastTxId, addTransfer, addTransferIncome]);

  const handleSaveCost = useCallback(() => {
    const numAmount = parseFloat(costAmount);
    if (!numAmount || numAmount <= 0) return;
    addRiderCost({
      date: new Date(),
      type: costType,
      amount: numAmount,
    });
    setShowCostEntry(false);
    setCostAmount('');
  }, [costAmount, costType, addRiderCost]);

  const handleReset = () => {
    setSaved(false);
    setAmount('');
    setNote('');
    setTextInput('');
    setShowTransferPrompt(false);
    setLastTxId(null);
    if (transferTimerRef.current) clearTimeout(transferTimerRef.current);
  };

  if (saved) {
    return (
      <View style={styles.container}>
        <View style={styles.savedContainer}>
          <Feather name="check-circle" size={48} color={CALM.positive} />
          <Text style={styles.savedText}>saved.</Text>

          {showTransferPrompt && (
            <View style={styles.transferPrompt}>
              <Text style={styles.transferQuestion}>
                did any of this move to your personal wallet?
              </Text>
              <TouchableOpacity onPress={handleTransfer} style={styles.transferLink}>
                <Text style={styles.transferLinkText}>log transfer</Text>
              </TouchableOpacity>
              <TextInput
                style={styles.transferInput}
                value={transferAmount}
                onChangeText={setTransferAmount}
                keyboardType="numeric"
                placeholder="amount"
                placeholderTextColor={CALM.textSecondary}
              />
            </View>
          )}

          {incomeType === 'rider' && !showCostEntry && (
            <TouchableOpacity onPress={() => setShowCostEntry(true)} style={styles.costLink}>
              <Text style={styles.costLinkText}>log a cost for this day</Text>
            </TouchableOpacity>
          )}

          {showCostEntry && (
            <View style={styles.costEntry}>
              <View style={styles.costTypes}>
                {(['petrol', 'maintenance', 'data', 'other'] as const).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.costTypeChip, costType === type && styles.costTypeSelected]}
                    onPress={() => setCostType(type)}
                  >
                    <Text
                      style={[styles.costTypeText, costType === type && styles.costTypeTextSelected]}
                    >
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.costAmountInput}
                value={costAmount}
                onChangeText={setCostAmount}
                keyboardType="numeric"
                placeholder="amount"
                placeholderTextColor={CALM.textSecondary}
              />
              <TouchableOpacity onPress={handleSaveCost} style={styles.costSaveButton}>
                <Text style={styles.costSaveText}>done</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity onPress={handleReset} style={styles.anotherButton}>
            <Text style={styles.anotherText}>log another</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Amount */}
        <View style={styles.amountRow}>
          <Text style={styles.currencyLabel}>{currency}</Text>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={CALM.border}
          />
        </View>

        {/* Input mode pills */}
        <View style={styles.modePills}>
          <TouchableOpacity
            style={[styles.pill, mode === 'text' && styles.pillActive]}
            onPress={() => setMode('text')}
          >
            <Feather name="type" size={16} color={mode === 'text' ? '#fff' : CALM.textSecondary} />
            <Text style={[styles.pillText, mode === 'text' && styles.pillTextActive]}>type</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pill, mode === 'voice' && styles.pillActive]}
            onPress={() => setMode('voice')}
          >
            <Feather name="mic" size={16} color={mode === 'voice' ? '#fff' : CALM.textSecondary} />
            <Text style={[styles.pillText, mode === 'voice' && styles.pillTextActive]}>voice</Text>
          </TouchableOpacity>
        </View>

        {/* Input area */}
        {mode === 'text' && (
          <View style={styles.inputSection}>
            <TextInput
              style={styles.textArea}
              value={textInput}
              onChangeText={setTextInput}
              placeholder={placeholder}
              placeholderTextColor={CALM.textSecondary}
              multiline
              onSubmitEditing={handleTextParse}
              returnKeyType="done"
            />
            {textInput.trim().length > 0 && (
              <TouchableOpacity onPress={handleTextParse} style={styles.parseButton}>
                <Text style={styles.parseButtonText}>parse</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {mode === 'voice' && (
          <TouchableOpacity
            style={[styles.voiceButton, isRecording && styles.voiceButtonRecording]}
            onPressIn={handleVoiceStart}
            onPressOut={handleVoiceStop}
            activeOpacity={0.7}
          >
            <Feather name="mic" size={32} color={isRecording ? '#fff' : CALM.bronze} />
            <Text style={[styles.voiceHint, isRecording && styles.voiceHintRecording]}>
              {isRecording ? 'listening...' : 'hold to speak'}
            </Text>
          </TouchableOpacity>
        )}

        {isProcessing && (
          <View style={styles.processingRow}>
            <ActivityIndicator size="small" color={CALM.bronze} />
            <Text style={styles.processingText}>processing...</Text>
          </View>
        )}

        {/* Secondary fields */}
        <TextInput
          style={styles.noteInput}
          value={note}
          onChangeText={setNote}
          placeholder="note (optional)"
          placeholderTextColor={CALM.textSecondary}
        />

        {/* Stream selector for mixed/parttime */}
        {(incomeType === 'mixed' || incomeType === 'parttime') && incomeStreams.length > 0 && (
          <View style={styles.streamSelector}>
            <Text style={styles.streamSelectorLabel}>source</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.streamChips}>
                {incomeStreams.map((stream) => (
                  <TouchableOpacity
                    key={stream.id}
                    style={[
                      styles.streamChip,
                      selectedStreamId === stream.id && styles.streamChipSelected,
                    ]}
                    onPress={() =>
                      setSelectedStreamId(selectedStreamId === stream.id ? undefined : stream.id)
                    }
                  >
                    <Text
                      style={[
                        styles.streamChipText,
                        selectedStreamId === stream.id && styles.streamChipTextSelected,
                      ]}
                    >
                      {stream.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Save */}
        <TouchableOpacity
          style={[styles.saveButton, (!amount || parseFloat(amount) <= 0) && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!amount || parseFloat(amount) <= 0}
        >
          <Text style={styles.saveText}>save</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  scrollContent: {
    padding: SPACING['2xl'],
  },

  // Amount
  amountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: SPACING.xl,
  },
  currencyLabel: {
    ...TYPE.label,
    marginRight: SPACING.sm,
    marginTop: SPACING.md,
  },
  amountInput: {
    ...TYPE.amount,
    color: CALM.textPrimary,
    flex: 1,
  },

  // Mode pills
  modePills: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  pillActive: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  pillText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  pillTextActive: {
    color: '#fff',
  },

  // Text input
  inputSection: {
    marginBottom: SPACING.lg,
  },
  textArea: {
    ...TYPE.insight,
    color: CALM.textPrimary,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.lg,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  parseButton: {
    alignSelf: 'flex-end',
    marginTop: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.full,
  },
  parseButtonText: {
    color: '#fff',
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // Voice
  voiceButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING['2xl'],
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    marginBottom: SPACING.lg,
    gap: SPACING.sm,
  },
  voiceButtonRecording: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  voiceHint: {
    ...TYPE.muted,
    color: CALM.textSecondary,
  },
  voiceHintRecording: {
    color: '#fff',
  },

  // Processing
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  processingText: {
    ...TYPE.muted,
    color: CALM.bronze,
  },

  // Note
  noteInput: {
    ...TYPE.insight,
    color: CALM.textPrimary,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    padding: SPACING.lg,
    marginBottom: SPACING.lg,
  },

  // Stream selector
  streamSelector: {
    marginBottom: SPACING.lg,
  },
  streamSelectorLabel: {
    ...TYPE.label,
    marginBottom: SPACING.sm,
  },
  streamChips: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  streamChip: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  streamChipSelected: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  streamChipText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },
  streamChipTextSelected: {
    color: '#fff',
  },

  // Save
  saveButton: {
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: CALM.border,
  },
  saveText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },

  // Saved state
  savedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING['2xl'],
    gap: SPACING.lg,
  },
  savedText: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },

  // Transfer prompt
  transferPrompt: {
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  transferQuestion: {
    ...TYPE.muted,
    color: CALM.textSecondary,
    textAlign: 'center',
  },
  transferLink: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  transferLinkText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.bronze,
  },
  transferInput: {
    ...TYPE.insight,
    color: CALM.textPrimary,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    width: 150,
    textAlign: 'center',
  },

  // Rider cost entry
  costLink: {
    paddingVertical: SPACING.md,
  },
  costLinkText: {
    ...TYPE.label,
    color: CALM.textSecondary,
  },
  costEntry: {
    alignItems: 'center',
    gap: SPACING.md,
    width: '100%',
  },
  costTypes: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  costTypeChip: {
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  costTypeSelected: {
    backgroundColor: CALM.bronze,
    borderColor: CALM.bronze,
  },
  costTypeText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
  },
  costTypeTextSelected: {
    color: '#fff',
  },
  costAmountInput: {
    ...TYPE.insight,
    color: CALM.textPrimary,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    width: 150,
    textAlign: 'center',
  },
  costSaveButton: {
    backgroundColor: CALM.bronze,
    borderRadius: RADIUS.full,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl,
  },
  costSaveText: {
    color: '#fff',
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // Another button
  anotherButton: {
    paddingVertical: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
  },
  anotherText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.bronze,
  },
});

export default LogIncome;
