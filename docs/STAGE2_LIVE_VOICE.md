# Stage 2 — Live "words-as-you-speak" Malay (FREE, via Gemini Live)

Stage 1 (shipped) shows **no wrong words** while speaking and **streams the accurate Malay into the box on stop**
(batch Gemini through the existing ai-proxy — free, and the most accurate Manglish of any option).

Stage 2 adds **real-time words while you talk** (Siri/Gboard feel) using **Gemini Live** streaming STT. It is **free**:
it reuses the user's EXISTING Gemini key (no new vendor, no card, no expiring credit) via a short-lived ephemeral
token, so the real key never ships in the app. The streaming architecture is provider-agnostic, so Soniox/Deepgram
remain drop-in alternatives (see bottom) — but Gemini Live is the chosen path because it is genuinely free.

**Status: the entire Stage 2 code path is BUILT and type-clean — but DORMANT.** It can never run on the current build:
`liveAudioSource.requireModule()` returns `null` until you install the native capture module and rebuild, so
`isLiveAudioAvailable()` is `false`, `preferStreaming` is `false`, no socket is ever opened, and the voice hook behaves
byte-identically to today. Activation is short (below).

## Why Gemini Live (the user chose "free")
- **Free**: runs on the Gemini free tier; reuses the **same `GEMINI_API_KEY`** the ai-proxy already uses (already a
  deployed Supabase secret) — no new account, no new secret, no card, no expiring credit. 3 concurrent Live sessions on
  the free tier; a single user uses 1.
- **True streaming**: live transcript of the user's mic via `inputAudioTranscription`.
- **Honest caveats** (the user accepted these): occasional Malay→Indonesian spelling drift (a Malay-biased
  systemInstruction fights it; the trusted Stage-1 batch path is the accuracy floor), and the Live models are **preview**
  (Google can change them with ~2 weeks notice). The hook **degrades to the Stage-1 clip→Gemini path on any failure** —
  never a dead mic.
- Rejected for "free": **Soniox/Deepgram** (free trial/credit that expires → eventually paid), **Vosk** (no Malay model;
  monolingual → zero Manglish), **whisper.rn on-device** (phone models worse than current batch + Android lag).

