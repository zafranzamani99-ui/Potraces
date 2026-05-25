# Hero Card Redesign Plan — Bills & Commitments

Agent 1 of 5 — Hero card, month display, summary statistics, period toggle, progress visualization

---

## Current State Analysis

The current hero (`renderMonthHeader`) is an olive-tinted card containing:
- "MAY" in uppercase olive (14px bold, letterSpacing 1.6)
- RM amount at 44px bold with /mo | /yr segmented toggle
- Linear progress bar (5px height) with paid/due labels
- "X of Y paid this cycle" centered text

**Problems**: Month display is bare ("MAY" instead of "may 2026"), the card is flat and formulaic, progress bar is a thin generic strip, no secondary stats, no visual hierarchy beyond amount.

## Data Available

From existing computed values already in the component:
- `totalMonthly`, `totalAnnual` — normalized totals
- `heroStats.cleared`, `heroStats.pending`, `heroStats.paused` — cycle-level counts
- `tabSections.remaining` / `tabSections.paid` — per-tab filtered lists
- `dueSoon` — subscriptions due within 7 days
- `nextBill` — the single next bill coming up
- `categoryBreakdown` — array of `{ id, amount, color, pct }` sorted by amount
- `remainingTotal`, `paidTotal` — amounts within the active tab
- Each Subscription has: `name`, `amount`, `billingCycle`, `nextBillingDate`, `lastPaidAt`, `category`, `isPaused`, `isInstallment`, `outstandingBalance`, `paymentHistory`

---

## 1. Month Display

### Design Decision
Show `"may 2026"` in lowercase, left-aligned. No month navigation — this screen is about the current billing cycle, not historical browsing. The year disambiguates without adding clutter.

### JSX
```tsx
<Text style={styles.heroMonth}>
  {format(new Date(), 'MMMM yyyy').toLowerCase()}
</Text>
```

### Styles
```ts
heroMonth: {
  fontSize: TYPOGRAPHY.size.xs,          // 12
  fontWeight: TYPOGRAPHY.weight.bold,    // '700'
  color: C.accent,                       // olive #4F5104 / dark #A4A843
  textTransform: 'none',                 // was 'uppercase' — now lowercase naturally
  letterSpacing: 1.8,                    // slightly wider than before (was 1.6)
  marginBottom: SPACING.xs,             // 4
},
```

### Edge cases
- Always shows current month+year. No navigation arrows, no interaction. Pure label.

---

## 2. Amount Display

### Design Decision
Keep the large amount as the visual anchor. Add a subtle breakdown row underneath showing paid vs remaining as inline text (not the progress bar — that moves to a ring). The amount should reflect the active tab's total for this cycle, not normalized monthly.

### Layout
```
may 2026                              /mo  /yr
RM 1,240.00
paid RM 640 · remaining RM 600
```

### JSX
```tsx
{/* Amount */}
<View style={styles.heroAmountRow}>
  <Text style={styles.heroAmount}>
    <Text style={styles.heroAmountCurrency}>{currency} </Text>
    {(showAnnual ? heroAmount * 12 : heroAmount).toLocaleString(undefined, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    })}
  </Text>
  {/* Period toggle floats to right — see section 3 */}
</View>

{/* Breakdown subtitle */}
{showSplit && (
  <View style={styles.heroBreakdownRow}>
    <Text style={styles.heroBreakdownText}>
      <Text style={styles.heroBreakdownBold}>{currency} {paidTotal.toFixed(0)}</Text>
      {' '}paid
    </Text>
    <Text style={styles.heroBreakdownDot}>·</Text>
    <Text style={styles.heroBreakdownText}>
      <Text style={styles.heroBreakdownBold}>{currency} {remainingTotal.toFixed(0)}</Text>
      {' '}remaining
    </Text>
  </View>
)}
{allPaid && (
  <View style={styles.heroBreakdownRow}>
    <Feather name="check-circle" size={12} color={C.positive} />
    <Text style={[styles.heroBreakdownText, { color: C.positive, marginLeft: SPACING.xs }]}>
      all cleared this cycle
    </Text>
  </View>
)}
```

