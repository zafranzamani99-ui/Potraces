# Agent 2: Filter System, Tab Pills, Sorting & Search UX — Design Plan

## Current State Analysis

### Data Model (Subscription type)
- `id`, `name`, `amount`, `category`, `billingCycle` (monthly/yearly/weekly/quarterly)
- `nextBillingDate`, `startDate`, `lastPaidAt`, `isActive`, `isPaused`
- `isInstallment`, `totalInstallments`, `completedInstallments`, `outstandingBalance`
- `walletId`, `note`, `paymentHistory[]`

### Current Classification
- `CommitmentKind = 'bills' | 'payments' | 'subs'`
- `classifyKind()` auto-classifies: installments → payments, bill-like categories/names → bills, rest → subs
- `sections` splits into: `remaining` (unpaid active), `paid` (cleared this cycle), `paused`
- `tabSections` = sections filtered by activeTab

### Current UI Elements
- 3 pill chips: bills / payments / subscriptions (active = olive fill, inactive = transparent + border)
- Always-visible search bar (rounded, muted bg, magnifying glass icon)
- 14-day strip calendar (horizontal scroll, dots for bills on each day)
- `groupBy` toggle exists in styles but is `'status' | 'category'` (status/category)
- `showAnnual` toggle (/mo vs /yr) in the hero

### Problems with Current Design
1. Tabs only filter by TYPE — no way to see "what's overdue" or "what's due this week" across types
2. Search bar always visible wastes vertical space when not in use
3. No sort options at all
4. The 3 tabs look identical to every generic finance app — "boring" per user feedback
5. Tab + day strip + search = 3 separate navigation zones competing for attention

---

## New Design: Two-Tier Contextual Filter System

### Philosophy
Instead of treating type/status/time as separate dimensions fighting for space, unify them into a **primary context** (what the user cares about RIGHT NOW) with a **secondary refinement** layer. The 14-day strip already acts as a time filter — lean into that rather than duplicating it.

---

## 1. PRIMARY NAVIGATION: "Context Chips" (replaces current tabs)

### The Chips
Replace the 3 type-only tabs with **5 context-aware chips** in a horizontal ScrollView:

| Chip | Filter Logic | Icon | Shows |
|------|-------------|------|-------|
| **all** | No filter | `layers` | Everything (default) |
| **upcoming** | `!isClearedThisCycle && nextBillingDate >= today && nextBillingDate <= endOfMonth` | `clock` | Due rest of month |
| **overdue** | `!isClearedThisCycle && nextBillingDate < today` | `alert-circle` | Past due date |
| **cleared** | `isClearedThisCycle(sub) === true` | `check-circle` | Paid this cycle |
| **paused** | `isPaused === true` | `pause-circle` | On hold |

### Why This Is Better
- **Status-first** matches how people think about bills ("what do I owe?" not "show me subscriptions")
- "Overdue" chip with a count badge creates urgency without using red
- "All" as default means the 14-day strip and hero stats remain fully useful
- Type classification (bills/payments/subs) moves to a secondary filter (see below)

### Chip Interaction with Existing Features
- When **"upcoming"** is active: the 14-day strip highlights only the matching days
- When **"overdue"** is active: the 14-day strip hides (overdue items are in the past)
- When **"cleared"** is active: the 14-day strip hides (already paid)
- When **"paused"** is active: the 14-day strip hides (paused items have no upcoming date)
- When **"all"** is active: the 14-day strip shows normally

### Visual Design

```
Active chip:
  backgroundColor: withAlpha(C.accent, 0.12)
  borderColor: C.accent
  borderWidth: 1.5
  borderRadius: RADIUS.full
  → Text color: C.accent (olive)
  → Icon color: C.accent

Inactive chip:
  backgroundColor: C.surface
  borderColor: withAlpha(C.textPrimary, 0.08)
  borderWidth: 1
  borderRadius: RADIUS.full
  → Text color: C.textSecondary
  → Icon color: C.textMuted

Overdue chip (when count > 0, even if not active):
  → Has a small terracotta (#C1694F) dot badge (5px) on top-right
  → When active, badge sits on the active chip bg

Cleared chip (when all are cleared):
  → Subtle olive tint: withAlpha(C.positive, 0.06) bg even when inactive
```

### JSX Structure

