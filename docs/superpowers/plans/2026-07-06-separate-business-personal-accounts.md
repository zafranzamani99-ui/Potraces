# Separate Business & Personal Accounts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give business mode and personal mode two independent Supabase logins held side by side, so signing into one never touches the other — unless the user opts to reuse the same account.

**Architecture:** Split the single Supabase client into two clients (`supabaseBusiness`, `supabasePersonal`) against the same project, each with its own encrypted session slot. Split the flat `authStore` into `business`/`personal` slots. Route every call site to its home client + slot. Add a "reuse this account" shortcut and per-mode sign-out/delete semantics.

**Tech Stack:** React Native / Expo, `@supabase/supabase-js`, zustand (+ persist), expo-secure-store, TypeScript.

## Global Constraints

- **No new Supabase project / no schema change.** Both clients use `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Same tables, same RLS.
- **Automated gate is `npm run typecheck`** (tsc --noEmit). No jest; Supabase/RN native modules are not tsx-loadable. Pure logic is tested with self-running tsx scripts under `scripts/` (see `scripts/test-personal-sync-roundtrip.ts` for the pattern: `check(name, cond)`, exit non-zero on failure).
- **`isVerified` is business-only** — the OTP/Telegram seller check. Personal cloud backup needs only a valid session.
- **Transitional back-compat during the refactor:** keep `export const supabase = supabaseBusiness` and legacy flat `authStore` mirror fields until Task 9, so `typecheck` stays green between tasks. Remove them in Task 9.
- **Commit after every task.** Frequent commits.
- Pre-launch: testers get logged out of both modes once on upgrade (abandoned default storageKey). Acceptable — no migration of the old session.

---

### Task 1: Two-client layer + parameterized helpers + pure `isSharedAccount`

**Files:**
- Modify: `src/services/supabase.ts`
- Create: `src/services/accountLink.ts` (pure helper — no RN/Supabase imports)
- Create: `scripts/test-account-link.ts` (tsx test)
- Modify: `package.json` (add `test:accountlink` script)

**Interfaces:**
- Produces:
  - `supabaseBusiness`, `supabasePersonal` — two `SupabaseClient` instances.
  - `type Mode = 'business' | 'personal'`
  - `clientForMode(m: Mode): SupabaseClient`
  - Helpers gain an optional **trailing** `client` param defaulting to `supabaseBusiness`:
    `getAuthSession(client?)`, `signInWithPhone(phone, password, client?)`, `signUpWithPhone(phone, password, client?)`, `signOut(client?)`, `requestOtp(phone, client?)`, `checkVerification(client?)`, `clearPersonalDataRemote(client?)`, `deleteAccountRemote(client?)`.
  - `export const supabase = supabaseBusiness` (transitional alias).
  - `isSharedAccount(businessUserId: string | null, personalUserId: string | null): boolean` from `accountLink.ts`.

- [ ] **Step 1: Write the failing test** — `scripts/test-account-link.ts`

```ts
/**
 * Pure-logic tests for accountLink. No RN/Supabase imports, so tsx runs it.
 * Run: npm run test:accountlink
 */
import { isSharedAccount } from '../src/services/accountLink';

const failures: string[] = [];
let passed = 0;
const check = (name: string, cond: boolean) => { cond ? passed++ : failures.push(name); };

check('both null → not shared', isSharedAccount(null, null) === false);
check('one null → not shared', isSharedAccount('u1', null) === false);
check('null business → not shared', isSharedAccount(null, 'u1') === false);
check('different users → not shared', isSharedAccount('u1', 'u2') === false);
check('same user → shared', isSharedAccount('u1', 'u1') === true);

