# Agent 3 Plan: Row Design, List Layout, Sections, Empty States, Swipe Actions, Visual Rhythm

## Current State Analysis

### Current Row (`renderRow`)
- Individual cards: `RADIUS.lg` (14px), hairline border `0.05` alpha, `surface` bg
- 40px circle avatar with vibrant solid color, white initial letter
- Center: name (15px semibold) + meta row (cycle label + status pill OR due text) + optional progress bar
- Right: amount (15px bold) + optional installment fraction (10px) + chevron-right (14px, 0.3 alpha)
- Paid rows: 0.55 opacity, avatar swaps to check icon on olive bg
- Swipeable: right=mark paid (olive), left=edit (neutral)
- Divider: hairline, indented past avatar

### Problems
1. Every row is an identical bordered card — monotonous wall of rectangles
2. Avatar is a plain colored circle with a letter — the most generic pattern possible
3. Chevron-right is pointless visual noise (rows already tap to open detail)
4. Status pill is tiny (10px) and hard to read
5. Paid rows just dim — no satisfying "done" feeling
6. No visual hierarchy between "due today" and "due in 25 days"
7. Progress bar is an afterthought (3px, hidden at bottom of info block)

---

## 1. Row Layout — New Design

### Structure: Borderless rows inside grouped surface cards

```
┌─────────────────────────────────────────────────┐
│  [accent bar 3px]  Name                  RM 49  │
│                    monthly · in 3 days          │
│                    ▓▓▓▓▓▓▓▓░░ 8/12             │
├─────────────────────────────────────────────────┤
│  [accent bar 3px]  Name                  RM 12  │
│                    weekly · tomorrow            │
└─────────────────────────────────────────────────┘
```

**NO.** User hates left-edge color bars. Scratch that entirely.

### Revised Structure: Clean grouped rows, accent via avatar shape

```
┌─────────────────────────────────────────────────────┐
│  ┌──┐  Netflix                           RM 54.90  │
│  │N │  monthly · in 3 days                         │
│  └──┘                                              │
│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
│  ┌──┐  Spotify                           RM 15.90  │
│  │S │  monthly · due today                         │
│  └──┘                    ◉ due today               │
│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
│  ┌──┐  Car Loan                          RM 890    │
│  │C │  monthly · May 25    ▓▓▓▓▓▓░░░ 8/12         │
│  └──┘                                              │
└─────────────────────────────────────────────────────┘
```

### Avatar: Squared-rounded, not circle
- **Shape**: 36x36px, `borderRadius: RADIUS.md` (10px) — a "squircle"
- **Color**: Keep the `avatarColorForName` palette BUT apply at 0.12 alpha as background, use the full color for the letter
- **Letter**: 14px bold, colored (not white) — the accent color of the avatar
- **Why**: Circles are the most generic avatar shape. Squircles feel modern (Apple app icons, Linear, Notion). Colored letter on tinted bg is more refined than white-on-solid.

```tsx
rowIcon: {
  width: 36,
  height: 36,
  borderRadius: RADIUS.md,       // 10px squircle
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: SPACING.sm + 2,   // 10px
  flexShrink: 0,
},
// In renderRow:
backgroundColor: withAlpha(accentColor, 0.12)
// Letter color: accentColor (not white)
```

### Name + Meta arrangement
- **Line 1**: Name (15px semibold `textPrimary`) — left. Amount (15px bold `textPrimary`) — right, same baseline.
- **Line 2**: Cycle label + due date combined as single muted string — left. Installment fraction — right (only if installment).
- **Line 3** (conditional): Progress bar for installments only, full width of info area.
- **No chevron**. Rows tap to open detail; the chevron adds visual noise without information.

```
Name layout:
  flex row: [rowInfo (flex:1)] [rowRight]

rowInfo:
  Line 1: name (15px semibold)
  Line 2: "monthly · in 3 days" OR "monthly · due today" OR "monthly · was May 1"
           Combined into ONE text line, no separate cycle + due components
  Line 3: progress bar (only for installments, 4px tall)

rowRight:
  amount (16px bold, tabular-nums)
  installment fraction below amount: "8/12" (11px medium muted)
```

### Due date presentation
- Keep current `getDueDateInfo` logic, it's good:
  - "today" / "tomorrow" / "in N days" (<=7) / "MMM d" (>7) / "was MMM d" (overdue)
- Combine with cycle: `monthly · in 3 days` as one meta string
- Color the due portion when urgent:
  - Overdue: terracotta `#C1694F` (only the due text portion)
  - Due today: gold `#B2780A`
  - Otherwise: `textMuted`

