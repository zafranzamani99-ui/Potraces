# Echo — Live Speech-to-Text (Live-Caption) UX

**Author:** Senior product design pass
**Date:** 2026-06-17
**Scope:** Design V1 of the "words appear as you speak" effect for **Echo**, the calm AI money chat (`src/screens/personal/MoneyChat.tsx`), extending the existing LISTENING state. Personal mode, Expo/RN, EN + casual Malay/Manglish.

---

## 0. The constraint that drives everything (read first)

Echo's **current** voice pipeline is **not streaming**. `useVoiceInput.ts` records the whole clip with `expo-audio`, then on stop sends one base64 blob to **Gemini 2.0 Flash** for transcription. Gemini batch transcription returns the full string at the end — it physically **cannot** produce live partial words. So there is **no live caption possible on the current architecture**, only the existing record → stop → "transcribing…" → text-drops-in flow.

A true Siri-style live caption requires an **on-device streaming recognizer** that emits incremental partial results. In Expo/RN that is **`expo-speech-recognition`** (jamsch) — it wraps `SFSpeechRecognizer` (iOS) and Android `SpeechRecognizer`, and with `interimResults: true` fires `result` events carrying a **cumulative** transcript plus an `isFinal` flag. ([expo-speech-recognition](https://github.com/jamsch/expo-speech-recognition), [npm](https://www.npmjs.com/package/expo-speech-recognition))

**Therefore V1 is a two-engine design:**

- **Engine A (live caption):** `expo-speech-recognition` on-device, streams interim words for the *visible* caption. Free, offline, instant, no quota.
- **Engine B (truth):** keep the existing Gemini clip transcription as the **authoritative** text that lands in the composer — it handles Manglish/code-switching far better than the OS recognizer, which often mangles mixed Malay+English.

The on-device caption is a **live preview only**; Gemini's result is what fills the composer. If `expo-speech-recognition` is unavailable/denied, V1 **degrades gracefully** to today's exact behavior (pulse + amplitude + timer, no caption). This honors confirmation-first regardless of engine.

> Note: if the team does not want to add `expo-speech-recognition` for V1, the only honest option is to keep today's no-caption flow and add a single calm "transcribing…" shimmer. Do **not** fake a live caption by animating Gemini's final string word-by-word after the fact — that is dishonest latency theater.

---

## 1. Research — how the best apps do live transcription (2024–2026)

### Apple Siri / iOS Dictation
- **Where:** text streams **inline, directly into the destination field** (Messages, Notes), not a separate view. Dictation shows words rendering in near-real-time so users spot errors as they happen. ([TechCrunch — iOS 8 live dictation](https://techcrunch.com/?p=1032699))
- **Interim vs final / revision:** `SFSpeechRecognitionResult.bestTranscription.formattedString` is a **cumulative string re-adjusted on every iteration** — earlier words *do* get rewritten as confidence improves; `isFinal=true` marks the commit. ([SFSpeechRecognitionResult](https://developer.apple.com/documentation/speech/sfspeechrecognitionresult), [Better Programming](https://medium.com/better-programming/ios-speech-recognition-on-device-e9a54a4468b5))
- **Indicator:** an amplitude-reactive waveform/orb sits beside the growing text; on stop the text simply settles in place (no separate "commit" animation). On-device streaming model, low latency. ([WWDC25 SpeechAnalyzer](https://developer.apple.com/videos/play/wwdc2025/277/))

### Google Gboard voice typing / Assistant
- **Where:** inline at the cursor in whatever field has focus.
- **Interim vs final:** partial words appear immediately and **rewrite themselves** as the recognizer revises; punctuation is auto-inserted as you speak. Interim words are visually lighter/underlined until finalized. ([Gboard advanced voice typing](https://support.google.com/gboard/answer/11197787?hl=en))

### Google Live Caption / Live Transcribe
- **Where:** a dedicated continuous caption strip/region, **auto-scrolling** so newest text stays visible.
- **Styling:** real-time, on-device (works in airplane mode); newer "Expressive Captions" style tone via caps/elongation. Confirms the pattern of a **dedicated scrolling caption region** when there is no single text field to target. ([Android Accessibility Help](https://support.google.com/accessibility/android/answer/9350862?hl=en), [Expressive Captions](https://blog.google/products/android/google-android-expressive-captions/))

### Otter.ai
- **Where:** dedicated transcript pane. Interim words appear instantly then **firm up** (de-emphasis lifts) as the segment finalizes; transcript auto-scrolls. Real-time streaming. ([Otter transcription](https://otter.ai/transcription))

### ChatGPT voice (dictation) & WhatsApp — the contrast
- **ChatGPT dictation mode:** **NOT live** — it records, and only after you finish does it drop the transcript into the composer. ([Willow Voice — ChatGPT dictation](https://willowvoice.com/blog/voice-dictation-chatgpt-ai-prompting)) **This is exactly Echo's current architecture.**
- **WhatsApp:** voice notes are sent as audio; transcription (where available) appears as a separate block, not in the composer. Confirms that "record-then-transcribe" is a legitimate, widely shipped pattern when the priority is a clean final result over live feedback.

### Accessibility consensus
Interim text **flickers and rewrites** — announcing every revision to a screen reader is hostile. The web-standard pattern: hold the live region `aria-busy` while interim text churns, then announce **once** with `aria-live="polite"` when `isFinal` fires. In RN this maps to **not** firing `AccessibilityInfo.announceForAccessibility` on interim updates, announcing only the final settled string. ([MDN ARIA live regions](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions), [ARIA live module](https://bati-itao.github.io/learning/esdc-self-paced-web-accessibility-course/module11/aria-live.html))

### Pattern takeaways
1. Two placements exist: **inline-in-field** (Siri, Gboard — single target field) vs **dedicated scrolling caption region** (Live Caption, Otter — no single field / long-form).
2. Interim text is universally **de-emphasized** (lighter/translucent), and earlier words **are rewritten** — this is expected, not a bug.
3. The waveform/indicator lives **beside** the text and the text **auto-scrolls**.
4. On stop, the **final** result is what matters; interim is disposable preview.

---

## 2. Recommended Echo V1 placement: **DEDICATED live-caption area above the composer** (not inline-in-composer)

**Recommendation: a dedicated caption strip sitting directly above the input bar — NOT streaming into the `TextInput`.**

Why, judged against the hard constraints:

1. **Confirmation-first integrity.** Echo's contract (already in code: *"transcript lands in the composer for review; never auto-sends"*) means the composer holds **reviewable, authoritative** text. If interim words streamed *into* the `TextInput`, then on stop we must **replace** the OS interim string with Gemini's better string — overwriting whatever the user might have started editing, and fighting the keyboard/cursor. A dedicated caption area keeps the live preview and the editable truth cleanly separated: caption streams above, then **drops into the (still-empty, still-editable) composer once on stop.**
2. **Two-engine reality.** The on-device caption (Engine A) and the Gemini final (Engine B) are *different strings*. Showing the rough on-device stream inside the composer and then swapping it for Gemini's version would visibly rewrite the field — alarming. A separate strip lets the rough stream live where revision is *expected*, then the **clean** Gemini text is what arrives in the composer.
3. **Calm + revision tolerance.** Manglish makes the on-device recognizer revise a lot ("teh tarik" ↔ "the tariff"). Confining that churn to a clearly-labeled *preview* strip ("hearing you…") sets the expectation that it is provisional — the user does not panic, because the strip visibly is not their final message.
4. **It extends, not replaces, the existing LISTENING bar.** The current `recordingBar` (olive pulse dot + amplitude track + mm:ss + Cancel) stays exactly as is; the caption text grows in a region **right above** it. Minimal surgery to a working component.

Inline-in-composer is the right call only for single-engine OS dictation (Siri/Gboard). Echo is two-engine + confirmation-first, so dedicated wins.

---

## 3. Interim-vs-final text treatment (calm, no red, dark-mode tokens)

The caption strip renders **one growing paragraph** built from the cumulative recognizer string:

- **Finalized words** (segments already past with `isFinal`, or the stable head of the cumulative string): `C.textPrimary`, normal weight. Settled, trustworthy.
- **Interim tail** (the most recent, still-churning words): `C.textSecondary` at ~70% opacity, **no italic, no underline, no red**. Lighter = "still listening to this part." Matches Siri/Gboard de-emphasis using only calm tokens we already own.
- **Revision handling (the key calm move):** when the recognizer rewrites earlier words, **do not flash, strike-through, or color-flag the change.** Re-render the cumulative string with a **150ms cross-fade/opacity tween** on the changed tail so words *resolve* rather than *jump*. The user reads it as "Echo is settling on the words," never "Echo got it wrong." A subtle `LayoutAnimation.easeInEaseOut` on text height change keeps the strip from snapping.
- **Auto-scroll:** strip caps at ~3 lines (`maxHeight`), is a `ScrollView` from `react-native-gesture-handler` with `scrollToEnd({ animated: true })` on each update so the newest words stay visible (Otter/Live-Caption behavior). On tablet, cap strip width with `maxWidth` and center, per tablet rules.
- **Empty/first moment:** before any words, show calm placeholder copy in `C.textSecondary` — EN "listening… speak naturally" / BM "dengar… cakap je, relax" — so the strip is never an empty void.

```
┌──────────────────────────────────────────┐
│  ●  hearing you…                    0:07  │   ← existing recordingBar (olive pulse + amplitude + timer + ✕ cancel)
│  ▓▓▓▓▓▓░░░░░░  (amplitude bar)            │
├──────────────────────────────────────────┤
│  beli teh tarik kat mamak tadi  tiga       │   ← NEW caption strip
│  ringgit [lima]                            │      • settled words = C.textPrimary
│                                            │      • interim tail "[lima]" = C.textSecondary @0.7, cross-fades on revision
└──────────────────────────────────────────┘
[ 📷 ] [ 🖼 ] [  composer (empty, editable)  ] [ ◼ stop ]
                          ▲ Gemini's clean final text drops in HERE on stop
```

---

## 4. State-machine extension (extends, does not replace, current states)

Current observable states in `MoneyChat.tsx` / `useVoiceInput.ts`: `idle → isRecording → isTranscribing → (text in composer) | voiceError`.

V1 inserts the caption layer **inside** `isRecording` and adds an explicit settle step:

```
IDLE
  └─ tap mic ─▶ LISTENING (isRecording = true)
        existing: olive pulse dot + amplitude track + mm:ss timer + Cancel  ← UNCHANGED
        NEW: start expo-speech-recognition (interimResults:true) in parallel with expo-audio capture
        NEW: caption strip visible; each result event updates cumulative string
             - settled head  → C.textPrimary
             - interim tail   → C.textSecondary @0.7, 150ms cross-fade on revision
             - auto-scroll to end
        ─ tap ✕ Cancel ─▶ IDLE   (stop BOTH engines; discard caption; no Gemini call; no quota — existing cancel contract)
        ─ tap ◼ Stop  ─▶ SETTLING
  SETTLING (isTranscribing = true)
        - stop on-device recognizer; freeze last caption (all words → C.textPrimary, calm)
        - stop expo-audio; send clip to Gemini (existing path) — authoritative text
        - strip shows calm "tidying up…" / "kemas sikit…" (reuse voiceTranscribing copy)
        ─ Gemini returns ─▶ COMMIT
        ─ Gemini fails ─▶ FALLBACK: drop the FROZEN on-device caption into composer instead
                          (better than losing the user's words), then voiceError "network" as today
  COMMIT
        - caption strip collapses (fade out)
        - final text written to composer TextInput (input state), editable, NOT sent
        - announceForAccessibility(finalText)  ← single announcement
        - cursor at end; user reviews → edits → taps Send (existing confirmation-first flow)
        ─▶ IDLE
ERROR (permission / no-speech / quota / network / generic)
        - unchanged calm bronze notice (never red); if on-device denied, LISTENING runs with NO caption (today's behavior)
```

Degradation matrix:
- on-device recognizer **denied/unavailable** → LISTENING shows no caption strip (exactly today's UX); Gemini still produces final text. Echo never blocks.
- Gemini **fails** but on-device caption captured words → drop frozen caption into composer (lossless), show calm retry.
- **Quota** exhausted (Gemini) → gate at `startRecording` as today (never ask user to speak when we can't finalize).

---

## 5. Accessibility

- **Do NOT announce interim flicker.** Mirror the web `aria-busy` pattern: while `isRecording`, the caption strip is a live region kept silent (no `announceForAccessibility` on interim updates). Announce **once** in COMMIT with the final string. ([MDN ARIA live regions](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions))
- Caption strip: `accessibilityLiveRegion="none"` during LISTENING (RN equivalent of busy); the composer's settled value is what VoiceOver/TalkBack reads after COMMIT.
- Mic/Stop button keeps existing `accessibilityState={{ selected: isRecording, busy: isTranscribing }}` and label swap (voiceStart/voiceStop). Cancel keeps its label.
- **Tap targets:** Stop and Cancel stay ≥44pt (current `sendButton` size + `hitSlop`). Caption strip is non-interactive (scroll only) so no tap-target burden.
- **Reduce Motion:** if `AccessibilityInfo.isReduceMotionEnabled`, drop the 150ms cross-fade and `LayoutAnimation` — interim tail just updates instantly (still de-emphasized by color, so meaning preserved without motion).
- Dark mode: all colors via `C` tokens (`useCalm()`); interim tail uses `C.textSecondary` at 0.7 alpha via `withAlpha`, never a hardcoded grey, so it reads correctly on `CALM_DARK` surfaces.

---

## 6. Copy (EN + casual BM, add to `i18n/en.ts` + `ms.ts`)

| key | EN | BM (casual) |
|---|---|---|
| `voiceListening` (exists) | hearing you… | dengar… |
| `voiceCaptionPlaceholder` | speak naturally | cakap je, relax |
| `voiceTranscribing` (exists) | tidying up… | kemas sikit… |
| `voiceCaptionHint` | this is a preview — you can edit after | ni preview je — boleh edit lepas ni |

Tone per project memory: relaxed/gen-z BM (`je`, `relax`, `lepas ni`), not textbook. The "preview — edit after" hint is the single most important calm signal: it tells the user the churning text is provisional, so revision never alarms.

---

## 7. Summary for implementers

- **Add `expo-speech-recognition`** (on-device) for the live caption; **keep Gemini** as the authoritative finalizer. Two engines, one truth.
- **Dedicated caption strip above the composer**, not inline. Streams interim (`C.textSecondary` @0.7, cross-fade on revision) over settled (`C.textPrimary`); auto-scrolls; caps at 3 lines; tablet `maxWidth`.
- **Drops into the empty, editable composer on stop** — never auto-sends (confirmation-first preserved).
- **Extends** the existing olive pulse + amplitude + timer + Cancel bar; the LISTENING indicator is unchanged, caption grows above it.
- **Graceful degradation** to today's exact no-caption flow if on-device recognition is denied/unavailable.
- **A11y:** announce final only, never interim; respect Reduce Motion.

## Sources
- Apple — [iOS 8 live dictation visualization (TechCrunch)](https://techcrunch.com/?p=1032699); [SFSpeechRecognitionResult](https://developer.apple.com/documentation/speech/sfspeechrecognitionresult); [On-device speech recognition (Better Programming)](https://medium.com/better-programming/ios-speech-recognition-on-device-e9a54a4468b5); [WWDC25 SpeechAnalyzer](https://developer.apple.com/videos/play/wwdc2025/277/)
- Google — [Gboard advanced voice typing](https://support.google.com/gboard/answer/11197787?hl=en); [Live Caption (Android Accessibility)](https://support.google.com/accessibility/android/answer/9350862?hl=en); [Expressive Captions](https://blog.google/products/android/google-android-expressive-captions/)
- Otter — [Real-time transcription](https://otter.ai/transcription)
- ChatGPT/WhatsApp contrast — [Willow Voice — ChatGPT dictation is record-then-transcribe](https://willowvoice.com/blog/voice-dictation-chatgpt-ai-prompting)
- RN/Expo streaming — [expo-speech-recognition (jamsch)](https://github.com/jamsch/expo-speech-recognition); [npm](https://www.npmjs.com/package/expo-speech-recognition); [Bitcot PoC guide](https://www.bitcot.com/voice-to-text-capture-in-react-native-new-architecture-using-expo-speech-recognition/)
- A11y — [MDN ARIA live regions](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions); [ARIA live module](https://bati-itao.github.io/learning/esdc-self-paced-web-accessibility-course/module11/aria-live.html)
