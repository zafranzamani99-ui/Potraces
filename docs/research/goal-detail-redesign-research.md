# Savings Goal Detail Screen — Redesign Research

> Researched 2026-05-29. Sources: Dribbble, Behance, UXDA, Muzli, Mobbin, Ramotion, DesignRush, Medium case studies, Qapital/Monzo/Revolut/N26 teardowns.

## Current Layout (what we have)

Bottom sheet with drag handle → circular progress ring (180px, amount + % inside) → goal name → "of RM X,XXX" subtitle → milestone dots (25/50/75/100%) → pace/deadline row → CTA buttons (add money / withdraw) → recent activity list (dot + date + amount) → sparkline → secondary actions (edit / pause / delete) → close link.

**What makes it "junior":** Flat list of cards, no visual rhythm, milestone dots are just 4 circles in a row, activity is a plain list with dots, sparkline sits in a generic card, CTAs are standard pill buttons, no color story, no depth, no celebration of progress.

---

## 5 Creative Patterns to Implement

### 1. GRADIENT AURORA HERO (color-soaked identity)

**What it is:** The entire top third of the detail sheet uses the goal's color as a living gradient background — not a flat color, but a multi-stop aurora that shifts from the goal color through a lighter tint to the sheet surface. The ring sits inside this gradient zone, making it feel like the goal "owns" the screen.

**Why it's premium:**
- Each goal feels distinct — opening "vacation" (blue) vs "emergency fund" (amber) is a completely different visual experience
- The gradient creates perceived depth without any 3D effects
- It mirrors how Revolut's card detail uses the card color as the hero background
- Apple Wallet does this — each card's detail screen is colored by the card itself

**Implementation detail:**
- `LinearGradient` from expo-linear-gradient with 3 stops: `[goalColor, withAlpha(goalColor, 0.3), C.surface]` at positions `[0, 0.5, 1]`
- The ring's track color becomes `withAlpha('#FFFFFF', 0.2)` (translucent white on the gradient) instead of `C.border`
- Ring stroke color becomes `#FFFFFF` or a brightened version of the goal color
- Text inside the ring becomes white/light on the gradient
- The gradient zone includes the handle, ring, name, and subtitle — everything down to where the scrollable content begins
- On dark mode: gradient goes from `withAlpha(goalColor, 0.6)` → `withAlpha(goalColor, 0.15)` → `C.surface`

**The "wow" factor:** When you open a goal, the entire top of the sheet blooms in that goal's color. It's not a card with a colored border — the color IS the hero.

---

### 2. MILESTONE JOURNEY TRAIL (not dots — a river)

**What it is:** Replace the 4 milestone dots with a horizontal "journey trail" — a curved SVG path that flows left to right, with milestone markers at 25/50/75/100%. The filled portion pulses subtly with the goal's color. Reached milestones show small icon badges (seed → sprout → tree → star). The current position has a glowing dot that sits on the path.

**Why it's premium:**
- Dots are the most generic progress indicator. A trail tells a STORY.
- The organic curve (slight sine wave, not straight line) feels alive
- Milestone icons create emotional attachment to progress stages
- Monzo uses path-based progress for their savings pots
- Duolingo popularized the journey trail for learning — same dopamine mechanic applies to savings

**Implementation detail:**
- SVG `Path` with a gentle sine curve: `M 0,20 C 30,5 60,35 90,20 C 120,5 150,35 180,20 ...` scaled to container width
- Two paths: background trail (faint `withAlpha(goalColor, 0.12)`) and filled trail (solid goal color, animated `strokeDashoffset` based on percentage)
- 4 milestone circles positioned along the path at 25/50/75/100% of the path length
- Reached milestones: small circular badge with Feather icons (`sprout`→`sun`→`award`→`star`) on a colored background
- Unreached: hollow circle with dashed border
- Current position: pulsing dot (Reanimated loop, scale 1→1.3→1, opacity 1→0.6→1)
- Total height: ~64px. Sits where the current milestone dots are.

**The "wow" factor:** Your savings journey looks like a winding river with waypoints, not a row of radio buttons.

