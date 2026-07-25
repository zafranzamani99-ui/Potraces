# REMOTION_KNOWLEDGE — field notes for promos in `remotion-promo/`

Everything learned building CollectzPromo, EchoPromo, DebtPromo ("Paper").
Read this first; you can be productive immediately. Canonical reference docs are
vendored from remotion-dev/skills in `.skills/` (SKILL.md, timing, transitions,
audio, voiceover, sfx, text-highlights, light-leaks, 3d, effects) — consult those
for API detail; this file is what actually worked here.

Format: vertical **1080×1920, 60fps** for all current promos. Palette comes from
the app: `src/theme.ts` — `L` (light, one olive accent `#4F5104`) and `C` (dark).

---

## 1. Golden rules — frame determinism

The renderer evaluates each frame in isolation. Anything time- or randomness-
based outside the frame function breaks renders.

- **No CSS `transition` / `animation`, no Tailwind animate classes.** They run on
  wall-clock, not the frame clock — output is wrong or flickers.
- **No `setTimeout` / `setInterval` / `Date.now()`** for motion. Drive everything
  from `useCurrentFrame()`.
- **No `Math.random()`** in render. Use Remotion's seeded `random('string-seed')` —
  same seed → same value every frame, every render:

```tsx
// src/debt3/ktype2.tsx — per-word personality, deterministic
const r1 = random(`k2${word}${i}`);   // 0..1, stable
const damping = 13 + r1 * 2;
const stiffness = 150 + r2 * 40;
// src/debt3/scenes.tsx — confetti burst: random(`la${i}`), random(`lv${i}`), …
```

- **`interpolate()` + `Easing.bezier()` is the default tool; `spring()` for organic
  arrivals.** Official guidance prefers interpolate; in practice this project uses
  springs for element entrances (they need no duration and read `fps` from context)
  and interpolate for anything with a hard in/out window (exits, sweeps, swaps,
  progress).
- **Enter = ease-out, exit = ease-in.** Arrive with momentum, leave with gravity:
  - enter `Easing.bezier(0.16, 1, 0.3, 1)` (fast start, decel into place)
  - exit `Easing.bezier(0.5, 0, 0.75, 0)` (slow start, accelerate away) — used by
    every `outAt` exit in KType2/Slam.
- **fps-independent timings.** Pass `fps` from `useVideoConfig()` into `spring()`;
  express real durations as `seconds * fps` or beat multiples (§5). Never hardcode
  "this looks right at 60fps" frame counts for physics.

---

## 2. Project layout

```
src/Root.tsx        composition registry — every comp needs a UNIQUE id
src/theme.ts        L (light) / C (dark) palettes pulled from the app
src/font.ts         INTER stack
src/motion.tsx      v4/v6 kit: Rise, MaskRise, PushIn, TypeText, CountUp, Backdrop, Caption
src/fx.tsx          old dark fx library (Ripple, TapDot, DigitRoll…) — reference only
src/debt3/          current promo kit: fx.tsx (ShotCard…), ktype2.tsx, scenes.tsx, DebtSound.tsx
src/echo/           Echo promo kit (Orb, GlowType, Chip, StreamText…)
src/<Name>Promo.tsx one file per promo = Series of act components
scripts/            audio + VO generators (pure Node, no deps)
public/             screenshots, generated .wav/.mp3 — reference via staticFile()
.skills/            vendored official remotion-dev/skills docs
```

`Root.tsx` registers `<Composition id="DebtPromo" durationInFrames={2200} fps={60}
width={1080} height={1920} />`. Duplicate ids fail the bundle. The CLI target of
`render`/`still` is this id.

### Series vs Sequence vs TransitionSeries

- **`<Series>`** — acts play back-to-back; inside each act the frame counter
  restarts at 0. All three promos structure acts this way (see `DebtPromo.tsx`).
  Total duration = plain sum of `durationInFrames`.
- **`<Sequence from durationInFrames>`** — delay/limit an element *within* a scene.
  A Sequence is an `AbsoluteFill` by default; add `layout="none"` for inline flow.
  Inside a Sequence, `useCurrentFrame()` is re-zeroed — all local timings
  (`delay`, `outAt`) are scene-local. This is why scenes are individually
  re-timeable: move the `from`, internals don't change.
