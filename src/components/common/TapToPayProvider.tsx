import React from 'react';
import { Platform } from 'react-native';
import { TAP_TO_PAY_FLAG, fetchConnectionToken } from '../../services/tapToPay';

// Build-time gate. Both operands are constant per build, so this resolves once.
const ENABLED = Platform.OS === 'ios' && TAP_TO_PAY_FLAG;

// Lazy require: on Android / web / disabled builds the Stripe Terminal module is
// never loaded, so those builds carry zero Stripe runtime code paths. Only an
// iOS build with the pilot flag on ever evaluates this.
const Stripe = ENABLED ? require('@stripe/stripe-terminal-react-native') : null;

/**
 * Mounts <StripeTerminalProvider> only on iOS with the pilot flag on; otherwise
 * renders children untouched. The token provider fetches our edge function with
 * the current Supabase session.
 */
export default function TapToPayProvider({ children }: { children: React.ReactElement }) {
  if (!ENABLED || !Stripe?.StripeTerminalProvider) {
    return <>{children}</>;
  }
  const StripeTerminalProvider = Stripe.StripeTerminalProvider;
  return (
    <StripeTerminalProvider tokenProvider={fetchConnectionToken}>
      {children}
    </StripeTerminalProvider>
  );
}