### Styles
```ts
heroAmount: {
  fontSize: 42,                          // slightly reduced from 44 for balance
  fontWeight: TYPOGRAPHY.weight.bold,
  color: C.textPrimary,
  fontVariant: ['tabular-nums'],
  letterSpacing: -1.5,                   // tighter tracking for large numbers
  lineHeight: 48,                        // explicit for vertical alignment
},
heroAmountCurrency: {
  fontSize: 20,                          // reduced from 22
  fontWeight: TYPOGRAPHY.weight.medium,
  color: C.textMuted,
},
heroBreakdownRow: {
  flexDirection: 'row',
  alignItems: 'center',
  marginTop: 2,
  marginBottom: SPACING.sm,             // 8 — breathing room before progress ring row
},
heroBreakdownText: {
  fontSize: TYPOGRAPHY.size.xs,          // 12
  color: C.textMuted,
  fontVariant: ['tabular-nums'],
},
heroBreakdownBold: {
  fontWeight: TYPOGRAPHY.weight.semibold,
  color: C.textSecondary,
},
heroBreakdownDot: {
  fontSize: TYPOGRAPHY.size.xs,
  color: C.textMuted,
  marginHorizontal: SPACING.xs + 2,     // 6
},
```

### Edge cases
- **0 subscriptions**: `renderMonthHeader` returns null (existing behavior, keep it).
- **All paid**: Show checkmark + "all cleared this cycle" instead of breakdown.
- **Nothing paid yet**: Only show "RM X remaining" (no paid portion, no dot separator).
- **Only paused subs**: heroAmount is 0.00 — show "no active commitments" subtitle instead of breakdown.

---

## 3. Period Toggle (/mo vs /yr)

### Design Decision
Keep the segmented pill — it's compact, clear, and well-understood. Refine the visual: make the active state a solid olive pill with white text, inactive is transparent. Position it top-right, aligned with the month label (not bottom-right aligned with the amount). This creates a natural header row: month label left, toggle right.

### JSX
```tsx
{/* Top row: month + toggle */}
<View style={styles.heroTopRow}>
  <Text style={styles.heroMonth}>
    {format(new Date(), 'MMMM yyyy').toLowerCase()}
  </Text>
  <View style={styles.heroSegment}>
    <Pressable
      onPress={() => { lightTap(); setShowAnnual(false); }}
      style={[styles.heroSegBtn, !showAnnual && styles.heroSegBtnActive]}
    >
      <Text style={[styles.heroSegText, !showAnnual && styles.heroSegTextActive]}>/mo</Text>
    </Pressable>
    <Pressable
      onPress={() => { lightTap(); setShowAnnual(true); }}
      style={[styles.heroSegBtn, showAnnual && styles.heroSegBtnActive]}
    >
      <Text style={[styles.heroSegText, showAnnual && styles.heroSegTextActive]}>/yr</Text>
    </Pressable>
  </View>
</View>
```

### Styles
```ts
heroTopRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: SPACING.xs,             // 4 — tight to amount
},
heroSegment: {
  flexDirection: 'row',
  backgroundColor: withAlpha(C.accent, 0.08),
  borderRadius: RADIUS.full,            // 9999
  padding: 2,
},
heroSegBtn: {
  paddingHorizontal: SPACING.sm + 4,    // 12
  paddingVertical: 4,
  borderRadius: RADIUS.full,
},
heroSegBtnActive: {
  backgroundColor: C.accent,
},
heroSegText: {
  fontSize: 11,
  fontWeight: TYPOGRAPHY.weight.semibold,
  color: C.textMuted,
},
heroSegTextActive: {
  color: '#FFFFFF',
},
```

### Edge cases
- Toggle only affects the displayed amount. No re-render of lists.
- Works identically in dark mode — `C.accent` switches to `#A4A843`.

---

## 4. Progress Visualization

### Design Decision
Replace the linear progress bar with a **segmented arc / ring indicator** rendered using SVG (`react-native-svg`). A donut ring naturally communicates "X of Y" better than a linear bar because it has a clear "completion" metaphor. However, since adding `react-native-svg` is a dependency decision, provide a **fallback plan using a segmented linear bar** that works without new dependencies.