- **`<TransitionSeries>`** (`@remotion/transitions`, installed) — like Series but
  transitions **overlap** neighbours, so:

```
total = Σ(sequence durations) − Σ(transition durations)   // overlays add nothing
// 60 + 60 with a 15f transition = 105, not 120
```

Use it when scenes should crossfade/slide/wipe instead of hard-cut. A useful
pattern for phone-screen content: **nest a TransitionSeries inside a device mock**
so the app screens swap with transitions while the device frame stays put. Current
promos don't use it yet — they hand-roll swaps with a shared `swap` progress (see
`Snap` in `src/debt3/scenes.tsx:44`: outgoing scales 1→0.96 + rises, incoming
rises in, both driven by one interpolate over `[190, 218]`).

---

## 3. Motion recipes actually used

File refs are the canonical implementation — copy, don't reinvent.

| Recipe | Where | Core move |
|---|---|---|
| Masked word rise | `motion.tsx:52` (MaskRise), `debt3/fx.tsx:205` (KType) | word in `overflow:hidden` span, `translateY(112–115% → 0)` per-word spring, line tracks in `0.05em → 0` + scale 1.03→1 |
| Per-word kinetic | `debt3/ktype2.tsx:25` (KType2) | masked rise **+ de-rotate ±5° alternating + de-blur 7px + scale 1.18→1**, per-word spring variance via seeded `random()`; exit = reverse-staggered (last word out first, ~14f) |
| Slam strike-in | `ktype2.tsx:98` | scale **1.7 → 0.97 over 10f** hard-out bezier + blur 18→0, then 2f settle 0.97→1; textShadow fades in after |
| Char cascade | `ktype2.tsx:179` (Chars) | per-char rise 0.9em, punchy spring `damping:11, stiffness:210`, sign-off only, no exit |
| Block reveal / wipe | `debt3/fx.tsx:175` (Underline) | SVG path `strokeDasharray = len`, `strokeDashoffset = len*(1−p)` — draws itself; same trick for the settled check (`scenes.tsx:181`) and progress rings |
| Ken Burns push | `debt3/fx.tsx:72` | `scale(1.03 + push*p) translateY(-10*p)`, `p = frame/durationInFrames`, origin `50% 42%` |
| PushIn moving hold | `motion.tsx:107` | wrap any held shot: `scale(1 + 0.032*p)` over its whole Sequence — the frame never dies |
| Tap ripple | `fx.tsx:367` (Ripple, dark kit) | 4 concentric rings, period 50f staggered, scale 0.3→2.1, opacity 0→0.3→0; `fx.tsx:551` TapDot for a single tap marker |
| Light sweep | `debt3/fx.tsx:277` (SweepL) | skewed white/olive band crosses the frame at a cut, 22f, blur 8, `zIndex:90`, `pointerEvents:none` |
| CountUp | `motion.tsx:146` | spring-driven number, `fontVariantNumeric:'tabular-nums'` so digits don't jiggle |
| Progress ring | `AppScreens.tsx:355` | `<circle>` `strokeDashoffset={R*(1−pct)}`, `transform="rotate(-90 …)"` to start at 12 o'clock |
| Callout Ring | `debt3/fx.tsx:143` | spring `damping:16, stiffness:160`, scale 1.25→1, gentle sin pulse after 20f; coords in card space |

Recurring idiom — **one normalized progress, many derived props**: compute
`const p = interpolate(frame, [a, b], [0, 1], {easing, clamp})` once, then map p
to x/opacity/blur separately. Timing stays single-sourced.

---

## 4. Screenshot storytelling — ShotCard + the drift bug

`ShotCard` (`src/debt3/fx.tsx:61`) presents real app screenshots (`public/`,
originally from `assets/website jejakbaki/`) as tilted floating cards:
`perspective:1500` wrapper → card div with `rotateY(-7°) rotateX(2°)` + spring
enter → inner Ken Burns div holding `<Img>` **and all overlay children**.

