import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { migrateAuthV1toV2 } from './authStoreMigrate';

export type AuthProvider = 'phone' | 'google' | 'apple' | null;

export interface ModeAuth {
  isAuthenticated: boolean;
  phone: string | null;
  userId: string | null;
  provider: AuthProvider;
}
export interface BusinessAuth extends ModeAuth {
  isVerified: boolean; // OTP/Telegram seller verification — business only
}

const EMPTY_PERSONAL: ModeAuth = { isAuthenticated: false, phone: null, userId: null, provider: null };
const EMPTY_BUSINESS: BusinessAuth = { ...EMPTY_PERSONAL, isVerified: false };

interface AuthState {
  business: BusinessAuth;
  personal: ModeAuth;
  setBusinessAuth: (p: Partial<BusinessAuth>) => void;
  setPersonalAuth: (p: Partial<ModeAuth>) => void;
  resetBusiness: () => void;
  resetPersonal: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      business: { ...EMPTY_BUSINESS },
      personal: { ...EMPTY_PERSONAL },
      setBusinessAuth: (p) => set((s) => ({ business: { ...s.business, ...p } })),
      setPersonalAuth: (p) => set((s) => ({ personal: { ...s.personal, ...p } })),
      resetBusiness: () => set({ business: { ...EMPTY_BUSINESS } }),
      resetPersonal: () => set({ personal: { ...EMPTY_PERSONAL } }),
    }),
    {
      name: 'auth-storage',
      version: 2,
      storage: createJSONStorage(() => AsyncStorage),
      migrate: (persisted: any, version: number) => {
        if (version < 2) {
          // v0 had no `provider`; derive it as the old v1 migration did.
          const flat =
            version === 0 || !version
              ? { ...persisted, provider: persisted?.isAuthenticated ? 'phone' : null }
              : persisted;
          return migrateAuthV1toV2(flat);
        }
        return persisted;
      },
    }
  )
);
