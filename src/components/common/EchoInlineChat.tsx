import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  TextInput,
  FlatList,
  ActivityIndicator,
  PanResponder,
  useWindowDimensions,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { CALM, CALM_DARK, SPACING, TYPOGRAPHY, RADIUS, SHADOWS, withAlpha } from '../../constants';
import { useCalm, useIsDark } from '../../hooks/useCalm';
import { lightTap } from '../../services/haptics';
import { sendChatMessage } from '../../services/moneyChat';
import type { AIMessage } from '../../types';

export interface EchoChip {
  label: string;
  question: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  insightTitle: string;
  insightSubtitle: string;
  chips: EchoChip[];
  contextSnapshot: string;
  topInset?: number;
  bottomInset?: number;
  autoPrompt?: string;
}

type Msg = { role: 'user' | 'assistant'; content: string; pending?: boolean };

const DEFAULT_CHIPS: EchoChip[] = [
  { label: 'where did my money go?', question: 'where did my money go this month?' },
  { label: 'am I on track?', question: 'am I spending on track this month, and what\'s my pace?' },
  { label: 'my biggest expense?', question: 'what is my single biggest expense category this month?' },
  { label: 'am I rich? 😅', question: 'am i rich chat?' },
  { label: 'net worth check', question: 'what is my net worth right now across all wallets, debts, and BNPL?' },
  { label: 'how much cash?', question: 'how much liquid cash do I have across all my wallets right now?' },
  { label: 'who owes me?', question: 'who owes me money and how much total?' },
  { label: 'siapa hutang aku?', question: 'siapa yang masih hutang duit dengan aku dan berapa?' },
  { label: 'what do I owe?', question: 'how much do I owe to other people in total?' },
  { label: 'goals check', question: 'how are my savings goals going? am I on pace?' },
  { label: 'how long to hit my goal?', question: 'at my current savings pace, when will I hit each of my goals?' },
  { label: 'next bills?', question: 'what bills and subscriptions are coming up soon?' },
  { label: 'what am I subscribed to?', question: 'list all my active subscriptions and total monthly cost' },
  { label: 'this vs last month', question: 'how does my spending this month compare to last month?' },
  { label: 'food spending', question: 'how much am I spending on food and dining this month?' },
  { label: 'wallet drainer?', question: 'which categories are draining my wallet the most?' },
  { label: 'duit aku pergi mana?', question: 'duit aku pergi mana bulan ni? breakdown sikit.' },
  { label: 'habis berapa bulan ni?', question: 'berapa aku dah habis bulan ni dan berapa lagi tinggal?' },
  { label: 'banyak ke duit aku?', question: 'banyak ke duit aku sekarang? jujur sikit.' },
  { label: 'boleh beli tak?', question: 'based on my current cash and spending, macam mana financial health aku?' },
  { label: 'investment check', question: 'how are my savings accounts and investments doing?' },
  { label: 'end of month forecast', question: 'based on my spending pace, how much will I have left at the end of the month?' },
];

const SPRING = { damping: 22, stiffness: 220, mass: 0.5 };

