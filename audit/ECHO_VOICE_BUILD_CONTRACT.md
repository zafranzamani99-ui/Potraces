# Echo Voice V1 — FROZEN BUILD CONTRACT

This is the binding interface for the multi-agent build of the Echo Voice V1 plan
(`audit/ECHO_VOICE_V1_PLAN.md`). Every agent MUST conform to the signatures and key
names below EXACTLY. Do not rename, do not change shapes. If something here seems wrong,
STOP and flag it in your final message — do not silently diverge.

## File ownership (disjoint — no agent touches another's files)

| Agent | Owns (only edits these) |
|---|---|
| **A — Hook & Config** | `src/hooks/useVoiceInput.ts`, `app.json` |
| **B — i18n** | `src/i18n/en.ts`, `src/i18n/ms.ts` |
| **C — Echo UI** | `src/screens/personal/MoneyChat.tsx` |
| **D — Surfaces** | `src/screens/business/LogIncome.tsx`, `src/screens/notes/NoteEditor.tsx`, delete `src/services/speechService.ts` |

## 1. `useVoiceInput` return shape (Agent A implements; C & D consume)

```ts
export type VoiceErrorKind = 'permission' | 'no-speech' | 'network' | 'quota' | 'generic';
export interface VoiceError { kind: VoiceErrorKind; }

export interface UseVoiceInputReturn {
  isRecording: boolean;
  isTranscribing: boolean;
  /** Normalized live amplitude 0..1 for the calm bar. 0 when idle/silent. Hook does the dBFS→0..1 mapping. */
  metering: number;
  /** Structured error. NOT a string anymore. UI maps `.kind` → localized copy. */
  error: VoiceError | null;
  startRecording: () => Promise<void>;
  /** Returns transcript text or null. NEVER auto-sends/auto-saves — caller puts it in the editable field. */
  stopAndTranscribe: () => Promise<string | null>;
  /** Discard the in-progress recording: stop recorder, drop uri, isRecording=false. NO Gemini call, NO quota spend. */
  cancelRecording: () => void;
}
```

Hook behavior requirements (from the plan P0/P1/P2):
- `prepareToRecordAsync()` MUST be awaited before `record()`.
- Recorder created metering-enabled (`{ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }`); `metering` polled while recording and normalized to 0..1 (silence→0). If metering is unavailable at runtime, `metering` stays 0 (UI falls back to ring-only).
- `isGeminiAvailable()` + `premium.canUseAI()` checks happen in **`startRecording`** (before recording), setting `error:{kind:'quota'}` and NOT starting the recorder when blocked.
- Gemini `inlineData.mimeType` = `'audio/mp4'` (not `'audio/m4a'`).
- After `stop()`, verify the audio file `size > 0` before transcribing; if 0 → `error:{kind:'no-speech'}`, no Gemini call.
- Error mapping: permission denied → `permission`; empty/no transcript or 0-byte → `no-speech`; fetch/network failure → `network`; quota/unavailable → `quota`; anything else → `generic`.
- Unmount cleanup: stop only if recording; swallow promise rejections (`void recorder.stop?.().catch(()=>{})`, `void setAudioModeAsync(...).catch(()=>{})`).
- On `AppState` → background while recording: cancel/discard (no hung session).
- The hook does NOT import i18n. It returns `{kind}` only; UI owns the copy.

## 2. i18n keys (Agent B adds to BOTH en.ts & ms.ts, inside the existing `chat` namespace)

`en.ts` is the typed source (exports `Translations`); `ms.ts` must implement every key or it's a type error.
MS tone = casual gen-z (jom/dah/nak/lah), relaxed but clear.

| key (`t.chat.<key>`) | EN | MS |
|---|---|---|
| `voiceListening` | `listening…` | `tengah dengar…` |
| `voiceTranscribing` | `writing it down…` | `tengah tulis…` |
| `voiceCancel` | `cancel` | `batal` |
| `voiceStart` | `start voice input` | `mula cakap` |
| `voiceStop` | `stop voice input` | `berhenti` |
| `voiceReady` | `ready to review` | `dah siap, semak dulu` |
| `voicePermDenied` | `mic access is off — turn it on in settings to talk to echo` | `mic tak aktif — bukak dalam settings dulu` |
| `voiceOpenSettings` | `open settings` | `bukak settings` |
| `voiceNoSpeech` | `didn't catch that — tap the mic to try again` | `tak dengar pun — tekan mic cuba lagi` |
| `voiceNetwork` | `couldn't reach echo — check your connection and try again` | `tak dapat sambung — cek internet, cuba lagi` |
| `voiceOffline` | `voice needs internet — you can still type it` | `suara perlukan internet — boleh taip je pun` |
| `voiceTypeInstead` | `type it instead` | `taip je lah` |

Reuse existing keys (do NOT recreate): try-again → existing `chat.retry`; quota/limit → existing AI-limit copy.
Keep the existing `chat.recording` / `chat.transcribing` keys present (other code may read them) — additive only.

## 3. UI error-kind → copy mapping (Agents C & D)

| `error.kind` | Copy | Extra affordance |
|---|---|---|
| `permission` | `voicePermDenied` | `voiceOpenSettings` button → `Linking.openSettings()` |
| `no-speech` | `voiceNoSpeech` | — (tap mic to retry) |
| `network` | `voiceNetwork` (or `voiceOffline` if offline) | `voiceTypeInstead` → focus composer |
| `quota` | existing AI-limit/paywall copy | paywall affordance |
| `generic` | `voiceNoSpeech` | `voiceTypeInstead` |

Error rows are calm/bronze/neutral — **NEVER red**.

## 4. Invariants every agent upholds (NON-NEGOTIABLE)

1. **Confirmation-first:** transcription only ever lands in the editable input/body (`setInput`/append). NEVER auto-send (`handleSend`) or auto-save after `stopAndTranscribe`.
2. **No red, no terracotta** in any voice UI. Recording indicator = olive `C.accent` pulsing ring + amplitude bar + mm:ss timer + label. Replace every `#C1694F` in voice styles with theme tokens via the `makeStyles(C)` pattern. Business-dark (LogIncome) uses the deeper muted olive, not bright olive.
3. **Voice is additive/non-blocking:** the text composer must always remain usable; a voice failure never disables typing.
4. **Theme tokens only** (`C.accent`, `C.textSecondary`, etc. from `useCalm()`), never hardcoded hex. Dark mode + tablet caps + ≥44pt tap targets on every new control.
5. **a11y:** mic + cancel get `accessibilityRole`/`accessibilityLabel`/`accessibilityState`; announce state changes.

## 5. Build surface reality

`expo-audio` is native — NONE of this runs in Expo Go; runtime proof needs an EAS dev build.
Agents build + self-review for correctness; do NOT run the app. Do NOT run the full `tsc`
(the orchestrator runs `npx tsc --noEmit` after each wave). The `app.json` permission change
only takes effect on a fresh native build.
