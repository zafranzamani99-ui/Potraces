import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Keyboard,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { format } from 'date-fns';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNotesStore } from '../../store/notesStore';
import { useWalletStore } from '../../store/walletStore';
import { CALM, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { lightTap, mediumTap, warningNotification } from '../../services/haptics';
import { useIntentEngine } from '../../hooks/useIntentEngine';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { useCategories } from '../../hooks/useCategories';
import { usePremiumStore } from '../../store/premiumStore';
import { AIExtraction, ExtractionIntent } from '../../types';
import { useLearningStore } from '../../store/learningStore';
import CategoryPicker from '../../components/common/CategoryPicker';
import WalletPicker from '../../components/common/WalletPicker';
import ConfirmationCard from './ConfirmationCard';
import QueryResultCard from './QueryResultCard';
import PaywallModal from '../../components/common/PaywallModal';

const EDIT_TYPES: { key: ExtractionIntent; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: 'expense', label: 'Expense', icon: 'arrow-up-right' },
  { key: 'income', label: 'Income', icon: 'arrow-down-left' },
  { key: 'debt', label: 'Debt', icon: 'repeat' },
  { key: 'debt_update', label: 'Payment', icon: 'check-circle' },
  { key: 'seller_cost', label: 'Cost', icon: 'shopping-bag' },
  { key: 'playbook', label: 'Playbook', icon: 'book-open' },
];

const AUTO_SAVE_DELAY = 600; // ms