---

### 3. CONTRIBUTION TIMELINE (vertical story, not a flat list)

**What it is:** Replace the "recent activity" card with a vertical timeline that connects each contribution visually. Each entry is a node on a vertical line, with the amount as a "bubble" whose SIZE reflects the contribution magnitude. Notes appear as small speech-bubble callouts. The timeline flows newest-at-top, with the connecting line using the goal's color.

**Why it's premium:**
- A timeline implies narrative — "your savings story"
- Variable-size bubbles create visual rhythm (big deposit = big bubble = visual weight)
- Speech-bubble notes feel personal, not like database rows
- This is how premium banking apps (N26, Revolut) show transaction detail — vertical timeline with visual weight
- The connecting line creates visual continuity that a flat list cannot

**Implementation detail:**
- Vertical line: 2px wide, `withAlpha(goalColor, 0.2)`, runs down the left side at `x=24`
- Each node: circle (12px) on the line, filled with goal color for deposits, hollow for withdrawals
- Amount bubble: `View` with `borderRadius: RADIUS.full`, `paddingHorizontal: SPACING.md`, background `withAlpha(goalColor, 0.08)`. Font size scales: amounts > monthly average get `TYPOGRAPHY.size.md`, others get `TYPOGRAPHY.size.sm`
- Date label: small muted text to the left of the node (or above the bubble)
- Note callout: small rounded rectangle below the amount with a tiny triangle pointer, background `C.surface`, border `C.border`
- Withdrawals: node is hollow (border only), amount text uses `C.bronze`, bubble background uses `withAlpha(C.bronze, 0.08)`
- Show last 5 entries in the detail sheet; "see all" opens the full history
- The line starts from the ring above (conceptual connection) and ends at the oldest visible entry

**The "wow" factor:** Each contribution is a moment in your savings story, visually weighted by importance. Big deposits are visually celebrated.

---

### 4. STAT CONSTELLATION (not label:value — orbital layout)

**What it is:** Replace flat stat rows (pace, deadline, monthly rate) with an orbital/constellation layout. The central element is the remaining amount (big, bold). Orbiting around it are 3-4 satellite stat pills that show pace/day, deadline countdown, monthly average, and total contributions — each in a small rounded capsule with an icon, positioned in a loose cluster (not a grid, not a list).

**Why it's premium:**
- Grids and lists scream "admin panel". A constellation layout feels spatial and designed.
- Each stat pill has its own micro-identity (icon + color tint from the goal color at varying opacities)
- The layout feels effortless — like the stats are floating, not crammed into rows
- Apple's Activity app uses a similar scattered-stat approach below the rings
- The asymmetry is intentional — it breaks the monotony of card→card→card

**Implementation detail:**
- Container: `height: 120`, `position: 'relative'`
- Center: remaining amount in `TYPOGRAPHY.size.xl`, `fontWeight: light`, positioned at center
- Subtitle below center: "remaining" in muted small text
- Satellite pills: `position: 'absolute'`, each with:
  - `flexDirection: 'row'`, `alignItems: 'center'`
  - Small Feather icon (12px) + value text (13px, tabular-nums)
  - Background: `withAlpha(goalColor, 0.06)`, border: `withAlpha(goalColor, 0.15)`
  - `borderRadius: RADIUS.full`, `paddingHorizontal: SPACING.md`, `paddingVertical: SPACING.xs`
- Positions (relative to container):
  - Top-left: `{ top: 8, left: 12 }` — pace/day (clock icon)
  - Top-right: `{ top: 0, right: 20 }` — deadline countdown (calendar icon)
  - Bottom-left: `{ bottom: 12, left: 28 }` — monthly avg (trending-up icon)
  - Bottom-right: `{ bottom: 4, right: 8 }` — total deposits count (layers icon)
- On narrow screens: fall back to a 2x2 grid with the same pill styling (just `flexWrap`)
- Entrance animation: each pill fades in + slides from its edge with staggered delay (FadeIn.delay(i*80))

