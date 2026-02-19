import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from '../types';

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      mode: 'personal',
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'app-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);