const NoteEditor: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const pageId: string = route.params?.pageId;

  const page = useNotesStore((s) => s.pages.find((p) => p.id === pageId));
  const updatePageContent = useNotesStore((s) => s.updatePageContent);
  const deletePage = useNotesStore((s) => s.deletePage);
  const updateExtraction = useNotesStore((s) => s.updateExtraction);

  // Single unified text (first line = title visually)
  const [text, setText] = useState(page?.content ?? '');
  const textRef = useRef(text);
  textRef.current = text;

  // Derived title/body for compat
  const firstNewline = text.indexOf('\n');
  const title = firstNewline >= 0 ? text.slice(0, firstNewline) : text;
  const body = firstNewline >= 0 ? text.slice(firstNewline + 1) : '';

  const [showPaywall, setShowPaywall] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);
  const hasUnsavedRef = useRef(false);

  const {
    isClassifying,
    classifyStep,
    extractionSource,
    extractions,
    queryAnswer,
    statusMessage,
    classify,
    retry,
    confirmExtraction,
    skipExtraction,
  } = useIntentEngine({ pageId });

  const {
    isRecording,
    isTranscribing,
    error: voiceError,
    startRecording,
    stopAndTranscribe,
  } = useVoiceInput();

  const handleSkip = useCallback((id: string) => {
    const ext = extractions.find((e) => e.id === id);
    if (ext?.extractedData.description) {
      useLearningStore.getState().learnSkip(ext.extractedData.description);
    }
    skipExtraction(id);
  }, [extractions, skipExtraction]);

  const pendingExtractions = extractions.filter((e) => e.status === 'pending');
  const [showExtractModal, setShowExtractModal] = useState(false);
  const prevPendingCountRef = useRef(0);
  const isMountRef = useRef(true);

  // Edit modal state
  const [editingExtraction, setEditingExtraction] = useState<AIExtraction | null>(null);
  const [editType, setEditType] = useState<ExtractionIntent>('expense');
  const [editAmount, setEditAmount] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPerson, setEditPerson] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editWalletId, setEditWalletId] = useState('');
  const [editDebtType, setEditDebtType] = useState<'i_owe' | 'they_owe'>('they_owe');
  const [editModalAnim, setEditModalAnim] = useState<'fade' | 'none'>('fade');
  const [showTypePicker, setShowTypePicker] = useState(false);

  const expenseCategories = useCategories('expense');
  const incomeCategories = useCategories('income');
  const wallets = useWalletStore((s) => s.wallets);

  const editCategories = editType === 'income' ? incomeCategories : expenseCategories;
  const showEditCategory = ['expense', 'income', 'subscription'].includes(editType);
  const showEditWallet = ['expense', 'income'].includes(editType);
  const showEditPerson = ['debt', 'debt_update'].includes(editType);
  const showEditDebtDirection = editType === 'debt';

  const handleEditNavToSettings = useCallback(() => {
    setEditModalAnim('none');
    setEditingExtraction(null);
    setTimeout(() => {
      navigation.navigate('Settings', { scrollTo: 'categories' });
      setEditModalAnim('fade');
    }, 50);
  }, [navigation]);

  // Auto-open modal when new extractions appear (not on initial mount)
  useEffect(() => {
    if (isMountRef.current) {
      isMountRef.current = false;
      prevPendingCountRef.current = pendingExtractions.length;
      return;
    }
    if (pendingExtractions.length > 0 && prevPendingCountRef.current === 0) {
      setShowExtractModal(true);
    }
    prevPendingCountRef.current = pendingExtractions.length;
  }, [pendingExtractions.length]);

  // Auto-close modal when all extractions are handled
  useEffect(() => {
    if (pendingExtractions.length === 0 && showExtractModal) {
      setShowExtractModal(false);
    }
  }, [pendingExtractions.length, showExtractModal]);

  // Auto-focus on mount for new (empty) notes
  useEffect(() => {
    if (!page?.content) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, []);

  // Track keyboard visibility
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardVisible(true);
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  const handleTextChange = useCallback(
    (newText: string) => {
      setText(newText);
      hasUnsavedRef.current = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        updatePageContent(pageId, newText);
        hasUnsavedRef.current = false;
      }, AUTO_SAVE_DELAY);
    },
    [pageId, updatePageContent]
  );

  const handleMicPress = useCallback(async () => {
    if (isRecording) {
      mediumTap();
      const transcription = await stopAndTranscribe();
      if (transcription) {
        const separator = text.trim() ? '\n' : '';
        const newText = text + separator + transcription;
        handleTextChange(newText);
      } else if (voiceError === 'ai limit reached — upgrade for unlimited') {
        setShowPaywall(true);
      }
    } else {
      lightTap();
      await startRecording();
    }
  }, [isRecording, text, voiceError, stopAndTranscribe, startRecording, handleTextChange]);

  const handleExtract = useCallback(() => {
    lightTap();
    // Flush pending save so store is up to date
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      updatePageContent(pageId, text);
      hasUnsavedRef.current = false;
    }
    classify();
  }, [classify, text, pageId, updatePageContent]);

  const handleClearExtractions = useCallback(() => {
    lightTap();
    useNotesStore.getState().clearPendingExtractions(pageId);
    setShowExtractModal(false);
  }, [pageId]);

  const handleEdit = useCallback((id: string) => {
    const ext = pendingExtractions.find((e) => e.id === id);
    if (!ext) return;
    lightTap();
    setShowTypePicker(false);
    setEditingExtraction(ext);
    setEditType(ext.type);
    setEditAmount(ext.extractedData.amount?.toString() || '');
    setEditDescription(ext.extractedData.description || '');
    setEditPerson(ext.extractedData.person || '');

    // Match category
    const cats = ext.type === 'income' ? incomeCategories : expenseCategories;
    const catStr = (ext.extractedData.category || '').toLowerCase().replace(/[\s&]+/g, '_');
    const catMatch = cats.find((c) => c.id === catStr)
      || cats.find((c) => c.name.toLowerCase().replace(/[\s&]+/g, '_') === catStr)
      || cats[0];
    setEditCategoryId(catMatch?.id || 'other');

    // Match wallet
    const walletStr = (ext.extractedData.wallet || '').toLowerCase();
    const walletMatch = wallets.find((w) => w.name.toLowerCase() === walletStr)
      || wallets.find((w) => w.isDefault)
      || wallets[0];
    setEditWalletId(walletMatch?.id || '');

    // Debt direction
    setEditDebtType(ext.extractedData.transactionType === 'income' ? 'they_owe' : 'i_owe');
  }, [pendingExtractions, expenseCategories, incomeCategories, wallets]);

  const handleEditSave = useCallback(() => {
    if (!editingExtraction) return;
    mediumTap();
    const amount = parseFloat(editAmount) || 0;
    const orig = editingExtraction;
    const desc = editDescription || orig.extractedData.description || '';

    // Learn from corrections
    const learn = useLearningStore.getState();
    if (editType !== orig.type) {
      learn.learnTypeCorrection(desc, editType);
    }
    if (editPerson && editPerson !== (orig.extractedData.person || '')) {
      learn.learnPersonAlias(orig.extractedData.person || desc, editPerson);
    }
    // Learn category association
    const selectedCatId = editCategoryId;
    if (desc && selectedCatId) {
      learn.learnCategory(desc, selectedCatId);
    }
    // Learn wallet association
    const selWallet = wallets.find((w) => w.id === editWalletId);
    if (desc && selWallet) {
      learn.learnWallet(desc, selWallet.name);
    }

    // Resolve category and wallet
    const selectedCat = editCategories.find((c) => c.id === editCategoryId);
    const selectedWallet = wallets.find((w) => w.id === editWalletId);

    // For debt, derive transactionType from debt direction
    const txnType = editType === 'debt'
      ? (editDebtType === 'they_owe' ? 'income' : 'expense')
      : (editType === 'income' ? 'income' : 'expense');

    updateExtraction(pageId, orig.id, {
      type: editType,
      extractedData: {
        amount,
        description: editDescription,
        person: editPerson || null,
        category: selectedCat?.id || orig.extractedData.category,
        wallet: selectedWallet?.name || orig.extractedData.wallet,
        transactionType: txnType,
      },
    });
    const id = orig.id;
    setEditingExtraction(null);
    confirmExtraction(id);
  }, [editingExtraction, editType, editAmount, editDescription, editPerson, editCategoryId, editWalletId, editDebtType, editCategories, wallets, pageId, updateExtraction, confirmExtraction]);

  const handleEditCancel = useCallback(() => {
    setEditingExtraction(null);
  }, []);

  // Flush save on unmount / back
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (hasUnsavedRef.current) {
        updatePageContent(pageId, textRef.current);
      }
    };
  }, [pageId, updatePageContent]);

  const handleBack = useCallback(() => {
    // Flush pending save
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (hasUnsavedRef.current) {
      updatePageContent(pageId, text);
      hasUnsavedRef.current = false;
    }
    // Delete empty pages
    if (!text.trim()) {
      deletePage(pageId);
    }
    navigation.goBack();
  }, [text, pageId, updatePageContent, deletePage, navigation]);

  const handleDelete = useCallback(() => {
    warningNotification();
    Alert.alert('Delete note?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
          deletePage(pageId);
          navigation.goBack();
        },
      },
    ]);
  }, [pageId, deletePage, navigation]);

  if (!page) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>note not found</Text>
      </View>
    );
  }

  const dateLabel = format(page.updatedAt, 'dd MMM yyyy, HH:mm');

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + SPACING.sm }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={handleBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="chevron-left" size={22} color={CALM.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerDate}>{dateLabel}</Text>
        </View>
        <TouchableOpacity
          style={[
            styles.micBtn,
            isRecording && styles.micBtnActive,
          ]}
          onPress={handleMicPress}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          {isTranscribing ? (
            <ActivityIndicator size="small" color={CALM.bronze} />
          ) : (
            <Feather
              name={isRecording ? 'mic-off' : 'mic'}
              size={18}
              color={isRecording ? '#fff' : CALM.textMuted}
            />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => {
            if (!text.trim()) return;
            lightTap();
            const extractionSummary = extractions
              .filter((e) => e.status === 'confirmed' || e.status === 'pending')
              .map((e) => {
                const d = e.extractedData;
                const status = e.status === 'confirmed' ? 'saved' : 'pending';
                return `[${status}] ${e.type}: ${d.description || 'item'} RM${d.amount}${d.person ? ` (${d.person})` : ''}`;
              })
              .join('\n');
            navigation.navigate('MoneyChat', {
              noteContext: text,
              extractionContext: extractionSummary || undefined,
            });
          }}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="message-circle" size={18} color={CALM.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={handleDelete}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Feather name="trash-2" size={18} color={CALM.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Writing surface */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={[
          styles.scrollContent,
          keyboardVisible && { paddingBottom: keyboardHeight },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Recording indicator */}
        {isRecording && (
          <View style={styles.recordingBar}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>recording... tap mic to stop</Text>
          </View>
        )}
        {isTranscribing && (
          <View style={styles.recordingBar}>
            <ActivityIndicator size="small" color={CALM.bronze} />
            <Text style={styles.recordingText}>transcribing...</Text>
          </View>
        )}
        {voiceError && (
          <View style={styles.recordingBar}>
            <Text style={[styles.recordingText, { color: CALM.bronze }]}>{voiceError}</Text>
          </View>
        )}

        <TextInput
          ref={inputRef}
          style={styles.unifiedInput}
          onChangeText={handleTextChange}
          placeholder="start writing..."
          placeholderTextColor={CALM.textMuted}
          multiline
          textAlignVertical="top"
          scrollEnabled={false}
          autoCorrect={false}
          autoCapitalize="none"
        >
          <Text style={styles.titleLine}>{title}</Text>
          {body !== '' && <Text style={styles.bodyLine}>{'\n' + body}</Text>}
        </TextInput>

        {/* Inline extract button — appears after text */}
        {text.trim().length > 0 && pendingExtractions.length === 0 && !isClassifying && (
          <TouchableOpacity
            style={styles.extractBtn}
            onPress={handleExtract}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="zap" size={13} color={CALM.bronze} />
            <Text style={styles.extractBtnText}>extract</Text>
          </TouchableOpacity>
        )}

        {/* Classifying indicator — stepped pipeline */}
        {isClassifying && (
          <View style={styles.classifyingPipeline}>
            {/* Step 1: Scanning */}
            <View style={styles.pipelineStep}>
              {classifyStep === 'scanning' ? (
                <ActivityIndicator size={10} color={CALM.bronze} />
              ) : (
                <Feather name="check" size={10} color={CALM.positive} />
              )}
              <Text style={[styles.pipelineLabel, classifyStep !== 'scanning' && styles.pipelineDone]}>
                scanning
              </Text>
            </View>
            {/* Connector */}
            <View style={styles.pipelineConnector} />
            {/* Step 2: AI or Local */}
            <View style={styles.pipelineStep}>
              {classifyStep === 'ai' ? (
                <>
                  <ActivityIndicator size={10} color={CALM.bronze} />
                  <Text style={styles.pipelineLabel}>AI</Text>
                </>
              ) : classifyStep === 'local' ? (
                <>
                  <ActivityIndicator size={10} color={CALM.bronze} />
                  <Text style={styles.pipelineLabel}>local parser</Text>
                </>
              ) : (classifyStep === 'scanning') ? (
                <>
                  <Feather name="cpu" size={10} color={CALM.textMuted} />
                  <Text style={[styles.pipelineLabel, { color: CALM.textMuted }]}>waiting</Text>
                </>
              ) : (
                <>
                  <Feather name="check" size={10} color={CALM.positive} />
                  <Text style={styles.pipelineDone}>done</Text>
                </>
              )}
            </View>
          </View>
        )}

        {/* Status message — shows after extraction completes */}
        {statusMessage && !isClassifying && (
          <View style={styles.statusRow}>
            {extractionSource === 'ai' ? (
              <Feather name="zap" size={12} color={CALM.positive} />
            ) : extractionSource === 'local' ? (
              <Feather name="cpu" size={12} color={CALM.bronze} />
            ) : (
              <Feather name="info" size={12} color={CALM.textMuted} />
            )}
            <Text style={styles.statusText}>
              {statusMessage}
              {extractionSource === 'local' && statusMessage && !statusMessage.includes('unavailable') && !statusMessage.includes('nothing') && !statusMessage.includes('no ')
                ? '  ·  local parser'
                : ''}
            </Text>
          </View>
        )}

        {/* Reopen pill — shows when modal is closed but extractions pending */}
        {pendingExtractions.length > 0 && !showExtractModal && (
          <TouchableOpacity
            style={styles.reopenPill}
            onPress={() => setShowExtractModal(true)}
            activeOpacity={0.7}
          >
            <Feather name="layers" size={13} color={CALM.bronze} />
            <Text style={styles.reopenText}>
              {pendingExtractions.length} item{pendingExtractions.length > 1 ? 's' : ''} found
            </Text>
          </TouchableOpacity>
        )}

        {/* Query answer — inline */}
        {queryAnswer && (
          <View style={styles.inlineCard}>
            <QueryResultCard answer={queryAnswer} />
          </View>
        )}
      </ScrollView>

      {/* Extraction results modal */}
      <Modal
        visible={showExtractModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowExtractModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowExtractModal(false)}
          />
          <KeyboardAvoidingView
            style={styles.extractCard}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {/* Close button */}
            <TouchableOpacity
              onPress={() => { setEditingExtraction(null); setShowExtractModal(false); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.extractClose}
            >
              <Feather name="x" size={18} color={CALM.textMuted} />
            </TouchableOpacity>

            {/* Header */}
            <View style={styles.extractHeader}>
              <Feather name={extractionSource === 'ai' ? 'zap' : 'cpu'} size={25} color={CALM.bronze} />
              <View>
                <Text style={styles.extractTitle}>
                  {pendingExtractions.length} item{pendingExtractions.length > 1 ? 's' : ''} found
                </Text>
                <Text style={styles.extractHint}>
                  {extractionSource === 'ai' ? 'via AI' : extractionSource === 'local' ? 'via local parser' : 'tap to edit'}
                </Text>
              </View>
            </View>

            {/* Clear & re-extract */}
            <TouchableOpacity onPress={handleClearExtractions} style={styles.retryBanner} activeOpacity={0.7}>
              <Feather name="refresh-cw" size={12} color={CALM.bronze} />
              <Text style={styles.retryText}>not right? clear and re-extract</Text>
            </TouchableOpacity>

            {/* Extraction cards — always visible */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              style={styles.extractScroll}
              contentContainerStyle={{ paddingTop: SPACING.xs, paddingBottom: SPACING.md }}
            >
              {pendingExtractions.map((ext) => (
                <ConfirmationCard
                  key={ext.id}
                  extraction={ext}
                  onConfirm={confirmExtraction}
                  onSkip={handleSkip}
                  onEdit={handleEdit}
                />
              ))}
            </ScrollView>

          </KeyboardAvoidingView>

          {/* Edit overlay — covers entire modal, edit card centered */}
          {editingExtraction && (
            <>
              <Pressable style={styles.editOverlay} onPress={handleEditCancel} />
              <KeyboardAvoidingView
                style={styles.editOverlayCard}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                pointerEvents="box-none"
              >
                <View style={styles.editInnerCard}>
                <TouchableOpacity
                  onPress={handleEditCancel}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.editOverlayBack}
                >
                  <Feather name="arrow-left" size={18} color={CALM.textMuted} />
                </TouchableOpacity>

                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                  contentContainerStyle={styles.editScrollContent}
                >
                  {/* Type selector */}
                  <View style={styles.editField}>
                    <Text style={styles.editLabel}>type</Text>
                    <TouchableOpacity
                      style={styles.editTypeSelect}
                      onPress={() => { lightTap(); setShowTypePicker(true); }}
                      activeOpacity={0.7}
                    >
                      <Feather
                        name={EDIT_TYPES.find((t) => t.key === editType)?.icon || 'circle'}
                        size={14}
                        color={CALM.bronze}
                      />
                      <Text style={styles.editTypeSelectText}>
                        {EDIT_TYPES.find((t) => t.key === editType)?.label || editType}
                      </Text>
                      <Feather name="chevron-down" size={14} color={CALM.textMuted} />
                    </TouchableOpacity>
                  </View>

                  {/* Amount */}
                  <View style={styles.editAmountSection}>
                    <Text style={styles.editAmountPrefix}>RM</Text>
                    <TextInput
                      style={styles.editAmountInput}
                      value={editAmount}
                      onChangeText={setEditAmount}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={CALM.border}
                    />
                  </View>

                  {/* Description */}
                  <TextInput
                    style={styles.editDescInput}
                    value={editDescription}
                    onChangeText={setEditDescription}
                    placeholder="description"
                    placeholderTextColor={CALM.textMuted}
                  />

                  {/* Category */}
                  {showEditCategory && (
                    <CategoryPicker
                      categories={editCategories}
                      selectedId={editCategoryId}
                      onSelect={setEditCategoryId}
                      label="category"
                      layout="dropdown"
                      onNavigateToSettings={handleEditNavToSettings}
                    />
                  )}

                  {/* Wallet */}
                  {showEditWallet && wallets.length > 0 && (
                    <WalletPicker
                      wallets={wallets}
                      selectedId={editWalletId}
                      onSelect={setEditWalletId}
                      label="wallet"
                    />
                  )}

                  {/* Person + debt direction */}
                  {showEditPerson && (
                    <>
                      <View style={styles.editField}>
                        <Text style={styles.editLabel}>person</Text>
                        <TextInput
                          style={styles.editDescInput}
                          value={editPerson}
                          onChangeText={setEditPerson}
                          placeholder="name"
                          placeholderTextColor={CALM.textMuted}
                        />
                      </View>
                      {showEditDebtDirection && (
                        <View style={styles.editDebtRow}>
                          <TouchableOpacity
                            style={[styles.editDebtToggle, editDebtType === 'they_owe' && styles.editDebtTheyOwe]}
                            onPress={() => setEditDebtType('they_owe')}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.editDebtText, editDebtType === 'they_owe' && styles.editDebtTextTheyOwe]}>
                              they owe me
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.editDebtToggle, editDebtType === 'i_owe' && styles.editDebtIOwe]}
                            onPress={() => setEditDebtType('i_owe')}
                            activeOpacity={0.7}
                          >
                            <Text style={[styles.editDebtText, editDebtType === 'i_owe' && styles.editDebtTextIOwe]}>
                              I owe them
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </>
                  )}

                  {/* Confirm */}
                  <TouchableOpacity
                    style={[styles.editConfirmBtn, !editAmount && styles.editConfirmBtnDisabled]}
                    onPress={handleEditSave}
                    disabled={!editAmount}
                    activeOpacity={0.7}
                  >
                    <Feather name="check" size={15} color="#fff" />
                    <Text style={styles.editConfirmText}>confirm</Text>
                  </TouchableOpacity>
                </ScrollView>
                </View>
              </KeyboardAvoidingView>
            </>
          )}
        </View>
      </Modal>

      {/* Type picker — floats over extraction modal */}
      <Modal
        visible={showTypePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTypePicker(false)}
      >
        <TouchableOpacity
          style={styles.typePickerOverlay}
          activeOpacity={1}
          onPress={() => setShowTypePicker(false)}
        >
          <View style={styles.typePickerCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.typePickerTitle}>select type</Text>
            {EDIT_TYPES.map((t) => {
              const active = editType === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.typePickerOption, active && styles.typePickerOptionActive]}
                  onPress={() => {
                    setEditType(t.key);
                    setShowTypePicker(false);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={[styles.typePickerIcon, active && styles.typePickerIconActive]}>
                    <Feather name={t.icon} size={18} color={active ? CALM.bronze : CALM.textMuted} />
                  </View>
                  <Text style={[styles.typePickerText, active && styles.typePickerTextActive]}>
                    {t.label}
                  </Text>
                  {active && <Feather name="check" size={18} color={CALM.bronze} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      <PaywallModal
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        feature="ai"
        currentUsage={usePremiumStore.getState().aiCallsCount}
      />

      {keyboardVisible && (
        <TouchableOpacity
          style={[styles.doneFab, { bottom: keyboardHeight - insets.bottom + 48 }]}
          onPress={() => Keyboard.dismiss()}
          activeOpacity={0.8}
        >
          <Feather name="check" size={20} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
};

export default NoteEditor;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CALM.border,
    gap: SPACING.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerDate: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontVariant: ['tabular-nums'] as any,
  },
  micBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBtnActive: {
    backgroundColor: CALM.bronze,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: SPACING['3xl'],
  },
  unifiedInput: {
    minHeight: 220,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xs,
  },
  titleLine: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    lineHeight: 28,
  },
  bodyLine: {
    fontSize: TYPOGRAPHY.size.base,
    lineHeight: 26,
    color: CALM.textPrimary,
  },
  extractBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginLeft: SPACING.xl,
    marginBottom: SPACING.sm,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    borderRadius: RADIUS.full,
  },
  extractBtnText: {
    fontSize: 12,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.bronze,
  },
  inlineCard: {
    paddingHorizontal: SPACING.lg,
    marginBottom: 2,
  },
  reopenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    marginLeft: SPACING.xl,
    marginBottom: SPACING.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: withAlpha(CALM.bronze, 0.1),
    borderRadius: RADIUS.full,
  },
  reopenText: {
    fontSize: 12,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.bronze,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  extractCard: {
    width: '88%',
    maxHeight: '75%',
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    ...SHADOWS.lg,
  },
  extractClose: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    zIndex: 1,
  },
  editOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: withAlpha(CALM.textPrimary, 0.4),
    zIndex: 20,
  },
  editOverlayCard: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 30,
  },
  editInnerCard: {
    width: '88%',
    maxHeight: '80%',
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    ...SHADOWS.lg,
  },
  editOverlayBack: {
    marginBottom: SPACING.sm,
  },
  extractHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: SPACING.xs,
  },
  extractTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.bronze,
  },
  extractHint: {
    fontSize: 10,
    color: CALM.bronze,
    fontStyle: 'italic',
  },
  retryBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 6,
    paddingVertical: 6,
    marginBottom: SPACING.xs,
  },
  retryText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.bronze,
  },
  extractScroll: {
    flexShrink: 1,
  },
  classifyingPipeline: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    gap: 6,
  },
  pipelineStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pipelineLabel: {
    fontSize: 11,
    color: CALM.bronze,
    letterSpacing: 0.3,
  },
  pipelineDone: {
    fontSize: 11,
    color: CALM.positive,
    letterSpacing: 0.3,
  },
  pipelineConnector: {
    width: 12,
    height: 1,
    backgroundColor: CALM.border,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xs,
  },
  statusText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontStyle: 'italic',
  },
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.xs,
    backgroundColor: withAlpha(CALM.bronze, 0.06),
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: CALM.bronze,
  },
  recordingText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textSecondary,
    fontStyle: 'italic',
  },
  errorText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
    textAlign: 'center',
    marginTop: SPACING['3xl'],
  },
  // Edit modal — matches MoneyChat ActionEditModal
  editCard: {
    width: '88%',
    maxHeight: '80%',
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    paddingTop: SPACING.xl,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  editClose: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    zIndex: 1,
  },
  editScrollContent: {
    gap: SPACING.sm,
  },
  editTypeSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.md,
  },
  editTypeSelectText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  typePickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  typePickerCard: {
    width: '75%',
    backgroundColor: '#fff',
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: 2,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  typePickerTitle: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    marginBottom: SPACING.sm,
  },
  typePickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 10,
    paddingHorizontal: SPACING.xs,
    borderRadius: RADIUS.md,
  },
  typePickerOptionActive: {
    backgroundColor: withAlpha(CALM.bronze, 0.08),
  },
  typePickerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: withAlpha(CALM.textMuted, 0.08),
    justifyContent: 'center',
    alignItems: 'center',
  },
  typePickerIconActive: {
    backgroundColor: withAlpha(CALM.bronze, 0.12),
  },
  typePickerText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
  },
  typePickerTextActive: {
    color: CALM.bronze,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  editAmountSection: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    paddingVertical: SPACING.xs,
  },
  editAmountPrefix: {
    fontSize: 18,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textMuted,
  },
  editAmountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    padding: 0,
  },
  editDescInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
    paddingVertical: SPACING.sm,
  },
  editField: {
    gap: 4,
  },
  editLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    marginBottom: 2,
  },
  editDebtRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  editDebtToggle: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    backgroundColor: CALM.background,
  },
  editDebtTheyOwe: {
    backgroundColor: withAlpha(CALM.deepOlive, 0.12),
  },
  editDebtIOwe: {
    backgroundColor: withAlpha('#C1694F', 0.12),
  },
  editDebtText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  editDebtTextTheyOwe: {
    color: CALM.deepOlive,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  editDebtTextIOwe: {
    color: '#C1694F',
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  editConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: CALM.deepOlive,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    marginTop: SPACING.xs,
  },
  editConfirmBtnDisabled: {
    opacity: 0.4,
  },
  editConfirmText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },
  // Floating done button
  doneFab: {
    position: 'absolute',
    right: SPACING.md,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: CALM.gold,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
});
