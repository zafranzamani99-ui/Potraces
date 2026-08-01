# Echo — Live Speech-to-Text ("Siri-style" interim captions) Tech Research

**Date:** 2026-06-17
**Goal:** Add live, real-time STT with interim results displayed as the user speaks to the Expo SDK 54 / RN 0.81 app, integrating with the existing `src/hooks/useVoiceInput.ts` (record → Gemini batch) pipeline.
**Owner constraints:** confirmation-first (editable field, never auto-send), CALM design, Manglish (Malay+English code-switching), PII sensitivity, Expo managed + config plugins, offline-friendly a plus.

---

## TL;DR Recommendation

**Use `expo-speech-recognition` (jamsch), HYBRID mode.** On-device/native streaming recognition drives the LIVE interim caption (fast, private, free, offline); on stop, the captured audio file (via `recordingOptions.persist`) is sent to **Gemini 2.0 Flash** for the accurate FINAL transcript that lands in the editable field. This keeps the proven Manglish-strong Gemini path as the source of truth while finally giving live feedback. **A fresh EAS dev build is mandatory** (new native module).

---

## Q1. `expo-speech-recognition` (jamsch) — verification

**Yes, this is the modern recommended solution.** It is the de-facto replacement now that `@react-native-voice/voice` is archived (see Q2). It wraps iOS `SFSpeechRecognizer` and Android `SpeechRecognizer`, exposes a Web-Speech-API-style surface, and is a config plugin.

- **SDK 54 / RN 0.81 compatibility:** Install the SDK-pinned branch: `npx expo install expo-speech-recognition@sdk-54`. From SDK 56 the package versioning aligns with Expo (`^56.0.0`); for SDK 54 you MUST use the `@sdk-54` dist-tag, NOT `latest` (which is 56.x and targets SDK 56). Do not confuse with the abandoned scoped package `@jamsch/expo-speech-recognition@0.2.15` (2 yrs old — the unscoped `expo-speech-recognition` is the maintained one).
  - Source: https://github.com/jamsch/expo-speech-recognition (README install section) · https://www.npmjs.com/package/expo-speech-recognition · https://github.com/jamsch/expo-speech-recognition/releases/tag/v56.0.0
- **Interim (partial) results live:** YES. Pass `interimResults: true` to `start()`. The `result` event fires repeatedly with `{ isFinal: false }` partial hypotheses while speaking, then once with `{ isFinal: true }`. Result shape: `event.results[0].transcript` (+ `confidence`, `segments`).
  - Source: README "Events" / `result` event; https://deepwiki.com/jamsch/expo-speech-recognition
- **On-device recognition:** YES — `requiresOnDeviceRecognition: true`. iOS → `SFSpeechRecognizer` on-device model; Android → `createOnDeviceSpeechRecognizer` / offline model. Verify availability per-locale first via `getSupportedLocales({ androidRecognitionServicePackage: 'com.google.android.as' })` before forcing it; the on-device model may need an initial OS download.
  - Source: README on-device section; Apple `requiresOnDeviceRecognition` https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition
- **Malay (`ms-MY`) + code-switching:** Locale set per-session via `lang` (BCP-47, e.g. `ms-MY` or `en-US`). **`ms-MY` is NOT guaranteed** — it depends on the device's installed recognition packs; `getSupportedLocales()` is the only reliable check at runtime (Malay on-device packs are commonly absent). **Critically: both iOS and Android recognize ONE locale per session — there is no native Manglish/code-switch mode.** Picking `ms-MY` weakens English words and vice-versa. This is the core accuracy limitation that motivates the hybrid design.
  - Source: Android `RecognizerIntent.EXTRA_LANGUAGE` BCP-47 single-locale; iOS `SFSpeechRecognizer(locale:)` returns nil if unsupported; README `getSupportedLocales`.
