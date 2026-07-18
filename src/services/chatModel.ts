import type { PremiumTier } from '../types';

/**
 * Echo's "brain" per premium tier.
 *
 * WHY: the smarter (pricier) model goes only to paying tiers; everyone else gets a
 * cheaper-but-capable model. This protects margin AND powers the "smarter AI" upsell:
 * upgrading visibly upgrades Echo's intelligence.
 *
 * All AI runs on Gemini now (the Anthropic key was retired) — smart = the fuller
 * flash, lite = flash-lite. Both are in the ai-proxy ALLOWED_MODELS set.
 *
 * Pure module (type-only import) so scripts/test-chat-model.ts can run it under tsx.
 */
export const CHAT_MODEL_SMART = 'gemini-3.5-flash';        // Pro / Premium — the "smarter AI"
export const CHAT_MODEL_LITE = 'gemini-3.1-flash-lite';    // Free / Basic — quick, capable, cheaper

/**
 * Which chat model Echo uses for a tier. Accepts the current tiers ('free' | 'premium')
 * and the planned ones ('basic' | 'pro'); any unknown value falls back to the cheaper
 * model so a mis-set tier never silently bills the expensive one.
 */
export function chatModelForTier(tier: PremiumTier | string): string {
  return tier === 'premium' || tier === 'pro' ? CHAT_MODEL_SMART : CHAT_MODEL_LITE;
}

/** True when the tier gets the smarter paid model — drives the "smarter AI" paywall copy. */
export function hasSmartAi(tier: PremiumTier | string): boolean {
  return tier === 'premium' || tier === 'pro';
}