### Status indication — no pills, use contextual cues
- **Remove status pills entirely.** They're tiny, cluttered, and redundant with the meta text.
- Overdue: meta text turns terracotta, a subtle `withAlpha('#C1694F', 0.04)` tint on the row background
- Due today: meta text turns gold, subtle `withAlpha(C.gold, 0.04)` tint
- Paused: entire row 0.5 opacity + meta says "paused · monthly"
- Paid: see section 2 below

### Amount styling
```tsx
rowAmount: {
  fontSize: TYPOGRAPHY.size.base + 1,  // 16px — slightly larger than name
  fontWeight: TYPOGRAPHY.weight.bold,
  color: C.textPrimary,
  fontVariant: ['tabular-nums'],
  letterSpacing: -0.5,
},
```

### Installment progress bar
- Height: 4px (up from 3px)
- Background: `withAlpha(C.textMuted, 0.08)`
- Fill: avatar accent color at 0.6 alpha (not full saturation)
- Border radius: `RADIUS.full`
- Margin top: 6px
- Full width of the info column

```tsx
progressBarContainer: {
  height: 4,
  backgroundColor: withAlpha(C.textMuted, 0.08),
  borderRadius: RADIUS.full,
  marginTop: 6,
  overflow: 'hidden',
},
progressBarFill: {
  height: '100%',
  borderRadius: RADIUS.full,
  // backgroundColor set inline: withAlpha(accentColor, 0.6)
},
```

---

## 2. Row Visual Treatment

### Grouped card approach (NOT individual cards per row)
- **Section card**: Each section (remaining, paid, paused) gets ONE `surface` card wrapping all its rows
- Card: `backgroundColor: C.surface`, `borderRadius: RADIUS.xl` (20px), no border, `SHADOWS.xs`
- Rows inside: borderless, separated by hairline dividers indented 46px from left (past avatar)
- This creates the "wallet-style grouped card" from the design language

```tsx
sectionCard: {
  backgroundColor: C.surface,
  borderRadius: RADIUS.xl,
  overflow: 'hidden',
  ...SHADOWS.xs,
  marginBottom: SPACING.lg,
},
row: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingVertical: SPACING.md,           // 16px — more breathing room
  paddingHorizontal: SPACING.md,         // 16px
  backgroundColor: 'transparent',        // no individual card bg
  // NO borderRadius, NO border, NO margin
},
rowDivider: {
  height: StyleSheet.hairlineWidth,
  backgroundColor: withAlpha(C.textPrimary, 0.06),
  marginLeft: SPACING.md + 36 + (SPACING.sm + 2),  // indent past avatar: 16 + 36 + 10 = 62px
},
```

### Urgency tinting (subtle row backgrounds)
- Overdue rows: `backgroundColor: withAlpha('#C1694F', 0.03)` — barely perceptible warmth
- Due today rows: `backgroundColor: withAlpha(C.gold, 0.03)` — barely perceptible gold
- Normal rows: transparent
- This gives visual hierarchy without adding UI elements

### Paid row treatment
- **NOT just dimmed.** Instead:
  - Avatar: swap letter for `check` icon (16px), accentColor at 0.4 alpha, bg at 0.06 alpha
  - Name: add strikethrough (`textDecorationLine: 'line-through'`) + `textMuted` color
  - Amount: `textMuted` color
  - Meta text: "paid May 10 · monthly" in `textMuted`
  - Overall row opacity: 0.7 (not 0.55 — slightly more visible)
  - This gives a satisfying "crossed off" feeling

```tsx
rowNameCleared: {
  textDecorationLine: 'line-through',
  color: C.textMuted,
},
rowDimmed: { opacity: 0.7 },
// Avatar when cleared:
backgroundColor: withAlpha(accentColor, 0.06)
// Check icon color: withAlpha(accentColor, 0.4)
```

### What makes premium apps feel premium
- **Tight, consistent vertical rhythm**: Every row exactly the same height padding
- **Generous horizontal padding**: 16px, not 10px
- **Tabular-nums on all numbers**: Already using, keep it
- **No visual clutter**: Remove chevron, remove pills, let typography do the work
- **Subtle shadows on group cards**: `SHADOWS.xs` only, felt not seen
- **Letter spacing on amounts**: -0.5 for density

---

## 3. Section Headers

### Keep three sections: "remaining", "paid", "paused"
- These are the right groupings. "Remaining" is better than "upcoming" because it implies a countdown.
- Add count: "remaining (4)" / "paid (2)" / "paused (1)"

### Section header styling
- Position: OUTSIDE the grouped card, above it
- Layout: label left, total right (keep current)
- Label: 11px semibold uppercase, `textMuted`, letter-spacing 1 — keep current
- Total: 11px semibold, `textMuted`, tabular-nums — keep current
- Add item count to label: "REMAINING (4)"
- Margin bottom: `SPACING.sm` (8px) between header and card

