# Final before deploy — v1.0.0

Living checklist of work that must close out **before / around the v1.0.0 ship**.
Right now this is dominated by **Tap to Pay on iPhone**, which is fully built and
committed but **dormant behind a flag** and **not yet runtime-verified**.

_Last updated: 2026-06-11_

---

## Tap to Pay on iPhone (Stripe Terminal) — remaining work

**State today:** code complete and `tsc`-clean across 4 commits
(`b8c039e` foundation → `ffb1a37` stall → `f592daa` seller → `332cee1` runbook),
behind `EXPO_PUBLIC_TAP_TO_PAY_ENABLED` (**default `false`**). With the flag off,
the app behaves exactly as before — Android / web / disabled iOS builds load **zero**
Stripe runtime code. Full operator runbook + test matrix: [`docs/TAP_TO_PAY.md`](docs/TAP_TO_PAY.md).

### Decision for v1.0.0
**Ship v1.0.0 with the flag OFF** — Tap to Pay rides along dormant and harmless.
**Enable it in a later release** once every box below is checked. Do **not** flip
the flag on for the v1.0.0 build unless the whole ladder is done first.

### Blocking prerequisites (operator tasks — none are code)
- [ ] **Apple Developer enrollment** — _not started._ ⚠️ Must be an **Organization**
      account (Individual accounts **cannot** get the Tap-to-Pay entitlement).
      Needs a **D‑U‑N‑S number** for the business + the **Account Holder** role.
- [ ] **Tap-to-Pay entitlement** (`com.apple.developer.proximity-reader.payment.acceptance`)
      — request **development** and **production** separately, list **Stripe** as PSP.
      Production approval can take **weeks**. (`app.json` already declares it.)
- [ ] **Stripe account** enabled for **Terminal + Tap to Pay (Malaysian merchants)** —
      confirm with Stripe support.
- [ ] **`STRIPE_SECRET_KEY`** set as a Supabase **edge-function secret**
      (`supabase secrets set STRIPE_SECRET_KEY=sk_…`) — never an `EXPO_PUBLIC_` var.
- [ ] **Deploy** the edge function: `supabase functions deploy terminal-connection-token`.
- [ ] **Apply the migration FIRST** (before any flag-on build):
      `supabase db push` → `20260610000000_seller_orders_card_payment.sql`.
