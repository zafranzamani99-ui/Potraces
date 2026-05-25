# Realistic Receipt Paper Texture — Research & Code Reference

## What Makes a Thermal Receipt Look Real

Physical thermal receipt characteristics (from thermal paper manufacturing research):
1. **Paper grain** — slight fibrous texture, not perfectly smooth
2. **Warm yellowing** — thermal paper has a slight warm/cream tint, not pure white
3. **Faint horizontal thermal lines** — from the print head dragging across
4. **Print imperfections** — thermal dots aren't perfectly uniform; slight density variation
5. **Edge aging/darkening** — edges yellow/darken faster than center (vignette effect)
6. **Background fogging** — whole sheet slowly grays/yellows over time
7. **Torn/ripped bottom edge** — irregular, organic tear, not clean-cut
8. **Slight curl shadow** — paper curls slightly, creating subtle shadow at edges
9. **Dot-matrix character quality** — text has subtle pixelation/stepping

---

## TECHNIQUE 1: SVG Noise Grain via feTurbulence (CSS — for PDF)

The core technique for paper grain. Works in WebKit (expo-print).

### Inline SVG data URI approach (no external files):

```css
.page::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  opacity: 0.04;
  pointer-events: none;
  border-radius: inherit;
  mix-blend-mode: multiply;
}
```

### Parameters explained:
- `baseFrequency='0.65'` — controls grain size. Higher = finer grain. For paper: 0.5–0.8
- `numOctaves='3'` — complexity layers. 3 is good balance of detail vs performance
- `stitchTiles='stitch'` — makes the noise tile seamlessly
- `type='fractalNoise'` — smoother than 'turbulence', better for paper
- `opacity: 0.04` — very subtle, just enough to break the flat digital look

### For rougher/more visible paper texture, add lighting:

```css
.page::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.04' numOctaves='5' stitchTiles='stitch'/%3E%3CfeDiffuseLighting in='result' lighting-color='%23F9F6F0' surfaceScale='2'%3E%3CfeDistantLight azimuth='45' elevation='60'/%3E%3C/feDiffuseLighting%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23paper)'/%3E%3C/svg%3E");
  opacity: 0.12;
  pointer-events: none;
  mix-blend-mode: multiply;
}
```

- `feDiffuseLighting` + `feDistantLight` creates a 3D paper surface illusion
- `surfaceScale='2'` controls how bumpy the surface appears
- `azimuth='45' elevation='60'` = light from upper-left at 60 degrees

---

## TECHNIQUE 2: Thermal Print Lines (CSS)

Already implemented, but can be improved with variation:

```css
/* Current: uniform lines */
.page::before {
  background: repeating-linear-gradient(
    0deg,
    transparent 0, transparent 4pt,
    rgba(0,0,0,0.06) 4pt, rgba(0,0,0,0.06) 4.5pt
  );
}

/* Better: varied line intensity (simulates real print head inconsistency) */
.page::before {
  background:
    repeating-linear-gradient(
      0deg,
      transparent 0, transparent 3.8pt,
      rgba(0,0,0,0.04) 3.8pt, rgba(0,0,0,0.04) 4.3pt
    ),
    repeating-linear-gradient(
      0deg,
      transparent 0, transparent 8pt,
      rgba(0,0,0,0.025) 8pt, rgba(0,0,0,0.025) 8.3pt
    );
}
```

---

## TECHNIQUE 3: Edge Aging / Vignette (CSS)

Simulates edges darkening/yellowing before center:

```css
.page {
  box-shadow:
    /* outer card shadow */
    0 1pt 6pt rgba(0,0,0,0.08),
    /* inner vignette — warm yellow aging at edges */
    inset 0 0 40pt 8pt rgba(180, 160, 120, 0.06),
    /* deeper corners */
    inset 0 0 80pt 16pt rgba(160, 140, 100, 0.03);
}
```

Or use a radial gradient overlay:

```css
.page::before {
  /* combine with thermal lines */
  background:
    /* edge aging vignette */
    radial-gradient(
      ellipse at center,
      transparent 60%,
      rgba(180, 160, 120, 0.06) 100%
    ),
    /* thermal lines */
    repeating-linear-gradient(
      0deg,
      transparent 0, transparent 3.8pt,
      rgba(0,0,0,0.04) 3.8pt, rgba(0,0,0,0.04) 4.3pt
    );
}
```

---

## TECHNIQUE 4: Realistic Torn Edge (CSS)

