import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Keyboard,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
// Lazy-loaded: native module crashes Expo Go if imported at top level
const getDocumentScanner = () => require('react-native-document-scanner-plugin').default as typeof import('react-native-document-scanner-plugin').default;
import { useAudioRecorder, RecordingPresets, AudioModule, setAudioModeAsync } from 'expo-audio';

import { usePersonalStore } from '../../store/personalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { useCalm } from '../../hooks/useCalm';
import { useT } from '../../i18n';
import { useCategories } from '../../hooks/useCategories';
import Button from '../../components/common/Button';
import CategoryPicker from '../../components/common/CategoryPicker';
import WalletPicker from '../../components/common/WalletPicker';
import Card from '../../components/common/Card';
import ScreenGuide from '../../components/common/ScreenGuide';

import { useWalletStore } from '../../store/walletStore';
import { useToast } from '../../context/ToastContext';
import { lightTap, successNotification } from '../../services/haptics';
import { parseTextInput, parseReceiptText } from '../../services/aiService';
import { recognizeText } from '../../services/ocrService';
import { transcribeAudio } from '../../services/speechService';
import { enrichTransaction } from '../../utils/enrichTransaction';
import { Transaction } from '../../types';
import { usePlaybookStore } from '../../store/playbookStore';
import { computePlaybookStats } from '../../utils/playbookStats';

type InputMode = 'text' | 'photo' | 'voice';