- [ ] **Stripe Terminal Location** created; its id in `EXPO_PUBLIC_STRIPE_TERMINAL_LOCATION_ID`.
- [ ] **EAS dev build** on a **physical iPhone 11+** (Expo Go can't load the SDK).

### Verification still owed (could NOT be run during implementation)
- [ ] Simulated-reader run-through on a dev build (`EXPO_PUBLIC_TAP_TO_PAY_SIMULATED=true`):
      stall cart charge, stall custom-sale charge, seller mark-paid charge, seller
      deposit charge, a **decline**, and a **cancel** — each with resulting store state.
- [ ] Editing a **charged** sale's method is blocked (locked note); relabeling an
      **uncharged** sale to card writes no txn id and triggers no charge.
- [ ] Bulk mark-paid with card shows the "can't be marked in bulk" message, charges nothing.
- [ ] Session summary + reports show a card bucket that sums against cash + QR.
- [ ] Sync round-trip: a card sale and a card-paid order survive `sellerSync` push/pull
      with method + transaction id intact.

> Reason it's unverified: no physical iPhone / EAS build / Apple entitlement was
> available, and Tap to Pay has **no Simulator support**. Verified so far only by
> `tsc` (clean) + gate reasoning, not a live tap.

### Open question to resolve
- [ ] Does Stripe's **simulated** Tap-to-Pay reader still require the
      **development entitlement** in the build? If yes, the (faster) dev entitlement
      is the gating step even for test-mode verification. Confirm with Stripe/Apple.

### Optional — testable NOW, before any Apple/Stripe setup
- [ ] **`__DEV__` charge mock** (not yet built — pending go-ahead). Would let the full
      sheet flow + recording (success / decline / cancel, `pspTransactionId`, `totalCard`,
      mark-paid, deposit, sync) run on a Simulator / Expo Go with fake ids — no Apple
      account, no entitlement, no Stripe keys, no money. Guarded by `__DEV__` +
      `EXPO_PUBLIC_TAP_TO_PAY_MOCK` so it can never touch production.

---

## Quick Add shortcut + Personal multi-device sync — remaining work

**State today:** two linked workstreams, both of which **need an iOS dev build**
(the `potraces://` scheme and Apple/Google native sign-in do **not** load in Expo Go).
- **Quick Add shortcut** — `potraces://add` (+ `potraces://income`, + params
  `amount/category/wallet/date/type/note`) opens or directly logs a transaction with an
  **Undo** toast; Settings has a "Quick add shortcut" setup card (copy link + Back Tap guide
  + "Test it now"). Code-complete, `tsc`-clean. Lets an Apple Shortcut collect details with
  native prompts and hand them to Potraces. Spec: [`docs/feature-guides/04-Smart-Capture-Nudge-to-Log.docx`].
- **Personal Cloud Sync safety** — a 9-agent audit found **7 critical + 12 high** issues.
  **Phase 0 (stop the bleeding) + Phase 1 (account-safety guard) are now DONE + committed
  (`c300cae`)** and the sync round-trips losslessly (`npm run test:sync` → 11/11). Sync stays
  **dormant** (gated off behind `personalSyncEnabled` + a schema preflight) until the Phase 2
  sign-in UI ships. Full spec + phased plan: [`docs/feature-guides/05-Account-and-Multi-Device-Sync.docx`].
- **Local Backups & Restore — LIVE in v1.0.0.** Independent of cloud sync: the app snapshots
  every money/data store once a day on launch (`storageBackup.ts`) and **Settings → Backups &
  Restore** lets any user recover a chosen day (reversible). No cloud, no account — a safety net
  for everyone. Committed `c300cae`.

### Decision for v1.0.0
- **Quick Add shortcut:** safe to ship — it is just a deep link, harmless if left untested.
  Verify on the first dev build.
- **Personal Cloud Sync:** it is **opt-in (default OFF)** and currently only reachable via the
  business auth gate, so a normal personal user never turns it on. **Do NOT add the inline
  personal "Sign in to sync" UI to v1.0.0** until the rest of the sync-safety ladder lands
  (Phase 0+1 are now done, but the Phase 2 sign-in/merge UX is not) — shipping easy
  multi-device sign-in before then would re-expose the data-loss surface.
- **Local Backups & Restore:** **ships ON** — local-only, no external blocker. Verify the
  capture/restore round-trip on the first dev build (added to the list below).

### Blocking prerequisites (operator tasks)
- [ ] **Apple Developer enrollment** — for a standard **iOS dev build**. NOTE: Quick Add needs
      only a normal dev build (an **Individual** account is fine), unlike Tap to Pay above which
      needs an **Organization** account + entitlement.
- [ ] **EAS dev build** on a physical iPhone: `eas build --profile development --platform ios`.

### Verification still owed (needs the dev build)
- [ ] Safari `potraces://add` → "Open in Potraces?"; Settings → Quick add shortcut → "Test it now".
- [ ] Apple Shortcut (amount → category → wallet → date → Open URL) logs with the **right wallet**;
      `potraces://income` logs income; **Undo** works.
- [ ] **Back Tap** (double-tap the back of the phone) runs it from the lock screen.
- [ ] **Backups & Restore:** force ≥2 daily snapshots, restore an earlier day, confirm the app
      reloads with the restored data intact, and that the restore is itself reversible
      (`prerestore-*` snapshot written).

### Sync-safety ladder (code — detail in doc 05)
- [x] **Phase 0 — stop the live bleeding — DONE + committed (`c300cae`), `src/` `tsc`-clean:**
      removed the unsafe set-difference `deleteMissing`; tombstone-only remote deletes;
      child-array **union** merge for debt payments / goal contributions / savings snapshots
      (no more silently-dropped money rows); honest push failures (don't advance the sync clock
      or reconcile on a failed push; chunked upserts); skew-tolerant LWW. **Plus:** every field
      mapper extracted to a pure `personalSyncMappers.ts` that carries **all** fields both ways;
      a round-trip completeness test (`npm run test:sync` → **11/11**); migration
      `20260612000000` adds every missing column; a **schema preflight** auto-disables sync if
      the remote DB is incomplete (never writes a lossy round-trip).
- [x] **Phase 1 — account safety (guard DONE, `c300cae`):** `lastSyncedUserId` guard +
      account-mismatch block refuse a cross-account push. _Still owed in Phase 2:_ the explicit
      account-switch **merge UI** and clearing tombstones on switch.
- [ ] **Phase 2 — reachable sign-in + lifecycle:** inline personal sign-in, drop the `isVerified`
      gate, `startAutoRefresh`/`stopAutoRefresh`, session-expiry re-auth UX.
- [ ] **Phase 3 — coverage parity:** sync custom categories, Playbook, shared subscriptions,
      premium entitlement; restore lossy fields; upload receipt **images** to Storage.
- [ ] **Phase 4 — hardening/compliance:** authoritative cloud tombstone table, server timestamps,
      SecureStore session + encrypted stores, PDPA/GDPR `delete-personal` edge function.

### Open questions for the founder (from the audit)
- [ ] One canonical sign-in provider per user **vs** account-linking Apple + Google + phone.
- [ ] First-sign-in default when a device already has local data: keep-both / replace-local / replace-cloud.
- [ ] Shared-household-phone: a first-class supported case (full local wipe on account switch)?

---

## DuitNow QR — remaining work

**State today:** Phase 1 (exact-amount QR) is **LIVE**, committed `eebcb0b`.
Phases 2–3 (soundbox push + bank-standee honesty) are **built + committed**
(`c47377d`) and **dormant** behind `EXPO_PUBLIC_QR_PROVIDER` (default `none`).
`src/` is tsc-clean; zero new i18n violations. Full runbook: [`docs/DUITNOW_QR.md`](docs/DUITNOW_QR.md).

### Decision for v1.0.0
**Phase 1 ships** (real value, no external blocker). **Leave Phase 2 dormant**
(`EXPO_PUBLIC_QR_PROVIDER=none`) — it activates only with a PSP contract.

### Roadmap to finish (in order — check off top to bottom)

**Step 0 — Commit the build ✅ DONE (`c47377d`)**
- [x] Phase 2/3 committed (18 files). `App.tsx` (1-line deep-link) + this file
      were included; `personalSync.ts` + `debtStore.ts` were correctly **left
      out** (pre-existing WIP from `99fd572`, not the QR feature — still
      uncommitted in the working tree).
- [ ] Not pushed (standing preference) — `git push` when ready to ship.

**Step 1 — Phase 1 device verification _(needs any iOS/Android dev build; no PSP)_**
- [ ] Capture a **real** standee payload (scan + paste); confirm merchant name;
      save. Plain photo-upload QR still works as before.
- [ ] Render the embedded amount; scan with **≥2 banking apps**; record pre-fill
      behaviour per app (pre-fill+lock / pre-fill+editable / ignore).
- [ ] Stall checkout (cart + custom) and seller mark-paid/deposit/swipe open the
      QR sheet; **received** and **record without confirming** both record
      correctly; dismissing records nothing.
- [ ] Image-fallback path: a QR with no payload shows the stored image + amount.
- [ ] **→ Phase 1 signed off. This is the v1.0.0 ship line.**

**Step 2 — Phase 2 build-out _(needs a PSP merchant contract)_**
- [ ] Sign Fiuu **or** HitPay; get API key + webhook signing secret.
- [ ] Implement the provider stub in `qrProvider.ts`
      (`createFiuuCharge`/`createHitpayCharge`) + a new **`qr-create-charge`**
      edge fn that holds the PSP key and returns `{ qrPayload, chargeId }`.
- [ ] Finish the webhook **signature verifier** + **event parser** in
      `qr-payment-webhook/index.ts` against the provider's docs (HitPay HMAC is
      wired as the example; Fiuu skey is stubbed).

