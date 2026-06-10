# Tap to Pay on iPhone — operator runbook

Accept a real contactless card or wallet on the seller's **iPhone** via Stripe
Terminal's Tap to Pay reader. **iOS only. Malaysia (MYR) only. Pilot, behind a
flag.** When the flag is off (the default), nothing Stripe-related initializes —
Android, web, and disabled iOS builds carry zero Stripe runtime code paths.

SDK: `@stripe/stripe-terminal-react-native@0.0.1-beta.31` (pinned exact). Its
podspec requires iOS 15.1, which already matches RN 0.81 / Expo 54 — no
deployment-target change. The config plugin + the proximity-reader entitlement
are wired in `app.json`.

## Turn it on (operator checklist)

Do these IN ORDER. Until all are done, leave `EXPO_PUBLIC_TAP_TO_PAY_ENABLED=false`.

1. **Apple entitlement.** Request the **Tap to Pay on iPhone** entitlement
   (`com.apple.developer.proximity-reader.payment.acceptance`) from Apple. This
   needs an **organization** Apple Developer account, the **Account Holder**
   role, and **separate development and production requests**, with **Stripe**
   listed as the PSP. Production approval can take **weeks**. (`app.json` already
   declares the entitlement; the request is the gating step.)
2. **Stripe account.** Confirm with Stripe support that the account is enabled
   for **Terminal + Tap to Pay for Malaysian merchants**.
3. **Stripe secret.** Set the secret key as a Supabase **edge-function secret**
   (never an `EXPO_PUBLIC_` var):
   `supabase secrets set STRIPE_SECRET_KEY=sk_...`
4. **Deploy the edge function.** `supabase functions deploy terminal-connection-token`
5. **Apply the migration FIRST** (before shipping a flag-on build):
   `supabase db push` — adds nullable `psp_transaction_id` / `payment_provider`
   to `seller_orders`. App code never writes these columns for non-card orders,
   so an un-migrated DB keeps syncing normally; but card orders need them.
6. **Stripe Terminal Location.** Create one (Stripe dashboard → Terminal →
   Locations) and put its id in `EXPO_PUBLIC_STRIPE_TERMINAL_LOCATION_ID`. The
   SDK requires a location to connect a Tap to Pay reader.
7. **Build a dev/prod client.** Tap to Pay needs native code — **Expo Go cannot
   load this SDK.** Use an **EAS build** on a **physical iPhone 11 or later**.
8. **Flip the flags.** `EXPO_PUBLIC_TAP_TO_PAY_ENABLED=true`, then per device the
   seller turns on **Settings → card payments (Tap to Pay)**.
9. **First charge.** Apple's Tap to Pay **terms of service** appear on the very
   first charge on each device; in test, accept them with an **App Store Connect
   sandbox account**.

## Test plan (simulated reader, dev build)

Set `EXPO_PUBLIC_TAP_TO_PAY_SIMULATED=true` on a dev build to run the full flow
with Stripe's simulated reader (test mode) — no card hardware needed. Verify:

| Flow | Steps | Expected store state |
|------|-------|----------------------|
| Stall cart | Sell → cart → Card → tap | each item `addSale` `paymentMethod:'card'`, same `pspTransactionId`; `session.totalCard` += total |
| Stall custom | Sell → custom amount → card chip | one `addCustomSale` `paymentMethod:'card'` + `pspTransactionId` |
| Seller mark-paid | order → mark paid → card | `markOrderPaid(id,'card')`, `order.pspTransactionId` set, paid deposit carries it |
| Seller deposit | order → record payment → card | `recordPayment(...,'card',txnId)`, deposit entry `pspTransactionId` |
| Decline | simulate a declining card | nothing recorded; sheet shows "card declined" + retry |
| Cancel | cancel the native sheet | nothing recorded; sheet shows canceled + retry/close |

Also confirm: editing a **charged** sale's method is blocked (locked note);
relabeling an **uncharged** sale to card writes no txn id and triggers no charge;
**bulk** mark-paid never offers card (and shows the "can't be marked in bulk"
message if reached); session summary's card bucket sums against cash + QR; a card
sale and a card-paid order survive a `sellerSync` push/pull with method + txn id
intact.

## Architecture (where the pieces live)

- `src/services/tapToPay.ts` — availability gate (`tapToPayAvailable`), connect
  (`easyConnect`), `chargeCard` (createPaymentIntent → collectPaymentMethod →
  confirmPaymentIntent, sdkUuid-safe), 4-way `TapToPayResult`, in-flight guard.
  **Imports the SDK only as types** (erased) — the live terminal handle is
  injected by the sheet, so nothing here runs off the iOS pilot path.
- `src/components/common/TapToPayProvider.tsx` — mounts `StripeTerminalProvider`
  only on iOS + flag (build-time `require`).
- `src/components/common/TapToPaySheet.tsx` — the charge UI (BottomSheet).
- `supabase/functions/terminal-connection-token/` — the only backend piece.
- Out of scope (pilot): Android Tap to Pay, in-app refunds/voids (use the Stripe
  dashboard), Stripe Connect per-seller onboarding, emailed receipts,
  surcharging, offline card capture.
