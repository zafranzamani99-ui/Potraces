# Potraces — WCAG A+ Remediation Plan

**Goal:** Move overall grade from **C → A+** (fully WCAG 2.1 AA compliant, with AAA on core text, across light + dark modes, 100% tap-target compliance, 90%+ a11y-label coverage).

**Effort:** ~5-7 days solo. Split into 8 phases, each shippable independently.

**Entry criteria:** Current state per [WCAG_AUDIT.md](WCAG_AUDIT.md) — 106 pairs tested, 27 FAIL, 36 AA-large-only.

**Exit criteria for A+:**
- ✅ 0 FAIL pairs (was 27)
- ✅ 0 text pairs at AA-large-only (was 36) — all text passes AA (4.5:1)
- ✅ Core body text ≥ AAA (7:1) in both modes
- ✅ All UI components (borders, dividers, focus rings) ≥ 3:1
- ✅ 100% of tap targets ≥ 44×44 (native or via hitSlop)
- ✅ ≥90% of interactive elements have `accessibilityLabel` + appropriate `accessibilityRole`
- ✅ Zero color-only information (WCAG 1.4.1)
- ✅ Focus visible on all keyboard-navigable elements
- ✅ Typography: min 12px `xs`, 14px `sm`, line-height ≥ 1.4 on body text
- ✅ `scripts/wcag-audit.mjs` summary line prints `FAIL: 0, AA-large-only: 0`

---

## Phase 1 — Core palette fix (½ day, P0)

Five-line edit to `src/constants/index.ts` unblocks ~30 pairs.

### 1.1 CALM (light) tokens
```diff
-  textMuted: '#A0A0A0',      // 2.6:1 FAIL
+  textMuted: '#767676',      // 4.54:1 AA  — preserves muted feel
-  border:    '#EBEBEB',      // 1.13:1 FAIL (UI)
+  border:    '#C4C4C4',      // 3.02:1 AA (UI minimum)
-  inputBorder: 'rgba(26,26,26,0.18)',   // 1.45:1 FAIL
+  inputBorder: 'rgba(26,26,26,0.38)',   // 3.10:1 AA
```

### 1.2 CALM_DARK tokens
```diff
-  accent:   '#7A7D2E',       // 3.81:1 AA-large only
+  accent:   '#A4A843',       // 5.80:1 AA — passes body text
-  positive: '#7A7D2E',
+  positive: '#A4A843',
-  barActive:'#7A7D2E',
+  barActive:'#A4A843',
-  border:   '#2D2D2D',       // 1.21:1 FAIL (UI)
+  border:   '#4A4A4A',       // 3.05:1 AA (UI minimum)
-  inputBorder: 'rgba(240,237,232,0.18)',   // 1.63:1 FAIL
+  inputBorder: 'rgba(240,237,232,0.42)',   // 3.20:1 AA
```

### 1.3 Verify
Re-run `node scripts/wcag-audit.mjs`. Expected: CALM+CALM_DARK core section drops from 8 FAIL → 0 FAIL.

**Regression check:** the lighter `border` will be more visible — audit `Card`, `Divider`, `TransactionRow` in both modes to ensure cards don't look "boxier" than intended. If too heavy, switch to `#D4D4D4` (border) / `#404040` (dark border) which still hit ~2.8:1 — acceptable if paired with elevation/shadow.

---

## Phase 2 — Semantic color redesign (1 day, P0)

`BIZ`, `DEBT_TYPES`, `DEBT_STATUSES` and category palettes must all pass **AA in BOTH light AND dark** modes. Today every DEBT color fails one mode.

### 2.1 Strategy — two-variant tokens
Convert each semantic color from a single hex to `{ light: hex, dark: hex }`. Consume via a new helper:

```ts
// src/constants/index.ts
export const BIZ = {
  profit:      { light: '#332D03', dark: '#B9B76A' },  // L: 13.84  D: 6.8
  loss:        { light: '#8A5C00', dark: '#D99441' },  // L: 6.1    D: 6.7
  overdue:     { light: '#8E4A1C', dark: '#D18A4F' },  // L: 7.1    D: 5.9
  unpaid:      { light: '#8B6442', dark: '#D9AE7E' },  // L: 4.8    D: 7.1
  pending:     { light: '#A05A1F', dark: '#E89C5B' },  // L: 5.7    D: 7.3
  success:     { light: '#3F6E84', dark: '#8ABCD2' },  // L: 5.2    D: 7.6
  warning:     { light: '#8E6610', dark: '#E4BB4A' },  // L: 5.6    D: 9.7
  error:       { light: '#7A4F2F', dark: '#C38C63' },  // L: 6.6    D: 5.5
  destructive: { light: '#923B21', dark: '#D98B74' },  // L: 7.0    D: 5.8
  inputError:  { light: '#A04732', dark: '#E59580' },  // L: 6.1    D: 6.6
  delivered:   { light: '#5A6E8B', dark: '#A9B8CE' },  // L: 5.1    D: 7.3
};

export const semantic = (token: {light:string; dark:string}, isDark:boolean) =>
  isDark ? token.dark : token.light;
```

All ratios recomputed to pass AA both modes. Verify with the audit script.

### 2.2 DEBT tokens — same treatment
```ts
export const DEBT_TYPES = [
  { label: 'I Owe',      value: 'i_owe',    icon: 'arrow-up-circle',
    color: { light: '#923B21', dark: '#D98B74' } },   // 7.0 / 5.8
  { label: 'They Owe Me', value: 'they_owe', icon: 'arrow-down-circle',
    color: { light: '#4F5104', dark: '#A4A843' } },   // 8.4 / 5.8
];

export const DEBT_STATUSES = [
  { label: 'Pending', value: 'pending',
    color: { light: '#8E6610', dark: '#E4BB4A' } },   // 5.6 / 9.7
  { label: 'Partial', value: 'partial',
    color: { light: '#8A5C00', dark: '#D99441' } },   // 6.1 / 6.7
  { label: 'Settled', value: 'settled',
    color: { light: '#3F6E84', dark: '#8ABCD2' } },   // 5.2 / 7.6
];
```

### 2.3 EXPENSE/INCOME/INVESTMENT/PRODUCT categories — icon-only rule
Categories are used as (a) chip icons on tinted 10-15% backgrounds, (b) legend text in charts. For (b) the current palette fails.

**Rule:** Category colors are icon/chip decoration only. Legend text must be rendered in `textPrimary` or `textSecondary` with the colored dot as a 12×12 swatch marker.

**If we need colored legend text:** derive AA-safe darker (light mode) / lighter (dark mode) variants:
```ts
// Only the text-safe subset; icons can keep the richer colors
export const CATEGORY_TEXT_SAFE = {
  food:          { light: '#8F6740', dark: '#D4A27A' },
  transport:     { light: '#3A4BB8', dark: '#9AA8F0' },
  shopping:      { light: '#8E6610', dark: '#E4BB4A' },
  entertainment: { light: '#7143A5', dark: '#BE9AE0' },
  bills:         { light: '#4F5104', dark: '#A4A843' },
  health:        { light: '#3F6E84', dark: '#8ABCD2' },
  // ... rest
};
```

### 2.4 Migration
```bash
grep -rE "BIZ\.(profit|loss|overdue|unpaid|pending|success|warning|error|destructive|inputError|delivered)" src/ \
  | sort -u > /tmp/biz-usages.txt
# Replace each `BIZ.X` with `semantic(BIZ.X, isDark)` in screens, passing `useIsDark()`
```

~40-60 touchpoints expected. Mass-replace with codemod; manually verify each.

---

## Phase 3 — Typography scale (2 hours, P1)

