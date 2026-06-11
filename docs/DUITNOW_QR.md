# DuitNow QR — operator runbook

Show a buyer the seller's own DuitNow QR with the **exact sale amount embedded**,
and (when a PSP is wired) replace a physical **soundbox** with a push
notification. **Money never flows through Potraces** — Phase 1 + 3 are display +
bookkeeping; Phase 2 reacts to a PSP's webhook.

Three phases:

| Phase | What | State |
|---|---|---|
| 1 | Exact-amount QR re-rendered from the seller's static standee | **LIVE** (committed `eebcb0b`) |
| 2 | PSP webhook → push (soundbox replacement) | **Built, dormant** until a PSP is connected |
| 3 | Honest pending/confirm + local nudge for bank-app standees | **Built** |

---

## Facts that constrain the design (do not fight them)

1. A **true dynamic** DuitNow QR can't be self-generated (banks mint a ~60s
   temporary account number). We only embed an amount into a **static** QR.
2. A static DuitNow QR is plain EMVCo TLV + CRC, no integrity hash. Inserting
   tag 54 (amount) and recomputing the CRC produces a QR payer apps accept; most
   **pre-fill** the amount. Behaviour varies by issuing bank and payer app
   (pre-fill+lock / pre-fill+editable / ignore) — surfaced in copy, not hidden.
3. A bank-app standee QR (Maybank/CIMB/TNG) settles bank-to-bank; **no public
   webhook**, and iOS can't read another app's notifications. Auto-confirmation
   exists **only** for PSP-issued QRs (Fiuu/HitPay/Curlec). That's Phase 2.

## Phase 1 — exact-amount QR (LIVE)

- `src/services/emvQr.ts` — dependency-free EMVCo TLV parser + CRC-16/CCITT-FALSE
  + `validateDuitNowStatic` + `embedAmount`. Tests: `src/services/__tests__/emvQr.test.ts`
  (21 checks; CRC anchored on `"123456789" → 29B1`). Run:
  ```
  npx tsc src/services/emvQr.ts src/services/__tests__/emvQr.test.ts \
    --outDir <tmp> --module commonjs --target es2019 --moduleResolution node --skipLibCheck
  node <tmp>/__tests__/emvQr.test.js
  ```
- Seller captures their standee once: **Settings → payment QR → scan standee**
  (camera) or paste the QR text → validated → confirm merchant name → saved with
  the decoded payload on the `PaymentQr` entry (plain photo uploads still work).
- `QrPaySheet` shows the exact-amount QR with **received** / **record without
  confirming** (the latter = today's trust-based behaviour). Wired in stall
  `SellScreen` (cart + custom) and seller `OrderList` (mark-paid/deposit/swipe)
  when a QR-family method is chosen and a payload QR exists.
- **Manual check still owed (needs a device):** capture a *real* standee, render
  the embedded amount, scan with ≥2 banking apps and note pre-fill behaviour.

## Phase 2 — soundbox replacement (turn it on)

Dormant while `EXPO_PUBLIC_QR_PROVIDER=none`. To activate:

1. **Sign a PSP merchant contract** (Fiuu or HitPay — both also Tap-to-Pay
   launch partners in MY, so one onboarding can cover card taps + QR). Get the
   API key + webhook signing secret.
2. **Implement the provider stub** in `src/services/qrProvider.ts`
   (`createFiuuCharge`/`createHitpayCharge`) + a `qr-create-charge` edge function
   that holds the PSP key and returns `{ qrPayload, chargeId }`. **Never** put a
   PSP secret in the app bundle.
3. **Apply the migration:** `supabase db push` →
   `20260611000000_qr_payments_push.sql` (`device_tokens`, `payment_events`,
   `processed_webhook_events`). Reuses the Tap-to-Pay `psp_transaction_id` /
   `payment_provider` columns on `seller_orders`.
4. **Set the webhook secret:** `supabase secrets set HITPAY_WEBHOOK_SALT=…`
   (or `FIUU_WEBHOOK_SECRET=…`) — and finish the signature verifier in
   `supabase/functions/qr-payment-webhook/index.ts` against the provider's docs
   (HitPay HMAC is wired as the example; Fiuu skey is stubbed).
5. **Deploy:** `supabase functions deploy qr-payment-webhook`.
6. **Register the PSP webhook URL** as
   `https://<project>.functions.supabase.co/qr-payment-webhook?provider=hitpay`.
7. **Push:** `device_tokens` is populated on login (`pushNotifications.ts`);
   `google-services.json` is present for FCM (Android); iOS push capability is
   declared via `aps-environment` in `app.json` (EAS manages the credential).
   Confirm the Push Notifications capability on the Apple App ID.
8. **Flip the flag:** `EXPO_PUBLIC_QR_PROVIDER=hitpay` (or `fiuu`) on a dev/prod
   client build (push needs a real build, not Expo Go).

**Behaviour once on:** `QrPaySheet` shows the provider QR with a live
**"waiting for payment…"** state; the webhook verifies the signature, dedupes by
event id, **increments** the order's paid amount (handles deposits), records a
`payment_events` row, and pushes **"Payment received — order #N"** (high
priority, sound) to every device. Tapping deep-links to the order. The app
resolves the pending charge by **polling `payment_events` on focus**
(`qrPaymentResolver`) and the `PendingPaymentsBanner` clears.

> **Reliability note:** APNs/Expo push is *best-effort*, not the hardware
> guarantee a wired soundbox gives. Treat "fires within seconds, every time"
> as the acceptance target to test, knowing Apple can throttle.

## Phase 3 — bank-standee honesty (built)

- Settings states plainly: *payment alerts for your own bank QR come from your
  bank's app — keep its notifications on.*
- If the seller dismisses the QR sheet without confirming and the order is still
  unpaid, a **single 10-min local notification** asks "did the RM X payment for
  order #N arrive?" (`qrPaymentReminder.ts`). Local only; canceled when the order
  is later marked paid. **No** notification/SMS/email reading — out of scope
  permanently (iOS forbids the first two).

## Architecture (where the pieces live)

- `src/services/emvQr.ts` — TLV/CRC/embed (Phase 1, pure, tested).
- `src/components/common/QrCaptureModal.tsx` — scan/paste capture (Settings).
- `src/components/common/QrPaySheet.tsx` — the pay sheet (static + provider + waiting).
- `src/services/qrProvider.ts` — provider interface (`none` / fiuu / hitpay stubs).
- `supabase/functions/qr-payment-webhook/` — webhook → mark paid → push.
- `supabase/migrations/20260611000000_qr_payments_push.sql` — tables + RLS.
- `src/store/pendingPaymentsStore.ts` + `src/services/qrPaymentResolver.ts` +
  `src/components/common/PendingPaymentsBanner.tsx` — in-app waiting state.
- `src/services/qrPaymentReminder.ts` — Phase 3 local nudge.

## Out of scope (permanent)

True dynamic QR generation, PSP onboarding UI, refunds, reading other apps'
notifications/SMS/email, cross-border QR, consumer-presented mode, any change to
the cash flow.
