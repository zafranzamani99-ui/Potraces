// ─── TAP TO PAY ON IPHONE (Stripe Terminal) ────────────────────────────────
// Thin, SDK-import-free service layer for accepting a real contactless card or
// wallet on the seller's iPhone via Stripe Terminal's Tap to Pay reader.
//
// DESIGN NOTES
//  • iOS only, Malaysia (MYR) only, behind a build-time flag (pilot).
//  • This module imports NOTHING from the Stripe SDK at runtime — only `import
//    type` (erased at compile). The live `terminal` handle (the object returned
//    by `useStripeTerminal()`) is injected by the sheet that calls the hook.
//    That keeps Android / web / disabled builds free of any Stripe runtime code
//    path: the StripeTerminalProvider is never mounted there, the SDK is never
//    initialized, and these functions are never reached.
//  • Charges run ONLY through the SDK's own createPaymentIntent → the resulting
//    intent (with its sdkUuid) is passed straight to collectPaymentMethod and
//    confirmPaymentIntent. Passing a server-made intent would fail with a
//    missing-sdkUuid error, so we never do that.
//  • A module-level in-flight guard means two charges can never run at once.

import { Platform } from 'react-native';
import * as Device from 'expo-device';
import NetInfo from '@react-native-community/netinfo';
import type { PaymentIntent, StripeError } from '@stripe/stripe-terminal-react-native';
import { useSettingsStore } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
import { supabase } from './supabase';

// ─── Build-time config (EXPO_PUBLIC_* is inlined by Metro at build) ──────────
/** Master pilot flag. When false, nothing Stripe-related ever initializes. */
export const TAP_TO_PAY_FLAG = process.env.EXPO_PUBLIC_TAP_TO_PAY_ENABLED === 'true';
/** Stripe Terminal Location id — required by easyConnect for Tap to Pay. */
const STRIPE_LOCATION_ID = process.env.EXPO_PUBLIC_STRIPE_TERMINAL_LOCATION_ID || '';
/** Run the SDK's simulated reader (test mode) instead of the real NFC reader. */
const SIMULATED = process.env.EXPO_PUBLIC_TAP_TO_PAY_SIMULATED === 'true';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const MERCHANT_DISPLAY_NAME = 'Potraces';

// ─── Availability ────────────────────────────────────────────────────────────
export type TapToPayUnavailableReason =
  | 'platform' // not iOS
  | 'flag' // pilot flag off OR the per-device settings toggle is off
  | 'currency' // settings currency is not RM
  | 'device' // iPad (Tap to Pay is iPhone-only)
  | 'offline' // no network — a card charge needs Stripe online
  | 'config'; // operator hasn't supplied a Stripe Terminal location id

export type TapToPayAvailability =
  | { available: true }
  | { available: false; reason: TapToPayUnavailableReason };

// Cached connectivity so availability can stay synchronous (NetInfo is async).
let _online = true;
let _netSubscribed = false;
function ensureNetSubscription() {
  if (_netSubscribed) return;
  _netSubscribed = true;
  try {
    NetInfo.addEventListener((s) => {
      _online = !!s.isConnected && s.isInternetReachable !== false;
    });
  } catch {
    // NetInfo unavailable — assume online so we fail at charge time, not here.
  }
}

/**
 * Synchronous gate used everywhere a Card button might render and in Settings.
 * Order matters: cheapest / most-fundamental checks first.
 */
export function tapToPayAvailable(): TapToPayAvailability {
  ensureNetSubscription();
  if (Platform.OS !== 'ios') return { available: false, reason: 'platform' };
  if (!TAP_TO_PAY_FLAG) return { available: false, reason: 'flag' };
  // iPad has no Tap to Pay. `deviceType` may be null on a simulator → treat as phone.
  if (Device.deviceType === Device.DeviceType.TABLET) {
    return { available: false, reason: 'device' };
  }
  const { tapToPayEnabled, currency } = useSettingsStore.getState();
  if (!tapToPayEnabled) return { available: false, reason: 'flag' };
  if (currency !== 'RM') return { available: false, reason: 'currency' };
  if (!STRIPE_LOCATION_ID || !SUPABASE_URL) return { available: false, reason: 'config' };
  if (!_online) return { available: false, reason: 'offline' };
  return { available: true };
}

/** Convenience boolean for render-time gating. */
export function isTapToPayAvailable(): boolean {
  return tapToPayAvailable().available;
}

// ─── Connection-token provider (the only backend touchpoint) ─────────────────
/**
 * Fetches a Stripe Terminal connection token from our edge function using the
 * caller's Supabase session. Wired into <StripeTerminalProvider tokenProvider>.
 */