```tsx
const renderContextChips = () => {
  if (subscriptions.length === 0) return null;

  const contexts: {
    key: StatusFilter;
    label: string;
    icon: string;
    count: number;
    hasDot?: boolean;
  }[] = [
    { key: 'all', label: 'all', icon: 'layers', count: subscriptions.filter(s => s.isActive).length },
    { key: 'upcoming', label: 'upcoming', icon: 'clock', count: upcomingCount },
    { key: 'overdue', label: 'overdue', icon: 'alert-circle', count: overdueCount, hasDot: overdueCount > 0 },
    { key: 'cleared', label: 'cleared', icon: 'check-circle', count: clearedCount },
    { key: 'paused', label: 'paused', icon: 'pause-circle', count: pausedCount },
  ];

  // Don't show chips with 0 count (except "all" which always shows)
  const visibleContexts = contexts.filter(c => c.key === 'all' || c.count > 0);

  return (
    <View style={styles.contextChipRow}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: SPACING.xs + 2, paddingRight: SPACING['2xl'] }}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
      >
        {visibleContexts.map(ctx => {
          const active = statusFilter === ctx.key;
          return (
            <TouchableOpacity
              key={ctx.key}
              style={[
                styles.contextChip,
                active && styles.contextChipActive,
                ctx.key === 'cleared' && allCleared && !active && styles.contextChipAllCleared,
              ]}
              onPress={() => { lightTap(); setStatusFilter(ctx.key); }}
              activeOpacity={0.7}
            >
              <Feather
                name={ctx.icon as any}
                size={13}
                color={active ? C.accent : C.textMuted}
                style={{ marginRight: 5 }}
              />
              <Text style={[styles.contextChipText, active && styles.contextChipTextActive]}>
                {ctx.label}
              </Text>
              {ctx.count > 0 && (
                <View style={[styles.contextChipCount, active && styles.contextChipCountActive]}>
                  <Text style={[styles.contextChipCountText, active && styles.contextChipCountTextActive]}>
                    {ctx.count}
                  </Text>
                </View>
              )}
              {ctx.hasDot && !active && (
                <View style={styles.overdueDotBadge} />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {/* Right fade edge (MANDATORY per design system) */}
      <LinearGradient
        colors={[withAlpha(C.background, 0), C.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.contextChipFade}
        pointerEvents="none"
      />
    </View>
  );
};
```

### Styles for Context Chips

```tsx
contextChipRow: {
  position: 'relative',
  marginBottom: SPACING.md,
  marginRight: -SPACING['2xl'],
},
contextChip: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingHorizontal: SPACING.md + 2,
  paddingVertical: SPACING.xs + 3,
  borderRadius: RADIUS.full,
  backgroundColor: C.surface,
  borderWidth: 1,
  borderColor: withAlpha(C.textPrimary, 0.08),
},
contextChipActive: {
  backgroundColor: withAlpha(C.accent, 0.12),
  borderColor: C.accent,
  borderWidth: 1.5,
},
contextChipAllCleared: {
  backgroundColor: withAlpha(C.positive, 0.06),
},
contextChipText: {
  fontSize: TYPOGRAPHY.size.sm,
  fontWeight: TYPOGRAPHY.weight.medium,
  color: C.textSecondary,
},
contextChipTextActive: {
  color: C.accent,
  fontWeight: TYPOGRAPHY.weight.semibold,
},
contextChipCount: {
  marginLeft: 5,
  backgroundColor: withAlpha(C.textPrimary, 0.08),
  borderRadius: RADIUS.full,
  paddingHorizontal: 5,
  paddingVertical: 1,
  minWidth: 18,
  alignItems: 'center',
},
contextChipCountActive: {
  backgroundColor: withAlpha(C.accent, 0.18),
},
contextChipCountText: {
  fontSize: 10,
  fontWeight: TYPOGRAPHY.weight.bold,
  color: C.textMuted,
},
contextChipCountTextActive: {
  color: C.accent,
},
overdueDotBadge: {
  position: 'absolute',
  top: -1,
  right: -1,
  width: 6,
  height: 6,
  borderRadius: 3,
  backgroundColor: '#C1694F', // terracotta from semantic color system
},
contextChipFade: {
  position: 'absolute',
  right: 0,
  top: 0,
  bottom: 0,
  width: 40,
},
```

---

