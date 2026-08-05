/**
 * Pure-logic tests for the monthly statement reminder date.
 * No RN imports, so tsx runs it. Run: npm run test:statementreminder
 */
import { nextStatementReminderDate } from '../src/utils/statementReminder';

const failures: string[] = [];
let passed = 0;
function check(name: string, cond: boolean) {
  if (cond) passed++;
  else failures.push(name);
}

// 1. mid-month → 1st of NEXT month (Jan → Feb boundary)
const d1 = nextStatementReminderDate(new Date(2026, 0, 15, 9, 30));
check('Jan 15 → Feb 1', d1.getFullYear() === 2026 && d1.getMonth() === 1 && d1.getDate() === 1);

// 2. December → January of the NEXT YEAR (year rollover)
const d2 = nextStatementReminderDate(new Date(2026, 11, 20, 18, 0));
check('Dec 2026 → Jan 2027', d2.getFullYear() === 2027 && d2.getMonth() === 0 && d2.getDate() === 1);

// 3. already past today's fire time (1st, 10:00:01) → next month's 1st
const d3 = nextStatementReminderDate(new Date(2026, 6, 1, 10, 0, 1));
check('Jul 1 10:00:01 → Aug 1', d3.getFullYear() === 2026 && d3.getMonth() === 7 && d3.getDate() === 1);

// 4. exactly on the 1st (midnight, before fire time) → still NEXT month's 1st
const d4 = nextStatementReminderDate(new Date(2026, 6, 1, 0, 0, 0));
check('Jul 1 00:00 → Aug 1', d4.getFullYear() === 2026 && d4.getMonth() === 7 && d4.getDate() === 1);

// 5. fires at 10:00 local, seconds/ms zeroed
check('10:00 local', d1.getHours() === 10 && d1.getMinutes() === 0 && d1.getSeconds() === 0 && d1.getMilliseconds() === 0);

// 6. always in the future relative to `now` (safe to schedule immediately)
const now = new Date();
check('always in the future', nextStatementReminderDate(now).getTime() > now.getTime());

if (failures.length) { console.error('FAIL:\n' + failures.join('\n')); process.exit(1); }
console.log(`statement-reminder OK (${passed} checks)`);
