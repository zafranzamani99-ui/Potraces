/**
 * qrProvider — provider-agnostic DuitNow QR charge creation.
 *
 * THE POINT OF PHASE 2: replace a physical DuitNow soundbox (Maybank QRPay
 * Soundbox, RHB DNQR, Qashier…) with a push notification on the seller's own
 * phone. A soundbox can announce "received RM50" only because it is wired into
 * the acquirer that settles the QR. Potraces fires the same alert by being
 * wired into a PSP the same way.
 *
 * HARD RULE: this works ONLY for QRs issued through a PSP/acquirer API
 * (Fiuu, HitPay, Curlec, senangPay…), whose QRs carry routing data and fire a
 * payment webhook. A QR pulled from the seller's own Maybank/CIMB banking app
 * reports only to that bank's backend, has no public webhook, and can NEVER
 * trigger a Potraces notification — that is Phase 3 (honest pending/confirm),
 * not this. Do not attempt to auto-confirm bank-app QRs.
 *
 * When no provider is configured, `createQrCharge` throws
 * QrProviderNotConfiguredError and callers fall back to the Phase-1 static
 * embedded-amount QR (display + manual confirm). When a provider IS configured,
 * QrPaySheet prefers the provider QR and shows a live "waiting for payment…"
 * state instead of the manual "received" button — the webhook resolves it.
 *
 * Charge creation must NOT hold PSP secrets in the app. Each stub is expected
 * to POST to a server endpoint (a future `qr-create-charge` edge function,
 * sibling of `qr-payment-webhook`) that holds the PSP key. The stubs below mark
 * exactly where that goes.
 *
 * Note (do not act on, for the report only): Fiuu and HitPay are also the
 * Stripe Tap to Pay on iPhone launch partners in Malaysia — picking one could
 * let a single merchant onboarding cover card taps + DuitNow QR + this alert.
 */

export type QrProvider = 'none' | 'fiuu' | 'hitpay';

/** Selected provider, from build-time env. Defaults to 'none'. */
export const QR_PROVIDER: QrProvider = (() => {
  const v = (process.env.EXPO_PUBLIC_QR_PROVIDER || 'none').toLowerCase();
  return v === 'fiuu' || v === 'hitpay' ? v : 'none';
})();

/** True when a PSP is wired up (so live webhook confirmation is possible). */
export function qrProviderConfigured(): boolean {
  return QR_PROVIDER !== 'none';
}

/** Thrown by createQrCharge when no provider is configured — callers fall back. */
export class QrProviderNotConfiguredError extends Error {
  readonly code = 'provider_not_configured';
  constructor() {
    super('No QR payment provider configured (EXPO_PUBLIC_QR_PROVIDER=none)');
    this.name = 'QrProviderNotConfiguredError';
  }
}

/** Thrown by a stubbed provider that has not been implemented yet. */
export class QrProviderNotImplementedError extends Error {
  readonly code = 'provider_not_implemented';
  constructor(provider: QrProvider) {
    super(`QR provider "${provider}" is configured but not yet implemented`);
    this.name = 'QrProviderNotImplementedError';
  }
}

export interface QrChargeRequest {
  amountCents: number;
  /** App-side reference: a seller order id (the webhook looks the order up by this). */
  refId: string;
  mode: 'stall' | 'seller';
}

export interface QrChargeResult {
  /** EMVCo payload issued by the PSP — render this instead of the static QR. */
  qrPayload: string;
  /** Provider charge id; the webhook's event references it (idempotency / lookup). */
  chargeId: string;
}

/**
 * Create a provider-issued DuitNow QR for an amount. The returned `qrPayload`
 * is a dynamic, acquirer-routed QR (unlike the Phase-1 self-embedded static
 * QR), and a payment against it will fire `qr-payment-webhook`.
 */
export async function createQrCharge(req: QrChargeRequest): Promise<QrChargeResult> {
  switch (QR_PROVIDER) {
    case 'fiuu':
      return createFiuuCharge(req);
    case 'hitpay':
      return createHitpayCharge(req);
    default:
      throw new QrProviderNotConfiguredError();
  }
}

// ── Provider stubs ────────────────────────────────────────────────────────────
// Each should POST to a server endpoint that holds the PSP secret and returns
// { qrPayload, chargeId }. Never put a PSP secret in the app bundle.

// Fiuu (formerly Razer Merchant Services / MOLPay) — DuitNow QR via API.
// Docs: https://docs.fiuu.com/  (DuitNow QR / Dynamic QR + webhook / return URL)
async function createFiuuCharge(_req: QrChargeRequest): Promise<QrChargeResult> {
  // TODO(Phase 2 activation): POST _req to the `qr-create-charge` edge function
  // with provider=fiuu; it calls Fiuu's QR-create API with the merchant key and
  // returns the EMVCo payload + charge id. Store {chargeId, refId} so the
  // webhook can correlate. Verify webhook signature server-side (skey/vcode).
  throw new QrProviderNotImplementedError('fiuu');
}

// HitPay — DuitNow QR via API, payment webhook with HMAC signature.
// Docs: https://docs.hit-pay.com/  (Payment Requests + Webhooks / HMAC)
async function createHitpayCharge(_req: QrChargeRequest): Promise<QrChargeResult> {
  // TODO(Phase 2 activation): POST _req to the `qr-create-charge` edge function
  // with provider=hitpay; it calls HitPay's payment-request API and returns the
  // QR payload + payment id. The webhook verifies the HMAC over the raw body.
  throw new QrProviderNotImplementedError('hitpay');
}
