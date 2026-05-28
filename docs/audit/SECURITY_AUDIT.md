# Potraces Security Audit

**Date**: 2026-05-28
**Scope**: Auth, RLS, data isolation, API keys, public pages, input handling
**Auditor**: Claude Opus 4.6 (automated)

---

## Severity Scale

| Level | Meaning |
|-------|---------|
| **CRITICAL** | Exploitable now; data leak or unauthorized access |
| **HIGH** | Significant risk requiring prompt fix |
| **MEDIUM** | Defense-in-depth gap or hardening opportunity |
| **LOW** | Minor hygiene issue |
| **INFO** | Observation, no action required |

---

## 1. Authentication & Authorization

### SEC-1.1 Auth Gating (INFO -- PASS)

The `AuthGatedBusiness` component in `RootNavigator.tsx` correctly gates business mode behind three checks:
1. `isAuthenticated` -- shows `AuthScreen` if false
2. `isVerified` -- shows `OtpVerificationScreen` if false
3. `businessSetupComplete` -- shows `BusinessSetup` if false

The component validates session on state change (line 129-137): if `isAuthenticated` but `!isVerified`, it checks for a real Supabase session and resets stale auth state if none exists. This prevents a user from getting stuck in a half-authenticated state.

**No deep linking is configured** (no linking config in `app.json` or navigation container). There is no way to deep-link past the auth gate.

### SEC-1.2 Session Management (INFO -- PASS)

- `autoRefreshToken: true` in Supabase client config
- Both `sellerSync.ts` and `personalSync.ts` implement proactive token refresh (within 60s of expiry)
- Session persisted via AsyncStorage (required for Supabase RN)
- `signOut()` calls `supabase.auth.signOut()` which clears the Supabase session from AsyncStorage

### SEC-1.3 Sign-Out Data Clearing (INFO -- PASS)

Sign-out flow in `Settings.tsx`:
1. Best-effort sync flush (offline failures accepted)
2. `clearBusinessLocalData()` -- resets all business Zustand stores AND their AsyncStorage keys
3. `useAuthStore.getState().reset()` -- clears auth state
4. `clearProfileCache()` -- clears cached profile ID
5. `signOut()` -- clears Supabase session

The `App.tsx` `onAuthStateChange` handler also calls `clearBusinessLocalData()` on `SIGNED_OUT` events, catching forced/expired sign-outs that bypass the Settings flow.

### SEC-1.4 Stale claim_seller_profile Function (HIGH)

**File**: `supabase/migrations/20260309130000_claim_profile.sql`

The **original** `claim_seller_profile` function (migration `20260309130000`) allows ANY authenticated user to claim ANY seller profile by slug with no verification. It simply transfers ownership to the caller.

The **hardened** version (migration `20260417000000`) requires OTP verification of the target profile's phone number within the last 10 minutes.

**Risk**: If migrations are applied in order, the hardened version in `20260417000000` replaces the original via `CREATE OR REPLACE FUNCTION`. This is correct. However, if only the earlier migration were applied (e.g., partial deployment), the unprotected version would be live.

**Recommendation**: Verify in production that the hardened version is active. Consider dropping and recreating rather than relying on `CREATE OR REPLACE` across migration files.

---

## 2. Row-Level Security (RLS)

### SEC-2.1 Personal Mode Tables (INFO -- PASS)

All 11 personal tables have RLS enabled with `auth.uid() = user_id` policies for both `USING` and `WITH CHECK` clauses. The `20260520000000` migration upgraded all policies to use `(select auth.uid())` for performance.

Tables covered: `personal_transactions`, `personal_wallets`, `personal_wallet_transfers`, `personal_subscriptions`, `personal_budgets`, `personal_goals`, `personal_debts`, `personal_splits`, `personal_contacts`, `personal_savings_accounts`, `personal_receipts`.

### SEC-2.2 Seller Mode Tables (INFO -- PASS)

