/**
 * Tier → Echo chat-model routing. A cheaper "brain" for Free/Basic protects margin;
 * the smarter (pricier) model is the paid upgrade that powers the "smarter AI" pitch.
 * Pure module (type-only import), so tsx can run it.
 * Run: npm run test:chatmodel
 */
import { chatModelForTier, hasSmartAi, CHAT_MODEL_SMART, CHAT_MODEL_LITE } from '../src/services/chatModel';

const failures: string[] = [];
let passed = 0;
const check = (name: string, cond: boolean) => { if (cond) passed++; else failures.push(name); };

check('free → cheaper (lite) model', chatModelForTier('free') === CHAT_MODEL_LITE);
check('premium → smarter model', chatModelForTier('premium') === CHAT_MODEL_SMART);
check('future basic → cheaper', chatModelForTier('basic') === CHAT_MODEL_LITE);
check('future pro → smarter', chatModelForTier('pro') === CHAT_MODEL_SMART);
check('unknown tier → cheaper (fail-safe on cost)', chatModelForTier('mystery') === CHAT_MODEL_LITE);
check('lite brain is the cheap flash-lite', CHAT_MODEL_LITE.includes('flash-lite'));
check('smart brain is a fuller flash (not lite)', CHAT_MODEL_SMART.includes('flash') && !CHAT_MODEL_SMART.includes('lite'));
check('both brains are Gemini now (no Anthropic)', CHAT_MODEL_SMART.startsWith('gemini') && CHAT_MODEL_LITE.startsWith('gemini'));
check('hasSmartAi: free = no', hasSmartAi('free') === false);
check('hasSmartAi: basic = no', hasSmartAi('basic') === false);
check('hasSmartAi: pro = yes', hasSmartAi('pro') === true);
check('hasSmartAi: premium = yes', hasSmartAi('premium') === true);

if (failures.length) { console.error('FAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`chat-model OK (${passed} checks)`);
