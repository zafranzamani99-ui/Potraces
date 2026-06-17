# Echo Voice Input — V1 Implementation Plan (definitive, build-ready)

**Date:** 2026-06-17
**Author:** lead architect (fusing forensics + research)
**Sources fused:**
- `audit/ECHO_VOICE_FORENSICS.md` — verified defect list (3 Blocker, 3 High, 2 Med, 1 Low + UNVERIFIED-needs-device items)
- `audit/ECHO_VOICE_RESEARCH.md` — competitive UX + recommended Echo V1 UX
- Code planned against: `src/hooks/useVoiceInput.ts`, `src/screens/personal/MoneyChat.tsx`, `src/screens/notes/NoteEditor.tsx`, `src/screens/business/LogIncome.tsx`, `src/services/speechService.ts`, `src/services/geminiClient.ts`, `app.json`, `src/i18n/en.ts` + `ms.ts`

**Scope:** Voice-to-text across the three surfaces — **Echo** (`MoneyChat`), **NoteEditor**, **LogIncome** — on Expo SDK ~54 / RN 0.81. This is planning only; no `src/` or `app.json` file is edited here.

**Build-surface fact (governs every test):** `expo-audio` is a native module — **microphone recording does NOT run in Expo Go**. Every test marked **[DEV BUILD]** requires an EAS dev/internal build. Tests marked **[JS]** can be reasoned/verified without a native rebuild (logic/UI render). The plugin permission-string change is config — it **requires a fresh native build** to take effect.

---

## STEP 2 — Locked decisions (decision + 1-line rationale)

### D1. BACKEND UNIFICATION → **Unify on the Gemini `useVoiceInput` path; retire `speechService.ts`.**
Rationale: the Gemini hook is the maintained, premium-gated, Manglish/code-switch-capable path (research §4.7: Gemini beats Whisper on code-switching); `speechService` is 100% broken (Blocker 3: LINEAR16-vs-m4a), gated on a likely-unset env var, and is the *reason* the two lifecycles diverged (Blocker 1 only exists because the hook copied the wrong lifecycle). One path = one fix surface, one quota, one failure mode. **All three surfaces will consume `useVoiceInput`.**

### D2. RECORDING INDICATOR → **Olive accent pulsing ring + calm amplitude bar + mm:ss timer; NO red, NO terracotta.**
Rationale: `MoneyChat.tsx:2790,2794` use terracotta `#C1694F` for `recordingDot`/`recordingText` — a warm red that *also* carries the wrong semantic (it is the "I Owe" debt color). Violates the strict NO-RED rule. Replace with `C.accent` (olive) for the pulse/ring, `C.textSecondary` for the label, and an amplitude bar in an olive→bronze calm tone. Per research §3, **motion is the recording signal** (Gemini Mar-2026 / Otter), so color is incidental and red is unnecessary. Use tokens from `src/constants` via the `useCalm()` `C` object — never hardcoded hex. In **business-dark** (LogIncome) use the deeper muted olive per the "business dark = no bright olive" memory rule.

### D3. CONFIRMATION-FIRST → **Locked: transcription only ever populates the editable input/body. Never auto-send, never auto-save.**
Rationale: this is Echo's sacred constraint and matches what serious dictation products do (research §1.1 — the ChatGPT "skips text field" backlash). Echo already complies (`MoneyChat.tsx:1102-1103` `if (text) setInput(text)`; NoteEditor appends to body `NoteEditor.tsx:248-251`; LogIncome fills `textInput` + pre-parses but needs an explicit Save). The plan must **preserve** this: after `stopAndTranscribe()` returns, the ONLY action is `setInput`/append — never a `handleSend()`/`handleSave()` call.

### D4. TRIGGER → **Tap-to-toggle dictation (NOT hold-to-talk), with an explicit always-visible CANCEL (discard).**
Rationale: research §4.1 — hold-to-talk's muscle memory is "release = send" (WhatsApp/Telegram), which fights confirmation-first; tap-toggle (ChatGPT composer mic / Gboard) cleanly separates "stop talking" from "send" and is more accessible. Echo already uses toggle (`handleMicPress`). Add a Cancel affordance that discards the recording **without** transcribing (stop recorder → drop uri → return to idle; nothing inserted, no AI call, no quota spend).

---

