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
  ActivityIndicator,
  Modal,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useAppStore } from '../../store/appStore';
import { useAIInsightsStore } from '../../store/aiInsightsStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS, withAlpha } from '../../constants';
import { AIMessage, AIMessageAction } from '../../types';
import { sendChatMessage } from '../../services/moneyChat';
import { parseActions, executeAction, ChatAction } from '../../services/chatActions';

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
};

const ACTION_LABELS: Record<string, string> = {
  add_expense: 'Expense',
  add_income: 'Income',
  add_debt: 'Debt',
  add_subscription: 'Subscription',
  split_bill: 'Split',
};

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
const PendingChip = ({
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
};

// Floating modal for editing + confirming a pending action
const ActionEditModal = ({
  visible,
  action,
  onConfirm,
  onDismiss,
  onClose,
}: {
  visible: boolean;
  action: ChatAction | null;
  onConfirm: (edited: ChatAction) => void;
  onDismiss: () => void;
  onClose: () => void;
}) => {
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [person, setPerson] = useState('');

  useEffect(() => {
    if (action) {
      setDesc(action.description);
      setAmount(action.amount.toString());
      setCategory(action.category || '');
      setPerson(action.person || '');
    }
  }, [action]);

  if (!action) return null;

  const typeLabel = ACTION_LABELS[action.type] || action.type;
  const icon = ACTION_ICONS[action.type] || 'plus';

  const handleConfirm = () => {
    onConfirm({
      ...action,
      description: desc.trim() || action.description,
      amount: parseFloat(amount) || action.amount,
      category: category.trim() || action.category,
      person: person.trim() || action.person,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlayKav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity style={styles.modalCard} activeOpacity={1} onPress={() => {}}>
            <View style={styles.pendingCardHeader}>
              <View style={styles.pendingCardIconWrap}>
                <Feather name={icon} size={14} color={CALM.bronze} />
              </View>
              <Text style={styles.pendingCardType}>{typeLabel}</Text>
              <TouchableOpacity
                onPress={onClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ marginLeft: 'auto' }}
              >
                <Feather name="x" size={16} color={CALM.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.editField}>
              <Text style={styles.editLabel}>description</Text>
              <TextInput
                style={styles.editInput}
                value={desc}
                onChangeText={setDesc}
                placeholder="description"
                placeholderTextColor={CALM.textMuted}
              />
            </View>

            <View style={styles.editField}>
              <Text style={styles.editLabel}>amount (RM)</Text>
              <TextInput
                style={styles.editInput}
                value={amount}
                onChangeText={setAmount}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={CALM.textMuted}
              />
            </View>

            <View style={styles.editField}>
              <Text style={styles.editLabel}>category</Text>
              <TextInput
                style={styles.editInput}
                value={category}
                onChangeText={setCategory}
                placeholder="e.g. food, bills, transport"
                placeholderTextColor={CALM.textMuted}
              />
            </View>

            {(action.type === 'add_debt' || action.type === 'split_bill') && (
              <View style={styles.editField}>
                <Text style={styles.editLabel}>person</Text>
                <TextInput
                  style={styles.editInput}
                  value={person}
                  onChangeText={setPerson}
                  placeholder="name"
                  placeholderTextColor={CALM.textMuted}
                />
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.pendingSkipBtn} onPress={onDismiss} activeOpacity={0.7}>
                <Text style={styles.pendingSkipText}>dismiss</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.pendingConfirmBtn} onPress={handleConfirm} activeOpacity={0.7}>
                <Feather name="check" size={14} color="#fff" />
                <Text style={styles.pendingConfirmText}>confirm</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const ChatBubble = memo(({ item }: { item: AIMessage }) => {
  const isUser = item.role === 'user';
  const hasText = item.content.trim().length > 0;
  return (
    <View>
      {hasText && (
        <View
          style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}
          onStartShouldSetResponder={() => false}
        >
          <Text
            style={[styles.messageText, isUser && styles.userMessageText]}
            selectable
          >
            {item.content}
          </Text>
        </View>
      )}
      {item.actions?.map((action, i) => (
        <ActionCard key={i} action={action} />
      ))}
    </View>
  );
});

const MoneyChat: React.FC = () => {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const initialContext = route.params?.noteContext as string | undefined;
  const extractionContext = route.params?.extractionContext as string | undefined;
  const mode = useAppStore((s) => s.mode);

  const chatMessages = useAIInsightsStore((s) => s.chatMessages);
  const addChatMessage = useAIInsightsStore((s) => s.addChatMessage);
  const clearChat = useAIInsightsStore((s) => s.clearChat);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<ChatAction[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const didAutoSendRef = useRef(false);
  const prevCountRef = useRef(chatMessages.length);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isBusinessMode = mode === 'business';
  const suggestions = isBusinessMode ? BUSINESS_SUGGESTIONS : PERSONAL_SUGGESTIONS;

  // Show transient error — auto-clears after 4s
  const showError = useCallback((msg: string) => {
    setErrorNotice(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setErrorNotice(null), 4000);
  }, []);

  // Header clear button — only when messages exist
  useLayoutEffect(() => {
    if (chatMessages.length > 0) {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity
            onPress={() => { clearChat(); setPendingActions([]); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{ paddingHorizontal: SPACING.md }}
          >
            <Feather name="trash-2" size={18} color={CALM.textMuted} />
          </TouchableOpacity>
        ),
      });
    } else {
      navigation.setOptions({ headerRight: undefined });
    }
  }, [chatMessages.length, clearChat, navigation]);

  // Scroll to bottom when new messages arrive or pending actions appear
  useEffect(() => {
    if (chatMessages.length > prevCountRef.current || pendingActions.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
    prevCountRef.current = chatMessages.length;
  }, [chatMessages.length, pendingActions.length]);

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

  // Dismiss a pending action
  const handleSkipAction = useCallback((index: number) => {
    setEditingIndex(null);
    setPendingActions((prev) => prev.filter((_, i) => i !== index));
  }, []);

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
      (async () => {
        const result = await sendChatMessage(question, chatMessages);
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
    if (!question || isLoading) return;

    setInput('');
    setErrorNotice(null);
    setPendingActions([]); // clear any unconfirmed actions
    addChatMessage({ role: 'user', content: question, timestamp: new Date().toISOString() });
    setIsLoading(true);

    const result = await sendChatMessage(question, chatMessages);

    if (result.ok) {
      processResponse(result.text);
    } else {
      showError(result.error);
    }

    setIsLoading(false);
  }, [input, isLoading, chatMessages, addChatMessage, showError, processResponse]);

  const renderMessage = useCallback(({ item }: { item: AIMessage }) => (
    <ChatBubble item={item} />
  ), []);

  const keyExtractor = useCallback((_: AIMessage, index: number) => index.toString(), []);

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
      >
        {chatMessages.length === 0 ? (
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
                  onPress={() => setInput(suggestion)}
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
            scrollEventThrottle={16}
          />
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
          onDismiss={() => editingIndex !== null && handleSkipAction(editingIndex)}
          onClose={() => setEditingIndex(null)}
        />

        {isLoading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={CALM.accent} />
            <Text style={styles.loadingText}>Thinking...</Text>
          </View>
        )}

        {/* Transient error notice — not saved to chat */}
        {errorNotice && !isLoading && (
          <View style={styles.errorNotice}>
            <Feather name="alert-circle" size={14} color={CALM.bronze} />
            <Text style={styles.errorNoticeText}>{errorNotice}</Text>
            <TouchableOpacity
              onPress={() => setErrorNotice(null)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="x" size={14} color={CALM.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about your money..."
            placeholderTextColor={CALM.textSecondary}
            multiline
            editable={!isLoading}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!input.trim() || isLoading) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || isLoading}
          >
            <Feather name="send" size={20} color={input.trim() && !isLoading ? '#fff' : CALM.textSecondary} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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

  // Edit fields (inside modal)
  editField: {
    gap: 2,
  },
  editLabel: {
    fontSize: TYPOGRAPHY.size.xs,
    color: CALM.textMuted,
  },
  editInput: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textPrimary,
    backgroundColor: CALM.background,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: CALM.border,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
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
    width: '85%',
    backgroundColor: CALM.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
    gap: SPACING.sm,
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
  pendingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  pendingCardIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: withAlpha(CALM.bronze, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingCardType: {
    fontSize: TYPOGRAPHY.size.xs,
    fontWeight: TYPOGRAPHY.weight.semibold,
    color: CALM.bronze,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  pendingSkipBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
  },
  pendingSkipText: {
    fontSize: TYPOGRAPHY.size.sm,
    color: CALM.textMuted,
  },
  pendingConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: CALM.deepOlive,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
  },
  pendingConfirmText: {
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

  // Loading
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  loadingText: {
    ...TYPE.muted,
    color: CALM.accent,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.lg,
    backgroundColor: CALM.surface,
    borderTopWidth: 1,
    borderTopColor: CALM.border,
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
});

export default MoneyChat;
