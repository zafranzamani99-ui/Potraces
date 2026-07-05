/**
 * Pure-logic tests for accountLink. No RN/Supabase imports, so tsx runs it.
 * Run: npm run test:accountlink
 */
import { isSharedAccount } from '../src/services/accountLink';

const failures: string[] = [];
let passed = 0;
const check = (name: string, cond: boolean) => { cond ? passed++ : failures.push(name); };

check('both null → not shared', isSharedAccount(null, null) === false);
check('one null → not shared', isSharedAccount('u1', null) === false);
check('null business → not shared', isSharedAccount(null, 'u1') === false);
check('different users → not shared', isSharedAccount('u1', 'u2') === false);
check('same user → shared', isSharedAccount('u1', 'u1') === true);

if (failures.length) { console.error('FAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`account-link OK (${passed} checks)`);
