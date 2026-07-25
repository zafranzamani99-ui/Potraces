# Debt Promo — audio × display rules (learned from user corrections)

Living document. Every rule here was corrected by the user the hard way —
do NOT regress them. Update this file whenever the user corrects something new.

## The rules (non-negotiable)

1. **Voice finishes inside its own scene.**
   A clip's *speech end* must land before the scene's end frame — never cut
   to the next scene mid-sentence. No J-cuts unless the user explicitly
   approves them.
2. **No speech-on-speech.** Clips are chained with ≥6 frames (~100 ms) of
   *real* silence between one clip's speech end and the next clip's speech
   start. Roll-call energy comes from tight *visual* cadence, not from
   overlapping voices.
3. **Display leads, voice confirms.** The text/row lands first; the voice
   starts a few frames later (eye sees it, ear verifies it). Never let the
   voice run ahead of what's on screen.
4. **Nothing new appears while a line is still being spoken.**
   The collapse/total/next display waits for the current line's speech end
   (plus a small buffer).
5. **Measure, don't assume.** ElevenLabs clips have ~0.05–0.3 s padding —
   *not* enough to hide overlaps. Always measure real speech bounds
   (RMS over 20 ms windows, 12% of peak) before placing a cue. See
   `scripts/` QA snippets; never eyeball file durations.
6. **Never time-stretch the voice.** The ×1.10 librosa phase-vocoder pass
   warbled the VO (metallic edge) and the user heard it instantly. Tempo
   comes from the bed BPM + tight cueing + visual pacing — the voice takes
   stay natural. If a line must be faster, regenerate it with a faster
   *read*, don't stretch it.
7. **Font arrival = classic MaskRise** (masked word-rise, `Rise` in
   `src/debt4/type.tsx`). No BlockReveal highlighter bars — user called the
   result "berterabur".
8. **Every visual change gets pixel QA** — stills of every beat, checked
   before render, plus a full-render audio pass.

## Approved VO script (user's copy, verbatim)

| clip | line | beat |
|---|---|---|
| dvo-01 | Aiman hutang 30 ringgit. | hook row 1 (tiket bas) |
| dvo-02 | Zikri hutang makan. | hook row 2 |
| dvo-03 | Mohsin hutang 50 ringgit. | hook row 3 (pinjam semalam) |
| dvo-04 | Track semua hutang. | total slam RM 140 |
| dvo-05 | Ingat barang. Ingat harga. Ingat orang. | the turn — ONE flowing clip; the intonation arc is the point (user rejected 3 flat isolated reads) |
| dvo-06 | Makan keluar? Snap je resit tu. | scan |
| dvo-07 | AI baca semua. Total, items, siap kira. | result |
| dvo-08 | Split ikut kepala, sama rata — semua boleh. | split |
| dvo-13 | Terus jadi hutang masing-masing. | splits overview |
| dvo-09 | Malas nak kejar boleh, tapi jangan malas nak track — nanti halal je hutang tu. | THE BLACK INTERRUPT |
| dvo-10 | Remind dari sini — terus masuk WhatsApp, siap QR bayaran. | remind |
| dvo-14 | Dia bayar — terus collected. | settle |
| dvo-11 | Share sama-sama Netflix? Track kat sini jugak. | shared |
| dvo-12 | Hutang. Track dulu. Settle. | finale (+ Muat turun percuma badges) |

Copy notes (user decisions):
- Hook = 3 rows only: aiman RM 30 tiket bas · zikri RM 60 makan ·
  mohsin RM 50 pinjam semalam → total **RM 140**. Rapid-fire rows
  (~1.2s apart) with a notification ping each; VO names chain behind.
  Beat stop into the slam, boom on RM 140.
- Direction is always "they owe YOU" — mohsin's line was fixed from
  "bayar dulu semalam" to "Mohsin hutang 50 ringgit." for exactly this.
- ONE money story: debts RM 140 + splits RM 316 = **RM 456 Owed to You**
  (TrackHome tile, big). You Owe stays small (RM 40). Settle counts
  456 → 396 as zikri's RM 60 gets collected. Don't invent other totals.