- **Config plugin / native rebuild:** YES, it is a config plugin and a native module → **a new EAS dev build is required** (Expo Go cannot load it — issue #64 "Cannot find native module 'ExpoSpeechRecognition'").
  - Source: https://github.com/jamsch/expo-speech-recognition/issues/64
- **Permissions:** iOS `NSSpeechRecognitionUsageDescription` + `NSMicrophoneUsageDescription`; Android `RECORD_AUDIO` (already present in `app.json`). The plugin injects these via `speechRecognitionPermission` / `microphonePermission` options.
- **Returns a recording URI (for Gemini final pass):** YES — `recordingOptions: { persist: true, outputDirectory, outputFileName, outputSampleRate, outputEncoding }`. The persisted file URI is emitted on the `audiostart`/`audioend` events as `{ uri }`. Gate with `supportsRecording()` (Android 13+ and iOS). This is exactly what enables the hybrid Gemini final pass.
  - Source: README "Persisting Recordings" / recordingOptions; https://www.npmjs.com/package/expo-speech-recognition
- **Maintenance:** Actively maintained (v56 released for SDK 56; recent issues triaged, e.g. interruption handling #135). Healthy.

## Q2. Alternatives

- **`@react-native-voice/voice`** — **DEAD. Archived (read-only) by owner on 2026-01-31.** Do not adopt. Supported interim results historically (`onSpeechPartialResults`) and had community Expo plugins, but no future fixes for RN 0.81/New Arch.
  - Source: https://github.com/react-native-voice/voice (archived) · https://github.com/react-native-voice/voice/issues
- **`DaveyEke/expo-speech-transcriber`** — newer on-device-only Expo module (Apple Speech + Android SpeechRecognizer, offline, privacy-focused). Viable but less mature/less documented than jamsch; same single-locale limitation. Keep as fallback only.
  - Source: https://github.com/DaveyEke/expo-speech-transcriber
- **Cloud streaming STT (Deepgram / AssemblyAI / Google streaming / OpenAI Realtime):** All give live interim results over **WebSocket**, but ALL require a **server-side key proxy** (never embed keys in the app) and stream raw mic audio off-device — **bad for a PII-heavy finance app** and not offline. Cost is non-trivial (~$4.50/hr bundled voice-agent tiers; per-minute STT extra). Malay realtime support is **limited/unconfirmed** across providers (AssemblyAI multilingual streaming = 6 languages, Malay not listed). **Rejected** vs on-device on privacy, cost, offline, and Malay grounds.
  - Source: https://deepgram.com/learn/best-speech-to-text-apis-2026 · https://www.assemblyai.com/blog/best-speech-to-speech-voice-agent-api · https://www.buildmvpfast.com/api-costs/transcription

## Q3. The Siri mechanism (how live partials are produced)

- **iOS `SFSpeechRecognizer`:** Feed mic buffers to `SFSpeechAudioBufferRecognitionRequest`; the recognition task's callback fires repeatedly with `SFSpeechRecognitionResult` objects whose `isFinal == false` are interim hypotheses, ending with one `isFinal == true`. **Hard limits: ~1 minute per session and ~1,000 requests/device/hour.** `requiresOnDeviceRecognition` toggles local vs Apple-server inference. iOS 26's new **SpeechAnalyzer** removes the 1-min cap and adds auto language detection, but is unavailable on earlier iOS — cannot be the baseline.
  - Source: https://developer.apple.com/documentation/speech/sfspeechrecognitionresult · https://picovoice.ai/blog/ios-speech-recognition/ · https://developer.apple.com/forums/thread/82839
- **Android `SpeechRecognizer`:** `RecognitionListener.onPartialResults(Bundle)` delivers interim hypotheses (`RESULTS_RECOGNITION`); `onResults` delivers the final. `createOnDeviceSpeechRecognizer` / `EXTRA_PREFER_OFFLINE` enables offline. Single locale via `EXTRA_LANGUAGE`.
  - Source: https://developer.android.com/reference/android/speech/SpeechRecognizer · https://www.geeksforgeeks.org/android/offline-speech-to-text-without-any-popup-dialog-in-android/

## Q4. Coexistence with `expo-audio`

- Both can be installed. **The recognizer owns the mic/`AVAudioSession` while active** — concurrent `expo-audio` recording on the same session conflicts. On iOS the recognizer sets category `playAndRecord` (configurable via `iosCategory`); interruptions (call/Siri) now emit an `error: "interrupted"` + `end`.
  - Source: https://github.com/jamsch/expo-speech-recognition/issues/135 · README iosCategory/setAudioCategoryIOS
- **Decision: the recognizer REPLACES the `expo-audio` record step in `useVoiceInput`.** Because the recognizer can itself persist the audio file (`recordingOptions.persist`), we no longer need `useAudioRecorder` for the Gemini path — the recognizer captures the audio AND streams partials simultaneously. Keep `expo-audio` only if it's used elsewhere (it is in ReceiptScanner-adjacent flows — leave those untouched). Within `useVoiceInput`, drop `useAudioRecorder` to avoid a double mic-grab.

## Q5. Recommended architecture for THIS app — HYBRID

**Rationale (the code-switch tradeoff, explicit):** On-device recognition is fast, free, private, and offline — perfect for the live caption — BUT it is single-locale and weak on Manglish. Gemini already beats Whisper on Malay+English code-switching (prior research). So: **use on-device ONLY for the transient live display, and Gemini for the authoritative FINAL text** that the user reviews/edits. Best of both: instant feedback + accurate Manglish transcript, with no new privacy regression for the final text (already going to Gemini today).

### Data flow
1. `start({ lang: 'ms-MY' if installed else 'en-MY'/'en-US', interimResults: true, continuous: true, requiresOnDeviceRecognition: true (if getSupportedLocales confirms), recordingOptions: { persist: true } })`.
2. `result` events (`isFinal:false`) → update a `liveTranscript` state → rendered as the dimmed live caption (CALM, no red).
3. User taps stop → `ExpoSpeechRecognitionModule.stop()`.
4. `audioend`/`end` event yields `{ uri }` (the persisted recording).
5. Send that `uri`'s base64 to `callGeminiAPI` (existing prompt) → FINAL Manglish transcript.
6. FINAL text populates the **editable field** (MoneyChat/NoteEditor/LogIncome) — never auto-sent. If Gemini fails/offline, fall back to the on-device final `isFinal:true` transcript so the feature still works offline.
7. Quota: only `incrementAiCalls()` when the Gemini pass runs (live on-device pass is free).

### Permissions / config plugin (`app.json`)
`RECORD_AUDIO` already present. Add the plugin:
```json
[
  "expo-speech-recognition",
  {
    "microphonePermission": "Potraces uses the microphone so you can speak entries to Echo.",
    "speechRecognitionPermission": "Potraces uses speech recognition to show your words live as you speak."
  }
]
```
This injects `NSMicrophoneUsageDescription` + `NSSpeechRecognitionUsageDescription` (iOS) and Android package-visibility + `RECORD_AUDIO`.

### Integration sketch against `useVoiceInput.ts`
- **Remove** `useAudioRecorder` / `recorder.*` and the metering interval; the recognizer provides `volumechange` events for the amplitude bar (`event.value`) — reuse `normalizeMetering` against that.
- **Add** state: `liveTranscript: string`. Extend the return type with it (consumers render it under/in the field).
- **`startRecording`:** keep the Gemini availability + premium gate; request perms; `getSupportedLocales()` once (cache); `ExpoSpeechRecognitionModule.start({...})`.
- **Event listeners** (via `useSpeechRecognitionEvent`): `result` → set `liveTranscript`; `volumechange` → set `metering`; `error` → map `not-allowed`→`permission`, `no-speech`→`no-speech`, `interrupted`→`generic`; `audioend` → stash `uri`.
- **`stopAndTranscribe`:** `stop()`, await the persisted `uri`, run the existing Gemini call on it; return FINAL text; fall back to last on-device `isFinal` transcript if Gemini returns null/offline.
- **`cancelRecording`:** `abort()` (no Gemini call, no quota), clear `liveTranscript`. Keep the in-flight/quick-tap guards and AppState background-cancel.
- Consumers (`MoneyChat.tsx`, `NoteEditor.tsx`, `LogIncome.tsx`) need a small UI add: show `liveTranscript` as a dimmed caption while recording; on stop, the existing path drops FINAL text into the editable input. No auto-send/auto-save change.

### BUILD reality
Unlike the prior JS-only fix, this adds a **native module + config plugin** → **`npx expo prebuild` + a new EAS dev build is mandatory**; it will NOT run in Expo Go. iOS additionally needs the entitlement/usage strings baked into the build.

---

## Top risks
1. **`ms-MY` on-device pack often missing** on real devices → live caption is English-only or fails. Mitigate: `getSupportedLocales()` gate + graceful fallback to `en-US` live caption (Gemini still fixes the final). Live caption is "best effort", final is authoritative.
2. **iOS ~1-minute session cap + 1000 req/hr** on `SFSpeechRecognizer` — long dictations silently stop (issue #77 reports premature stops on iOS 18). Mitigate: cap live sessions ~50s, show a calm "tap to continue"; Gemini final pass is unaffected (it uses the full persisted file).
3. **Mandatory native rebuild + audio-session ownership conflict with `expo-audio`** — shipping without removing the in-hook `useAudioRecorder` causes a double mic-grab/empty captures; and any tester on Expo Go sees "Cannot find native module". Mitigate: remove `useAudioRecorder` from `useVoiceInput`, distribute a fresh dev build, regression-test the other expo-audio consumers.

---

## BUILD STATUS — 2026-06-17 (hybrid live STT implemented)

Implemented (multi-agent: 2 research agents + 1 reviewer agent; hook/UI hand-built after subagent API overload). **`tsc --noEmit` clean** (0 src errors). **NOT runtime-verified — requires a fresh EAS dev build.**

- Installed `expo-speech-recognition@^3.1.3` (SDK-54 dist-tag). `app.json` plugin added with mic + speech permissions.
- `useVoiceInput.ts` rewritten: on-device streaming (`interimResults`) → `liveTranscript`; on stop, persisted recording → Gemini final (accurate Manglish), with fallback to the on-device final when Gemini is unavailable/offline/over-quota. Keeps quick-tap race guard, AppState background-discard, structured errors.
- **Global-singleton-events fix:** `activeRef` ownership gate so a second mounted `useVoiceInput` (backgrounded tab) ignores a session it didn't start.
- **Reviewer-found HIGH fixed:** `audioend` (recording uri) can trail `end`; added `finalizingRef` + a 600ms grace so the Gemini pass isn't silently skipped (which would degrade hybrid → on-device-only on every recording).
- UI: dimmed live-caption strip above the composer in MoneyChat + NoteEditor + LogIncome; clears into the editable field on stop (confirmation-first held); no red.
- `expo-audio` now has 0 src imports (orphaned by this change) — package + plugin left in place; safe to remove later.

**Open DEVICE-TEST items (dev build only):** persisted-recording format → Gemini MIME; `volumechange` metering range vs `(v+2)/12`; `ms-MY` on-device pack availability; iOS ~1-min `continuous` cap; native module loads + permission prompts after rebuild.