**The "wow" factor:** Stats float around the key number like satellites, not trapped in a spreadsheet. It's spatial, not tabular.

---

### 5. CONTEXTUAL CELEBRATION STATES (the goal detail transforms at milestones)

**What it is:** The detail sheet's visual treatment changes based on progress milestones. It's not just a number going up — the entire sheet evolves:

| Progress | Visual Treatment |
|----------|-----------------|
| 0-24% | Clean, minimal. Subtle encouragement copy. Trail shows "just started" |
| 25-49% | First milestone badge appears. Gradient intensifies slightly. Copy: "quarter of the way" |
| 50-74% | Halfway celebration: the ring gets a subtle outer glow (shadow). Trail halfway filled. Copy tone shifts to encouraging |
| 75-99% | "Almost there" energy: gradient is most vibrant. Ring glow intensifies. Confetti dots (small colored circles) scatter in the gradient zone. Pace text turns positive green if on track |
| 100% | COMPLETED state: Ring fills with a checkmark overlay. Gradient becomes a warm gold/champagne. "Goal reached" with formatted date. Archive CTA replaces add money. The milestone trail shows all icons lit up with a subtle shimmer |

**Why it's premium:**
- Static UIs feel dead. A goal that visually evolves as you save creates emotional investment.
- Each return to the detail screen shows you've progressed — the screen itself is the reward
- Qapital, Monzo, and fitness apps (Apple Fitness, Strava) all transform their UIs at milestones
- The celebration doesn't need confetti explosions — subtle changes (glow, gradient intensity, copy tone) feel premium, not childish
- This is "dopamine banking" done with restraint

**Implementation detail:**
- Progress tier: `const tier = pct < 25 ? 0 : pct < 50 ? 1 : pct < 75 ? 2 : pct < 100 ? 3 : 4;`
- Gradient intensity: multiply the middle stop opacity by `0.15 + tier * 0.1` (so tier 0 = 0.15, tier 4 = 0.55)
- Ring outer glow (tier >= 2): `shadowColor: goalColor, shadowRadius: 8 + tier * 4, shadowOpacity: 0.2 + tier * 0.1`
- Confetti dots (tier >= 3): 6-8 small circles (4-8px) with `position: absolute` in the gradient zone, random positions, opacity 0.15-0.3, colors from `[goalColor, withAlpha(goalColor, 0.5), C.accent]`
- Completed checkmark: Feather `check-circle` (40px) centered over the ring at 0.3 opacity, or replace the percentage text with a check icon
- Copy variations: stored in translation files, keyed by tier (`t.goals.observation0` through `t.goals.observation4`)
- Entry animation on tier change: if the user's contribution crossed a tier boundary, play a one-time spring scale animation on the ring (scale 1→1.08→1)

**The "wow" factor:** The goal detail is alive. It celebrates with you. Every time you open it after a deposit, it looks slightly different — more vibrant, more achieved. That's what makes people screenshot and share.

---

## Implementation Priority

1. **Gradient Aurora Hero** — highest visual impact, lowest complexity. Can be done in one session.
2. **Milestone Journey Trail** — replaces the weakest current element (4 dots). Medium complexity (SVG path).
3. **Contextual Celebration States** — layers on top of #1 and #2. The tier logic is simple; the polish takes time.
4. **Stat Constellation** — replaces the pace row. Medium complexity, high visual payoff.
5. **Contribution Timeline** — replaces recent activity. Most code change, but transforms the feel.

## Technical Notes

- `expo-linear-gradient` already in the project (check, else `npx expo install expo-linear-gradient`)
- `react-native-svg` already used for the ring (`Svg`, `SvgCircle` imported in Goals.tsx)
- `react-native-reanimated` already used for sheet animations — reuse for pulse/glow/entrance
- Confetti: use simple absolute-positioned `View` circles, NOT a library — keeps it lightweight and on-brand (calm, not explosive)
- All colors derived from `goal.color` — no new color constants needed
- Dark mode: gradient uses lower opacity stops, ring glow uses darker shadow, confetti dots more subtle
