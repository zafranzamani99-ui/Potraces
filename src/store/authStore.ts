import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthState {
  isAuthenticated: boolean;
  isVerified: boolean;
  phone: string | null;
  userId: string | null;
  setAuthenticated: (authenticated: boolean) => void;
  setVerified: (verified: boolean) => void;
  setPhone: (phone: string | null) => void;
  setUserId: (userId: string | null) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      isVerified: false,
      phone: null,
      userId: null,
      setAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
      setVerified: (isVerified) => set({ isVerified }),
      setPhone: (phone) => set({ phone }),
      setUserId: (userId) => set({ userId }),
      reset: () =>
        set({
          isAuthenticated: false,
          isVerified: false,
          phone: null,
          userId: null,
        }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