### Option A: Segmented Linear Bar (no new dependency — RECOMMENDED)

Instead of a single continuous fill, render individual segments in the bar — one per subscription in the current tab. Paid segments are olive, remaining segments are `withAlpha(C.accent, 0.15)`. This conveys both the ratio AND the count visually.

#### JSX
```tsx
{/* Segmented progress bar */}
<View style={styles.heroProgressBar}>
  {Array.from({ length: totalCount }).map((_, i) => {
    const isPaid = i < paidCount;
    return (
      <View
        key={i}
        style={[
          styles.heroProgressSegment,
          {
            flex: 1,
            backgroundColor: isPaid ? C.positive : withAlpha(C.accent, 0.12),
            marginLeft: i > 0 ? 2 : 0,
            borderTopLeftRadius: i === 0 ? 4 : 1,
            borderBottomLeftRadius: i === 0 ? 4 : 1,
            borderTopRightRadius: i === totalCount - 1 ? 4 : 1,
            borderBottomRightRadius: i === totalCount - 1 ? 4 : 1,
          },
        ]}
      />
    );
  })}
</View>
<Text style={styles.heroProgressLabel}>
  {paidCount} of {totalCount} paid this cycle
</Text>
```

#### Styles
```ts
heroProgressBar: {
  flexDirection: 'row',
  height: 6,
  marginTop: SPACING.sm,               // 8
},
heroProgressSegment: {
  height: '100%',
},
heroProgressLabel: {
  fontSize: 11,
  fontWeight: TYPOGRAPHY.weight.medium,
  color: C.textMuted,
  textAlign: 'center',
  marginTop: SPACING.xs + 1,           // 5
  fontVariant: ['tabular-nums'],
},
```

### Option B: Circular Ring (requires react-native-svg)

A 64x64 SVG ring placed to the right of the amount. Olive arc for paid portion, muted track for remaining. Center text shows "3/7" count.

```tsx
// Only if react-native-svg is already available
<Svg width={64} height={64} viewBox="0 0 64 64">
  <Circle cx={32} cy={32} r={26} stroke={withAlpha(C.accent, 0.12)} strokeWidth={5} fill="none" />
  <Circle
    cx={32} cy={32} r={26}
    stroke={C.positive}
    strokeWidth={5}
    fill="none"
    strokeDasharray={`${paidPct * 1.634} ${163.4 - paidPct * 1.634}`}
    strokeDashoffset={40.85}
    strokeLinecap="round"
    transform="rotate(-90 32 32)"
  />
  <SvgText x={32} y={35} textAnchor="middle" fontSize={14} fontWeight="700" fill={C.textPrimary}>
    {paidCount}/{totalCount}
  </SvgText>
</Svg>
```

**Recommendation**: Go with **Option A (segmented linear bar)** — zero new dependencies, visually distinctive, clearly shows individual segments, and feels more modern than a continuous fill. The segments make each bill feel tangible.

### Edge cases
- **1 subscription**: Single full-width segment, either olive (paid) or muted (remaining).
- **0 subscriptions**: Don't render the bar at all (already guarded by `subscriptions.length === 0` return null).
- **All paid**: All segments olive, label says "all X paid this cycle".
- **Many subscriptions (20+)**: Segments get thin but remain visible. Cap visual segments at 20 and show a "..." indicator, or let them be thin — at 20 items the bar is still ~15px per segment which is fine.

---

## 5. Summary Stats

### Design Decision
Below the progress bar, show a **single-row stat strip** with 3 compact stats. These provide at-a-glance context without needing to scroll. Use the "stat pill" pattern — icon + value + label, separated by subtle dividers.

### Stats to show
1. **Next due**: The name + days until the next bill (e.g., "Spotify · in 3 days"). Most actionable.
2. **Due this week**: Count of bills due in the next 7 days. Urgency signal.
3. **Overdue**: Count of bills past their date. Only shows if > 0, replaces "due this week" position.

