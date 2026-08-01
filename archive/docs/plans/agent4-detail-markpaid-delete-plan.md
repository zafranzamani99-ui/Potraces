# Agent 4 Plan: Detail Modal, Mark-Paid Flow, Payment History, Delete Confirmation

## Current State Analysis

### What exists today
- **Detail modal** (`renderDetailModal`): 90% width card, hero (avatar circle + name + category badge), amount section (36px bold), installment progress bar, 4 info rows (next due, wallet, reminder, started), note section, paused banner, payment history (last 6, simple list with check-circle icon), action bar (mark paid primary button + edit/pause/delete row)
- **Mark-paid modal** (`renderMarkPaidModal`): 88% width card, hero amount (36px), name, next-cycle pill, two buttons: "mark as paid" (olive) and "pay from [wallet]" (subtle)
- **Delete modal** (`renderDeleteModal`): 84% width card, trash icon circle, title, name badge, warning message, "keep it" button (prominent), delete link (subdued)

### Pain points
1. Detail modal is functional but flat — no visual hierarchy between sections, info rows all look the same weight
2. Payment history is a simple list with no grouping, no visual timeline feel
3. Mark-paid gives no confirmation feedback beyond a toast — no satisfying moment
4. No outstanding balance display in the detail modal
5. Installment progress bar is plain — no milestone markers or completion celebration
6. Action bar at bottom feels cramped when all 4 actions show

---

## 1. Detail Modal — Complete Redesign

### Structure (top to bottom)

```
┌──────────────────────────────────────┐
│  [x] close                           │   ← absolute top-right
│                                      │
│         ┌──────┐                     │
│         │  N   │  ← avatar 60px      │
│         └──────┘                     │
│       Netflix                        │   ← name, xl bold
│     ┌─entertainment─┐               │   ← category pill
│                                      │
│      RM 54.90                        │   ← 38px bold hero amount
│      monthly                         │   ← cycle label, muted
│                                      │
│  ┌─ PAUSED ── commitment paused ──┐  │   ← bronze banner (if paused)
│                                      │
│  ┌──────────────────────────────┐    │
│  │ ◉ next due    │  Jun 15      │    │   ← info card (grouped)
│  │ ◉ wallet      │  Maybank     │    │
│  │ ◉ reminder    │  3 days      │    │
│  │ ◉ started     │  Jan 1, 2024 │    │
│  └──────────────────────────────┘    │
│                                      │
│  ┌── installment progress ────────┐  │   ← only if isInstallment
│  │  ████████░░░░  4/12 payments   │  │
│  │  outstanding: RM 4,392.00      │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌── note ────────────────────────┐  │   ← only if note exists
│  │  "Shared with family plan"     │  │
│  └────────────────────────────────┘  │
│                                      │
│  PAYMENT HISTORY                     │   ← section label
│  ┌────────────────────────────────┐  │
│  │ ✓  Jun 1, 2025   RM 54.90     │  │   ← timeline dots
│  │ │                              │  │
│  │ ✓  May 1, 2025   RM 54.90     │  │
│  │ │                              │  │
│  │ ✓  Apr 1, 2025   RM 54.90     │  │
│  └────────────────────────────────┘  │
│                                      │
│  ╔══════════════════════════════╗    │
│  ║     ✓  mark paid             ║    │   ← primary CTA (olive, full width)
│  ╚══════════════════════════════╝    │
│                                      │
│   edit    pause    delete            │   ← secondary actions row
└──────────────────────────────────────┘
```

### JSX Structure

