/**
 * Small-talk detection — greetings skip the heavy financial context; anything
 * with money signals must keep it. Pure module, so tsx can run it.
 * Run: npm run test:smalltalk
 */
import { isSmallTalk, isCrisisMessage } from '../src/services/smallTalk';

const failures: string[] = [];
let passed = 0;
const check = (name: string, cond: boolean) => { if (cond) passed++; else failures.push(name); };

// ── Casual turns → skip context ──
check('plain hello', isSmallTalk('hello'));
check('stretched letters (helloooo)', isSmallTalk('helloooo'));
check('with punctuation (hello!)', isSmallTalk('hello!'));
check('capitalised (Hi)', isSmallTalk('Hi'));
check('good morning', isSmallTalk('good morning'));
check('how are you', isSmallTalk('how are you'));
check('thanks', isSmallTalk('thanks'));
check('ok', isSmallTalk('ok'));
check('bare test message', isSmallTalk('test'));
check('malay greeting (apa khabar)', isSmallTalk('apa khabar'));
check('malay thanks (terima kasih)', isSmallTalk('terima kasih'));
check('manglish ok lah', isSmallTalk('ok lah'));
check('bye', isSmallTalk('bye'));

// ── Money / data turns → keep full context ──
check('expense log (add rm15 lunch at mamak)', !isSmallTalk('add rm15 lunch at mamak'));
check('spend question', !isSmallTalk('how much did I spend on food?'));
check('category word alone', !isSmallTalk('lunch'));
check('currency code alone', !isSmallTalk('rm15'));
check('amount alone', !isSmallTalk('15'));
check('greeting + budget (ok lah berapa baki)', !isSmallTalk('ok lah berapa baki'));
check('test + budget (test my budget)', !isSmallTalk('test my budget'));
check('open-ended summary', !isSmallTalk('macam mana bulan ni?'));
check('hello with a question', !isSmallTalk('hello, where does my money go?'));
check('empty-ish input', !isSmallTalk('   '));
check('emoji only', !isSmallTalk('👋'));

// ── Crisis detection → on-device help card, never sent to Gemini ──
check('en: kill myself', isCrisisMessage('i want to kill myself'));
check('en: end my life', isCrisisMessage('i think about ending my life'));
check('en: suicidal', isCrisisMessage('been feeling suicidal lately'));
check('en: hurt myself', isCrisisMessage('i might hurt myself'));
check('en: no reason to live', isCrisisMessage('theres no reason to live anymore'));
check('bm: bunuh diri', isCrisisMessage('rasa nak bunuh diri'));
check('bm: cederakan diri', isCrisisMessage('aku nak cederakan diri'));
check('bm: tak nak hidup', isCrisisMessage('dah tak nak hidup dah'));
// False positives — money-app hyperbole must NOT trip the check
check('not crisis: penat nak mati settle bil', !isCrisisMessage('penat nak mati settle bil ni'));
check('not crisis: bill is killing me', !isCrisisMessage('this bill is killing me'));
check('not crisis: mamak spend', !isCrisisMessage('rm50 makan mamak'));
check('not crisis: dying to buy', !isCrisisMessage('im dying to buy that phone'));
check('not crisis: empty', !isCrisisMessage('   '));

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('FAILED:\n - ' + failures.join('\n - '));
  process.exit(1);
}
