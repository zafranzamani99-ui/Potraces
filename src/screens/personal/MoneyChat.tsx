import React, { useState, useRef, useCallback, useMemo } from 'react';
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
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { subMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { useAppStore } from '../../store/appStore';
import { usePersonalStore } from '../../store/personalStore';
import { useBusinessStore } from '../../store/businessStore';
import { CALM, TYPE, SPACING, TYPOGRAPHY, RADIUS } from '../../constants';
import { AIMessage } from '../../types';
import { askMoneyQuestion, askBusinessQuestion } from '../../services/aiService';

const PERSONAL_SUGGESTIONS = [
  'Where does most of my money go?',
  'How much did I spend on food?',
  'Am I spending more this month?',
];

const BUSINESS_SUGGESTIONS = [
  'How was this month compared to last?',
  'Can I afford a new phone?',
  'Is my income stable?',
];

const MoneyChat: React.FC = () => {
  const mode = useAppStore((s) => s.mode);
  const { transactions } = usePersonalStore();
  const {
    incomeType,
    businessTransactions,
    riderCosts,
    clients,
  } = useBusinessStore();

  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const isBusinessMode = mode === 'business';
  const suggestions = isBusinessMode ? BUSINESS_SUGGESTIONS : PERSONAL_SUGGESTIONS;

  // 6-month average for business
  const monthlyAverage = useMemo(() => {
    if (!isBusinessMode) return 0;
    const now = new Date();
    let total = 0;
    let months = 0;
    for (let i = 0; i < 6; i++) {
      const ms = startOfMonth(subMonths(now, i));
      const me = endOfMonth(subMonths(now, i));
      const monthIncome = businessTransactions
        .filter(
          (t) =>
            t.type === 'income' &&
            isWithinInterval(t.date instanceof Date ? t.date : new Date(t.date), { start: ms, end: me })
        )
        .reduce((s, t) => s + t.amount, 0);
      if (monthIncome > 0) months++;
      total += monthIncome;
    }
    return months > 0 ? total / months : 0;
  }, [businessTransactions, isBusinessMode]);

  const handleSend = useCallback(async () => {
    const question = input.trim();
    if (!question || isLoading) return;

    setInput('');

    const userMessage: AIMessage = {
      role: 'user',
      content: question,
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setIsLoading(true);

    let response: string | null;

    if (isBusinessMode && incomeType) {
      response = await askBusinessQuestion(
        question,
        {
          incomeType,
          transactions: businessTransactions,
          riderCosts: incomeType === 'rider' ? riderCosts : undefined,
          clients: incomeType === 'freelance' ? clients : undefined,
          monthlyAverage,
        },
        messages
      );
    } else {
      response = await askMoneyQuestion(question, messages, transactions);
    }

    const assistantMessage: AIMessage = {
      role: 'assistant',
      content: response || "I couldn't process that right now. Try again?",
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, assistantMessage]);
    setIsLoading(false);
  }, [input, isLoading, messages, transactions, isBusinessMode, incomeType, businessTransactions, riderCosts, clients, monthlyAverage]);

  const renderMessage = useCallback(({ item }: { item: AIMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.messageText, isUser && styles.userMessageText]}>
          {item.content}
        </Text>
      </View>
    );
  }, []);

  const keyExtractor = useCallback((_: AIMessage, index: number) => index.toString(), []);

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={100}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="message-circle" size={48} color={CALM.border} />
            <Text style={styles.emptyTitle}>Money Chat</Text>
            <Text style={styles.emptySubtitle}>
              {isBusinessMode
                ? 'Ask anything about your earnings'
                : 'Ask anything about your spending'}
            </Text>
            <View style={styles.suggestions}>
              {suggestions.map((suggestion) => (
                <TouchableOpacity
                  key={suggestion}
                  style={styles.suggestionChip}
                  onPress={() => {
                    setInput(suggestion);
                  }}
                >
                  <Text style={styles.suggestionText}>{suggestion}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {isLoading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={CALM.accent} />
            <Text style={styles.loadingText}>Thinking...</Text>
          </View>
        )}

        <View style={styles.inputBar}>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Ask about your money..."
            placeholderTextColor={CALM.textSecondary}
            returnKeyType="send"
            onSubmitEditing={handleSend}
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
