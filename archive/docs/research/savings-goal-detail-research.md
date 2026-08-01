# Savings Goal Detail Screen — UI/UX Research

## Research Synthesis (May 2026)

---

## 1. EMOTIONAL DESIGN — What Makes Progress Feel Rewarding

**The Apple Fitness Principle**: The ring closing is rewarding not because of information density, but because of *anticipation + payoff*. The ring is mostly empty space. The dopamine comes from watching it CLOSE, not from reading numbers. Key: animate the fill on sheet open (0% -> current in 600ms).

**Duolingo's Variable Rewards**: Celebrations happen at UNEXPECTED moments — not every deposit, but at milestones. Confetti + haptic + character expression change. Streak counter uses loss aversion (you don't want to break it). Data shows streaks increase commitment 60%, badges boost completion 30%.

**Headspace's Calm Reward**: No flashy celebration — just a gentle color shift and a single warm sentence ("You've been at this for 14 days"). The reward IS the calm. For a savings app with earthy palette, this is more appropriate than confetti.

**Color Psychology for Wealth**:
- Gold/amber = achievement, warmth (use for milestone unlocks)
- Olive/green = growth, stability (use for the ring itself)
- Sky blue = trust, openness (use for completed/resolved goals)
- Avoid: red urgency, neon gamification

**Implementation Rules**:
1. Ring animates from 0 on every sheet open (600ms spring) — creates micro-dopamine
2. Milestone celebrations: subtle gold shimmer + haptic + warm sentence (not confetti)
3. Streak badge only appears after 3+ consecutive months of deposits
4. "Almost there" state (>80%) gets special visual treatment (ring glows/pulses subtly)

---

## 2. VISUAL HIERARCHY — Content Rhythm for Detail Sheets

**The Spotify Pattern**: Hero element (album art) → small metadata → action row → scrollable list. Key insight: the hero takes 40% of viewport. Everything else is subordinate.

**Magazine Layout (not card stack)**: Sections separated by 32px spacing + different typography weights. NO card borders, NO dividers. Let whitespace do the work. Dense info (amount, date) → spacious breathing room → dense info (activity list).

**The Rhythm Rule**: Alternate between "glanceable" (big number, ring) and "scannable" (small text rows). Never stack two dense sections.

**Bottom Sheet Specifics** (NN/g research):
- Use full horizontal width
- Drag handle at top signals interactivity
- Hero content must be visible before any scroll
- Max 2-3 actions visible (not 5 buttons)

---

## 3. INNOVATIVE PATTERNS — 2025-2026

**Jar Apps (Jar, Loot, Goal Jar)**: 3D jar filling with coins as you save. Creates tangible "weight" feeling. For 2D: a simple jar silhouette that fills with colored liquid/gradient from bottom.

**Korean Fintech (Toss)**: Ultra-minimal. One number, massive. Tiny label above. Progress is a thin line, not a ring. Everything feels like it has room to breathe. No decoration.

**Content-Inside-Ring**: Apple Watch puts the number INSIDE the ring. Savings apps on Dribbble show amount inside, % below ring. This collapses two elements into one visual unit.

**Milestone Unlocks**: Small locked/unlocked icons along a horizontal track (like a game level map). Each milestone = a dot. Reached ones are filled gold. Creates forward momentum.

---

## 4. LAYOUT OPTIONS (ASCII Mockups)

### Option A: "The Toss" — Radical Minimalism
```
  ┌─────────────────────────────┐
  │         ─── handle ───       │
  │                              │
  │    🎯  Emergency Fund        │  ← icon + name, small
  │                              │
  │       RM 4,200               │  ← MASSIVE amount (32pt)
  │     of RM 10,000             │  ← target, muted, small
  │                              │
  │  ━━━━━━━━━━━━━━━━━░░░░░░░░  │  ← thin progress bar (3px)
  │  42%           ~8 months     │  ← % left, ETA right
  │                              │
  │  ┌─ + ─┐  ┌─ ✎ ─┐           │  ← 2 pill buttons only
  │  │ add  │  │edit │           │
  │  └──────┘  └─────┘           │
  │                              │
  │  Recent                      │  ← section label, no border
  │  + RM 500  ·  May 15         │
  │  + RM 200  ·  Apr 28         │
  │  + RM 1,000 · Apr 1          │
  │                              │
  └─────────────────────────────┘
```
**Why it works**: Nothing competes for attention. The amount IS the hero.
The thin bar is less intimidating than a ring (UX research confirms this).
Feels calm, not gamified. Matches earthy palette.

### Option B: "The Ring" — Content-Inside-Ring Hero
```
  ┌─────────────────────────────┐
  │         ─── handle ───       │
  │                              │
  │        ╭───────────╮         │
  │       ╱  🎯         ╲        │  ← icon inside ring, top
  │      │   RM 4,200    │       │  ← amount inside ring
  │      │   of 10,000   │       │  ← target inside, muted
  │       ╲    42%       ╱        │  ← percentage inside
  │        ╰━━━━━░░░░░░╯         │  ← olive ring, animated fill
  │                              │
  │  ~8 months left              │  ← single line ETA
  │                              │
  │  ┌─ + ─┐  ┌─ ✎ ─┐           │
  │  │ add  │  │edit │           │
  │  └──────┘  └─────┘           │
  │                              │
  │  ● ── ● ── ◐ ── ○ ── ○      │  ← milestone track
  │  1K   2.5K  5K  7.5K  10K   │    (dots = milestones)
  │                              │
  │  Activity                    │
  │  + RM 500  ·  May 15         │
  │  + RM 200  ·  Apr 28         │
  └─────────────────────────────┘
```
**Why it works**: Ring contains ALL key info (no separate amount block).
Milestone track adds forward momentum without clutter.
Ring animates on open = dopamine. Olive stroke = calm growth.

