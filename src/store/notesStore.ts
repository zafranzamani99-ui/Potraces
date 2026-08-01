import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NotesState, NotePage, AppMode } from '../types';
import { useTombstoneStore } from './tombstoneStore';

export const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      pages: [],
      activePageId: null,
      isFirstWrite: true,
      // Ephemeral delete tombstones — drive the remote DELETE in pushAll, then
      // clear on a successful push. The durable tombstoneStore is the source of
      // truth that keeps a deleted note from resurrecting on pull.
      _deletedNoteIds: [],
      // Dormant dirty-tracking (Stage 1 incremental-sync). Sibling of _deletedNoteIds:
      // a note id lands here on every CREATE/UPDATE (not delete). Nothing consumes it yet.
      _dirtyNoteIds: [],

      createPage: (mode: AppMode) => {
        const id = Date.now().toString() + Math.random().toString(36).slice(2, 7);
        const page: NotePage = {
          id,
          title: '',
          content: '',
          createdAt: new Date(),
          updatedAt: new Date(),
          extractions: [],
          mode,
        };
        set((state) => ({
          pages: [page, ...state.pages],
          activePageId: id,
          _dirtyNoteIds: [...(state._dirtyNoteIds ?? []), id],
        }));
        return id;
      },

      updatePageContent: (id, content) =>
        set((state) => ({
          pages: state.pages.map((p) => {
            if (p.id !== id) return p;
            const firstLine = content.split('\n')[0].trim();
            return {
              ...p,
              content,
              title: firstLine.slice(0, 60) || 'untitled',
              updatedAt: new Date(),
            };
          }),
          _dirtyNoteIds: [...(state._dirtyNoteIds ?? []), id],
        })),

      updatePageFormatting: (id, formatting) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id === id ? { ...p, formatting, updatedAt: new Date() } : p
          ),
          _dirtyNoteIds: [...(state._dirtyNoteIds ?? []), id],
        })),

      deletePage: (id) => {
        set((state) => ({
          pages: state.pages.filter((p) => p.id !== id),
          activePageId: state.activePageId === id ? null : state.activePageId,
          _deletedNoteIds: [...(state._deletedNoteIds ?? []), id],
        }));
        useTombstoneStore.getState().addTombstones([id]);
      },

      deletePages: (ids) => {
        const idSet = new Set(ids);
        set((state) => ({
          pages: state.pages.filter((p) => !idSet.has(p.id)),
          activePageId: state.activePageId && idSet.has(state.activePageId) ? null : state.activePageId,
          _deletedNoteIds: [...(state._deletedNoteIds ?? []), ...ids],
        }));
        useTombstoneStore.getState().addTombstones(ids);
      },

      clearNotesTombstones: () => set({ _deletedNoteIds: [] }),

      // Dormant (Stage 1): reset this store's dirty set. Mirror of clearNotesTombstones.
      clearNotesDirty: () => set({ _dirtyNoteIds: [] }),

      setActivePageId: (id) => set({ activePageId: id }),

      addExtraction: (pageId, extraction) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id === pageId
              ? { ...p, extractions: [...p.extractions, extraction], updatedAt: new Date() }
              : p
          ),
          _dirtyNoteIds: [...(state._dirtyNoteIds ?? []), pageId],
        })),

      updateExtractionStatus: (pageId, extractionId, status, linkedId) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id === pageId
              ? {
                  ...p,
                  extractions: p.extractions.map((e) =>
                    e.id === extractionId
                      ? {
                          ...e,
                          status,
                          linkedId: linkedId ?? e.linkedId,
                          confirmedAt: status === 'confirmed' ? new Date().toISOString() : e.confirmedAt,
                        }
                      : e
                  ),
                }
              : p
          ),
          _dirtyNoteIds: [...(state._dirtyNoteIds ?? []), pageId],
        })),

      updateExtraction: (pageId, extractionId, updates) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id === pageId
              ? {
                  ...p,
                  extractions: p.extractions.map((e) =>
                    e.id === extractionId
                      ? {
                          ...e,
                          type: updates.type ?? e.type,
                          extractedData: updates.extractedData
                            ? { ...e.extractedData, ...updates.extractedData }
                            : e.extractedData,
                        }
                      : e
                  ),
                }
              : p
          ),
          _dirtyNoteIds: [...(state._dirtyNoteIds ?? []), pageId],
        })),

      clearPendingExtractions: (pageId: string) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id === pageId
              ? { ...p, extractions: p.extractions.filter((e) => e.status !== 'pending') }
              : p
          ),
          _dirtyNoteIds: [...(state._dirtyNoteIds ?? []), pageId],
        })),

      markFirstWriteComplete: () => set({ isFirstWrite: false }),
    }),
    {
      name: 'notes-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        pages: state.pages.map((p) => ({
          ...p,
          createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
          updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
        })),
        activePageId: state.activePageId,
        isFirstWrite: state.isFirstWrite,
        _deletedNoteIds: state._deletedNoteIds,
        _dirtyNoteIds: state._dirtyNoteIds ?? [],
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state._deletedNoteIds = state._deletedNoteIds || [];
          state._dirtyNoteIds = state._dirtyNoteIds || [];
          const sd = (v: any) => {
            if (!v) return new Date();
            const d = v instanceof Date ? v : new Date(v);
            return isNaN(d.getTime()) ? new Date() : d;
          };
          state.pages = (state.pages || []).map((p: any) => ({
            ...p,
            createdAt: sd(p.createdAt),
            updatedAt: sd(p.updatedAt),
            extractions: p.extractions || [],
          }));
        }
      },
    }
  )
);
