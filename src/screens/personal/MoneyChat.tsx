import React, { useState, useRef, useCallback, useEffect, useLayoutEffect, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ScrollView,
  Animated,
  Image,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useHeaderHeight } from '@react-navigation/elements';
import * as ImagePicker from 'expo-image-picker';
import { readAsStringAsync, EncodingType } from 'expo-file-system/legacy';
import { format } from 'date-fns';
import * as Clipboard from 'expo-clipboard';
import { useAppStore } from '../../store/appStore';
import { useAIInsightsStore } from '../../store/aiInsightsStore';
import { useWalletStore } from '../../store/walletStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { AIMessage, AIMessageAction } from '../../types';
import { useCategories } from '../../hooks/useCategories';
import CategoryPicker from '../../components/common/CategoryPicker';
import WalletPicker from '../../components/common/WalletPicker';
import { sendChatMessage } from '../../services/moneyChat';
import { parseActions, executeAction, ChatAction } from '../../services/chatActions';
import { lightTap, successNotification } from '../../services/haptics';
import { useVoiceInput } from '../../hooks/useVoiceInput';

const PERSONAL_SUGGESTIONS = [
  'Where does most of my money go?',
  'How much did I spend on food?',
  'Add rm15 lunch at mamak',
];

const BUSINESS_SUGGESTIONS = [
  'How was this month compared to last?',
  'Can I afford a new phone?',
  'Is my income stable?',
];

const ACTION_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  add_expense: 'arrow-up-right',
  add_income: 'arrow-down-left',
  add_debt: 'repeat',
  add_subscription: 'calendar',
  split_bill: 'users',
  debt_update: 'check-circle',
  transfer: 'arrow-right',
  add_goal_contribution: 'target',
  cancel_subscription: 'x-circle',
  forgive_debt: 'heart',
  update_subscription: 'edit-2',
  add_bnpl: 'credit-card',
  repay_credit: 'dollar-sign',
};

const ACTION_LABELS: Record<string, string> = {
  add_expense: 'Expense',
  add_income: 'Income',
  add_debt: 'Debt',
  add_subscription: 'Subscription',
  split_bill: 'Split',
  debt_update: 'Payment',
  transfer: 'Transfer',
  add_goal_contribution: 'Goal',
  cancel_subscription: 'Cancel',
  forgive_debt: 'Forgive',
  update_subscription: 'Update',
  add_bnpl: 'BNPL',
  repay_credit: 'Repay',
};

// Typing indicator — 3 olive dots with staggered animation
const TypingDots = memo(() => {
  const dots = useRef([new Animated.Value(0.3), new Animated.Value(0.3), new Animated.Value(0.3)]).current;

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true }),
        ])
      )
    );
    animations.forEach((a) => a.start());
    return () => animations.forEach((a) => a.stop());
  }, [dots]);

  return (
    <View style={[styles.messageBubble, styles.assistantBubble, styles.typingBubble]}>
      <View style={styles.typingRow}>
        {dots.map((dot, i) => (
          <Animated.View key={i} style={[styles.typingDot, { opacity: dot }]} />
        ))}
      </View>
    </View>
  );
});

// Animated entrance wrapper — fade-in + slide-up
const AnimatedBubble = memo(({ children }: { children: React.ReactNode }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
});

// Highlight RM amounts in assistant text
const HighlightedText = memo(({ text, style }: { text: string; style: any }) => {
  const parts = text.split(/(RM\s?[\d,]+\.?\d*)/gi);
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        /^RM\s?[\d,]+\.?\d*$/i.test(part) ? (
          <Text key={i} style={{ fontWeight: '700', color: CALM.deepOlive }}>{part}</Text>
        ) : (
          <Text key={i}>{part}</Text>
        )
      )}
    </Text>
  );
});

// Confirmed/failed action card (shown in chat history)
const ActionCard = memo(({ action }: { action: AIMessageAction }) => {
  if (!action.message && !action.description) return null;

  const label = action.message
    || (action.description && action.amount
      ? `${action.description} — RM ${action.amount.toFixed(2)}`
      : action.description || 'Done');

  return (
    <View style={[styles.actionCard, action.success ? styles.actionCardSuccess : styles.actionCardFail]}>
      <View style={styles.actionCardRow}>
        <Feather
          name={action.success ? (ACTION_ICONS[action.type] || 'check') : 'x'}
          size={14}
          color={action.success ? CALM.deepOlive : CALM.textMuted}
        />
        <Text style={[styles.actionCardText, !action.success && styles.actionCardTextFail]}>
          {label}
        </Text>
      </View>
    </View>
  );
});

