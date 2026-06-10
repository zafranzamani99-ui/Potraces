# Budget Hero Craft Spec — making the daily-allowance gauge feel *expensive*

A concrete, buildable spec for the Potraces personal-mode HERO: a 180° half-gauge with a big
"RM 20 — safe to spend a day" number inside, sitting on a warm zone above a goals card and a
category list. **We are KEEPING this layout.** The job below is to make it feel genuinely
premium (Copilot Money / Monzo / Emma / Revolut / N26 tier), reduced to specifics an engineer
can paste into React Native.

> **App constraints (do not violate):** Malaysian, RM currency. CALM earthy palette — warm
> off-white bg `#F9F9F7`, olive accent `#4F5104`, bronze `#8B7355`, gold `#B2780A`/`#DEAB22`.
> **NO red, NO bright green** anywhere. Must work in dark mode (`CALM_DARK`, bg `#121212`,
> surface `#1E1E1E`, text `#F0EDE8`). Keep the half-gauge + daily number layout.

---

## 0. The single biggest craft change

**Stop the gauge from being the loud element. Make the NUMBER the hero and the arc a
quiet, thin, tonal frame around it.** The cheap/AI version makes a thick rainbow gauge the
star and squeezes a bold number inside. The expensive version inverts this: a *whisper-thin*
arc (≈ 4% of diameter), a single muted hue (olive→bronze tonal, never rainbow), and a **large,
light-weight, tabular number** that owns the negative space. Every other element in the hero
drops to a murmur. This one inversion is 70% of the perceived quality jump.

---

## 1. The dial / gauge

