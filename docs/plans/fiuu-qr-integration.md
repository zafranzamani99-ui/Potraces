# Fiuu DuitNow QR integration — handoff (2026-07-24)

> ## RESUME HERE
> **2026-08-02 update: the Fiuu QR now RENDERS in-app.** Root cause of "tap QR,
> nothing happens" on this Mac: `.env` had **no `EXPO_PUBLIC_QR_PROVIDER` line
> at all** (last edited Jul 16, before this feature; `.env` is gitignored so the
> `=fiuu` set on another machine never carried over) → provider defaulted to
> `none` → the Fiuu path was skipped. Fix: re-added `EXPO_PUBLIC_QR_PROVIDER=fiuu`
> to `.env`, restart Metro `--clear` + reload (no native rebuild). Verified on
> prod project (`jngmanwvhbpkpkeklfiv`): both functions ACTIVE
> (`qr-create-charge` v2, `qr-payment-webhook` v11 verify_jwt=false), all 5
> `FIUU_*` secrets set. QR now appears with the exact amount.
> **Design:** `QrPaySheet` redesigned to a HitPay-style floating white card —
> **official DuitNow logo** (`assets/e-wallet/duit-now-logo.png`) on top → QR →
> "SCAN TO PAY" pill → **"powered by Fiuu"** watermark
> (`assets/e-wallet/fiuu-logo.png`), plus merchant name (tag 59) and a live
> pulsing "waiting for payment" chip. Instant loader while the charge is
> created; guarded close (confirm) while a payment is live.
> **Still to verify E2E:** pay the on-screen QR via the Fiuu portal Bank
> Simulator (sandbox creds — a real bank app won't settle it) → sheet should
> auto-complete in ~4s + "Payment received" push. If it never completes, check
> `qr-payment-webhook` logs for the notification delivery.
>
> ## (earlier) RESUME HERE
> **Status: fully wired; blocked on Fiuu provisioning (2026-07-28).**
> Done: functions deployed; webhook `verify_jwt=false` (config.toml); all 5
> `FIUU_*` secrets set (creds from portal → Store Management → Store List);
> webhook URL registered in portal (Notification URL + IPN on);
> `EXPO_PUBLIC_QR_PROVIDER=fiuu` in `.env`. Verified live: app tap →
> qr-create-charge → Fiuu precreate round-trip works; Fiuu rejects with
> **HTTP 401 (40104) "Channel not enabled or account inactive"** — the
> DuitNow QR channel (channelId 24) is not enabled on sandbox merchant
> SB_jejakbaki. Creds/signature are accepted; this is Fiuu-side provisioning.
> 2026-07-30 update: Fiuu re-updated the DuitNow QR **offline** channel
> setting — CLI precreate check now returns **statusCode 00 + real EMVCo
> payload** (merchant "Jejak Baki", Shah Alam). All Fiuu-side blockers
> cleared. Remaining: in-app E2E test — stall session → QR checkout (Fiuu QR
> should appear, no rebuild needed) → pay via portal Bank Simulator → sheet
> auto-completes ~4s + "Payment received" push. If the sheet never completes,
> check qr-payment-webhook logs for the notification delivery.
> Next: user emailed support@fiuu.com to enable the DuitNow QR channel
> (store jejakbaki, applicationCode 0d9cdbb9f8d90f15da8c183196bb17fa).
> Faster alt channel: Telegram dev forum t.me/FiuuDeveloperForum (spec cover
> page). Spec confirms: channels are Fiuu-provisioned per application account
> (§3.1), no self-serve portal toggle exists; 40104 defined §11 p.64;
> storeId/terminalId are merchant-assigned, no pre-registration (§5.6);
> portal Notification URL is the only webhook mechanism (§5.7 p.48) — already
> set. Once enabled: no redeploy/rebuild needed — retest QR checkout, pay via
> the portal's Bank Simulator, sheet should auto-complete + push lands.
> Note: the portal's "Check" button always shows an error by design (unsigned
> test call → 401 Invalid signature). Prod swap: new secrets +
> `FIUU_BASE_URL=https://opa.fiuu.com` + re-register webhook on prod portal.
> Details below.

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

- Seller (web-shop) QR flow — **DEFERRED (owner, 2026-08-06): handle later.** Stall
  mode got the full polish (instant loader, QR expiry + refresh, real error
  surfacing, no-phantom-sale guard). `seller/OrderList.tsx` `openQrSheet` still
  runs the OLD wiring: it `await`s the charge before opening the sheet (frozen
  QR), swallows charge failures silently, and has no expiry/refresh. To reach
  parity, port the stall `openProviderQr` helper + `handleRefreshQr` + the
  `loading`/`onRefresh`/`testRef` props (all already on the shared `QrPaySheet`).
- Stripe Tap to Pay (`EXPO_PUBLIC_TAP_TO_PAY_*`) is independent.
- Fiuu OPA spec source: github.com/FiuuPayment/Documentation-Fiuu_API_Spec →
  `[OPA+MAP] Fiuu Offline Payment API v2.1.18.pdf` (precreate §5.6, notification
  §5.7, signature §7.1–7.2, DuitNow QR channel 24).