**Step 3 — Phase 2 backend deploy**
- [ ] `supabase db push` → migration `20260611000000` (`device_tokens`,
      `payment_events`, `processed_webhook_events`).
- [ ] `supabase secrets set HITPAY_WEBHOOK_SALT=…` (or `FIUU_WEBHOOK_SECRET=…`).
- [ ] `supabase functions deploy qr-payment-webhook` + `qr-create-charge`.
- [ ] Register the PSP webhook URL:
      `…/functions/qr-payment-webhook?provider=<name>`.
- [ ] Confirm iOS **Push Notifications** capability on the Apple App ID
      (`aps-environment` is in `app.json`; EAS manages the credential). FCM is
      covered by `google-services.json`.

**Step 4 — Phase 2 end-to-end verification _(real build + provider sandbox)_**
- [ ] Push token registers into `device_tokens` on login (log in on **two**
      devices → both receive the alert).
- [ ] Send a **signed test payload** to the webhook → order marked paid
      (**deposit increments**, doesn't over-pay) → `payment_events` row inserted
      → idempotent on a duplicate delivery → claim released on a forced failure.
- [ ] Push **"Payment received — order #N"** fires within seconds on a
      backgrounded device; tapping deep-links to the order.
- [ ] `QrPaySheet` shows **waiting for payment…**; `PendingPaymentsBanner` clears
      on focus once `payment_events` lands.

**Step 5 — Phase 3 verification _(static path; no PSP)_**
- [ ] Dismiss the QR sheet on an unpaid order → 10-min local reminder fires.
- [ ] Reminder is **canceled** once the order is marked paid by any route.
- [ ] Settings shows the bank-app honesty line.

**Step 6 — Optional enhancements _(nice-to-have, not blocking)_**
- [ ] Stall-mode provider path (currently seller-only — stall sales don't sync,
      so the webhook can't mark them; would need a stall sync surface first).
- [ ] `__DEV__` mock so the Phase-2 sheet→waiting→resolved flow + push can be
      walked on a simulator with fake events (no PSP/Apple needed).

**Step 7 — Ship Phase 2**
- [ ] Flip `EXPO_PUBLIC_QR_PROVIDER=hitpay` (or `fiuu`) on the build; ship.

> APNs/Expo push is **best-effort**, not a hardware-soundbox guarantee — set that
> expectation before relying on it as the sole "you got paid" signal.

---

## Other pre-deploy notes
- The hardcoded-string i18n lint flags **5 pre-existing violations** unrelated to
  Tap to Pay — `CategoryManager.tsx`, `GradientButton.tsx`, `PaymentMethodManager.tsx`,
  `wallet/DeleteConfirmModal.tsx`. Not introduced by this feature; clean up if a green
  lint is a v1.0.0 gate.
- Commits for this feature are **local on `main`, not pushed** (per standing preference).
  Push when ready to ship.