## 2. SECONDARY FILTER: "Type Refinement" (inline, not a separate row)

### Concept
When a context chip is active and the list has mixed types, show a subtle **inline type bar** directly below the context chips. This only appears when the filtered list contains items from 2+ types.

### The Type Filters
| Key | Label | Logic |
|-----|-------|-------|
| `all_types` | all types | No additional filter |
| `bills` | bills | `classifyKind(s) === 'bills'` |
| `payments` | payments | `classifyKind(s) === 'payments'` |
| `subs` | subscriptions | `classifyKind(s) === 'subs'` |

### Visual Design
These are NOT pill chips. They are **text-only toggles** with an underline indicator — minimal, secondary.

```
Active type:
  Text: C.accent, fontWeight: semibold
  2px bottom border: C.accent (partial width, centered)

Inactive type:
  Text: C.textMuted, fontWeight: medium
  No bottom border
```

### JSX Structure

```tsx
const renderTypeBar = () => {
  // Only show if current filtered list has mixed types
  const filteredForStatus = getStatusFilteredList(); // the list after primary filter
  const typesPresent = new Set(filteredForStatus.map(s => classifyKind(s)));
  if (typesPresent.size < 2) return null;

  const types: { key: TypeFilter; label: string }[] = [
    { key: 'all_types', label: 'all types' },
    ...(typesPresent.has('bills') ? [{ key: 'bills' as TypeFilter, label: 'bills' }] : []),
    ...(typesPresent.has('payments') ? [{ key: 'payments' as TypeFilter, label: 'payments' }] : []),
    ...(typesPresent.has('subs') ? [{ key: 'subs' as TypeFilter, label: 'subscriptions' }] : []),
  ];

  return (
    <View style={styles.typeBar}>
      {types.map(tp => {
        const active = typeFilter === tp.key;
        return (
          <TouchableOpacity
            key={tp.key}
            onPress={() => { lightTap(); setTypeFilter(tp.key); }}
            style={styles.typeBarItem}
            activeOpacity={0.7}
          >
            <Text style={[styles.typeBarText, active && styles.typeBarTextActive]}>
              {tp.label}
            </Text>
            {active && <View style={styles.typeBarIndicator} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};
```

### Styles

```tsx
typeBar: {
  flexDirection: 'row',
  gap: SPACING.lg,
  marginBottom: SPACING.sm,
  paddingBottom: SPACING.xs,
},
typeBarItem: {
  alignItems: 'center',
  paddingBottom: SPACING.xs,
},
typeBarText: {
  fontSize: TYPOGRAPHY.size.xs,
  fontWeight: TYPOGRAPHY.weight.medium,
  color: C.textMuted,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
},
typeBarTextActive: {
  color: C.accent,
  fontWeight: TYPOGRAPHY.weight.semibold,
},
typeBarIndicator: {
  position: 'absolute',
  bottom: 0,
  height: 2,
  width: '60%',
  backgroundColor: C.accent,
  borderRadius: 1,
},
```

---

## 3. SEARCH UX: Icon-Triggered Expanding Search

### Current Problem
Always-visible search bar wastes ~48px of vertical space that 90% of users don't need most of the time.

### New Design: Expandable Search in Header Area

A search icon sits at the **right end of the context chip row**. Tapping it expands an inline search bar that overlays the context chips with a smooth animation.

### States

**Collapsed (default):**
- Small circular button (32x32) with search icon
- Sits at the far right, vertically centered with the context chips
- Background: `C.surface`, border: `withAlpha(C.textPrimary, 0.08)`

**Expanded:**
- Full-width search bar replaces the context chip row
- Auto-focuses the TextInput
- Shows an "x" button on the right to close and clear
- All filters are temporarily hidden (search searches EVERYTHING regardless of active filters)
- Rounded pill shape matching the context chips

### Animation
Use `Animated.Value` (0 → 1) to:
- Fade out context chips (opacity 1 → 0)
- Expand search bar width from 32px to full width
- Fade in TextInput (opacity 0 → 1)

### JSX Structure