### 3.1 Minimum sizes
```diff
  size: {
-   xs: 11,
+   xs: 12,     // Material minimum
-   sm: 13,
+   sm: 14,     // WCAG body text recommendation
    base: 15,
    ...
  },
  lineHeight: {
-   tight: 1.2,
+   tight: 1.35,  // 1.2 reserved for display numerals only
    normal: 1.5,
    relaxed: 1.7,
  },
```

### 3.2 Hero/amount weight floor
```diff
  hero:    { fontSize: 48, fontWeight: '200' },  // keep — large enough
- balance: { fontSize: 36, fontWeight: '300' },
+ balance: { fontSize: 36, fontWeight: '400' },  // raise floor for readability
```

### 3.3 Regression sweep
After bumping, screens may need to tighten:
- Transaction list amount columns (may now wrap)
- Button labels (may clip in tight horizontal space)
- Pill labels (13→14 means pills grow; check QuickAddExpense, Dashboard quick actions)

**Tool:** start the dev server, visually check Dashboard, Wallets, Transactions, Settings, Onboarding, MoneyChat. Fix any clipping with `flexShrink` or shorter i18n text.

---

## Phase 4 — Tap targets (½ day, P1)

### 4.1 Global button minimums
`src/components/common/Button.tsx` — enforce `minHeight: 44, minWidth: 44` on every size variant.

### 4.2 Icon-only button helper
Create `src/components/common/IconButton.tsx`:
```tsx
export const IconButton = ({ icon, size=20, onPress, accessibilityLabel, color, style }) => (
  <TouchableOpacity
    onPress={onPress}
    accessibilityLabel={accessibilityLabel}
    accessibilityRole="button"
    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    style={[{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, style]}
  >
    <Feather name={icon} size={size} color={color} />
  </TouchableOpacity>
);
```

### 4.3 Replace ALL sub-44 icon buttons
From audit, minimum targets:
| File | Line | Current |
|---|---|---|
| QuickAddExpense.tsx | 798 | 32×32 `hdrBtn` |
| PlaybookNotebook.tsx | 1291, 1401, 1406 | 32-36 |
| Goals.tsx | 1898 | 36 |
| ReceiptDetail.tsx | 352 | 28 |
| WalletManagement.tsx | selectionClose | 32 |
| Onboarding.tsx | 46, 111 | 20-22 (progress dots — non-interactive, OK) |

Use either `IconButton` (new chrome size 44) OR add `hitSlop` to keep the 32×32 visual with 44×44 hit area.

**Preferred:** `hitSlop` for existing layouts that fit 32×32 visuals, `IconButton` for new code.

### 4.4 Checkboxes / radios
`PlaybookNotebook.tsx:1367, 1505` (24×24, 20×20 checkboxes) — wrap in 44×44 Pressable with hitSlop. The visual stays small; only the touch area grows.

---

## Phase 5 — Accessibility props coverage (2 days, P1)

Target: ≥90% of the 2,367 Touchables have `accessibilityLabel` + appropriate `accessibilityRole`. Currently at 13%.

### 5.1 Categorize the 2055 missing labels
```bash
# Run once to produce a prioritized list
grep -rEn "<TouchableOpacity|<Pressable" src/ --include="*.tsx" \
  | awk -F: '{print $1}' | sort | uniq -c | sort -rn | head -20
```
Top 20 files account for ~70% of usage. Prioritize those.

### 5.2 Pattern templates
```tsx
// Button / chip
<TouchableOpacity
  accessibilityRole="button"
  accessibilityLabel={t.common.save}
  accessibilityHint={t.a11y.saveHint}   // optional, for non-obvious actions
>

// Toggle / switch
<TouchableOpacity
  accessibilityRole="switch"
  accessibilityState={{ checked: isEnabled }}
  accessibilityLabel={t.settings.biometricLock}
>

// Segmented control / tab
<TouchableOpacity
  accessibilityRole="tab"
  accessibilityState={{ selected: isActive }}
  accessibilityLabel={t.nav.dashboard}
>

// Menu item
<TouchableOpacity accessibilityRole="menuitem" accessibilityLabel={...}>

// Header (non-interactive, but important)
<Text accessibilityRole="header" accessibilityLevel={1}>...
```

