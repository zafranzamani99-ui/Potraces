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

  // ── Transitional flat mirror (mirrors the business slot). Removed in Task 9. ──
  isAuthenticated: boolean;
  isVerified: boolean;
  phone: string | null;
  userId: string | null;
  provider: AuthProvider;
  setAuthenticated: (v: boolean) => void;
  setVerified: (v: boolean) => void;
  setPhone: (v: string | null) => void;
  setUserId: (v: string | null) => void;
  setProvider: (v: AuthProvider) => void;
  reset: () => void;
}

/** Keep the flat mirror fields in sync with the business slot (transitional). */
const mirror = (business: BusinessAuth) => ({
  isAuthenticated: business.isAuthenticated,
  isVerified: business.isVerified,
  phone: business.phone,
  userId: business.userId,
  provider: business.provider,
});

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      business: { ...EMPTY_BUSINESS },
      personal: { ...EMPTY_PERSONAL },
      setBusinessAuth: (p) =>
        set((s) => {
          const business = { ...s.business, ...p };
          return { business, ...mirror(business) };
        }),
      setPersonalAuth: (p) => set((s) => ({ personal: { ...s.personal, ...p } })),
      resetBusiness: () => set({ business: { ...EMPTY_BUSINESS }, ...mirror(EMPTY_BUSINESS) }),
      resetPersonal: () => set({ personal: { ...EMPTY_PERSONAL } }),

      // Transitional mirror → business slot
      isAuthenticated: false,
      isVerified: false,
      phone: null,
      userId: null,
      provider: null,
      setAuthenticated: (v) => get().setBusinessAuth({ isAuthenticated: v }),
      setVerified: (v) => get().setBusinessAuth({ isVerified: v }),
      setPhone: (v) => get().setBusinessAuth({ phone: v }),
      setUserId: (v) => get().setBusinessAuth({ userId: v }),
      setProvider: (v) => get().setBusinessAuth({ provider: v }),
      reset: () => get().resetBusiness(),
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
          const slots = migrateAuthV1toV2(flat);
          return { ...slots, ...mirror(slots.business) };
        }
        return persisted;
      },
    }
  )
);