```tsx
const [searchExpanded, setSearchExpanded] = useState(false);
const searchExpandAnim = useRef(new Animated.Value(0)).current;

const expandSearch = () => {
  setSearchExpanded(true);
  Animated.spring(searchExpandAnim, {
    toValue: 1,
    useNativeDriver: false,
    tension: 80,
    friction: 12,
  }).start();
  // Auto focus handled by ref
  setTimeout(() => searchInputRef.current?.focus(), 150);
};

const collapseSearch = () => {
  Keyboard.dismiss();
  setSearchQuery('');
  Animated.spring(searchExpandAnim, {
    toValue: 0,
    useNativeDriver: false,
    tension: 80,
    friction: 12,
  }).start(() => setSearchExpanded(false));
};

// In the render, REPLACE the old searchContainer with:
// The search icon sits at the absolute right of contextChipRow
// When expanded, it becomes the full search bar

const renderSearchToggle = () => {
  if (subscriptions.length === 0) return null;

  if (searchExpanded) {
    return (
      <Animated.View style={[
        styles.searchBarExpanded,
        {
          opacity: searchExpandAnim,
        },
      ]}>
        <Feather name="search" size={16} color={C.accent} style={{ marginRight: SPACING.sm }} />
        <TextInput
          ref={searchInputRef}
          style={styles.searchInputExpanded}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="search all commitments..."
          placeholderTextColor={C.textMuted}
          returnKeyType="search"
          onSubmitEditing={Keyboard.dismiss}
          autoFocus
        />
        <TouchableOpacity
          onPress={collapseSearch}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.searchCloseBtn}
        >
          <Feather name="x" size={16} color={C.textSecondary} />
        </TouchableOpacity>
      </Animated.View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.searchIconBtn}
      onPress={expandSearch}
      activeOpacity={0.7}
    >
      <Feather name="search" size={16} color={C.textMuted} />
    </TouchableOpacity>
  );
};
```

### Search Interaction with Filters
- When search is active (has text), **ALL filters are bypassed** — search searches the entire subscription list
- The filtered sections are replaced with a flat search results list
- Search matches against: `name`, `category`, `note`
- Results sorted by relevance (exact match first, then partial)
- When search is cleared/closed, previous filter state is restored

### Styles

```tsx
searchIconBtn: {
  width: 34,
  height: 34,
  borderRadius: 17,
  backgroundColor: C.surface,
  borderWidth: 1,
  borderColor: withAlpha(C.textPrimary, 0.08),
  alignItems: 'center',
  justifyContent: 'center',
  // Positioned at the right end of the context chip row
  position: 'absolute',
  right: 0,
  top: 0,
},
searchBarExpanded: {
  flexDirection: 'row',
  alignItems: 'center',
  backgroundColor: withAlpha(C.accent, 0.06),
  borderRadius: RADIUS.full,
  borderWidth: 1.5,
  borderColor: withAlpha(C.accent, 0.20),
  paddingHorizontal: SPACING.md,
  marginBottom: SPACING.md,
  height: 42,
},
searchInputExpanded: {
  flex: 1,
  paddingVertical: SPACING.sm,
  fontSize: TYPOGRAPHY.size.base,
  color: C.textPrimary,
},
searchCloseBtn: {
  padding: SPACING.xs,
},
```

---

## 4. SORTING: Contextual Sort with Single-Tap Cycling

### Concept
Rather than a dropdown, use a **sort label** that sits in the section header area and cycles through options on tap. This is minimal, discoverable, and doesn't waste space.

### Sort Options
| Key | Label shown | Logic |
|-----|------------|-------|
| `due_date` | "by date" | `nextBillingDate` ascending (default) |
| `amount_high` | "by amount ↑" | `amount` descending |
| `amount_low` | "by amount ↓" | `amount` ascending |
| `name` | "a-z" | `name` alphabetical |
| `recently_paid` | "last paid" | `lastPaidAt` descending (only in "cleared" context) |

### Sort Cycling Behavior
- Tap the sort label → cycle to next option
- Long press → reset to default (`due_date`)
- Sort icon changes based on current sort: `arrow-up`, `arrow-down`, `a-z` indicator

### Where It Appears
The sort control sits on the **right side of the section header** for the first visible section. It's a small text label with an icon.

### JSX

