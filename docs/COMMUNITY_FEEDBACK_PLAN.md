# Community Contribution — In-app Feedback + Discord (build plan → production)

> **Status:** planned, building v1. **Owner:** Zafran. **Written:** 2026-08-04. **Launch gate:** ships in the next app build (target 2026-08-13).
>
> One-line: add a Settings **"Help & Community"** block — *Report a bug or idea* (writes to the existing `beta_feedback` table, surfaces on your `site/admin.html` board) + *Join our Discord*. This doc is the single source of truth: what to build, what to check, and what must be true before it's live.

---

## 1. What already exists (reused as-is — no rebuild)

| Piece | Where | Reused for |
|---|---|---|
| `beta_feedback` table (severity, status `new→…→done`, RLS, screenshot bucket) | `supabase/migrations/20260616120000_beta_feedback.sql` | The report store |
| Founder admin board (read reports, set status "Done") | `site/admin.html` (`admin_set_status` RPC) | "get feedback + mark done" — free |
| Public web feedback form | `site/beta.html` | Stays; app matches its field conventions |
| Private screenshot bucket `beta-screenshots` (path locked to `<uid>/…`) | same migration | Optional in-app screenshot |
| Account deletion cascade (rows + screenshots wiped) | `supabase/functions/delete-account/index.ts` | Privacy — already handled |

**Anything the app writes to `beta_feedback` auto-appears on `admin.html`.** "Connect it to the admin website" is therefore free — same table.

---

## 2. Locked decisions (the foundation)

