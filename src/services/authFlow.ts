/**
 * True while AuthScreen is running an explicit phone sign-in / sign-up.
 *
 * Why this exists: the App.tsx `onAuthStateChange` listener writes
 * `isAuthenticated: true` the moment Supabase creates a session. On SIGN-UP that
 * fires SECONDS before AuthScreen has fetched the OTP (`requestOtp`) and seeded the
 * verify screen — so the business gate flips straight past `if (otpCode)` and lands
 * on BusinessSetup, then jumps to "verify your account" once the code finally
 * arrives. (That's the loader → business-mode-picker → verify flash.)
 *
 * AuthScreen owns the auth-store write during these flows — it sets provider/phone/
 * isVerified too, which the listener's partial write doesn't — so the listener must
 * stand down while this is true. It still runs its post-sign-in seller sync.
 */
let inFlight = false;

export const beginAuthFlow = () => { inFlight = true; };
export const endAuthFlow = () => { inFlight = false; };
export const isAuthFlowInFlight = () => inFlight;