### JSX
```tsx
{/* Stats strip */}
{(nextBill || dueSoon.length > 0) && (
  <View style={styles.heroStats}>
    {/* Next due */}
    {nextBill && (
      <View style={styles.heroStat}>
        <Text style={styles.heroStatLabel}>next</Text>
        <Text style={styles.heroStatValue} numberOfLines={1}>
          {nextBill.name.length > 12 ? nextBill.name.slice(0, 12) : nextBill.name}
        </Text>
        <Text style={styles.heroStatSub}>
          {getDueDateInfo(nextBill.nextBillingDate).text}
        </Text>
      </View>
    )}

    {/* Divider */}
    {nextBill && dueSoon.length > 0 && <View style={styles.heroStatDivider} />}

    {/* Overdue count (if any) */}
    {overdueCount > 0 ? (
      <View style={styles.heroStat}>
        <Text style={styles.heroStatLabel}>overdue</Text>
        <Text style={[styles.heroStatValue, { color: C.bronze }]}>{overdueCount}</Text>
        <Text style={styles.heroStatSub}>
          {currency} {overdueTotal.toFixed(0)}
        </Text>
      </View>
    ) : dueSoon.length > 0 ? (
      <View style={styles.heroStat}>
        <Text style={styles.heroStatLabel}>this week</Text>
        <Text style={styles.heroStatValue}>{dueSoon.length}</Text>
        <Text style={styles.heroStatSub}>
          {currency} {dueSoon.reduce((s, b) => s + b.amount, 0).toFixed(0)}
        </Text>
      </View>
    ) : null}

    {/* Divider */}
    {(overdueCount > 0 || dueSoon.length > 0) && <View style={styles.heroStatDivider} />}

    {/* Paused count (if any) or annual total */}
    {heroStats.paused > 0 ? (
      <View style={styles.heroStat}>
        <Text style={styles.heroStatLabel}>paused</Text>
        <Text style={styles.heroStatValue}>{heroStats.paused}</Text>
      </View>
    ) : (
      <View style={styles.heroStat}>
        <Text style={styles.heroStatLabel}>yearly</Text>
        <Text style={styles.heroStatValue}>
          {currency} {totalAnnual >= 1000
            ? `${(totalAnnual / 1000).toFixed(1)}k`
            : totalAnnual.toFixed(0)}
        </Text>
      </View>
    )}
  </View>
)}
```

### New computed values needed
```tsx
const overdueCount = useMemo(() => {
  const today = startOfDay(new Date());
  return subscriptions.filter(s =>
    s.isActive && !s.isPaused && !isClearedThisCycle(s) && s.nextBillingDate < today
  ).length;
}, [subscriptions]);

const overdueTotal = useMemo(() => {
  const today = startOfDay(new Date());
  return subscriptions
    .filter(s => s.isActive && !s.isPaused && !isClearedThisCycle(s) && s.nextBillingDate < today)
    .reduce((sum, s) => sum + s.amount, 0);
}, [subscriptions]);
```

### Styles
```ts
heroStats: {
  flexDirection: 'row',
  alignItems: 'stretch',
  marginTop: SPACING.md,               // 16
  paddingTop: SPACING.md,              // 16
  borderTopWidth: 1,
  borderTopColor: withAlpha(C.accent, 0.08),
},
heroStat: {
  flex: 1,
  alignItems: 'center',
},
heroStatLabel: {
  fontSize: 10,
  fontWeight: TYPOGRAPHY.weight.semibold,
  color: C.textMuted,
  textTransform: 'uppercase',
  letterSpacing: 0.8,
  marginBottom: 2,
},
heroStatValue: {
  fontSize: TYPOGRAPHY.size.base,       // 15
  fontWeight: TYPOGRAPHY.weight.bold,
  color: C.textPrimary,
  fontVariant: ['tabular-nums'],
},
heroStatSub: {
  fontSize: 10,
  color: C.textMuted,
  fontVariant: ['tabular-nums'],
  marginTop: 1,
},
heroStatDivider: {
  width: 1,
  backgroundColor: withAlpha(C.accent, 0.10),
  marginVertical: 2,
},
```

### Edge cases
- **No next bill and no due soon**: Don't render the stats strip at all.
- **Next bill name too long**: Truncated at 12 chars (no ellipsis per project rules — just slice).
- **0 paused, yearly < 100**: Show yearly as plain number, no "k" suffix.
- **All paid**: Stats strip still shows (yearly total is still useful info), but "next" shows the next cycle's first bill.

