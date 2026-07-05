/**
 * Pure-logic tests for the per-mode delete decision. Run: npm run test:deleteflow
 */
import { planDelete } from '../src/services/deleteAccountFlow';

const failures: string[] = [];
let passed = 0;
const check = (n: string, c: boolean) => { c ? passed++ : failures.push(n); };

check('distinct accounts → full', planDelete('personal', 'b1', 'p1') === 'full');
check('personal-only signed in → full', planDelete('personal', null, 'p1') === 'full');
check('business-only signed in → full', planDelete('business', 'b1', null) === 'full');
check('shared (personal side) → data-only', planDelete('personal', 'u1', 'u1') === 'data-only');
check('shared (business side) → data-only', planDelete('business', 'u1', 'u1') === 'data-only');
check('both null → full', planDelete('personal', null, null) === 'full');

if (failures.length) { console.error('FAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`delete-flow OK (${passed} checks)`);
