# Dark Mode Readability — Onboarding Sky Palettes (WCAG-verified)

The onboarding flow paints its own full-screen sky (warm cream by day, deep
navy by night) instead of the app's neutral backgrounds, so it carries its own
palette — `SKY_DAY` / `SKY_NIGHT` in `src/screens/shared/Onboarding.tsx`.
Every text pair below was computed with the exact WCAG 2.1 relative-luminance
formula (sRGB linearization, 0.2126/0.7152/0.0722 coefficients).

**Targets:** body & secondary text ≥ 4.5:1 · placeholders/hints ≥ 3:1 (flagged
if under 4.5) · CTA text ≥ 4.5:1 · non-text UI (icons, active dots) ≥ 3:1.

## Day palette (sky `#F3EAD6`)

| Token | Hex | vs sky | vs surface `#FFFDF9` | Verdict |
|---|---|---|---|---|
| ink (body) | `#2E2E1F` | 11.50:1 | 13.54:1 | PASS |
| sub (secondary) | `#6E6B54` | **4.51:1** | 5.31:1 | PASS — **do not lighten** (margin is 0.01) |
| faint (placeholders only) | `#8A8770` | 3.04:1 | 3.58:1 | 3:1 band — never body copy |
| CTA `#FFFFFF` on olive `#4F5104` | — | 8.36:1 | — | PASS |

## Night palette (sky `#232B40`)

| Token | Hex | vs sky | vs surface `#2B3248` | Verdict |
|---|---|---|---|---|
| ink (body) | `#F0EDE8` | 12.06:1 | 10.88:1 | PASS |
| sub (secondary) | `#AEB6CC` | 6.95:1 | 6.27:1 | PASS |
| faint (placeholders only) | `#8C93A8` | 4.60:1 | 4.15:1 | PASS / 3:1 band on surface |
| CTA ink `#23250F` on gold `#DEAB22` | — | 7.41:1 | — | PASS |
| gold `#DEAB22` as UI color | — | 6.68:1 | 6.02:1 | PASS (≥ 3:1) |

If a future use needs fully-4.5:1 faints: day `#6D6A58` (4.56:1), night
`#939AAD` (4.52:1 vs surface).

## Rules learned (apply to ANY screen on a tinted/scenic background)

1. **Never use the app's neutral `C` tokens on a tinted scene.** Neutral grey
   surfaces (`#1E1E1E`) on navy look broken; pure white cards on cream wash
   out. Tint surfaces toward the scene hue.
2. **Day elevation = warm shadow, never black.** Shadows on cream must be a
   darkened tint of the background hue: `shadowColor #7A6238`, opacity
   0.14–0.20, radius 16. Black shadows read as grime.
3. **Night elevation = lighter fill + stroke, NO shadow** (Material dark
   rule). Surfaces are the sky lightened with a white-alpha overlay
   (`rgba(255,255,255,0.07)` ≈ `#333A4E`) plus a `rgba(255,255,255,0.14)`
   1.5px stroke.
4. **Glass fields need ≥ ~0.5 white alpha by day** to keep text AAA;
   20–40% alpha is decoration-only. The 1px translucent-white border ("glass
   edge") is what makes the surface pop on both themes.
5. **Accents must flip at night.** Day olive `#4F5104` on the navy sky is
   ≈1.3:1 — invisible. Night accents map to bright variants
   (`NIGHT_ACCENT` in Onboarding.tsx): olive→`#A8AD52`, bronze→`#DEAB22`,
   brown→`#C2A37E`. Night CTAs are gold-family with near-black ink `#23250F`.
6. **Inactive dots/borders at night are cream-alpha**, not grey:
   `rgba(240,237,232,0.28)`.
7. **Focus states animate color only, never borderWidth** (1px layout jump):
   day focus → olive border + raise bg alpha; night focus → gold border.
8. **Segmented controls follow the iOS luminance flip:** day = darker groove
   track + near-white elevated thumb; night = darker track + lighter thumb,
   no shadow.
9. **Known day-mode caveat:** slide-2's bronze CTA (`#B2780A`) with white text
   is 3.76:1 — passes only as large text. If the CTA ever drops below
   18pt-semibold, switch its day text to ink or its bg to olive.

## Testing checklist (per screen, per theme)

- [ ] Body + secondary text ≥ 4.5:1 against BOTH the sky and any card it sits on
- [ ] The constraint side differs: day = test dark text vs the **sky** (darker
      than cards); night = test light text vs the **card** (lighter than sky)
- [ ] No neutral-grey surface on a tinted background
- [ ] No black shadow on cream; no shadow at all at night
- [ ] Accents/CTAs use the night-bright variants in dark
- [ ] Placeholders may sit in the 3:1 band; required hints may not

Related: `memory/dark-mode-checklist` (app-wide 9-point list), root
`WCAG_AUDIT.md` (contrast/tap-target audit), `docs/research/dark-mode-polish-research.md`.