**The bug class that cost real time:** any CSS `transform` creates a *new
containing block* for absolutely-positioned descendants. If a callout (Ring,
Underline, ScanLine) is placed as a sibling of the transformed image — or in any
ancestor outside the Ken Burns transform — it positions against a different
coordinate space. The screenshot slowly scales/translates; the callout doesn't.
Result: callouts drift off the region they annotate as Ken Burns runs.

**Fix (already in ShotCard — keep it):** overlays are passed as `children` and
rendered *inside the same transformed div as the `<Img>`* (`fx.tsx:89–99`). They
inherit the exact Ken Burns motion, so they stay glued to the screenshot pixels.

```tsx
<ShotCard src="debts.png" ry={6}>
  <Ring at={86} x={302} y={192} w={284} h={158} />   {/* card coords */}
</ShotCard>
```

**Measuring callout coords:** screenshots are 1179×2556, cards are `SHOT_W=604 ×
SHOT_H=1309` (scale ≈ 0.512). Measure the target rect on the original screenshot,
multiply by 0.512, drop into `x/y/w/h`, then nudge by eye with stills. Scene
comments keep the provenance: `/* orig x599–1135 y385–675 */` (`scenes.tsx:145`).

---

## 5. Audio — synth, mix grid, beat-locking

### Pure-Node WAV synthesis (`scripts/generate-debt-audio.mjs`)

No deps, fully deterministic — re-run any time, identical bytes:

- **Seeded LCG noise:** `let seed = 424242; rnd = () => ((seed = seed*1103515245+12345 & 0x7fffffff)/0x7fffffff)*2-1`.
- **writeWav:** hand-built 44-byte RIFF header, 16-bit PCM mono 44.1kHz, normalize
  to `0.7079/peak` before quantizing (consistent loudness across files).
- **One-pole lowpass:** `y += a*(x−y)` with `a = 1−exp(−2π·fc/SR)`; `fc` can be a
  function of time → filter sweeps (whoosh = noise through a falling lowpass,
  riser = noise through a rising one).
- **Envelopes:** `exp(-t*k)` decays for percussive hits; `sin(π·t^0.55)` for
  whoosh swells; `min(1, t/attack)` for click-free onsets.
- **Music bed:** chord pads (Am→F→C→Em, 8 beats each, detuned pairs + slow LFO
  shimmer), sub kick on beats 1 & 3.5, clap on 3, offbeat hats, sparse arp
  entering at 8s; whole mix through a final 3800Hz lowpass for the "moody" roll-off.

### Mix grid (`src/debt3/DebtSound.tsx`)

One component owns all audio. Conventions:

- Music bed at 0.30 with frame-interpolated fades:
  `volume={(f) => interpolate(f, [0, 36, 2140, 2198], [0, 0.3, 0.3, 0], {clamp})}`
  — note `f` is zeroed at the *Sequence* start, not the comp start.
- Every SFX/VO cue is `<Sequence from={at}><Audio …/></Sequence>` — tables of
  frame numbers at the top of the file (`VO`, `WHOOSH`, `POPS`, `TAPS`).
- Whoosh starts 6f *before* the cut (`from={at-6}`) so it peaks on the cut.
- Alternate SFX volume per occurrence (`i % 2 ? 0.32 : 0.25`) so repeats don't sound canned.

### Beat-locking

```
frames-per-beat = fps * 60 / BPM        // 60fps, 84 BPM → 42.857f
```

Everything lands on beat multiples: act cuts at beats 7/16/29/36/42 → frames
300/686/1243/1543/1800; VO starts (beat 0.5, 3.5, 8, 11.5…); callout hits; SFX.
Comment the beat grid in the sound file and the comp header (`DebtPromo.tsx:7`,
`DebtSound.tsx:4`) — when you retime one act, re-derive every dependent cue from
the grid, don't eyeball it.

---

## 6. Voiceover pipeline (ElevenLabs)

Scripts: `generate-vo.mjs` (Collectz), `generate-debt-vo-el.mjs` (Debt, "Daud M"),
`generate-echo-vo.mjs`. Same pattern:

- **env loading without dotenv** — tiny regex parser reads `remotion-promo/.env`
  first, then repo-root `.env`; never overrides already-set vars:

