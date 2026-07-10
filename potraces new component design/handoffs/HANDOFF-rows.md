# Handoff — Neumorphic row lists (personal mode)

Paste the block into Claude Code on the Mac, at the Potraces repo root. Have these ready:
`components/common/neu.tsx` and `components/common/TransactionItem.tsx` (from this folder).

```
Redesign the PERSONAL-mode list rows to a neumorphic (soft-UI) surface. NO new dependency:
the effect uses the New-Architecture `boxShadow` style (RN 0.76+; Expo SDK 54 = New Arch),
and expo-linear-gradient (already installed). Two provided files carry the shared kit + the
one fully-rewritten shared row; the rest are surgical edits I describe below.

STEP 1 — Drop in the two files (overwrite the existing ones):
  src/components/common/neu.tsx            (adds useNeu(), NEU_BG, NeuWell; keeps NeuSurface)
  src/components/common/TransactionItem.tsx (neumorphic, logic-identical to the current one)
Then `npx tsc --noEmit` and run — the whole Transactions/Dashboard/anything using
TransactionItem is now neumorphic. Confirm swipe-delete, select mode, badges, wallet logo,
and the staggered entrance all still work.

STEP 2 — The retrofit recipe (apply to each inline row below).
`import { useNeu } from '../../components/common/neu'` (adjust depth), then in the component
`const neu = useNeu();`, add `const [pressed,setPressed] = useState(false)`, and:
  (a) ROW CARD container: spread `neu.raised` into its style; REMOVE its old `backgroundColor`
      and any shadow (SHADOWS.* / elevation / borderWidth-as-divider). On press-in set
      pressed=true (+ optional opacity .9), press-out false; use `pressed ? neu.inset : neu.raised`.
  (b) ICON circle/square: spread `neu.well` into it and KEEP its existing tint background
      (withAlpha(color,…)). That debosses the icon.
  (c) If rows were divider-separated inside one card, make each row its OWN card with a gap
      (marginBottom ~SPACING.sm+6) — like TransactionItem. Keep section headers as-is.
  (d) Progress RINGS (CircularProgress) stay; just wrap the icon INSIDE the ring in neu.well.
Neumorphism needs the row to sit on a bg of its own tone — useNeu().base = C.background, so
cards already blend. For a PUNCHIER effect (like the previews) set the scroll/list container
background to NEU_BG.light/dark. Optional; try without first.

STEP 3 — Apply per screen (styles named from the current code):

• SubscriptionList.tsx — commitment rows (renderRow). Each row becomes its own neu card
  (was: rows inside sectionCard with rowDivider). Spread neu.raised on the row; drop
  sectionCard bg/border + rowDivider. Avatar/icon squircle → neu.well (keep its tint). KEEP
  section headers (OVERDUE/UPCOMING…), status pills, due text, installment bar + fraction,
  swipe actions. [approved]

• WalletManagement.tsx — walletCard (renderWalletCard) → neu.raised (drop its bg + border);
  walletIcon box → neu.well (keep withAlpha(wallet.color,.10) tint). KEEP Default badge, star,
  credit usage bar. ⚠ Recent Activity (transferRow list) STAYS FLAT — do NOT neu it. [approved]

• Goals.tsx — goalCard grid cards → neu.raised (drop bg/border/SHADOWS). The CircularProgress
  ring stays; the icon inside the ring → neu.well. Keep name/amount/target. [approved]

• BudgetPlanning.tsx — catRowV3 (budget category rows AND playbook rows) → each its own
  neu.raised card (drop catRowDividerV3). The spend-ring (CircularProgress) stays; catAvatarV3
  → neu.well (keep tint). Keep name, "RM X of Y", right amount ("left" accent / "over" bronze),
  chevron. [approved]

• SavingsTracker.tsx — accountCard (<Card>) → wrap/replace surface with neu.raised;
  accountTypeIcon → neu.well. breakdownCard → neu.raised (keep the allocation bars flat inside).
  Keep return badge, sparkline, footer actions. [approved]

• AccountOverview.tsx — walletRow and categoryRow: give each its own neu.raised mini-card
  (they're inside a <Card> today with dividers/gaps). walletIcon → neu.well; category uses a
  color dot (leave the dot). Keep balances, mini bars, %, Default badge.

• Reports.tsx — styles.row (category breakdown + top merchants) → each a neu.raised card;
  rowChip → neu.well (keep the category tint / bronze rank-number). Keep mini bar, amount, chevron.

• FinancialPulse.tsx — the wellness card (<Card> holding wbRow list) → neu.raised, keep the
  wbRow bars flat inside. billRow list → each a neu.raised card; billIconBg → neu.well; keep the
  left accent stripe (borderLeftWidth 3). Heads-up unusualRow: leave as a plain neu card row.

• MoneyChat.tsx — assistantBubble → neu.raised (drop its bg/border). userBubble STAYS olive
  (C.accent) — unchanged. pendingChip → neu.raised pill; pendingChipIconWrap → neu.well. Keep
  the bronze amount + HighlightedText olive amounts.

• ImportFromCsv.tsx / ImportFromStatement.tsx — the review styles.row → each a neu.raised card
  (drop the bottom-border divider). Leave the checkbox icon as-is; keep the category chip and the
  signed amount rule (+ olive income / − neutral expense).

STEP 4 — Verify on device (I could not build on Windows):
  - `npx tsc --noEmit` clean. The boxShadow arrays in neu.tsx are cast `as any`; drop the cast
    if your RN types expose BoxShadowValue.
  - iOS + Android: the dual shadow renders (needs New Arch — on by default). If a shadow won't
    apply, wrap the row's inner content in a plain <View> that carries neu.raised.
  - LIGHT reads crisp; DARK is intentionally subtle on #121212 — if too flat, try setting that
    screen's list bg to NEU_BG and/or bump the dark highlight (#2A2A2A → #333) in neu.tsx.
  - Long lists: watch scroll perf with many soft shadows; if it janks on low-end Android,
    render neu.raised only on the visible/active rows or fall back to the flat card there.

Keep intent: same content/logic everywhere, only the surface changes; Wallet Recent Activity and
Money Chat user bubble stay flat/olive; income olive / expense neutral amount rule preserved.
Report anything that won't compile or feels off, with before/after screenshots.
```
