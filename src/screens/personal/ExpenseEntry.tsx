import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Keyboard,
  ActivityIndicator,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';

import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { useCategories } from '../../hooks/useCategories';
import ModeToggle from '../../components/common/ModeToggle';
import Button from '../../components/common/Button';
import CategoryPicker from '../../components/common/CategoryPicker';
import WalletPicker from '../../components/common/WalletPicker';
import Card from '../../components/common/Card';
import Confetti from '../../components/common/Confetti';
import { useWalletStore } from '../../store/walletStore';
import { useToast } from '../../context/ToastContext';
import { lightTap, successNotification } from '../../services/haptics';
import { parseTextInput, parseReceiptText } from '../../services/aiService';
import { recognizeText } from '../../services/ocrService';
import { transcribeAudio } from '../../services/speechService';
import { enrichTransaction } from '../../utils/enrichTransaction';
import { Transaction } from '../../types';

type InputMode = 'text' | 'photo' | 'voice';

const ExpenseEntry: React.FC = () => {
  const { showToast } = useToast();
  const { addTransaction, transactions } = usePersonalStore();
  const currency = useSettingsStore(state => state.currency);
  const wallets = useWalletStore((s) => s.wallets);
  const deductFromWallet = useWalletStore((s) => s.deductFromWallet);
  const addToWallet = useWalletStore((s) => s.addToWallet);
  const expenseCategories = useCategories('expense');
  const incomeCategories = useCategories('income');

  // Input mode
  const [inputMode, setInputMode] = useState<InputMode>('text');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);

  // Parsed fields
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(expenseCategories[0]?.id || 'food');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(
    wallets.find((w) => w.isDefault)?.id || null
  );
  const [confidence, setConfidence] = useState<'high' | 'low' | null>(null);
  const [rawInput, setRawInput] = useState('');
  const [inputMethod, setInputMethod] = useState<Transaction['inputMethod']>('manual');
  const [showConfetti, setShowConfetti] = useState(false);

  // Text input for NLP
  const [textInput, setTextInput] = useState('');

  const categories = type === 'expense' ? expenseCategories : incomeCategories;

  const applyParsed = (parsed: {
    amount: number;
    category: string;
    description: string;
    type: 'expense' | 'income';
    confidence: 'high' | 'low';
  }) => {
    setAmount(parsed.amount > 0 ? parsed.amount.toString() : '');
    setDescription(parsed.description);
    setType(parsed.type);
    setConfidence(parsed.confidence);

    // Match category by name or id
    const allCats = parsed.type === 'expense' ? expenseCategories : incomeCategories;
    const match = allCats.find(
      (c) =>
        c.name.toLowerCase() === parsed.category.toLowerCase() ||
        c.id.toLowerCase() === parsed.category.toLowerCase()
    );
    if (match) {
      setCategory(match.id);
    }
  };

  // Text mode: parse NLP
  const handleTextSubmit = async () => {
    if (!textInput.trim()) return;
    setIsProcessing(true);
    setRawInput(textInput);
    setInputMethod('text');

    const parsed = await parseTextInput(textInput);
    if (parsed) {
      applyParsed(parsed);
    } else {
      showToast('Could not parse — enter details manually', 'info');
    }
    setIsProcessing(false);
  };

  // Photo mode: camera → OCR → parse
  const handlePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      showToast('Camera permission needed', 'error');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      base64: false,
    });

    if (result.canceled || !result.assets?.[0]) return;

    setIsProcessing(true);
    setInputMethod('photo');

    const ocrText = await recognizeText(result.assets[0].uri);
    if (ocrText) {
      setRawInput(ocrText);
      const parsed = await parseReceiptText(ocrText);
      if (parsed) {
        applyParsed(parsed);
      } else {
        showToast('Could not parse receipt — enter details manually', 'info');
      }
    } else {
      showToast('Could not read receipt — enter details manually', 'info');
    }
    setIsProcessing(false);
  };

  // Voice mode: record → STT → parse
  const handleVoiceStart = async () => {
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        showToast('Microphone permission needed', 'error');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
    } catch {
      showToast('Could not start recording', 'error');
    }
  };

  const handleVoiceStop = async () => {
    if (!recordingRef.current) return;

    setIsRecording(false);
    setIsProcessing(true);
    setInputMethod('voice');

    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (uri) {
        const transcript = await transcribeAudio(uri);
        if (transcript) {
          setRawInput(transcript);
          const parsed = await parseTextInput(transcript);
          if (parsed) {
            applyParsed(parsed);
          } else {
            showToast('Could not parse — enter details manually', 'info');
          }
        } else {
          showToast('Could not transcribe — enter details manually', 'info');
        }
      }
    } catch {
      showToast('Recording error — enter details manually', 'info');
    }
    setIsProcessing(false);
  };

  const handleSubmit = () => {
    if (!amount || parseFloat(amount) <= 0) {
      showToast('Please enter a valid amount', 'error');
      return;
    }

    if (!description.trim()) {
      showToast('Please add a description', 'error');
      return;
    }

    const parsedAmount = parseFloat(amount);

    // Build base transaction
    const baseTx: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> = {
      amount: parsedAmount,
      category,
      description: description.trim(),
      date: new Date(),
      type,
      mode: 'personal',
      walletId: selectedWalletId || undefined,
      tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      rawInput: rawInput || undefined,
      inputMethod: inputMethod || 'manual',
      confidence: confidence || undefined,
    };

    // Enrich with context
    const enriched = enrichTransaction(baseTx as Transaction, transactions.slice(0, 50));

    addTransaction({
      ...enriched,
    });

    if (selectedWalletId) {
      if (type === 'expense') {
        deductFromWallet(selectedWalletId, parsedAmount);
      } else {
        addToWallet(selectedWalletId, parsedAmount);
      }
    }

    // Reset
    setAmount('');
    setDescription('');
    setTags('');
    setCategory(categories[0].id);
    setTextInput('');
    setRawInput('');
    setConfidence(null);
    setInputMethod('manual');

    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 100);
    successNotification();
    showToast(`${type === 'expense' ? 'Expense' : 'Income'} added successfully!`, 'success');
  };

  const handleTypeChange = (newType: 'expense' | 'income') => {
    setType(newType);
    const newCategories = newType === 'expense' ? expenseCategories : incomeCategories;
    setCategory(newCategories[0].id);
  };

  return (
    <View style={styles.container}>
      <ModeToggle />
      <Confetti active={showConfetti} />
      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Mode Selector Pills */}
        <View style={styles.modeSelector}>
          {(['text', 'photo', 'voice'] as InputMode[]).map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[styles.modePill, inputMode === mode && styles.modePillActive]}
              onPress={() => { lightTap(); setInputMode(mode); }}
            >
              <Feather
                name={mode === 'text' ? 'type' : mode === 'photo' ? 'camera' : 'mic'}
                size={16}
                color={inputMode === mode ? '#fff' : CALM.textSecondary}
              />
              <Text style={[styles.modePillText, inputMode === mode && styles.modePillTextActive]}>
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Input Area */}
        {inputMode === 'text' && (
          <Card style={styles.inputCard}>
            <TextInput
              style={styles.nlpInput}
              value={textInput}
              onChangeText={setTextInput}
              placeholder='nasi lemak 8.50 or "grab 15"'
              placeholderTextColor={CALM.textSecondary}
              returnKeyType="go"
              onSubmitEditing={handleTextSubmit}
              multiline
              numberOfLines={2}
            />
            <TouchableOpacity style={styles.parseButton} onPress={handleTextSubmit} disabled={isProcessing}>
              {isProcessing ? (
                <ActivityIndicator size="small" color={CALM.accent} />
              ) : (
                <Feather name="arrow-right" size={20} color={CALM.accent} />
              )}
            </TouchableOpacity>
          </Card>
        )}

        {inputMode === 'photo' && (
          <TouchableOpacity style={styles.photoButton} onPress={handlePhoto} disabled={isProcessing}>
            {isProcessing ? (
              <ActivityIndicator size="large" color={CALM.accent} />
            ) : (
              <>
                <Feather name="camera" size={32} color={CALM.accent} />
                <Text style={styles.photoText}>Tap to scan receipt</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {inputMode === 'voice' && (
          <TouchableOpacity
            style={[styles.voiceButton, isRecording && styles.voiceButtonRecording]}
            onPressIn={handleVoiceStart}
            onPressOut={handleVoiceStop}
            disabled={isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator size="large" color={CALM.accent} />
            ) : (
              <>
                <Feather name="mic" size={32} color={isRecording ? '#fff' : CALM.accent} />
                <Text style={[styles.voiceText, isRecording && styles.voiceTextRecording]}>
                  {isRecording ? 'Listening...' : 'Hold to speak'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Processing indicator */}
        {isProcessing && (
          <Text style={styles.processingText}>Processing...</Text>
        )}

        {/* Parsed Fields */}
        <View style={styles.fieldsSection}>
          {/* Amount */}
          <View style={styles.amountRow}>
            <Text style={styles.currencySymbol}>{currency}</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              placeholderTextColor={CALM.border}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          </View>

          {/* Confidence indicator */}
          {confidence === 'low' && (
            <Text style={styles.confidenceWarning}>AI unsure — please verify</Text>
          )}

          {/* Type toggle */}
          <View style={styles.typeContainer}>
            <TouchableOpacity
              style={[
                styles.typeButton,
                type === 'expense' && styles.typeButtonExpenseActive,
              ]}
              onPress={() => handleTypeChange('expense')}
            >
              <Text style={[styles.typeText, type === 'expense' && styles.typeTextActive]}>
                Expense
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.typeButton,
                type === 'income' && styles.typeButtonIncomeActive,
              ]}
              onPress={() => handleTypeChange('income')}
            >
              <Text style={[styles.typeText, type === 'income' && styles.typeTextActive]}>
                Income
              </Text>
            </TouchableOpacity>
          </View>

          {/* Category */}
          <CategoryPicker
            categories={categories}
            selectedId={category}
            onSelect={setCategory}
            label="Category"
            layout="dropdown"
          />

          {/* Wallet */}
          <WalletPicker
            wallets={wallets}
            selectedId={selectedWalletId}
            onSelect={setSelectedWalletId}
            label="Wallet"
          />

          {/* Description */}
          <Card>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              placeholder="What was this for?"
              placeholderTextColor={CALM.textSecondary}
              multiline
              numberOfLines={2}
            />
          </Card>

          {/* Tags */}
          <Card>
            <Text style={styles.label}>Tags (optional)</Text>
            <TextInput
              style={styles.input}
              value={tags}
              onChangeText={setTags}
              placeholder="personal, family, work"
              placeholderTextColor={CALM.textSecondary}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          </Card>

          {/* Submit */}
          <Button
            title={`Add ${type === 'expense' ? 'Expense' : 'Income'}`}
            onPress={handleSubmit}
            icon="check"
            size="large"
            style={styles.submitButton}
          />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
  },

  // Mode selector
  modeSelector: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  modePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.full,
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    minHeight: 44,
  },
  modePillActive: {
    backgroundColor: CALM.accent,
    borderColor: CALM.accent,
  },
  modePillText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textSecondary,
  },
  modePillTextActive: {
    color: '#fff',
  },

  // Text input
  inputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  nlpInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.lg,
    color: CALM.textPrimary,
    minHeight: 48,
  },
  parseButton: {
    padding: SPACING.md,
  },

  // Photo input
  photoButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING['4xl'],
    marginBottom: SPACING.lg,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    borderColor: CALM.border,
    borderStyle: 'dashed',
    gap: SPACING.sm,
  },
  photoText: {
    ...TYPE.muted,
    color: CALM.textSecondary,
  },

  // Voice input
  voiceButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING['4xl'],
    marginBottom: SPACING.lg,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    borderColor: CALM.border,
    gap: SPACING.sm,
  },
  voiceButtonRecording: {
    backgroundColor: CALM.accent,
    borderColor: CALM.accent,
  },
  voiceText: {
    ...TYPE.muted,
    color: CALM.textSecondary,
  },
  voiceTextRecording: {
    color: '#fff',
  },

  processingText: {
    ...TYPE.muted,
    color: CALM.accent,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },

  // Parsed fields
  fieldsSection: {
    gap: SPACING.xs,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  currencySymbol: {
    fontSize: TYPE.amount.fontSize,
    fontWeight: TYPE.amount.fontWeight,
    color: CALM.textSecondary,
    marginRight: SPACING.sm,
  },
  amountInput: {
    flex: 1,
    fontSize: TYPE.amount.fontSize,
    fontWeight: TYPE.amount.fontWeight,
    color: CALM.textPrimary,
    paddingVertical: SPACING.sm,
  },
  confidenceWarning: {
    ...TYPE.muted,
    color: CALM.neutral,
    marginBottom: SPACING.md,
  },

  // Type toggle
  typeContainer: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  typeButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 2,
    borderColor: CALM.border,
    backgroundColor: CALM.surface,
  },
  typeButtonExpenseActive: {
    borderColor: CALM.accent,
    backgroundColor: CALM.accent,
  },
  typeButtonIncomeActive: {
    borderColor: CALM.positive,
    backgroundColor: CALM.positive,
  },
  typeText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  typeTextActive: {
    color: '#fff',
  },

  label: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
    marginBottom: SPACING.md,
  },
  input: {
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
  },
  submitButton: {
    marginTop: SPACING.md,
    marginBottom: SPACING['3xl'],
  },
});

export default ExpenseEntry;