---

## 6. Visual Treatment — Card Container

### Design Decision
The hero should feel like a premium financial summary card — think Copilot Money's month summary. Keep the olive-tinted background but make it more refined:

- **Background**: `withAlpha(C.accent, 0.03)` — barely tinted, not the current 0.04 (which is slightly too visible).
- **Border**: `withAlpha(C.accent, 0.08)` — subtler than current 0.10.
- **Border radius**: `RADIUS.xl` (20) — keep current.
- **No shadow** — the card is flush with the page, elevated by color tint alone. Shadows are reserved for floating elements per the design system.
- **Internal spacing**: Generous but not wasteful. `paddingHorizontal: SPACING.xl` (24), `paddingTop: SPACING.lg + SPACING.xs` (20), `paddingBottom: SPACING.lg` (16).

### Complete Card Style
```ts
monthHeader: {
  backgroundColor: withAlpha(C.accent, 0.03),
  borderRadius: RADIUS.xl,             // 20
  borderWidth: 1,
  borderColor: withAlpha(C.accent, 0.08),
  paddingHorizontal: SPACING.xl,       // 24
  paddingTop: SPACING.lg + SPACING.xs, // 20
  paddingBottom: SPACING.lg,           // 16
  marginBottom: SPACING.md,            // 16
},
```

---

## 7. Complete Assembled Layout

### Visual Structure (top to bottom within the card)
```
┌─────────────────────────────────────────────────┐
│ may 2026                              [/mo /yr] │  ← heroTopRow
│                                                 │
│ RM 1,240.00                                     │  ← heroAmount (42px bold)
│ paid RM 640 · remaining RM 600                  │  ← heroBreakdownRow (12px)
│                                                 │
│ ███ ███ ███ ░░░ ░░░ ░░░ ░░░                     │  ← segmented progress (6px)
│          3 of 7 paid this cycle                 │  ← heroProgressLabel (11px)
│                                                 │
│ ─────────────────────────────────────────────── │  ← 1px divider
│   next          this week         yearly        │  ← heroStats labels (10px)
│  Spotify           4           RM 14.9k         │  ← heroStats values (15px bold)
│  in 3 days      RM 320                          │  ← heroStats sub (10px)
└─────────────────────────────────────────────────┘
```

### Vertical spacing breakdown
- Card top padding: 20px
- heroTopRow (month + toggle): ~16px height
- gap: 4px (marginBottom on heroTopRow)
- heroAmount: ~48px height (42px font + lineHeight)
- heroBreakdownRow: ~16px height
- gap: 8px (marginTop on heroProgressBar)
- segmented bar: 6px
- progress label: ~14px
- gap: 16px (marginTop + paddingTop on heroStats via border-top)
- stats row: ~40px
- Card bottom padding: 16px
- **Total card height: ~188px** (with stats) or ~120px (without stats)

