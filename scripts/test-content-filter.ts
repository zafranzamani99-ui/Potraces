// Unit test for the Collectz content filter (Apple 1.2 UGC name moderation).
// Pure util, tsx-loadable. Run: npm run test:contentfilter
import { checkContent, isCleanContent } from '../src/utils/contentFilter';
import { checkContent as checkContentServer } from '../supabase/functions/collectz-join/contentFilter';

let pass = 0;
let fail = 0;
const ok = (cond: boolean, msg: string) => {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; console.log(`  ✗ ${msg}`); }
};

console.log('contentFilter');

// Clean names pass (incl. false-positive traps: substrings of blocked words).
for (const name of ['Ali', 'Siti Nurhaliza', 'Ahmad 88', "O'Brien", 'Scunthorpe', 'Cassandra', '班長', 'Team Alpha']) {
  ok(isCleanContent(name), `clean: "${name}"`);
}

// Profanity blocked (English + Malay), whole-word.
for (const bad of ['fuck you', 'you bitch', 'babi', 'pukimak', 'cibai']) {
  const r = checkContent(bad);
  ok(r.ok === false && r.reason === 'profanity', `profanity: "${bad}"`);
}

// Leetspeak + spaced-out obscenities still caught.
ok(!isCleanContent('f4ggot'), 'leet: "f4ggot"');
ok(!isCleanContent('f u c k'), 'spaced: "f u c k"');
ok(!isCleanContent('5h1t'), 'leet: "5h1t"');

// URLs / handles blocked (anti-spam).
for (const url of ['http://spam.com', 'www.scam.net', 'join t.me/xyz', '@promo_acct', 'bit.ly/x', 'buy.shop']) {
  const r = checkContent(url);
  ok(r.ok === false && r.reason === 'url', `url: "${url}"`);
}

// Empty / whitespace is allowed (handled by required-field checks, not the filter).
ok(isCleanContent(''), 'empty passes');
ok(isCleanContent('   '), 'whitespace passes');

// Server parity (Apple 1.2): the Deno port inside the collectz-join edge
// function is the deploy-gated backstop for the same names — it must return the
// SAME verdict as the client filter, or a name the app accepts gets rejected on
// submit (and a bypassed client gets different rules).
console.log('\nserver parity (collectz-join edge filter)');
for (const c of [
  'Ali', 'Siti Nurhaliza', 'Scunthorpe', 'Cassandra', 'Team Alpha', '班長',
  'fuck you', 'babi', 'pukimak', 'f4ggot', 'f u c k', '5h1t',
  'http://spam.com', 'www.scam.net', 'join t.me/xyz', '@promo_acct', 'bit.ly/x', 'buy.shop',
  '', '   ',
]) {
  ok(JSON.stringify(checkContent(c)) === JSON.stringify(checkContentServer(c)), `parity: "${c}"`);
}

console.log(`\n${fail === 0 ? '✓' : '✗'} content-filter: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