### Simple zigzag (current approach):
```css
.tear-edge {
  background:
    linear-gradient(135deg, #F9F6F0 33.3%, transparent 33.3%) 0 0,
    linear-gradient(225deg, #F9F6F0 33.3%, transparent 33.3%) 0 0;
  background-size: 12pt 100%;
  background-repeat: repeat-x;
}
```

### Irregular organic tear using clip-path polygon:
Generate varying Y-values to create a non-uniform tear:

```css
.tear-edge {
  height: 16pt;
  background: #F9F6F0;
  clip-path: polygon(
    0% 40%, 2% 0%, 4% 55%, 6% 10%, 8% 65%, 10% 5%,
    12% 50%, 14% 15%, 16% 60%, 18% 0%, 20% 45%, 22% 20%,
    24% 70%, 26% 5%, 28% 55%, 30% 15%, 32% 60%, 34% 0%,
    36% 50%, 38% 25%, 40% 65%, 42% 10%, 44% 55%, 46% 0%,
    48% 45%, 50% 20%, 52% 70%, 54% 5%, 56% 50%, 58% 15%,
    60% 60%, 62% 0%, 64% 45%, 66% 25%, 68% 65%, 70% 10%,
    72% 55%, 74% 0%, 76% 50%, 78% 20%, 80% 60%, 82% 5%,
    84% 45%, 86% 15%, 88% 70%, 90% 0%, 92% 55%, 94% 10%,
    96% 50%, 98% 0%, 100% 45%,
    100% 100%, 0% 100%
  );
}
```

### Even more organic: SVG path with bezier curves in CSS:

```css
.tear-edge {
  height: 18pt;
  background: linear-gradient(to bottom, #F9F6F0, #F5F2EA);
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 18'%3E%3Cpath d='M0,6 Q5,0 10,8 Q15,14 20,4 Q25,0 30,9 Q35,16 40,5 Q45,0 50,7 Q55,13 60,3 Q65,0 70,10 Q75,15 80,4 Q85,0 90,8 Q95,14 100,5 Q105,0 110,9 Q115,16 120,3 Q125,0 130,7 Q135,12 140,4 Q145,0 150,10 Q155,15 160,5 Q165,0 170,8 Q175,13 180,3 Q185,0 190,9 Q195,16 200,4 Q205,0 210,7 Q215,14 220,5 Q225,0 230,10 Q235,15 240,3 Q245,0 250,8 Q255,13 260,5 Q265,0 270,9 Q275,16 280,4 Q285,0 290,7 Q295,14 300,6 L300,18 L0,18 Z' fill='white'/%3E%3C/svg%3E");
  -webkit-mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
}
```

---

## TECHNIQUE 5: Dot-Matrix / Thermal Print Character Feel (CSS)

Slight text rendering adjustments to break perfect digital text:

```css
.receipt-text {
  font-family: 'Courier New', 'Courier', monospace;
  /* OR for a more modern thermal look: */
  font-family: -apple-system, sans-serif;
  -webkit-font-smoothing: none; /* kills antialiasing = more "printed" */
  letter-spacing: 0.3pt;
}

/* For labels/small text — simulate slight print fading */
.faded-print {
  color: #555;
  opacity: 0.85;
  text-shadow: 0 0 0.5pt rgba(0,0,0,0.1);
}
```

---

## TECHNIQUE 6: Complete CSS Receipt Paper (Combined)

All techniques merged for PDF export:

