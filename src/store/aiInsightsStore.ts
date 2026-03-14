import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AIMessage, ChatConversation } from '../types';

interface BreathingRoom {
  category: string;
  limit: number; // user-set monthly breathing room
}

interface AIInsightsState {
  // Spending Mirror
  spendingMirrorText: string | null;
  spendingMirrorGeneratedAt: Date | null;
  spendingMirrorMonthKey: string | null; // "2026-03"
  isGenerating: boolean;

  // Breathing Room (soft budgets)
  breathingRooms: BreathingRoom[];
  freshStartDismissedMonth: string | null; // "2026-03" — don't show again this month

  // Money Chat history
  chatMessages: AIMessage[];
  conversations: ChatConversation[];

  // Actions
  setSpendingMirror: (text: string, monthKey: string) => void;
  setIsGenerating: (val: boolean) => void;
  clearSpendingMirror: () => void;
  setBreathingRoom: (category: string, limit: number) => void;
  removeBreathingRoom: (category: string) => void;
  dismissFreshStart: (monthKey: string) => void;
  addChatMessage: (msg: AIMessage) => void;
  clearChat: () => void;
  archiveChat: () => void;
  loadConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
}

export const useAIInsightsStore = create<AIInsightsState>()(
  persist(
    (set) => ({
      spendingMirrorText: null,
      spendingMirrorGeneratedAt: null,
      spendingMirrorMonthKey: null,
      isGenerating: false,
      breathingRooms: [],
      freshStartDismissedMonth: null,
      chatMessages: [],
      conversations: [],

      setSpendingMirror: (text, monthKey) =>
        set({
          spendingMirrorText: text,
          spendingMirrorGeneratedAt: new Date(),
          spendingMirrorMonthKey: monthKey,
          isGenerating: false,
        }),

      setIsGenerating: (val) => set({ isGenerating: val }),

      clearSpendingMirror: () =>
        set({
          spendingMirrorText: null,
          spendingMirrorGeneratedAt: null,
          spendingMirrorMonthKey: null,
        }),

      setBreathingRoom: (category, limit) =>
        set((state) => {
          const existing = state.breathingRooms.findIndex((b) => b.category === category);
          if (existing >= 0) {
            const updated = [...state.breathingRooms];
            updated[existing] = { category, limit };
            return { breathingRooms: updated };
          }
          return { breathingRooms: [...state.breathingRooms, { category, limit }] };
        }),

      removeBreathingRoom: (category) =>
        set((state) => ({
          breathingRooms: state.breathingRooms.filter((b) => b.category !== category),
        })),

      dismissFreshStart: (monthKey) => set({ freshStartDismissedMonth: monthKey }),

      addChatMessage: (msg) =>
        set((state) => ({
          chatMessages: [...state.chatMessages.slice(-48), msg], // keep last 50
        })),

      clearChat: () => set({ chatMessages: [] }),

      archiveChat: () =>
        set((state) => {
          if (state.chatMessages.length < 2) return { chatMessages: [] };
          const firstMsg = state.chatMessages[0];
          const lastMsg = state.chatMessages[state.chatMessages.length - 1];
          // Title from first user message, truncated
          const firstUserMsg = state.chatMessages.find((m) => m.role === 'user');
          const title = firstUserMsg
            ? firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '')
            : 'Chat';
          const conversation: ChatConversation = {
            id: Date.now().toString(),
            title,
            messages: state.chatMessages,
            createdAt: firstMsg.timestamp,
            lastMessageAt: lastMsg.timestamp,
          };
          return {
            chatMessages: [],
            conversations: [conversation, ...state.conversations].slice(0, 20), // keep last 20
          };
        }),

      loadConversation: (id) =>
        set((state) => {
          const convo = state.conversations.find((c) => c.id === id);
          if (!convo) return {};
          // Archive current if needed, then load
          const toArchive = state.chatMessages.length >= 2;
          let convos = state.conversations;
          if (toArchive) {
            const firstMsg = state.chatMessages[0];
            const lastMsg = state.chatMessages[state.chatMessages.length - 1];
            const firstUserMsg = state.chatMessages.find((m) => m.role === 'user');
            const title = firstUserMsg
              ? firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '')
              : 'Chat';
            convos = [{ id: Date.now().toString(), title, messages: state.chatMessages, createdAt: firstMsg.timestamp, lastMessageAt: lastMsg.timestamp }, ...convos].slice(0, 20);
          }
          return {
            chatMessages: convo.messages,
            conversations: convos.filter((c) => c.id !== id),
          };
        }),

      deleteConversation: (id) =>
        set((state) => ({
          conversations: state.conversations.filter((c) => c.id !== id),
        })),
    }),
    {
      name: 'ai-insights-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        spendingMirrorText: state.spendingMirrorText,
        spendingMirrorGeneratedAt: state.spendingMirrorGeneratedAt,
        spendingMirrorMonthKey: state.spendingMirrorMonthKey,
        breathingRooms: state.breathingRooms,
        freshStartDismissedMonth: state.freshStartDismissedMonth,
        chatMessages: state.chatMessages,
        conversations: state.conversations,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const sd = (v: any) => {
          if (!v) return null;
          const d = v instanceof Date ? v : new Date(v);
          return isNaN(d.getTime()) ? null : d;
        };
        state.spendingMirrorGeneratedAt = sd(state.spendingMirrorGeneratedAt);

        // Clean out old error messages that were accidentally persisted as chat bubbles
        if (state.chatMessages?.length) {
          const errorPatterns = [
            /cooling down/i,
            /come back in/i,
            /try again in/i,
            /AI is busy/i,
            /couldn't reach/i,
            /limit reached/i,
            /API key is missing/i,
            /returned empty/i,
            /timed out/i,
            /went wrong/i,
          ];
          state.chatMessages = state.chatMessages.filter((msg: any) => {
            if (msg.role !== 'assistant') return true;
            // Remove error messages
            if (errorPatterns.some((p) => p.test(msg.content))) return false;
            // Remove blank action-only messages (empty content with no useful action text)
            if (!msg.content?.trim() && msg.actions?.length) {
              const hasUsefulAction = msg.actions.some((a: any) => a.message?.trim());
              if (!hasUsefulAction) return false;
            }
            return true;
          });
        }
      },
    }
  )
);