### Complete renderMonthHeader function
```tsx
const renderMonthHeader = () => {
  if (subscriptions.length === 0) return null;
  const remainingTotal = tabSections.remaining.reduce((s, x) => s + x.amount, 0);
  const paidTotal = tabSections.paid.reduce((s, x) => s + x.amount, 0);
  const heroAmount = remainingTotal + paidTotal;
  const showSplit = remainingTotal > 0 && paidTotal > 0;
  const allPaid = remainingTotal === 0 && paidTotal > 0;
  const noneYet = remainingTotal === 0 && paidTotal === 0;
  const paidPct = heroAmount > 0 ? (paidTotal / heroAmount) * 100 : 0;
  const paidCount = tabSections.paid.length;
  const totalCount = tabSections.remaining.length + tabSections.paid.length;

  return (
    <View style={styles.monthHeader}>
      {/* Row 1: month label + period toggle */}
      <View style={styles.heroTopRow}>
        <Text style={styles.heroMonth}>
          {format(new Date(), 'MMMM yyyy').toLowerCase()}
        </Text>
        <View style={styles.heroSegment}>
          <Pressable
            onPress={() => { lightTap(); setShowAnnual(false); }}
            style={[styles.heroSegBtn, !showAnnual && styles.heroSegBtnActive]}
          >
            <Text style={[styles.heroSegText, !showAnnual && styles.heroSegTextActive]}>/mo</Text>
          </Pressable>
          <Pressable
            onPress={() => { lightTap(); setShowAnnual(true); }}
            style={[styles.heroSegBtn, showAnnual && styles.heroSegBtnActive]}
          >
            <Text style={[styles.heroSegText, showAnnual && styles.heroSegTextActive]}>/yr</Text>
          </Pressable>
        </View>
      </View>

      {/* Row 2: Large amount */}
      <Text style={styles.heroAmount}>
        <Text style={styles.heroAmountCurrency}>{currency} </Text>
        {(showAnnual ? heroAmount * 12 : heroAmount).toLocaleString(undefined, {
          maximumFractionDigits: 2,
          minimumFractionDigits: 2,
        })}
      </Text>

      {/* Row 3: Paid/remaining breakdown text */}
      {showSplit && (
        <View style={styles.heroBreakdownRow}>
          <Text style={styles.heroBreakdownText}>
            <Text style={styles.heroBreakdownBold}>{currency} {paidTotal.toFixed(0)}</Text> paid
          </Text>
          <Text style={styles.heroBreakdownDot}>{'·'}</Text>
          <Text style={styles.heroBreakdownText}>
            <Text style={styles.heroBreakdownBold}>{currency} {remainingTotal.toFixed(0)}</Text> remaining
          </Text>
        </View>
      )}
      {allPaid && (
        <View style={styles.heroBreakdownRow}>
          <Feather name="check-circle" size={12} color={C.positive} />
          <Text style={[styles.heroBreakdownText, { color: C.positive, marginLeft: SPACING.xs }]}>
            all cleared this cycle
          </Text>
        </View>
      )}
      {noneYet && (
        <View style={styles.heroBreakdownRow}>
          <Text style={styles.heroBreakdownText}>no active {activeTab} this cycle</Text>
        </View>
      )}

      {/* Row 4: Segmented progress bar */}
      {totalCount > 0 && (
        <>
          <View style={styles.heroProgressBar}>
            {Array.from({ length: totalCount }).map((_, i) => {
              const isPaid = i < paidCount;
              return (
                <View
                  key={i}
                  style={[
                    styles.heroProgressSegment,
                    {
                      flex: 1,
                      backgroundColor: isPaid ? C.positive : withAlpha(C.accent, 0.12),
                      marginLeft: i > 0 ? 2 : 0,
                      borderTopLeftRadius: i === 0 ? 4 : 1,
                      borderBottomLeftRadius: i === 0 ? 4 : 1,
                      borderTopRightRadius: i === totalCount - 1 ? 4 : 1,
                      borderBottomRightRadius: i === totalCount - 1 ? 4 : 1,
                    },
                  ]}
                />
              );
            })}
          </View>
          <Text style={styles.heroProgressLabel}>
            {allPaid
              ? `all ${totalCount} paid this cycle`
              : `${paidCount} of ${totalCount} paid this cycle`}
          </Text>
        </>
      )}

      {/* Row 5: Stats strip (only when meaningful data exists) */}
      {totalCount > 0 && (nextBill || dueSoon.length > 0 || heroStats.paused > 0) && (
        <View style={styles.heroStats}>
          {/* Next due */}
          {nextBill && (
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>next</Text>
              <Text style={styles.heroStatValue} numberOfLines={1}>
                {nextBill.name.length > 12 ? nextBill.name.slice(0, 12) : nextBill.name}
              </Text>
              <Text style={styles.heroStatSub}>
                {getDueDateInfo(nextBill.nextBillingDate).text}
              </Text>
            </View>
          )}

          {nextBill && (overdueCount > 0 || dueSoon.length > 0) && (
            <View style={styles.heroStatDivider} />
          )}

          {/* Overdue (bronze) or Due this week */}
          {overdueCount > 0 ? (
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>overdue</Text>
              <Text style={[styles.heroStatValue, { color: C.bronze }]}>{overdueCount}</Text>
              <Text style={styles.heroStatSub}>
                {currency} {overdueTotal.toFixed(0)}
              </Text>
            </View>
          ) : dueSoon.length > 0 ? (
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>this week</Text>
              <Text style={styles.heroStatValue}>{dueSoon.length}</Text>
              <Text style={styles.heroStatSub}>
                {currency} {dueSoon.reduce((s, b) => s + b.amount, 0).toFixed(0)}
              </Text>
            </View>
          ) : null}

          {(overdueCount > 0 || dueSoon.length > 0) && (
            <View style={styles.heroStatDivider} />
          )}

          {/* Paused or Annual total */}
          {heroStats.paused > 0 ? (
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>paused</Text>
              <Text style={styles.heroStatValue}>{heroStats.paused}</Text>
            </View>
          ) : (
            <View style={styles.heroStat}>
              <Text style={styles.heroStatLabel}>yearly</Text>
              <Text style={styles.heroStatValue}>
                {totalAnnual >= 1000
                  ? `${(totalAnnual / 1000).toFixed(1)}k`
                  : totalAnnual.toFixed(0)}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
};
```

