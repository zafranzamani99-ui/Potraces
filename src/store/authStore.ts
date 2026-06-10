import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AuthProvider = 'phone' | 'google' | 'apple' | null;

interface AuthState {
  isAuthenticated: boolean;
  isVerified: boolean;
  phone: string | null;
  userId: string | null;
  provider: AuthProvider;
  setAuthenticated: (authenticated: boolean) => void;
  setVerified: (verified: boolean) => void;
  setPhone: (phone: string | null) => void;
  setUserId: (userId: string | null) => void;
  setProvider: (provider: AuthProvider) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      isVerified: false,
      phone: null,
      userId: null,
      provider: null,
      setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
      setVerified: (isVerified) => set({ isVerified }),
      setPhone: (phone) => set({ phone }),
      setUserId: (userId) => set({ userId }),
      setProvider: (provider) => set({ provider }),
      reset: () =>
        set({
          isAuthenticated: false,
          isVerified: false,
          phone: null,
          userId: null,
          provider: null,
        }),
    }),
    {
      name: 'auth-storage',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persisted: any, version: number) => {
        if (version === 0 || !version) {
          persisted.provider = persisted.isAuthenticated ? 'phone' : null;
        }
        return persisted;
      },
    }
  )
);