```tsx
const renderDetailModal = () => {
  if (!detailSub) return null;
  const sub = subscriptions.find(s => s.id === detailSub.id) || detailSub;
  const accentColor = avatarColorForName(sub.name);
  const cleared = isClearedThisCycle(sub);
  const { text: dueDateText, accent } = getDueDateInfo(sub.nextBillingDate);
  const dueColor = cleared ? C.positive : accent === 'overdue' ? '#C1694F' : accent === 'today' ? C.gold : C.textSecondary;
  const linkedWallet = wallets.find(w => w.id === sub.walletId);
  const isInstSub = sub.isInstallment && sub.totalInstallments;
  const completed = sub.completedInstallments || 0;
  const total = sub.totalInstallments || 1;
  const progressPct = Math.min((completed / total) * 100, 100);
  const isComplete = isInstSub && completed >= total;
  const catObj = expenseCategories.find(c => c.id === sub.category);
  const history = sub.paymentHistory?.slice().reverse().slice(0, 8) || [];
  const outstanding = sub.outstandingBalance;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => setDetailSub(null)}>
      <Pressable style={styles.overlayCenter} onPress={() => setDetailSub(null)}>
        <View style={styles.dtCard} onStartShouldSetResponder={() => true}>
          {/* Close button */}
          <TouchableOpacity
            onPress={() => setDetailSub(null)}
            style={styles.dtClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="x" size={18} color={C.textMuted} />
          </TouchableOpacity>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
            contentContainerStyle={{ paddingBottom: SPACING.sm }}
          >
            {/* ── Hero Section ── */}
            <View style={styles.dtHero}>
              <View style={[styles.dtAvatar, {
                backgroundColor: cleared
                  ? withAlpha(C.positive, 0.14)
                  : isComplete
                    ? withAlpha(C.gold, 0.14)
                    : accentColor
              }]}>
                {cleared
                  ? <Feather name="check" size={24} color={C.positive} />
                  : isComplete
                    ? <Feather name="award" size={24} color={C.gold} />
                    : <Text style={styles.dtAvatarLetter}>{sub.name.charAt(0).toUpperCase()}</Text>
                }
              </View>
              <Text style={styles.dtName}>{sub.name}</Text>
              {catObj && (
                <View style={styles.dtCatBadge}>
                  <Text style={styles.dtCatText}>{catObj.name.toLowerCase()}</Text>
                </View>
              )}
            </View>

            {/* ── Amount Section ── */}
            <View style={styles.dtAmountSection}>
              <Text style={styles.dtAmount}>
                <Text style={styles.dtAmountCurrency}>{currency} </Text>
                {sub.amount.toFixed(2)}
              </Text>
              <Text style={styles.dtCycle}>{getCycleLabel(sub.billingCycle)}</Text>
            </View>

            {/* ── Paused Banner ── */}
            {sub.isPaused && (
              <View style={styles.dtPausedBanner}>
                <Feather name="pause-circle" size={14} color={C.bronze} />
                <Text style={styles.dtPausedText}>this commitment is paused</Text>
              </View>
            )}

            {/* ── Info Card (grouped rows) ── */}
            <View style={styles.dtInfoSection}>
              {/* Next due / paid status */}
              <View style={styles.dtInfoRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={[styles.dtInfoIcon, cleared && { backgroundColor: withAlpha(C.positive, 0.10) }]}>
                    <Feather name={cleared ? 'check-circle' : 'calendar'} size={12} color={cleared ? C.positive : C.textMuted} />
                  </View>
                  <Text style={styles.dtInfoLabel}>{cleared ? 'paid' : 'next due'}</Text>
                </View>
                <Text style={[styles.dtInfoValue, { color: dueColor }]}>
                  {cleared && sub.lastPaidAt
                    ? format(new Date(sub.lastPaidAt), 'MMM d, yyyy').toLowerCase()
                    : dueDateText}
                </Text>
              </View>

              {/* Wallet */}
              {linkedWallet && (
                <View style={styles.dtInfoRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={styles.dtInfoIcon}>
                      <WalletLogo wallet={linkedWallet} size={12} />
                    </View>
                    <Text style={styles.dtInfoLabel}>wallet</Text>
                  </View>
                  <Text style={styles.dtInfoValue}>{linkedWallet.name}</Text>
                </View>
              )}

              {/* Reminder */}
              <View style={styles.dtInfoRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={styles.dtInfoIcon}>
                    <Feather name="bell" size={12} color={C.textMuted} />
                  </View>
                  <Text style={styles.dtInfoLabel}>reminder</Text>
                </View>
                <Text style={styles.dtInfoValue}>{sub.reminderDays} days before</Text>
              </View>

              {/* Started */}
              <View style={[styles.dtInfoRow, { borderBottomWidth: 0 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={styles.dtInfoIcon}>
                    <Feather name="play" size={12} color={C.textMuted} />
                  </View>
                  <Text style={styles.dtInfoLabel}>started</Text>
                </View>
                <Text style={styles.dtInfoValue}>
                  {format(new Date(sub.startDate), 'MMM d, yyyy').toLowerCase()}
                </Text>
              </View>
            </View>

            {/* ── Installment Progress ── */}
            {isInstSub && (
              <View style={styles.dtInstallmentCard}>
                <View style={styles.dtProgressWrap}>
                  <View style={styles.dtProgressBar}>
                    <View style={[
                      styles.dtProgressFill,
                      { width: `${progressPct}%` },
                      isComplete && { backgroundColor: C.gold },
                    ]} />
                  </View>
                  <View style={styles.dtProgressMeta}>
                    <Text style={styles.dtProgressLabel}>
                      {completed}/{total} payments
                    </Text>
                    {isComplete && (
                      <View style={styles.dtCompleteBadge}>
                        <Feather name="award" size={10} color={C.gold} />
                        <Text style={styles.dtCompleteText}>completed</Text>
                      </View>
                    )}
                  </View>
                </View>
                {outstanding != null && outstanding > 0 && (
                  <View style={styles.dtOutstandingRow}>
                    <Text style={styles.dtOutstandingLabel}>outstanding</Text>
                    <Text style={styles.dtOutstandingValue}>
                      {currency} {outstanding.toFixed(2)}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* ── Note ── */}
            {sub.note ? (
              <View style={styles.dtNoteWrap}>
                <Text style={styles.dtNoteLabel}>note</Text>
                <Text style={styles.dtNoteText} numberOfLines={4}>{sub.note}</Text>
              </View>
            ) : null}

            {/* ── Payment History (timeline style) ── */}
            {history.length > 0 && (
              <View style={styles.dtHistorySection}>
                <Text style={styles.dtHistoryLabel}>payment history</Text>
                {history.map((p, idx) => (
                  <View key={p.id} style={styles.dtHistoryItem}>
                    {/* Timeline connector */}
                    <View style={styles.dtTimelineCol}>
                      <View style={styles.dtTimelineDot} />
                      {idx < history.length - 1 && <View style={styles.dtTimelineLine} />}
                    </View>
                    {/* Content */}
                    <View style={styles.dtHistoryContent}>
                      <Text style={styles.dtHistoryDate}>
                        {format(new Date(p.paidAt), 'MMM d, yyyy')}
                      </Text>
                      <Text style={styles.dtHistoryAmt}>
                        {currency} {p.amount.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {/* ── Action Bar (fixed at bottom) ── */}
          <View style={styles.dtActions}>
            {!cleared && !sub.isPaused && (
              <TouchableOpacity
                style={styles.dtActionPrimary}
                onPress={() => {
                  setDetailSub(null);
                  setTimeout(() => setMarkPaidSub(sub), 200);
                }}
                activeOpacity={0.8}
              >
                <Feather name="check" size={16} color="#fff" />
                <Text style={styles.dtActionPrimaryText}>mark paid</Text>
              </TouchableOpacity>
            )}
            <View style={styles.dtActionRow}>
              <TouchableOpacity
                style={styles.dtActionBtn}
                onPress={() => {
                  setDetailSub(null);
                  setTimeout(() => handleEdit(sub.id), 200);
                }}
                activeOpacity={0.7}
              >
                <Feather name="edit-2" size={15} color={C.textSecondary} />
                <Text style={styles.dtActionText}>edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dtActionBtn}
                onPress={() => {
                  setDetailSub(null);
                  lightTap();
                  updateSubscription(sub.id, { isPaused: !sub.isPaused });
                  showToast(sub.isPaused ? 'resumed' : 'paused', 'success');
                }}
                activeOpacity={0.7}
              >
                <Feather
                  name={sub.isPaused ? 'play-circle' : 'pause-circle'}
                  size={15}
                  color={C.textSecondary}
                />
                <Text style={styles.dtActionText}>
                  {sub.isPaused ? 'resume' : 'pause'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dtActionBtn}
                onPress={() => {
                  setDetailSub(null);
                  setTimeout(() => setDeleteConfirmSub(sub), 200);
                }}
                activeOpacity={0.7}
              >
                <Feather name="trash-2" size={15} color={C.neutral} />
                <Text style={[styles.dtActionText, { color: C.neutral }]}>delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
};
```

