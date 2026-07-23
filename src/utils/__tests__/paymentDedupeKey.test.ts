/**
 * Asserts for the payment dedupe-key derivation.  Run: `npm run test:paymentdedupe`
 *
 * The key is the backbone of cross-path double-log protection: it must be STABLE
 * for the same payment (refId, else amount+minute+payee, tolerant of OCR noise)
 * and DISTINCT across genuinely different payments.
 */
import { dedupeKeyFor } from '../paymentDedupeKey';

let pass = 0;
let fail = 0;

function eq(name: string, got: string, want: string) {
  if (got === want) {
    pass++;
    console.log(`✓ ${name}`);
  } else {
    fail++;
    console.log(`✗ ${name}\n    expected ${JSON.stringify(want)}\n    got      ${JSON.stringify(got)}`);
  }
}

function same(name: string, a: string, b: string) {
  if (a === b) {
    pass++;
    console.log(`✓ ${name}`);
  } else {
    fail++;
    console.log(`✗ ${name} — keys should MATCH\n    a = ${JSON.stringify(a)}\n    b = ${JSON.stringify(b)}`);
  }
}

function diff(name: string, a: string, b: string) {
  if (a !== b) {
    pass++;
    console.log(`✓ ${name}`);
  } else {
    fail++;
    console.log(`✗ ${name} — keys should DIFFER, both = ${JSON.stringify(a)}`);
  }
}

const dt = new Date(2026, 4, 18, 23, 16, 0); // 18 May 2026 23:16

// refId always wins, ignoring everything else.
eq('refId wins', dedupeKeyFor({ refId: 'QR73573013', amount: 57.4, direction: 'out', datetime: dt, payee: 'LNTHAIFOOD' }), 'ref:QR73573013');

// No refId → composite. Same payment read twice (different casing/punctuation/
// seconds in the payee + datetime) collapses to one key.
same(
  'same payment, noisy OCR → same composite key',
  dedupeKeyFor({ amount: 57.4, direction: 'out', datetime: new Date(2026, 4, 18, 23, 16, 12), payee: 'LNT HAI-FOOD' }),
  dedupeKeyFor({ amount: 57.4, direction: 'out', datetime: new Date(2026, 4, 18, 23, 16, 48), payee: 'lnthaifood' }),
);

// Cross-path: a refId-less screenshot and an auto-log of the SAME payment match.
same(
  'cross-path same payment',
  dedupeKeyFor({ amount: 13, direction: 'out', datetime: dt, payee: 'NOOR AZEANA BINTI AZLAN' }),
  dedupeKeyFor({ amount: 13, direction: 'out', datetime: dt, payee: 'Noor Azeana binti Azlan' }),
);

// Different amount, minute, direction, or payee → different key.
diff('different amount', dedupeKeyFor({ amount: 57.4, datetime: dt, payee: 'A' }), dedupeKeyFor({ amount: 25, datetime: dt, payee: 'A' }));
diff('different minute', dedupeKeyFor({ amount: 57.4, datetime: dt, payee: 'A' }), dedupeKeyFor({ amount: 57.4, datetime: new Date(2026, 4, 18, 23, 17, 0), payee: 'A' }));
diff('different direction', dedupeKeyFor({ amount: 57.4, direction: 'out', datetime: dt, payee: 'A' }), dedupeKeyFor({ amount: 57.4, direction: 'in', datetime: dt, payee: 'A' }));
diff('different payee', dedupeKeyFor({ amount: 57.4, datetime: dt, payee: 'A' }), dedupeKeyFor({ amount: 57.4, datetime: dt, payee: 'B' }));

// Missing datetime is stable (uses the 'na' slot) and still keys distinctly by amount/payee.
same('missing datetime stable', dedupeKeyFor({ amount: 9.9, payee: 'X' }), dedupeKeyFor({ amount: 9.9, payee: 'x' }));
diff('missing datetime still distinct', dedupeKeyFor({ amount: 9.9, payee: 'X' }), dedupeKeyFor({ amount: 9.9, payee: 'Y' }));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
