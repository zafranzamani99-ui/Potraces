/**
 * Echo reply cards — public surface.
 * See types.ts (shapes), parse.ts (directive parsing), builders.ts (pure
 * builders), fillCards.ts (store-reading fill + app-side floor), prompt.ts
 * (system-prompt block).
 */
export * from './types';
export { CARD_REGEX, parseCards, validateCardSpec } from './parse';
export { CARD_PROMPT } from './prompt';
export { formatMoney, CARD_COLORS } from './format';
export type { CardSnapshot, CardBuilder } from './builders';
export { CARD_BUILDERS, buildCard } from './builders';
export { selectCards, defaultCardKindForMessage } from './select';
export { fillCards, gatherSnapshot } from './fillCards';
