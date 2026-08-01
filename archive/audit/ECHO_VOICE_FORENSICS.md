# Echo Voice Input — Forensic Defect Report

**Date:** 2026-06-17
**Auditor:** RN/Expo correctness audit
**Scope:** Voice-to-text in Potraces (Expo SDK ~54, RN 0.81). Two backends:
1. `src/hooks/useVoiceInput.ts` → expo-audio record → Gemini multimodal transcribe. Used by `MoneyChat.tsx` (Echo) + `NoteEditor.tsx`.
2. `src/services/speechService.ts` → Google Cloud Speech-to-Text REST. Used by `business/LogIncome.tsx`.

**Method:** Every claim is backed by a code citation (`file:line`) or an authoritative expo/Google doc. Items I could not confirm without a device are explicitly labelled **UNVERIFIED — needs device test**.

---

## Verified ground-truth facts (with sources)

### A. `prepareToRecordAsync()` is REQUIRED before `record()` — VERIFIED
The expo-audio recording lifecycle is: `useAudioRecorder(preset)` → **`await prepareToRecordAsync()`** → `record()` → `stop()` → read `.uri`. The recorder must be prepared (which allocates the native recording session and the output file) before `record()` will produce a file. This is the documented order in the Audio (expo-audio) SDK reference, and the same requirement carried over from expo-av (`prepareToRecordAsync` must be called before recording).

- Source: Audio (expo-audio) — https://docs.expo.dev/versions/latest/sdk/audio/
- Source (legacy lineage, same requirement): Audio (expo-av) — https://docs.expo.dev/versions/v54.0.0/sdk/audio-av/
- Internal cross-proof: the OTHER voice path in this same app, `src/screens/business/LogIncome.tsx:87`, **does** `await audioRecorder.prepareToRecordAsync();` before `audioRecorder.record();` (line 88). The flagship hook does not. The two were written to different lifecycles — the hook is the wrong one.

`record()` is **synchronous** (returns `void`, not a Promise) — it begins capture on the already-prepared session. `.uri` is populated by the native module and is reliably readable **after `stop()`**. Without a prior `prepareToRecordAsync()`, there is no prepared output target, so `.uri` is null/stale → the hook hits its own `if (!uri)` guard and reports `"no recording captured"`.

### B. iOS `NSMicrophoneUsageDescription` with the bare `"expo-audio"` plugin — VERIFIED (with caveat)
The `expo-audio` config plugin supports a `microphonePermission` option whose **default** value is `"Allow $(PRODUCT_NAME) to access your microphone"`, and configuring the plugin writes `NSMicrophoneUsageDescription` into the iOS `Info.plist`.

- Source: Audio (expo-audio) config-plugin section — https://docs.expo.dev/versions/latest/sdk/audio/

So a bare `"expo-audio"` string is *intended* to still inject the default description. HOWEVER there is an open, reproduced Expo bug where prebuild does **not** add `NSMicrophoneUsageDescription` to `Info.plist` for expo-audio even when configured:
- Source: expo/expo#35016 "expo prebuild not adding NSMicrophoneUsageDescription KV pair to info.plist in iOS for expo-audio" — https://github.com/expo/expo/issues/35016

On iOS, calling the recorder without a microphone-usage string in `Info.plist` causes an **immediate hard crash** (iOS kills any app that touches the mic with no usage description) — it is not a soft denial. Given app.json uses the bare string (`app.json:68`) and there is a known prebuild bug, this must be treated as a real iOS-crash risk until the built `Info.plist` is inspected.