```tsx
type SortOption = 'due_date' | 'amount_high' | 'amount_low' | 'name' | 'recently_paid';

const [sortBy, setSortBy] = useState<SortOption>('due_date');

const sortOptions: SortOption[] = statusFilter === 'cleared'
  ? ['due_date', 'amount_high', 'amount_low', 'name', 'recently_paid']
  : ['due_date', 'amount_high', 'amount_low', 'name'];

const cycleSortOption = () => {
  lightTap();
  const currentIdx = sortOptions.indexOf(sortBy);
  const nextIdx = (currentIdx + 1) % sortOptions.length;
  setSortBy(sortOptions[nextIdx]);
};

const sortLabel: Record<SortOption, string> = {
  due_date: 'by date',
  amount_high: 'highest first',
  amount_low: 'lowest first',
  name: 'a — z',
  recently_paid: 'last paid',
};

const sortIcon: Record<SortOption, string> = {
  due_date: 'calendar',
  amount_high: 'arrow-up',
  amount_low: 'arrow-down',
  name: 'type',
  recently_paid: 'clock',
};

// Render in section header:
const renderSortControl = () => (
  <TouchableOpacity
    style={styles.sortControl}
    onPress={cycleSortOption}
    onLongPress={() => { lightTap(); setSortBy('due_date'); }}
    activeOpacity={0.7}
  >
    <Feather name={sortIcon[sortBy] as any} size={11} color={C.textMuted} />
    <Text style={styles.sortLabel}>{sortLabel[sortBy]}</Text>
    <Feather name="chevron-down" size={10} color={C.textMuted} style={{ marginLeft: 2 }} />
  </TouchableOpacity>
);
```

### Applying Sort to Data

```tsx
const applySortToList = (list: Subscription[]): Subscription[] => {
  const sorted = [...list];
  switch (sortBy) {
    case 'due_date':
      return sorted.sort((a, b) => a.nextBillingDate.getTime() - b.nextBillingDate.getTime());
    case 'amount_high':
      return sorted.sort((a, b) => b.amount - a.amount);
    case 'amount_low':
      return sorted.sort((a, b) => a.amount - b.amount);
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'recently_paid':
      return sorted.sort((a, b) => (b.lastPaidAt?.getTime() || 0) - (a.lastPaidAt?.getTime() || 0));
    default:
      return sorted;
  }
};
```

### Styles

```tsx
sortControl: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  paddingHorizontal: SPACING.sm,
  paddingVertical: SPACING.xs - 1,
  borderRadius: RADIUS.full,
  backgroundColor: withAlpha(C.textPrimary, 0.04),
},
sortLabel: {
  fontSize: 10,
  fontWeight: TYPOGRAPHY.weight.semibold,
  color: C.textMuted,
  textTransform: 'uppercase',
  letterSpacing: 0.3,
},
```

---

## 5. FILTER COUNTS & INDICATORS

### Count Badges on Context Chips
Each context chip shows its count as a small rounded badge INSIDE the chip, to the right of the label text.

```
[ clock  upcoming  3 ]   [ alert-circle  overdue  1• ]   [ check-circle  cleared  5 ]
```

- Badge uses a subtle background pill: `withAlpha(C.textPrimary, 0.08)` when inactive, `withAlpha(C.accent, 0.18)` when active
- Text: 10px bold
- Zero-count chips (except "all") are HIDDEN entirely — don't show "paused 0"

### Overdue Indicator
The "overdue" chip has a **terracotta dot** (6px) at the top-right corner when there are overdue items AND the chip is NOT the active chip. When the chip IS active, the dot is unnecessary since the user is already looking at overdue items.

### Cleared Progress
When `statusFilter === 'all'`, the hero progress bar already shows cleared/total. No duplication needed.

---

## 6. STATE MANAGEMENT

### New State Variables

```tsx
// Replace activeTab with these:
type StatusFilter = 'all' | 'upcoming' | 'overdue' | 'cleared' | 'paused';
type TypeFilter = 'all_types' | 'bills' | 'payments' | 'subs';
type SortOption = 'due_date' | 'amount_high' | 'amount_low' | 'name' | 'recently_paid';

const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
const [typeFilter, setTypeFilter] = useState<TypeFilter>('all_types');
const [sortBy, setSortBy] = useState<SortOption>('due_date');
const [searchExpanded, setSearchExpanded] = useState(false);
// searchQuery already exists
```

### Remove These State Variables
```tsx
// DELETE:
const [activeTab, setActiveTab] = useState<CommitmentKind>('subs');
const [groupBy, setGroupBy] = useState<'status' | 'category'>('status');
// groupBy is replaced by the status-first context chips
```

### Computed Values (memoized)