const ExpenseEntry: React.FC = () => {
  const C = useCalm();
  const t = useT();
  const styles = useMemo(() => makeStyles(C), [C]);
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
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

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
      showToast(t.expense.parseFailed, 'info');
    }
    setIsProcessing(false);
  };

  // Photo mode: camera → OCR → parse
  const handlePhoto = async () => {
    let imageUri: string | null = null;
    try {
      const scanResult = await getDocumentScanner().scanDocument({ maxNumDocuments: 1 });
      if (scanResult.scannedImages?.length) imageUri = scanResult.scannedImages[0];
    } catch {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        showToast(t.expense.cameraNeeded, 'error');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.8, base64: false });
      if (!result.canceled && result.assets?.[0]) imageUri = result.assets[0].uri;
    }

    if (!imageUri) return;

    setIsProcessing(true);
    setInputMethod('photo');

    const ocrText = await recognizeText(imageUri);
    if (ocrText) {
      setRawInput(ocrText);
      const parsed = await parseReceiptText(ocrText);
      if (parsed) {
        applyParsed(parsed);
      } else {
        showToast(t.expense.parseFailed, 'info');
      }
    } else {
      showToast(t.expense.receiptFailed, 'info');
    }
    setIsProcessing(false);
  };

  // Voice mode: record → STT → parse
  const handleVoiceStart = async () => {
    try {
      const permStatus = await AudioModule.requestRecordingPermissionsAsync();
      if (!permStatus.granted) {
        showToast(t.expense.micNeeded, 'error');
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setIsRecording(true);
    } catch {
      showToast(t.expense.recordingFailed, 'error');
    }
  };

  const handleVoiceStop = async () => {
    if (!audioRecorder.isRecording) return;

    setIsRecording(false);
    setIsProcessing(true);
    setInputMethod('voice');

    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;

      if (uri) {
        const transcript = await transcribeAudio(uri);
        if (transcript) {
          setRawInput(transcript);
          const parsed = await parseTextInput(transcript);
          if (parsed) {
            applyParsed(parsed);
          } else {
            showToast(t.expense.parseFailed, 'info');
          }
        } else {
          showToast(t.expense.parseFailed, 'info');
        }
      }
    } catch {
      showToast(t.expense.recordingError, 'info');
    }
    setIsProcessing(false);
  };

  const handleSubmit = useCallback(() => {
    const parsedAmt = parseFloat(amount);
    if (!amount || isNaN(parsedAmt) || parsedAmt <= 0) {
      showToast(t.expense.invalidAmount, 'error');
      return;
    }

    if (!description.trim()) {
      showToast(t.expense.noDescription, 'error');
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

    const txId = addTransaction({
      ...enriched,
    });

    if (selectedWalletId) {
      if (type === 'expense') {
        deductFromWallet(selectedWalletId, parsedAmount);
      } else {
        addToWallet(selectedWalletId, parsedAmount);
      }
    }

    // Playbook linking
    const activePlaybooks = usePlaybookStore.getState().getActivePlaybooks();
    const linkToPlaybook = (pbId: string, tid: string, amt: number) => {
      usePlaybookStore.getState().linkExpense(pbId, tid);
      usePersonalStore.getState().updateTransaction(tid, {
        playbookLinks: [{ playbookId: pbId, amount: amt }],
      });
    };

    if (type === 'expense' && activePlaybooks.length === 1) {
      linkToPlaybook(activePlaybooks[0].id, txId, parsedAmount);
    } else if (type === 'expense' && activePlaybooks.length > 1) {
      Alert.alert(t.expense.linkPlaybook, t.expense.whichPlaybook, [
        ...activePlaybooks.map((pb) => ({
          text: pb.name,
          onPress: () => linkToPlaybook(pb.id, txId, parsedAmount),
        })),
        { text: t.common.skip, style: 'cancel' as const },
      ]);
    }

    // Reset
    setAmount('');
    setDescription('');
    setTags('');
    setCategory(categories[0]?.id || 'other');
    setTextInput('');
    setRawInput('');
    setConfidence(null);
    setInputMethod('manual');

    successNotification();
    const pbNote = type === 'expense' && activePlaybooks.length === 1
      ? ` (linked to ${activePlaybooks[0].name})`
      : '';
    const txCount = usePersonalStore.getState().transactions.length;
    if (txCount === 1) {
      showToast(t.expense.firstTracked, 'success');
    } else {
      showToast(`${type === 'expense' ? t.expense.expenseAdded : t.expense.incomeAdded}${pbNote}`, 'success');
    }
  }, [amount, description, category, type, tags, selectedWalletId, rawInput, inputMethod, confidence, transactions, addTransaction, deductFromWallet, addToWallet, showToast, t]);

  const handleTypeChange = useCallback((newType: 'expense' | 'income') => {
    setType(newType);
    const newCategories = newType === 'expense' ? expenseCategories : incomeCategories;
    setCategory(newCategories[0]?.id || 'other');
  }, [expenseCategories, incomeCategories]);

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
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
                color={inputMode === mode ? '#fff' : C.textSecondary}
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
              placeholder={t.expense.placeholder}
              placeholderTextColor={C.textSecondary}
              returnKeyType="go"
              onSubmitEditing={handleTextSubmit}
              multiline
              numberOfLines={2}
            />
            <TouchableOpacity style={styles.parseButton} onPress={handleTextSubmit} disabled={isProcessing}>
              {isProcessing ? (
                <ActivityIndicator size="small" color={C.accent} />
              ) : (
                <Feather name="arrow-right" size={20} color={C.accent} />
              )}
            </TouchableOpacity>
          </Card>
        )}

        {inputMode === 'photo' && (
          <TouchableOpacity style={styles.photoButton} onPress={handlePhoto} disabled={isProcessing}>
            {isProcessing ? (
              <ActivityIndicator size="large" color={C.accent} />
            ) : (
              <>
                <Feather name="camera" size={32} color={C.accent} />
                <Text style={styles.photoText}>{t.expense.scanReceipt}</Text>
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
              <ActivityIndicator size="large" color={C.accent} />
            ) : (
              <>
                <Feather name="mic" size={32} color={isRecording ? '#fff' : C.accent} />
                <Text style={[styles.voiceText, isRecording && styles.voiceTextRecording]}>
                  {isRecording ? t.expense.listening : t.expense.holdToSpeak}
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Processing indicator */}
        {isProcessing && (
          <Text style={styles.processingText}>{t.expense.processing}</Text>
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
              placeholderTextColor={C.border}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          </View>

          {/* Confidence indicator */}
          {confidence === 'low' && (
            <Text style={styles.confidenceWarning}>{t.expense.aiUnsure}</Text>
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
                {t.transaction.expense}
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
                {t.transaction.income}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Category */}
          <CategoryPicker
            categories={categories}
            selectedId={category}
            onSelect={setCategory}
            label={t.transaction.category}
            layout="dropdown"
          />

          {/* Wallet */}
          <WalletPicker
            wallets={wallets}
            selectedId={selectedWalletId}
            onSelect={setSelectedWalletId}
            label={t.transaction.wallet}
          />

          {/* Description */}
          <Card>
            <Text style={styles.label}>{t.transaction.description}</Text>
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              placeholder={t.expense.whatWasThis}
              placeholderTextColor={C.textSecondary}
              multiline
              numberOfLines={2}
            />
          </Card>

          {/* Tags */}
          <Card>
            <Text style={styles.label}>{t.expense.tagsOptional}</Text>
            <TextInput
              style={styles.input}
              value={tags}
              onChangeText={setTags}
              placeholder={t.expense.tagsPlaceholder}
              placeholderTextColor={C.textSecondary}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          </Card>

          {/* Submit */}
          <Button
            title={type === 'expense' ? t.expense.addExpense : t.expense.addIncome}
            onPress={handleSubmit}
            icon="check"
            size="large"
            style={styles.submitButton}
          />
        </View>
      </KeyboardAwareScrollView>
      <ScreenGuide
        id="guide_expense"
        title={t.guide.addMoneyInOut}
        icon="plus-circle"
        tips={[
          t.guide.tipExpense1,
          t.guide.tipExpense2,
          t.guide.tipExpense3,
        ]}
      />
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
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    minHeight: 44,
  },
  modePillActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  modePillText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textSecondary,
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
    color: C.textPrimary,
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
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    borderColor: C.border,
    borderStyle: 'dashed',
    gap: SPACING.sm,
  },
  photoText: {
    ...TYPE.muted,
    color: C.textSecondary,
  },

  // Voice input
  voiceButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING['4xl'],
    marginBottom: SPACING.lg,
    backgroundColor: C.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 2,
    borderColor: C.border,
    gap: SPACING.sm,
  },
  voiceButtonRecording: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  voiceText: {
    ...TYPE.muted,
    color: C.textSecondary,
  },
  voiceTextRecording: {
    color: '#fff',
  },

  processingText: {
    ...TYPE.muted,
    color: C.accent,
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
    color: C.textSecondary,
    marginRight: SPACING.sm,
  },
  amountInput: {
    flex: 1,
    fontSize: TYPE.amount.fontSize,
    fontWeight: TYPE.amount.fontWeight,
    color: C.textPrimary,
    paddingVertical: SPACING.sm,
  },
  confidenceWarning: {
    ...TYPE.muted,
    color: C.neutral,
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
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  typeButtonExpenseActive: {
    borderColor: C.accent,
    backgroundColor: C.accent,
  },
  typeButtonIncomeActive: {
    borderColor: C.positive,
    backgroundColor: C.positive,
  },
  typeText: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
  },
  typeTextActive: {
    color: '#fff',
  },

  label: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: C.textPrimary,
    marginBottom: SPACING.md,
  },
  input: {
    backgroundColor: C.surface,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    fontSize: TYPOGRAPHY.size.base,
    color: C.textPrimary,
  },
  submitButton: {
    marginTop: SPACING.md,
    marginBottom: SPACING['3xl'],
  },
});

export default ExpenseEntry;
