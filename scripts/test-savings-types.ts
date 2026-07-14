/**
 * Unit test for the savings/investment type registry.
 *
 * WHY: the live "Savings & Investments" screen crashed with "Encountered two
 * children with the same key" and showed every account as "Other". Root cause:
 * seeded/legacy accounts carry coarse `type` values ('investment', 'savings')
 * that weren't in the registry, so getTypeInfo returned name "Other" for all of
 * them, and the breakdown list keyed by NAME → two children keyed "Other".
 *
 * This test locks the fix: getTypeInfo normalises legacy/alias values, tags a
 * risk `class` (savings vs investment) for the segmented split, and ALWAYS
 * returns a unique, stable `id` for unknowns so lists key by id without collision.
 *
 * Run:  npx tsx scripts/test-savings-types.ts
 */
import {
  getTypeInfo,
  classOf,
  INVESTMENT_TYPES,
  VALID_TYPE_IDS,
  SAVINGS_TYPE_OPTIONS,
} from '../src/screens/personal/savings/investmentTypes';

let failures = 0;
function check(label: string, cond: boolean) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}`);
    failures++;
  }
}
function eq(label: string, actual: unknown, expected: unknown) {
  check(`${label} (= ${JSON.stringify(expected)})`, actual === expected);
  if (actual !== expected) console.log(`      got: ${JSON.stringify(actual)}`);
}

console.log('savings type registry');

// ── Canonical instruments resolve to themselves with correct class ──
eq('asb → name', getTypeInfo('asb').name, 'ASB');
eq('asb → class', classOf('asb'), 'savings');
eq('tabung_haji → class', classOf('tabung_haji'), 'savings');
eq('bank → class', classOf('bank'), 'savings');
eq('crypto → name', getTypeInfo('crypto').name, 'Crypto');
eq('crypto → class', classOf('crypto'), 'investment');
eq('stocks → class', classOf('stocks'), 'investment');
eq('gold → class', classOf('gold'), 'investment');
eq('robo → name', getTypeInfo('robo').name, 'Robo-advisor');

// ── Legacy / alias values normalise correctly ──
eq('legacy robo_crypto → id', getTypeInfo('robo_crypto').id, 'robo');
eq('legacy robo_crypto → class', classOf('robo_crypto'), 'investment');
eq("coarse 'investment' → id", getTypeInfo('investment').id, 'invest_generic');
eq("coarse 'investment' → class", classOf('investment'), 'investment');
eq("coarse 'savings' → id", getTypeInfo('savings').id, 'save_generic');
eq("coarse 'savings' → class", classOf('savings'), 'savings');
eq("alias 'bitcoin' → id", getTypeInfo('bitcoin').id, 'crypto');
eq("alias 'unit_trust' → id", getTypeInfo('unit_trust').id, 'asb');

// ── The exact old crash scenario: two distinct coarse types must not collide ──
const a = getTypeInfo('investment');
const b = getTypeInfo('savings');
check("'investment' and 'savings' get DISTINCT ids (no key collision)", a.id !== b.id);

// ── Unknown / unmigrated types collapse into the single "Other" bucket ──
eq('unknown weird_x → name', getTypeInfo('weird_x').name, 'Other');
eq('unknown weird_x → collapses to other id', getTypeInfo('weird_x').id, 'other');
check('two different unknowns → merge into one Other bucket', getTypeInfo('foo').id === 'other' && getTypeInfo('bar').id === 'other');

// ── custom_* uses the resolver, defaults to savings class ──
const custom = getTypeInfo('custom_abc', (id) =>
  id === 'custom_abc' ? { name: 'My Crypto Bag', icon: 'm/wallet', color: '#123456' } : undefined
);
eq('custom_abc → name from resolver', custom.name, 'My Crypto Bag');
eq('custom_abc → id preserved', custom.id, 'custom_abc');
eq('custom_abc → class default savings', custom.class, 'savings');
eq('custom_abc without resolver → Other name', getTypeInfo('custom_abc').name, 'Other');
eq('custom_abc without resolver → other id', getTypeInfo('custom_abc').id, 'other');

// ── Empty / null → other ──
eq('empty string → other', getTypeInfo('').id, 'other');
eq('null → other', getTypeInfo(null).id, 'other');
eq('undefined → other', getTypeInfo(undefined).id, 'other');

// ── Every registry entry is internally consistent ──
for (const [key, info] of Object.entries(INVESTMENT_TYPES)) {
  check(`registry[${key}].id === key`, info.id === key);
  check(`registry[${key}] has name/icon/color`, !!info.name && !!info.icon && !!info.color);
  check(`registry[${key}].class is valid`, info.class === 'savings' || info.class === 'investment');
}

// ── Allow-list + picker sanity ──
check('VALID_TYPE_IDS includes canonical + aliases', VALID_TYPE_IDS.includes('asb') && VALID_TYPE_IDS.includes('robo_crypto') && VALID_TYPE_IDS.includes('crypto'));
check('SAVINGS_TYPE_OPTIONS excludes generic buckets', !SAVINGS_TYPE_OPTIONS.some((o) => o.id === 'save_generic' || o.id === 'invest_generic'));
check('SAVINGS_TYPE_OPTIONS has both classes', SAVINGS_TYPE_OPTIONS.some((o) => o.class === 'savings') && SAVINGS_TYPE_OPTIONS.some((o) => o.class === 'investment'));

console.log('');
if (failures > 0) {
  console.error(`✗ ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('✓ all savings-type assertions passed');
