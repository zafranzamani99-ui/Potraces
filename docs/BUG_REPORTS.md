# Bug Reports

Running log of user-reported bugs: symptom → evidence → root cause → fix → verification.
Newest first.

---

## BR-002 · Mic tap could hang forever with zero feedback (found while fixing BR-001)

- **Date found:** 2026-07-18 (during BR-001 verification)
- **Severity:** MEDIUM — no crash, but the mic "does nothing" with no error shown
- **Screens affected:** every `useVoiceInput` consumer (Echo, Notes)
- **Status:** FIXED 2026-07-18

### Symptom

After BR-001 was fixed, tapping the mic could still *appear* to do nothing: no
listening UI, no error banner, forever. This is very likely part of the original
"the mic in Echo and in Notes still fails" complaint.

### Root cause (two gaps, both in event plumbing)

`useVoiceInput` only surfaces errors at the recognizer's `end` event. But:

1. `expo-speech-recognition`'s native iOS `start()` has a `catch` path that emits
   `error` **without** a trailing `end` (no session ever began — e.g.
   `SFSpeechRecognizer` couldn't be created). The hook stored the error in a ref
   and waited for an `end` that never comes.
2. Worse, the native side can die **without emitting any event at all** (observed
   on the x86_64/Rosetta simulator where the Speech XPC service was cold/hung).
   Nothing for JS to react to — permanent silent `starting` state.

### Fix (both in `src/hooks/useVoiceInput.ts`)

1. A **fatal `error` received while still `starting`** (before any `start` event)
   now finalizes the session immediately and surfaces the error banner.
2. A **12s start watchdog** (`START_WATCHDOG_MS`): if `start()` produced no
   `start` event within the window, abort, surface an honest `setup` error, and
   return to idle. Armed on both the initial start and Android's per-utterance
   restarts; cleared on `start`/cancel/new-session/unmount.

### Verification (simulator)

- With the speech service dead: mic tap → error banner appears (~12s) instead of
  a silent forever-hang.
- With the service warm: mic tap → full listening surface ("echo's listening —
  just talk…", live timer, ✓/× controls) engages within ~2s. No crash in any run.

---

## BR-001 · Tapping the mic instantly kills the app (Echo + Notes)

- **Date reported:** 2026-07-18
- **Reported by:** owner (on iPhone + simulator)
- **Severity:** CRITICAL — hard crash, app closes with no error UI
- **Screens affected:** Echo (MoneyChat composer mic), Notes (NoteEditor mic) — both use `useVoiceInput`
- **Status:** FIXED 2026-07-18

### Symptom

Tap the mic icon → the app closes itself immediately. No alert, no permission
prompt, nothing in-app. Reproduces every time on iOS (device and simulator).

### Evidence

- Crash report on the Mac: `~/Library/Logs/DiagnosticReports/Potraces-2026-07-18-020525.ips`
  (simulator, `SIGSEGV`, background dispatch queue — the process was killed while
  requesting speech authorization).
- `ios/Potraces/Info.plist` had **no `NSSpeechRecognitionUsageDescription`** key,
  and `NSMicrophoneUsageDescription` still carried the generic template string —
  i.e. the plist predates the voice feature.

### Root cause

The mic path on iOS is:

```
mic tap → useVoiceInput.startRecording()
        → ExpoSpeechRecognitionModule.requestPermissionsAsync()
        → SFSpeechRecognizer.requestAuthorization   (native)
```

Apple **terminates any app on the spot** that calls `SFSpeechRecognizer.requestAuthorization`
without `NSSpeechRecognitionUsageDescription` in its Info.plist (TCC privacy
violation — this is an OS kill, not a catchable error, so no JS guard can
prevent it).

The key was missing because this repo checks in the `ios/` folder (no continuous
prebuild). `expo-speech-recognition` + its config plugin were added to
`app.json` *after* the last `npx expo prebuild`, so:

- the **pod** got linked anyway (autolinking reads package.json → the native
  module existed and the JS ran fine), but
- the **plugin's Info.plist edits never landed** (those only apply during prebuild).

That mismatch — native module present, plist entitlement text absent — is
exactly the combination that crashes at the permission request rather than
failing gracefully at module load.

### Fix

Hand-applied to `ios/Potraces/Info.plist` exactly what the config plugin would
have written (verified against `node_modules/expo-speech-recognition/app.plugin.js`
and the plugin config in `app.json`):

1. **Added** `NSSpeechRecognitionUsageDescription` =
   "Potraces uses speech recognition to show your words live as you speak."
2. **Updated** `NSMicrophoneUsageDescription` =
   "Potraces uses the microphone so you can speak entries to Echo."
   (was the generic "Allow $(PRODUCT_NAME) to access your microphone")

Requires a native rebuild to take effect (plist is baked into the app bundle) —
a Metro reload is NOT enough.

### Verification

- Rebuilt to the iPhone 17 Pro simulator; tapped the Echo mic across multiple
  fresh launches: the app now shows the Speech Recognition + Microphone
  permission alerts (with the custom strings) instead of dying, both grants land
  in TCC, and the listening surface engages. Zero crashes in any run. Same
  path serves NoteEditor. Final confirmation on the physical iPhone recommended
  (the simulator's speech backend is flaky under Rosetta — see BR-002).

### Lesson / guard

When adding any Expo library **with a config plugin** to this repo, prebuild does
NOT run automatically — either re-run `npx expo prebuild -p ios` (and review the
diff) or hand-port the plugin's Info.plist / AndroidManifest changes. A missing
iOS usage-description string is an instant OS kill, invisible to JS error
handling and to TypeScript.
