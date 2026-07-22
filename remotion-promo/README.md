# Potraces promo videos (Remotion)

Vertical 1080×1920. Palettes come from the app (`src/theme.ts`).

## CollectzPromo — v4 (the main one) · 25s · **60fps** · light / minimalist

Anti-slop rebuild. Rules it obeys:
- **Light / white-gradient** background (`Backdrop` in `src/motion.tsx`).
- **One accent** — olive `#4F5104`. No gold/bronze, no shimmer, no confetti.
- **One motion** — a slow soft fade-up (`Rise`). Nothing else.
- **One caption per beat**, fixed position, calm.
- Real Collectz screens redrawn clean in **light mode** (`src/AppScreens.tsx`),
  all sharing one card geometry so beat cuts read as the same device updating.

Acts: **Hook** (pain, 0–4s) → **Organizer** (paste WhatsApp → form autofills →
Create → share code, 4–12s) → **Participant** (claim name → RM 12 + QR → upload
proof → Payment confirmed, 12–22s) → **Sign-off** (22–25s).

Copy is verbatim from `src/i18n/en.ts`; captions are rojak.

### Swap in real screenshots
Each screen in `AppScreens.tsx` is a self-contained component with fixed
680×1280 geometry. Drop a real light-mode screenshot in `public/` and replace
that screen's body with `<Img src={staticFile('create.png')} style={{width:'100%'}}/>`.

### Audio (v6 — full mix)
- `npm run vo` — 12 rojak ElevenLabs clips → `public/vo-*.mp3`
  (key in `remotion-promo/.env` as `ELEVENLABS_API_KEY`, optional `VOICE_ID`).
- `npm run sfx` — synthesizes whoosh/pop/tick/chime + the 92 BPM music bed
  (`scripts/generate-sfx.mjs`, pure Node, deterministic).
- `src/SoundTrack.tsx` — the mix: music bed (0.30, fades), VO cues, whooshes
  on every cut, pops on the autofill, chime on Payment confirmed.

### Motion (v6 — the AE playbook)
`src/motion.tsx`: `MaskRise` (masked word rise + tracking-in + scale settle +
animated exit), `PushIn` (moving hold on every screen shot), drifting Backdrop,
auto-exiting `Caption`.

## EchoPromo — ~27.5s · 60fps · DARK / electric (the AI promo)

Deliberately opposite to Collectz: near-black `#0B0B0D`, a living glowing **orb**
(Echo's ⚡ zap presence), fast kinetic glow-type, real Manglish chat, and Echo's
**confirm-chip mechanic** ("Lined up RM 15 — tap to confirm", never "saved").
Persistent `jejakbaki.my` watermark. No VO — music + UI SFX only.

Beats: Ignition (orb) → Chat (log+confirm chip · bill-split cascade · "where does
my money go") → Breadth (voice waveform · note-scan · receipt stream) →
Personality ("am i rich?") → Sign-off. All copy verbatim from the Echo code.

- `npm run echo-sfx` — synth SFX + 124 BPM dark music (`scripts/generate-echo-sfx.mjs`).
- `src/echo/` — theme, fx (Orb, GlowType, Chip, StreamText, Waveform, …), scenes, EchoSound.
- `npx remotion render EchoPromo out/echo-promo.mp4`

## PotracesPromo — 11s generic app promo (first experiment, dark)

## Run

```powershell
npm install
npm run dev              # Remotion Studio — scrub live
npm run render           # → out/collectz-promo.mp4
```

Single frame: `npx remotion still CollectzPromo out.png --frame=N`
(review stills land in `frames/`).

## Files
- `src/theme.ts` — `L` (light, v4) and `C` (dark, old promo).
- `src/motion.tsx` — the v4 kit: Rise, TypeText, CountUp, Backdrop, Caption.
- `src/AppScreens.tsx` — the six redrawn light Collectz screens.
- `src/scenes/` — Hook / Organizer / Participant / SignOff.
- `src/fx.tsx` — old dark effect library (unused by v4; kept for reference).