## What is already built (in the repo)
- **`src/services/geminiLiveStream.ts`** — RAW WebSocket client (no SDK; RN's built-in WebSocket). Resolves on
  `setupComplete`, streams base64 PCM16 as JSON text frames, reads `serverContent.inputTranscription.text`, force-closes
  on any error so `onClosed` always finalizes. Same `openLiveStream(cb): Promise<LiveStream|null>` contract the hook uses.
- **`src/services/liveAudioSource.ts`** — live-PCM capture wrapper; `requireModule()` returns `null` = the SOLE
  activation seam.
- **`src/hooks/useVoiceInput.ts`** — `streaming` session mode (priority over server/on-device), reuses the exactly-once
  commit, **degrades to clip→Gemini on any failure**, teardown on stop/cancel/background/unmount/superseded (reviewed +
  re-verified — 11 lifecycle bugs found & fixed, all paths SOUND).
- **`src/screens/personal/MoneyChat.tsx`** — `preferStreaming` gate + live caption + breathing meter + reused one-time
  cloud-consent (audio leaves the device only after consent).
- **`src/screens/shared/Settings.tsx`** — a **"live malay voice"** toggle that only appears once `isLiveAudioAvailable()`
  is true (after the rebuild).
- **`supabase/functions/stt-token/index.ts`** — `mintGemini` mints the ephemeral Live token from `GEMINI_API_KEY`
  (v1alpha `auth_tokens`); the real key never leaves the server. (`provider:'soniox'|'deepgram'` branches also present.)
- **`src/services/sttToken.ts`** — `fetchSttToken('gemini')`. **`settingsStore.malayLiveStreaming`** flag (default off).

## Gemini Live protocol (what the code implements)
- **Connect:** `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=<ephemeral token>`.
- **Setup (first JSON frame):** `{ setup: { model:'models/gemini-live-2.5-flash', generationConfig:{ responseModalities:['TEXT'] }, inputAudioTranscription:{}, systemInstruction:{ parts:[{ text:'<Malay-biased verbatim transcribe>' }] } } }`. Wait for `{ setupComplete }` before streaming.
- **Audio:** each base64 PCM16 16k mono chunk → `{ realtimeInput:{ audio:{ data:'<base64>', mimeType:'audio/pcm;rate=16000' } } }` as a JSON TEXT frame (dodges RN's broken binary send; `@siteed` AudioData event `e.encoded` is base64 → zero decode).
- **Read:** `serverContent.inputTranscription.text` (append) → accumulate into `committed`. `turnComplete`/`generationComplete` = turn boundary; after `audioStreamEnd` it triggers a prompt close.
- **Stop:** `{ realtimeInput:{ audioStreamEnd:true } }`, finalize on the next turn boundary (watchdog backstop). Errors force-close → `onClosed` finalizes → hook degrades.

## Activation steps

### 1. Deploy the token endpoint (operator) — NO new secret
`GEMINI_API_KEY` is already a deployed secret (used by ai-proxy). Just:
```
supabase functions deploy stt-token
```
(If the v1alpha `auth_tokens` endpoint is unavailable on your key, the client degrades to Stage-1 batch — never a dead mic.)

### 2. Install the native capture module + rebuild (the one unavoidable rebuild — for ANY live option)
There is no JS-only way to get live mic PCM in Expo (`expo-audio` is record-to-file + metering only). Package:
`@siteed/audio-studio` (config-plugin autolink; emits base64 PCM16 16k mono via the `AudioData` event (`e.encoded`)).
```
npx expo install @siteed/audio-studio
```
`app.json` → `expo.plugins`:
```json
["@siteed/audio-studio", { "microphonePermission": "Allow Potraces to access your microphone", "enableBackgroundAudio": false }]
```
Then `npx expo prebuild --clean` + `eas build --profile development --platform android`.

### 3. Activation line — ALREADY FLIPPED ON
`liveAudioSource.requireModule()` already does `return require('@siteed/audio-studio')` (guarded by try/catch so the
pre-rebuild build still gets null and stays dormant). Nothing to do here — it activates automatically once the rebuilt
binary has the native module linked. PCM is driven imperatively via the `AudioData` event (`e.encoded`), matching the
library's own hook internals — verified against the installed @siteed/audio-studio@3.2.x source.

### 4. Enable + A/B (do NOT ship enabled before this passes)
The **"live malay voice"** toggle now appears in Settings ▸ Money. Dictate real Manglish finance lines and compare
Gemini-Live live vs the Stage-1 batch baseline. Keep the toggle on only if the live captions are good enough; the batch
path stays the accuracy floor regardless. If Gemini Live drifts to Indonesian too much, the systemInstruction is the lever
(or fall back to staying on Stage 1 — already accurate + free).

## Privacy / cost
- Audio streams to Google (same provider as the existing Gemini features) — covered by the one-time cloud-consent gate.
- Free tier; the socket opens only while dictating and closes on stop/turn-boundary/blur. 128k-token/session cap → long
  dictation rolls the session.
- Budget meter: the `// NOTE: add an ai_proxy_usage budget check` TODO in `stt-token` is optional for Gemini (free tier)
  but recommended if you ever switch to a metered provider.

## Alternative providers (the architecture is provider-agnostic)
Swapping providers = a new `xStream.ts` to the same `openLiveStream` contract + a one-line hook import + the matching
`mint…` branch (already present for Soniox & Deepgram). **Deepgram Nova-3** (`language=multi`) is the best Manglish quality
but is a $200 credit that expires in ~1 year then costs money. **Soniox** (`stt-rt-v5`) similar trial-then-paid. Both are
wired server-side; only set the secret + write the `xStream.ts` if you ever move off free.