- The halal line is a **pattern interrupt** (user's best line): cut to
  black, music dies, white text only — "Malas nak kejar, okay. /
  Malas nak track? / nanti halal je hutang tu 😭" — then ~0.3–0.5s of
  true silence before the bed returns for Remind.
- Turn copy: "Ingat barang. Ingat harga. Ingat orang sekali." (user
  vetoed both "Lain orang…" AND the trimmed "Ingat orang." — keep
  "orang sekali").
- Split VO is the short one: "Split ikut kepala ke, sama rata — semua boleh."
- Remind must SAY WhatsApp out loud: "…terus masuk WhatsApp, siap QR bayaran."
- Finale carries the CTA: "Muat turun percuma" + App Store / Google Play
  badges (Apple logo as inline SVG — the  glyph does NOT render in
  headless Chrome).
- No grabfood, no faiq, no myvi, no mira.

## QA process (run all three, every render)

1. **Overlap check** — speech windows from measured bounds + cue map;
   assert silence between consecutive clips.
2. **Containment check** — every clip's speech end < its scene end frame.
3. **Pixel check** — stills at every beat (hook rows, total, turn, each
   scene mid-state, finale) at full res when text is involved.

## Corrections log

- **v3 → v4**: "derailing, not tele" — empty first frames, tiny floating
  card, VO ahead of display, 84 BPM too slow. Fix: zoom ×1.2, 100 BPM,
  hook rebuilt as person×debt roll-call.
- **v4 → v4.1**: "sumpah berterabur… font arrival animation tukar, buat
  mcm dulu je" — BlockReveal bars removed → classic MaskRise; VO re-cut
  calmer (stability 0.62, no speed); display-leads-voice cueing.
- **v4.1 → v5**: "just show 3… mira i dont what it is talking… where is
  'halal je hutang tu nanti'… 'lain orang lain hutang satu app' feels off"
  — 4 rows → 3 (mira dropped), halal line restored, turn reverted to
  "Ingat barang…".
- **v5 → v6**: user copy dictation (aiman tiket bas RM 30 / zikri hutang
  makan / mohsin bayar 50 dulu semalam / "track semua" at slam / new
  split·track·shared lines / "Hutang. Track dulu. Settle." finale).
- **v6 (audio pass 1)**: "collide 1 and 2 and 3 isnt fast, another display
  coming up. your QA is bad" — clips were chained on file durations with
  assumed padding → real 0.7 s speech-on-speech. Fix: measured speech
  bounds, chained with real gaps; total waits for last name.
- **v6 (audio pass 2)**: "display fast, voice not finish u already move
  to next scene" — dvo-05 (turn) & dvo-06 (scan) & dvo-09 (track) spilled
  past their scene ends. Fix: every clip re-cued so speech ends inside its
  scene; scene lengths rebalanced.
- **v6 (audio pass 3)**: "track hutang > track semua hutang" +
  "the intonation i like previous, current is bored" — dvo-04 reworded to
  "Track semua hutang."; the turn went back to ONE flowing clip (the
  3-clip split sounded flat — the arc is the point). dvo-04/05 generated
  with expressive overrides (`stability 0.5, style 0.3` via per-segment
  `vs`). Ids 15/25 retired.
- **v6 (tempo pass, REVERTED)**: ×1.10 librosa stretch — "the voice over
  sound feel weird, do u speed up the video with the voice over?" Yes, and
  it was a mistake: phase-vocoder artifacts on speech. Reverted to the
  natural mp3 takes; .wav stretch files deleted. Kept the good parts:
  108 BPM groove, broadcast ducking, dead-air fix, tight cueing. New
  rule #6. Comp 2400→2440 (40.7s), hook 600→640, result sub +8f.
- **v7 (critique round)**: scene 3 direction fixed ("Mohsin hutang 50
  ringgit." — "X hutang kau" pattern holds); one money story (140 + 316 =
  RM 456 big, You Owe small, settle counts 456→396); the halal line
  became a BLACK INTERRUPT (music cut + silence); split VO shortened
  ("Split ikut kepala…"); turn trimmed to the parallel triple ("…Ingat
  orang."); remind says WhatsApp out loud; finale got the CTA badges.
  Hook rows went rapid-fire (8/80/152) with notification pings + a beat
  stop into the RM 140 slam (bed cuts, boom hits, bed returns). Comp
  2440→2575 (42.9s).
- **v7.1 (pace round)**: "this screen take 6 s? make it 3.6… VO too slow…
  make sure next scene then next VO start" + "where ingat orang sekali?" +
  "Split ikut kepala ke…" — (1) roll-call VO re-cut to rapid one-breath
  reads ("Aiman, 30 ringgit." / "Zikri, makan." / "Mohsin, 50 ringgit."),
  chained ~0.2s apart; rows at 6/66/126 (~1s) with pings; **pile collapses
  at frame 216 = 3.6s on the dot**, mohsin's name resolving over the
  collapse (intentional — user's "scene first, VO after"). (2) "Ingat
  orang sekali." RESTORED (user asked for it back — his earlier
  "grammatically awkward" note is superseded). (3) dvo-08 reworded with
  the "ke": "Split ikut kepala ke, sama rata — semua boleh." Hook
  640→530, comp 2575→2465 (41.1s).
- **Comp split**: `DebtPromo` comp/file now hosts the v7 problem→tour
  video (debt5/, dvo-16…24). The debt-tracking video moved to
  **`HutangPromo`** (`src/HutangPromo.tsx`, comp id `HutangPromo`,
  `npm run render:debt` → `out/debt-promo.mp4`). Don't merge them back.

## Process warnings

- **Parallel sessions edit this project.** `src/debt4/*`, `Root.tsx`,
  `README.md`, and this VO generator have all been changed mid-flight by
  another session. Before editing: re-read the file. Keep edits small.
  If your old_string fails, re-read — the file moved.
- dvo ids **16–24 belong to the v7 problem→tour video** ("Enam belas
  muflis setiap hari." etc.) — never reuse them for HutangPromo;
  generating them would clobber the other video's voiceover.
