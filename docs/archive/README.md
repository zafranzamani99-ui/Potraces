# Archive — historical reference only

These files are NOT current sources of truth. They're kept for historical reference.

## What's current (do not move these here)

- Project root: `README.md`, `AUDIT.md`, `WCAG_AUDIT.md`, `WCAG_FIX_PLAN.md`, `PLAN.md`
- `audit/` folder: `BACKLOG.md`, `SCALABILITY.md`, `NAVIGATION_SPEED.md`, `DESIGN_CONSISTENCY.md`, `FIRST_TIME_ENGAGEMENT.md`
- `docs/`: `QUICKSTART.md`, `DEPLOYMENT_CHECKLIST.md`, `BUILDING_CHECKLIST.md`, `AI_SCENARIOS.md`, `COMPETITIVE_ANALYSIS.md`

## What's here and why

### Outcome-framing UI work (March 2026)
Three documents that drove the rename of "Profit/Loss/Revenue" → "Kept/Went out/Came in" plus screen-by-screen vocabulary reframing.

- `OUTCOME_UI_AUDIT.md` — March 2026 audit identifying every "Advisor" vs "Filing Cabinet" screen
- `OUTCOME_UI_PLAN.md` — Implementation plan, partially executed (banned vocabulary still appears 207 times per `audit/BACKLOG.md` DESIGN-C2)
- `OUTCOME_UI_ARCHITECTURE.md` — Per-mode vocabulary spec

**Why archived:** the rules survive in `.claude/skills/potraces-ui-ux/references/language-rules.md`. Open findings live in `audit/BACKLOG.md` DESIGN-C2.

### Seller mode audit (March 2026)
- `SELLER_MODE_AUDIT.md` — Production readiness scoring at 87.78%

**Why archived:** Superseded by current state. Many "missing features" (item editing, partial payments, stock tracking) are now shipped.

### Feature blueprints (all shipped)
Verified shipped against `src/screens/` and `src/store/` before archiving.

- `goals-screen-blueprint.md` → shipped as `src/screens/personal/Goals.tsx`
- `SAVINGS_TRACKER_BLUEPRINT.md` → shipped as `src/screens/personal/SavingsTracker.tsx`
- `savings-goals-master-prompt.md` → execution prompt for the above two
- `SAVE_RECEIPT_BLUEPRINT.md` → shipped: `ReceiptScanner.tsx`, `ReceiptHistory.tsx` with LHDN tax category tracking
- `PLAYBOOK_BLUEPRINT.md` → shipped: `playbookStore.ts` with full Echo memory + allocations

### Other
- `AUDIT_KICKOFF.md` — paste-instructions used to launch the 4-agent audit. Audits ran. Job done.
- `ai-drafts/` — old draft `.ts` files (intentEngine, moneyChat, queryEngine, spendingMirror). The shipped versions live in `src/services/`. These are scratch.

## How to restore something

```bash
git mv docs/archive/<filename> docs/<filename>
```

Or, in any session, ask for the file to be moved back. Nothing is destroyed.