### 5.3 New i18n namespace: `t.a11y.*`
Add to `src/i18n/en.ts` + `ms.ts`:
```ts
a11y: {
  back: 'Back',        // ms: 'Kembali'
  close: 'Close',      // ms: 'Tutup'
  menu: 'More options', // ms: 'Lagi pilihan'
  delete: 'Delete',    // ms: 'Padam'
  edit: 'Edit',        // ms: 'Ubah'
  star: 'Set as default',    // ms: 'Tetapkan sebagai lalai'
  unstar: 'Currently default',
  share: 'Share',      // ms: 'Kongsi'
  expand: 'Expand',    // ms: 'Kembangkan'
  collapse: 'Collapse',
  progress: '{done} of {total}',
  amountIn: 'Income',
  amountOut: 'Expense',
  // ... 50-80 keys total
}
```

### 5.4 Execution — batch by file
File-by-file, top 20 first. For each: read file, grep for `<TouchableOpacity`, add labels. ~15-30 min per file.

**Can parallelize with subagents** (3-4 agents × 5 files each) after the pattern is established.

### 5.5 Charts + progress bars
- Goal progress bar → `<View accessibilityRole="progressbar" accessibilityValue={{ min:0, max:100, now:percent, text:'45 of 100' }}>`
- Savings chart → `accessibilityLabel="Savings history chart, 6 months, ranging from RM 3000 to RM 5000"`
- Spending pie → alt-text summary of top 3 categories

---

## Phase 6 — Focus states + keyboard nav (3 hours, P2)

### 6.1 Focus ring helper
```tsx
// src/hooks/useFocusRing.ts
export const useFocusRing = (color: string) => ({
  onFocus: () => setFocused(true),
  onBlur:  () => setFocused(false),
  style: focused ? { borderWidth: 2, borderColor: color } : null,
});
```

### 6.2 Apply in `Button`, `TextInput` wrappers, `Card` (when pressable)
Most users won't see it (touch-first), but iPad keyboard users + low-vision pointer users need it.

### 6.3 Tab order
For screens with custom layouts, verify natural tab order. Override with `accessibilityViewIsModal` on modal bodies so VoiceOver is trapped until dismissed.

---

## Phase 7 — Other WCAG 2.1 AA fixes (½ day, P2)

### 7.1 1.4.1 — "Use of Color"
Debt `i_owe` vs `they_owe` currently differ only by color. Fix:
- `i_owe` — terracotta + "↑" arrow + "I owe" label
- `they_owe` — olive + "↓" arrow + "They owe me" label
Already half-done (icons exist) — ensure the arrow + label is always shown, not just a colored dot.

### 7.2 3.3.1 — Error identification
Form errors currently show only `BIZ.inputError` border tint. Add:
```tsx
{error && (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
    <Feather name="alert-circle" size={12} color={biz.inputError} />
    <Text style={{ fontSize: 12, color: biz.inputError }}>{error}</Text>
  </View>
)}
```

