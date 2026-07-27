import { create } from 'zustand';
import type { ChatConversation } from '../types';
import { useAIInsightsStore } from './aiInsightsStore';

// ─── ASK-ECHO (per-screen inline chat) THREADS ─────────────────────────
// The inline Ask-Echo sheet (EchoInlineChat) used to keep messages in component
// state — closing was fine, but navigating away unmounted the screen and the
// conversation vanished. Threads now live here, keyed by screen ('goals',
// 'budget', …), so each screen's chat survives navigation for the app session.
//
// This store is intentionally IN-MEMORY (no persist). Durability is handled by
// `flushInlineThreadsToHistory()` below: when the app goes to background, every
// non-empty thread is archived into the main Echo chat history
// (aiInsightsStore.conversations — persisted, 100-item sanity cap, tier
// chatSavedBubbles LOCKS old ones in the UI, never deletes).

export type InlineMsg = { role: 'user' | 'assistant'; content: string; pending?: boolean };

interface EchoInlineState {
  threads: Record<string, InlineMsg[]>;
  /** Replace-or-update one thread (same call shape as React's setState). */
  updateThread: (key: string, updater: InlineMsg[] | ((prev: InlineMsg[]) => InlineMsg[])) => void;
  clearThread: (key: string) => void;
}

export const useEchoInlineStore = create<EchoInlineState>()((set) => ({
  threads: {},
  updateThread: (key, updater) =>
    set((s) => ({
      threads: {
        ...s.threads,
        [key]: typeof updater === 'function' ? updater(s.threads[key] || []) : updater,
      },
    })),
  clearThread: (key) =>
    set((s) => {
      if (!(key in s.threads)) return {};
      const next = { ...s.threads };
      delete next[key];
      return { threads: next };
    }),
}));

/**
 * Archive every non-empty inline thread into the main Echo history, then clear
 * the threads. Called on AppState 'background' — the last reliable signal
 * before a kill (iOS/Android give no "app cleared" hook). Title + shape match
 * aiInsightsStore.archiveChat so saved threads look native in Echo history.
 */
export function flushInlineThreadsToHistory() {
  const { threads, clearThread } = useEchoInlineStore.getState();
  const keys = Object.keys(threads).filter((k) => (threads[k] || []).some((m) => m.role === 'user'));
  if (keys.length === 0) return;

  const nowIso = new Date().toISOString();
  const archived: ChatConversation[] = [];
  for (const key of keys) {
    const msgs = (threads[key] || []).filter((m) => !m.pending && m.content.trim());
    if (msgs.length === 0) continue;
    const firstUser = msgs.find((m) => m.role === 'user');
    const title = firstUser
      ? firstUser.content.slice(0, 50) + (firstUser.content.length > 50 ? '...' : '')
      : 'Ask Echo';
    archived.push({
      id: `inline-${key}-${Date.now()}`,
      title,
      messages: msgs.map((m) => ({ role: m.role, content: m.content, timestamp: nowIso })),
      createdAt: nowIso,
      lastMessageAt: nowIso,
    });
  }
  if (archived.length === 0) return;

  useAIInsightsStore.setState((state) => ({
    conversations: [...archived, ...state.conversations].slice(0, 100),
  }));
  keys.forEach(clearThread);
}