```tsx
// ── Filter counts ────────────────────────────────────────
const filterCounts = useMemo(() => {
  const active = subscriptions.filter(s => s.isActive);
  const today = startOfDay(new Date());
  const eom = endOfMonth(new Date());

  return {
    all: active.length,
    upcoming: active.filter(s => !s.isPaused && !isClearedThisCycle(s) && s.nextBillingDate >= today && s.nextBillingDate <= eom).length,
    overdue: active.filter(s => !s.isPaused && !isClearedThisCycle(s) && s.nextBillingDate < today).length,
    cleared: active.filter(s => !s.isPaused && isClearedThisCycle(s)).length,
    paused: active.filter(s => s.isPaused).length,
  };
}, [subscriptions]);

const { overdueCount, upcomingCount, clearedCount, pausedCount } = useMemo(() => ({
  overdueCount: filterCounts.overdue,
  upcomingCount: filterCounts.upcoming,
  clearedCount: filterCounts.cleared,
  pausedCount: filterCounts.paused,
}), [filterCounts]);

const allCleared = filterCounts.upcoming === 0 && filterCounts.overdue === 0 && filterCounts.cleared > 0;

// ── Primary filter (status) ──────────────────────────────
const statusFilteredList = useMemo(() => {
  const active = subscriptions.filter(s => s.isActive);
  const today = startOfDay(new Date());
  const eom = endOfMonth(new Date());

  switch (statusFilter) {
    case 'upcoming':
      return active.filter(s => !s.isPaused && !isClearedThisCycle(s) && s.nextBillingDate >= today && s.nextBillingDate <= eom);
    case 'overdue':
      return active.filter(s => !s.isPaused && !isClearedThisCycle(s) && s.nextBillingDate < today);
    case 'cleared':
      return active.filter(s => !s.isPaused && isClearedThisCycle(s));
    case 'paused':
      return active.filter(s => s.isPaused);
    case 'all':
    default:
      return active;
  }
}, [subscriptions, statusFilter]);

// ── Secondary filter (type) ─────────────────────────────
const typeFilteredList = useMemo(() => {
  if (typeFilter === 'all_types') return statusFilteredList;
  return statusFilteredList.filter(s => classifyKind(s) === typeFilter);
}, [statusFilteredList, typeFilter, classifyKind]);

// ── Sort ────────────────────────────────────────────────
const sortedList = useMemo(() => {
  return applySortToList(typeFilteredList);
}, [typeFilteredList, sortBy]);

// ── Final display list (search overrides everything) ────
const displayList = useMemo(() => {
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    return subscriptions
      .filter(s => s.isActive)
      .filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        (s.note || '').toLowerCase().includes(q)
      )
      .sort((a, b) => {
        // Exact name match first
        const aExact = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bExact = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (aExact !== bExact) return aExact - bExact;
        return a.nextBillingDate.getTime() - b.nextBillingDate.getTime();
      });
  }
  return sortedList;
}, [searchQuery, subscriptions, sortedList]);
```

### Filter Reset Behavior
- When `statusFilter` changes → reset `typeFilter` to `'all_types'`, reset `sortBy` to `'due_date'`
- When search is active → filters are visually hidden but state preserved
- When search is cleared → previous filter state restores

```tsx
const handleStatusFilterChange = useCallback((newFilter: StatusFilter) => {
  setStatusFilter(newFilter);
  setTypeFilter('all_types');
  setSortBy('due_date');
}, []);
```

---

## 7. DAY STRIP INTERACTION WITH FILTERS

### Rules
- `statusFilter === 'all'` → day strip shows normally (all upcoming unpaid)
- `statusFilter === 'upcoming'` → day strip shows, same data (both show upcoming)
- `statusFilter === 'overdue' | 'cleared' | 'paused'` → day strip HIDES (irrelevant data)
- `searchQuery` active → day strip HIDES

### Implementation

```tsx
const showDayStrip = statusFilter === 'all' || statusFilter === 'upcoming';

// In render:
{showDayStrip && renderDayStrip()}
```

When a day in the strip is tapped AND it matches a single bill, open that bill's detail/edit (existing behavior). When it matches multiple bills, scroll the list to highlight those bills.

---

## 8. SECTION RENDERING WITH NEW FILTERS