```js
for (const envPath of [join(root, '.env'), join(root, '..', '.env')]) {
  if (!existsSync(envPath)) continue;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
```

  Keys: `ELEVENLABS_API_KEY` + `VOICE_ID` (or `DAUD_VOICE_ID`).
- **Attempt fallbacks** — Malay works best on v3 with a language hint; 4xx means
  "model/param unsupported → next attempt", 5xx is a real error:

```js
const ATTEMPTS = [
  { model_id: 'eleven_v3', language_code: 'ms', voice_settings: { stability: 0.5 } },
  { model_id: 'eleven_v3', voice_settings: { stability: 0.5 } },
  { model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2 } },
];
```

- Output → `public/dvo-XX.mp3`; CLI filter regenerates single clips:
  `node scripts/generate-debt-vo-el.mjs 04 07`.
- **Split long lines into their own clips** — no clip may outrun its beat.
- **Measure real durations with `afinfo`** (macOS built-in), then place starts on
  the beat grid with breathing room:

```bash
afinfo public/dvo-01.mp3 | grep "estimated duration"   # → 4.911020 sec
```

- **Clarity-first spacing:** gap clips generously (see `VO` table in
  `DebtSound.tsx` — ~2–4s lines, starts spaced 100–300f apart). A pause reads as
  confidence; wall-to-wall VO reads as a demo reel.

---

## 7. Render & QA workflow

```bash
npm run dev                 # Remotion Studio — scrub live
npx remotion still DebtPromo frames/snap.png --frame=343   # one frame, layout check
npm run render:debt         # full render → out/debt-promo.mp4
```

Extract an exact frame from the rendered mp4 with the ffmpeg bundled in
node_modules (needs `DYLD_LIBRARY_PATH` for its dylibs):

```bash
DYLD_LIBRARY_PATH=node_modules/@remotion/compositor-darwin-arm64 \
  node_modules/@remotion/compositor-darwin-arm64/ffmpeg \
  -i out/debt-promo.mp4 -ss 11.43 -frames:v 1 frames/check.png
# (-ss after -i = frame-accurate decode; time = frame/fps)
```

**IMPORTANT — phantom bug class:** the in-tool video previewer **frame-blends at
hard cuts**, showing ghost overlaps (two scenes double-exposed) that do not exist
in the actual render. Before "fixing" any suspicious overlap, extract that exact
frame with the ffmpeg command above and look at the real pixels. Multiple
non-bugs were almost "fixed" this way. Rule: ghost seen in previewer → verify
with ffmpeg first; only then touch code.

---

## 8. Tuning cheatsheet (numbers that shipped)

**Easings** (`Easing.bezier`):
- `0.16, 1, 0.3, 1` — crisp UI enter (strong ease-out, no overshoot). Default for entrances.
- `0.45, 0, 0.55, 1` — editorial ease-in-out (ScanLine travel, slow fades).
- `0.34, 1.56, 0.64, 1` — playful overshoot. Sparingly.
- `0.65, 0, 0.35, 1` — smooth sweep/swap (SweepL, shot swaps, Underline draw).
- `0.5, 0, 0.75, 0` — ease-in exit. Every `outAt` uses this.

**Springs** (`{damping, stiffness}` @60fps):
- Cards / ShotCard enter: `24, 100` · chips landing: `13, 170`
- Callout Ring: `16, 160` · per-word KType2: `13–15, 150–190` (seeded variance)
- Char cascade: `11, 210` · whole-line settle: `26, 90` · gentle Rise: `30` (damping only)

**Durations:**
- Acts: 257–557f (4.3–9.3s); full promo 25–37s. Hook ≤ 5s.
- Caption hold: `outAt = durationInFrames − 14/16` (auto-exit before Sequence ends) — nothing ever gets hard-cut.
- SweepL: 22f · Slam strike: 10f + 2f settle · tap SFX window: 8f · word stagger: 3–8f · chip stagger: 10f (¼-beat cascade).

---

## 9. Gotchas log

- **npm scripts that exist** (`package.json`): `dev`, `render` (Collectz),
  `render:debt`, `render:potraces`, `vo`, `debt-vo`, `debt-audio`, `sfx`,
  `echo-sfx`, `echo-vo`. There is no `render:echo` — use
  `npx remotion render EchoPromo out/echo-promo.mp4`.