const EchoInlineChat: React.FC<Props> = ({
  visible,
  onClose,
  insightTitle,
  insightSubtitle,
  chips,
  contextSnapshot,
  topInset = 20,
  bottomInset = 20,
  autoPrompt,
}) => {
  const C = useCalm();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(C), [C]);
  const { height: SCREEN_H } = useWindowDimensions();

  const allChips = useMemo(() => {
    const parentQuestions = new Set(chips.map((c) => c.question));
    const extras = DEFAULT_CHIPS.filter((c) => !parentQuestions.has(c.question));
    return [...chips, ...extras].slice(0, 10);
  }, [chips]);

  const DETENT_MED = SCREEN_H * 0.5;
  const DETENT_LG = SCREEN_H * 0.9;
  const DISMISS_H = DETENT_MED * 0.6; // drag below ~30% screen → dismiss

  const sheetHeight = useSharedValue(DETENT_MED);
  const dragStartH = useRef(DETENT_MED);

  const cardAnimStyle = useAnimatedStyle(() => ({
    height: sheetHeight.value,
  }));

  const backdropAnimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      sheetHeight.value,
      [0, DETENT_MED],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  const handlePan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, { dy }) => Math.abs(dy) > 3,
        onPanResponderGrant: () => {
          dragStartH.current = sheetHeight.value;
        },
        onPanResponderMove: (_, { dy }) => {
          const next = dragStartH.current - dy;
          sheetHeight.value = Math.max(DISMISS_H * 0.5, Math.min(DETENT_LG, next));
        },
        onPanResponderRelease: (_, { dy }) => {
          const finalH = dragStartH.current - dy;
          if (finalH < DISMISS_H) {
            onClose();
            // Height resets in the useEffect once visible=false (after modal fade-out)
          } else {
            const target =
              Math.abs(finalH - DETENT_MED) <= Math.abs(finalH - DETENT_LG)
                ? DETENT_MED
                : DETENT_LG;
            sheetHeight.value = withSpring(target, SPRING);
          }
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [DETENT_MED, DETENT_LG, DISMISS_H, onClose]
  );

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<Msg>>(null);
  const didAutoPromptRef = useRef(false);

  // Animate sheet up on open; reset on close
  useEffect(() => {
    if (visible) {
      sheetHeight.value = 0;
      sheetHeight.value = withSpring(DETENT_MED, SPRING);
    } else {
      setInput('');
      setSending(false);
      setTimeout(() => { sheetHeight.value = DETENT_MED; }, 350);
    }
  // DETENT_MED is derived from SCREEN_H — intentionally omitted to avoid loop
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const send = useCallback(
    async (rawText: string) => {
      const text = rawText.trim();
      if (!text || sending) return;

      lightTap();
      setInput('');

      const isFirst = messages.length === 0;
      const withContext = isFirst
        ? `Context (live data from the user's screen):\n${contextSnapshot}\n\n${text}`
        : text;

      const userMsg: Msg = { role: 'user', content: text };
      const pendingMsg: Msg = { role: 'assistant', content: '', pending: true };
      setMessages((prev) => [...prev, userMsg, pendingMsg]);
      setSending(true);

      const history: AIMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: new Date().toISOString(),
      }));

      try {
        const result = await sendChatMessage(withContext, history);
        setMessages((prev) => {
          const next = prev.slice(0, -1);
          if (result.ok) {
            return [...next, { role: 'assistant', content: result.text }];
          }
          return [...next, { role: 'assistant', content: `⚠️ ${result.error}` }];
        });
        if (result.ok) {
          // Expand to large so the user can read the full answer
          sheetHeight.value = withSpring(DETENT_LG, SPRING);
        }
      } catch (err: any) {
        setMessages((prev) => {
          const next = prev.slice(0, -1);
          return [...next, { role: 'assistant', content: `⚠️ ${err?.message || 'Something went wrong'}` }];
        });
      } finally {
        setSending(false);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60);
      }
    },
    [messages, sending, contextSnapshot]
  );

  // Reset so new autoPrompt always fires when the prompt itself changes
  useEffect(() => {
    didAutoPromptRef.current = false;
  }, [autoPrompt]);

  useEffect(() => {
    if (visible && autoPrompt && !didAutoPromptRef.current && messages.length === 0 && !sending) {
      didAutoPromptRef.current = true;
      send(autoPrompt);
    }
  }, [visible, autoPrompt, messages.length, sending, send]);

  const renderBubble = useCallback(
    ({ item }: { item: Msg }) => {
      const isUser = item.role === 'user';
      return (
        <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
          {item.pending ? (
            <View style={[styles.bubble, styles.bubbleAssistant]}>
              <ActivityIndicator size="small" color={C.accent} />
            </View>
          ) : (
            <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
              <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>{item.content}</Text>
            </View>
          )}
        </View>
      );
    },
    [styles, C]
  );

  return (
    <Modal visible={visible} animationType="none" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropAnimStyle]} pointerEvents="none" />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior="padding"
          style={styles.kav}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[styles.card, cardAnimStyle, { paddingBottom: Math.max(bottomInset, SPACING.md) }]}
            onStartShouldSetResponder={() => true}
          >
            {/* Drag handle — touch target for resize */}
            <View style={styles.handleArea} {...handlePan.panHandlers}>
              <View style={styles.handle} />
            </View>

            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.headerIcon}>
                  <Feather name="zap" size={14} color={C.onAccent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eyebrow}>echo</Text>
                  <Text style={styles.title} numberOfLines={2}>
                    {insightTitle}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => { lightTap(); onClose(); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Close chat"
              >
                <Feather name="x" size={20} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Insight subtitle (only shown before first message) */}
            {messages.length === 0 && (
              <Text style={styles.subtitle}>{insightSubtitle}</Text>
            )}

            {/* Messages */}
            <FlatList
              ref={listRef}
              data={messages}
              renderItem={renderBubble}
              keyExtractor={(_, i) => `m-${i}`}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews
              maxToRenderPerBatch={10}
              windowSize={5}
              initialNumToRender={10}
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
              ListEmptyComponent={
                <View style={styles.emptyHint}>
                  <Feather name="message-square" size={18} color={C.textMuted} />
                  <Text style={styles.emptyHintText}>tap a prompt below, or type your own</Text>
                </View>
              }
            />

            {/* Chips row (scrollable) */}
            {allChips.length > 0 && (
              <View style={styles.chipsWrap}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.chipsRow}
                >
                  {allChips.map((c, i) => (
                    <Animated.View key={i} entering={FadeIn.delay(80 + i * 60).duration(220)}>
                      <TouchableOpacity
                        style={styles.chip}
                        onPress={() => send(c.question)}
                        disabled={sending}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={c.label}
                      >
                        <Feather name="message-circle" size={12} color={C.accent} />
                        <Text style={styles.chipText} numberOfLines={1}>{c.label}</Text>
                      </TouchableOpacity>
                    </Animated.View>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Input bar */}
            <View style={styles.inputBar}>
              <TextInput
                style={styles.input}
                value={input}
                onChangeText={setInput}
                placeholder="ask echo anything…"
                placeholderTextColor={C.textMuted}
                multiline
                maxLength={500}
                editable={!sending}
                keyboardAppearance={isDark ? 'dark' : 'light'}
                selectionColor={C.accent}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
                onPress={() => send(input)}
                disabled={!input.trim() || sending}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Send message"
              >
                {sending ? (
                  <ActivityIndicator size="small" color={C.onAccent} />
                ) : (
                  <Feather name="arrow-up" size={18} color={C.onAccent} />
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const makeStyles = (C: typeof CALM) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
    },
    backdrop: {
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    kav: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    card: {
      backgroundColor: C.surface,
      borderTopLeftRadius: RADIUS.xl,
      borderTopRightRadius: RADIUS.xl,
      paddingHorizontal: SPACING.xl,
      overflow: 'hidden',
      ...(C === CALM_DARK ? SHADOWS.sm : SHADOWS.lg),
    },
    handleArea: {
      alignItems: 'center',
      paddingVertical: SPACING.sm + 2,
      marginHorizontal: -SPACING.xl,
    },
    handle: {
      width: 44,
      height: 4,
      borderRadius: 2,
      backgroundColor: C.border,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: SPACING.md,
      marginBottom: SPACING.sm,
    },
    headerLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SPACING.sm + 2,
    },
    headerIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    eyebrow: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: TYPOGRAPHY.weight.semibold,
      color: C.accent,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    title: {
      fontSize: TYPOGRAPHY.size.base,
      fontWeight: TYPOGRAPHY.weight.bold,
      color: C.textPrimary,
      lineHeight: 20,
    },
    subtitle: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textSecondary,
      lineHeight: 20,
      marginBottom: SPACING.sm,
    },
    list: {
      flex: 1,
      marginTop: SPACING.sm,
    },
    listContent: {
      paddingVertical: SPACING.sm,
      gap: SPACING.sm,
    },
    emptyHint: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.xl,
    },
    emptyHintText: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textMuted,
    },
    bubbleRow: {
      flexDirection: 'row',
      marginBottom: 2,
    },
    bubbleRowUser: {
      justifyContent: 'flex-end',
    },
    bubbleRowAssistant: {
      justifyContent: 'flex-start',
    },
    bubble: {
      maxWidth: '82%',
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm + 2,
      borderRadius: RADIUS.lg,
    },
    bubbleUser: {
      backgroundColor: C.accent,
      borderBottomRightRadius: 4,
    },
    bubbleAssistant: {
      backgroundColor: withAlpha(C.accent, 0.08),
      borderBottomLeftRadius: 4,
    },
    bubbleText: {
      fontSize: TYPOGRAPHY.size.sm,
      color: C.textPrimary,
      lineHeight: 20,
    },
    bubbleTextUser: {
      color: C.onAccent,
    },
    chipsWrap: {
      marginTop: SPACING.sm,
      marginBottom: SPACING.sm,
      marginHorizontal: -SPACING.xl,
    },
    chipsRow: {
      paddingHorizontal: SPACING.xl,
      gap: SPACING.sm,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACING.xs,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderRadius: RADIUS.full,
      backgroundColor: withAlpha(C.accent, 0.08),
      borderWidth: 1,
      borderColor: withAlpha(C.accent, 0.18),
    },
    chipText: {
      fontSize: TYPOGRAPHY.size.xs,
      fontWeight: TYPOGRAPHY.weight.medium,
      color: C.textPrimary,
    },
    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: SPACING.sm,
      paddingTop: SPACING.sm,
      borderTopWidth: 1,
      borderTopColor: C.border,
    },
    input: {
      flex: 1,
      minHeight: 40,
      maxHeight: 120,
      fontSize: TYPOGRAPHY.size.base,
      color: C.textPrimary,
      backgroundColor: withAlpha(C.accent, 0.04),
      borderRadius: RADIUS.lg,
      paddingHorizontal: SPACING.md,
      paddingVertical: SPACING.sm,
      borderWidth: 1,
      borderColor: C.border,
    },
    sendBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 2,
    },
    sendBtnDisabled: {
      opacity: 0.4,
    },
  });

export default EchoInlineChat;