---

## 8. Complete Styles Block (all hero styles)

```ts
// ── Hero card ────────────────────────────────────────────
monthHeader: {
  backgroundColor: withAlpha(C.accent, 0.03),
  borderRadius: RADIUS.xl,
  borderWidth: 1,
  borderColor: withAlpha(C.accent, 0.08),
  paddingHorizontal: SPACING.xl,
  paddingTop: SPACING.lg + SPACING.xs,
  paddingBottom: SPACING.lg,
  marginBottom: SPACING.md,
},
heroTopRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: SPACING.xs,
},
heroMonth: {
  fontSize: TYPOGRAPHY.size.xs,
  fontWeight: TYPOGRAPHY.weight.bold,
  color: C.accent,
  letterSpacing: 1.8,
},
heroAmount: {
  fontSize: 42,
  fontWeight: TYPOGRAPHY.weight.bold,
  color: C.textPrimary,
  fontVariant: ['tabular-nums'],
  letterSpacing: -1.5,
  lineHeight: 48,
},
heroAmountCurrency: {
  fontSize: 20,
  fontWeight: TYPOGRAPHY.weight.medium,
  color: C.textMuted,
},
heroSegment: {
  flexDirection: 'row',
  backgroundColor: withAlpha(C.accent, 0.08),
  borderRadius: RADIUS.full,
  padding: 2,
},
heroSegBtn: {
  paddingHorizontal: SPACING.sm + 4,
  paddingVertical: 4,
  borderRadius: RADIUS.full,
},
heroSegBtnActive: {
  backgroundColor: C.accent,
},
heroSegText: {
  fontSize: 11,
  fontWeight: TYPOGRAPHY.weight.semibold,
  color: C.textMuted,
},
heroSegTextActive: {
  color: '#FFFFFF',
},
heroBreakdownRow: {
  flexDirection: 'row',
  alignItems: 'center',
  marginTop: 2,
  marginBottom: SPACING.sm,
},
heroBreakdownText: {
  fontSize: TYPOGRAPHY.size.xs,
  color: C.textMuted,
  fontVariant: ['tabular-nums'],
},
heroBreakdownBold: {
  fontWeight: TYPOGRAPHY.weight.semibold,
  color: C.textSecondary,
},
heroBreakdownDot: {
  fontSize: TYPOGRAPHY.size.xs,
  color: C.textMuted,
  marginHorizontal: SPACING.xs + 2,
},
heroProgressBar: {
  flexDirection: 'row',
  height: 6,
  marginTop: SPACING.sm,
},
heroProgressSegment: {
  height: '100%',
},
heroProgressLabel: {
  fontSize: 11,
  fontWeight: TYPOGRAPHY.weight.medium,
  color: C.textMuted,
  textAlign: 'center',
  marginTop: SPACING.xs + 1,
  fontVariant: ['tabular-nums'],
},
heroStats: {
  flexDirection: 'row',
  alignItems: 'stretch',
  marginTop: SPACING.md,
  paddingTop: SPACING.md,
  borderTopWidth: 1,
  borderTopColor: withAlpha(C.accent, 0.08),
},
heroStat: {
  flex: 1,
  alignItems: 'center',
},
heroStatLabel: {
  fontSize: 10,
  fontWeight: TYPOGRAPHY.weight.semibold,
  color: C.textMuted,
  textTransform: 'uppercase',
  letterSpacing: 0.8,
  marginBottom: 2,
},
heroStatValue: {
  fontSize: TYPOGRAPHY.size.base,
  fontWeight: TYPOGRAPHY.weight.bold,
  color: C.textPrimary,
  fontVariant: ['tabular-nums'],
},
heroStatSub: {
  fontSize: 10,
  color: C.textMuted,
  fontVariant: ['tabular-nums'],
  marginTop: 1,
},
heroStatDivider: {
  width: 1,
  backgroundColor: withAlpha(C.accent, 0.10),
  marginVertical: 2,
},
```

