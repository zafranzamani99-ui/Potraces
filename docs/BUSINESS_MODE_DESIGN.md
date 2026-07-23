# Business Mode Design — seller / business UI standards

> Dedicated design doc for **business mode** (seller + all sub-modes: Stall, etc.).
> App-wide standards (Neu family, Onyx) still apply and live in root `CLAUDE.md`.
> This file holds the rules that are **specific to business mode**.

---

## "Newst Input" — the standard business-mode input (LOCKED — 2026-07-23)

**Newst Input** is the one input design for **every** text/number field in seller /
business mode. From now on, new business-mode fields ship as a Newst Input — don't
hand-roll a flat bordered `TextInput` with a separate label above it.

It's a **floating-label** field: the label sits *inside* the box at rest and floats up
to **notch the top border** on focus or when filled. Monochrome — **black in light /
white in dark** — no colored accent.

**Component:** [`src/components/business/NewstInput.tsx`](../src/components/business/NewstInput.tsx)
(default export). Import it and pass props — it reads the theme itself.

```tsx
import NewstInput from '../../components/business/NewstInput';

<NewstInput label={t.stall.floatLabel} value={v} onChangeText={setV}
  prefix={currency} keyboardType="decimal-pad" />
```

### Behaviour / states

| State | Border | Label | Notch bg |
|-------|--------|-------|----------|
| **Idle** (empty, blurred) | `C.border` (grey), 1.5px | rests inside box, `C.neutral`, 16px | none (transparent) |
| **Focused** | `C.textPrimary` (b/w) | floated to top border, `C.textPrimary`, 12px | `C.background` |
| **Filled** (has value, blurred) | `C.textPrimary` (b/w) | floated, `C.textSecondary`, 12px | `C.background` |

- **Float trigger:** `focused || value.length > 0`.
- **Animation:** `Animated.timing`, **150ms**, `Easing.bezier(0.4, 0, 0.2, 1)`,
  `useNativeDriver: false` (it animates `top` + `fontSize`, which are layout props).
- **Monochrome only.** Active border + floated label use `C.textPrimary` — never an
  accent (no olive, no bronze, no blue). The notch bg is `C.background` so the label
  cleanly cuts the border line.
- **No `placeholder`.** The floating label *is* the placeholder — don't set both.
- **Optional prefix** (e.g. currency `RM`): rendered *inside* the box, left of the
  input, and **only while floated** (so it never collides with the resting label).
- **Optional hint:** `TYPE.muted` below the box, `marginLeft: 12` to sit just under
  the label/input text (not flush to the field's left edge).

### Recipe (key values)

```tsx
// box
{ flexDirection: 'row', alignItems: 'center', borderWidth: 1.5,
  borderColor: floated ? C.textPrimary : C.border,   // ← the only stateful color
  borderRadius: RADIUS.lg, paddingHorizontal: SPACING.lg, minHeight: 56,
  backgroundColor: 'transparent' }

// label (Animated.Text, absolute, pointerEvents="none", rendered AFTER the box)
{ position: 'absolute', left: 14, paddingHorizontal: 4, fontWeight: medium,
  top:      anim.interpolate({ inputRange: [0,1], outputRange: [17, -8] }),
  fontSize: anim.interpolate({ inputRange: [0,1], outputRange: [16, 12] }),
  color: focused ? C.textPrimary : floated ? C.textSecondary : C.neutral,
  backgroundColor: floated ? C.background : 'transparent' }

// input
{ flex: 1, paddingVertical: SPACING.md, fontSize: 16, color: C.textPrimary,
  selectionColor: withAlpha(C.textPrimary, 0.2) }
```

Copy the full component from `SessionSetup.tsx` — it also wires `keyboardAppearance`,
`accessibilityLabel`/`Hint`, and the `onFocus`/`onBlur` focus tracking.

### Copy rule for labels

Labels are **sentence case** — `Session name`, `Starting cash (optional)` — **never
ALL CAPS**. (The old `TYPE.label` all-caps convention does **not** apply to Newst
Input.) Both `en.ts` and `ms.ts` keys must stay in parity per the i18n-parity skill.

---

## Adoption

- **New business-mode screen with an input** → use Newst Input.
- **Touching an existing business-mode input** → convert it while you're there.

### Prop API

`label, value, onChangeText, prefix?, hint?, multiline?, keyboardType?, autoFocus?,
autoCapitalize?, returnKeyType?, onSubmitEditing?, accessibilityLabel?,
accessibilityHint?, style?` — `style` is for call-site spacing (e.g. `marginBottom`).
`prefix` (currency/symbol) shows inside the box, left of the text, only while floated.

### Where it's used (Stall mode, 2026-07-23)

All labeled form fields across Stall mode are Newst Inputs: **SessionSetup** (session
name, starting cash), **CloseSession** (starting cash, counted, note), **PreOrders**
(name, phone, collect time, note), **RegularCustomers** (add + edit: name, usual order,
note), **StallProducts** (name, price, default stock, cost each), **SellScreen**
(custom-sale label).

### The shared outline — EVERY input wears it (LOCKED — 2026-07-23)

Even inputs that can't be a floating-label Newst Input must wear the **identical
outline** so no input looks out of place. That border is one exported function:

```tsx
import { newstOutline } from '../../components/business/NewstInput';

const [focusedField, setFocusedField] = useState<string | null>(null);

<View style={[styles.wrapper, newstOutline(C, focusedField === 'id')]}>
  <TextInput … onFocus={() => setFocusedField('id')}
    onBlur={() => setFocusedField(f => f === 'id' ? null : f)} />
</View>
```

`newstOutline(C, active)` → `{ borderWidth: 1.5, borderColor: active ? C.textPrimary :
C.border, borderRadius: RADIUS.lg, backgroundColor: 'transparent' }`. Spread it **last**
in the style array (it overrides any existing border/bg). `active` = `focused` for plain
inputs, `floated` for Newst fields — so idle + focused states look identical everywhere;
only the size/contents differ. `NewstInput` itself uses this exact function for its box.
For inputs in a `.map()`, key the id per row (`'item-' + row.key`).

### Not floating-label, but still outlined (Newst Input doesn't fit)

These keep their shape/size but wear `newstOutline`:

- **Search bars** — product search, customer search (icon + query, no label).
- **Numeric amount pads** — custom-sale amount, restock, clearance, transfer-to-personal
  (big autofocused number heroes with a currency/symbol; the currency now sits inside the
  outlined box).
- **Inline list-row cells** — expense add-row, pre-order item name/price, product
  modifier name/delta, loyalty "every N visits" (a floating label would break the row).
- **Discount field** — has a `%`/`RM` toggle in its header, so it stays a plain outlined
  input rather than a floating-label field.