### Styles for Detail Modal

```tsx
// ── Detail modal ──────────────────────────────────────
dtCard: {
  width: '90%',
  maxHeight: '82%',
  backgroundColor: C.surface,
  borderRadius: RADIUS.xl,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: withAlpha(C.textPrimary, 0.08),
  paddingTop: SPACING.lg,
  paddingHorizontal: SPACING.xl,
  paddingBottom: SPACING.lg,
  ...SHADOWS.lg,
},
dtClose: {
  position: 'absolute',
  top: SPACING.md,
  right: SPACING.md,
  width: 28,
  height: 28,
  borderRadius: 14,
  backgroundColor: withAlpha(C.textMuted, 0.08),
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2,
},

// Hero
dtHero: {
  alignItems: 'center',
  marginBottom: SPACING.md,
  paddingTop: SPACING.xs, // slight top breathing room below close btn
},
dtAvatar: {
  width: 60,       // ← up from 56
  height: 60,
  borderRadius: 30,
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: SPACING.sm + 2,
},
dtAvatarLetter: {
  fontSize: 26,     // ← up from 24
  fontWeight: TYPOGRAPHY.weight.bold,
  color: '#FFFFFF',
  letterSpacing: -0.5,
},
dtName: {
  fontSize: TYPOGRAPHY.size.xl,
  fontWeight: TYPOGRAPHY.weight.bold,
  color: C.textPrimary,
  letterSpacing: -0.4,
  marginBottom: SPACING.xs,
  textAlign: 'center',
},
dtCatBadge: {
  backgroundColor: withAlpha(C.textPrimary, 0.05),
  borderRadius: RADIUS.full,
  paddingHorizontal: SPACING.sm + 2,
  paddingVertical: 3,
},
dtCatText: {
  fontSize: TYPOGRAPHY.size.xs,
  fontWeight: TYPOGRAPHY.weight.medium,
  color: C.textMuted,
  letterSpacing: 0.2,
},

// Amount
dtAmountSection: {
  alignItems: 'center',
  marginBottom: SPACING.lg,
},
dtAmount: {
  fontSize: 38,     // ← up from 36 for premium feel
  fontWeight: TYPOGRAPHY.weight.bold,
  color: C.textPrimary,
  fontVariant: ['tabular-nums'],
  letterSpacing: -1.2,
},
dtAmountCurrency: {
  fontSize: 20,
  fontWeight: TYPOGRAPHY.weight.medium,
  color: C.textMuted,
},
dtCycle: {
  fontSize: TYPOGRAPHY.size.sm,
  color: C.textMuted,
  fontWeight: TYPOGRAPHY.weight.medium,
  marginTop: 4,
  letterSpacing: 0.3,
},

// Paused banner — moved ABOVE info section for visibility
dtPausedBanner: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: SPACING.sm,
  backgroundColor: withAlpha(C.bronze, 0.08),
  borderRadius: RADIUS.md,
  paddingVertical: SPACING.sm + 2,
  paddingHorizontal: SPACING.md,
  marginBottom: SPACING.lg,
},
dtPausedText: {
  fontSize: TYPOGRAPHY.size.sm,
  fontWeight: TYPOGRAPHY.weight.medium,
  color: C.bronze,
},

// Info section (grouped card)
dtInfoSection: {
  borderRadius: RADIUS.lg,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: withAlpha(C.textPrimary, 0.06),
  overflow: 'hidden',
  marginBottom: SPACING.lg,
},
dtInfoRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingVertical: SPACING.sm + 3,
  paddingHorizontal: SPACING.md,
  borderBottomWidth: StyleSheet.hairlineWidth,
  borderBottomColor: withAlpha(C.textPrimary, 0.05),
},
dtInfoIcon: {
  width: 24,       // ← up from 22
  height: 24,
  borderRadius: 12,
  backgroundColor: withAlpha(C.textPrimary, 0.04),
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: SPACING.sm,
},
dtInfoLabel: {
  fontSize: TYPOGRAPHY.size.sm,
  color: C.textMuted,
  flex: 1,
},
dtInfoValue: {
  fontSize: TYPOGRAPHY.size.sm,
  fontWeight: TYPOGRAPHY.weight.semibold,
  color: C.textPrimary,
  textAlign: 'right',
  fontVariant: ['tabular-nums'],
},

// Installment progress card
dtInstallmentCard: {
  backgroundColor: withAlpha(C.textPrimary, 0.02),
  borderRadius: RADIUS.lg,
  borderWidth: StyleSheet.hairlineWidth,
  borderColor: withAlpha(C.textPrimary, 0.06),
  padding: SPACING.md,
  marginBottom: SPACING.lg,
},
dtProgressWrap: {
  gap: SPACING.xs + 2,
},
dtProgressBar: {
  height: 6,        // ← up from 4 for better visibility
  backgroundColor: withAlpha(C.textMuted, 0.10),
  borderRadius: RADIUS.full,
  overflow: 'hidden',
},
dtProgressFill: {
  height: '100%',
  backgroundColor: C.accent,
  borderRadius: RADIUS.full,
},
dtProgressMeta: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
},
dtProgressLabel: {
  fontSize: TYPOGRAPHY.size.xs,
  color: C.textMuted,
  fontWeight: TYPOGRAPHY.weight.medium,
  fontVariant: ['tabular-nums'],
},
dtCompleteBadge: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 4,
  backgroundColor: withAlpha(C.gold, 0.10),
  borderRadius: RADIUS.full,
  paddingHorizontal: SPACING.sm,
  paddingVertical: 2,
},
dtCompleteText: {
  fontSize: TYPOGRAPHY.size.xs - 1,
  fontWeight: TYPOGRAPHY.weight.semibold,
  color: C.gold,
  letterSpacing: 0.2,
},
dtOutstandingRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: SPACING.sm + 2,
  paddingTop: SPACING.sm,
  borderTopWidth: StyleSheet.hairlineWidth,
  borderTopColor: withAlpha(C.textPrimary, 0.06),
},
dtOutstandingLabel: {
  fontSize: TYPOGRAPHY.size.sm,
  color: C.textMuted,
  fontWeight: TYPOGRAPHY.weight.medium,
},
dtOutstandingValue: {
  fontSize: TYPOGRAPHY.size.base,
  fontWeight: TYPOGRAPHY.weight.bold,
  color: C.bronze,
  fontVariant: ['tabular-nums'],
},

// Note
dtNoteWrap: {
  backgroundColor: withAlpha(C.textPrimary, 0.025),
  borderRadius: RADIUS.md,
  paddingHorizontal: SPACING.md,
  paddingVertical: SPACING.sm + 2,
  marginBottom: SPACING.lg,
},
dtNoteLabel: {
  fontSize: TYPOGRAPHY.size.xs,
  fontWeight: TYPOGRAPHY.weight.semibold,
  color: C.textMuted,
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
},
dtNoteText: {
  fontSize: TYPOGRAPHY.size.sm,
  color: C.textSecondary,
  lineHeight: TYPOGRAPHY.size.sm * 1.5,
},

// Payment history — TIMELINE STYLE
dtHistorySection: {
  marginBottom: SPACING.sm,
},
dtHistoryLabel: {
  fontSize: TYPOGRAPHY.size.xs,
  fontWeight: TYPOGRAPHY.weight.semibold,
  color: C.textMuted,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  marginBottom: SPACING.sm + 2,
},
dtHistoryItem: {
  flexDirection: 'row',
  alignItems: 'stretch',
  minHeight: 36,
},
dtTimelineCol: {
  width: 20,
  alignItems: 'center',
},
dtTimelineDot: {
  width: 8,
  height: 8,
  borderRadius: 4,
  backgroundColor: C.positive,
  marginTop: 5,
},
dtTimelineLine: {
  width: 1.5,
  flex: 1,
  backgroundColor: withAlpha(C.positive, 0.18),
  marginTop: 3,
  marginBottom: -2,
},
dtHistoryContent: {
  flex: 1,
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  paddingLeft: SPACING.sm,
  paddingBottom: SPACING.sm + 2,
},
dtHistoryDate: {
  fontSize: TYPOGRAPHY.size.sm,
  color: C.textSecondary,
},
dtHistoryAmt: {
  fontSize: TYPOGRAPHY.size.sm,
  fontWeight: TYPOGRAPHY.weight.semibold,
  color: C.textPrimary,
  fontVariant: ['tabular-nums'],
},

// Actions (pinned below ScrollView)
dtActions: {
  borderTopWidth: StyleSheet.hairlineWidth,
  borderTopColor: withAlpha(C.textPrimary, 0.08),
  paddingTop: SPACING.md,
  marginTop: SPACING.xs,
},
dtActionPrimary: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: SPACING.sm,
  backgroundColor: C.positive,
  borderRadius: RADIUS.full,
  paddingVertical: SPACING.md,
  marginBottom: SPACING.sm + 2,
},
dtActionPrimaryText: {
  fontSize: TYPOGRAPHY.size.base,
  fontWeight: TYPOGRAPHY.weight.semibold,
  color: '#fff',
  letterSpacing: 0.2,
},
dtActionRow: {
  flexDirection: 'row',
  justifyContent: 'space-around',
},
dtActionBtn: {
  alignItems: 'center',
  gap: 4,
  paddingVertical: SPACING.xs,
  paddingHorizontal: SPACING.md,
},
dtActionText: {
  fontSize: TYPOGRAPHY.size.xs,
  fontWeight: TYPOGRAPHY.weight.medium,
  color: C.textSecondary,
},
```