### When statusFilter is 'all':
Show sections grouped by status (same as current), but each section is type-filtered if typeFilter is set:
- **remaining** section → unpaid, not paused
- **cleared** section → paid this cycle
- **paused** section → paused items

### When statusFilter is 'upcoming' | 'overdue' | 'cleared' | 'paused':
Show a FLAT list (no section headers needed — the filter already defines the section). Use the sort control to order items.

### JSX Logic

```tsx
// In the main render, replace the current tab-based sections:
{searchResults !== null ? (
  // ... existing search results rendering ...
) : statusFilter === 'all' ? (
  // Grouped by status (like current, but using typeFilteredList)
  <>
    {renderSection('remaining', groupedByStatus.remaining, false)}
    {renderSection('cleared', groupedByStatus.cleared, true)}
    {renderSection('paused', groupedByStatus.paused, false)}
  </>
) : (
  // Flat filtered list with sort
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLabel}>
        {displayList.length} {statusFilter === 'upcoming' ? 'due this month' : statusFilter}
      </Text>
      {renderSortControl()}
    </View>
    {displayList.length === 0 ? (
      <View style={styles.filterEmpty}>
        <Feather name="check" size={28} color={C.textMuted} />
        <Text style={styles.filterEmptyText}>
          {statusFilter === 'overdue' ? 'nothing overdue — all clear' :
           statusFilter === 'cleared' ? 'nothing cleared yet this cycle' :
           statusFilter === 'paused' ? 'no paused commitments' :
           'nothing upcoming this month'}
        </Text>
      </View>
    ) : (
      displayList.map((sub, idx) => (
        <React.Fragment key={sub.id}>
          {renderRow(sub, isClearedThisCycle(sub))}
          {idx < displayList.length - 1 && <View style={styles.rowDivider} />}
        </React.Fragment>
      ))
    )}
  </View>
)}
```

---

## 9. HERO HEADER INTERACTION

The hero header (month name + amount + progress bar) should update its numbers based on the active status filter:
- `statusFilter === 'all'` → total of all active (current behavior)
- `statusFilter === 'upcoming'` → total of upcoming only
- `statusFilter === 'overdue'` → total overdue amount
- `statusFilter === 'cleared'` → total cleared amount
- `statusFilter === 'paused'` → total paused amount (what you'd owe if unpaused)

The progress bar (paid vs due) only makes sense for `'all'` and `'upcoming'`. For other filters, hide it.

---

## 10. EMPTY STATE PER FILTER

```tsx
filterEmpty: {
  alignItems: 'center',
  paddingVertical: SPACING['3xl'],
  gap: SPACING.sm,
},
filterEmptyText: {
  fontSize: TYPOGRAPHY.size.sm,
  fontWeight: TYPOGRAPHY.weight.medium,
  color: C.textMuted,
  textAlign: 'center',
},
```

---

## Summary of Deletions & Additions

### DELETE
- `activeTab` state + `CommitmentKind` type (for filtering, keep for classifyKind)
- `tabCounts` memo
- `tabSections` memo
- `renderTabs()` function
- `groupBy` state + `groupByRow`/`groupByPill` styles
- `searchContainer` always-visible search bar
- All `tabChip*` styles, `tabRow` style, `tabEmpty*` styles

### ADD
- `statusFilter` state (`StatusFilter` type)
- `typeFilter` state (`TypeFilter` type)
- `sortBy` state (`SortOption` type)
- `searchExpanded` state
- `filterCounts` memo
- `statusFilteredList` memo
- `typeFilteredList` memo
- `sortedList` memo
- `displayList` memo
- `renderContextChips()` function
- `renderTypeBar()` function
- `renderSortControl()` function
- `renderSearchToggle()` function
- All new styles for context chips, type bar, sort control, expanded search

### KEEP (unchanged)
- `classifyKind()` function (still needed for type bar)
- `searchQuery` state
- `searchResults` memo (adapt to use displayList)
- `dayStrip` memo
- `renderDayStrip()` (add visibility toggle)
- `calendarBillMap` memo
- `sections` memo (still useful for 'all' view grouping)
- All swipe action code
- All modal/form code
- `renderRow()` function
- `renderSection()` function

### MODIFY
- `renderMonthHeader()` → use displayList totals based on filter
- Main render layout → new component order
- `CommitmentKind` type → keep for classifyKind, but no longer drives primary navigation
