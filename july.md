# July — next steps (business auth + mode memory)

**Where we are (step 1, done):** seamless business sign-in (Wau loader → dashboard),
one-time Telegram verify at sign-up only, and per-account income-type memory
(local userId map in `auth-storage` + `seller_profiles.income_type`; migration
`20260710000000_business_income_type.sql` applied to the linked project).

---

## Step 2 — what I think we should do next (in priority order)

### 1. Fix the sign-out copy — it currently lies _(do this first, small)_
The Sign Out dialog promises *"Your data will remain on this device"*
(`src/i18n/en.ts:392`, `src/i18n/ms.ts:391`), but plain Sign Out runs
`clearBusinessLocalData()` (`src/store/settingsStore.ts:43-86`) which **wipes**
the business store (products, sales, clients) and deletes `business-storage`.

Two ways to make it honest:
- **(a) Align the copy** — e.g. "You'll be signed out. Data synced to your account
  stays; business data on this device is cleared." (smallest fix)
- **(b) Align the behavior** — stop wiping on ordinary Sign Out; reserve the wipe
  for the explicit "Clear Business Data".

I lean **(a)**: the wipe is a deliberate cross-user safety measure — the copy is the
bug, not the behavior. Must update EN + BM together (i18n parity). Effort: **S**.

### 2. Harden the pre-existing account-leak edge _(optional, correctness)_
The reset-only auth paths (`RootNavigator.tsx:138` stale-session,
`RootNavigator.tsx:168` OTP-back) flip auth off **without** wiping the business
store. A _different_ account that signs in through one of those inherits the
previous account's income type, because `restoreIncomeType` trusts
`businessStore.incomeType` when the local map has no entry
(`src/services/businessSetup.ts`). A normal Sign Out wipes the store, so this is
edge-only — and it existed before this feature; we didn't make it worse.

Fix if we care: on `userId` change in `AuthGatedBusiness`, when the new user has
**no** local map entry, clear the business-store setup fields before restore
instead of adopting the stale value. Trade-off: existing users re-pick once on
upgrade. Effort: **S/M**. First decide: **is multiple-accounts-on-one-device a real
usage pattern for us?** If not, leave it.

### 3. Verify end-to-end on device _(needs the emulator/simulator — can't do from here)_
1. Sign in → pick income type → land on dashboard.
2. Settings → Sign Out → sign back in → should be **loader → dashboard**, no Setup screen.
3. Second device / reinstall → also skips Setup (pulls `income_type` from server).
4. Dashboard → "change how I earn" → re-prompts, and re-picking re-saves (local + server).

### 4. Automated guard _(only if we want broader coverage — not now)_
No test runner is configured (no jest/`test` script in `package.json`), and
`restoreIncomeType` pulls in RN/Expo-only modules, so it won't run under plain
`node`. Not worth adding a whole framework for one function. Revisit only if we
set up a runner for the app in general.

---

**My call:** do **#1** now (quick, real, user-facing), decide **#2** based on whether
shared-device is real, and run **#3** before shipping. Skip **#4**.
