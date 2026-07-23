/**
 * Playground for the payment-screenshot parser — try it on real text before the
 * app/native wiring exists.  Two ways to feed it the lines you SEE on a payment screen:
 *
 *   npm run tryparse -- "Payment successful|RM 57.40|LNTHAIFOOD|Reference ID QR73573013"
 *   (rows separated by | )
 *
 *   printf 'Payment successful\nRM 57.40\nLNTHAIFOOD\n' | npm run tryparse
 *   (pipe multi-line text via stdin)
 */
import * as fs from 'fs';
import { parsePaymentScreenshot } from '../src/services/paymentScreenshotParser';

function split(s: string): string[] {
  return s.split(/\||\r?\n/).map((r) => r.trim()).filter(Boolean);
}

function getRows(): string[] {
  const arg = process.argv.slice(2).join(' ').trim();
  if (arg) return split(arg);
  if (process.stdin.isTTY) return []; // interactive, nothing piped
  return split(fs.readFileSync(0, 'utf8'));
}

const rows = getRows();
if (rows.length === 0) {
  console.log('Usage: npm run tryparse -- "line1|line2|line3"   (or pipe text via stdin)');
  process.exit(0);
}

console.log('\nInput rows:');
rows.forEach((r, i) => console.log(`  ${i}: ${r}`));

const p = parsePaymentScreenshot(rows);
console.log('\nParsed:');
console.log(JSON.stringify({ ...p, datetime: p.datetime ? p.datetime.toString() : null }, null, 2));

if (p.isPaymentScreen) {
  const arrow = p.direction === 'in' ? 'received' : 'paid';
  console.log(`\n→ would log: ${arrow} ${p.currency} ${p.amount?.toFixed(2)} ${p.payee ? '· ' + p.payee : ''}  (wallet: ${p.walletHint ?? 'default'}, confidence ${(p.confidence * 100).toFixed(0)}%)`);
} else {
  console.log(`\n→ would NOT log — reason: ${p.reason}`);
}