if (failures.length) { console.error('FAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`account-link OK (${passed} checks)`);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:accountlink` (after adding the script in Step 3's package.json edit)
Expected: FAIL — `Cannot find module '../src/services/accountLink'`

- [ ] **Step 3: Create `src/services/accountLink.ts` and add the npm script**

`src/services/accountLink.ts`:
```ts
/**
 * Pure helpers for reasoning about the business/personal account pair.
 * MUST stay free of React-Native / Supabase imports so tsx can load it.
 */

/** True only when both modes are signed into the SAME Supabase auth user. */
export function isSharedAccount(
  businessUserId: string | null,
  personalUserId: string | null,
): boolean {
  return !!businessUserId && !!personalUserId && businessUserId === personalUserId;
}
```

`package.json` scripts — add:
```json
"test:accountlink": "tsx scripts/test-account-link.ts",
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:accountlink`
Expected: PASS — `account-link OK (5 checks)`

- [ ] **Step 5: Refactor `src/services/supabase.ts` to two clients + parameterized helpers**

Replace the single-client block (`export const supabase = createClient(...)`, lines ~92-99) with a factory and two instances. Keep `SecureStoreAdapter` exactly as-is:

```ts
export type Mode = 'business' | 'personal';

function makeClient(namespace: Mode) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storageKey: `sb-${namespace}-auth`,
      storage: SecureStoreAdapter,
    },
  });
}

export const supabaseBusiness = makeClient('business');
export const supabasePersonal = makeClient('personal');
export const clientForMode = (m: Mode) => (m === 'business' ? supabaseBusiness : supabasePersonal);

/** Transitional alias — removed in Task 9 once every call site is routed. */
export const supabase = supabaseBusiness;
```

Then give each helper an optional trailing `client` (default `supabaseBusiness`) and use it instead of the bare `supabase`. Example transformations (apply to all helpers):

```ts
export async function getAuthSession(client: typeof supabaseBusiness = supabaseBusiness) {
  const { data: { session } } = await client.auth.getSession();
  return session;
}

export async function signInWithPhone(phone: string, password: string,
    client: typeof supabaseBusiness = supabaseBusiness) {
  const email = phoneToEmail(phone);
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut(client: typeof supabaseBusiness = supabaseBusiness) {
  const { signOutGoogle } = require('./googleAuth');
  signOutGoogle();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function deleteAccountRemote(client: typeof supabaseBusiness = supabaseBusiness): Promise<void> {
  const { data: { session } } = await client.auth.getSession();
  if (!session) return;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Failed to delete account (${res.status})`);
}
```

Apply the same trailing-`client` pattern to `signUpWithPhone`, `requestOtp`, `checkVerification`, `clearPersonalDataRemote`. `clearBusinessDataRemote` stays business-bound (no param needed, but may take the default). Behavior is IDENTICAL to before (everything defaults to the business client, which is the renamed old singleton).

- [ ] **Step 6: Update `googleAuth.ts` / `appleAuth.ts` to take a client**

`src/services/googleAuth.ts` — `signInWithGoogle(client = supabaseBusiness)`:
```ts
import { supabaseBusiness } from './supabase';
export async function signInWithGoogle(client = supabaseBusiness) {
  // ...obtain idToken as before...
  const { data, error } = await client.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw error;
  return { userId: data.user.id };
}
```
`src/services/appleAuth.ts` — `signInWithApple(client = supabaseBusiness)` analogously (pass `client` into `signInWithIdToken`).

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS (no call sites changed args; defaults preserve every existing call).

- [ ] **Step 8: Commit**

```bash
git add src/services/supabase.ts src/services/accountLink.ts src/services/googleAuth.ts src/services/appleAuth.ts scripts/test-account-link.ts package.json
git commit -m "feat(auth): two Supabase clients + client-parameterized helpers"
```

---

### Task 2: `authStore` two-slot shape (with transitional flat mirror)

**Files:**
- Modify: `src/store/authStore.ts`
- Create: `src/store/authStoreMigrate.ts` (pure migration reducer — no imports)
- Create: `scripts/test-authstore-migrate.ts` (tsx test)
- Modify: `package.json` (add `test:authmigrate`)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `useAuthStore` state now exposes `business: { isAuthenticated; isVerified; phone; userId; provider }` and `personal: { isAuthenticated; phone; userId; provider }`.
  - Per-slot setters: `setBusinessAuth(partial)`, `setPersonalAuth(partial)`, `resetBusiness()`, `resetPersonal()`.
  - **Transitional flat mirror** (removed Task 9): top-level `isAuthenticated`, `isVerified`, `phone`, `userId`, `provider` + old setters (`setAuthenticated`, `setVerified`, `setPhone`, `setUserId`, `setProvider`, `reset`) all read/write the **business** slot.
  - `migrateAuthV1toV2(persisted): persisted` from `authStoreMigrate.ts`.

- [ ] **Step 1: Write the failing test** — `scripts/test-authstore-migrate.ts`

```ts
import { migrateAuthV1toV2 } from '../src/store/authStoreMigrate';

const failures: string[] = [];
let passed = 0;
const check = (n: string, c: boolean) => { c ? passed++ : failures.push(n); };