- **`.env` must be exactly `.env`** in `remotion-promo/` (or repo root) — a file
  named `env` is silently ignored by the loader and you get the confusing "Need
  ELEVENLABS_API_KEY" exit even though you "created the file".
- **esbuild loader errors point at the real line** — when the bundle fails with a
  syntax error, trust the reported file:line; it's accurate, not a downstream
  symptom. (A stray `<` in a comment, an unescaped `&`, etc.)
- **Composition ids must be unique** in `Root.tsx`; the id is also the CLI target.
- **`AbsoluteFill` / transform containing-block traps:** `AbsoluteFill` is
  `position:absolute` — children with `position:absolute` anchor to the nearest
  positioned *or transformed* ancestor, which may not be the one you think
  (see §4). `<Sequence>` is an AbsoluteFill by default — `layout="none"` for
  inline content.
- **Every element exits.** Animating `outAt` before the Sequence ends is a house
  rule; hard cuts on mid-screen text look broken even when they technically aren't.
- **Keep beat-grid comments in sync.** Comp header (`DebtPromo.tsx:7`) and sound
  file (`DebtSound.tsx:4`) both carry the beat map — after retiming, update both
  or the next session will retime from a stale map.
- `toneFrequency` (pitch) only works in renders, not Studio preview — don't
  "debug" it in Studio.
- README has a duplicated DebtPromo bullet block — the first copy (with
  `KType2`/`Slam` listed) is the current one.

## Live-collaboration collisions (hit 2026-07-25)
- The user edits the project in parallel (often via a second agent). Before
  rebuilding an audio grid or re-reading a "known" file, re-check mtimes:
  `stat -f "%Sm %N" <files>` and `find src scripts public -newermt "<time>"`.
  A VO script changed under me mid-edit; the mp3s in `public/` were the only
  reliable source of truth (afinfo durations + file times).
- When the user rewrites VO lines, treat their mp3s as the contract and adapt
  visuals to them — never regenerate their clips to fit your visuals.
- Appending segments to a shared generator script: re-read right before
  editing; duplicates happen when two editors add the same ids.

## Before/after screen states (settle pattern)
- One screen component, `mode` prop: `pending` (In-delayed entrance) vs
  `settle` (everything visible immediately, keyframed mutations: strike
  scaleX sweeps, pill count flips with a pop spring, subtitle swap +
  Underline draw). Two scenes render the same component with different
  modes — cut covered by SweepL, reads as a state change, not a scene change.
- Emphasis marks stay consistent: one `Underline` component (dash-draw) used
  for every key number (RM 129.60, RM 316.00, RM 60.00 collected).

## v7 lessons (2026-07-25)
- Scribe STT (POST /v1/speech-to-text, model_id=scribe_v1) is a usable accent
  check: language_code + language_probability per clip — but on short rojak
  clips the language detector is noisy (Malay clips flag ind/eng/spa at
  0.2-0.5). Trust the TRANSCRIPT (word fidelity), not the lang tag. Brand
  names ("Potraces") always transcribe as "port/poor traces" — that's Scribe's
  vocab gap, not necessarily mispronunciation.
- ElevenLabs v3 reads digits slowly and pauses hard on dashes/commas: spell
  numbers as Malay words ("lima puluh tiga ribu") and fix residual slowness
  with ffmpeg `-af atempo=1.25-1.45` (keeps pitch, kills pauses). Check
  afinfo duration of EVERY generated clip before laying it in a grid.
- Receipt/prop math gets screenshotted: visible line items + a "+ N more
  items X.XX" row must sum exactly to the printed TOTAL.
- White-on-white photo panels need the fade to complete BEFORE any
  high-contrast vertical in the photo, or the seam reads as a hard edge —
  extend gradient stops (~72%) and use objectPosition per photo.
- NBSP between "RM" and amounts everywhere — big bubbles orphan "RM" at
  line ends otherwise. `replace_all` "RM " → "RM " is the cheap fix.
- Same-name heading + nav title duplication ("Receipts" over "Receipts")
  reads as a bug — one title per screen.