1. **Container = a registered screen `FeedbackForm`**, not a slide-up panel. The sign-in screen returns the user by *screen name* (`navigate('Account', { returnTo: 'FeedbackForm' })`), which a panel can't be.
2. **One submitting identity: the personal account (`supabasePersonal`), always** — regardless of app mode. Reason: `Account` sign-in only creates a personal login, and business phone-logins carry a fake `@potraces.app` email you could never reply to. Cost: a business-only user does a one-time real sign-in (Google/Apple/phone) to send. Accepted.
3. **Draft persisted to disk**, cleared only on successful send. A normal sign-in trip keeps in-memory state; the only loss vector is the OS killing the app during Google sign-in — disk persistence covers it.
4. **Save report first, then best-effort screenshot upload.** Avoids orphaned files / lost reports (the web form's upload-first order can orphan a file on a failed insert).
5. **Classify = Bug / Idea toggle** (matches your original "bug/improvement" wording; market-standard, low friction). Maps to the existing `severity` column: *Idea → `idea`*, *Bug → unset* (you set priority on the admin board). No backend divergence; the 4-level web form is untouched.
6. **Close-the-loop status list = fast-follow, not v1.** A stale status is worse than none; v1 gives a warm confirmation, the "Your reports + status" list lands post-launch.
7. **No rename of `beta_feedback`.** The name is hardcoded in `admin.html`, `beta.html`, and the bucket id; renaming 9 days before launch is pure risk. Real `app_version` on each report already lets the admin board tell app vs web apart.

---

## 3. The submit flow (with the "don't lose my draft" requirement)

```
User opens Settings → Help & Community → "Report a bug or idea"
  → FeedbackForm screen (can type WITHOUT an account)
     pick Bug/Idea · type description · (optional) attach screenshot
  → tap SEND
     ├─ signed in (personal)? → save report → best-effort screenshot → warm confirmation → back
     └─ not signed in? → save draft to disk
                        → navigate('Account', { returnTo: 'FeedbackForm' })
                        → user signs in (framed: "so I can tell you when it's fixed")
                        → returns to FeedbackForm, draft rehydrated, everything intact
                        → tap SEND → submits → clears draft
```

Edge cases handled: app killed during OAuth (draft on disk) · offline/failed send (keep draft + toast) · double-tap (in-flight guard) · session expired at send (re-route to sign-in) · screenshot upload fails (report still saved).

---

## 4. Exact insert shape

```ts
supabasePersonal.from('beta_feedback').insert({
  // user_id omitted — DB default auth.uid() fills it; RLS forbids spoofing
  email:           session.user.email,        // real JWT email, never user-typed
  severity:        type === 'idea' ? 'idea' : null,   // Bug → null (founder triages)
  body:            text.trim(),               // required, non-empty
  screen:          null,                       // reserved (optional future field)
  screenshot_path: null,                       // set after best-effort upload
  app_version:     Application.nativeApplicationVersion,  // expo-application (real version)
  user_agent:      `${Platform.OS} ${Platform.Version}`.slice(0, 500),
})
```
- `severity` allowed set: `idea | minor | major | blocker` (we use `idea` / null).
- `screenshot_path` must start `<uid>/…` (DB-enforced); path `<uid>/feedback-<ts>.png`.
- Screenshot upload reuses the avatar path (`profileSync.ts` `uploadAvatarPhoto` shape), bucket `beta-screenshots`.

---

## 5. Build steps (files)

| # | File | What |
|---|---|---|
| 1 | `supabase/migrations/20260804000000_beta_feedback_ratelimit.sql` | `BEFORE INSERT` trigger: ≤5 rows / 10 min per `user_id` (covers app + web). Idempotent. |
| 2 | `src/constants/index.ts` | `DISCORD_URL` placeholder + TODO. |
| 3 | `src/store/feedbackDraftStore.ts` | Tiny zustand `persist` store: `{ type, body, screenshotUri }`, `setDraft`, `clearDraft`. |
| 4 | `src/services/betaFeedback.ts` | `submitFeedback()` — personal client, insert-first then screenshot, auto version/device; typed `NOT_SIGNED_IN` error for the gate. |
| 5 | `src/screens/shared/FeedbackForm.tsx` | The screen: Bug/Idea Neu Pills · Note-Fields description + KeyboardDoneFab · optional screenshot + PII warning · Neu Select "Send" · sign-in gate + draft rehydrate. |
| 6 | `src/navigation/RootNavigator.tsx` + `src/screens/shared/AppSettings.tsx` | Register `FeedbackForm`; add "Help & Community" block (Report row + Discord row) to the About section. |
| 7 | `src/i18n/en.ts` + `src/i18n/ms.ts` | All strings, EN + BM in parity (casual tone). |

**Design-system compliance:** Onyx surfaces (`C.background`, no outlines), Neu Pills (faintDark) for Bug/Idea, Neu Card for the form, Neu Select for Send, Note-Fields rule for the description, `KeyboardAwareScrollView` (input-heavy form). Seam rule: if the screenshot thumbnail sits in a neu card, split shadow (outer) from `overflow:'hidden'` (inner).

---

## 6. Checks (run before handoff)

- [ ] `tsc` clean on every touched file (no new type errors).
- [ ] EN/BM i18n parity — every new `en.ts` key has a `ms.ts` counterpart (else `tsc` breaks).
- [ ] House-rule scan: RNGH/keyboard scroller correct, no red/alarm colors, no banned finance words, `makeStyles(C)` dark-mode pattern, no hardcoded hex outside tokens.
- [ ] Neu seam rule: no view carries both a neu shadow and `overflow:'hidden'`.
- [ ] Send disabled while empty and while in-flight; failed send keeps the draft.

---

## 7. Production constraints (the last mile — NOT code, must be true before live)

1. **Apply the rate-limit migration to production Supabase** (SQL editor, project `iydqeeonaljqapulboaz`). Until applied, spam protection isn't live.
2. **Replace `DISCORD_URL` placeholder** with the real invite. Row is dead until then.
3. **Real-device test, iOS + Android:** draft survives a Google sign-in that backgrounds the app; screenshot picks + uploads. (Simulator can't prove these.)
4. **End-to-end pass:** submit from app → appears on `admin.html` → mark "Done".
5. **Ships in the next app build** (same gate as launch).

---

## 8. Deferred (fast-follow — additive, zero rework)

- "Your reports + status" list in-app (close-the-loop; biggest retention lever). RLS already allows it.
- Screenshot auto-purge on `done`/`wontfix` reports (retention hygiene).
- `admin.html` pagination + status filter default (before volume grows).
- Optional `duplicate_of` column to merge duplicate reports.
- Push/notify on status change.

None block v1; none forces a schema rewrite later.

---

## 9. Risk ledger (handled vs deferred)

| Risk | Severity | Handling | When |
|---|---|---|---|
| Draft lost on OAuth app-kill | High | Persist draft to disk | v1 |
| Two identities on a mode-agnostic screen | High | Always submit via personal account | v1 |
| Orphaned screenshot / lost report | High | Insert first, then best-effort upload | v1 |
| No spam ceiling | High | Rate-limit trigger | v1 |
| Uncontactable fake email | Med | Store real `session.user.email` | v1 |
| Double-submit / offline | Med | In-flight guard + keep draft | v1 |
| Screenshot PII (finance) | Med | Opt-in + one-line warning + submit consent line | v1 |
| No close-the-loop | Med | Warm confirmation now; status list later | fast-follow |
| Screenshot retention forever | Low | Purge cron | fast-follow |
| `admin.html` unpaginated | Low | `.limit()` + filter | fast-follow |
| Discord vs in-app fragmentation | Low | Discord labeled "chat & community"; form is the record | v1 copy |

---

## 10. Implementation reference (verified against the codebase, 2026-08-04)

> Everything below was checked against real files so the build is turn-key. **No code has been written yet** — this section is the spec to execute when you give the go.

### 10.1 Files to create / edit

| Action | Path | Notes |
|---|---|---|
| create | `supabase/migrations/20260804000000_beta_feedback_ratelimit.sql` | §10.2 |
| create | `src/store/feedbackDraftStore.ts` | §10.5 |
| create | `src/services/betaFeedback.ts` | §10.6 |
| create | `src/screens/shared/FeedbackForm.tsx` | §10.7 |
| edit | `src/constants/index.ts` | add `DISCORD_URL` after `PRIVACY_URL` (~line 164) |
| edit | `src/navigation/RootNavigator.tsx` | import + `<Stack.Screen name="FeedbackForm">` (§10.4) |
| edit | `src/screens/shared/AppSettings.tsx` | "Help & Community" block in the `about` section; change `useNavigation()` → `useNavigation<any>()` (line 75) |
| edit | `src/i18n/en.ts` + `src/i18n/ms.ts` | new keys under `settings`, EN + BM in the same edit (§10.8) |

### 10.2 Rate-limit migration (paste-ready)

```sql
-- Potraces — beta_feedback insert rate-limit (app + web share this table).
-- Caps a single user to 5 reports / rolling 10 min. Idempotent.
-- Apply: Supabase dashboard > SQL Editor > paste > Run.
create or replace function public.beta_feedback_ratelimit()
  returns trigger language plpgsql
  security definer set search_path = public as $$
declare recent int;
begin
  -- column DEFAULT auth.uid() fills new.user_id before this BEFORE-trigger runs
  select count(*) into recent from public.beta_feedback
   where user_id = new.user_id and created_at > now() - interval '10 minutes';
  if recent >= 5 then
    raise exception 'feedback_rate_limited'
      using hint = 'Too many reports in a short time — please wait a few minutes.';
  end if;
  return new;
end; $$;
revoke all on function public.beta_feedback_ratelimit() from public, anon;
drop trigger if exists beta_feedback_ratelimit_trg on public.beta_feedback;
create trigger beta_feedback_ratelimit_trg
  before insert on public.beta_feedback
  for each row execute function public.beta_feedback_ratelimit();
```

### 10.3 Reusable components (confirmed, with file:line)

| Need | Reuse | Note |
|---|---|---|
| "Send" CTA | `NeuButton` (`src/components/common/NeuButton.tsx`) | `<NeuButton icon="send" label={t.settings.fbSend} onPress={handleSend} disabled={!body.trim() || submitting} />` |
| Multiline description | Note-Fields rule: `multiline` `TextInput` + `KeyboardDoneFab` (`src/components/common/KeyboardDoneFab.tsx`) driven by `useKeyboardVisible` (`src/hooks/useKeyboardVisible.ts`) | render FAB as last child |
| Bug/Idea selector | Neu Pills (faintDark) — copy the `segPill` recipe in `AppSettings.tsx:589-602` | selected → `C.accent` fill + `C.onAccent` text |
| Settings rows | `SettingRow` (`src/components/common/SettingRow.tsx`) | icons Ionicons prefix: report `i/bug-outline`, Discord `i/logo-discord`; chip `#B2780A` / `#5865F2` |
| Toast | `useToast().showToast(msg, 'success' \| 'error')` | `ToastType` union (`ToastContext.tsx:6`) includes `'error'` ✓ |
| Screenshot pick | `ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 })` then copy to `FileSystem.documentDirectory` — mirror `AvatarPicker.tsx:104-139` | no explicit permission request needed |
| Screenshot upload | mirror `uploadAvatarPhoto` (`profileSync.ts:25-52`): `manipulateAsync` resize→PNG, `FormData`, `.upload(path, formData, { upsert:true, contentType:'multipart/form-data' })` | bucket `beta-screenshots`, path `` `${uid}/feedback-${Date.now()}.png` `` |
| App version | `Application.nativeApplicationVersion` (`expo-application`) | NOT the hardcoded "1.0.0" in `AppSettings.tsx:491` |

### 10.4 Navigation (repo idiom — no `RootStackParamList` change needed)

- Screens use `const navigation = useNavigation<any>();` (`QuickLogSetup.tsx:87`). `Account` / `QuickLogSetup` aren't in `RootStackParamList` either — the `<any>` idiom is how the repo does it.
- Register: `<Stack.Screen name="FeedbackForm" component={FeedbackForm} options={makeBackHeader(C, mode, 'Report a bug or idea')} />` (helper at `RootNavigator.tsx:112`; `mode` is in scope).
- Open from Settings: `navigation.navigate('FeedbackForm')`.
- Sign-in bounce: `navigation.navigate('Account', { returnTo: 'FeedbackForm' })` (exactly `QuickLogSetup.tsx:605`). `Account` signs into **personal only** and, on success, returns via `navigate(returnTo)` (`AccountScreen.tsx:145,152`); the target screen stays mounted (native stack) so live state survives the trip.

### 10.5 Draft store (paste-ready)

```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type FeedbackType = 'bug' | 'idea';
export interface FeedbackDraft { type: FeedbackType; body: string; screenshotUri?: string | null; }

interface State {
  draft: FeedbackDraft | null;
  setDraft: (d: FeedbackDraft) => void;
  clearDraft: () => void;
}

// Persisted so a report survives the sign-in round-trip AND a low-memory
// process kill during OAuth. One slot, last-write-wins. Cleared on success.
export const useFeedbackDraftStore = create<State>()(
  persist(
    (set) => ({ draft: null, setDraft: (draft) => set({ draft }), clearDraft: () => set({ draft: null }) }),
    { name: 'feedback-draft', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
```

### 10.6 `submitFeedback()` contract (`src/services/betaFeedback.ts`)

- `supabasePersonal.auth.getSession()` → none ⇒ `throw new NotSignedInError()` (custom `Error` subclass; the screen catches it to route to sign-in + keep the draft).
- **Insert the row first:** `supabasePersonal.from('beta_feedback').insert({ email: session.user.email, severity: type==='idea'?'idea':null, body: body.trim(), app_version, user_agent }).select('id').single()`.
- Then **best-effort** screenshot: `manipulateAsync` → upload to `beta-screenshots` → `update({ screenshot_path }).eq('id', inserted.id)`. A failed upload never fails the report (anti-orphan rule).
- `user_agent = \`${Platform.OS} ${Platform.Version}\`.slice(0,500)`. Grants confirmed: authenticated has `update(screenshot_path)` + `select_own` + `insert`; path `<uid>/…` passes the `shotpath` CHECK.

### 10.7 `FeedbackForm` behavior spec

- **Init** local state from the persisted draft (covers a process-kill remount); native stack keeps it mounted across the Account trip so live state also survives.
- **Persist** `{type, body, screenshotUri}` to the draft store on change, ~400ms debounced; clear when empty.
- On `NotSignedInError`: **force-save the draft immediately** (not debounced), then `navigate('Account', { returnTo: 'FeedbackForm' })`.
- `useFocusEffect` re-checks `supabasePersonal.auth.getSession()` on return to toggle the *"you'll sign in so I can tell you when it's fixed"* benefit line.
- **Send:** `Keyboard.dismiss()` → in-flight guard → `submitFeedback` → success: `clearDraft()` + reset + success toast + `goBack()`; error whose message includes `rate_limit` → `fbRateLimited` toast (keep draft); other error → `fbSendFailed` toast (keep draft).
- **Design:** Onyx surfaces (`C.background`, no outlines); `KeyboardAwareScrollView` (`react-native-keyboard-controller`); seam rule on the screenshot thumbnail (split shadow-outer / `overflow:'hidden'`-inner).

### 10.8 i18n keys (add under `settings`, EN + BM, anchor after `aboutSection` at `en.ts:524`)

| Key | EN | BM |
|---|---|---|
| `helpCommunity` | Help & Community | Bantuan & Komuniti |
| `reportProblem` | Report a bug or idea | Lapor bug atau idea |
| `reportProblemDesc` | Found something off? Tell me. | Ada yang tak kena? Bagitau je. |
| `joinDiscord` | Join our Discord | Sertai Discord kami |
| `joinDiscordDesc` | Chat with me & other users | Borak dengan aku & pengguna lain |
| `fbIntro` | Tell me what's not working, or an idea to make Potraces better. I read every one. | Bagitau apa yang tak jalan, atau idea untuk buat Potraces lagi best. Aku baca satu-satu. |
| `fbBug` | Bug | Bug |
| `fbIdea` | Idea | Idea |
| `fbDescLabel` | What happened? | Apa jadi? |
| `fbDescPlaceholder` | Describe the bug or your idea… | Cerita pasal bug atau idea kau… |
| `fbAttach` | Attach screenshot (optional) | Lampir screenshot (pilihan) |
| `fbScreenshotWarning` | A screenshot may show your balances — attach only if you're OK with that. | Screenshot mungkin tunjuk baki duit kau — lampir kalau kau ok je. |
| `fbRemove` | Remove | Buang |
| `fbConsent` | I store this to fix issues and may follow up. | Aku simpan ni untuk baiki isu & mungkin follow up. |
| `fbSignInBenefit` | You'll sign in so I can tell you when it's fixed. | Kau sign in dulu supaya aku boleh bagitau bila dah baiki. |
| `fbSend` | Send | Hantar |
| `fbSent` | Got it — thank you! I read every one. | Dah dapat — terima kasih! Aku baca satu-satu. |
| `fbSendFailed` | Couldn't send — check your connection and try again. | Tak dapat hantar — check connection kau & cuba lagi. |
| `fbRateLimited` | Too many reports in a short time — give it a few minutes. | Terlalu banyak lapor dalam masa singkat — tunggu sekejap ya. |

> BM tone is casual first-person ("aku") to match the app voice; run the `i18n-parity` skill at build time to final-polish. Every key must exist in **both** files in the same edit or `tsc` breaks (`Translations = typeof en`).

### 10.9 Header title
Nav header is an English literal like every other screen (`makeBackHeader(C, mode, 'Report a bug or idea')`); the in-screen intro is localized via `t.settings.fbIntro`.
