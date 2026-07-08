# Background Quick-Log ("Finny" flow) — Design

**Date:** 2026-07-05
**Status:** Approved (design), pending implementation plan
**Scope:** Ship to all users

## Problem

Today's double-tap quick-log opens the app. The user double-taps the back of
the phone, an Apple Shortcut collects the details, and it deep-links into the
app via `potraces://add?...`. Because opening a URL scheme always foregrounds
the app, the user is pulled into Potraces every time they log.

We want to match the reference ("Finny") flow: the user double-taps, native
prompts collect the entry **on the Home Screen**, a confirmation banner shows,
and **the app never opens to log**. The app opens only if the user taps the
follow-up push notification, which lands them on their transaction history.

## Hard constraint (why the architecture is what it is)

iOS has **no** mechanism to make a `potraces://` URL log silently — any URL
scheme foregrounds the app. So the write cannot go through the app's on-device
JS while staying on the Home Screen. The entry must reach the **backend**
instead, and sync down to the app later.

This is viable because the pieces already exist:

- Personal transactions **sync bidirectionally** with Supabase —
  `pullAll()` pulls `personal_transactions` / `personal_wallets` etc. into the
  local stores (`src/services/personalSync.ts:149`, `:197`).
- There is a Supabase edge-function backend and production push
  (`aps-environment: production` in `app.json`).
- Each user's Expo push token is already stored server-side in the
  `device_tokens` table (`src/services/pushNotifications.ts:144`).
- Default personal expense categories have **stable ids** — `food`,
  `transport`, `shopping`, `entertainment`, `health`, `other`
  (`src/constants/index.ts:256`) — so a static Shortcut menu maps exactly.

## End-to-end flow

```
Double-tap back
  → Shortcut collects: amount → category → payment → note   (native prompts, app closed)
  → Shortcut POSTs to the `quick-log` edge function          (sends the user's Quick-Log key)
  → function validates key → inserts a quick_log_inbox row → sends a push
  → Shortcut "Show Notification" → "Logged RM23.90 to 🍔 Food & Dining"  (app still closed)
  → [later] tap the push → app opens → drains the inbox → History shows the entry
```

## Decision 1 — Write model: **server inbox + app reconcile**

The edge function is intentionally dumb. It writes a lightweight row into a new
`quick_log_inbox` table (raw `amount`, `type`, `category`, `wallet`, `note`,
`occurred_at`) and sends the push. It does **not** resolve categories/wallets or
touch balances.

On next foreground/login, the app runs `drainQuickLogInbox()`, which for each
un-consumed row calls the **existing** `logQuickExpense()`
(`src/services/quickLog.ts:92`) — already resolves category, resolves wallet,
writes the transaction, and adjusts the wallet balance — then marks the row
consumed. Normal `personalSync` then pushes the real transaction to the cloud.

**Why:** all money logic stays in one tested place (JS). The server never does
wallet math, so it cannot drift from the app.

**Accepted tradeoff:** the entry becomes a real transaction when the app next
opens (via the push tap, or any launch), not the instant of the double-tap. The
server holds the record immediately, so nothing is ever lost; it materializes on
open. On a *second* device it appears after the owning device reconciles and
syncs.

**Rejected alternative:** server fully writes the transaction + balance itself.
Gives instant multi-device, but duplicates wallet logic in Deno and risks drift.
Not worth it for v1.

## Decision 2 — Auth: **per-user Quick-Log key**

A new "Quick Log" settings screen generates a random key, shows a **Copy**
button, and stores only a **hash** server-side in a new `quick_log_keys` table
(`user_id`, `key_hash`, `created_at`, `last_used_at`, `revoked`). The Shortcut
sends the key; the function hashes the incoming key and looks up the user.
Revoke/regenerate anytime.

**Why:** no password and no expiring session token living inside a Shortcut
file.

## Setup UX — one-time key paste

Chosen over a per-user hosted Shortcut (zero infra, no secret-in-a-file). The
"Quick Log" settings screen offers:

- **Copy my Quick-Log Key** button
- **Get the Shortcut** link (shared iCloud Shortcut)

On first run the shared Shortcut asks for the key once (Import Question); the
user pastes it, and it is stored in the Shortcut forever. Every subsequent run
is double-tap → menus → logged, with no paste.

## The Shortcut recipe (built once, shared as an iCloud link)

1. **Ask for amount** — number keypad.
2. **Choose category** — fixed menu mapping labels → the stable category ids
   (`food`, `transport`, …).
3. **Choose payment** — fixed menu (Cash, Maybank, TNG, Card, …) as free text;
   `resolveWallet()` fuzzy-matches by name (`src/services/quickLog.ts:62`).
4. **Ask for note.**
5. **Get Contents of URL** — POST `{ key, amount, type, category, wallet, note,
   occurred_at }` to the `quick-log` function.
6. **Show Notification** — the confirmation banner.

## Components to build

**Backend**
- Tables: `quick_log_keys` (auth) and `quick_log_inbox` (pending entries).
- Edge function `quick-log`: validate key → resolve user → insert inbox row →
  look up the user's Expo push token in `device_tokens` and send a push
  (reusing the send mechanism used for order pushes).

**App**
- `drainQuickLogInbox()` — runs on foreground/login; fetches un-consumed inbox
  rows, calls `logQuickExpense()` per row, marks consumed.
- "Quick Log" settings screen — generate/copy key, "Get the Shortcut" link,
  revoke.
- Push-tap handler — extend the notification-response listener
  (`App.tsx:445`) so a `quick_log` push switches to personal mode and navigates
  to the transaction history view (personal Dashboard history/calendar; exact
  route pinned in the plan — personal mode has no standalone History tab).

**Keep**
- The existing `potraces://add` deep link as the **offline fallback**: if the
  POST fails (offline), the Shortcut opens that URL instead. The app opens, but
  nothing is lost.

## Edge cases

- **Logged out on device** → key invalid → Shortcut shows "Set up Quick Log in
  the app first."
- **Offline** → `Get Contents of URL` fails → Shortcut falls back to the
  `potraces://add` deep link (app opens, logs locally).
- **Bad/blank amount** → function rejects → Shortcut shows an error.
- **Duplicate drains** → `quick_log_inbox.consumed_at` guard makes reconcile
  idempotent (a row is logged at most once even if drain runs twice).
- **Revoked key** → function rejects with a clear message.

## Out of scope (v1)

- Instant multi-device materialization (needs server-authoritative writes).
- Editing categories/wallets inside the Shortcut menus dynamically.
- Android equivalent (Back Tap is iOS-specific; Android would use a separate
  trigger later).
