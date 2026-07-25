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

## DebtPromo — "Paper v5" · 38.2s · 60fps · WHITE / living components

Every app screen **rebuilt as a Remotion component** (pixel-close to
`assets/website jejakbaki/*.PNG`) — rows stagger, totals count up, progress
bars fill, the receipt scan sweeps, the WhatsApp message types, the saved
DuitNow QR attaches itself. Signature type: **Rise** (classic masked
word-rise, `src/debt4/type.tsx`) + `Rule` lower-third captions +
`Scribble` emphasis. Screens zoomed ×1.2 for tele presence. **Tempo-locked
to the 100 BPM bed** (beat = 36f). VO: **ElevenLabs "Daud M" (eleven_v3,
Malay)** — the hook is a per-person **roll-call**: one VO clip per debt row,
each name spoken right after its row slams in.

Story: **Hook** (aiman RM 30 tiket bas · zikri RM 60 makan · mohsin RM 50
bayar dulu semalam → RM 140 → "Track semua." → "Ingat barang. Ingat harga.
Ingat orang sekali.") → **Snap+Split** (viewfinder scan → RM 129.60 parsed →
÷ 4 → Split created!) → **Splits Overview** (you're owed back RM 316 across
2 splits) → **Track** (You Owe RM 650 / Owed to You RM 60 — "…nanti halal je
hutang tu") → **Remind** (message types → **saved DuitNow QR attaches** →
WhatsApp + QR) → **Settle** (dia bayar — row strikes, "collected") →
**Shared** ("Share sama-sama Netflix? Track kat sini jugak") → **Finale**
("Hutang. Track dulu. Settle." — takde awkward dah).

- `npm run debt-vo` — 14 clips via ElevenLabs (`ELEVENLABS_API_KEY` +
  `DAUD_VOICE_ID`/`VOICE_ID` in `remotion-promo/.env`).
- **`DEBT_PROMO_RULES.md` — user-corrected audio×display rules + approved
  copy. READ before touching this promo.**
- `npm run debt-audio` — synths the 100 BPM bed + dsfx set (deterministic).
- `src/debt4/` — type (Rise/BlockReveal/Rule/Scribble/Ripple), screens (all
  living screens), scenes, DebtSound (VO/SFX cue map).
- `REMOTION_KNOWLEDGE.md` — field notes: determinism, motion recipes,
  screenshot storytelling, audio grids, VO pipeline, render QA, gotchas.
- `npm run render:debt` — → `out/debt-promo.mp4`
- Official [remotion-dev/skills](https://github.com/remotion-dev/skills) best
  practices vendored in `.skills/` for reference.

## WhyPromo — "Why Potraces" · 74.3s · 60fps · problem → suspension → solution

Contoh1 grammar, second pass: **Punch captions** (`src/why/punch.tsx` —
neutral grotesque, per-word hard pops, tight cadence), montage over 20
open-license stock images, **serious mix only** (bed + deep whooshes + riser,
bed ducks through the suspension). VO persona: **Zain (Malay Newsroom
Narrator)**. Structure: problem (16/day muflis · 49.5% personal loans ·
53k<30 RM 1.9B · BNPL 5.1M <RM5k · 61% RM1k · kad 5-6 · kahwin RM30k+ ·
RM 1.63T household debt · EPF 90%+) → **suspension** ("Masalahnya bukan gaji
kecil… kita tak nampak duit tu pergi mana") → **solution = Potraces**
("Sebab tu Potraces wujud." · snap receipt AI · Echo chat rekod · debts,
splits, shared subs · "Ingat barang, harga, orang." · "Bukan sebab kau
lemah. Sistem yang buat kau lupa. Potraces ingatkan." · "Track dulu. Baru
berani belanja.").

- `npm run why-vo` — 14 lines via ElevenLabs Zain (`WHY_VOICE_ID` to override).
- Stock: open-license via Openverse/Wikimedia → `public/stock/` + `credits.json`.
- `src/why/` — punch (Punch captions), fx (ImgBeat), scenes, WhySound.
- `npm run render:why` — → `out/why-potraces.mp4`

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
