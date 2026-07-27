# Fiuu DuitNow QR integration — handoff (2026-07-24)

> ## RESUME HERE
> **Status: code complete, not deployed. Remaining work is ops/config, no coding expected.**
> 1. Fiuu sandbox portal → get merchant **applicationCode** + **secret key**; register notification URL `https://jngmanwvhbpkpkeklfiv.supabase.co/functions/v1/qr-payment-webhook?provider=fiuu`
> 2. `supabase secrets set FIUU_APPLICATION_CODE=... FIUU_SECRET_KEY=... FIUU_STORE_ID=STALL01 FIUU_TERMINAL_ID=TERM01 FIUU_BASE_URL=https://sandbox-payment.fiuu.com`
> 3. `supabase functions deploy qr-create-charge qr-payment-webhook`
> 4. `.env` → add `EXPO_PUBLIC_QR_PROVIDER=fiuu`, rebuild the app
> 5. Verify: stall session → QR checkout → pay in sandbox → sheet auto-completes + push lands
> Details + prod-swap notes below.

Status: **code complete, not yet deployed.** The remaining work is ops/config,
not code. Read this before continuing on any machine.

## What's built (all committed-working-tree as of today)

- `supabase/functions/qr-create-charge/index.ts` — creates a Fiuu OPA
  `precreate.php` charge (DuitNow QR, `channelId 24`, `version v1`,
  `hashType=hmac-sha256`), records a pending `payment_events` row, returns
  `{ qrPayload, chargeId }`. Requires a signed-in session bearer.
- `supabase/functions/qr-payment-webhook/index.ts` — Fiuu branch complete:
  HMAC-SHA256 signature check (sorted param values), OPA notification parsing,
  stall path flips the pending `payment_events` row → `paid` + Expo push.
- `src/services/qrProvider.ts` — `createFiuuCharge` implemented via
  `supabaseBusiness.functions.invoke('qr-create-charge')`.
- `src/screens/stall/SellScreen.tsx` — QR checkout (cart + custom amount) tries
  the provider first, static-QR fallback preserved; 4s poll of
  `payment_events` while the sheet is open; auto-records the sale on confirm.
- `scripts/test-fiuu-signature.ts` — locks the signature algorithm against
  Fiuu's official worked example. Run: `npm run test:fiuusig` (also in `npm test`).

## Signature algorithm (verified against Fiuu's doc example)

All non-empty params except `signature`, sorted by parameter NAME, VALUES
concatenated in order (original form, case-sensitive, trimmed), HMAC-SHA256
with the merchant `secretKey`. Doc example vector:
secret `Ziu61T9xY227aazS530Pk8C5424y663r` →
`db0624605d8a8b9c40b3eeb97f906a454195f1b35d1a2f9b75700e1e8cc942ba` ✓

## Remaining ops checklist (do these next)

1. **Fiuu sandbox portal** (creds were emailed by Fiuu Sales, sandbox):
   - Find the merchant **applicationCode** and **secret key**.
   - Register the notification URL:
     `https://jngmanwvhbpkpkeklfiv.supabase.co/functions/v1/qr-payment-webhook?provider=fiuu`
2. **Supabase** (`brew install supabase/tap/supabase` or scoop on Windows):
   ```
   supabase secrets set FIUU_APPLICATION_CODE=... FIUU_SECRET_KEY=... \
     FIUU_STORE_ID=STALL01 FIUU_TERMINAL_ID=TERM01 \
     FIUU_BASE_URL=https://sandbox-payment.fiuu.com
   supabase functions deploy qr-create-charge qr-payment-webhook
   ```
3. **App env**: `EXPO_PUBLIC_QR_PROVIDER=fiuu` in `.env` (+ EAS env for builds),
   rebuild the app.
4. **Verify end-to-end**: stall session → QR checkout → pay in sandbox →
   sheet auto-completes within ~4s + "Payment received" push lands.

## Going to production (later)

Swap secrets to the prod merchant values, set
`FIUU_BASE_URL=https://opa.fiuu.com`, re-register the webhook URL on the PROD
portal. No code changes needed.

## Notes

- Seller (web-shop) QR flow untouched; this activates stall mode only.
- Stripe Tap to Pay (`EXPO_PUBLIC_TAP_TO_PAY_*`) is independent.
- Fiuu OPA spec source: github.com/FiuuPayment/Documentation-Fiuu_API_Spec →
  `[OPA+MAP] Fiuu Offline Payment API v2.1.18.pdf` (precreate §5.6, notification
  §5.7, signature §7.1–7.2, DuitNow QR channel 24).
