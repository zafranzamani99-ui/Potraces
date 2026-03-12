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
import { CALM, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { lightTap, mediumTap, warningNotification } from '../../services/haptics';
import { useIntentEngine } from '../../hooks/useIntentEngine';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { usePremiumStore } from '../../store/premiumStore';
import { AIExtraction, ExtractionIntent } from '../../types';
import { useLearningStore } from '../../store/learningStore';
import ConfirmationCard from './ConfirmationCard';
import QueryResultCard from './QueryResultCard';
import PaywallModal from '../../components/common/PaywallModal';

const EDIT_TYPES: { key: ExtractionIntent; label: string }[] = [
  { key: 'expense', label: 'expense' },
  { key: 'income', label: 'income' },
  { key: 'debt', label: 'debt' },
  { key: 'debt_update', label: 'payment' },
  { key: 'seller_cost', label: 'cost' },
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

  // Split content into title (first line) + body (rest)
  const initialContent = page?.content ?? '';
  const firstNewline = initialContent.indexOf('\n');
  const [title, setTitle] = useState(firstNewline >= 0 ? initialContent.slice(0, firstNewline) : initialContent);
  const [body, setBody] = useState(firstNewline >= 0 ? initialContent.slice(firstNewline + 1) : '');
  const textRef = useRef({ title, body });
  textRef.current = { title, body };

  // Derived full text for compatibility
  const text = body ? `${title}\n${body}` : title;

  const [showPaywall, setShowPaywall] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleInputRef = useRef<TextInput>(null);
  const bodyInputRef = useRef<TextInput>(null);
  const inputRef = bodyInputRef; // keep compat for voice input
  const hasUnsavedRef = useRef(false);

  const {
    isClassifying,
    extractions,
    queryAnswer,
    statusMessage,
    classify,
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
      setTimeout(() => titleInputRef.current?.focus(), 100);
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

  // Debounced auto-save
  const scheduleAutoSave = useCallback(
    (newTitle?: string, newBody?: string) => {
      hasUnsavedRef.current = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const t = newTitle ?? textRef.current.title;
        const b = newBody ?? textRef.current.body;
        const fullText = b ? `${t}\n${b}` : t;
        updatePageContent(pageId, fullText);
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
        const separator = body.trim() ? '\n' : '';
        const newBody = body + separator + transcription;
        setBody(newBody);
        scheduleAutoSave(undefined, newBody);
      } else if (voiceError === 'ai limit reached — upgrade for unlimited') {
        setShowPaywall(true);
      }
    } else {
      lightTap();
      await startRecording();
    }
  }, [isRecording, body, voiceError, stopAndTranscribe, startRecording, scheduleAutoSave]);

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      // If user presses enter in title, move to body
      if (newTitle.includes('\n')) {
        const parts = newTitle.split('\n');
        setTitle(parts[0]);
        setBody((prev) => (parts.slice(1).join('\n') + (prev ? '\n' + prev : '')));
        scheduleAutoSave(parts[0]);
        setTimeout(() => bodyInputRef.current?.focus(), 50);
        return;
      }
      setTitle(newTitle);
      scheduleAutoSave(newTitle);
    },
    [scheduleAutoSave]
  );

  const handleBodyChange = useCallback(
    (newBody: string) => {
      setBody(newBody);
      scheduleAutoSave(undefined, newBody);
    },
    [scheduleAutoSave]
  );

  const handleBodyKeyPress = useCallback(
    (e: any) => {
      // Backspace on empty body → jump back to title
      if (e.nativeEvent.key === 'Backspace' && !body) {
        titleInputRef.current?.focus();
      }
    },
    [body]
  );

  const handleExtract = useCallback(() => {
    lightTap();
    const fullText = body ? `${title}\n${body}` : title;
    // Flush pending save so store is up to date
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      updatePageContent(pageId, fullText);
      hasUnsavedRef.current = false;
    }
    classify(fullText);
  }, [classify, title, body, pageId, updatePageContent]);

  const handleEdit = useCallback((id: string) => {
    const ext = pendingExtractions.find((e) => e.id === id);
    if (!ext) return;
    lightTap();
    setEditingExtraction(ext);
    setEditType(ext.type);
    setEditAmount(ext.extractedData.amount?.toString() || '');
    setEditDescription(ext.extractedData.description || '');
    setEditPerson(ext.extractedData.person || '');
    setShowExtractModal(false);
  }, [pendingExtractions]);

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

    updateExtraction(pageId, orig.id, {
      type: editType,
      extractedData: {
        amount,
        description: editDescription,
        person: editPerson || null,
        transactionType: editType === 'income' ? 'income' : 'expense',
      },
    });
    const id = orig.id;
    setEditingExtraction(null);
    confirmExtraction(id);
  }, [editingExtraction, editType, editAmount, editDescription, editPerson, pageId, updateExtraction, confirmExtraction]);

  const handleEditCancel = useCallback(() => {
    setEditingExtraction(null);
    if (pendingExtractions.length > 0) {
      setTimeout(() => setShowExtractModal(true), 50);
    }
  }, [pendingExtractions.length]);

  // Flush save on unmount / back
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (hasUnsavedRef.current) {
        const { title: t, body: b } = textRef.current;
        const full = b ? `${t}\n${b}` : t;
        updatePageContent(pageId, full);
      }
    };
  }, [pageId, updatePageContent]);

  const handleBack = useCallback(() => {
    const fullText = body ? `${title}\n${body}` : title;
    // Flush pending save
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (hasUnsavedRef.current) {
      updatePageContent(pageId, fullText);
      hasUnsavedRef.current = false;
    }
    // Delete empty pages
    if (!fullText.trim()) {
      deletePage(pageId);
    }
    navigation.goBack();
  }, [title, body, pageId, updatePageContent, deletePage, navigation]);

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
          ref={titleInputRef}
          style={styles.titleInput}
          value={title}
          onChangeText={handleTitleChange}
          placeholder="title"
          placeholderTextColor={CALM.textMuted}
          multiline
          scrollEnabled={false}
          autoCorrect={false}
          autoCapitalize="none"
          blurOnSubmit={false}
          returnKeyType="next"
          onSubmitEditing={() => bodyInputRef.current?.focus()}
        />
        <TextInput
          ref={bodyInputRef}
          style={styles.bodyInput}
          value={body}
          onChangeText={handleBodyChange}
          onKeyPress={handleBodyKeyPress}
          placeholder="start writing..."
          placeholderTextColor={CALM.textMuted}
          multiline
          textAlignVertical="top"
          scrollEnabled={false}
          autoCorrect={false}
          autoCapitalize="none"
          keyboardType="default"
        />

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

        {/* Classifying indicator — inline */}
        {isClassifying && (
          <View style={styles.classifyingRow}>
            <ActivityIndicator size="small" color={CALM.bronze} />
            <Text style={styles.classifyingText}>reading your note...</Text>
          </View>
        )}

        {/* Status message — shows after extraction completes */}
        {statusMessage && !isClassifying && (
          <View style={styles.statusRow}>
            <Feather name="info" size={12} color={CALM.textMuted} />
            <Text style={styles.statusText}>{statusMessage}</Text>
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
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowExtractModal(false)}
        >
          <View
            style={styles.modalCard}
            onStartShouldSetResponder={() => true}
          >
            {/* Modal header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <Feather name="zap" size={16} color={CALM.bronze} />
                <Text style={styles.modalTitle}>extracted</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowExtractModal(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Feather name="x" size={18} color={CALM.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Extraction cards */}
            <ScrollView
              style={styles.modalScroll}
              showsVerticalScrollIndicator={false}
              bounces
              scrollEventThrottle={16}
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
          </View>
        </Pressable>
      </Modal>

      {/* Edit extraction modal */}
      <Modal
        visible={!!editingExtraction}
        transparent
        animationType="fade"
        onRequestClose={handleEditCancel}
      >
        <Pressable style={styles.modalOverlay} onPress={handleEditCancel}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
          >
            <Pressable style={styles.editCard} onPress={() => {}}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>edit</Text>
                <TouchableOpacity
                  onPress={handleEditCancel}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Feather name="x" size={18} color={CALM.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Type pills */}
              <View style={styles.editTypePills}>
                {EDIT_TYPES.map((t) => (
                  <TouchableOpacity
                    key={t.key}
                    style={[
                      styles.editTypePill,
                      editType === t.key && styles.editTypePillActive,
                    ]}
                    onPress={() => setEditType(t.key)}
                  >
                    <Text
                      style={[
                        styles.editTypePillText,
                        editType === t.key && styles.editTypePillTextActive,
                      ]}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Amount */}
              <View style={styles.editField}>
                <Text style={styles.editLabel}>amount</Text>
                <View style={styles.editAmountRow}>
                  <Text style={styles.editAmountPrefix}>RM</Text>
                  <TextInput
                    style={styles.editAmountInput}
                    value={editAmount}
                    onChangeText={setEditAmount}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={CALM.textMuted}
                  />
                </View>
              </View>

              {/* Description */}
              <View style={styles.editField}>
                <Text style={styles.editLabel}>description</Text>
                <TextInput
                  style={styles.editInput}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder="what is this for?"
                  placeholderTextColor={CALM.textMuted}
                />
              </View>

              {/* Person */}
              <View style={styles.editField}>
                <Text style={styles.editLabel}>person</Text>
                <TextInput
                  style={styles.editInput}
                  value={editPerson}
                  onChangeText={setEditPerson}
                  placeholder="who?"
                  placeholderTextColor={CALM.textMuted}
                />
              </View>

              {/* Action buttons */}
              <View style={styles.editActions}>
                <TouchableOpacity style={styles.editCancelBtn} onPress={handleEditCancel}>
                  <Text style={styles.editCancelText}>cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.editSaveBtn, !editAmount && styles.editSaveBtnDisabled]}
                  onPress={handleEditSave}
                  disabled={!editAmount}
                  activeOpacity={0.7}
                >
                  <Feather name="check" size={14} color="#fff" />
                  <Text style={styles.editSaveText}>save</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
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
  titleInput: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.bold,
    lineHeight: 32,
    color: CALM.textPrimary,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: 0,
  },
  bodyInput: {
    minHeight: 180,
    fontSize: TYPOGRAPHY.size.base,
    lineHeight: 26,
    color: CALM.textPrimary,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
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
    padding: SPACING.lg,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: RADIUS.xl,
    width: '100%',
    maxHeight: '70%',
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modalTitle: {
    fontSize: TYPOGRAPHY.size.base,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
  },
  modalScroll: {
    flexShrink: 1,
  },
  classifyingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.xl,
  },
  classifyingText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontStyle: 'italic',
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
  // Edit modal
  editCard: {
    backgroundColor: '#fff',
    borderRadius: RADIUS.xl,
    width: '100%',
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  editTypePills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
  },
  editTypePill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: RADIUS.full,
    backgroundColor: withAlpha(CALM.textMuted, 0.06),
  },
  editTypePillActive: {
    backgroundColor: CALM.bronze,
  },
  editTypePillText: {
    fontSize: 11,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textMuted,
  },
  editTypePillTextActive: {
    color: '#fff',
  },
  editField: {
    gap: 4,
  },
  editLabel: {
    fontSize: 11,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textMuted,
    textTransform: 'lowercase' as any,
  },
  editAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withAlpha(CALM.textMuted, 0.04),
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    paddingHorizontal: SPACING.md,
  },
  editAmountPrefix: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textSecondary,
    marginRight: 4,
  },
  editAmountInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontVariant: ['tabular-nums'] as any,
  },
  editInput: {
    backgroundColor: withAlpha(CALM.textMuted, 0.04),
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
  },
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  editCancelBtn: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: 8,
  },
  editCancelText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  editSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CALM.deepOlive,
    paddingHorizontal: SPACING.xl,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
  },
  editSaveBtnDisabled: {
    opacity: 0.4,
  },
  editSaveText: {
    fontSize: TYPOGRAPHY.size.xs,
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