All seller tables have RLS enabled with owner policies. The `20260520000000` migration upgraded to `(select auth.uid())`.

Tables covered: `seller_profiles`, `seller_products`, `seller_seasons`, `seller_orders`, `seller_customers`, `seller_ingredient_costs`, `seller_recurring_costs`, `seller_cost_templates`, `seller_cost_categories`, `seller_deleted_cost_categories`, `seller_stock_adjustments`.

### SEC-2.3 Order Link Orders -- Anon Can Read Order Count and Items (MEDIUM)

**File**: `docs/index.html` lines 696-729

The public order page queries:
```
/rest/v1/seller_orders?select=id&seller_id=eq.{id}&source=eq.order_link  (HEAD, count=exact)
/rest/v1/seller_orders?select=items&seller_id=eq.{id}&source=eq.order_link&limit=50
```

The `seller_orders_link_read` policy (`20260307172000`) allows SELECT for `source = 'order_link'` orders where `seller_id` matches a profile owned by `auth.uid()`. This requires authentication.

However, the order page uses the **anon key** with no auth session. The `seller_orders` table has no anon-specific SELECT policy, and no `GRANT SELECT ... TO anon` on `seller_orders` was found.

**Analysis**: The `loadOrderCount` and `loadPopularProducts` functions in `docs/index.html` will likely fail silently (returning 0 orders / no popular items) because the anon role cannot read `seller_orders`. This is actually **correct from a security perspective** -- no order data leaks -- but the social proof features (order count, popular badges) on the public page will never work.

**If a blanket anon SELECT was granted via the Supabase dashboard** (not visible in migrations), then ALL order data for ALL sellers would be readable by anyone, including customer names, phone numbers, and addresses. This must be verified in production.

**Recommendation**: Confirm via `SELECT * FROM pg_policies WHERE tablename = 'seller_orders'` in production. If anon can read, restrict to only `source = 'order_link'` rows and only non-PII columns (id, items, total_amount -- NOT customer_name, customer_phone, customer_address).

### SEC-2.4 seller_products Public Read -- Cost Data Restricted (INFO -- PASS)

Originally, the `seller_products_public_read` policy (migration `20260307062816`) allowed anon to SELECT all columns where `is_active = true`, exposing `cost_per_unit`, `stock_quantity`, and `total_sold`.

This was fixed in migration `20260525000000`: anon SELECT was revoked at table level and re-granted on only the columns needed by the order page: `id, user_id, name, description, price_per_unit, unit, is_active, image_url`.

### SEC-2.5 seller_profiles Public Read -- Restricted to View (INFO -- PASS)

The original `seller_profiles_public_read` policy was replaced with a restricted view (`seller_profiles_public`) in migration `20260417000000`. The view excludes `push_token`, `is_verified`, `created_at`, `updated_at`. Direct anon SELECT on the table was revoked.

The view does include `user_id` (needed for joining products) and `phone` (for WhatsApp CTA). Phone exposure is intentional and acknowledged.

### SEC-2.6 user_profiles Public Lookup Leaks user_id (LOW)

**File**: `supabase/migrations/20260417300000_referrals.sql` line 35

```sql
create policy "user_profiles_public_code_lookup" on public.user_profiles
  for select using (referral_code is not null);
```

This allows anyone (anon or authenticated) to read ALL columns of ALL user profiles that have a referral code. This includes `user_id`, `referred_by`, and `created_at`. While the intended use is resolving referral codes, the policy grants access to the full row.

**Recommendation**: Create a restricted view for public code lookups that only exposes `referral_code`, or narrow the policy with RLS to only return `referral_code` column.

### SEC-2.7 otp_chat_attempts -- No Anon/Auth Policies (INFO -- PASS)

RLS is enabled on `otp_chat_attempts` with no policies for anon or authenticated roles. Only service_role can access. Correct -- OTP attempts are managed exclusively by edge functions.

### SEC-2.8 ai_usage -- Read-Only, No Client Insert (INFO -- PASS)

