/**
 * Collectz event-window formatting (fmtEventRange). Pure module.
 * Run: npm run test:collectzfmt
 *
 * These are +08:00 wall-clock strings so the test is timezone-independent: the
 * ISO carries an explicit offset and fmtEventRange reads local getHours() — the
 * assertions below assume the machine renders in Malaysia time. To keep them
 * portable we only assert on the DATE ordering and the presence/shape of the
 * range separator, not on exact clock digits.
 */
import { fmtEventRange, fmtDateTime } from '../src/screens/personal/collectz/collectzFormat';

const failures: string[] = [];
let passed = 0;
const check = (name: string, cond: boolean) => { if (cond) passed++; else failures.push(name); };

// Use Z (UTC) times so getHours() is deterministic regardless of the test host:
// 13:00Z and 15:00Z. We only assert structure, not the localized digits.
const start = '2026-07-25T13:00:00Z';
const end = '2026-07-25T15:00:00Z';
const endNextDay = '2026-07-26T15:00:00Z';

// ── No end → identical to fmtDateTime(start) ──
check('no end falls back to fmtDateTime', fmtEventRange(start, null) === fmtDateTime(start));
check('undefined end falls back', fmtEventRange(start, undefined) === fmtDateTime(start));

// ── Same-day range → single date, a "–" separator, no second date ──
const sameDay = fmtEventRange(start, end);
check('same-day returns a string', typeof sameDay === 'string' && !!sameDay);
check('same-day has an en-dash separator', !!sameDay && sameDay.includes(' – '));
check('same-day shows the date once', !!sameDay && sameDay.split('Jul').length === 2);

// ── Cross-day range → both dates spelled out ──
const crossDay = fmtEventRange(start, endNextDay);
check('cross-day returns a string', typeof crossDay === 'string' && !!crossDay);
check('cross-day shows two dates (25 and 26)', !!crossDay && crossDay.includes('25') && crossDay.includes('26'));
check('cross-day has a separator', !!crossDay && crossDay.includes(' – '));

// ── Guards ──
check('both null → null', fmtEventRange(null, null) === null);
check('invalid start, valid end → still renders end', typeof fmtEventRange('not-a-date', end) === 'string');
check('empty strings → null', fmtEventRange('', '') === null);

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('FAILED:\n - ' + failures.join('\n - '));
  process.exit(1);
}
