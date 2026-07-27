# RESUME HERE — Collectz redesign + notifications session (2026-07-25)

> Handoff from the Mac session. Everything below is committed and pushed to `main`
> (tip: `ada8116`, CI green). Server side is fully deployed — nothing pending there.

## What's DONE (don't redo)

- **Collectz redesign v3** — Home = ledger/statement layout (hero "RM X to collect" + divided rows, no truncation); Detail = money panel + segmented contribution bar + "Needs attention"; Join = unified payment card (steps → amount → QR → upload); Create/Edit = grouped cards + bottom sheets for category/icon/scheme/details/rules/contact/capacity/QR + player-requirements sheet.
- **Icon system** — `clubIcons.ts` presets carry MaterialCommunityIcons glyphs; optional per-icon color stored in the preset marker (`preset:<id>:<hex>`). No native emoji in-app.
- **Drafts** — Create/Edit autosave to AsyncStorage (600ms, baseline-compare); restore is a TAPPABLE banner, never auto-applied. Edit drafts stale-check against `updated_at`.
- **Teams join flow** — joining a teams session requires name + team pick (edge fn `collectz-join` claim/add_self accept `team_idx`, DEPLOYED).
- **Notifications** — DB trigger `20260725000000` pushes organizer on player team changes (owner's own edits silent). Organizer edits push to participants; summary covers venue/time/pay-by/capacity/scheme/money/**QR/maps**. All `collectz_*` push taps → bell (`Notifications`), `NotificationDetail` has "View session" CTA; collectz icon/label in `notificationMeta.ts`.
- **Player requirements** — `skill_level` (incl. `'any'`), `age_req`, `gender_req`, `booking_status` columns (`20260725010000`, `20260725020000`, both pushed); set in Create, shown as chips in Detail/Join hero + rows on web `site/collectz.html`.
- **Paste-parse v2** — `collectzParser.ts` extracts requirements, capacity from "FULL"/closed signals, booking from court numbers, strips "50/50/maybe/tbc" from names.
- **UX polish** — `useScrollToTop` on Dashboard (tap active Home tab); BottomSheet hides close footer + Done buttons while keyboard is up (golden FAB owns it); store badges side-by-side on mobile (`site.css`).
- **Site copy** — EN hero rewritten ("Your income changes. Your spending doesn't have to."); BM transcreated, NOT direct translation.
- **"Verified" badge** replaces "claimed" (EN + BM both use "Verified").

## Landmines (read before touching anything)

1. **Another AI session works in this repo** (stall/seller + premium-rewards features). Their files are uncommitted: `ReceiptHistory.tsx` (**tsc RED**), `premiumStore.ts`, `tiers.ts`, `App.tsx` (referral work), stall screens, `entitlements.ts`, migration `20260726000000_premium_grants_and_rewards.sql`. Do NOT commit their files wholesale; don't "fix" their tsc errors — coordinate first.
2. **PaymentQrCard.tsx** — `main` has the pre-premium version (CI fix `ada8116`). The premium-era version (with my QR-preview tweaks: label `top:120`, tabs `bottom:180`, actions `bottom: insets+2xl+32`) is preserved in `92a5378~1`. After their premium batch ships: `git checkout 92a5378~1 -- src/components/settings/PaymentQrCard.tsx`, re-apply those 3 values, verify `npm test`.
3. **Git** — identity not configured (commits auto-sign as `zappp@Muhammads-MacBook-Pro.local`). `stash@{0}` is a leftover safety copy from an earlier incident — safe to drop.
4. **tsc gate** — `npm test` must pass before pushing (CI = typecheck + tsx suite). The worktree may be red from THEIR files; check against a clean checkout if unsure.

## Server state (nothing to do)

- Migrations pushed through `20260725020000` (team-notify, player requirements, skill-any). `20260726000000_premium_grants` is THEIRS — unpushed on purpose.
- Edge fn `collectz-join` deployed with `team_idx` support. `collectz-notify`, `collectz-remind` unchanged.

## Dev setup (Windows)

- `npm ci`, copy `.env` from the Mac (NOT in git — has Supabase keys), `npx supabase login` for CLI work.
- iPhone dev client: `npx expo start --dev-client` (same WiFi). For native rebuilds use Android on Windows (`npx expo run:ios` needs macOS). If the iOS build fails on Sentry upload: `SENTRY_DISABLE_AUTO_UPLOAD=true`.

## Candidate next tasks (from SESSION_NOTES_2026-07-25.md §"waiting on you")

1. Receipts → `learnCategory` (one-line — the Makin Kenal roadmap step 1)
2. Echo on-device crisis-safety card (~30 lines, ECHO_MEMORY_COST_SAFETY.md §Safety)
3. Trim Echo rulebook (~2.5k tokens/msg savings — unverified numbers, fact-check first)
4. Site publish for `index.html`/`collectz.html` changes (static host)