```css
.page {
  background: #F9F6F0;
  position: relative;
  border-radius: 2pt;
  overflow: hidden;
  box-shadow:
    0 1pt 6pt rgba(0,0,0,0.08),
    inset 0 0 40pt 8pt rgba(180, 160, 120, 0.06);
}

/* Layer 1: Paper grain (feTurbulence noise) */
.page::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  opacity: 0.04;
  pointer-events: none;
  mix-blend-mode: multiply;
  z-index: 1;
}

/* Layer 2: Thermal lines + edge aging */
.page::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background:
    radial-gradient(ellipse at center, transparent 60%, rgba(180,160,120,0.06) 100%),
    repeating-linear-gradient(0deg,
      transparent 0, transparent 3.8pt,
      rgba(0,0,0,0.04) 3.8pt, rgba(0,0,0,0.04) 4.3pt
    ),
    repeating-linear-gradient(0deg,
      transparent 0, transparent 8pt,
      rgba(0,0,0,0.02) 8pt, rgba(0,0,0,0.02) 8.3pt
    );
  pointer-events: none;
  border-radius: 2pt;
  z-index: 2;
}

/* Organic torn bottom edge */
.tear-edge {
  width: 300pt;
  height: 16pt;
  margin: 0 auto;
  position: relative;
  background: #D8D5CE;
  overflow: hidden;
}
.tear-edge::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 16pt;
  background: #F9F6F0;
  clip-path: polygon(
    0% 40%, 2% 0%, 4% 55%, 6% 10%, 8% 65%, 10% 5%,
    12% 50%, 14% 15%, 16% 60%, 18% 0%, 20% 45%, 22% 20%,
    24% 70%, 26% 5%, 28% 55%, 30% 15%, 32% 60%, 34% 0%,
    36% 50%, 38% 25%, 40% 65%, 42% 10%, 44% 55%, 46% 0%,
    48% 45%, 50% 20%, 52% 70%, 54% 5%, 56% 50%, 58% 15%,
    60% 60%, 62% 0%, 64% 45%, 66% 25%, 68% 65%, 70% 10%,
    72% 55%, 74% 0%, 76% 50%, 78% 20%, 80% 60%, 82% 5%,
    84% 45%, 86% 15%, 88% 70%, 90% 0%, 92% 55%, 94% 10%,
    96% 50%, 98% 0%, 100% 45%,
    100% 100%, 0% 100%
  );
}
```

---

## TECHNIQUE 7: React Native SVG (for ViewShot Capture)

react-native-svg does NOT support `feTurbulence` or SVG filters. Alternatives:

### A) Dot-pattern grain using SVG Pattern + small circles:

```tsx
import Svg, { Defs, Pattern, Circle, Rect } from 'react-native-svg';

{/* Paper grain — random-looking dots */}
<Svg width={RECEIPT_W} height={contentHeight} style={StyleSheet.absoluteFill}>
  <Defs>
    <Pattern id="grain" patternUnits="userSpaceOnUse" width={6} height={6}>
      <Circle cx={1} cy={2} r={0.4} fill="rgba(0,0,0,0.06)" />
      <Circle cx={4} cy={5} r={0.3} fill="rgba(0,0,0,0.04)" />
      <Circle cx={3} cy={1} r={0.35} fill="rgba(0,0,0,0.05)" />
      <Circle cx={5} cy={3} r={0.3} fill="rgba(0,0,0,0.03)" />
    </Pattern>
  </Defs>
  <Rect x={0} y={0} width={RECEIPT_W} height={contentHeight} fill="url(#grain)" />
</Svg>
```

### B) Multiple horizontal line patterns (varied thermal lines):

```tsx
<Svg width={RECEIPT_W} height={2000} style={StyleSheet.absoluteFill}>
  <Defs>
    {/* Primary thermal lines */}
    <Pattern id="thermal1" patternUnits="userSpaceOnUse" width={RECEIPT_W} height={4.5}>
      <SvgRect x={0} y={4} width={RECEIPT_W} height={0.5} fill="rgba(0,0,0,0.04)" />
    </Pattern>
    {/* Secondary wider-spaced accent lines */}
    <Pattern id="thermal2" patternUnits="userSpaceOnUse" width={RECEIPT_W} height={9}>
      <SvgRect x={0} y={8.5} width={RECEIPT_W} height={0.3} fill="rgba(0,0,0,0.025)" />
    </Pattern>
  </Defs>
  <SvgRect x={0} y={0} width={RECEIPT_W} height={2000} fill="url(#thermal1)" />
  <SvgRect x={0} y={0} width={RECEIPT_W} height={2000} fill="url(#thermal2)" />
</Svg>
```

### C) Organic torn edge using SVG Path with curves:

```tsx
import Svg, { Path } from 'react-native-svg';

const RECEIPT_W = 360;
const TEAR_H = 14;

// Generate organic tear path with quadratic bezier curves
function generateTearPath(width: number, height: number): string {
  let d = `M0,${height * 0.4}`;
  const segments = 30;
  const segW = width / segments;
  for (let i = 0; i < segments; i++) {
    const x1 = i * segW + segW * 0.5;
    const y1 = Math.random() > 0.5
      ? height * (0.05 + Math.random() * 0.3)
      : height * (0.5 + Math.random() * 0.4);
    const x2 = (i + 1) * segW;
    const y2 = Math.random() > 0.5
      ? height * (0.0 + Math.random() * 0.2)
      : height * (0.4 + Math.random() * 0.5);
    d += ` Q${x1},${y1} ${x2},${y2}`;
  }
  d += ` L${width},${height} L0,${height} Z`;
  return d;
}

// Pre-generate a stable path (don't regenerate on every render)
const TEAR_PATH = "M0,6 Q6,0 12,9 Q18,14 24,4 Q30,1 36,10 Q42,15 48,5 Q54,0 60,8 Q66,13 72,3 Q78,0 84,10 Q90,16 96,4 Q102,1 108,9 Q114,14 120,3 Q126,0 132,8 Q138,12 144,5 Q150,0 156,10 Q162,15 168,4 Q174,1 180,9 Q186,14 192,3 Q198,0 204,8 Q210,13 216,5 Q222,0 228,10 Q234,16 240,4 Q246,1 252,8 Q258,13 264,5 Q270,0 276,9 Q282,16 288,4 Q294,0 300,7 Q306,14 312,5 Q318,1 324,9 Q330,14 336,4 Q342,0 348,8 Q354,13 360,6 L360,14 L0,14 Z";

<Svg width={RECEIPT_W} height={TEAR_H}>
  <Path d={TEAR_PATH} fill="#F9F6F0" />
</Svg>
```

