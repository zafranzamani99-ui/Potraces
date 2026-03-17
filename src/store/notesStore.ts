import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NotesState, NotePage, AIExtraction, AppMode } from '../types';

export const useNotesStore = create<NotesState>()(
  persist(
    (set, get) => ({
      pages: [],
      activePageId: null,
      isFirstWrite: true,

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
        })),

      deletePage: (id) =>
        set((state) => ({
          pages: state.pages.filter((p) => p.id !== id),
          activePageId: state.activePageId === id ? null : state.activePageId,
        })),

      deletePages: (ids) => {
        const idSet = new Set(ids);
        set((state) => ({
          pages: state.pages.filter((p) => !idSet.has(p.id)),
          activePageId: state.activePageId && idSet.has(state.activePageId) ? null : state.activePageId,
        }));
      },

      setActivePageId: (id) => set({ activePageId: id }),

      addExtraction: (pageId, extraction) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id === pageId
              ? { ...p, extractions: [...p.extractions, extraction], updatedAt: new Date() }
              : p
          ),
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
        })),

      clearPendingExtractions: (pageId: string) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id === pageId
              ? { ...p, extractions: p.extractions.filter((e) => e.status !== 'pending') }
              : p
          ),
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
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
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