export async function fetchConnectionToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) throw new Error('Not authenticated');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/terminal-connection-token`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`connection-token ${res.status}`);
  const json = (await res.json()) as { secret?: string };
  if (!json?.secret) throw new Error('connection-token: missing secret');
  return json.secret;
}

// ─── Result + injected terminal handle ───────────────────────────────────────
export type TapToPayResult =
  | { status: 'success'; transactionId: string }
  | { status: 'canceled' }
  | { status: 'declined'; message: string }
  | { status: 'error'; message: string };

type PIResult = { paymentIntent?: PaymentIntent.Type; error?: StripeError };

/**
 * Structural subset of `useStripeTerminal()`'s return that we actually use.
 * The sheet passes the full hook object in; this keeps the service decoupled
 * from the SDK's runtime module.
 */
export interface TapToPayTerminal {
  connectedReader: unknown | null | undefined;
  easyConnect: (params: any) => Promise<{ reader?: unknown; error?: StripeError }>;
  createPaymentIntent: (params: any) => Promise<PIResult>;
  collectPaymentMethod: (params: any) => Promise<PIResult>;
  confirmPaymentIntent: (params: any) => Promise<PIResult>;
}

export interface ChargeMetadata {
  mode: 'stall' | 'seller';
  refId: string;
}

const DECLINE_CODES = new Set([
  'DECLINED_BY_STRIPE_API',
  'DECLINED_BY_READER',
  'OFFLINE_TRANSACTION_DECLINED',
  'CARD_NOT_SUPPORTED',
]);

/** Map any SDK error into one of our four UI-safe outcomes. */
function mapError(error?: StripeError): TapToPayResult {
  if (!error) return { status: 'error', message: 'Unknown error.' };
  const code = String(error.code || '');
  if (code === 'CANCELED') return { status: 'canceled' };
  if (DECLINE_CODES.has(code)) {
    return { status: 'declined', message: error.apiError?.declineCode || error.message || 'declined' };
  }
  return { status: 'error', message: error.message || 'error' };
}

// ─── In-flight guard ─────────────────────────────────────────────────────────
let _charging = false;
export function isCharging(): boolean {
  return _charging;
}

/**
 * Ensure a Tap to Pay reader is connected (connect once, reuse for the session).
 * Returns ok, or a UI-safe failure to surface in the sheet.
 */
export async function connectTapToPayReader(
  terminal: TapToPayTerminal,
): Promise<{ ok: true } | { ok: false; error: TapToPayResult }> {
  if (terminal.connectedReader) return { ok: true };
  try {
    const { reader, error } = await terminal.easyConnect({
      discoveryMethod: 'tapToPay',
      locationId: STRIPE_LOCATION_ID,
      merchantDisplayName: MERCHANT_DISPLAY_NAME,
      tosAcceptancePermitted: true,
      simulated: SIMULATED,
    });
    // A live reader from a prior charge is fine — reuse it.
    if (error && String(error.code) === 'ALREADY_CONNECTED_TO_READER') return { ok: true };
    if (error || !reader) return { ok: false, error: mapError(error) };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: { status: 'error', message: (e as Error)?.message || 'connect failed' } };
  }
}

/**
 * Charge a card via Tap to Pay. Assumes a reader is already connected (call
 * `connectTapToPayReader` first). Runs createPaymentIntent →
 * collectPaymentMethod → confirmPaymentIntent. The sale is recorded by the
 * caller ONLY on { status: 'success' }. `onProgress` lets the sheet reflect the
 * collect (waiting-for-tap) vs confirm (processing) phases.
 */
export async function chargeCard(opts: {
  terminal: TapToPayTerminal;
  amountCents: number;
  description: string;
  metadata: ChargeMetadata;
  onProgress?: (phase: 'collecting' | 'confirming') => void;
}): Promise<TapToPayResult> {
  if (_charging) return { status: 'error', message: 'A charge is already in progress.' };
  if (!Number.isFinite(opts.amountCents) || opts.amountCents <= 0) {
    return { status: 'error', message: 'Invalid amount.' };
  }
  _charging = true;
  try {
    const userId = useAuthStore.getState().userId || '';
    const metadata: Record<string, string> = {
      mode: opts.metadata.mode,
      refId: opts.metadata.refId,
      userId,
    };

    // 1) Create the intent through the SDK so it carries an sdkUuid.
    const created = await opts.terminal.createPaymentIntent({
      amount: Math.round(opts.amountCents),
      currency: 'myr',
      captureMethod: 'automatic',
      metadata,
      description: opts.description,
    });
    if (created.error || !created.paymentIntent) return mapError(created.error);

    // 2) Collect — this presents the system Tap to Pay UI.
    opts.onProgress?.('collecting');
    const collected = await opts.terminal.collectPaymentMethod({
      paymentIntent: created.paymentIntent,
      updatePaymentIntent: true,
    });
    if (collected.error || !collected.paymentIntent) return mapError(collected.error);

    // 3) Confirm — money only moves here.
    opts.onProgress?.('confirming');
    const confirmed = await opts.terminal.confirmPaymentIntent({
      paymentIntent: collected.paymentIntent,
    });
    if (confirmed.error || !confirmed.paymentIntent) return mapError(confirmed.error);

    const pi = confirmed.paymentIntent;
    if (pi.status === 'succeeded') {
      return { status: 'success', transactionId: pi.id };
    }
    // Anything else after confirm is unexpected — never record a sale on it.
    return { status: 'error', message: `unexpected status: ${pi.status ?? 'unknown'}` };
  } catch (e) {
    return { status: 'error', message: (e as Error)?.message || 'Charge failed.' };
  } finally {
    _charging = false;
  }
}