const v1 = { isAuthenticated: true, isVerified: true, phone: '60123', userId: 'u1', provider: 'phone' };
const out = migrateAuthV1toV2({ ...v1 });
check('business slot populated from flat v1', out.business.userId === 'u1' && out.business.isVerified === true);
check('business provider carried', out.business.provider === 'phone');
check('personal slot empty after migrate', out.personal.userId === null && out.personal.isAuthenticated === false);

if (failures.length) { console.error('FAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`authstore-migrate OK (${passed} checks)`);
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:authmigrate`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/store/authStoreMigrate.ts` + add npm script**

```ts
/** Pure zustand-persist migration from flat v1 auth state to two-slot v2. */
export function migrateAuthV1toV2(persisted: any) {
  const flat = persisted ?? {};
  return {
    business: {
      isAuthenticated: !!flat.isAuthenticated,
      isVerified: !!flat.isVerified,
      phone: flat.phone ?? null,
      userId: flat.userId ?? null,
      provider: flat.provider ?? null,
    },
    personal: {
      isAuthenticated: false,
      phone: null,
      userId: null,
      provider: null,
    },
  };
}
```
`package.json`: add `"test:authmigrate": "tsx scripts/test-authstore-migrate.ts",`

- [ ] **Step 4: Run to verify it passes**

Run: `npm run test:authmigrate`
Expected: PASS — `authstore-migrate OK (3 checks)`

- [ ] **Step 5: Rewrite `src/store/authStore.ts` with slots + transitional mirror**

```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { migrateAuthV1toV2 } from './authStoreMigrate';

export type AuthProvider = 'phone' | 'google' | 'apple' | null;
export interface ModeAuth { isAuthenticated: boolean; phone: string | null; userId: string | null; provider: AuthProvider; }
export interface BusinessAuth extends ModeAuth { isVerified: boolean; }

const EMPTY_PERSONAL: ModeAuth = { isAuthenticated: false, phone: null, userId: null, provider: null };
const EMPTY_BUSINESS: BusinessAuth = { ...EMPTY_PERSONAL, isVerified: false };

interface AuthState {
  business: BusinessAuth;
  personal: ModeAuth;
  setBusinessAuth: (p: Partial<BusinessAuth>) => void;
  setPersonalAuth: (p: Partial<ModeAuth>) => void;
  resetBusiness: () => void;
  resetPersonal: () => void;

  // ── Transitional flat mirror (business slot). Removed in Task 9. ──
  isAuthenticated: boolean; isVerified: boolean; phone: string | null; userId: string | null; provider: AuthProvider;
  setAuthenticated: (v: boolean) => void; setVerified: (v: boolean) => void;
  setPhone: (v: string | null) => void; setUserId: (v: string | null) => void;
  setProvider: (v: AuthProvider) => void; reset: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      business: { ...EMPTY_BUSINESS },
      personal: { ...EMPTY_PERSONAL },
      setBusinessAuth: (p) => set((s) => {
        const business = { ...s.business, ...p };
        return { business, isAuthenticated: business.isAuthenticated, isVerified: business.isVerified,
          phone: business.phone, userId: business.userId, provider: business.provider };
      }),
      setPersonalAuth: (p) => set((s) => ({ personal: { ...s.personal, ...p } })),
      resetBusiness: () => set({ business: { ...EMPTY_BUSINESS },
        isAuthenticated: false, isVerified: false, phone: null, userId: null, provider: null }),
      resetPersonal: () => set({ personal: { ...EMPTY_PERSONAL } }),

      // Transitional mirror → business slot
      isAuthenticated: false, isVerified: false, phone: null, userId: null, provider: null,
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
          const flat = version === 0 || !version
            ? { ...persisted, provider: persisted?.isAuthenticated ? 'phone' : null }
            : persisted;
          const slots = migrateAuthV1toV2(flat);
          return { ...slots, isAuthenticated: slots.business.isAuthenticated, isVerified: slots.business.isVerified,
            phone: slots.business.phone, userId: slots.business.userId, provider: slots.business.provider };
        }
        return persisted;
      },
    }
  )
);
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS — all existing call sites use the flat mirror, which still exists.

- [ ] **Step 7: Commit**

```bash
git add src/store/authStore.ts src/store/authStoreMigrate.ts scripts/test-authstore-migrate.ts package.json
git commit -m "feat(auth): split authStore into business/personal slots (flat mirror kept transitional)"
```

---

### Task 3: Bootstrap two clients + two listeners in `App.tsx`

**Files:**
- Modify: `App.tsx` (session init ~134-142, `onAuthStateChange` ~275-300, auto-refresh ~336 + ~353)

**Interfaces:**
- Consumes: `supabaseBusiness`, `supabasePersonal`, `getAuthSession`, slot setters from Task 2.
- Produces: on startup both slots reflect their client's session; two auth listeners; both clients auto-refresh with app state.

- [ ] **Step 1: Replace startup session init**

Old (single): reads one session → `setAuthenticated/setUserId`. New:
```ts
const [bizSession, perSession] = await Promise.all([
  getAuthSession(supabaseBusiness),
  getAuthSession(supabasePersonal),
]);
const auth = useAuthStore.getState();
if (bizSession) auth.setBusinessAuth({ isAuthenticated: true, userId: bizSession.user.id });
else if (auth.business.isAuthenticated) auth.resetBusiness();
if (perSession) auth.setPersonalAuth({ isAuthenticated: true, userId: perSession.user.id });
else if (auth.personal.isAuthenticated) auth.resetPersonal();
```

- [ ] **Step 2: Replace the single `onAuthStateChange` with two listeners**

```ts
const bizSub = supabaseBusiness.auth.onAuthStateChange((event, session) => {
  const auth = useAuthStore.getState();
  if (event === 'SIGNED_IN' && session) {
    auth.setBusinessAuth({ isAuthenticated: true, userId: session.user.id });
    const store = useSellerStore.getState();
    store.setSyncing(true);
    syncAll().finally(() => store.setSyncing(false)); // existing seller sync call, unchanged args
  } else if (event === 'SIGNED_OUT') {
    auth.resetBusiness();
    clearBusinessLocalData();
  }
});

const perSub = supabasePersonal.auth.onAuthStateChange((event, session) => {
  const auth = useAuthStore.getState();
  if (event === 'SIGNED_IN' && session) {
    auth.setPersonalAuth({ isAuthenticated: true, userId: session.user.id });
    if (useSettingsStore.getState().personalSyncEnabled) syncPersonal().catch(() => {});
  } else if (event === 'SIGNED_OUT') {
    auth.resetPersonal();
    useSettingsStore.getState().setPersonalSyncEnabled(false);
  }
});
// cleanup: bizSub.data.subscription.unsubscribe(); perSub.data.subscription.unsubscribe();
```
(Keep whatever `syncAll`/`clearBusinessLocalData`/`syncPersonal` imports already exist. Note the business SIGNED_OUT no longer clears personal sync, and vice-versa.)

- [ ] **Step 3: Auto-refresh both clients on foreground/background**

Replace `supabase.auth.startAutoRefresh()` with:
```ts
supabaseBusiness.auth.startAutoRefresh();
supabasePersonal.auth.startAutoRefresh();
```
and the background `stopAutoRefresh()` likewise for both.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Manual smoke (build already running) + Commit**

Verify app boots without crashing (Metro reload). Then:
```bash
git add App.tsx
git commit -m "feat(auth): bootstrap+auto-refresh both clients, split auth listeners per mode"
```

---

### Task 4: Route the BUSINESS surface to `supabaseBusiness` + business slot

**Files (all reads of the flat mirror → `s.business.*`; all bare `supabase`/`getAuthSession()` → business client):**
- Modify: `src/screens/auth/AuthScreen.tsx` — sign-in/up writes `setBusinessAuth(...)`; keep `ensureProfile()`.
- Modify: `src/services/sellerSync.ts` — local `getSession()` uses `supabaseBusiness`; keep all `seller_*` + storage.
- Modify: `src/screens/auth/OtpVerificationScreen.tsx` — `supabase.channel` → `supabaseBusiness.channel`; user id from `s.business.userId`.
- Modify: `src/services/tapToPay.ts`, `src/services/qrPaymentResolver.ts`, `src/services/pushNotifications.ts` — session from `supabaseBusiness`.
- Modify: `src/navigation/RootNavigator.tsx` (`AuthGatedBusiness`) — read `s.business.isAuthenticated/isVerified/provider`; `getAuthSession(supabaseBusiness)`; `signOut(supabaseBusiness)` + `resetBusiness()`.
- Modify: `src/screens/business/Manage.tsx`, `src/screens/business/Dashboard.tsx`, business section of `src/screens/shared/Settings.tsx`.

**Interfaces:**
- Consumes: `supabaseBusiness`, `setBusinessAuth`, `resetBusiness`, client-param helpers.
- Produces: business surface fully independent of the personal slot/client.

- [ ] **Step 1: AuthScreen** — replace the three sign-in paths' `auth.setAuthenticated(true)/setUserId(...)/setPhone(...)/setProvider(...)/setVerified(...)` with a single `auth.setBusinessAuth({ isAuthenticated: true, userId: ..., phone: ..., provider: 'phone'|'google'|'apple', isVerified?: true })`. Pass `supabaseBusiness` into `signInWithPhone/signUpWithPhone/signInWithGoogle/signInWithApple` and the inline `supabase.from('seller_profiles')` → `supabaseBusiness.from(...)`. Keep `ensureProfile()`.

Example (phone sign-in path):
```ts
const data = await signInWithPhone(cleaned, password, supabaseBusiness);
if (data.session) {
  useAuthStore.getState().setBusinessAuth({
    isAuthenticated: true, userId: data.session.user.id, phone: cleaned, provider: 'phone',
  });
  await ensureProfile();
  const { data: profile } = await supabaseBusiness
    .from('seller_profiles').select('is_verified').eq('user_id', data.session.user.id).maybeSingle();
  if (profile?.is_verified) useAuthStore.getState().setBusinessAuth({ isVerified: true });
  else { const otp = await requestOtp(cleaned, supabaseBusiness); onVerificationNeeded(otp.code, cleaned); }
}
```

- [ ] **Step 2: sellerSync.ts** — change its local `getSession()` to `supabaseBusiness.auth.getSession()` / `refreshSession()`, and every `supabase.from(...)` / `supabase.storage...` → `supabaseBusiness.*`. `ensureProfile()` uses `supabaseBusiness`.

- [ ] **Step 3: OtpVerificationScreen.ts** — `const userId = useAuthStore.getState().business.userId;`, `supabaseBusiness.channel('otp-status')...`, `supabaseBusiness.removeChannel(channel)`, `checkVerification(supabaseBusiness)`, `requestOtp(phone, supabaseBusiness)`, and `setBusinessAuth({ isVerified: true })`.

- [ ] **Step 4: tapToPay / qrPaymentResolver / pushNotifications** — replace `supabase.auth.getSession()` → `supabaseBusiness.auth.getSession()` and any `supabase.from(...)` → `supabaseBusiness.from(...)`.

- [ ] **Step 5: RootNavigator AuthGatedBusiness** — `const isAuthenticated = useAuthStore((s) => s.business.isAuthenticated);` (same for `isVerified`, `provider`, `phone`). `getAuthSession(supabaseBusiness)`; on OTP-back/sign-out `signOut(supabaseBusiness)` + `useAuthStore.getState().resetBusiness()`.

- [ ] **Step 6: Manage / Dashboard / Settings (business section)** — reads of `isAuthenticated/isVerified/phone` → `s.business.*`; `clearBusinessDataRemote()` unchanged; sign-out → `signOut(supabaseBusiness)` + `resetBusiness()`.

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/screens/auth/AuthScreen.tsx src/services/sellerSync.ts src/screens/auth/OtpVerificationScreen.tsx src/services/tapToPay.ts src/services/qrPaymentResolver.ts src/services/pushNotifications.ts src/navigation/RootNavigator.tsx src/screens/business/Manage.tsx src/screens/business/Dashboard.tsx src/screens/shared/Settings.tsx
git commit -m "refactor(auth): route business surface to supabaseBusiness + business slot"
```

---

### Task 5: Route the PERSONAL surface to `supabasePersonal` + personal slot (and decouple)

**Files:**
- Modify: `src/screens/shared/AccountScreen.tsx` — personal login writes `setPersonalAuth(...)`, uses `supabasePersonal`, **removes `ensureProfile()`**; email/display from `supabasePersonal`; sign-out → `signOut(supabasePersonal)` + `resetPersonal()`.
- Modify: `src/services/personalSync.ts` — `getSession()` uses `supabasePersonal`; all `personal_*` from `supabasePersonal`; `lastSyncedUserId` compared to `supabasePersonal` user.
- Modify: `src/services/quickLogKey.ts`, `src/services/quickLogInbox.ts`, `src/services/statementImport.ts` — session + `quick_log_*` / imports from `supabasePersonal`.

**Interfaces:**
- Consumes: `supabasePersonal`, `setPersonalAuth`, `resetPersonal`, `isSharedAccount` (Task 8 uses it; here just routing).
- Produces: personal surface independent; **personal sign-in no longer creates a `seller_profiles` row.**

- [ ] **Step 1: AccountScreen personal sign-in paths** — Google/Apple/phone: replace `auth.setAuthenticated/setUserId/...` with `auth.setPersonalAuth({ isAuthenticated: true, userId, phone?, provider })`, pass `supabasePersonal` into the sign-in calls, and **delete the `ensureProfile().catch(()=>{})` line** in each personal path. Example (phone):
```ts
const data = isLogin
  ? await signInWithPhone(cleaned, password, supabasePersonal)
  : await signUpWithPhone(cleaned, password, supabasePersonal);
if (data.session) {
  useAuthStore.getState().setPersonalAuth({
    isAuthenticated: true, userId: data.session.user.id, phone: cleaned, provider: 'phone',
  });
  await enableBackup();   // no ensureProfile()
}
```

- [ ] **Step 2: AccountScreen display + read state** — `isAuthenticated` → `s.personal.isAuthenticated`; `provider` → `s.personal.provider`; the email `useEffect` → `getAuthSession(supabasePersonal)`.

- [ ] **Step 3: AccountScreen sign-out + delete** — sign-out → `await disablePersonalSync(false); signOut(supabasePersonal).catch(()=>{}); useAuthStore.getState().resetPersonal();`. (Delete-account branching is Task 8 — leave a `// TODO(Task 8)` marker only if needed, but prefer implementing Task 8 immediately after.)

- [ ] **Step 4: personalSync.ts** — local `getSession()` → `supabasePersonal.auth.getSession()/refreshSession()`; every `supabase.from('personal_*')` → `supabasePersonal.from(...)`; `disablePersonalSync` wipe loop uses `supabasePersonal`.

- [ ] **Step 5: quickLogKey / quickLogInbox / statementImport** — `supabase.auth.getSession()` → `supabasePersonal.auth.getSession()`; `supabase.from('quick_log_*')` → `supabasePersonal.from(...)`.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/screens/shared/AccountScreen.tsx src/services/personalSync.ts src/services/quickLogKey.ts src/services/quickLogInbox.ts src/services/statementImport.ts
git commit -m "refactor(auth): route personal surface to supabasePersonal; personal sign-in no longer creates seller profile"
```

---

### Task 6: Route mode-agnostic services via `clientForMode(currentMode)`

**Files:**
- Modify: `src/services/aiProxy.ts`, `src/services/referrals.ts`

**Interfaces:**
- Consumes: `clientForMode`, `useAppStore.getState().mode`.
- Produces: AI + referral calls act as the currently-active mode's account.

- [ ] **Step 1: aiProxy.ts** — replace `supabase.auth.getSession()` with:
```ts
import { clientForMode } from './supabase';
import { useAppStore } from '../store/appStore';
const client = clientForMode(useAppStore.getState().mode);
const session = await client.auth.getSession().then((r) => r.data.session).catch(() => null);
```

- [ ] **Step 2: referrals.ts** — same pattern: `const client = clientForMode(useAppStore.getState().mode);` then `client.auth.getSession()` and `client.from('user_profiles')...`.

- [ ] **Step 3: Typecheck + Commit**

Run: `npm run typecheck` → PASS
```bash
git add src/services/aiProxy.ts src/services/referrals.ts
git commit -m "refactor(auth): route mode-agnostic services via clientForMode"
```

---

### Task 7: "Reuse this account" shortcut

**Files:**
- Create: `src/services/reuseAccount.ts`
- Modify: `src/screens/auth/AuthScreen.tsx` (offer after business login), `src/screens/shared/AccountScreen.tsx` (offer after personal login)

**Interfaces:**
- Consumes: `supabaseBusiness`, `supabasePersonal`, `signInWithPhone`, `signInWithGoogle`, `signInWithApple`, slot setters.
- Produces:
  `reuseAccountForMode(target: Mode, creds: { provider: 'phone'|'google'|'apple'; phone?: string; password?: string }): Promise<void>` — signs the `target` mode's client in as the same user and populates its slot.

- [ ] **Step 1: Create `src/services/reuseAccount.ts`**

```ts
import { clientForMode, signInWithPhone, type Mode } from './supabase';
import { signInWithGoogle } from './googleAuth';
import { signInWithApple } from './appleAuth';
import { useAuthStore } from '../store/authStore';

/**
 * Sign the OTHER mode's client into the SAME account, so business+personal share
 * one Supabase user. Each client keeps an independent refresh-token chain (we do a
 * real sign-in, never copy tokens across clients).
 */
export async function reuseAccountForMode(
  target: Mode,
  creds: { provider: 'phone' | 'google' | 'apple'; phone?: string; password?: string },
): Promise<void> {
  const client = clientForMode(target);
  let userId: string; let phone: string | null = null;
  if (creds.provider === 'phone') {
    if (!creds.phone || !creds.password) throw new Error('phone reuse needs phone+password');
    const data = await signInWithPhone(creds.phone, creds.password, client);
    userId = data.session!.user.id; phone = creds.phone;
  } else if (creds.provider === 'google') {
    userId = (await signInWithGoogle(client)).userId;
  } else {
    userId = (await signInWithApple(client)).userId;
  }
  const auth = useAuthStore.getState();
  const patch = { isAuthenticated: true, userId, phone, provider: creds.provider };
  if (target === 'business') auth.setBusinessAuth(patch);
  else auth.setPersonalAuth(patch);
}
```

- [ ] **Step 2: Offer it after business login (AuthScreen)** — after a successful phone/OAuth sign-in and verification, if `useAuthStore.getState().personal.isAuthenticated` is false, `Alert.alert` "Use this account for personal too?" → on confirm call `reuseAccountForMode('personal', { provider, phone: cleaned, password })` (password still in scope for phone). Wrap in try/catch → toast on failure.

- [ ] **Step 3: Offer it after personal login (AccountScreen)** — symmetric: if `business.isAuthenticated` is false, offer `reuseAccountForMode('business', {...})`.

- [ ] **Step 4: Typecheck + Commit**

Run: `npm run typecheck` → PASS
```bash
git add src/services/reuseAccount.ts src/screens/auth/AuthScreen.tsx src/screens/shared/AccountScreen.tsx
git commit -m "feat(auth): add 'reuse this account' shortcut across modes"
```

---

### Task 8: Per-mode delete with shared-account guard

**Files:**
- Create: `src/services/deleteAccountFlow.ts`
- Create: `scripts/test-delete-flow.ts` (tsx — tests the pure branch decision)
- Modify: `package.json` (`test:deleteflow`)
- Modify: `src/screens/shared/AccountScreen.tsx` (personal delete), business delete in `src/screens/shared/Settings.tsx` if a business "delete account" exists (else business "clear data" stays as-is).

**Interfaces:**
- Consumes: `isSharedAccount`, `clearPersonalDataRemote`, `deleteAccountRemote`, `supabasePersonal`.
- Produces:
  `planDelete(mode: Mode, businessUserId: string|null, personalUserId: string|null): 'full' | 'data-only'` (pure).

- [ ] **Step 1: Write failing test** — `scripts/test-delete-flow.ts`

```ts
import { planDelete } from '../src/services/deleteAccountFlow';
const failures: string[] = []; let passed = 0;
const check = (n: string, c: boolean) => { c ? passed++ : failures.push(n); };

check('distinct → full', planDelete('personal', 'b1', 'p1') === 'full');
check('personal-only signed in → full', planDelete('personal', null, 'p1') === 'full');
check('shared → data-only', planDelete('personal', 'u1', 'u1') === 'data-only');
check('business shared → data-only', planDelete('business', 'u1', 'u1') === 'data-only');

if (failures.length) { console.error('FAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`delete-flow OK (${passed} checks)`);
```

- [ ] **Step 2: Run → FAIL** (`npm run test:deleteflow`, module not found). Add script to package.json.

- [ ] **Step 3: Create `src/services/deleteAccountFlow.ts`**

```ts
import { isSharedAccount } from './accountLink';
import type { Mode } from './supabase';

/** 'data-only' when the two modes share one auth user (deleting it would orphan the other mode). */
export function planDelete(
  _mode: Mode, businessUserId: string | null, personalUserId: string | null,
): 'full' | 'data-only' {
  return isSharedAccount(businessUserId, personalUserId) ? 'data-only' : 'full';
}
```

- [ ] **Step 4: Run → PASS** (`npm run test:deleteflow` → `delete-flow OK (4 checks)`).

- [ ] **Step 5: Wire personal delete in AccountScreen** — replace the current `deleteAccountRemote()` block:
```ts
import { supabasePersonal, deleteAccountRemote, clearPersonalDataRemote } from '../../services/supabase';
import { planDelete } from '../../services/deleteAccountFlow';
// ...
const { business, personal } = useAuthStore.getState();
const plan = planDelete('personal', business.userId, personal.userId);
if (plan === 'data-only') {
  Alert.alert(tr.auth.acctDeleteSharedTitle, tr.auth.acctDeleteSharedMsg); // "shared with business — removing personal data only"
  await clearPersonalDataRemote(supabasePersonal);
} else {
  await deleteAccountRemote(supabasePersonal);
}
await useSettingsStore.getState().clearPersonalData();
await disablePersonalSync(false);
clearProfileCache();
await signOut(supabasePersonal).catch(() => {});
useAuthStore.getState().resetPersonal();
```
Add the two i18n strings `acctDeleteSharedTitle` / `acctDeleteSharedMsg` to the locale files the repo uses (mirror existing `acctDelete*` keys).

- [ ] **Step 6: Typecheck + Commit**

Run: `npm run typecheck` → PASS
```bash
git add src/services/deleteAccountFlow.ts scripts/test-delete-flow.ts package.json src/screens/shared/AccountScreen.tsx
git commit -m "feat(auth): per-mode account deletion with shared-account guard"
```

---

### Task 9: Remove transitional shims + final verification

**Files:**
- Modify: `src/services/supabase.ts` (remove `export const supabase = supabaseBusiness`)
- Modify: `src/store/authStore.ts` (remove flat mirror fields + old setters)

**Interfaces:**
- Consumes: nothing new.
- Produces: no flat mirror, no `supabase` alias — any leftover stale call site becomes a typecheck error (completeness check).

- [ ] **Step 1: Remove the `supabase` alias** from `supabase.ts`.

- [ ] **Step 2: Remove the flat mirror** (`isAuthenticated/isVerified/phone/userId/provider` top-level fields + `setAuthenticated/setVerified/setPhone/setUserId/setProvider/reset`) from `authStore.ts`, and simplify `setBusinessAuth`/`resetBusiness` to stop writing mirror fields. Update the persist `migrate` return to only return `{ business, personal }`.

- [ ] **Step 3: Typecheck — this is the completeness gate**

Run: `npm run typecheck`
Expected: FAIL initially IF any call site was missed → fix each by routing to the correct client/slot. Repeat until PASS. A clean PASS means every call site is routed.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: PASS (fix any unused-import fallout from removed helpers).

- [ ] **Step 5: Run all pure tests**

Run: `npm run test:accountlink && npm run test:authmigrate && npm run test:deleteflow && npm run test:sync`
Expected: all PASS.

- [ ] **Step 6: Manual test matrix** (device/simulator, the running build)

1. Fresh install → business login only → open personal Account: shows **signed-out**. ✅
2. Fresh install → personal Cloud-backup login only → switch to business: **AuthScreen gate** appears (not auto-authed). ✅
3. Business login → accept "reuse for personal" → personal Account shows signed-in as same account; both `userId`s equal. ✅
4. Two different accounts (business A, personal B) → sign out personal → business still signed in (and vice-versa). ✅
5. Shared account → personal "Delete account" → warns it's shared, wipes only personal data, business still works. ✅
6. Distinct accounts → personal "Delete account" → full delete of personal user; business untouched. ✅

- [ ] **Step 7: Commit**

```bash
git add src/services/supabase.ts src/store/authStore.ts
git commit -m "refactor(auth): remove transitional shims; two-account split complete"
```

---

## Self-Review

**Spec coverage:**
- Two clients / factory → Task 1. ✅
- authStore two slots + migration → Task 2. ✅
- Bootstrap + two listeners + auto-refresh both → Task 3. ✅
- Login decoupling (personal drops `ensureProfile`) → Task 5 Step 1. ✅
- `isVerified` business-only → Task 2 (slot shape). ✅
- Reuse shortcut (independent sign-in, not token copy) → Task 7. ✅
- Per-mode sign-out → Tasks 4/5. ✅
- Delete with shared-account guard → Task 8. ✅
- Clear-data split → already split; business in Task 4, personal in Task 5. ✅
- Call-site routing (business/personal/mode-agnostic) → Tasks 4/5/6. ✅
- Verification (typecheck + pure tests + manual matrix) → Task 9. ✅

**Placeholder scan:** No "TBD/handle edge cases" — each step shows the transformation. The one `// TODO(Task 8)` marker in Task 5 Step 3 is explicitly resolved by Task 8 in the same session.

**Type consistency:** `setBusinessAuth`/`setPersonalAuth`/`resetBusiness`/`resetPersonal` used consistently Tasks 2–9. `clientForMode`, `Mode`, `isSharedAccount`, `planDelete`, `reuseAccountForMode` signatures match across tasks. Helper trailing-`client` param order (`fn(args, client)`) consistent.