RLS enabled. Owner read-only policy. Inserts only via edge functions (service role). No client tampering possible.

---

## 3. API Key Exposure

### SEC-3.1 Supabase Anon Key in Source Code (MEDIUM)

**Files**:
- `.env` line 3: Contains the full anon key
- `docs/index.html` line 459: Anon key hardcoded in the public HTML page

The `.env` file is in `.gitignore` (line 50), but the anon key is **also hardcoded in `docs/index.html`** which IS committed to git and deployed to Vercel. This is inherent to Supabase's client-side architecture -- the anon key is semi-public by design and RLS is the security boundary.

**No service_role key exposure found.** All edge functions correctly read `SUPABASE_SERVICE_ROLE_KEY` from `Deno.env.get()` (server-side only).

### SEC-3.2 Gemini API Key in .env (MEDIUM)

**File**: `.env` line 1: `EXPO_PUBLIC_GEMINI_API_KEY=AIzaSyAT_lwhyiM5mSfN8npnt1Gi7FzKecttAOw`

The `EXPO_PUBLIC_` prefix means this key is bundled into the JavaScript bundle shipped to users' devices. Anyone who extracts the app bundle can read this key and make API calls on your Google Cloud account.

**Files using it**: `geminiClient.ts`, `aiService.ts` (lines 365, 408), `moneyChat.ts` (line 785).

**Recommendation**: Move AI API calls to an edge function (server-side) so the key never reaches the client. Use the Supabase session to authenticate client requests to the edge function. This also enables server-side rate limiting.

### SEC-3.3 Anthropic API Key in Bundle (MEDIUM)

**File**: `src/services/aiService.ts` line 51: `const API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY || '';`

Same issue as SEC-3.2. The `EXPO_PUBLIC_` prefix bundles the Anthropic API key into the client.

**Recommendation**: Same as SEC-3.2 -- proxy through an edge function.

### SEC-3.4 Google Vision and Speech API Keys in Bundle (MEDIUM)

**Files**:
- `src/services/ocrService.ts` line 3: `EXPO_PUBLIC_GOOGLE_VISION_API_KEY`
- `src/services/speechService.ts` line 3: `EXPO_PUBLIC_GOOGLE_SPEECH_API_KEY`

Same `EXPO_PUBLIC_` exposure pattern.

**Recommendation**: Same -- proxy through edge functions or restrict keys in Google Cloud Console to specific API + app signing certificate.

---

## 4. Data Isolation Between Users

### SEC-4.1 Shared Device -- Business Data (INFO -- PASS)

When user A signs out:
1. `clearBusinessLocalData()` resets ALL business Zustand stores (seller, business, stall, freelancer, part-time, on-the-road, mixed, CRM) to empty state
2. AsyncStorage keys for all business stores are removed
3. Auth store is reset
4. Profile cache is cleared
5. `App.tsx` `onAuthStateChange` SIGNED_OUT handler also calls `clearBusinessLocalData()` as a safety net

User B signing in will get clean stores + a fresh pull from Supabase.

### SEC-4.2 Shared Device -- Personal Data NOT Cleared on Business Sign-Out (LOW)

**File**: `App.tsx` line 230-232

```typescript
// Personal data is left intact -- its sync is opt-in, so it may be the only copy.
clearBusinessLocalData().catch(() => {});
```

When a business-mode sign-out occurs, personal data (transactions, wallets, debts, goals, budgets, etc.) is NOT cleared. This is by design -- personal mode doesn't require authentication, so there's no "sign out" concept for it. However, on a shared device, the next user could see the previous user's personal financial data.

The `clearAllData()` function in settingsStore does clear ALL data (personal + business), but it's only triggered by the "Delete Account" flow, not regular sign-out.

**Recommendation**: Consider adding a device-level lock (biometric/PIN) for personal mode, or prompting to clear personal data when a different business user signs in. Note: `biometricLockEnabled` exists in settingsStore but its enforcement scope needs verification.

