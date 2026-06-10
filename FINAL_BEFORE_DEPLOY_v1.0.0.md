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

## Other pre-deploy notes
- The hardcoded-string i18n lint flags **5 pre-existing violations** unrelated to
  Tap to Pay — `CategoryManager.tsx`, `GradientButton.tsx`, `PaymentMethodManager.tsx`,
  `wallet/DeleteConfirmModal.tsx`. Not introduced by this feature; clean up if a green
  lint is a v1.0.0 gate.
- Commits for this feature are **local on `main`, not pushed** (per standing preference).
  Push when ready to ship.