### Geometry — why 180° is the right call for us
- A **half-circle (180°)** is the most space-efficient and most readable gauge; it is the
  default for premium dashboards because it reads instantly like a fuel/budget meter and
  leaves a clean flat baseline to anchor the number and supporting text. ([Domo](https://www.domo.com/learn/charts/gauge-chart), [CleanChart](https://www.cleanchart.app/blog/how-to-create-gauge-chart))
- A **270° speedometer** is "the most common modern dashboard style" and reads as slightly more
  technical/instrument-like; it needs more vertical height and the two open legs at the bottom
  can look busy. A **full ring (360°)** suits cyclical data (time), wastes vertical space, and
  is harder to read at a glance. ([CleanChart](https://www.cleanchart.app/blog/how-to-create-gauge-chart))
- **Decision for us: keep 180°.** It gives the calmest silhouette, the flattest baseline for
  the "safe to spend a day" caption, and the least visual noise — which is exactly the CALM
  brand. (Our daily-allowance metric is also a simple proportion, which 180° expresses cleanly.)

### Stroke weight RELATIVE to diameter (the ratio that matters most)
- **Target ratio: stroke ≈ 4% of the arc diameter** (range 3.5–5%). For a 260 px-wide gauge
  that is a **10–11 px stroke**. For a 300 px gauge, **12 px**.
- This is deliberately *thinner* than the common tutorial default of `strokeWidth = radius * 0.2`
  (= 20% of radius ≈ 10% of diameter), which is the chunky "toy gauge" look. ([fullstack.com](https://www.fullstack.com/labs/resources/blog/creating-an-svg-gauge-component-from-scratch))
  Premium apps run thin. **Thin = expensive; chunky = cheap.**
- Keep track and progress strokes the **same width** (do not make progress fatter than track —
  that's a dashboard-template tell).

### Track (the unfilled remainder)
- Render a full 180° **track arc** under the progress arc so the gauge always looks complete.
- Track color = the accent at very low opacity: **6–10% opacity** of the progress hue
  (`withAlpha(C.accent, 0.08)` light; `withAlpha(C.accent, 0.14)` dark — dark needs a touch
  more to stay visible against `#1E1E1E`). Never a solid grey track; never a heavy border.

### Caps
- **Rounded caps on both ends** (`strokeLinecap="round"`). Rounded terminals are the single
  cheapest-to-add premium signal on an arc. ([Jetpack Compose deep-dive](https://medium.com/@saykat-mir/building-an-animated-semi-circle-progress-indicator-in-jetpack-compose-a-deep-dive-d5d9de6c3459))
- Caveat (RN/SVG): **SVG gradients ignore `strokeLinecap` on some renderers.** If you use a
  gradient stroke and lose the rounded caps, either (a) use a solid color, or (b) draw a tiny
  filled circle at each cap end to fake the round. Test on a device. ([Ant Design note](https://ant.design/components/progress/))

### Color: solid vs gradient — keep it TONAL, never rainbow
- **Use a same-hue tonal gradient, not a multi-hue one.** Premium fintech gauges shift *within
  one hue family* (e.g. olive → bronze, or a light olive → deeper olive). A rainbow / blue→purple
  / green→red sweep is the #1 "AI made this" tell. ([Eggradients 2026](https://www.eggradients.com/blog/gradient-ui-in-2026), [Rythmux](https://medium.com/@Rythmuxdesigner/why-your-ai-generated-ui-looks-like-everyone-elses-and-how-to-break-the-pattern-7a3bf6b070be))
- Concrete recommendation for CALM:
  - **Light mode:** olive `#4F5104` → bronze `#8B7355`, a soft warm tonal drift along the arc.
  - **Dark mode:** a *deeper muted* olive, NOT the bright `#9A9540`/`#A4A843` (those read too
    bright on dark per our business-dark rule). Try `#6E7233` → `#8B7355`.
  - When the user is *over* their allowance, do NOT switch to red. Shift toward **bronze/gold**
    (`#B2780A`) and let the number caption carry the meaning. No alarm colors — ever.
- If gradient causes cap/render problems, a **single solid olive** still looks premium. Gradient
  is the polish layer, not the foundation.

### Inner shadow / glow / track treatment
- **No outer glow. No drop shadow on the arc itself.** Glows on a gauge read as cheap/gamey.
- The only acceptable depth on the gauge: a *barely-there* inner feel from the low-opacity track
  sitting under the bright progress stroke. That contrast alone gives enough dimensionality.
- Optionally a 1–2 px **rounded dot marker** at the progress tip in the same hue for a "current
  position" read — keep it subtle, same color as the stroke end, no halo.

---

## 2. Number typography — the hero figure

> In money UIs, **text is secondary, numbers are the star**; the primary figure should be the
> loudest element and answer "how much?" before any word is read. ([UXDA](https://www.theuxda.com/blog/top-20-financial-ux-dos-and-donts-to-boost-customer-experience), [fintech typography pt.1](https://medium.com/design-bootcamp/the-elements-of-fintech-typography-part-1-readable-money-b6c1226acbde))

### Size
- The amount is the largest type on the screen by a wide margin. Target **~13–16% of screen
  width as font size** → roughly **44–56 px** on a standard phone. It should optically fill the
  open space inside the half-arc without crowding the curve.

### Weight — go LIGHT, not bold
- **Use Regular/Medium, lean toward light. Avoid Bold/Heavy.** Big + light = expensive and
  confident; big + bold = shouty/toy. This is the consistent move in Copilot, Monzo, N26 hero
  balances. (Copilot is built by ex-Apple designers and leans on native SF restraint. ([Apple Developer](https://developer.apple.com/articles/copilot-money/), [SaaSweep](https://www.saasweep.com/blog/copilot-money-review)))
- Practically: `fontWeight: '400'`–`'500'` on the integer figure. Never `'700'+`.

### Typeface & figures
- **Tabular (monospaced) lining figures** for the amount, so digits don't jitter as the value
  changes and decimals stay aligned. Tabular is essential anywhere numbers animate or update.
  ([Jigsaw tabular figures](https://medium.com/jigsaw-xyz/typography-in-finance-part-1-tabular-figures-4c21d4ed8097), [fintech typography](https://medium.com/design-bootcamp/the-elements-of-fintech-typography-part-1-readable-money-b6c1226acbde))
  - iOS: SF Pro with `fontVariant: ['tabular-nums']` (RN supports `fontVariant`). For a softer,
    friendlier CALM feel, **SF Pro Rounded** shares SF Pro's metrics with curved terminals and
    reads warm without looking childish. ([protosketch](https://protosketch.io/san-francisco-display-vs-text-compact-vs-normal-a-brief-review/), [DeepWiki SF Rounded](https://deepwiki.com/sahibjotsaggu/San-Francisco-Pro-Fonts/3-sf-pro-rounded))
  - Cross-platform fallback: **Inter** (lighter, modern) or **IBM Plex Sans** — both ship
    excellent tabular figures. ([fontalternatives](https://fontalternatives.com/best-fonts-for/fintech/))

### Tracking (letter-spacing)
- Large light numerals look more premium with a **slightly negative or neutral tracking**:
  about **-0.5 to -1.0 px** (≈ -0.01 to -0.02em) on the big figure to tighten the digits into
  one confident unit. Loose tracking on big numbers looks weak. (Tracking as a premium lever:
  [Datawrapper](https://blog.datawrapper.de/fonts-for-data-visualization/), Jigsaw above.)

### The "RM" currency prefix
- **Smaller, muted, baseline-or-slightly-raised — never the same size as the figure.** Make
  "RM" roughly **40–55% of the figure's size**, in `C.textSecondary` (muted), with a small gap.
  Do **not** fake superscript by shrinking with the editor's superscript control — that makes it
  look anemic; set its size/weight intentionally. ([type.today currency manual](https://type.today/en/journal/currency), [Society of Fonts](https://www.societyoffonts.com/2017/11/28/letterlike-symbolspart-4-currency/))
- Decimals: for a *daily allowance* that is usually a round figure, **show whole RM** (e.g.
  `RM 20`) — fewer characters = calmer. If you must show sen, render the `.00`/decimals at
  ~60% size and `C.textSecondary` so the dollars dominate. De-emphasizing trailing digits is a
  proven fintech readability move. ([fintech currency-symbol search above], [bitcoin.design units](https://bitcoin.design/guide/designing-products/units-and-symbols/))

### What makes a number look "expensive" (summary)
Big · light-weight · tabular · slightly tight tracking · muted small currency mark · generous
negative space around it · single ink color (`C.textPrimary`) with only the currency + decimals
dropped to secondary. That's the Copilot/Monzo recipe.

---

## 3. Hierarchy & restraint — "every element earned its place"

The hero should contain **at most 4 information layers**, in this loudness order:

1. **The amount** (`RM 20`) — dominant, ~50 px, light, primary ink. *The hero.*
2. **The caption** — `safe to spend a day` — small (~13–14 px), `C.textSecondary`, regular,
   directly under the number. Whisper-quiet. This is the only label.
3. **The arc** — thin, tonal, structural. Present but quiet; it frames, it doesn't perform.
4. **One optional context line** — e.g. `RM 140 left this week` at ~12 px, very muted, only if
   it earns its place. If unsure, cut it.

Rules of restraint:
- **No icons inside the gauge.** No emoji, no little wallet glyph. The number is enough.
- **One accent hue** in the hero (olive family). Bronze/gold only as the tonal gradient partner
  or the over-budget shift — not as decoration. Decorative-but-meaningless color is a cheap tell.
  ([UXDA](https://www.theuxda.com/blog/top-20-financial-ux-dos-and-donts-to-boost-customer-experience))
- **Negative space is a feature.** Leave generous empty space inside the arc above the number
  and between hero and the goals card below (≥ `SPACING['2xl']`). Crowding = toy.
- Neobank trend is **3–5 primary intents per screen, not feature-dense dashboards** — keep the
  hero monomaniacal about the one question: *how much can I spend today?* ([Phenomenon fintech patterns](https://phenomenonstudio.com/article/fintech-design-breakdown-the-most-common-design-patterns/))

---

## 4. Depth & light — subtle, layered, never hard

The hero "warm zone" card and the goals/category cards below carry the depth; the gauge stays flat.

### Shadows (the premium recipe)
- **Two-layer soft shadow, low opacity.** Layer 1 = depth (large blur, bigger Y, very low
  opacity). Layer 2 = contact (small blur, tiny Y, slightly higher but still low opacity).
  Senior-designer shadows run **~10–25% opacity, high blur, soft edges**. Hard, high-contrast,
  single-layer shadows are the cheap tell. ([Josh Comeau](https://www.joshwcomeau.com/css/designing-shadows/), [LogRocket](https://blog.logrocket.com/ux-design/shadows-ui-design-tips-best-practices/), [designsystems.surf elevation](https://designsystems.surf/articles/depth-with-purpose-how-elevation-adds-realism-and-hierarchy))
- Concrete RN (light mode hero card), approximating two layers:
  ```js
  // contact layer
  shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4,  shadowOffset: {width:0, height:1},
  // depth layer (use a second wrapping View or the existing SHADOWS.lg token)
  shadowColor: '#000', shadowOpacity: 0.10, shadowRadius: 24, shadowOffset: {width:0, height:8},
  elevation: 6, // Android
  ```
  Rule: **blur grows faster than offset; opacity drops as elevation rises.** ([Fluent elevation](https://fluent2.microsoft.design/elevation))
- **Dark mode: do NOT use black drop shadows to lift cards.** Shadows are nearly invisible on
  `#121212`. Convey elevation with **surface lightness** instead — the card is `#1E1E1E` (a step
  lighter than the `#121212` bg) plus a **1 px `C.border` hairline** so it floats. (Matches our
  modal-outline-for-dark-mode rule.) A faint inner top highlight is optional; keep ≤ 6% white.

### Gradients (background warmth, not decoration)
- The hero "warm zone" may use an **extremely subtle tonal background gradient** — e.g. warm
  off-white `#F9F9F7` → a hair warmer (`#F6F4EE`), **2–4% perceptible shift only**. It should be
  felt, not seen. Anything stronger looks like a template.
- **No glassmorphism, no purple/blue gradient, no 3D blobs** — the canonical AI clichés.
  ([Rythmux](https://medium.com/@Rythmuxdesigner/why-your-ai-generated-ui-looks-like-everyone-elses-and-how-to-break-the-pattern-7a3bf6b070be))

### Borders
- Light mode: prefer **no border** on the hero card (shadow does the lifting). If you need
  definition, **1 px at ≤ 6% ink**, never a heavy/dark outline.
- Dark mode: the 1 px hairline `C.border` is required (see above).

---

## 5. Motion — what comes alive on load

Premium = a single, confident, well-eased entrance, then stillness. Not constant motion.

### On first appear / on data change
- **Arc fills from 0 → value over 700–900 ms with ease-out cubic** (`cubic-bezier(0.22, 1, 0.36, 1)`
  or `Easing.out(Easing.cubic)`). Page-level reveals sit in the 500–700 ms band; an arc fill at
  ~800 ms reads deliberate and luxurious. Ease-OUT (fast then settle) is the standard for
  satisfying fills. ([Material duration/easing](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs), [NN/g animation duration](https://www.nngroup.com/articles/animation-duration/), [Motion easing](https://motion.dev/docs/easing-functions))
- **Number counts up** from 0 (or from previous value) to target in the **same ~800 ms,
  ease-out**, synced to the arc so they finish together. Tabular figures make the count-up not
  jitter (see §2). This count-up-on-a-dashboard move is the textbook "bring pizazz to numbers."
  ([CSS-Tricks counters](https://css-tricks.com/animating-number-counters/), [Webflow ease-out counter](https://showcased.webflow.io/projects/counter-up-animation-easing))
- **Stagger the supporting elements**: arc + number together at t=0; caption fades/translates
  in at **t≈+120 ms** (8–12 px upward, 250–300 ms); goals card + category rows stagger in at
  **+60 ms each** below. Subtle, one pass, then done.

### Micro-motion ("alive" without being busy)
- When the value updates (new spend logged), **re-animate the arc + count from the previous
  value to the new one** (~400–500 ms ease-out) rather than snapping. This is the single most
  "premium-feeling" interaction — Copilot's charts animating between states is exactly this.
  ([SaaSweep](https://www.saasweep.com/blog/copilot-money-review))
- Optional: a tiny **spring scale on the number** (1.0 → 1.03 → 1.0, ~200 ms) on update for a
  heartbeat. Keep amplitude tiny.
- Respect **reduce-motion**: if enabled, skip the count-up/fill and set final values instantly.

### Durations cheat-sheet
| element | duration | easing |
|---|---|---|
| arc fill (load) | 700–900 ms | ease-out cubic |
| number count-up (load) | 700–900 ms (synced) | ease-out |
| caption fade+rise | 250–300 ms @ +120 ms | ease-out |
| value update re-animate | 400–500 ms | ease-out |
| number heartbeat (optional) | ~200 ms | spring, tiny |

---

## 6. The cheap / AI tells to AVOID (gauge-hero specific)

- ❌ **Chunky stroke** (≥ ~8% of diameter). Reads as a toy meter. → keep ≈ 4%.
- ❌ **Rainbow / multi-hue / blue→purple / green→red gradient** on the arc. The #1 AI tell.
  → single tonal hue (olive→bronze).
- ❌ **Red for "over budget," bright green for "good."** Banned by brand and looks generic.
  → shift to bronze/gold + let the caption carry meaning.
- ❌ **Glow / drop shadow / neon halo on the arc.** Gamey. → flat arc, depth lives on the card.
- ❌ **Bold/heavy hero number.** Shouty. → light/regular.
- ❌ **Currency mark same size as the figure**, or a thin fake-superscript. → ~45% size, muted,
  intentional weight.
- ❌ **Everything centered + crammed** — icon + number + caption + ring marks + a progress label
  all stacked tight. → ≤ 4 layers, generous negative space, one accent.
- ❌ **Hard single-layer shadows + heavy dark borders** on the card. → two-layer soft low-opacity
  shadow (light), surface-lightness + 1 px hairline (dark).
- ❌ **Decorative color that means nothing** (a teal here, a pink there). Every hue must encode
  state or hierarchy. ([UXDA](https://www.theuxda.com/blog/top-20-financial-ux-dos-and-donts-to-boost-customer-experience), [Rythmux](https://medium.com/@Rythmuxdesigner/why-your-ai-generated-ui-looks-like-everyone-elses-and-how-to-break-the-pattern-7a3bf6b070be))
- ❌ **No motion, or constant motion.** → one confident ease-out entrance, then still; re-animate
  only on real value changes.

---

## 7. Quick build checklist (paste into the PR)

- [ ] Gauge stroke = **~4% of diameter** (track + progress same width).
- [ ] Track = `withAlpha(accent, 0.08)` light / `0.14` dark; full 180° under progress.
- [ ] `strokeLinecap="round"`; verify caps survive the gradient on-device.
- [ ] Progress = **tonal olive→bronze** gradient (deeper muted olive in dark); **no red/green**.
- [ ] Number **~50 px, weight 400–500, tabular-nums, tracking ≈ -0.5px**, primary ink.
- [ ] "RM" at **~45% size, `C.textSecondary`**, intentional (not editor-superscript).
- [ ] One caption only (`safe to spend a day`), small, muted. ≤ 4 hero layers total.
- [ ] Card depth: two-layer soft shadow (light) / surface-lightness + 1 px hairline (dark);
      **no shadow/glow on the arc**.
- [ ] Background warm-zone gradient ≤ 4% shift.
- [ ] Load: arc fill + count-up **~800 ms ease-out cubic, synced**; caption staggered +120 ms.
- [ ] Value change: re-animate from previous value ~450 ms ease-out; honor reduce-motion.

---

## Sources
- Copilot Money craft / ex-Apple, native, animated charts — [Apple Developer](https://developer.apple.com/articles/copilot-money/), [SaaSweep review](https://www.saasweep.com/blog/copilot-money-review), [StackSwitch](https://stackswitch.app/review/copilot-money), [Money with Katie](https://moneywithkatie.com/copilot-review-a-budgeting-app-that-finally-gets-it-right/)
- Monzo "left to spend today" + neobank restraint — [Phenomenon fintech patterns](https://phenomenonstudio.com/article/fintech-design-breakdown-the-most-common-design-patterns/), [Monzo design blog](https://monzo.com/blog/topic/design)
- Number/figure typography (tabular, weight, money-as-hero) — [Jigsaw tabular figures](https://medium.com/jigsaw-xyz/typography-in-finance-part-1-tabular-figures-4c21d4ed8097), [fintech typography pt.1](https://medium.com/design-bootcamp/the-elements-of-fintech-typography-part-1-readable-money-b6c1226acbde), [UXDA dos & donts](https://www.theuxda.com/blog/top-20-financial-ux-dos-and-donts-to-boost-customer-experience), [fontalternatives fintech fonts](https://fontalternatives.com/best-fonts-for/fintech/), [Datawrapper fonts for dataviz](https://blog.datawrapper.de/fonts-for-data-visualization/)
- Currency symbol treatment — [type.today currency manual](https://type.today/en/journal/currency), [Society of Fonts currency](https://www.societyoffonts.com/2017/11/28/letterlike-symbolspart-4-currency/), [bitcoin.design units & symbols](https://bitcoin.design/guide/designing-products/units-and-symbols/)
- SF Pro / SF Pro Rounded — [protosketch SF display vs text](https://protosketch.io/san-francisco-display-vs-text-compact-vs-normal-a-brief-review/), [DeepWiki SF Pro Rounded](https://deepwiki.com/sahibjotsaggu/San-Francisco-Pro-Fonts/3-sf-pro-rounded), [Apple Fonts](https://developer.apple.com/fonts/)
- Gauge geometry (180 vs 270 vs full) + stroke ratio — [Domo gauge charts](https://www.domo.com/learn/charts/gauge-chart), [CleanChart gauge guide](https://www.cleanchart.app/blog/how-to-create-gauge-chart), [fullstack SVG gauge](https://www.fullstack.com/labs/resources/blog/creating-an-svg-gauge-component-from-scratch), [Jetpack Compose semicircle](https://medium.com/@saykat-mir/building-an-animated-semi-circle-progress-indicator-in-jetpack-compose-a-deep-dive-d5d9de6c3459), [Ant Design progress](https://ant.design/components/progress/)
- Shadows / elevation (premium vs cheap) — [Josh Comeau designing shadows](https://www.joshwcomeau.com/css/designing-shadows/), [LogRocket shadows](https://blog.logrocket.com/ux-design/shadows-ui-design-tips-best-practices/), [designsystems.surf elevation](https://designsystems.surf/articles/depth-with-purpose-how-elevation-adds-realism-and-hierarchy), [Fluent elevation](https://fluent2.microsoft.design/elevation)
- Motion (durations, easing, count-up) — [Material 3 easing/duration](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs), [NN/g animation duration](https://www.nngroup.com/articles/animation-duration/), [Motion easing functions](https://motion.dev/docs/easing-functions), [CSS-Tricks number counters](https://css-tricks.com/animating-number-counters/), [Webflow ease-out counter](https://showcased.webflow.io/projects/counter-up-animation-easing)
- AI/cheap tells (rainbow gradient, glassmorphism, generic) — [Eggradients 2026 gradients](https://www.eggradients.com/blog/gradient-ui-in-2026), [Rythmux "why your AI UI looks the same"](https://medium.com/@Rythmuxdesigner/why-your-ai-generated-ui-looks-like-everyone-elses-and-how-to-break-the-pattern-7a3bf6b070be)