### SEC-4.3 Mode Isolation -- Personal vs Seller (INFO -- PASS)

Personal data lives in separate stores (`personalStore`, `walletStore`, `debtStore`, `savingsStore`, `receiptStore`) from seller data (`sellerStore`). They use entirely different Supabase tables (`personal_*` vs `seller_*`). Sync services are separate (`personalSync.ts` vs `sellerSync.ts`). There is no path for cross-contamination at the data layer.

The only intentional cross-mode link is the "transfer to personal" feature for seller orders, which creates a personal income transaction with an explicit `transferId` link.

---

## 5. Input Sanitization

### SEC-5.1 Supabase Client Library Parameterization (INFO -- PASS)

All Supabase queries use the official `@supabase/supabase-js` client with parameterized methods (`.eq()`, `.in()`, `.is()`). The library uses PostgREST under the hood, which parameterizes all values. No raw SQL is constructed from user input on the client side.

### SEC-5.2 No dangerouslySetInnerHTML or WebViews (INFO -- PASS)

Grep found zero uses of `dangerouslySetInnerHTML` or `WebView` in the `src/` directory. All user-facing content is rendered through React Native's `Text` components, which do not interpret HTML.

### SEC-5.3 Public Order Page HTML Escaping (INFO -- PASS)

**File**: `docs/index.html`

The order page uses two escaping functions:
- `escH()` (line 468): Creates a text node via `document.createElement('div').textContent = s` and reads `.innerHTML`. This is a correct HTML escaping pattern.
- `escA()` (line 469): Replaces `& " ' < >` with HTML entities. Used for attribute values.

All user-provided data (shop name, product names, customer input) is passed through these functions before DOM insertion. No `innerHTML` is set with unescaped user data.

### SEC-5.4 Order Page Slug Validation (INFO -- PASS)

**File**: `docs/index.html` line 910

```javascript
if(slug&&/^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$/.test(slug)){loadShop(slug)}
```

Slug is validated against a strict regex before use. The slug is also `encodeURIComponent()`-ed when used in API queries (line 640).

Server-side slug sanitization in `sellerSync.ts` (line 59): `slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')`.

---

## 6. Phone Number & Contact Data

### SEC-6.1 Customer Phone Numbers in Orders (MEDIUM)

Customer phone numbers are stored in `seller_orders.customer_phone`. These are visible to:
- The seller (via owner RLS policy) -- correct
- The seller's order page (via the `seller_orders_link_read` policy) -- but only authenticated sellers, not anon
- Anyone with direct Supabase API access if anon SELECT on seller_orders was granted outside migrations (see SEC-2.3)

Order link customers voluntarily provide their phone numbers. The order page marks it as optional.

### SEC-6.2 Seller Phone on Public Profile View (INFO -- ACKNOWLEDGED)

**File**: `supabase/migrations/20260417000000_security_hardening.sql` line 136

The `seller_profiles_public` view intentionally includes the seller's phone number for the WhatsApp CTA on the order page. This is a business decision -- sellers opt in by setting their phone.

### SEC-6.3 Personal Contacts Synced to Supabase (LOW)

**File**: `src/services/personalSync.ts` lines 193-200

The `contactToRemote()` mapper pushes `name` and `phone` to the `personal_contacts` table. These contacts are from the user's debt/split tracking (not bulk phone book imports). They are protected by owner-only RLS (`auth.uid() = user_id`).

Seller customers (with phone numbers) are synced to `seller_customers` table, also protected by owner-only RLS.

Phone contacts imported via the `ContactPicker` are used locally to populate names/phones but are NOT bulk-synced to Supabase -- only individual contacts associated with debts/splits are synced.

---

## 7. Order Link / Public Pages

### SEC-7.1 Slug Enumeration (LOW)