```tsx
sectionHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: SPACING.sm,
  paddingHorizontal: SPACING.xs,  // slight indent for alignment
},
sectionLabel: {
  fontSize: 11,
  fontWeight: TYPOGRAPHY.weight.semibold,
  color: C.textMuted,
  textTransform: 'uppercase',
  letterSpacing: 1,
},
// In renderSection:
<Text style={styles.sectionLabel}>{label} ({subs.length})</Text>
```

### Section with card wrapper
```tsx
const renderSection = (label, subs, isCleared = false) => {
  if (subs.length === 0) return null;
  const sectionTotal = subs.reduce((sum, s) => sum + s.amount, 0);
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>{label} ({subs.length})</Text>
        <Text style={styles.sectionTotal}>{currency} {sectionTotal.toFixed(2)}</Text>
      </View>
      <View style={styles.sectionCard}>
        {subs.map((sub, idx) => (
          <React.Fragment key={sub.id}>
            {renderRow(sub, isCleared)}
            {idx < subs.length - 1 && <View style={styles.rowDivider} />}
          </React.Fragment>
        ))}
      </View>
    </View>
  );
};
```

---

## 4. Empty States

### No commitments at all (main empty state)
- Keep current `EmptyState` component usage — it's a shared component
- Icon: `calendar` (keep)
- Title: keep `t.subscriptions.noBills`
- Message: keep `t.subscriptions.trackRecurring`
- Action: keep `t.subscriptions.addBill`

### Tab-specific empty (e.g., "subscriptions" tab has items but "bills" tab doesn't)
- Current: centered text "nothing in bills yet" + "add one with the + button below"
- **Improve**: Add the Feather icon relevant to the tab type
- Structure:

```tsx
<View style={styles.tabEmpty}>
  <Feather name={tabIcon} size={32} color={withAlpha(C.textMuted, 0.3)} />
  <Text style={styles.tabEmptyTitle}>no {tabLabel} yet</Text>
  <Text style={styles.tabEmptyHint}>tap + to add one</Text>
</View>
```

Styles:
```tsx
tabEmpty: {
  alignItems: 'center',
  paddingVertical: SPACING['4xl'],   // 40px — more space
  gap: SPACING.sm,
},
tabEmptyTitle: {
  fontSize: TYPOGRAPHY.size.base,
  fontWeight: TYPOGRAPHY.weight.semibold,
  color: C.textSecondary,
  marginTop: SPACING.xs,
},
tabEmptyHint: {
  fontSize: TYPOGRAPHY.size.sm,
  color: C.textMuted,
},
```

### Search no results
- Current: search icon (36px) + title + hint — this is fine
- Keep as-is, it's clean

### Section empty (all paid, none remaining)
- When "remaining" section is empty but "paid" has items, show a small inline message:

```tsx
// Inside the remaining section area, when remaining.length === 0 && paid.length > 0:
<View style={styles.allPaidBanner}>
  <Feather name="check-circle" size={16} color={C.positive} />
  <Text style={styles.allPaidText}>all caught up this cycle</Text>
</View>
```

```tsx
allPaidBanner: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: SPACING.sm,
  paddingVertical: SPACING.lg,
  paddingHorizontal: SPACING.md,
  backgroundColor: withAlpha(C.positive, 0.05),
  borderRadius: RADIUS.lg,
  marginBottom: SPACING.lg,
},
allPaidText: {
  fontSize: TYPOGRAPHY.size.sm,
  fontWeight: TYPOGRAPHY.weight.medium,
  color: C.positive,
},
```

---

## 5. Swipe Actions

### Keep current swipe directions
- **Right swipe (→) = mark paid**: Olive green bg (`C.accent`). Only on unpaid, non-paused rows.
- **Left swipe (←) = edit**: Neutral bg (`C.neutral`). Always available.
- These are intuitive and match wallet patterns.

### Visual improvements to swipe actions
- Add icon above label in the swipe action area
- Slightly increase min width from 72 to 80

```tsx
// In SubSwipeAction render:
<TouchableOpacity style={styles.swipeInner}>
  <Feather
    name={variant === 'paid' ? 'check' : 'edit-2'}
    size={18}
    color="#FFFFFF"
  />
  <Text style={styles.swipeLabel}>{label}</Text>
</TouchableOpacity>

swipeInner: {
  flex: 1,
  justifyContent: 'center',
  alignItems: 'center',
  gap: 4,
},
swipeLabel: {
  fontSize: 11,
  fontWeight: TYPOGRAPHY.weight.semibold,
  color: '#FFFFFF',
  letterSpacing: 0.2,
},
```

