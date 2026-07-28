/**
 * cleanReply — deterministic reply cleanup (advice softening + banned-word swaps).
 * Confirms the SAFE swaps happen and idiom-risky words are left ALONE.
 * Run: npx tsx scripts/test-critic.ts
 */
import { cleanReply, reviewReply } from '../src/services/critic';

const failures: string[] = [];
let passed = 0;
const check = (name: string, cond: boolean) => { cond ? passed++ : failures.push(name); };

// advice softened, grammar + first-letter case preserved
check('you should → you could', cleanReply('you should save more') === 'you could save more');
check('You should (capital) preserved', cleanReply('You should save') === 'You could save');
check('you need to → you could', cleanReply('you need to cut back') === 'you could cut back');
check('you must → you could', cleanReply('you must pay it') === 'you could pay it');

// banned words → the app's approved vocabulary
check('profit → kept', cleanReply('your profit this month') === 'your kept this month');
check('Profit (capital) → Kept', cleanReply('Profit was high') === 'Kept was high');
check('revenue → money in', cleanReply('total revenue rose') === 'total money in rose');
check('inventory → stock', cleanReply('check your inventory') === 'check your stock');

// idiom-risky words are LEFT ALONE (still flagged by reviewReply, just not auto-fixed)
check('"loss" untouched ("at a loss")', cleanReply('i was at a loss for words') === 'i was at a loss for words');
check('"consider" untouched', cleanReply('consider your options') === 'consider your options');
check('"i recommend" untouched (no safe verb swap)', cleanReply('i recommend saving') === 'i recommend saving');

// a clean reply is returned unchanged
check('clean reply unchanged', cleanReply('you kept RM200 this month, nice') === 'you kept RM200 this month, nice');

// reviewReply still flags everything (telemetry unchanged)
check('reviewReply flags orphan confirmation', reviewReply('lined up rm50 — tap to confirm', false).some((i) => i.kind === 'orphan-confirmation'));
check('reviewReply flags advice', reviewReply('you should save', true).some((i) => i.kind === 'advice'));
check('reviewReply flags banned word', reviewReply('your profit rose', true).some((i) => i.kind === 'banned-word'));

if (failures.length) { console.error('FAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`critic OK (${passed} checks)`);
