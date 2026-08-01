# Echo Voice Input — Product Research & V1 Recommendation

**Author:** product design research pass
**Date:** 2026-06-17
**Scope:** How the best AI-chat / messaging apps implement voice input (2024–2026), and the single best V1 voice UX for Echo (Potraces' AI expense-logging chat).

---

## 0. TL;DR

- **Recommended trigger:** **tap-to-toggle dictation** (tap mic → record → tap again to stop), NOT hold-to-talk. Echo logs short money phrases, and the transcript must land in the editable composer — toggle dictation is the pattern ChatGPT and Gboard use for exactly this "voice → editable text" job.
- **Recommended recording indicator (calm, not red):** a **pulsing olive accent ring + a live amplitude bar in calm tones** (olive/bronze), plus a running **mm:ss timer** and the word `listening…`. No red dot.
- **Three must-have states:** `listening` (mic open, amplitude + timer) → `transcribing` (spinner, "writing it down…") → `review` (transcript dropped into the composer, **never auto-sent**, cursor at end, ready to edit/Send).
- **Echo already does the most important thing right:** `stopAndTranscribe()` returns text and `MoneyChat.tsx` does `if (text) setInput(text)` — it lands in the composer and does NOT auto-send. The gaps are: the recording dot is terracotta `#C1694F` (a warm red — violates calm-not-red), no amplitude/waveform/timer feedback, and thin error/permission handling.

---

## 1. Product-by-product research

### 1.1 ChatGPT mobile — TWO distinct voice features (do not conflate)

ChatGPT ships two separate things, and the distinction is the most important lesson for Echo:

1. **Dictation (the in-composer mic).** Tap the microphone icon **inside the text box**. Audio is sent to OpenAI's models, and **"the transcription is returned as text, which you can edit before sending as a user message."** It does **not** auto-send — it lands in the editable composer. This is the pattern Echo wants.
2. **Voice Mode (the separate full-screen voice).** **"Tap and hold the large microphone button to begin a real-time conversation and release to stop."** This is a two-way spoken conversation (it talks back), a different screen and a different mental model. Echo does **not** want this for V1.

**Load-bearing evidence for Echo's confirmation-first rule:** OpenAI changed dictation at one point so it skipped the text field, and users filed a bug — *"Speech-to-text in ChatGPT app now skips text field – how to restore editable input?"* The community reaction confirms that for a *dictation* (vs *conversation*) mental model, users **expect to review/edit the transcript before it sends**, and are upset when it auto-sends. This is exactly Echo's sacred constraint.

- Trigger: tap-toggle (mic in composer) for dictation; press-and-hold full screen for Voice Mode.
- States: idle → listening → transcribing → **editable text in composer** (dictation).
- Auto-send: **No** (dictation) — transcript is editable first.
- Sources: [Speechify — voice dictation on ChatGPT](https://speechify.com/blog/how-to-use-ai-voice-dictation-on-chatgpt/), [OpenAI Voice Dictation FAQ](https://help.openai.com/en/articles/12168547-voice-dictation-faq), [OpenAI Voice Mode FAQ](https://help.openai.com/en/articles/8400625-voice-mode-faq), [OpenAI community: "dictation now skips text field"](https://community.openai.com/t/speech-to-text-in-chatgpt-app-now-skips-text-field-how-to-restore-editable-input/1167730)

### 1.2 Google Gemini app — March 2026 voice-input redesign (very relevant)

Google **redesigned Gemini's in-app voice input in March 2026 to look like a voice memo**, and the new behavior is a near-perfect template for Echo because it explicitly separates "turn into text" from "send":

- It **"swapped the old live transcription for a waveform display"** while you speak (no live partial text anymore — just an amplitude waveform).
- Two distinct end actions: **"tap *Stop* to turn your words into text or *Send* to run your command instantly."**
- **"The *Stop* button saves what you said as text without erasing anything you typed earlier"** — i.e. it appends the transcript to the existing composer text and lets you edit. **"*Send* processes your command"** immediately.
- The **Send circle "slightly pulsates."** Returning to the mic does not wipe prior input.

For Echo: **Gemini's *Stop* = exactly Echo's required behavior** (transcript → editable composer, preserving existing text). Echo should expose *only* the Stop-equivalent — never a "Send instantly" path, because confirmation-first forbids auto-send.

- Trigger: tap mic → waveform recording screen.
- States: idle → listening (waveform) → (Stop) text in composer / (Send) runs.
- Auto-send: optional in Gemini; **Echo takes only the Stop branch.**
- Source: [9to5Google — Gemini voice input redesign (Mar 2026)](https://9to5google.com/2026/03/19/gemini-voice-input-redesign/)

### 1.3 WhatsApp & Telegram voice notes — hold-to-talk, slide-to-cancel, lock

These are the canonical messaging gestures. They send **audio**, not text, so they are NOT a dictation model — but their **gesture grammar** (cancel, lock, preview) is worth borrowing where it fits.

- **Hold-to-talk:** press & hold mic to record; **release to send**.
- **Slide-to-cancel:** slide left while holding to **discard** the recording.
- **Lock-to-record:** slide **up** to a padlock to go hands-free (let go, keep recording), then Stop to **preview before sending**.
- WhatsApp later added **preview-before-send** for recorded notes.

For Echo: hold-to-talk + release-to-send is **wrong** for Echo because release implies *send*, and Echo must never auto-send. But **slide-to-cancel** (discard a mis-started recording) and the idea of an explicit **cancel affordance** are worth keeping. Lock-to-record is unnecessary for short expense phrases.

- Trigger: hold-to-talk; slide-up to lock; slide-left to cancel.
- Auto-send: **Yes** (release = send the audio clip) — the opposite of Echo's need.
- Sources: [GetStream — building WhatsApp-style voice messages](https://getstream.io/blog/ios-async-voice-messaging/), [Dignited — WhatsApp voice recording lock](https://www.dignited.com/29799/whatsapp-voice-recording-lock/), [GSMArena — WhatsApp preview before sending](https://m.gsmarena.com/whatsapp_is_now_letting_you_preview_voice_messages_before_sending_them-news-52288.php), [Telegram Tips — voice messages](https://telegram.tips/blog/voice-messages/), [Android Police — Telegram gestures](https://www.androidpolice.com/2020/06/15/5-telegram-gestures-and-shortcuts-you-should-be-using/)

### 1.4 Gboard voice typing / "Rambler" — live streaming transcription + code-switching

Gboard is the reference for **on-the-fly, character-by-character live transcription** and is the most relevant product for **Manglish**:

- Classic Gboard voice typing streams text **"character by character,"** on-device, via an **RNN-Transducer** model — true live partial text as you speak.
- **Rambler (Gemini-powered, 2026)** transcribes **and cleans up** in real time: **"removes filler words, handles mid-sentence corrections, and supports code switching between different languages."**
- Gboard **detects spoken language in real time** across multiple languages **"without any user input"** — no manual language toggle.
- Privacy: **"audio is never stored… only used for real-time transcription."**

For Echo: **code-switching is a first-class, solved capability in modern models** — the speaker mixing Malay + English mid-sentence ("aku beli nasi lemak tadi RM5") is exactly what Rambler-class models handle. This validates Echo's server-side Gemini approach. Live on-device partial text is a nice-to-have Echo can skip in V1 (server-side transcription returns the whole string at once).

- Trigger: tap mic (toggle) on keyboard → streams text into whatever field is focused.
- States: idle → listening (streaming partial text) → final text in field.
- Auto-send: **No** — text goes into the focused input; user still presses send.
- Sources: [XDA — Gboard real-time transcription & translation](https://www.xda-developers.com/gboard-real-time-voice-transcription-translation/), [Android Authority — Gboard Rambler](https://www.androidauthority.com/gboard-rambler-gemini-intelligence-3665653/), [Android Police — Gboard voice typing AI](https://www.androidpolice.com/gboard-voice-typing-ai/), [AndroidAyuda — on-device real-time transcription](https://en.androidayuda.com/gboard-voice-dictation-real-time-internal-pixel/)

### 1.5 Otter.ai — live transcription with waveform (brief)

- Live transcript appears in real time, **"indicated by the live transcribing and audio waveform."**
- A **recording indicator** shows on screen; Live Notes **won't transcribe until there is audio** (silence detection).
- One-tap record via widget/shortcut.

For Echo: the takeaway is the **waveform-as-recording-signal** convention (no red dot needed — the moving waveform *is* the "we're listening" signal) and **silence detection** ("no speech detected" must be a real handled state).

- Sources: [Otter — Using Live Notes](https://help.otter.ai/hc/en-us/articles/10474062838295-Using-Otter-Live-Notes), [Otter — best practices for in-person recordings](https://help.otter.ai/hc/en-us/articles/31672594631063-Getting-the-most-out-of-Otter-ai-Best-Practices-for-in-person-recordings)

### 1.6 Finance apps with voice (Cleo, Emma, voice expense trackers)

- **Cleo** is a chat-first AI money assistant and offers **real-time two-way voice conversations** — but that's a *conversation* model (like ChatGPT Voice Mode), not a "log this expense" dictation, and Cleo is bank-connected.
- **Emma** is bank-connected; no notable dictation-to-log voice pattern surfaced.
- A long tail of small App Store apps (e.g. "Voicash: Voice Expense Tracker," "Finance Bro") market **"speak your expense → it logs it,"** which is Echo's exact use case — but these are not authoritative design references and several **auto-log on transcription**, which is the anti-pattern Echo explicitly rejects.

**Implication:** there is **no dominant, well-designed "voice → expense" pattern to copy** in finance — so Echo should anchor on the **ChatGPT-dictation + Gemini-Stop** model (transcript → editable composer), which is the proven, trusted pattern, and differentiate on Manglish + confirmation-first.

- Sources: [Cleo on the App Store](https://apps.apple.com/us/app/cleo-ai-smart-money-manager/id1447274646), [Finny — apps like Cleo (2026)](https://getfinny.app/blog/apps-like-cleo), [Voicash on the App Store](https://apps.apple.com/us/app/voicash-ai-%E8%AF%AD%E9%9F%B3%E8%AE%B0%E8%B4%A6-%E6%94%AF%E5%87%BA%E7%AE%A1%E7%90%86/id6747767199)

---

## 2. Cross-product synthesis

| Dimension | Messaging (WhatsApp/Telegram) | Dictation (ChatGPT mic / Gboard / Gemini-Stop) | What Echo needs |
|---|---|---|---|
| Output | audio clip | **editable text** | **editable text** |
| Trigger | hold-to-talk, release=send | **tap-toggle** | **tap-toggle** |
| End action | release sends | Stop → text in field | Stop → text in composer |
| Auto-send | yes | **no** | **NEVER** |
| Recording signal | timer + slide hints | **waveform / amplitude** | **calm amplitude + timer** |
| Cancel | slide-to-cancel | tap stop / X | discard button |
| Code-switch | n/a | **Gemini/Rambler handles it** | **required (Manglish)** |

**Key conclusions:**
1. Echo is a **dictation** product, not a **voice-message** product. Use the dictation gesture family (tap-toggle), not the messaging family (hold-to-talk + release-to-send).
2. The single most important, evidence-backed rule — confirmation-first — matches **exactly** what serious dictation products do and what users *demand* (the ChatGPT "skips text field" backlash). Transcript → editable composer.
3. **Waveform/amplitude is the modern recording signal** (Gemini's Mar-2026 redesign, Otter). It conveniently lets Echo signal recording **without any red**.
4. **Code-switching is solved** by Gemini-class models — Manglish is supported. Benchmarks show **Gemini is more robust to code-switched speech than Whisper** (Whisper can mis-identify language or translate-to-English on rapid alternation), which validates Echo's existing Gemini-multimodal choice. (Sources: [HF — benchmarking ASR on code-switched speech](https://huggingface.co/blog/ServiceNow-AI/code-switching), [Adapting Whisper for code-switching (arXiv)](https://arxiv.org/html/2412.16507v2))

---

## 3. The calm-not-red recording problem

The universal convention is **recording = red dot**. Potraces forbids red/alarm colors anywhere. This is a real collision, and the research gives a clean resolution:

**The modern signal for "we're listening" is motion, not color.** Gemini's redesign and Otter both signal recording with a **moving waveform/amplitude meter** + a **timer** — the *movement* is the signal, the color is incidental. So Echo can drop red entirely.

### Recommendation (concrete)

Use the CALM tokens (no red anywhere):

- **Listening:** a **pulsing ring around the mic in olive accent** (`CALM.accent` light / the deeper muted olive in business-dark per the "business dark = no bright olive" rule) **+ a live amplitude bar** rendered in calm tones (olive→bronze gradient), driven by the recorder's metering. Add a **mm:ss timer** and the label `listening…`.
- **The amplitude movement is the recording signal** — no dot needed. If a dot is kept for familiarity, make it **bronze `#B2780A`**, never terracotta/red.
- **Fix the existing bug:** `MoneyChat.tsx` styles `recordingDot` and `recordingText` use **terracotta `#C1694F`** (a warm red, and semantically the "I Owe" debt color — wrong meaning *and* wrong palette). Replace with `CALM.accent` (olive) for the pulse and `CALM.textSecondary` for the label, or bronze for emphasis.
- **Transcribing:** swap the amplitude bar for a calm spinner / shimmering dots in `CALM.accent`, label `writing it down…`.
- Honor dark-mode tokens (`CALM_DARK`), big tap targets (mic ≥ 44pt), tablet caps (center + maxWidth the recording bar), no dropdowns.

This is consistent with the existing pulsing-ring patterns in RN (Moti/Reanimated) and with the codebase's existing `recordingAnim` pulse — only the **color** and the **added amplitude/timer** change.

Sources for the waveform-as-signal convention: [9to5Google — Gemini waveform redesign](https://9to5google.com/2026/03/19/gemini-voice-input-redesign/), [Otter — live transcribing waveform](https://help.otter.ai/hc/en-us/articles/10474062838295-Using-Otter-Live-Notes), [ElevenLabs UI — live waveform component](https://ui.elevenlabs.io/docs/components/live-waveform)

---

## 4. Recommended Echo V1 voice UX

### 4.1 Trigger (the ONE pattern)

**Tap-to-toggle dictation, mic icon inside the Echo composer.**
- Tap mic → start recording. Tap again (or tap a Stop pill) → stop → transcribe.
- **Why tap-toggle, not hold-to-talk:** Echo's output is *editable text that must be reviewed before sending*. Hold-to-talk's muscle memory is "release = send" (WhatsApp/Telegram), which fights confirmation-first. Tap-toggle is the dictation gesture used by ChatGPT's composer mic and Gboard, and it cleanly separates "stop talking" from "send" — the user stops, reads, then taps Send. It's also more accessible (no sustained press) and friendlier one-handed.

### 4.2 Destination of the transcript (sacred)

**The transcript lands in the Echo composer `TextInput` as editable text. It is NEVER auto-sent and NEVER auto-saved.**
- Append to existing composer text (Gemini-Stop behavior) — do not wipe what the user already typed.
- Place the cursor at the end; keyboard available so the user can correct ("RM5" → "RM50") before pressing Send.
- Echo then does its normal **prepare → user taps Save** flow. Voice changes the *input method*, nothing downstream.
- (Echo already implements this: `const text = await stopAndTranscribe(); if (text) setInput(text);` — keep it, just don't ever call send after it.)

### 4.3 State machine

```
            tap mic
   idle ───────────────▶ LISTENING
    ▲                      │  (recording; amplitude bar + mm:ss timer + "listening…")
    │                      │   - tap Stop / tap mic again ─▶ TRANSCRIBING
    │                      │   - tap Cancel (X)            ─▶ idle (discard, nothing inserted)
    │                      └── auto-stop at ~60s safety cap ─▶ TRANSCRIBING
    │
    │                 TRANSCRIBING
    │            (calm spinner + "writing it down…", input disabled)
    │                      │
    │        success ──────┴───────────────▶ REVIEW
    │        (transcript → composer, editable, cursor at end, NOT sent)
    │                                          │ user edits → taps Send → Echo prepares entry
    │                                          ▼ (normal confirmation-first flow)
    └──────────────── error states ───────────┘
```

**The 3 must-have states** (everything else is polish):
1. **LISTENING** — mic open; calm amplitude bar + timer + `listening…`; Stop and Cancel both reachable.
2. **TRANSCRIBING** — audio sent to Gemini; calm spinner + `writing it down…`; composer locked so the user can't double-fire.
3. **REVIEW** — transcript dropped into the editable composer, **not sent**, cursor at end, ready to edit and Send.

### 4.4 Cancel / retry

- **Cancel:** an always-visible **X / "cancel"** while LISTENING discards the recording and returns to idle — nothing inserted. (Borrowed from WhatsApp slide-to-cancel, but as an explicit tap target for accessibility; a slide-left can be an *added* affordance, not the only one.)
- **Retry:** after a failed transcription, the error row offers **"try again"** which re-opens LISTENING. The composer text is untouched, so a retry never destroys prior typing.

### 4.5 Error / edge-case handling (calm copy, no alarm color)

| Case | Detection | Behavior |
|---|---|---|
| **Permission denied** | `requestRecordingPermissionsAsync()` → not granted | Inline calm row: `mic access is off — turn it on in Settings to talk to Echo`, with a button that deep-links to OS settings. Do not loop the prompt. (Echo currently just sets `'microphone permission needed'` — upgrade to actionable copy + settings link.) |
| **No speech / silence** | Gemini returns empty string | Calm row: `didn't catch that — tap the mic to try again`. Composer unchanged. (Echo already returns `'no speech detected'`.) |
| **Network / API fail** | `callGeminiAPI` throws / null | Calm row: `couldn't reach Echo — check your connection and try again`, with **try again**. Offer **"type it instead"** (focus composer) as a fallback so a logging attempt is never lost. |
| **AI quota / cooldown** | `!isGeminiAvailable()` / `!canUseAI()` | Honest calm row reusing existing limit copy: `ai limit reached — upgrade for unlimited` or `Echo's resting — try again shortly`. |
| **Offline** | no connectivity | Voice needs the server; show `voice needs internet — you can still type it` and keep the composer fully usable. |

All error rows use **bronze/neutral** tones (`CALM.textSecondary` / bronze accents), never red.

### 4.6 Accessibility

- Mic button: `accessibilityLabel="start voice input"` / when recording `"stop voice input"`; `accessibilityRole="button"`; state announced via `accessibilityState={{ selected: isRecording }}`. (Apple/Google both require descriptive labels on dictation mic buttons — VoiceOver/TalkBack.)
- Announce state transitions with `AccessibilityInfo.announceForAccessibility` (e.g. "listening", "writing it down", "ready to review").
- Tap targets ≥ 44pt; don't rely on color alone for the recording state (timer + label + motion carry it — good for low-vision and the no-red constraint alike).
- Tap-toggle (not press-and-hold) is inherently more accessible — no sustained-press requirement.
- Sources: [Android — accessibility principles](https://developer.android.com/guide/topics/ui/accessibility/principles), [Mobile app accessibility: VoiceOver/TalkBack](https://medium.com/@growingprot/mobile-app-accessibility-voiceover-talkback-and-inclusive-design-dc21f7eddcfc)

### 4.7 Manglish / code-switching

- Keep the current Gemini prompt that tells the model the speaker may use **Malay, English, or Manglish (mixed)** — this is the right instruction and matches how Rambler/Gemini handle code-switching natively.
- Do **not** add a manual EN/MS language toggle — modern models auto-detect, and a toggle would break mid-sentence switching (the whole point of Manglish).
- Because Gemini handles code-switching better than Whisper, **stay on Gemini multimodal** for transcription; don't swap to a Whisper-only pipeline.
- Sources: [Android Authority — Rambler code-switching](https://www.androidauthority.com/gboard-rambler-gemini-intelligence-3665653/), [HF — code-switched ASR benchmark (Gemini vs Whisper)](https://huggingface.co/blog/ServiceNow-AI/code-switching)

---

## 5. Gap list vs current Echo implementation

Current code: `src/hooks/useVoiceInput.ts` + `src/screens/personal/MoneyChat.tsx`.

| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | `recordingDot` + `recordingText` use terracotta `#C1694F` (warm red + wrong "I Owe" semantic) | **High** (violates calm-not-red) | Use `CALM.accent` (olive) pulse + `CALM.textSecondary` / bronze label |
| 2 | No amplitude/waveform or timer — only a pulsing dot + "recording…" text | Medium | Add calm amplitude bar (recorder metering) + mm:ss timer; this becomes the primary recording signal |
| 3 | Permission-denied just sets `'microphone permission needed'` — no settings deep-link, no actionable copy | Medium | Actionable calm row + open-settings button |
| 4 | No explicit Cancel/discard affordance while recording | Medium | Add always-visible cancel (X) in LISTENING |
| 5 | Network/offline failures collapse to generic `'transcription failed'` | Medium | Distinct offline / network copy + "try again" + "type it instead" fallback |
| 6 | Tap-toggle, transcript→composer, no auto-send, Manglish prompt | **Correct — keep** | Already aligned with the recommended pattern |
| 7 | No `accessibilityLabel`/state on the mic toggle | Medium | Add labels, state, and announcements per 4.6 |

---

## 6. Sources

- [Speechify — AI voice dictation on ChatGPT](https://speechify.com/blog/how-to-use-ai-voice-dictation-on-chatgpt/)
- [OpenAI Help — Voice Dictation FAQ](https://help.openai.com/en/articles/12168547-voice-dictation-faq)
- [OpenAI Help — Voice Mode FAQ](https://help.openai.com/en/articles/8400625-voice-mode-faq)
- [OpenAI Community — "dictation now skips text field"](https://community.openai.com/t/speech-to-text-in-chatgpt-app-now-skips-text-field-how-to-restore-editable-input/1167730)
- [9to5Google — Gemini voice input redesign (Mar 2026)](https://9to5google.com/2026/03/19/gemini-voice-input-redesign/)
- [GetStream — WhatsApp-style voice messages](https://getstream.io/blog/ios-async-voice-messaging/)
- [Dignited — WhatsApp voice recording lock](https://www.dignited.com/29799/whatsapp-voice-recording-lock/)
- [GSMArena — WhatsApp preview before sending](https://m.gsmarena.com/whatsapp_is_now_letting_you_preview_voice_messages_before_sending_them-news-52288.php)
- [Telegram Tips — voice messages](https://telegram.tips/blog/voice-messages/)
- [Android Police — Telegram gestures & shortcuts](https://www.androidpolice.com/2020/06/15/5-telegram-gestures-and-shortcuts-you-should-be-using/)
- [XDA — Gboard real-time transcription & translation](https://www.xda-developers.com/gboard-real-time-voice-transcription-translation/)
- [Android Authority — Gboard Rambler (Gemini, code-switching)](https://www.androidauthority.com/gboard-rambler-gemini-intelligence-3665653/)
- [Android Police — Gboard voice typing AI](https://www.androidpolice.com/gboard-voice-typing-ai/)
- [AndroidAyuda — Gboard on-device real-time transcription](https://en.androidayuda.com/gboard-voice-dictation-real-time-internal-pixel/)
- [Otter — Using Live Notes](https://help.otter.ai/hc/en-us/articles/10474062838295-Using-Otter-Live-Notes)
- [Otter — best practices for in-person recordings](https://help.otter.ai/hc/en-us/articles/31672594631063-Getting-the-most-out-of-Otter-ai-Best-Practices-for-in-person-recordings)
- [Cleo — App Store](https://apps.apple.com/us/app/cleo-ai-smart-money-manager/id1447274646)
- [Finny — apps like Cleo (2026)](https://getfinny.app/blog/apps-like-cleo)
- [HuggingFace — benchmarking ASR on code-switched speech (Gemini vs Whisper)](https://huggingface.co/blog/ServiceNow-AI/code-switching)
- [arXiv — Adapting Whisper for code-switching](https://arxiv.org/html/2412.16507v2)
- [ElevenLabs UI — Live Waveform component](https://ui.elevenlabs.io/docs/components/live-waveform)
- [Android Developers — accessibility principles](https://developer.android.com/guide/topics/ui/accessibility/principles)
- [Medium — Mobile app accessibility: VoiceOver, TalkBack](https://medium.com/@growingprot/mobile-app-accessibility-voiceover-talkback-and-inclusive-design-dc21f7eddcfc)
- [Expo — Audio (expo-av) docs](https://docs.expo.dev/versions/v54.0.0/sdk/audio-av/)
