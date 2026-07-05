# Separate Business & Personal Accounts — Design

**Date:** 2026-07-06
**Status:** Approved (design) — pending implementation plan
**Author:** brainstormed with Claude

## Problem

Today the app runs on a **single** Supabase client with **one** session storage slot
([src/services/supabase.ts](../../../src/services/supabase.ts) line ~92) and a **single, flat**
`authStore` ([src/store/authStore.ts](../../../src/store/authStore.ts)). The business/personal
"mode" in [src/store/appStore.ts](../../../src/store/appStore.ts) is only a UI toggle — it swaps
which screens render, but **not who you are signed in as**.

Consequence: whichever mode you sign in from becomes the app's *only* identity. Sign into business
with a phone number, and the personal Account screen shows that same phone as "signed in," and
personal cloud backup would sync to that same account. Business and personal are **forced to be the
same account**, with no way to keep them separate.

The single worst offender: personal sign-in in `AccountScreen` calls `ensureProfile()`
([src/services/sellerSync.ts](../../../src/services/sellerSync.ts)), which creates a business
`seller_profiles` row — a personal action reaching into business data.

## Goal

Business and personal are **two independent accounts by default**, held side by side:

- Signing into business never sets or touches the personal identity, and vice-versa.
- Both stay signed in at once; switching modes never forces a re-login.
- They are the **same account (shared data) only** when the user deliberately uses the same login
  for both — surfaced via an opt-in **"reuse this account"** shortcut.

### Decisions locked during brainstorming

| Decision | Choice |
| --- | --- |
| Account model | Two independent logins, both active simultaneously |
| Existing users | Pre-launch / testers only → **no careful migration**; testers re-login once on upgrade |
| "Same account" | Separate by default; opt-in **"reuse this account"** shortcut (no explicit link/unlink store) |
| Architecture | **Two Supabase clients** against the **same project** (Approach A) |

## Architecture

One Supabase **project**, two Supabase **clients**, each with its own encrypted session slot:

```
supabaseBusiness  → storageKey "sb-business-auth"  → seller_* tables, storage buckets, OTP verification
supabasePersonal  → storageKey "sb-personal-auth"  → personal_* tables, cloud backup
```

Both sessions live in SecureStore under different keys, both auto-refresh independently, both stay
signed in. Two different Supabase auth users, OR — if the user reuses one login for both — the same
auth user (harmless: `seller_*` and `personal_*` are disjoint table sets that coexist under one
`user_id`).

Same `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` for both clients — no second
project, no schema change.

## Components

### 1. Client layer — `src/services/supabase.ts`

Refactor the single client into a factory plus two instances:

```ts
function makeClient(namespace: 'business' | 'personal') {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storageKey: `sb-${namespace}-auth`,   // distinct slot per client
      storage: SecureStoreAdapter,          // already namespaces by the passed key
    },
  });
}
export const supabaseBusiness = makeClient('business');
export const supabasePersonal = makeClient('personal');
export const clientForMode = (m: Mode) => (m === 'business' ? supabaseBusiness : supabasePersonal);
```

`SecureStoreAdapter` already keys everything by the `key` argument, so distinct `storageKey`s yield
two fully isolated encrypted sessions with **no adapter changes**.

Helpers stop being hardcoded to one client:

- Shared, now client-parameterized: `getSession(client)`, `signInWithPhone(client, …)`,
  `signUpWithPhone(client, …)`, `signOut(client)`.
- Business-only, bound to `supabaseBusiness`: `requestOtp`, `checkVerification`,
  `clearBusinessDataRemote`.
- Personal-only, bound to `supabasePersonal`: `clearPersonalDataRemote`.
- `deleteAccountRemote(client)` — deletes the auth user for that client's session. The **caller**
  decides whether to invoke it (distinct accounts) or fall back to a data-only wipe (shared account);
  see Delete semantics. No `keepAuthUser` flag needed.
- `googleAuth.ts` / `appleAuth.ts` `signInWithIdToken(...)` take a `client` argument so an OAuth
  sign-in lands in the correct slot.

`sellerSync.ts` and `personalSync.ts` already each have a local `getSession()`; each imports its own
client.

### 2. Auth state — `src/store/authStore.ts`

Split the flat identity into two slots:

```ts
type ModeAuth = {
  isAuthenticated: boolean;
  phone: string | null;
  userId: string | null;
  provider: 'phone' | 'google' | 'apple' | null;
};
interface AuthState {
  business: ModeAuth & { isVerified: boolean };  // isVerified = seller OTP, business-only
  personal: ModeAuth;                            // personal never needs OTP
  // per-slot setters + resetBusiness() / resetPersonal()
}
```

`isVerified` (OTP/Telegram seller verification) moves to the business slot only — personal cloud
backup only ever needed a valid session, never verification. A zustand `persist` migration bumps the
store version and maps the old flat shape into the `business` slot (personal slot starts empty).

### 3. Bootstrap & listeners — `App.tsx`

Two independent tracks:

- **Startup:** read both clients' sessions, populate both slots.
- **Two `onAuthStateChange` listeners.** Business listener → `sellerSync` on SIGNED_IN, clear business
  local data + `resetBusiness()` on SIGNED_OUT. Personal listener → `syncPersonal` (if backup enabled)
  on SIGNED_IN, disable personal sync + `resetPersonal()` on SIGNED_OUT. Neither touches the other slot.
- **`startAutoRefresh` / `stopAutoRefresh`** on foreground/background call **both** clients.

### 4. Login flows

- **Business** ([AuthScreen.tsx](../../../src/screens/auth/AuthScreen.tsx)): unchanged UX; writes only
  `business.*`, uses `supabaseBusiness`, keeps `ensureProfile()`.
- **Personal** ([AccountScreen.tsx](../../../src/screens/shared/AccountScreen.tsx) "Cloud backup"):
  writes only `personal.*`, uses `supabasePersonal`, and **removes the `ensureProfile()` call** — a
  personal sign-in must not create a `seller_profiles` row.
- Providers unchanged per surface (business: phone + Google/Apple; personal: Google/Apple/phone), each
  routed to its client.
- `lastSyncedUserId` account-mismatch guard stays, compared against the **personal** client's user.

### 5. "Reuse this account" shortcut

After signing into one mode, offer *"Use this same account for [other mode] too?"*

- **Mechanism:** an **independent sign-in on the other client** for the same user (each client keeps
  its own refresh-token chain — robust). Google/Apple → silent native re-auth; phone → password held in
  memory at sign-in time. Offered later from a mode's account screen → prompt for the password once.
- **Rejected:** copying session tokens across clients (`setSession`) — Supabase refresh-token rotation
  would invalidate one client when the other refreshes.

### 6. Sign-out / delete / clear semantics

- **Sign-out (per mode):** personal → `signOut(supabasePersonal)` + `resetPersonal()` + disable personal
  sync; business untouched. Business → `signOut(supabaseBusiness)` + `resetBusiness()`. Independent
  refresh tokens mean signing out one never kills the other, even for the same underlying user.
  `signOutGoogle()` (native SDK cache) is safe to call from either — it doesn't touch Supabase sessions.
- **Delete account (the sharp edge):** if `personal.userId !== business.userId`, deleting that mode's
  auth user is safe (full `deleteAccountRemote`). If they are the **same** user (reused account), we must
  **not** delete the auth user — only wipe that mode's data (`clearPersonalDataRemote` /
  `clearBusinessDataRemote`), sign that mode out, and warn the user the account is shared. Delete flow
  branches on `personal.userId === business.userId`.
- **Clear-data (Settings):** already split — `clearBusinessDataRemote` → business client,
  `clearPersonalDataRemote` → personal client.

## Call-site routing (the mechanical bulk)

From the full surface map, each site routes to its home:

- **Business → `supabaseBusiness` + `business` slot:** `sellerSync.ts`, `OtpVerificationScreen.tsx`,
  `tapToPay.ts`, `qrPaymentResolver.ts`, `pushNotifications.ts`, business section of `Settings.tsx`,
  `Manage.tsx`, `Dashboard.tsx`, `AuthScreen.tsx`, business helpers in `supabase.ts`.
- **Personal → `supabasePersonal` + `personal` slot:** `personalSync.ts`, `quickLogKey.ts`,
  `quickLogInbox.ts`, `statementImport.ts`, personal parts of `AccountScreen.tsx`, personal helpers in
  `supabase.ts`.
- **Mode-agnostic → `clientForMode(currentMode)`:** `aiProxy.ts`, `referrals.ts`.

## Data flow

- Business sign-in → `supabaseBusiness` session → `business.userId` → all `seller_*` reads/writes +
  storage buckets keyed to that user.
- Personal sign-in → `supabasePersonal` session → `personal.userId` → all `personal_*` reads/writes
  keyed to that user.
- Reuse account → the other client signs in as the same user → both slots share a `userId`; `seller_*`
  and `personal_*` coexist.

## Error handling / edge cases

- **Upgrade:** default `storageKey` is abandoned, so testers are logged out of both modes on first
  launch and re-login per mode. Acceptable (pre-launch).
- **Same-account delete:** never orphan the surviving mode — branch to data-only wipe (above).
- **One client's refresh fails:** only that mode signs out; the other is unaffected.
- **`aiProxy` with neither mode signed in:** unchanged — returns null session, feature degrades as today.

## Testing / verification

No jest; Supabase native modules aren't tsx-loadable (see memory `tsx-native-module-testing`). So:

- **Automated gate:** `tsc` typecheck must pass (the slot split will surface every stale call site as a
  type error — used as a completeness check).
- **Manual test matrix:**
  1. Business-only login → personal Account shows signed-out.
  2. Personal-only login → business mode still gated by AuthScreen.
  3. Reuse account → both slots signed in as same user; data coexists.
  4. Sign out one mode → the other stays signed in.
  5. Delete on a shared account → warns + preserves the other mode; delete on distinct accounts → full delete.

## Out of scope

- Explicit link/unlink account management UI (chose the lighter "reuse" shortcut).
- Careful production migration (pre-launch).
- Any Supabase schema / RLS changes (same tables, same project).