### Hard swipe threshold
- Keep `HARD_SWIPE = 120` — feels right
- Keep the auto-close-after-hard-swipe pattern

### Swipe on grouped cards
- Since rows are now inside a grouped card, the swipeable needs `overflow: 'hidden'` on the card to clip properly
- Each row is still individually swipeable — the `ReanimatedSwipeable` wraps each row, not the card

---

## 6. Visual Rhythm

### Problem: Long list = wall of identical rows
### Solutions (no clutter, just spacing):

#### A. Section spacing creates natural breaks
- Remaining section card, then 16px gap, then "PAID" header, then paid card
- The grouped card approach already creates rhythm vs individual card-per-row

#### B. Urgency tinting adds color variation
- Overdue rows have barely-there terracotta tint
- Due-today rows have barely-there gold tint
- This breaks the monotony without adding UI elements

#### C. Installment rows have progress bars
- The 4px progress bar adds horizontal visual interest to installment rows
- Different accent colors per subscription means varied bar colors

#### D. "All caught up" banner between sections
- When remaining is empty, the olive banner provides a warm visual break

#### E. Suggestions section has distinct styling (see section 7)
- Different row treatment (bronze badge, "track" button) provides contrast

#### F. Section counts in headers
- "REMAINING (4)" gives the eye a reference point when scanning

### What NOT to do
- No alternating row backgrounds (dated pattern)
- No category icons (adds clutter, letters are cleaner)
- No date grouping (subscriptions don't group well by date)

---

## 7. Suggestions Section ("looks recurring")

### Current
- Same section header style as remaining/paid
- Rows: 28px bronze squircle badge with repeat icon, name + meta, "track" outline button
- Dividers between rows

### Improvements
- Wrap in its own distinct card with a subtle bronze tint to differentiate from commitment sections
- Add a dismiss (x) per suggestion
- Make "track" button a filled pill, not outline

```tsx
suggestionsCard: {
  backgroundColor: withAlpha(C.bronze, 0.04),
  borderRadius: RADIUS.xl,
  overflow: 'hidden',
  marginBottom: SPACING.lg,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: withAlpha(C.bronze, 0.12),
},
suggestionRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingVertical: SPACING.md,       // 16px — match commitment rows
  paddingHorizontal: SPACING.md,
},
suggestionBadge: {
  width: 32,                         // up from 28
  height: 32,
  borderRadius: RADIUS.md,
  backgroundColor: withAlpha(C.bronze, 0.12),
  alignItems: 'center',
  justifyContent: 'center',
},
suggestionAction: {
  paddingHorizontal: SPACING.md,
  paddingVertical: SPACING.xs + 2,   // 6px
  borderRadius: RADIUS.full,         // pill shape
  backgroundColor: withAlpha(C.bronze, 0.12),  // filled, not outline
  // Remove border
},
suggestionActionText: {
  fontSize: TYPOGRAPHY.size.xs,
  fontWeight: TYPOGRAPHY.weight.semibold,
  color: C.bronze,                   // bronze, not accent
},
```

### Section header for suggestions
```tsx
<View style={styles.sectionHeader}>
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.xs }}>
    <Feather name="zap" size={12} color={C.bronze} />
    <Text style={[styles.sectionLabel, { color: C.bronze }]}>looks recurring</Text>
  </View>
</View>
```

---

## Summary of Key Changes

| Element | Current | Proposed |
|---------|---------|----------|
| Avatar | 40px circle, solid color, white letter | 36px squircle, tinted bg, colored letter |
| Row container | Individual bordered cards | Borderless rows in grouped section cards |
| Status | Tiny 10px pills | Contextual meta text color + subtle row tinting |
| Chevron | 14px chevron-right per row | Removed entirely |
| Paid rows | 0.55 opacity + check avatar | Strikethrough name + check avatar + 0.7 opacity |
| Progress bar | 3px, afterthought | 4px, accent-colored, prominent |
| Section card | None (individual row cards) | Single surface card per section, RADIUS.xl, SHADOWS.xs |
| Section label | "REMAINING" | "REMAINING (4)" |
| Suggestions | Plain section, outline button | Bronze-tinted card, filled pill button, zap icon |
| Swipe actions | Text only | Icon + text |
| Empty "all paid" | None | Olive "all caught up" inline banner |
| Row padding | 11px vertical, 10px horizontal | 16px vertical, 16px horizontal |

### Files to modify
- `src/screens/personal/SubscriptionList.tsx` — renderRow, renderSection, renderSuggestions, styles
- No new files needed
- No changes to constants or shared components