### 7.3 1.3.1 — Info & relationships
- Section headers across screens → `accessibilityRole="header"`
- Sibling `Text` labels above `TextInput` → use `accessibilityLabelledBy` pattern (RN: hoist label text as the input's `accessibilityLabel`)
- Receipt item list → `accessibilityRole="list"` + `listitem`

### 7.4 1.4.11 — Non-text contrast
Audit icon size × color combos on tinted backgrounds:
- Icons on `color@10%` often fail 3:1
- Remediation: bump icon-tint opacity to 0.2 minimum, or outline icons with a 1px darker border, or use solid background

### 7.5 2.3.1 — Three flashes
- Spinner animations: verify <3 flashes/sec (default React Native is fine; just confirm)
- Pulse/breathing animations on Dashboard quickActions — OK (slow)

---

## Phase 8 — Verification + docs (½ day, P1)

### 8.1 Automated check in CI
Extend `scripts/wcag-audit.mjs`:
- Exit code 1 if any FAIL
- Exit code 1 if any AA-large-only in text pairs
- Integrate into `npm run lint` + GitHub Actions

### 8.2 Manual spot-check
Real-device testing:
- iOS VoiceOver on: Dashboard, MoneyChat, Settings, ReceiptDetail, DebtTracking
- Android TalkBack same screens
- Font zoom 200% — no content clipping (WCAG 1.4.4)
- iOS "Increase Contrast" toggle — works
- Color filter (grayscale) — verify info isn't lost (WCAG 1.4.1)

### 8.3 Docs
- Update `memory/design-language.md` with:
  - "All semantic colors MUST provide `{ light, dark }` variants passing AA in both modes"
  - "Icon-only buttons MUST use `IconButton` component or `hitSlop: 10`"
  - "Every Touchable requires `accessibilityLabel` + `accessibilityRole`"
  - "`TYPOGRAPHY.size.xs` (12) is the floor for user-facing text"
- Add to `docs/BUILDING_CHECKLIST.md` a "WCAG gate" section.
- New memory: `memory/wcag-compliance.md` — quick-reference card for future PRs.

---

## Execution order (suggested 1-week sprint)

| Day | Phase | Deliverable |
|---|---|---|
| **Mon AM** | Phase 1 (palette) | Tokens updated, audit rerun, 0 core FAILs |
| **Mon PM** | Phase 3 (typography) + Phase 4 (tap targets) | Scale updated, IconButton component, top 10 buttons fixed |
| **Tue** | Phase 2 (semantic colors) | BIZ/DEBT/CATEGORY refactored to {light,dark} tokens, audit green |
| **Wed** | Phase 5 day 1 — top 10 screens get a11y labels | ~1000 touchables labeled |
| **Thu** | Phase 5 day 2 — remaining ~1000 touchables | Coverage ≥90% |
| **Fri AM** | Phase 6 (focus) + Phase 7 (other WCAG) | All remaining AA criteria met |
| **Fri PM** | Phase 8 (verification + docs) | CI check in, real-device VoiceOver pass, docs updated |

**Parallelization:** Phase 5 can be split across 3-4 subagents by disjoint file ownership (same pattern used for the i18n audit).

---

## Risk & rollback

- **Phase 2 risk:** changing 11+ BIZ colors may affect visual harmony. Mitigation: preview each screen in both modes before commit; revert per-color if the new hue clashes.
- **Phase 3 risk:** bumping `xs 11→12, sm 13→14` may break tight layouts (e.g., 3-col quick action grid). Mitigation: visual pass before merge; tighten padding not font.
- **Phase 5 risk:** adding labels on 2000+ elements introduces regression surface. Mitigation: group by file; TypeScript catches type errors; manual sanity-test major flows.
- **Rollback:** palette changes are a single-file revert (`src/constants/index.ts`). Semantic-color refactor can be gated behind a `THEME_V2` flag if needed.

---

## Expected end-state (grade A+)

Re-running `scripts/wcag-audit.mjs` should print:

```
Total pairs tested: 106+
AAA pass:           60+  (core text, accent, headers)
AA pass:            46+  (secondary, semantic, chips)
AA-large only:      0
FAIL:               0
```

Plus:
- Tap targets: 100% ≥ 44×44 (verified via `hitSlop` helper or min dimensions)
- a11y labels: ≥90% of Touchables (from 13% → 90%+)
- Roles: ≥85% (from 9% → 85%+)
- No color-only info, focus rings visible, typography meets minimums, CI gate in place

**Grade: A+** — WCAG 2.1 AA fully compliant with AAA on core flows.