---

## 9. Styles to DELETE (replaced by new ones)

These old style keys are superseded and should be removed from makeStyles:

- `heroAmountRow` — replaced by standalone `heroAmount` (no longer a row with toggle)
- `heroProgress` — replaced by `heroProgressBar`
- `heroProgressTrack` — replaced by `heroProgressSegment`
- `heroProgressFill` — replaced by segment backgroundColor
- `heroProgressLabels` — replaced by `heroBreakdownRow`
- `heroProgressText` — replaced by `heroBreakdownText`
- `heroProgressBold` — replaced by `heroBreakdownBold`
- `heroPaidCount` — replaced by `heroProgressLabel`
- `heroAllPaid` — removed (handled inline)
- `heroAllPaidRow` — removed
- `heroAllPaidText` — removed

---

## 10. New Computed Values to Add

Add these after the existing `dueSoon` and `nextBill` useMemo blocks (around line 433):

```tsx
const overdueCount = useMemo(() => {
  const today = startOfDay(new Date());
  return subscriptions.filter(s =>
    s.isActive && !s.isPaused && !isClearedThisCycle(s) && s.nextBillingDate < today
  ).length;
}, [subscriptions]);

const overdueTotal = useMemo(() => {
  const today = startOfDay(new Date());
  return subscriptions
    .filter(s => s.isActive && !s.isPaused && !isClearedThisCycle(s) && s.nextBillingDate < today)
    .reduce((sum, s) => sum + s.amount, 0);
}, [subscriptions]);
```

---

## 11. Dark Mode Verification

All colors use `C.*` tokens which auto-switch via `useCalm()`:
- `C.accent`: `#4F5104` (light) / `#A4A843` (dark)
- `C.positive`: `#4F5104` / `#A4A843`
- `C.textPrimary`: `#1A1A1A` / `#F0EDE8`
- `C.textSecondary`: `#6B6B6B` / `#A8A8A8`
- `C.textMuted`: `#6A6A6A` / `#ABABAB`
- `C.bronze`: `#9A6400` / `#C9924A`
- `withAlpha(C.accent, ...)`: automatically derives from the correct accent

No hardcoded colors except `'#FFFFFF'` for active segment text (correct — white on olive works in both modes).

---

## 12. Summary of Changes

| Element | Before | After |
|---------|--------|-------|
| Month label | "MAY" uppercase | "may 2026" lowercase with year |
| Month position | Standalone above amount | Left side of top row, toggle on right |
| Amount | 44px | 42px, tighter letter-spacing (-1.5) |
| Period toggle | Below amount, right-aligned | Top row, right of month label |
| Progress bar | 5px continuous fill | 6px segmented bar (1 segment per bill) |
| Paid/due labels | Below bar, left/right | Inline text above bar: "paid RM X · remaining RM Y" |
| "X of Y paid" | Separate centered text | Below segmented bar |
| Stats | None | 3-column strip: next / overdue or this week / paused or yearly |
| Card background | withAlpha 0.04 | withAlpha 0.03 (subtler) |
| Card border | withAlpha 0.10 | withAlpha 0.08 (subtler) |
| All paid state | Green bar + check text | All segments olive + "all cleared this cycle" |