Anyone can try slugs like `https://potraces.vercel.app/?slug=<guess>`. If the slug exists, they see:
- Shop display name
- Logo
- Shop notice
- Product names, prices, units, images
- Seller phone number (for WhatsApp)
- Currency

This is intentional -- the order page is meant to be public. Product costs, stock quantities, and sales volumes are NOT exposed (SEC-2.4).

Slugs are validated to be at least 2 characters of `[a-z0-9-]` (server-side). There is no rate limiting on slug lookups at the PostgREST level, but Supabase provides default request rate limiting.

### SEC-7.2 Order Spam Protection (INFO -- PASS)

The order page implements client-side anti-spam:
- Honeypot field (`hp-email`) -- bot detection
- Rate limiting: max 3 orders per 5-minute window, 15s cooldown between orders
- Input length limits: name (100), phone (20), address (300), notes (500)
- Quantity limit: 9999 per item

Note: These are client-side only. A determined attacker could bypass them by sending POST requests directly to the Supabase REST API. Server-side rate limiting (e.g., via Supabase Edge Functions or pg triggers) would be stronger.

### SEC-7.3 Order Page CSP (INFO -- PASS)

**File**: `docs/index.html` line 6

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src https://iydqeeonaljqapulboaz.supabase.co; img-src * data:; frame-ancestors 'none'">
```

The CSP restricts connections to only the Supabase URL, prevents framing (`frame-ancestors 'none'`), and blocks external scripts. `unsafe-inline` for scripts/styles is necessary since everything is in a single HTML file.

---

## 8. Token/Session Handling

### SEC-8.1 Token Refresh (INFO -- PASS)

Both sync services (`sellerSync.ts` line 17-23, `personalSync.ts` line 44-52) proactively refresh tokens within 60 seconds of expiry. The Supabase client also has `autoRefreshToken: true`.

### SEC-8.2 Expired Token During Sync (LOW)

If a token expires mid-sync and refresh fails:
- `sellerSync.ts`: `getSession()` returns null, all push functions return early. Pull functions return early. No data loss but sync silently skips.
- `personalSync.ts`: Same pattern. `getSession()` returns null, sync is skipped.
- Push failures from `Promise.allSettled` are logged in dev but swallowed in production.

**No silent data loss**: Failed pushes don't delete data. Failed pulls abort the push step. The pull-before-push pattern prevents tombstone wipes.

### SEC-8.3 Auth Store Persisted in AsyncStorage (INFO -- PASS)

`authStore.ts` persists `isAuthenticated`, `isVerified`, `phone`, and `userId` in AsyncStorage under key `auth-storage`. The `phone` is a Malaysian phone number (not a password). The `userId` is a Supabase UUID. The actual session token is managed by Supabase's own AsyncStorage persistence, not the auth store.

On sign-out, `auth-storage` is explicitly removed by `clearBusinessData()` and `clearAllData()`.

---

## 9. Error Message Information Disclosure

### SEC-9.1 Error Messages to Users (INFO -- PASS)

- `AuthScreen.tsx` (line 104-108): Catches Supabase error messages. Maps "Invalid login" to a generic "wrong credentials" message. Maps "already registered" to a specific message. Other errors are lowercased and shown.
- `supabase.ts` (line 95-97): `clearBusinessDataRemote` shows `Failed to clear remote data (${res.status})` -- includes HTTP status code but not response body.
- `sellerSync.ts`: Errors logged to `console.warn` only in `__DEV__` mode. Production builds don't log.
- `personalSync.ts`: Errors logged to `console.warn` unconditionally (not gated by `__DEV__`).

**Recommendation**: Gate `personalSync.ts` console.warn calls behind `__DEV__` to match `sellerSync.ts` behavior. Console logs in production can be read by anyone with USB debugging access.

### SEC-9.2 Supabase Error Details in Dev Console (LOW)

`sellerSync.ts` line 1196-1203 logs full error details (message, code, details, hint, name) in `__DEV__` mode. This is acceptable for development but ensure these logs are stripped in production builds. Expo/Metro strips `__DEV__` blocks in production.

---

## 10. Storage Buckets

### SEC-10.1 Public Buckets (INFO -- PASS)

Three storage buckets are marked as public: `shop-logos`, `product-images`, `receipt-images`. All have:
- Public read policies (correct -- logos and product images are displayed on the public order page)
- Owner-only insert/update/delete policies using `auth.uid()::text = (storage.foldername(name))[1]`
- MIME type restrictions: `image/jpeg`, `image/png`, `image/webp`
- 2MB file size limit

**Receipt images**: The `receipt-images` bucket is public, meaning anyone who knows the URL can view a seller's cost receipts. The URL pattern is `{user_id}/{cost_id}.jpg`. While UUIDs are hard to guess, this is sensitive business data.

**Recommendation**: Consider making `receipt-images` a private bucket since receipts are only viewed by the seller within the app, not on the public order page.

---

## Summary of Findings

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| SEC-1.4 | HIGH | Stale claim_seller_profile may exist if migrations are partially applied | Verify in prod |
| SEC-2.3 | MEDIUM | seller_orders anon read policy needs production verification | Verify in prod |
| SEC-2.6 | LOW | user_profiles public lookup exposes user_id | Fix recommended |
| SEC-3.1 | MEDIUM | Supabase anon key in committed HTML (by design) | Accepted |
| SEC-3.2 | MEDIUM | Gemini API key bundled in client JS | Fix recommended |
| SEC-3.3 | MEDIUM | Anthropic API key bundled in client JS | Fix recommended |
| SEC-3.4 | MEDIUM | Google Vision/Speech API keys bundled in client JS | Fix recommended |
| SEC-4.2 | LOW | Personal data not cleared on business sign-out | By design |
| SEC-6.1 | MEDIUM | Customer phone in orders -- verify anon cannot read | Verify in prod |
| SEC-7.2 | LOW | Order spam protection is client-side only | Enhancement |
| SEC-9.1 | LOW | personalSync console.warn not gated by __DEV__ | Fix recommended |
| SEC-10.1 | MEDIUM | receipt-images bucket is public | Fix recommended |

### Priority Actions

1. **Verify production RLS** (SEC-1.4, SEC-2.3, SEC-6.1): Run `SELECT * FROM pg_policies WHERE tablename IN ('seller_orders', 'seller_profiles')` in production to confirm hardened policies are active and no dashboard-level grants exist.

2. **Move API keys server-side** (SEC-3.2, SEC-3.3, SEC-3.4): Proxy Gemini/Anthropic/Google API calls through Supabase Edge Functions. This also enables proper rate limiting.

3. **Make receipt-images bucket private** (SEC-10.1): Receipts are only viewed by the seller. Switch to authenticated reads.

4. **Restrict user_profiles public view** (SEC-2.6): Create a view that only exposes `referral_code` for public lookups.

5. **Add server-side order rate limiting** (SEC-7.2): A pg trigger or edge function could enforce per-seller-per-hour order limits.

---

## What's Working Well

- **RLS coverage is comprehensive**: Every table has RLS enabled with proper `auth.uid()` scoping. The `(select auth.uid())` optimization was applied consistently.
- **No service_role key exposure**: All edge functions correctly use server-side env vars.
- **Pull-before-push prevents data loss**: Both sync services abort push if pull fails.
- **Sign-out data clearing is thorough**: Multiple layers (Settings flow + App.tsx SIGNED_OUT handler) ensure business data is wiped.
- **No XSS vectors**: No WebViews, no dangerouslySetInnerHTML, proper escaping on the public order page.
- **Storage bucket hardening**: MIME type restrictions and size limits prevent abuse.
- **Column-level grants on seller_products**: Anon can only see public-facing columns, not costs/stock.
- **Security hardening migration** (`20260417000000`): Previous audit findings were addressed with push_token exclusion, claim_profile OTP requirement, and storage MIME caps.
