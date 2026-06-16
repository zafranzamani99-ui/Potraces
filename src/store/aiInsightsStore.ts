import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AIMessage, ChatConversation } from '../types';
import type { ChatAction, ActionReceipt } from '../services/chatActions';
import { useWalletStore } from './walletStore';
import { useDebtStore } from './debtStore';

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

  // Report Narratives (per mode+month)
  reportNarratives: Record<string, { text: string; generatedAt: number }>;

  // Money Chat history
  chatMessages: AIMessage[];
  conversations: ChatConversation[];

  // Money entries Echo prepared that are awaiting the owner's confirmation
  // (tap a chip to save). Persisted so they survive navigating away / app
  // backgrounding — an item only leaves the queue when the owner confirms
  // (saves) or discards it. Nothing here is recorded yet.
  pendingActions: ChatAction[];

  // The most recent save (one or more chips), kept briefly so an "undo last save"
  // affordance survives leaving + reopening Echo. Cleared after a short TTL by the UI.
  lastSave: { receipts: ActionReceipt[]; count: number; at: number } | null;

  // Recurring "make it a subscription" nudges already shown (normalized desc),
  // plus an unsent capture preserved across reloads.
  recurringNudged: string[];
  failedCaptureText: string | null;
  dailyCheckinShownOn: string | null; // 'YYYY-MM-DD' of the last daily check-in

  // Actions
  setSpendingMirror: (text: string, monthKey: string) => void;
  setIsGenerating: (val: boolean) => void;
  clearSpendingMirror: () => void;
  setBreathingRoom: (category: string, limit: number) => void;
  removeBreathingRoom: (category: string) => void;
  dismissFreshStart: (monthKey: string) => void;
  setReportNarrative: (key: string, text: string) => void;
  addChatMessage: (msg: AIMessage) => void;
  clearChat: () => void;
  archiveChat: () => void;
  loadConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  addPendingActions: (actions: ChatAction[]) => void;
  removePendingActionById: (clientId: string) => void;
  replacePendingActionById: (clientId: string, action: ChatAction) => void;
  clearPendingActions: () => void;
  setLastSave: (receipts: ActionReceipt[], count: number) => void;
  clearLastSave: () => void;
  markRecurringNudged: (key: string) => void;
  setFailedCaptureText: (text: string | null) => void;
  markDailyCheckinShown: (dateStr: string) => void;
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
      reportNarratives: {},
      chatMessages: [],
      conversations: [],
      pendingActions: [],
      lastSave: null,
      recurringNudged: [],
      failedCaptureText: null,
      dailyCheckinShownOn: null,

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

      setReportNarrative: (key, text) =>
        set((state) => ({
          reportNarratives: {
            ...state.reportNarratives,
            [key]: { text, generatedAt: Date.now() },
          },
        })),

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

      addPendingActions: (actions) =>
        set((state) => ({
          pendingActions: [
            ...state.pendingActions,
            ...actions.map((a) => ({
              ...a,
              clientId: a.clientId || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
              preparedAt: a.preparedAt ?? Date.now(),
            })),
          ],
        })),

      removePendingActionById: (clientId) =>
        set((state) => ({ pendingActions: state.pendingActions.filter((p) => p.clientId !== clientId) })),

      replacePendingActionById: (clientId, action) =>
        set((state) => ({
          pendingActions: state.pendingActions.map((p) =>
            p.clientId === clientId ? { ...action, clientId, preparedAt: action.preparedAt ?? p.preparedAt } : p
          ),
        })),

      clearPendingActions: () => set({ pendingActions: [] }),

      setLastSave: (receipts, count) => set({ lastSave: { receipts, count, at: Date.now() } }),

      clearLastSave: () => set({ lastSave: null }),

      markRecurringNudged: (key) =>
        set((state) => (state.recurringNudged.includes(key)
          ? {}
          : { recurringNudged: [...state.recurringNudged, key].slice(-100) })),

      setFailedCaptureText: (text) => set({ failedCaptureText: text }),

      markDailyCheckinShown: (dateStr) => set({ dailyCheckinShownOn: dateStr }),
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
        reportNarratives: state.reportNarratives,
        chatMessages: state.chatMessages,
        conversations: state.conversations,
        pendingActions: state.pendingActions,
        lastSave: state.lastSave,
        recurringNudged: state.recurringNudged,
        failedCaptureText: state.failedCaptureText,
        dailyCheckinShownOn: state.dailyCheckinShownOn,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const sd = (v: any) => {
          if (!v) return null;
          const d = v instanceof Date ? v : new Date(v);
          return isNaN(d.getTime()) ? null : d;
        };
        state.spendingMirrorGeneratedAt = sd(state.spendingMirrorGeneratedAt);

        // Clean out old error messages that were accidentally persisted as chat
        // bubbles. Patterns are anchored to the EXACT error strings produced in
        // moneyChat.ts so a legit reply that happens to contain words like "went
        // wrong" or "try again" is never scrubbed.
        if (state.chatMessages?.length) {
          const errorPatterns = [
            /AI is cooling down — wait \d+s/i,
            /AI is busy — try again in a few minutes/i,
            /AI is temporarily unavailable — try again shortly/i,
            /AI is not configured/i,
            /AI rate limited — try again in a minute/i,
            /AI limit reached this month/i,
            /Couldn't reach AI\. Check your internet/i,
            /AI returned empty — try rephrasing/i,
            /Request timed out\./i,
            /^Something went wrong\. Try again\.$/i,
            /Already processing a message\./i,
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

        // Pending chips survive a cold start. Repair / drop ones whose referenced
        // wallet or debt no longer exists so a stale chip can't silently save to
        // the wrong place (or fail). Also backfill clientId/preparedAt on chips
        // persisted before the id-based queue existed, so id-based ops work.
        if (state.pendingActions?.length) {
          const wallets = useWalletStore.getState().wallets;
          const debts = useDebtStore.getState().debts;
          const walletExists = (name?: string) =>
            !!name && wallets.some(
              (w) => w.name.toLowerCase() === name.toLowerCase() || w.name.toLowerCase().includes(name.toLowerCase())
            );
          const activeDebtFor = (name?: string) =>
            !!name && debts.some(
              (d) => d.status !== 'settled' && d.contact?.name?.toLowerCase() === name.toLowerCase()
            );
          const DEBT_TARGET_TYPES = new Set(['debt_update', 'forgive_debt', 'delete_debt', 'edit_debt']);

          state.pendingActions = state.pendingActions
            .filter((a: ChatAction) => {
              // Drop debt-targeting chips whose person no longer has an active debt.
              if (DEBT_TARGET_TYPES.has(a.type)) return activeDebtFor(a.person);
              return true;
            })
            .map((a: ChatAction) => {
              const repaired: ChatAction = { ...a };
              // Strip a dangling wallet name so the executor falls back cleanly.
              if (repaired.wallet && !walletExists(repaired.wallet)) repaired.wallet = undefined;
              if (repaired.fromWallet && !walletExists(repaired.fromWallet)) repaired.fromWallet = undefined;
              if (repaired.toWallet && !walletExists(repaired.toWallet)) repaired.toWallet = undefined;
              if (repaired.creditWallet && !walletExists(repaired.creditWallet)) repaired.creditWallet = undefined;
              if (!repaired.clientId) repaired.clientId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
              if (repaired.preparedAt == null) repaired.preparedAt = Date.now();
              return repaired;
            });
        }

        // Drop a stale "undo last save" affordance — it's only meaningful briefly.
        if (state.lastSave && Date.now() - state.lastSave.at > 5 * 60 * 1000) {
          state.lastSave = null;
        }

        // Echo's live chat is per app-session: it resumes across screen opens
        // and app backgrounding, but a true cold start (app swiped away in the
        // task switcher) destroys the JS context and rehydrates here. Archive
        // the previous session's chat into history and start the next fresh.
        if (state.chatMessages?.length) {
          const msgs = state.chatMessages;
          if (msgs.length >= 2) {
            const firstUserMsg = msgs.find((m: any) => m.role === 'user');
            const title = firstUserMsg
              ? firstUserMsg.content.slice(0, 50) + (firstUserMsg.content.length > 50 ? '...' : '')
              : 'Chat';
            state.conversations = [
              {
                id: Date.now().toString(),
                title,
                messages: msgs,
                createdAt: msgs[0].timestamp,
                lastMessageAt: msgs[msgs.length - 1].timestamp,
              },
              ...(state.conversations || []),
            ].slice(0, 20);
          }
          state.chatMessages = [];
        }
      },
    }
  )
);