## STEP 3 — Phased plan (each phase shippable + independently verifiable)

### Conventions used below
- "change intent" = what the edit must achieve, not the literal diff (executor writes the code).
- New i18n keys are given as **EN** + **casual gen-z Malay (MS)** per the BM-tone memory rule (jom/dah/nak, relaxed but clear). MoneyChat voice copy lives in the `chat` namespace (`en.ts:2187-2189`); LogIncome under its `business`/log namespace (`en.ts:435-437`, `2641-2645`); notes under the notes namespace (`en.ts:2641-2645` region). All keys must be added to **both** `en.ts` and `ms.ts` (ms.ts implements the `Translations` type — a missing key is a type error).

---

## PHASE 0 — "Make it actually work" (the 3 Blockers)
**Goal:** voice produces a real transcript on a device on all surfaces. Pure correctness; minimal UX.

**Files touched:** `src/hooks/useVoiceInput.ts`, `app.json`, `src/services/speechService.ts` (deletion deferred to P2 — in P0 we stop using it via the LINEAR16 decision below OR leave LogIncome as-is until P2; see note).

| # | File | Change intent | Verification |
|---|---|---|---|
| P0-1 | `src/hooks/useVoiceInput.ts` (~line 59-60) | **Insert `await recorder.prepareToRecordAsync();` immediately before `recorder.record();`.** This is the missing lifecycle step (Blocker 1; the sibling `LogIncome.tsx:87` proves the correct order `prepare → record`). Without it `recorder.uri` is null → guard at line 79 fires → "no recording captured". Place after `setAudioModeAsync({ allowsRecording: true, ... })` (line 59). | **[DEV BUILD]** Build dev client → open Echo → tap mic, speak "nasi lemak RM5", tap stop → transcript appears in the composer (not "no recording captured"). This single test also exercises the whole pipeline. |
| P0-2 | `app.json` (plugins array, line 68 — currently bare `"expo-audio"`) | **Replace bare `"expo-audio"` with the explicit object form** `["expo-audio", { "microphonePermission": "Potraces uses the microphone so you can speak your expenses instead of typing." }]`. Removes the expo#35016 ambiguity where prebuild may omit `NSMicrophoneUsageDescription` (Blocker 2 → iOS hard-crash on first mic touch). Consistent with `expo-image-picker`/`expo-camera` which already use explicit objects (`app.json:55-66`). Android already lists `RECORD_AUDIO` (line 42) — no Android change needed. | **REQUIRES NATIVE REBUILD.** **[DEV BUILD]** iOS: build → first mic tap → no instant crash. Also inspect generated `ios/<app>/Info.plist` for `NSMicrophoneUsageDescription` present with the string. |
| P0-3 | Backend (per D1) | **Resolve LINEAR16-vs-m4a (Blocker 3) by unification, not by patching `speechService`.** P0 minimal move: confirm Echo + NoteEditor (already on Gemini) work end-to-end after P0-1. LogIncome's broken STT path is *fixed by routing it through `useVoiceInput`* — that re-wire is **P2-1** (it's a surface change, not a one-liner). In P0, document that LogIncome voice stays broken until P2; do NOT attempt to patch `speechService` encoding (throwaway work — the service is being deleted). | **[JS]** Trace: LogIncome still imports `transcribeAudio` (`LogIncome.tsx:22,103`) → known-broken until P2. **[DEV BUILD]** Echo + NoteEditor transcribe correctly (covers the unified path). |

**P0 exit:** Echo + NoteEditor reliably transcribe on a dev build (iOS + Android); iOS does not crash; `Info.plist` has the mic string. LogIncome explicitly deferred to P2.

---

## PHASE 1 — "Make it trustworthy & calm" (research UX)
**Goal:** the calm 3-state machine, red→olive swap, Cancel, a11y, dark-mode/tablet/tap-targets. Echo + NoteEditor only (LogIncome unified in P2 inherits this UI).

**Files touched:** `src/screens/personal/MoneyChat.tsx`, `src/hooks/useVoiceInput.ts` (expose amplitude + a `cancelRecording`), `src/i18n/en.ts`, `src/i18n/ms.ts`. (NoteEditor reuses the same hook additions; its inline indicator already exists — bring it to parity in P2 if time, but Echo is the flagship target here.)