### D) Edge vignette using LinearGradient overlays:

```tsx
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

{/* Top edge aging */}
<Svg width={RECEIPT_W} height={40} style={{ position: 'absolute', top: 0 }}>
  <Defs>
    <LinearGradient id="topVignette" x1="0" y1="0" x2="0" y2="1">
      <Stop offset="0" stopColor="#B4A078" stopOpacity="0.08" />
      <Stop offset="1" stopColor="#B4A078" stopOpacity="0" />
    </LinearGradient>
  </Defs>
  <Rect x={0} y={0} width={RECEIPT_W} height={40} fill="url(#topVignette)" />
</Svg>

{/* Left edge aging */}
<Svg width={30} height={contentHeight} style={{ position: 'absolute', left: 0, top: 0 }}>
  <Defs>
    <LinearGradient id="leftVignette" x1="0" y1="0" x2="1" y2="0">
      <Stop offset="0" stopColor="#B4A078" stopOpacity="0.06" />
      <Stop offset="1" stopColor="#B4A078" stopOpacity="0" />
    </LinearGradient>
  </Defs>
  <Rect x={0} y={0} width={30} height={contentHeight} fill="url(#leftVignette)" />
</Svg>
```

---

## How Fintech Apps Handle Receipts

Research findings on major apps:

- **Wise/Revolut**: Don't try to mimic physical receipts. Use clean card-based layouts with clear hierarchy. Receipt sharing is a structured data card, not a skeuomorphic paper.
- **Expensify**: Auto-generates structured audit receipts when card transactions occur. Clean, formal formatting.
- **General pattern**: Modern fintech apps moved away from skeuomorphic paper. They use clean, minimal layouts BUT add subtle texture/warmth to differentiate from generic UI.

**Takeaway**: The best digital receipts are NOT fully skeuomorphic (no extreme paper simulation). They use **subtle hints** — a warm background, faint grain, organic torn edge — to signal "this is a receipt" without looking gimmicky. The warmth and imperfection are what sell it.

---

## WebKit Compatibility Notes

For expo-print PDF rendering (WebKit):
- `mix-blend-mode: multiply` — supported
- `clip-path: polygon(...)` — supported with `-webkit-` prefix
- SVG data URI in `background-image` — supported
- `feTurbulence` in inline SVG — supported
- `-webkit-mask-image` with SVG data URI — supported
- `radial-gradient` — supported
- `repeating-linear-gradient` — supported
- `inset box-shadow` — supported
- `::before` / `::after` pseudo-elements — supported

---

## TECHNIQUE 8: Crumpled / Wrinkled Paper Surface (SVG feDiffuseLighting)

The key technique for creating actual paper wrinkles/crumples (NOT horizontal lines).

### How it works:
1. `feTurbulence` generates Perlin noise at LOW frequency (0.03-0.05) = large soft undulations
2. `feDiffuseLighting` treats the noise as a bump map and shines a virtual light on it
3. `feDistantLight` controls the light direction (azimuth + elevation)
4. Result: 3D-looking surface relief that resembles real crumpled paper

### Key parameters:
- `baseFrequency='0.04 0.03'` — asymmetric X/Y for natural randomness. Low = large wrinkles
- `numOctaves='5'` — high detail for realistic complexity
- `surfaceScale='1.5'` — how pronounced the bumps are (1-2 = subtle, 5+ = dramatic)
- `lighting-color='#F9F6F0'` — warm cream to match paper color
- `azimuth='45'` — light from upper-left (natural reading light angle)
- `elevation='55'` — moderate angle so wrinkles cast soft shadows
- `seed='2'` — deterministic noise pattern (change for different wrinkle layout)