// Compact pending action chip — tap to open edit modal
const PendingChip = memo(({
  action,
  onPress,
}: {
  action: ChatAction;
  onPress: () => void;
}) => {
  const icon = ACTION_ICONS[action.type] || 'plus';
  const typeLabel = ACTION_LABELS[action.type] || action.type;
  const personLabel = action.person ? ` · ${action.person}` : '';

  return (
    <TouchableOpacity style={styles.pendingChip} activeOpacity={0.7} onPress={onPress}>
      <View style={styles.pendingChipIconWrap}>
        <Feather name={icon} size={12} color={CALM.bronze} />
      </View>
      <Text style={styles.pendingChipText} numberOfLines={1}>
        {action.description}{personLabel}
      </Text>
      <Text style={styles.pendingChipAmount}>RM {action.amount.toFixed(2)}</Text>
    </TouchableOpacity>
  );
});

// Common action types the user can switch between
const SWITCHABLE_TYPES: { key: string; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: 'add_expense', label: 'Expense', icon: 'arrow-up-right' },
  { key: 'add_income', label: 'Income', icon: 'arrow-down-left' },
  { key: 'add_debt', label: 'Debt', icon: 'repeat' },
  { key: 'add_subscription', label: 'Sub', icon: 'credit-card' },
];

// Floating modal for editing + confirming a pending action
const ActionEditModal = ({
  visible,
  action,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  action: ChatAction | null;
  onConfirm: (edited: ChatAction) => void;
  onClose: () => void;
}) => {
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [actionType, setActionType] = useState('add_expense');
  const [categoryId, setCategoryId] = useState('');
  const [walletId, setWalletId] = useState('');
  const [person, setPerson] = useState('');
  const [debtType, setDebtType] = useState<'i_owe' | 'they_owe'>('they_owe');
  const [modalAnim, setModalAnim] = useState<'fade' | 'none'>('fade');
  const [showTypePicker, setShowTypePicker] = useState(false);

  const navigation = useNavigation<any>();
  const expenseCategories = useCategories('expense');
  const incomeCategories = useCategories('income');
  const wallets = useWalletStore((s) => s.wallets);

  // Close modal instantly then navigate to Settings
  const handleNavigateToSettings = useCallback(() => {
    setModalAnim('none');
    onClose();
    setTimeout(() => {
      navigation.navigate('Settings', { scrollTo: 'categories' });
      setModalAnim('fade');
    }, 50);
  }, [onClose, navigation]);

  const isIncome = actionType === 'add_income';
  const categories = isIncome ? incomeCategories : expenseCategories;
  const showCategory = ['add_expense', 'add_income', 'add_subscription', 'update_subscription'].includes(actionType);
  const showWallet = ['add_expense', 'add_income', 'add_bnpl', 'repay_credit'].includes(actionType);
  const showPerson = ['add_debt', 'split_bill', 'debt_update', 'forgive_debt'].includes(actionType);

  useEffect(() => {
    if (action) {
      setDesc(action.description);
      setAmount(action.amount.toString());
      setActionType(action.type);
      setPerson(action.person || '');
      setDebtType(action.debtType || 'they_owe');

      // Match category by ID or name
      const catStr = (action.category || '').toLowerCase().replace(/[\s&]+/g, '_');
      const catMatch = categories.find((c) => c.id === catStr)
        || categories.find((c) => c.name.toLowerCase().replace(/[\s&]+/g, '_') === catStr)
        || categories[0];
      setCategoryId(catMatch?.id || 'other');

      // Match wallet by name
      const walletStr = (action.wallet || '').toLowerCase();
      const walletMatch = wallets.find((w) => w.name.toLowerCase() === walletStr)
        || wallets.find((w) => w.isDefault)
        || wallets[0];
      setWalletId(walletMatch?.id || '');
    }
  }, [action]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!action) return null;

  const handleConfirm = () => {
    const selectedCat = categories.find((c) => c.id === categoryId);
    const selectedWallet = wallets.find((w) => w.id === walletId);
    onConfirm({
      ...action,
      type: actionType,
      description: desc.trim() || action.description,
      amount: parseFloat(amount) || action.amount,
      category: selectedCat?.id || action.category,
      wallet: selectedWallet?.name || action.wallet,
      person: person.trim() || action.person,
      debtType: showPerson ? debtType : action.debtType,
    });
  };

  return (
    <Modal visible={visible} transparent animationType={modalAnim} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlayKav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
          <View style={styles.modalCard}>
            {/* Close — top right */}
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.modalClose}
            >
              <Feather name="x" size={18} color={CALM.textMuted} />
            </TouchableOpacity>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={styles.modalScrollContent}
            >
              {/* Type selector — tap to open picker */}
              <View style={styles.editField}>
                <Text style={styles.editLabel}>type</Text>
                <TouchableOpacity
                  style={styles.typeSelect}
                  onPress={() => {
                    lightTap();
                    setShowTypePicker(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Feather
                    name={SWITCHABLE_TYPES.find((t) => t.key === actionType)?.icon || 'circle'}
                    size={14}
                    color={CALM.bronze}
                  />
                  <Text style={styles.typeSelectText}>
                    {SWITCHABLE_TYPES.find((t) => t.key === actionType)?.label || actionType}
                  </Text>
                  <Feather name="chevron-down" size={14} color={CALM.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Amount — large and clean */}
              <View style={styles.amountSection}>
                <Text style={styles.amountPrefix}>RM</Text>
                <TextInput
                  style={styles.amountInput}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={CALM.border}
                />
              </View>

              {/* Description — underline style */}
              <TextInput
                style={styles.descInput}
                value={desc}
                onChangeText={setDesc}
                placeholder="description"
                placeholderTextColor={CALM.textMuted}
              />

              {/* Category dropdown */}
              {showCategory && (
                <CategoryPicker
                  categories={categories}
                  selectedId={categoryId}
                  onSelect={setCategoryId}
                  label="category"
                  layout="dropdown"
                  onNavigateToSettings={handleNavigateToSettings}
                />
              )}

              {/* Wallet dropdown */}
              {showWallet && wallets.length > 0 && (
                <WalletPicker
                  wallets={wallets}
                  selectedId={walletId}
                  onSelect={setWalletId}
                  label="wallet"
                />
              )}

              {/* Person + debt direction */}
              {showPerson && (
                <>
                  <View style={styles.editField}>
                    <Text style={styles.editLabel}>person</Text>
                    <TextInput
                      style={styles.descInput}
                      value={person}
                      onChangeText={setPerson}
                      placeholder="name"
                      placeholderTextColor={CALM.textMuted}
                    />
                  </View>
                  <View style={styles.debtToggleRow}>
                    <TouchableOpacity
                      style={[styles.debtToggle, debtType === 'they_owe' && styles.debtToggleTheyOwe]}
                      onPress={() => setDebtType('they_owe')}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.debtToggleText, debtType === 'they_owe' && styles.debtToggleTextTheyOwe]}>
                        they owe me
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.debtToggle, debtType === 'i_owe' && styles.debtToggleIOwe]}
                      onPress={() => setDebtType('i_owe')}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.debtToggleText, debtType === 'i_owe' && styles.debtToggleTextIOwe]}>
                        I owe them
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* Confirm */}
              <TouchableOpacity style={styles.confirmBtnFull} onPress={handleConfirm} activeOpacity={0.7}>
                <Feather name="check" size={15} color="#fff" />
                <Text style={styles.confirmBtnText}>confirm</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </KeyboardAvoidingView>

      {/* Type picker — floating centered card */}
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
            {SWITCHABLE_TYPES.map((t) => {
              const active = actionType === t.key;
              return (
                <TouchableOpacity
                  key={t.key}
                  style={[styles.typePickerOption, active && styles.typePickerOptionActive]}
                  onPress={() => {
                    setActionType(t.key);
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
    </Modal>
  );
};

const ChatBubble = memo(({ item, onSelectText }: { item: AIMessage; onSelectText: (text: string) => void }) => {
  const isUser = item.role === 'user';
  const hasText = item.content.trim().length > 0;
  const hasImage = isUser && !!item.imageUri;
  const showBubble = hasText || hasImage;

  const handleLongPress = useCallback(() => {
    if (!hasText) return;
    lightTap();
    onSelectText(item.content);
  }, [item.content, hasText, onSelectText]);

  return (
    <AnimatedBubble>
      <View>
        {showBubble && (
          <TouchableOpacity
            activeOpacity={0.8}
            onLongPress={handleLongPress}
            delayLongPress={400}
            style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}
          >
            {hasImage && (
              <Image
                source={{ uri: item.imageUri }}
                style={styles.chatImage}
                resizeMode="cover"
              />
            )}
            {isUser ? (
              hasText ? (
                <Text style={[styles.messageText, styles.userMessageText]}>
                  {item.content}
                </Text>
              ) : null
            ) : (
              <HighlightedText text={item.content} style={styles.messageText} />
            )}
          </TouchableOpacity>
        )}
        {item.actions?.map((action, i) => (
          <ActionCard key={i} action={action} />
        ))}
      </View>
    </AnimatedBubble>
  );
});

const MoneyChat: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const headerHeight = useHeaderHeight();
  const initialContext = route.params?.noteContext as string | undefined;
  const extractionContext = route.params?.extractionContext as string | undefined;
  const mode = useAppStore((s) => s.mode);

  const chatMessages = useAIInsightsStore((s) => s.chatMessages);
  const addChatMessage = useAIInsightsStore((s) => s.addChatMessage);
  const clearChat = useAIInsightsStore((s) => s.clearChat);
  const archiveChat = useAIInsightsStore((s) => s.archiveChat);
  const hasConversations = useAIInsightsStore((s) => s.conversations.length > 0);
  const conversations = useAIInsightsStore((s) => s.conversations);
  const loadConversation = useAIInsightsStore((s) => s.loadConversation);
  const deleteConversation = useAIInsightsStore((s) => s.deleteConversation);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<ChatAction[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [selectTextContent, setSelectTextContent] = useState<string | null>(null);
  const [lastFailedSend, setLastFailedSend] = useState<{ text: string; base64?: string } | null>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const didAutoSendRef = useRef(false);
  const didArchiveRef = useRef(false);
  const prevCountRef = useRef(chatMessages.length);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  // Voice input
  const { isRecording, isTranscribing, error: voiceError, startRecording, stopAndTranscribe } = useVoiceInput();
  const recordingAnim = useRef(new Animated.Value(1)).current;

  const isBusinessMode = mode === 'business';
  const suggestions = isBusinessMode ? BUSINESS_SUGGESTIONS : PERSONAL_SUGGESTIONS;

  // Auto-archive previous chat on mount → start fresh each time
  useEffect(() => {
    if (!didArchiveRef.current && chatMessages.length > 0) {
      didArchiveRef.current = true;
      archiveChat();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    };
  }, []);

  // Show transient error — auto-clears after 4s
  const showError = useCallback((msg: string) => {
    setErrorNotice(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setErrorNotice(null), 4000);
  }, []);

  // Recording pulse animation
  useEffect(() => {
    if (isRecording) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(recordingAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
          Animated.timing(recordingAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      recordingAnim.setValue(1);
    }
  }, [isRecording, recordingAnim]);

  // Show voice errors
  useEffect(() => {
    if (voiceError) showError(voiceError);
  }, [voiceError, showError]);

  // Photo — direct launch with permission request
  const handlePickImage = useCallback(async (source: 'camera' | 'gallery') => {
    try {
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { showError('camera permission needed'); return; }
        const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 });
        if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { showError('photo library permission needed'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
        if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
      }
    } catch (err) {
      console.warn('[MoneyChat] Image picker error:', err);
      showError('could not open image picker');
    }
  }, [showError]);

  const handlePickCamera = useCallback(() => handlePickImage('camera'), [handlePickImage]);
  const handlePickGallery = useCallback(() => handlePickImage('gallery'), [handlePickImage]);

  // Mic — toggle recording
  const handleMicPress = useCallback(async () => {
    if (isRecording) {
      const text = await stopAndTranscribe();
      if (text) setInput(text);
    } else {
      lightTap();
      await startRecording();
    }
  }, [isRecording, startRecording, stopAndTranscribe]);

  // Header buttons — history + new chat
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginRight: SPACING.sm }}>
          {hasConversations && (
            <TouchableOpacity
              onPress={() => setShowHistory(true)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="clock" size={22} color={CALM.textMuted} />
            </TouchableOpacity>
          )}
          {chatMessages.length > 0 && (
            <TouchableOpacity
              onPress={() => { archiveChat(); setPendingActions([]); }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Feather name="plus" size={24} color={CALM.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      ),
    });
  }, [chatMessages.length, hasConversations, archiveChat, navigation]);

  // Scroll to bottom when new messages arrive
  const shouldScrollRef = useRef(false);
  useEffect(() => {
    if (chatMessages.length > prevCountRef.current && !showScrollDown) {
      shouldScrollRef.current = true;
    }
    prevCountRef.current = chatMessages.length;
  }, [chatMessages.length, showScrollDown]);

  const handleContentSizeChange = useCallback(() => {
    if (shouldScrollRef.current) {
      shouldScrollRef.current = false;
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, []);

  const contentHeightRef = useRef(0);
  const handleScroll = useCallback((e: any) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    contentHeightRef.current = contentSize.height;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    setShowScrollDown(distanceFromBottom > 150);
  }, []);

  const scrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, []);

  // Process AI response — parse actions but DON'T execute
  const processResponse = useCallback((rawResponse: string) => {
    const { cleanText, actions } = parseActions(rawResponse);

    // Add the text as a chat message
    addChatMessage({ role: 'assistant', content: cleanText, timestamp: new Date().toISOString() });

    // If there are actions, show them for confirmation
    if (actions.length > 0) {
      setPendingActions(actions);
    }
  }, [addChatMessage]);

  // Confirm a pending action (receives edited version from modal)
  const handleConfirmAction = useCallback((index: number, edited: ChatAction) => {
    const action = edited;
    setEditingIndex(null);

    const result = executeAction(action);
    if (result.success) successNotification();
    else lightTap();

    // Show result as a clear text message
    const prefix = result.success ? 'Recorded \u2705' : 'Failed \u274C';
    addChatMessage({
      role: 'assistant',
      content: `${prefix} ${result.message}`,
      timestamp: new Date().toISOString(),
    });

    // Remove from pending
    setPendingActions((prev) => prev.filter((_, i) => i !== index));
  }, [addChatMessage]);

  // Auto-send note context if passed from NoteEditor
  useEffect(() => {
    if (initialContext && !didAutoSendRef.current) {
      didAutoSendRef.current = true;

      let question: string;
      if (extractionContext) {
        question = `Here's my note:\n\n${initialContext}\n\nThe app extracted these items:\n${extractionContext}\n\nCheck if anything is missing or wrong — amounts, categories, items that should be there but aren't.`;
      } else {
        question = `Here's my note — help me understand the finances:\n\n${initialContext}`;
      }

      setInput('');
      addChatMessage({ role: 'user', content: question, timestamp: new Date().toISOString() });
      setIsLoading(true);
      const thisRequestId = ++requestIdRef.current;
      (async () => {
        const result = await sendChatMessage(question, chatMessages);
        if (requestIdRef.current !== thisRequestId) return;
        if (result.ok) {
          processResponse(result.text);
        } else {
          showError(result.error);
        }
        setIsLoading(false);
      })();
    }
  }, [initialContext, extractionContext]);

  const handleSend = useCallback(async () => {
    const question = input.trim();
    const hasImage = !!imageUri;
    if ((!question && !hasImage) || isLoading) return;

    lightTap();
    const sendText = question;
    const sendImageUri = imageUri;
    setInput('');
    setImageUri(null);
    setErrorNotice(null);
    setPendingActions([]); // clear any unconfirmed actions
    addChatMessage({
      role: 'user',
      content: sendText,
      timestamp: new Date().toISOString(),
      imageUri: sendImageUri || undefined,
    });
    setIsLoading(true);

    const thisRequestId = ++requestIdRef.current;

    // Convert image to base64 if attached
    let base64: string | undefined;
    if (sendImageUri) {
      try {
        base64 = await readAsStringAsync(sendImageUri, { encoding: EncodingType.Base64 });
      } catch {
        showError('could not read image');
        setIsLoading(false);
        return;
      }
    }

    const result = await sendChatMessage(sendText, chatMessages, base64);

    // Discard stale response if a newer request was fired
    if (requestIdRef.current !== thisRequestId) return;

    if (result.ok) {
      setLastFailedSend(null);
      processResponse(result.text);
    } else {
      setLastFailedSend({ text: sendText, base64 });
      showError(result.error);
    }

    setIsLoading(false);
  }, [input, imageUri, isLoading, chatMessages, addChatMessage, showError, processResponse]);

  const handleRetry = useCallback(async () => {
    if (!lastFailedSend || isLoading) return;
    setErrorNotice(null);
    setIsLoading(true);
    const thisRequestId = ++requestIdRef.current;
    const result = await sendChatMessage(lastFailedSend.text, chatMessages, lastFailedSend.base64);
    if (requestIdRef.current !== thisRequestId) return;
    if (result.ok) {
      setLastFailedSend(null);
      processResponse(result.text);
    } else {
      showError(result.error);
    }
    setIsLoading(false);
  }, [lastFailedSend, isLoading, chatMessages, processResponse, showError]);

  const handleSelectText = useCallback((text: string) => {
    setSelectTextContent(text);
  }, []);

  const renderMessage = useCallback(({ item }: { item: AIMessage }) => (
    <ChatBubble item={item} onSelectText={handleSelectText} />
  ), [handleSelectText]);

  const keyExtractor = useCallback((_: AIMessage, index: number) => index.toString(), []);

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={headerHeight}
      >
        {chatMessages.length === 0 && !isLoading ? (
          <View style={styles.emptyState}>
            <Feather name="message-circle" size={48} color={CALM.border} />
            <Text style={styles.emptyTitle}>Money Chat</Text>
            <Text style={styles.emptySubtitle}>
              {isBusinessMode
                ? 'Ask anything about your earnings'
                : 'Ask anything about your spending — or tell me to add things'}
            </Text>
            <View style={styles.suggestions}>
              {suggestions.map((suggestion) => (
                <TouchableOpacity
                  key={suggestion}
                  style={styles.suggestionChip}
                  onPress={() => { lightTap(); setInput(suggestion); }}
                >
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            style={{ flex: 1 }}
            data={chatMessages}
            renderItem={renderMessage}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.messageList}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews
            maxToRenderPerBatch={8}
            windowSize={7}
            onContentSizeChange={handleContentSizeChange}
            onScroll={handleScroll}
            scrollEventThrottle={100}
            ListFooterComponent={isLoading ? <TypingDots /> : null}
          />
        )}

        {/* Scroll to bottom button */}
        {showScrollDown && chatMessages.length > 0 && (
          <TouchableOpacity style={styles.scrollDownButton} onPress={scrollToBottom} activeOpacity={0.8}>
            <Feather name="chevron-down" size={18} color={CALM.textMuted} />
          </TouchableOpacity>
        )}

        {/* Pending actions — scrollable chips, tap to open edit modal */}
        {pendingActions.length > 0 && (
          <View style={styles.pendingSection}>
            <Text style={styles.pendingSectionLabel}>
              {pendingActions.length} item{pendingActions.length > 1 ? 's' : ''} to confirm — tap to review:
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pendingChipRow}
            >
              {pendingActions.map((action, i) => (
                <PendingChip
                  key={`${action.type}-${action.amount}-${i}`}
                  action={action}
                  onPress={() => setEditingIndex(i)}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Edit modal for pending action */}
        <ActionEditModal
          visible={editingIndex !== null}
          action={editingIndex !== null ? pendingActions[editingIndex] : null}
          onConfirm={(edited) => editingIndex !== null && handleConfirmAction(editingIndex, edited)}
          onClose={() => setEditingIndex(null)}
        />

        {/* Transient error notice — not saved to chat */}
        {errorNotice && !isLoading && (
          <View style={styles.errorNotice}>
            <Feather name="alert-circle" size={14} color={CALM.bronze} />
            <Text style={styles.errorNoticeText}>{errorNotice}</Text>
            {lastFailedSend && (
              <TouchableOpacity
                onPress={handleRetry}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.retryButton}
              >
                <Feather name="refresh-cw" size={12} color={CALM.bronze} />
                <Text style={styles.retryText}>retry</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => { setErrorNotice(null); setLastFailedSend(null); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="x" size={14} color={CALM.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Image preview strip */}
        {imageUri && (
          <View style={styles.imagePreviewBar}>
            <Image source={{ uri: imageUri }} style={styles.previewThumb} />
            <TouchableOpacity
              style={styles.removePreview}
              onPress={() => setImageUri(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View style={styles.removePreviewBg}>
                <Feather name="x" size={12} color="#fff" />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Recording indicator */}
        {isRecording && (
          <View style={styles.recordingBar}>
            <Animated.View style={[styles.recordingDot, { opacity: recordingAnim }]} />
            <Text style={styles.recordingText}>recording...</Text>
          </View>
        )}

        {/* Transcribing indicator */}
        {isTranscribing && (
          <View style={styles.recordingBar}>
            <Text style={styles.recordingText}>transcribing...</Text>
          </View>
        )}

        <View style={styles.inputBar}>
          {/* Camera + Gallery buttons */}
          <TouchableOpacity
            style={styles.inputIconButton}
            onPress={handlePickCamera}
            disabled={isLoading || isRecording}
          >
            <Feather
              name="camera"
              size={18}
              color={isLoading || isRecording ? CALM.border : CALM.textSecondary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.inputIconButton}
            onPress={handlePickGallery}
            disabled={isLoading || isRecording}
          >
            <Feather
              name="image"
              size={18}
              color={isLoading || isRecording ? CALM.border : CALM.textSecondary}
            />
          </TouchableOpacity>

          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder={isRecording ? '' : 'Ask about your money...'}
            placeholderTextColor={CALM.textSecondary}
            multiline
            editable={!isLoading && !isRecording}
          />

          {/* Mic / Send toggle */}
          {input.trim() || imageUri ? (
            <TouchableOpacity
              style={[styles.sendButton, isLoading && styles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={isLoading}
            >
              <Feather name="send" size={20} color={!isLoading ? '#fff' : CALM.textSecondary} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.sendButton,
                isRecording ? styles.micButtonActive : styles.micButton,
                (isLoading || isTranscribing) && styles.sendButtonDisabled,
              ]}
              onPress={handleMicPress}
              disabled={isLoading || isTranscribing}
            >
              <Feather
                name={isRecording ? 'square' : 'mic'}
                size={isRecording ? 16 : 20}
                color={isRecording ? '#fff' : (isLoading || isTranscribing ? CALM.textSecondary : CALM.accent)}
              />
            </TouchableOpacity>
          )}
        </View>

      </KeyboardAvoidingView>

      {/* Conversation history modal */}
      <Modal
        visible={showHistory}
        animationType="fade"
        transparent
        onRequestClose={() => setShowHistory(false)}
      >
        <TouchableOpacity
          style={styles.historyOverlay}
          activeOpacity={1}
          onPress={() => setShowHistory(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.historyCard}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>past chats</Text>
              <TouchableOpacity
                onPress={() => setShowHistory(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={18} color={CALM.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.historyList} showsVerticalScrollIndicator={false}>
              {conversations.length === 0 ? (
                <Text style={styles.historyEmpty}>no past conversations</Text>
              ) : (
                conversations.map((convo) => (
                  <TouchableOpacity
                    key={convo.id}
                    style={styles.historyItem}
                    onPress={() => {
                      loadConversation(convo.id);
                      setShowHistory(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.historyItemContent}>
                      <Text style={styles.historyItemTitle} numberOfLines={1}>{convo.title}</Text>
                      <Text style={styles.historyItemMeta}>
                        {convo.messages.length} messages · {(() => {
                          try {
                            const d = new Date(convo.lastMessageAt);
                            return isNaN(d.getTime()) ? '' : format(d, 'MMM d, HH:mm');
                          } catch { return ''; }
                        })()}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => deleteConversation(convo.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={{ padding: 4 }}
                    >
                      <Feather name="trash-2" size={14} color={CALM.textMuted} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Select text modal — long-press opens this so user can select specific words */}
      <Modal
        visible={!!selectTextContent}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectTextContent(null)}
      >
        <TouchableOpacity
          style={styles.selectTextOverlay}
          activeOpacity={1}
          onPress={() => setSelectTextContent(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.selectTextCard}>
            <View style={styles.selectTextHeader}>
              <Text style={styles.selectTextTitle}>select text</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.sm }}>
                <TouchableOpacity
                  onPress={async () => {
                    if (selectTextContent) {
                      await Clipboard.setStringAsync(selectTextContent);
                      setSelectTextContent(null);
                    }
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="copy" size={16} color={CALM.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setSelectTextContent(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="x" size={18} color={CALM.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
            <TextInput
              style={styles.selectTextBody}
              value={selectTextContent || ''}
              editable={false}
              multiline
              scrollEnabled
              selectTextOnFocus={false}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CALM.background,
  },
  chatContainer: {
    flex: 1,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING['2xl'],
    gap: SPACING.md,
  },
  emptyTitle: {
    fontSize: TYPOGRAPHY.size.xl,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  emptySubtitle: {
    ...TYPE.muted,
    color: CALM.textSecondary,
    marginBottom: SPACING.lg,
    textAlign: 'center',
  },
  suggestions: {
    gap: SPACING.sm,
    width: '100%',
  },
  suggestionChip: {
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  suggestionText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textSecondary,
  },

  // Messages
  messageList: {
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  messageBubble: {
    maxWidth: '80%',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.lg,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: CALM.accent,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  messageText: {
    fontSize: TYPE.insight.fontSize,
    lineHeight: TYPE.insight.lineHeight,
    color: CALM.textPrimary,
  },
  userMessageText: {
    color: '#fff',
  },

  // Confirmed action cards (in chat)
  actionCard: {
    alignSelf: 'flex-start',
    maxWidth: '80%',
    marginTop: 4,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  actionCardSuccess: {
    backgroundColor: withAlpha(CALM.deepOlive, 0.06),
    borderColor: withAlpha(CALM.deepOlive, 0.15),
  },
  actionCardFail: {
    backgroundColor: withAlpha(CALM.textMuted, 0.06),
    borderColor: withAlpha(CALM.textMuted, 0.15),
  },
  actionCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionCardText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.deepOlive,
  },
  actionCardTextFail: {
    color: CALM.textMuted,
  },

  // Scroll to bottom
  scrollDownButton: {
    position: 'absolute',
    right: SPACING.lg,
    bottom: 120,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CALM.surface,
    borderWidth: 1,
    borderColor: CALM.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 },
      android: { elevation: 4 },
    }),
  },

  // Pending actions — scrollable chips
  pendingSection: {
    paddingVertical: SPACING.sm,
    gap: 6,
  },
  pendingSectionLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
    paddingHorizontal: SPACING.lg,
  },
  pendingChipRow: {
    paddingHorizontal: SPACING.lg,
    gap: SPACING.sm,
  },
  pendingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: withAlpha(CALM.bronze, 0.2),
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
  },
  pendingChipIconWrap: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: withAlpha(CALM.bronze, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingChipText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textPrimary,
    maxWidth: 120,
  },
  pendingChipAmount: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.bronze,
    fontVariant: ['tabular-nums'] as any,
  },

  // Floating edit modal
  modalOverlayKav: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
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
  modalClose: {
    position: 'absolute',
    top: SPACING.md,
    right: SPACING.md,
    zIndex: 1,
  },
  modalScrollContent: {
    gap: SPACING.sm,
  },
  editField: {
    gap: 4,
  },
  editLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  typeSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: SPACING.sm,
    borderWidth: 1,
    borderColor: CALM.border,
    borderRadius: RADIUS.md,
  },
  typeSelectText: {
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
      android: { elevation: 12 },
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
  amountSection: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    paddingVertical: SPACING.xs,
  },
  amountPrefix: {
    fontSize: 18,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textMuted,
  },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: TYPOGRAPHY.weight.bold,
    color: CALM.textPrimary,
    padding: 0,
  },
  descInput: {
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: CALM.border,
    paddingVertical: SPACING.sm,
  },
  modalDivider: {
    height: 1,
    backgroundColor: CALM.border,
  },
  debtToggleRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  debtToggle: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    backgroundColor: CALM.background,
  },
  debtToggleTheyOwe: {
    backgroundColor: withAlpha(CALM.deepOlive, 0.12),
  },
  debtToggleIOwe: {
    backgroundColor: withAlpha('#C1694F', 0.12),
  },
  debtToggleText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
    fontWeight: TYPOGRAPHY.weight.medium,
  },
  debtToggleTextTheyOwe: {
    color: CALM.deepOlive,
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  debtToggleTextIOwe: {
    color: '#C1694F',
    fontWeight: TYPOGRAPHY.weight.semibold,
  },
  confirmBtnFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: CALM.deepOlive,
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING.md,
    marginTop: SPACING.xs,
  },
  confirmBtnText: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: '#fff',
  },

  // Error notice — transient, above input bar
  errorNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.xs,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    backgroundColor: withAlpha(CALM.bronze, 0.08),
    borderRadius: RADIUS.lg,
  },
  errorNoticeText: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.bronze,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.md,
    backgroundColor: withAlpha(CALM.bronze, 0.12),
  },
  retryText: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.bronze,
  },

  // Typing dots
  typingBubble: {
    marginTop: SPACING.sm,
    paddingVertical: 14,
    paddingHorizontal: SPACING.lg,
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: CALM.accent,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: CALM.surface,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
  },
  inputIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    fontSize: TYPOGRAPHY.size.base,
    color: CALM.textPrimary,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: CALM.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: CALM.border,
  },
  micButton: {
    backgroundColor: CALM.background,
    borderWidth: 1,
    borderColor: CALM.border,
  },
  micButtonActive: {
    backgroundColor: '#C1694F',
  },

  // Image preview
  imagePreviewBar: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
    backgroundColor: CALM.surface,
  },
  previewThumb: {
    width: 60,
    height: 60,
    borderRadius: RADIUS.md,
  },
  removePreview: {
    position: 'absolute',
    top: SPACING.sm - 6,
    left: SPACING.lg + 48,
  },
  removePreviewBg: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Chat image in bubble
  chatImage: {
    width: 160,
    height: 120,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.xs,
  },

  // Recording indicator
  recordingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 6,
    backgroundColor: CALM.surface,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C1694F',
  },
  recordingText: {
    fontSize: TYPOGRAPHY.size.xs,
    color: '#C1694F',
    fontWeight: TYPOGRAPHY.weight.medium,
  },

  // Conversation history modal
  historyOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyCard: {
    width: '88%',
    maxHeight: '70%',
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
      },
      android: { elevation: 12 },
    }),
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  historyTitle: {
    fontSize: TYPOGRAPHY.size.lg,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.textPrimary,
  },
  historyList: {
    maxHeight: 400,
  },
  historyEmpty: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
    textAlign: 'center',
    paddingVertical: SPACING.xl,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: CALM.border,
  },
  historyItemContent: {
    flex: 1,
    gap: 2,
  },
  historyItemTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textPrimary,
  },
  historyItemMeta: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },

  // Select text modal
  selectTextOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectTextCard: {
    width: '88%',
    maxHeight: '70%',
    backgroundColor: '#F5F4F0',
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
      },
      android: { elevation: 12 },
    }),
  },
  selectTextHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  selectTextTitle: {
    fontSize: TYPOGRAPHY.size.sm,
    fontWeight: TYPOGRAPHY.weight.medium,
    color: CALM.textMuted,
  },
  selectTextBody: {
    fontSize: TYPE.insight.fontSize,
    lineHeight: (TYPE.insight.lineHeight || 22) + 4,
    color: CALM.textPrimary,
    maxHeight: 400,
    padding: 0,
  },

});

export default MoneyChat;
