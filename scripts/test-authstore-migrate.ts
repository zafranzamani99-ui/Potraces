/**
 * Pure-logic tests for the authStore v1→v2 migration. Run: npm run test:authmigrate
 */
import { migrateAuthV1toV2 } from '../src/store/authStoreMigrate';

const failures: string[] = [];
let passed = 0;
const check = (n: string, c: boolean) => { c ? passed++ : failures.push(n); };

const v1 = { isAuthenticated: true, isVerified: true, phone: '60123', userId: 'u1', provider: 'phone' };
const out = migrateAuthV1toV2({ ...v1 });
check('business slot populated from flat v1', out.business.userId === 'u1' && out.business.isVerified === true);
check('business provider carried', out.business.provider === 'phone');
check('business phone carried', out.business.phone === '60123');
check('personal slot empty after migrate', out.personal.userId === null && out.personal.isAuthenticated === false);

const empty = migrateAuthV1toV2(undefined);
check('undefined persisted → empty business', empty.business.isAuthenticated === false && empty.business.userId === null);
check('undefined persisted → empty personal', empty.personal.isAuthenticated === false);

if (failures.length) { console.error('FAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`authstore-migrate OK (${passed} checks)`);