### C. `LINEAR16 @ 44100 Hz` vs actual `m4a/AAC` audio — VERIFIED mismatch
`RecordingPresets.HIGH_QUALITY` records compressed **AAC in an .m4a (MPEG-4) container** on both iOS and Android (HIGH_QUALITY = AAC, not raw PCM). Google Cloud Speech-to-Text `encoding: 'LINEAR16'` means **raw 16-bit little-endian PCM**. Sending an AAC/m4a byte stream while declaring `LINEAR16` is a format lie: STT will either return no results or an error, never a correct transcript. The correct `encoding` for an m4a/AAC file is not LINEAR16 (Google's supported set for AAC is limited; the reliable path is to record WAV/LINEAR16 or send `ENCODING_UNSPECIFIED` with a header STT can sniff — but a declared LINEAR16 over AAC bytes is always wrong).
- Source: Google Cloud Speech-to-Text `RecognitionConfig.AudioEncoding` (LINEAR16 = uncompressed 16-bit PCM) — https://cloud.google.com/speech-to-text/docs/encoding
- Code: `src/services/speechService.ts:26-27` declares `encoding: 'LINEAR16', sampleRateHertz: 44100`; the audio handed in comes from `audioRecorder.uri` (m4a) at `LogIncome.tsx:101-103`.

### D. Does expo-audio recording run in Expo Go (SDK 54)? — VERIFIED: NO, needs a dev/native build
expo-audio is a native module. Microphone **recording** requires the native config (permission strings, native recorder) that only exists in a **development build / production build**, not in the generic Expo Go client. This sets the test surface: **none of the voice paths can be validated in Expo Go** — every device test below must be run on an EAS dev build (or TestFlight/internal build).
- Source: Audio (expo-audio) — https://docs.expo.dev/versions/latest/sdk/audio/ (native module; config-plugin properties "cannot be set at runtime and require building a new app binary")

---

## RANKED DEFECTS

### BLOCKER 1 — `record()` called without `await prepareToRecordAsync()` (the hook never records)
- **File:** `src/hooks/useVoiceInput.ts:59-60`
- **Mechanism:** `await setAudioModeAsync({ allowsRecording: true, ... }); recorder.record();` — no `prepareToRecordAsync()`. The native recorder is never prepared, so no output file/session is created. On `stop()`, `recorder.uri` is null/stale (line 77) → guard at line 79 fires → `setError('no recording captured')` → returns null. The user gets a tiny "no recording captured" error and **nothing is ever transcribed**. This affects BOTH the flagship Echo chat (`MoneyChat`) and `NoteEditor`.
- **Evidence:** code lines above; required order verified in Fact A; the sibling file `LogIncome.tsx:87` proves the correct order is `prepare → record`.
- **Severity:** Blocker.
- **Minimal fix:** insert `await recorder.prepareToRecordAsync();` immediately before `recorder.record();` at line 60.
```ts
await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
await recorder.prepareToRecordAsync();   // <-- required
recorder.record();
```

### BLOCKER 2 — iOS microphone usage description is at risk → iOS crash on first record
- **File:** `app.json:68` (plugin listed as bare `"expo-audio"`) + `ios.infoPlist` block at `app.json:24-26` has **no** `NSMicrophoneUsageDescription`.
- **Mechanism:** iOS terminates any app that accesses the mic without `NSMicrophoneUsageDescription` in `Info.plist`. The bare plugin is *supposed* to inject a default (Fact B), but expo#35016 shows prebuild sometimes does not. If the key is missing in the built binary, the very first `requestRecordingPermissionsAsync()`/record on iOS crashes the app rather than showing a denial.
- **Evidence:** Fact B (docs + expo#35016). Note: `expo-camera`/`expo-image-picker` here are configured WITH explicit permission objects (`app.json:55-66`); expo-audio is the only mic-touching plugin left bare — an inconsistency.
- **Severity:** Blocker on iOS (UNVERIFIED whether it actually crashes on THIS build — **needs device test**: build an iOS dev client, open `MoneyChat`, tap mic; if it crashes instantly with a TCC/`NSMicrophoneUsageDescription` console error, confirmed. Alternatively inspect the generated `ios/<app>/Info.plist` for the key.)
- **Minimal fix (removes all ambiguity):** make the plugin explicit:
```json
["expo-audio", { "microphonePermission": "Potraces uses the microphone so you can speak your expenses instead of typing." }]
```
Then rebuild and confirm the key lands in `Info.plist`.

### BLOCKER 3 — speechService declares LINEAR16 but sends m4a/AAC → LogIncome voice always fails
- **File:** `src/services/speechService.ts:26-27`; consumed at `LogIncome.tsx:100-103`.
- **Mechanism:** `RecordingPresets.HIGH_QUALITY` produces AAC/m4a (Fact C). Declaring `encoding: 'LINEAR16', sampleRateHertz: 44100` tells Google STT the bytes are raw PCM. STT cannot decode AAC bytes as PCM → returns no `results` → `transcript = null` → `LogIncome` silently does nothing (`handleVoiceStop` catch/`if (transcript)` both no-op, `LogIncome.tsx:104-115`). Business-mode voice income logging is **100% broken**, even with a valid API key.
- **Evidence:** Fact C + code lines.
- **Severity:** Blocker (for the LogIncome voice path).
- **Minimal fix:** stop declaring a false encoding. Either (a) record LINEAR16/WAV for this path, or (b) drop `encoding`+`sampleRateHertz` and let STT infer from the container — but the highest-reuse fix is to **delete `speechService` and route LogIncome through `useVoiceInput`/Gemini** like the other two screens (see HIGH-7). Note this path is also dead unless `EXPO_PUBLIC_GOOGLE_SPEECH_API_KEY` is set (`speechService.ts:3,13-15` → returns null silently).

---

### HIGH 4 — Cleanup effect calls `recorder.stop()` synchronously and fires `setAudioModeAsync` on unmount
- **File:** `src/hooks/useVoiceInput.ts:34-43`
- **Mechanism:** The unmount cleanup calls `recorder.stop()` (a Promise) **unawaited** inside a `try/catch` — if not recording, `stop()` rejects asynchronously and the `catch` (which only guards synchronous throws) does **not** catch the rejection → possible unhandled promise rejection. It also calls `setAudioModeAsync({ allowsRecording: false })` unconditionally on every unmount, fighting any other audio consumer. Because the effect depends on `[recorder]` and `useAudioRecorder` may return a new object across renders, this cleanup can also run mid-session.
- **Evidence:** code lines; `stop()` is async (Fact A).
- **Severity:** High (leaked audio session / stuck `allowsRecording`, intermittent).
- **Minimal fix:** guard and swallow the rejection: `void recorder.stop?.().catch(() => {}); void setAudioModeAsync({ allowsRecording: false }).catch(() => {});` and consider gating on a recording ref so it only stops when actually recording.

### HIGH 5 — Gemini transcription mimeType `audio/m4a` is non-standard
- **File:** `src/hooks/useVoiceInput.ts:110-113` sends `inlineData.mimeType: 'audio/m4a'`.
- **Mechanism:** Gemini's documented audio inlineData MIME types use `audio/mp4` / `audio/aac` / `audio/mpeg` etc. `audio/m4a` is not an official IANA/Gemini MIME type; the model may reject or ignore the part, yielding an empty transcript (`'no speech detected'`, line 135) even when audio is fine. `callGeminiAPI` does accept `inlineData` (confirmed: `GeminiPart.inlineData` type at `geminiClient.ts:68-71`, request shape `geminiClient.ts:101-106`, response `candidates[0].content.parts[0].text` at `geminiClient.ts:90-99`), so the wiring is correct — only the MIME string is suspect.
- **Severity:** High (could cause silent empty transcripts once Blocker 1 is fixed) — **UNVERIFIED whether Gemini hard-rejects `audio/m4a`; needs device test** (after fixing Blocker 1, log the raw Gemini response; if parts are empty/blocked, switch MIME).
- **Minimal fix:** send `mimeType: 'audio/mp4'` (the m4a container is MPEG-4) — and verify against Gemini's accepted audio MIME list.

### HIGH 6 — Echo (MoneyChat) voice error is shown only as a transient toast, while NoteEditor shows it inline
- **Files:** `MoneyChat.tsx:1073-1074` (`if (voiceError) showError(voiceError)`); the mic render block `MoneyChat.tsx:1928-2003` shows recording/transcribing indicators but **no** persistent error line. `NoteEditor.tsx:524-526` DOES render `voiceError` inline.
- **Mechanism:** Error honesty exists but is inconsistent. In Echo the user sees a brief toast; if they miss it, the mic just "did nothing." Acceptable but below the NoteEditor bar. Also note error copy is generic (`'transcription failed'`, `'no recording captured'`) — never tells the user *why* (permission vs network vs quota), so once Blockers are fixed, diagnosis on real devices is hard.
- **Severity:** High (UX/diagnosability), not a functional blocker.
- **Minimal fix:** keep `showError`, and differentiate messages in `useVoiceInput` (permission / no-mic-string / network / quota) so the surfaced text is actionable.

### MED 7 — Architectural smell: TWO transcription backends
- **Files:** `useVoiceInput.ts` (Gemini) vs `speechService.ts` (Google STT) used by `LogIncome.tsx:22,103`.
- **Mechanism:** Two independent code paths, two failure modes, two API keys/quotas, double the maintenance. The Gemini path is the maintained, premium-gated, multilingual (Manglish) one; the STT path is broken (Blocker 3) and key-gated to a likely-unset env var. Divergent lifecycles are exactly how Blocker 1 slipped in (one path had `prepare`, the other didn't).
- **Severity:** Med (debt + correctness risk).
- **Minimal fix:** retire `speechService.ts`; have `LogIncome` consume `useVoiceInput` (single lifecycle, single backend, single fix surface).

### MED 8 — Premium/quota gates can silently no-op transcription
- **File:** `src/hooks/useVoiceInput.ts:84-93` — after a successful recording, `isGeminiAvailable()` (key/cooldown) and `premium.canUseAI()` (quota) are checked; failure returns null with `'AI temporarily unavailable'` / `'ai limit reached'`.
- **Mechanism:** This is *correct* behavior, but the recording is captured and then discarded if quota is hit — the user spoke for nothing. Only `NoteEditor.tsx:252-253` converts the limit error into a paywall; `MoneyChat` just toasts it (HIGH 6). `geminiClient.isGeminiAvailable()` also returns false whenever both models are rate-limited (`geminiClient.ts:25-42`) — under free-tier RPM this can no-op transcription with only a toast.
- **Severity:** Med.
- **Minimal fix:** check `isGeminiAvailable()` / `canUseAI()` **before** starting the recording (in `startRecording`), so the user isn't asked to speak when transcription can't run; surface the paywall in Echo too.

### LOW 9 — Android zero-byte recording risk on SDK 54
- **File:** `useVoiceInput.ts` / `LogIncome.tsx` recording paths.
- **Mechanism:** expo reports an SDK 54 Android bug where the recorder returns a URI for a **zero-byte** file (expo/expo#39646). After fixing Blocker 1, a non-null uri is necessary but not sufficient — a 0-byte file transcribes to nothing.
- **Source:** https://github.com/expo/expo/issues/39646
- **Severity:** Low/Med — **UNVERIFIED on this app; needs device test** (record on a physical Android device, check the file size of `recorder.uri` > 0 before sending).
- **Minimal fix:** after `stop()`, assert `(await new ExpoFile(uri).info()).size > 0` (or equivalent) before transcribing; if 0, surface a real error.

---

## Confirmation-first behavior (does transcription auto-send?) — VERIFIED GOOD
- **MoneyChat (Echo):** transcription lands in the input box for review — `handleMicPress` does `if (text) setInput(text)` (`MoneyChat.tsx:1102-1103`). It does NOT auto-send. Correct.
- **NoteEditor:** transcription is appended to the note body for review — `setText(text + separator + transcription)` via `handleTextChange` (`NoteEditor.tsx:248-251`). Correct.
- **LogIncome:** transcription fills `textInput` then runs `parseTextInput` to pre-fill amount/note, but still requires an explicit Save tap (`LogIncome.tsx:104-110`, save at `handleSave`). Correct (no silent commit).
Confirmation-first holds across all three once recording is fixed.

---

## Required device tests (Expo Go cannot run any of these — use an EAS dev build, Fact D)
1. **Blocker 1 fix:** dev build → MoneyChat → tap mic, speak, tap stop → confirm transcript appears in input. (Also confirms the whole pipeline.)
2. **Blocker 2:** iOS dev build → first mic tap → confirm no instant crash AND inspect `Info.plist` for `NSMicrophoneUsageDescription`.
3. **Blocker 3:** if keeping STT — confirm LogIncome voice now returns text after encoding fix.
4. **HIGH 5:** log raw Gemini response; confirm `audio/mp4` MIME yields non-empty `parts[0].text`.
5. **LOW 9:** Android — assert `recorder.uri` file size > 0 after stop.

---

## Defect count
- **Blocker:** 3 (prepareToRecordAsync omission; iOS mic usage string; LINEAR16-vs-m4a)
- **High:** 3 (unmount stop()/audio-mode; audio/m4a MIME; Echo error visibility)
- **Med:** 2 (two backends; quota silent no-op)
- **Low:** 1 (Android zero-byte recording)
- **Total:** 9