### Option C: "The Journal" — Warm + Personal
```
  ┌─────────────────────────────┐
  │         ─── handle ───       │
  │                              │
  │  Emergency Fund         🎯   │  ← name left, icon right
  │  Started Mar 2026            │  ← subtle origin story
  │                              │
  │  RM 4,200  ───────  RM 10K  │  ← current LEFT, target RIGHT
  │  ━━━━━━━━━━━━━━━░░░░░░░░░░  │  ← bar connects them visually
  │                              │
  │  ┌──────────────────────────┐│
  │  │ 🔥 3-month streak        ││  ← warm gold bg chip
  │  │ You've added every month ││    (only shows if earned)
  │  └──────────────────────────┘│
  │                              │
  │  ┌─ + add ─┐                 │
  │  └─────────┘                 │
  │                              │
  │  Your journey                │  ← section label
  │                              │
  │  May    + RM 500    RM 4,200 │  ← month + deposit + running
  │  Apr    + RM 700    RM 3,700 │     total (tells a story)
  │  Mar    + RM 3,000  RM 3,000 │
  │                              │
  │  ── ── ── ── ── ── ── ── ── │
  │  42% there · ~8 months left  │  ← footer summary
  └─────────────────────────────┘
```
**Why it works**: Reads like a personal story, not a dashboard.
Streak card only appears when earned = variable reward.
"Your journey" reframes deposits as narrative, not transactions.
Running total shows growth over time = most motivating data point.

### Option D: "The Hybrid" — Ring + Breathing Room + Milestones
```
  ┌─────────────────────────────┐
  │         ─── handle ───       │
  │                              │
  │  🎯  Emergency Fund          │
  │                              │
  │        ╭───────────╮         │
  │       ╱             ╲        │
  │      │    42%        │       │  ← just % inside ring
  │       ╲             ╱        │     (clean, not crowded)
  │        ╰━━━━━░░░░░░╯         │
  │                              │
  │    RM 4,200 of RM 10,000    │  ← amount BELOW ring
  │    ~8 months left            │
  │                              │
  │         ╭────────╮           │
  │         │ + add  │           │  ← single primary action
  │         ╰────────╯           │
  │                              │
  │  ● ━━ ● ━━ ◐ ━━ ○ ━━ ○     │  ← milestone track
  │  1K       5K       10K       │
  │                              │
  │  ┌──────────────────────────┐│
  │  │ 🔥 3 months in a row     ││  ← conditional streak
  │  └──────────────────────────┘│
  │                              │
  │  Recent                      │
  │  + RM 500     May 15         │
  │  + RM 200     Apr 28         │
  └─────────────────────────────┘
```
**Why it works**: Ring is hero but NOT overloaded (just %).
Amount gets its own breathing space below.
Milestone track + conditional streak = emotional rewards without clutter.
Single "add" button = clear primary action.

---

## RECOMMENDATION

**Option C ("The Journal")** for your calm/earthy app. Reasons:
1. No ring = avoids the "dashboard feel" that made v1 cluttered
2. Streak card as variable reward = Headspace-style calm dopamine
3. "Your journey" with running totals = the most psychologically rewarding view (users see growth as a STORY)
4. Current-left / target-right with connecting bar = intuitive without explanation
5. Matches your earthy palette perfectly (no flashy elements needed)

**If you want a ring**, Option D is the cleanest — percentage only inside, amount below, milestone track for momentum. But research suggests bars are less intimidating than rings for savings goals specifically.

---

## IMPLEMENTATION NOTES FOR POTRACES

- Ring animation: `react-native-reanimated` `withTiming` on SVG `strokeDashoffset` (already using this in Goals.tsx)
- Milestone track: horizontal `View` with dots, `Reanimated.FadeIn` on newly-reached ones
- Streak calculation: count consecutive months with >= 1 deposit in `personalStore`
- Streak chip: gold bg `withAlpha(CALM.accent, 0.12)`, gold text, only renders if streak >= 3
- Activity list: `FlatList` with `maxToRenderPerBatch={10}` per codebase rules
- Bar: `ProgressBar` component already exists in codebase
- Bottom sheet: existing `detailSheetY` spring animation pattern in Goals.tsx

Sources:
- Apple Fitness ring design: https://developer.apple.com/design/human-interface-guidelines/activity-rings
- Duolingo gamification (60% streak boost): https://www.925studios.co/blog/duolingo-design-breakdown
- Dopamine in UX: https://uxmag.com/articles/designing-for-dopamine
- Bottom sheet best practices: https://www.nngroup.com/articles/bottom-sheet/
- Jar savings apps: https://apps.apple.com/us/app/jar-savings-goal-tracker/id6741083421
- Chase savings UX study: https://medium.com/@ckduong14/ux-ui-case-study-chase-saving-goals-9287827fc90c
- Banking gamification: https://www.purrweb.com/blog/gamification-in-banking-features-benefits-costs/