### 1a. The 3-state machine (research §4.3)
`LISTENING` (amplitude bar + mm:ss timer + `listening…` + Stop + Cancel) → `TRANSCRIBING` (calm spinner + `writing it down…`, composer locked) → `REVIEW` (transcript appended to composer, editable, cursor at end, **never sent**). Echo already exposes `isRecording`/`isTranscribing`; this phase makes the indicator carry amplitude + timer + cancel and locks the composer during TRANSCRIBING (already `editable={!isLoading && !isRecording}` at `MoneyChat.tsx:1974` — extend to also disable during `isTranscribing`).

### 1b. Amplitude metering — **decision: enable metering on the recorder.**
`RecordingPresets.HIGH_QUALITY` does NOT enable metering by default. To drive the amplitude bar, the hook must enable metering and poll. **Change intent in `useVoiceInput.ts`:** create the recorder from a metering-enabled config (`{ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }`) and expose a `metering` value (poll `recorder.getStatus().metering` on an interval while recording, or via the recorder's status listener). Expose `metering: number` (dBFS, ~ -160..0) from the hook so the bar maps it to a calm 0..1 height. **If metering proves unreliable on a device, fall back to a pure pulsing-ring (motion still carries the signal per research §3) — amplitude is polish, the ring+timer are the floor.**

### 1c. Red→olive swap (the bug)
`MoneyChat.tsx` styles: `recordingDot` (line 2786-2791, `backgroundColor: '#C1694F'`), `recordingText` (line 2792-2796, `color: '#C1694F'`), and `micButtonActive` (line 2738-2740, `backgroundColor: '#C1694F'`). **Change intent:** replace all three terracotta refs — dot/ring → `C.accent` (olive); label → `C.textSecondary`; active mic button → `C.accent` (olive) background with white icon. These must read from the `makeStyles(C)` param (the file already uses the `makeStyles`/`useMemo` dark-mode pattern), so dark mode resolves to `CALM_DARK.accent` automatically.

### Phase 1 files + change intent
| File | Change intent |
|---|---|
| `src/hooks/useVoiceInput.ts` | (1) enable metering on the recorder + expose `metering`; (2) add `cancelRecording()` — stop the recorder, discard `uri`, set `isRecording=false`, do NOT call Gemini, do NOT spend quota; (3) expose a structured `error` kind (see P2-4) so the UI can show actionable copy. |
| `src/screens/personal/MoneyChat.tsx` | (1) swap terracotta → olive/secondary in `recordingDot`, `recordingText`, `micButtonActive` (lines 2738-2740, 2786-2796); (2) replace `recordingBar` content (lines 1928-1933) with: pulsing olive ring (reuse existing `recordingAnim` pulse at 1056-1069), amplitude bar (from hook `metering`), mm:ss timer, `listening…` label, and a **Cancel (X)** tap target (≥44pt) wired to `cancelRecording`; (3) `transcribing` indicator (1936-1940) → calm spinner + `writing it down…`; (4) disable composer during `isTranscribing` too (line 1974); (5) add a11y (1d). Tablet: cap the recording bar width (`maxWidth` + center) per the tablet memory rule. |
| `src/i18n/en.ts` + `ms.ts` | add keys (1e). |

### 1d. Accessibility (research §4.6)
Mic button: `accessibilityRole="button"`; `accessibilityLabel` = `t.chat.voiceStart` (idle) / `t.chat.voiceStop` (recording); `accessibilityState={{ selected: isRecording }}`. Cancel: `accessibilityLabel = t.chat.voiceCancel`. Announce transitions via `AccessibilityInfo.announceForAccessibility` ("listening", "writing it down", "ready to review"). Mic + Cancel tap targets ≥ 44pt. Do not rely on color alone (timer + label + motion carry state).

### 1e. New i18n keys (Phase 1) — `chat` namespace (EN / casual MS)
- `voiceListening`: `listening…` / `tengah dengar…`
- `voiceTranscribing`: `writing it down…` / `tengah tulis…`
- `voiceCancel`: `cancel` / `batal`
- `voiceStart`: `start voice input` / `mula cakap` *(a11y)*
- `voiceStop`: `stop voice input` / `berhenti` *(a11y)*
- `voiceReady`: `ready to review` / `dah siap, semak dulu` *(a11y announce)*
(Replaces the bare `recording`/`transcribing` at `en.ts:2187-2188`; keep those or repoint to the new keys.)

**Verification (Phase 1):**
- **[JS]** Render-inspect: recording bar shows olive ring + timer + Cancel; no `#C1694F` remains anywhere in MoneyChat styles (grep `C1694F` in `MoneyChat.tsx` → 0 hits). Dark mode: toggle theme → indicator uses `CALM_DARK` tokens.
- **[JS]** Confirmation-first regression: after transcribe, only `setInput` runs — grep `handleMicPress` confirms no `handleSend()` call follows `stopAndTranscribe`.
- **[DEV BUILD]** Tap mic → see live amplitude move + timer count; tap Cancel mid-record → returns to idle, composer untouched, NO transcript, NO quota increment (verify `incrementAiCalls` not called). VoiceOver/TalkBack announce the 3 states.

---

## PHASE 2 — "Robust & unified" (High/Med/Low defects + edges)
**Goal:** one backend everywhere, actionable errors, and every edge handled.

**Files touched:** `src/screens/business/LogIncome.tsx`, `src/services/speechService.ts` (delete), `src/hooks/useVoiceInput.ts`, `src/screens/personal/MoneyChat.tsx`, `src/screens/notes/NoteEditor.tsx`, `src/i18n/en.ts` + `ms.ts`.

| # | Defect (source) | File | Change intent | Verification |
|---|---|---|---|---|
| P2-1 | MED 7 unify backends; Blocker 3 | `LogIncome.tsx`, delete `speechService.ts` | Re-wire LogIncome to consume `useVoiceInput` (drop the local `useAudioRecorder`/`AudioModule` path at lines 60-117 and the `transcribeAudio` import line 22). After `stopAndTranscribe()` returns text → `setTextInput` + `parseTextInput` pre-fill (keep explicit Save → confirmation-first preserved). Delete `src/services/speechService.ts` and its `EXPO_PUBLIC_GOOGLE_SPEECH_API_KEY` references. Use **business-dark muted olive**, not bright olive, for LogIncome's indicator. | **[DEV BUILD]** LogIncome → speak income → transcript fills field, amount/note pre-parsed, NOT auto-saved. **[JS]** grep `speechService`/`transcribeAudio` → 0 refs. |
| P2-2 | HIGH 5 MIME | `useVoiceInput.ts:110` | Change `inlineData.mimeType` from non-standard `'audio/m4a'` to **`'audio/mp4'`** (the m4a container is MPEG-4; `audio/m4a` is not an IANA/Gemini type). | **[DEV BUILD]** log raw Gemini response — `parts[0].text` non-empty; if blocked, try `audio/aac`. |
| P2-3 | HIGH 4 unmount cleanup | `useVoiceInput.ts:34-43` | The unmount effect calls `recorder.stop()` (a Promise) **unawaited** in a sync try/catch → possible unhandled rejection; and unconditionally `setAudioModeAsync({allowsRecording:false})`. Change to swallow rejections (`void recorder.stop?.().catch(()=>{})`, `void setAudioModeAsync(...).catch(()=>{})`) and gate on an `isRecordingRef` so it only stops when actually recording. | **[JS]** mount→unmount mid-record (navigate away) → no unhandled-rejection warning; **[DEV BUILD]** other audio (e.g. video) still plays after leaving Echo mid-record. |
| P2-4 | HIGH 6 + research §4.5 errors | `useVoiceInput.ts`, `MoneyChat.tsx:1072-1074` | Differentiate error kinds in the hook: `permission` / `no-speech` / `network` / `quota` / `generic`, and surface **actionable calm copy** (not just a toast). Echo: add an inline calm error row (bronze/neutral, never red) with **try again** + **type it instead** (focus composer) — bring Echo to NoteEditor's inline-error bar (`NoteEditor.tsx:524-526`). Permission case → button deep-links to OS settings (Linking.openSettings). | **[DEV BUILD]** deny mic → actionable row + settings button; airplane mode → "voice needs internet — you can still type it", composer stays usable. |
| P2-5 | MED 8 quota gates | `useVoiceInput.ts:84-93`, `MoneyChat.tsx` | Move `isGeminiAvailable()` + `premium.canUseAI()` checks to **`startRecording` (before recording)** so the user isn't asked to speak when transcription can't run. Surface the paywall in Echo too (NoteEditor already does at `NoteEditor.tsx:252-253`). | **[DEV BUILD]** at quota → mic tap shows paywall immediately, recorder never starts. |
| P2-6 | app-backgrounded mid-record | `useVoiceInput.ts` | On `AppState` change to background while recording, stop + discard (don't leave a hung session); on iOS interruption (call), treat as Cancel with a calm "recording stopped". | **[DEV BUILD]** start record → background the app → return → idle state, no crash, no orphan session. |
| P2-7 | LOW 9 Android zero-byte (expo#39646) | `useVoiceInput.ts` (after `stop()`, ~line 77) | A non-null uri is necessary but not sufficient on SDK54 Android. After `stop()`, assert `(await new ExpoFile(uri).info()).size > 0` before transcribing; if 0 → `no-speech`/`generic` error, don't call Gemini (don't spend quota on empty audio). | **[DEV BUILD] Android physical device** — record → confirm file size > 0 path; force a 0-byte (very short tap) → graceful error, no quota spend. |
| P2-8 | parity | `NoteEditor.tsx` | Bring NoteEditor's indicator to the same calm 3-state visuals (it already has inline error + paywall; just adopt the amplitude/timer/cancel from the shared hook). | **[DEV BUILD]** NoteEditor voice matches Echo's calm states. |

### New i18n keys (Phase 2) — EN / casual MS
- `voicePermDenied`: `mic access is off — turn it on in Settings to talk to Echo` / `mic tak aktif — bukak dalam Settings dulu`
- `voiceOpenSettings`: `open settings` / `bukak settings`
- `voiceNoSpeech`: `didn't catch that — tap the mic to try again` / `tak dengar pun — tekan mic cuba lagi`
- `voiceNetwork`: `couldn't reach Echo — check your connection and try again` / `tak dapat sambung — cek internet, cuba lagi`
- `voiceOffline`: `voice needs internet — you can still type it` / `suara perlukan internet — boleh taip je pun`
- `voiceQuota`: reuse existing `ai limit reached — upgrade for unlimited` / existing MS equivalent
- `voiceTypeInstead`: `type it instead` / `taip je lah`
- `voiceTryAgain`: reuse `retry` (`en.ts:2189`)

**P2 exit:** one backend (`useVoiceInput`) on all three surfaces; `speechService.ts` deleted; actionable errors; offline/permission/quota/background/zero-byte/MIME all handled.

---

## STEP 4 — Cross-cutting

### Definition of done for V1
- [ ] **P0-1** `prepareToRecordAsync()` added; Echo transcribes on a dev build (iOS + Android).
- [ ] **P0-2** `app.json` expo-audio plugin explicit; `NSMicrophoneUsageDescription` confirmed in built `Info.plist`; iOS does not crash on first mic tap.
- [ ] **Blocker 3 resolved** via unification (LogIncome on Gemini, `speechService.ts` deleted).
- [ ] No `#C1694F`/terracotta in any voice indicator; recording = olive ring + amplitude + mm:ss timer; dark-mode tokens; ≥44pt tap targets; tablet width caps.
- [ ] 3-state machine (LISTENING → TRANSCRIBING → REVIEW) on Echo + NoteEditor + LogIncome.
- [ ] Explicit Cancel discards with no transcript and no quota spend.
- [ ] **Confirmation-first verified**: transcription only ever `setInput`/appends; never auto-sends, never auto-saves (all 3 surfaces).
- [ ] Actionable calm errors (permission+settings link / no-speech / network / offline / quota+paywall), never red, with "type it instead" fallback.
- [ ] Unmount/background cleanup awaited/guarded — no unhandled rejections, no stuck audio session.
- [ ] MIME `audio/mp4` confirmed yielding non-empty transcripts.
- [ ] Android zero-byte guard in place.
- [ ] a11y labels/state/announcements on mic + cancel.
- [ ] EN + casual MS i18n keys added (both files compile).

### UNVERIFIED items (device-build only) — exact tests
1. **Blocker 2 (iOS crash):** [DEV BUILD] iOS dev client → first mic tap → confirm NO instant crash; inspect generated `ios/<app>/Info.plist` for `NSMicrophoneUsageDescription`.
2. **HIGH 5 (MIME):** [DEV BUILD] after P0-1, log raw Gemini response → confirm `audio/mp4` gives non-empty `candidates[0].content.parts[0].text`; if empty/blocked, try `audio/aac`.
3. **LOW 9 (Android zero-byte, expo#39646):** [DEV BUILD] physical Android → after `stop()`, assert `recorder.uri` file `size > 0`; reproduce a 0-byte case (ultra-short record) → graceful error.
4. **Metering reliability (P1-1b):** [DEV BUILD] confirm `recorder.getStatus().metering` returns moving values on iOS + Android; if not, fall back to pulsing ring only.
5. **End-to-end Blocker 1:** [DEV BUILD] Echo → speak → transcript lands in composer.

### Risk / rollback
Voice is **additive and non-blocking** — the text composer is always fully usable. If transcription fails for any reason (permission, offline, quota, zero-byte, MIME), the user can still type; no edge case must ever disable or block text input. Rollback for any phase: revert the touched files; the typed-input path is untouched. P0-2 is the only change requiring a native rebuild to ship — if the build regresses, revert `app.json` and the prior bare-plugin binary still runs (with the known iOS risk).

### Effort / sequence & dependencies
1. **P0 first (correctness, gates everything).** P0-1 (JS, fast) → P0-2 (config, needs rebuild) → confirm Echo/NoteEditor on a dev build. Until P0-1 lands, no UX work can be device-verified.
2. **P1 next (UX/calm).** Depends on P0-1 (need a real recording to show amplitude/timer). The metering hook change (P1-1b) is a dependency for the amplitude bar; Cancel (`cancelRecording`) is a hook dependency for the Cancel UI.
3. **P2 last (robustness/unification).** P2-1 (LogIncome unification + delete `speechService`) closes Blocker 3 and depends on P1's hook shape (it inherits the same indicator). P2-4/P2-5 (errors/quota) depend on the structured-error change in the hook. P2-7 (zero-byte) and P2-2 (MIME) are independent hook tweaks that can land any time after P0-1.

**Build-gating note:** P0-2 and every [DEV BUILD] test require an EAS dev/internal build (Expo Go cannot run expo-audio). Sequence native rebuilds: one after P0-2, then batch P1+P2 JS changes into the next dev build to minimize rebuild cycles.

---

## BUILD STATUS — 2026-06-17 (P0+P1+P2 implemented)

All three phases implemented in one pass (multi-agent: i18n + reviewer agents; hook/UI hand-built after subagent API overload). **`tsc --noEmit` clean** — 0 errors in `src/` (48 pre-existing errors remain only in docs/archive + supabase/functions Deno, out of scope). **NOT runtime-verified** — expo-audio needs an EAS dev build; the [DEV BUILD] items above are still open.

- **P0** — `prepareToRecordAsync()` added (`useVoiceInput.ts`); `app.json` expo-audio plugin made explicit with `microphonePermission`; Blocker 3 closed by unification.
- **P1** — Echo (`MoneyChat.tsx`): calm 3-state UI (olive pulse + amplitude bar + mm:ss timer + Cancel), red `#C1694F`→olive swap (0 red left in voice UI; the 2 remaining `#C1694F` are the unrelated "I Owe" debt toggle), composer locked while transcribing, kind-mapped calm error row (open-settings / type-instead), a11y labels/state.
- **P2** — `useVoiceInput.ts` rewritten to the contract (metering 0..1, `cancelRecording`, structured `error:{kind}`, start-time quota gate, `audio/mp4` MIME, zero-byte guard, guarded unmount, AppState-background silent discard, **quick-tap start/stop race fixed via `startInFlightRef`/`cancelRequestedRef`**); LogIncome rewired to the hook (hold-to-talk retained — documented deviation; explicit Save preserved); `speechService.ts` DELETED (0 repo refs); NoteEditor adapted to the new error shape + Cancel + quota→paywall.
- **i18n** — 13 voice keys in the `moneyChat` namespace, EN + casual MS, both files.
- **Review** — final reviewer pass: 8/8 contract+security categories CONFIRMED-OK; 1 High (the race, now fixed) + 1 Med (stale LogIncome error row, fixed) + 2 Low device-test notes (metering availability; background copy — resolved by silent discard).

Nothing committed (awaiting explicit request).