### Inline SVG data URI (URL-encoded, ready for CSS background-image):
```
data:image/svg+xml,%3Csvg viewBox='0 0 300 600' xmlns='http://www.w3.org/2000/svg'%3E
%3Cfilter id='w' x='0' y='0' width='100%25' height='100%25'%3E
  %3CfeTurbulence type='fractalNoise' baseFrequency='0.04 0.03'
    numOctaves='5' seed='2' stitchTiles='stitch' result='noise'/%3E
  %3CfeDiffuseLighting in='noise' lighting-color='%23F9F6F0'
    surfaceScale='1.5' result='lit'%3E
    %3CfeDistantLight azimuth='45' elevation='55'/%3E
  %3C/feDiffuseLighting%3E
  %3CfeComposite in='lit' in2='lit' operator='arithmetic'
    k1='0' k2='1' k3='0' k4='0'/%3E
%3C/filter%3E
%3Crect width='100%25' height='100%25' filter='url(%23w)'/%3E
%3C/svg%3E
```

### CSS application:
```css
.page::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background-image: url("data:image/svg+xml,..."); /* URI above */
  background-size: 300pt 600pt;
  background-repeat: repeat;
  opacity: 0.14;       /* subtle — just enough to see wrinkles */
  mix-blend-mode: multiply;
  pointer-events: none;
  z-index: 2;
}
```

### Combining with diagonal crease lines (CSS gradients):
Each crease = a narrow dark line + adjacent narrow light line (shadow + highlight of a fold):
```css
linear-gradient(132deg,
  transparent 0%, transparent 28%,
  rgba(0,0,0,0.02) 29%, rgba(255,255,255,0.018) 31%,
  transparent 32%, transparent 100%
)
```
Use 3-4 creases at different angles (132deg, 218deg, 156deg, 195deg) at different positions.

### Tuning for more/less visible wrinkles:
- **More wrinkly**: increase `surfaceScale` (2-3), increase `opacity` (0.18-0.25)
- **Less wrinkly**: decrease `surfaceScale` (0.8-1.2), decrease `opacity` (0.08-0.12)
- **Bigger wrinkles**: lower `baseFrequency` (0.02-0.03)
- **Tighter crumples**: higher `baseFrequency` (0.06-0.08)

---

## Sources

- [CSS-Tricks: Grainy Gradients](https://css-tricks.com/grainy-gradients/)
- [FreeCodeCamp: Grainy CSS Backgrounds Using SVG Filters](https://www.freecodecamp.org/news/grainy-css-backgrounds-using-svg-filters/)
- [ibelick: Creating grainy backgrounds with CSS](https://ibelick.com/blog/create-grainy-backgrounds-with-css)
- [Codrops: SVG Filter Effects with feTurbulence](https://tympanus.net/codrops/2019/02/19/svg-filter-effects-creating-texture-with-feturbulence/)
- [CodePen: Thermal printer Receipt](https://codepen.io/avinay/pen/jOOMyqj)
- [CodePen: Torn Receipt UI (CSS Only)](https://codepen.io/vkzawa/pen/PpNzZj)
- [CodePen: Dot-matrix printing](https://codepen.io/zaus/pen/AEzpWg)
- [una.im: CSS Vignettes 3 Ways](https://una.im/vignettes/)
- [MDN: feTurbulence](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feTurbulence)
- [Panda Paper Roll: Thermal Paper Fading](https://pandapaperroll.com/thermal-paper-fades-restore/)
- [FreeFrontend: 33 CSS Paper Effects](https://freefrontend.com/css-paper-effects/)
- [fffuel: nnnoise SVG Noise Generator](https://www.fffuel.co/nnnoise/)
- [CodePen: Rough Paper Texture with SVG Filters](https://codepen.io/Chokcoco/pen/OJWLXPY)
- [CodePen: CSS wrinkled paper texture](https://codepen.io/giana/pen/YVEMaM)
- [CodePen: SVG Filter Paper Texture](https://codepen.io/alphardex/pen/vYGWJpq)
- [CodePen: feTurbulence + feDiffuseLighting](https://codepen.io/yoksel/full/pOoYzL)
- [tutorialpedia: Old Paper Background with Pure CSS](https://www.tutorialpedia.org/blog/old-paper-background-texture-with-just-css/)
- [DEV: 3 experiments with CSS paper effects](https://dev.to/s_aitchison/3-experiments-with-css-paper-effects-2o56)