### Key Changes from Current
1. **Avatar**: 56 → 60px, with `isComplete` golden award icon state
2. **Amount**: 36 → 38px for premium emphasis
3. **Paused banner**: moved ABOVE info section (currently below note) — paused state is critical info
4. **Info icon circles**: 22 → 24px, with green tint when cleared
5. **Installment section**: wrapped in a subtle card (`dtInstallmentCard`) with progress bar 4 → 6px height, meta row with "completed" gold badge for finished installments
6. **Outstanding balance**: NEW — shown below progress bar with bronze color, separated by hairline
7. **Payment history**: flat list → vertical timeline with olive dots + connector lines
8. **Note**: `numberOfLines` 3 → 4 for more visibility
9. **Modal transition**: stays `animationType="fade"` (consistent with all app overlays)

### Interaction Flow
- Tap row → detail modal fades in
- Tap "mark paid" → detail modal closes, 200ms delay, mark-paid modal opens
- Tap "edit" → detail modal closes, 200ms delay, edit form modal opens
- Tap "pause/resume" → instant toggle + toast, detail modal closes
- Tap "delete" → detail modal closes, 200ms delay, delete confirmation opens
- Tap overlay/X → modal fades out

### Edge Cases
- **No wallet linked**: wallet info row hidden (already handled)
- **No category**: category badge hidden (already handled)
- **No payment history**: history section hidden entirely
- **Installment complete**: avatar shows gold award icon, progress fill turns gold, "completed" badge appears
- **Overdue + not cleared**: due date shows terracotta (#C1694F)
- **Due today**: due date shows gold (#B2780A)
- **Very long name**: centered with text wrapping (textAlign center)
- **No note**: note section hidden
- **Not paused**: banner hidden

---

## 2. Mark-Paid Modal — Redesign

### Current Issues
- Works well but lacks satisfying feedback
- No installment-specific messaging
- No visual distinction between "just mark" and "pay from wallet"

### Redesigned Structure

```
┌──────────────────────────────────────┐
│                               [x]    │
│                                      │
│           RM 54.90                   │   ← 36px hero amount
│           Netflix                    │   ← name
│                                      │
│      ┌─ ↻ next cycle Jun 15 ──┐     │   ← next cycle pill
│                                      │
│      ┌─ 5/12 payments after ──┐     │   ← installment pill (if applicable)
│                                      │
│  ╔══════════════════════════════╗    │
│  ║     ✓  mark as paid          ║    │   ← olive primary button
│  ╚══════════════════════════════╝    │
│                                      │
│  ┌──────────────────────────────┐    │   ← wallet button (if linked)
│  │  🏦  pay from Maybank    →   │    │
│  └──────────────────────────────┘    │
└──────────────────────────────────────┘
```

### JSX Structure

```tsx
const renderMarkPaidModal = () => {
  if (!markPaidSub) return null;
  const linkedWallet = wallets.find(w => w.id === markPaidSub.walletId);
  const isInstSub = markPaidSub.isInstallment && markPaidSub.totalInstallments;
  const completed = markPaidSub.completedInstallments || 0;
  const total = markPaidSub.totalInstallments || 1;
  const willComplete = isInstSub && completed + 1 >= total;

  // Compute next billing date after marking paid
  let nextAfterPaid = new Date(markPaidSub.nextBillingDate);
  switch (markPaidSub.billingCycle) {
    case 'weekly':    nextAfterPaid.setDate(nextAfterPaid.getDate() + 7);    break;
    case 'quarterly': nextAfterPaid.setMonth(nextAfterPaid.getMonth() + 3);  break;
    case 'yearly':    nextAfterPaid.setFullYear(nextAfterPaid.getFullYear() + 1); break;
    default:          nextAfterPaid.setMonth(nextAfterPaid.getMonth() + 1);  break;
  }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMarkPaidSub(null)}>
      <Pressable style={styles.overlayCenter} onPress={() => setMarkPaidSub(null)}>
        <View style={styles.markPaidCard} onStartShouldSetResponder={() => true}>
          {/* Dismiss X */}
          <TouchableOpacity
            onPress={() => setMarkPaidSub(null)}
            style={styles.mpCloseBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Feather name="x" size={18} color={C.textMuted} />
          </TouchableOpacity>

          {/* Hero amount */}
          <Text style={styles.mpHeroAmount}>
            <Text style={styles.mpHeroCurrency}>{currency} </Text>
            {markPaidSub.amount.toFixed(2)}
          </Text>
          <Text style={styles.mpName}>{markPaidSub.name}</Text>

          {/* Next cycle pill */}
          <View style={styles.mpNextPill}>
            <Feather name="repeat" size={11} color={C.textMuted} />
            <Text style={styles.mpNextText}>
              {willComplete ? 'final payment' : `next cycle ${format(nextAfterPaid, 'MMM d')}`}
            </Text>
          </View>

          {/* Installment progress pill */}
          {isInstSub && (
            <View style={[styles.mpNextPill, { marginBottom: SPACING.lg, marginTop: -SPACING.sm }]}>
              <Feather name="hash" size={11} color={C.bronze} />
              <Text style={[styles.mpNextText, { color: C.bronze }]}>
                {completed + 1}/{total} payments {willComplete ? '— completing!' : ''}
              </Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.mpActions}>
            <TouchableOpacity style={styles.markPaidBtn} onPress={() => handleMarkPaid(false)} activeOpacity={0.8}>
              <Feather name="check" size={18} color="#fff" />
              <Text style={styles.markPaidBtnText}>mark as paid</Text>
            </TouchableOpacity>

            {linkedWallet && (
              <TouchableOpacity style={styles.mpWalletBtn} onPress={() => handleMarkPaid(true)} activeOpacity={0.8}>
                <WalletLogo wallet={linkedWallet} size={18} />
                <Text style={styles.mpWalletBtnText}>
                  pay from {linkedWallet.name}
                </Text>
                <Feather name="arrow-right" size={14} color={C.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Pressable>
    </Modal>
  );
};
```

### Styles (mostly unchanged, add these new ones)

```tsx
// Existing styles stay. No dimensional changes needed — the modal is already clean.
// The only additions are the installment-aware pills which reuse mpNextPill style.
```

### Interaction Flow
1. User taps "mark paid" from detail modal or swipes right on row
2. Mark-paid modal fades in showing amount, name, next cycle
3. Two options:
   - **"mark as paid"** (olive): calls `handleMarkPaid(false)` — only marks the subscription as paid for this cycle, advances `nextBillingDate`, adds to `paymentHistory`. No wallet deduction.
   - **"pay from [wallet]"** (subtle): calls `handleMarkPaid(true)` — does everything above PLUS creates an expense transaction AND deducts from wallet balance.
4. After either action: `mediumTap()` haptic, modal closes, toast "cleared."

### Edge Cases
- **No wallet linked**: only "mark as paid" button shown (wallet button hidden) — already handled
- **Already paid this cycle**: the "mark paid" button won't appear in the detail modal (gated by `!cleared`), so user can't reach this modal for an already-paid sub
- **Installment final payment** (`willComplete`): pill text changes to "final payment" + "completing!" suffix in progress pill. The `handleMarkPaid` function in personalStore should handle incrementing `completedInstallments` and optionally marking `isActive: false`.
- **Installment already complete**: same guard as "already paid" — if subscription is inactive, it won't show mark-paid
- **Amount is 0**: still shows — edge case for free tiers the user might track

### Toast / Feedback After Marking Paid
- `mediumTap()` haptic for satisfying physical feedback
- Toast: `"cleared."` (current behavior is good — concise)
- For installment completion: toast should say `"completed! all payments done."` (this requires a small change in `handleMarkPaid` to detect `willComplete`)

### Suggested `handleMarkPaid` Enhancement

```tsx
const handleMarkPaid = useCallback((withExpense: boolean) => {
  if (!markPaidSub) return;
  const isInstSub = markPaidSub.isInstallment && markPaidSub.totalInstallments;
  const completed = markPaidSub.completedInstallments || 0;
  const total = markPaidSub.totalInstallments || 1;
  const willComplete = isInstSub && completed + 1 >= total;

  markSubscriptionPaid(markPaidSub.id);
  if (withExpense && markPaidSub.walletId) {
    addTransaction({
      amount: markPaidSub.amount,
      category: markPaidSub.category,
      description: markPaidSub.name,
      type: 'expense',
      date: new Date(),
      mode: 'personal',
      inputMethod: 'manual',
      walletId: markPaidSub.walletId,
    });
    deductFromWallet(markPaidSub.walletId, markPaidSub.amount);
  }
  mediumTap();
  setMarkPaidSub(null);
  showToast(
    willComplete ? 'completed! all payments done.' : 'cleared.',
    'success'
  );
}, [markPaidSub, markSubscriptionPaid, addTransaction, deductFromWallet, showToast]);
```

---

## 3. Payment History — Timeline Design

### Current
- Simple flat list: `check-circle` icon + date + amount per row
- Shows last 6 entries (reversed chronological)

### Redesigned: Vertical Timeline

```
PAYMENT HISTORY
  ●  Jun 1, 2025           RM 54.90
  │
  ●  May 1, 2025           RM 54.90
  │
  ●  Apr 1, 2025           RM 54.90
  │
  ●  Mar 1, 2025           RM 54.90
```

### Design Specs
- **Timeline dot**: 8px circle, `C.positive` (olive) solid fill
- **Timeline line**: 1.5px width, `withAlpha(C.positive, 0.18)`, connects dots vertically
- **Date text**: `TYPOGRAPHY.size.sm`, `C.textSecondary`
- **Amount text**: `TYPOGRAPHY.size.sm`, semibold, `C.textPrimary`, tabular-nums, right-aligned
- **No grouping by month** — these are per-cycle payments, one per billing cycle. Monthly grouping would be redundant. Simple reverse-chronological list.
- **Max entries**: 8 (up from 6) — enough to show a meaningful pattern without overwhelming

### Why Timeline Over Flat List
- Visual continuity — the vertical line creates a sense of progression
- Each dot is a "checkpoint" — aligns with the finance-tracking mental model
- More premium feel than bare rows with icons
- Still very lightweight in terms of rendering (just Views + Text)

### Edge Cases
- **Only 1 payment**: single dot, no line below it
- **8+ payments**: slice to last 8 only. No "show more" — the edit form already shows payment history too.
- **Amounts vary** (installment partial payments): each row shows its own amount

---

## 4. Delete Confirmation Modal — Redesign

### Current
Already well-designed. The structure is:
1. Neutral icon circle (trash, not red)
2. Title
3. Name badge pill
4. Warning message
5. "keep it" prominent button
6. "remove" subdued text link

### Refinements

```
┌──────────────────────────────────────┐
│                                      │
│         ┌──────┐                     │
│         │  🗑  │  ← neutral circle   │
│         └──────┘                     │
│                                      │
│     remove commitment?               │   ← title
│                                      │
│     ┌── Netflix ──┐                  │   ← name badge
│                                      │
│  this commitment and its 6 payment   │   ← enhanced message
│  records will be removed             │
│  permanently.                        │
│                                      │
│  ╔══════════════════════════════╗    │
│  ║        keep it               ║    │   ← prominent safe choice
│  ╚══════════════════════════════╝    │
│                                      │
│        🗑 remove                     │   ← subdued destructive
│                                      │
└──────────────────────────────────────┘
```

### JSX Structure

```tsx
const renderDeleteModal = () => {
  if (!deleteConfirmSub) return null;
  const historyCount = deleteConfirmSub.paymentHistory?.length || 0;
  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => setDeleteConfirmSub(null)}>
      <Pressable style={styles.overlayCenter} onPress={() => setDeleteConfirmSub(null)}>
        <View style={styles.deleteCard} onStartShouldSetResponder={() => true}>
          {/* Icon */}
          <View style={styles.delIconCircle}>
            <Feather name="trash-2" size={20} color={C.neutral} />
          </View>

          <Text style={styles.delTitle}>{t.subscriptions.deleteTitle}</Text>

          {/* Name badge */}
          <View style={styles.delNameBadge}>
            <Text style={styles.delNameText}>{deleteConfirmSub.name}</Text>
          </View>

          {/* Enhanced warning message */}
          <Text style={styles.delMsg}>
            {historyCount > 0
              ? `this commitment and its ${historyCount} payment ${historyCount === 1 ? 'record' : 'records'} will be removed permanently.`
              : 'this commitment will be removed permanently.'}
          </Text>

          {/* Cancel first (prominent), delete second (subdued) */}
          <TouchableOpacity
            style={styles.delKeepBtn}
            onPress={() => setDeleteConfirmSub(null)}
            activeOpacity={0.8}
          >
            <Text style={styles.delKeepBtnText}>keep it</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.delConfirmRow}
            onPress={handleConfirmDelete}
            activeOpacity={0.7}
          >
            <Feather name="trash-2" size={14} color={C.neutral} />
            <Text style={styles.delConfirmText}>{t.subscriptions.deleteAction}</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
};
```

### Styles (unchanged from current — already well-designed)

The existing delete modal styles are good. No changes needed except the enhanced message logic above.

### Key Changes from Current
1. **Warning message**: now includes count of payment records that will be lost (e.g., "this commitment and its 6 payment records will be removed permanently.")
2. **No records case**: simpler message without count
3. Everything else stays — the hierarchy is already correct (safe "keep it" is prominent, destructive "remove" is subdued)

### Interaction Flow
1. User taps "delete" from detail modal (or swipe-left hard swipe)
2. Detail modal closes with 200ms delay
3. Delete confirmation fades in
4. Two options:
   - **"keep it"** (prominent, `withAlpha(C.textPrimary, 0.05)` bg): dismisses modal, no action
   - **"remove"** (subdued, neutral color): calls `handleConfirmDelete`, deletes subscription, shows toast "commitment removed"
5. Tapping overlay also dismisses (safe action)

### Edge Cases
- **Subscription with linked wallet**: no wallet-specific warning needed — deleting the subscription doesn't touch wallet balance
- **Active installment**: same delete flow. No special warning — the data is local-only, user understands.
- **Paused subscription**: same flow

---

## Summary of All Changes

| Component | Change | Impact |
|-----------|--------|--------|
| Detail modal avatar | 56 → 60px, add "completed" gold state | Visual refinement |
| Detail modal amount | 36 → 38px | Premium emphasis |
| Paused banner | Moved above info section | Better visibility |
| Info icons | 22 → 24px, green tint when cleared | Subtle polish |
| Installment section | Wrapped in card, thicker bar, outstanding balance, completion badge | Major improvement |
| Payment history | Flat list → vertical timeline | Visual upgrade |
| Note | 3 → 4 lines | More content visible |
| Mark-paid | Add installment awareness, completion detection | Better UX |
| handleMarkPaid | Detect final installment, custom toast | Feature enhancement |
| Delete warning | Include payment record count | Better informed decision |

### New Styles to Add
- `dtInstallmentCard`, `dtProgressMeta`, `dtCompleteBadge`, `dtCompleteText`
- `dtOutstandingRow`, `dtOutstandingLabel`, `dtOutstandingValue`
- `dtHistoryItem`, `dtTimelineCol`, `dtTimelineDot`, `dtTimelineLine`, `dtHistoryContent`

### Styles to Modify
- `dtAvatar`: width/height 56 → 60, borderRadius 28 → 30
- `dtAvatarLetter`: fontSize 24 → 26
- `dtAmount`: fontSize 36 → 38
- `dtHero`: add `paddingTop: SPACING.xs`
- `dtProgressBar`: height 4 → 6
- `dtProgressWrap`: restructured (gap changed)
- `dtInfoIcon`: width/height 22 → 24, borderRadius 11 → 12

### Styles to Remove
- `dtHistoryRow` (replaced by `dtHistoryItem` + `dtHistoryContent`)
