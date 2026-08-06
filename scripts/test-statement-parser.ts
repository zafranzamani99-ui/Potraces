/**
 * Golden regression test for the parse-statement Gemini extraction.
 * (docs/plans/import-reconciliation-design.md §7 — Gemini model churn has
 * broken this parser twice in production; these fixtures are the only ground
 * truth because bank descriptor layouts are unpublished.)
 *
 * For every .pdf in supabase/functions/parse-statement/fixtures/ with a
 * sibling .expected.json, this posts the PDF to Gemini with the EXACT same
 * prompt / model / generationConfig / normalization the edge function uses
 * (imported from parserConfig.ts) and diffs the result against the oracle.
 *
 * It calls Gemini directly — NOT the deployed edge function — because the
 * function enforces a 5-statements/user/month quota and needs a user JWT.
 *
 * Run:  GEMINI_API_KEY=... npm run test:statementparser
 *       GEMINI_MODEL=gemini-x.y GEMINI_API_KEY=... npm run test:statementparser   # candidate model
 * Flags:
 *   --print           dump the raw model JSON for each fixture
 *   --write-expected  rewrite each .expected.json from the live output
 *                     (human review-then-commit — use after prompt/fixture changes)
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  EXTRACTION_PROMPT,
  STATEMENT_GENERATION_CONFIG,
  STATEMENT_MODEL,
  normalizeTransactions,
} from '../supabase/functions/parse-statement/parserConfig';

const FIXTURES_DIR = path.join(__dirname, '..', 'supabase', 'functions', 'parse-statement', 'fixtures');
const AMOUNT_TOL = 0.01;

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error('✗ GEMINI_API_KEY is not set.');
  console.error('  Set GEMINI_API_KEY (the same key the parse-statement function uses):');
  console.error('  GEMINI_API_KEY=... npm run test:statementparser');
  process.exit(1);
}
const MODEL = process.env.GEMINI_MODEL || STATEMENT_MODEL;
const PRINT = process.argv.includes('--print');
const WRITE_EXPECTED = process.argv.includes('--write-expected');

type ExpectedTxn = {
  date: string;
  amount: number;
  type: 'income' | 'expense';
  is_transfer: boolean;
  descTokens: string[];
  originalAmount: number | null;
  originalCurrency: string | null;
  suggested_category?: string;
};
type Expected = {
  currency: string;
  transactionCount: number;
  totals: { income: number; expense: number };
  transactions: ExpectedTxn[];
};

const fixtures = fs
  .readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith('.pdf') && fs.existsSync(path.join(FIXTURES_DIR, f.replace(/\.pdf$/, '.expected.json'))))
  .sort();

if (fixtures.length === 0) {
  console.error(`✗ no fixtures found in ${FIXTURES_DIR} (need <name>.pdf + <name>.expected.json)`);
  process.exit(1);
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const close = (a: number, b: number) => Math.abs(a - b) <= AMOUNT_TOL + 1e-9;

async function callGemini(pdfBase64: string): Promise<{ status: number; body: string }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { inline_data: { mime_type: 'application/pdf', data: pdfBase64 } },
              { text: EXTRACTION_PROMPT },
            ],
          },
        ],
        generationConfig: STATEMENT_GENERATION_CONFIG,
      }),
    },
  );
  return { status: res.status, body: await res.text() };
}

function buildExpected(parsed: any, txns: any[]): Expected {
  const income = r2(txns.filter((t) => t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0));
  const expense = r2(txns.filter((t) => t.type === 'expense').reduce((s, t) => s + (Number(t.amount) || 0), 0));
  return {
    currency: parsed?.currency ?? 'MYR',
    transactionCount: txns.length,
    totals: { income, expense },
    transactions: txns.map((t) => ({
      date: t.date,
      amount: t.amount,
      type: t.type,
      is_transfer: t.is_transfer === true,
      descTokens: [],
      originalAmount: t.originalAmount ?? null,
      originalCurrency: t.originalCurrency ?? null,
    })),
  };
}

function compare(name: string, exp: Expected, parsed: any, txns: any[]): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Currency (oracle field — hard check).
  const currency = parsed?.currency ?? 'MYR';
  if (currency !== exp.currency) errors.push(`currency: expected ${exp.currency}, got ${currency}`);

  // Transaction count.
  if (txns.length !== exp.transactionCount) {
    errors.push(`transaction count: expected ${exp.transactionCount}, got ${txns.length}`);
  }

  // Income/expense totals (±0.01).
  const income = r2(txns.filter((t) => t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0));
  const expense = r2(txns.filter((t) => t.type === 'expense').reduce((s, t) => s + (Number(t.amount) || 0), 0));
  if (!close(income, exp.totals.income)) errors.push(`income total: expected ${exp.totals.income}, got ${income}`);
  if (!close(expense, exp.totals.expense)) errors.push(`expense total: expected ${exp.totals.expense}, got ${expense}`);

  // Row matching: every expected txn must match exactly one unused actual row
  // on date + amount (±0.01) + type.
  const used = new Set<number>();
  exp.transactions.forEach((e, ei) => {
    const label = `#${ei + 1} ${e.date} ${e.type} ${e.amount}`;
    const matches = txns
      .map((t, i) => ({ t, i }))
      .filter(
        ({ t, i }) =>
          !used.has(i) && t.date === e.date && t.type === e.type && close(Number(t.amount), e.amount),
      );
    if (matches.length === 0) {
      errors.push(`${label}: no matching actual row`);
      return;
    }
    if (matches.length > 1) {
      errors.push(`${label}: ambiguous — ${matches.length} actual rows match date+amount+type`);
      return;
    }
    const { t: a, i } = matches[0];
    used.add(i);

    if ((a.is_transfer === true) !== e.is_transfer) {
      errors.push(`${label}: is_transfer expected ${e.is_transfer}, got ${a.is_transfer} ("${a.description}")`);
    }

    if (e.originalAmount != null) {
      if (typeof a.originalAmount !== 'number' || !close(a.originalAmount, e.originalAmount)) {
        errors.push(`${label}: originalAmount expected ${e.originalAmount}, got ${a.originalAmount}`);
      }
      if (a.originalCurrency !== e.originalCurrency) {
        errors.push(`${label}: originalCurrency expected ${e.originalCurrency}, got ${a.originalCurrency}`);
      }
    } else if (a.originalAmount != null || a.originalCurrency != null) {
      errors.push(
        `${label}: expected no FX fields, got originalAmount=${a.originalAmount} originalCurrency=${a.originalCurrency} ("${a.description}")`,
      );
    }

    // Warn-only: description tokens + suggested_category.
    const desc = String(a.description ?? '').toLowerCase();
    for (const tok of e.descTokens ?? []) {
      if (!desc.includes(tok.toLowerCase())) {
        warnings.push(`${label}: description "${a.description}" missing token "${tok}"`);
      }
    }
    if (e.suggested_category && a.suggested_category !== e.suggested_category) {
      warnings.push(`${label}: suggested_category expected ${e.suggested_category}, got ${a.suggested_category}`);
    }
  });

  // Extra actual rows beyond the expected set.
  const extras = txns.filter((_, i) => !used.has(i));
  for (const t of extras) {
    errors.push(`extra row not in oracle: ${t.date} ${t.type} ${t.amount} "${t.description}"`);
  }

  return { errors, warnings };
}

(async () => {
  console.log(`parse-statement golden test — model: ${MODEL}${process.env.GEMINI_MODEL ? ' (GEMINI_MODEL override)' : ''}`);
  console.log(`fixtures: ${fixtures.length} from ${FIXTURES_DIR}\n`);

  const failures: string[] = [];
  for (const file of fixtures) {
    const name = file.replace(/\.pdf$/, '');
    const pdfBase64 = fs.readFileSync(path.join(FIXTURES_DIR, file)).toString('base64');
    const expectedPath = path.join(FIXTURES_DIR, `${name}.expected.json`);

    const { status, body } = await callGemini(pdfBase64);
    if (status !== 200) {
      failures.push(name);
      console.log(`✗ ${name}  HTTP ${status}: ${body.slice(0, 200)}\n`);
      continue;
    }

    let geminiData: any;
    try {
      geminiData = JSON.parse(body);
    } catch {
      failures.push(name);
      console.log(`✗ ${name}  response envelope not JSON: ${body.slice(0, 200)}\n`);
      continue;
    }
    const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      failures.push(name);
      console.log(`✗ ${name}  model output not valid JSON. Sample: ${text.slice(0, 200)}\n`);
      continue;
    }

    if (PRINT) {
      console.log(`--- ${name} raw model JSON ---`);
      console.log(JSON.stringify(parsed, null, 2));
    }

    // Same normalization the edge function applies.
    const txns = normalizeTransactions(parsed);

    if (WRITE_EXPECTED) {
      fs.writeFileSync(expectedPath, JSON.stringify(buildExpected(parsed, txns), null, 2) + '\n');
      console.log(`✓ ${name}  wrote ${name}.expected.json (${txns.length} txns) — REVIEW BEFORE COMMITTING\n`);
      continue;
    }

    const exp: Expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
    const { errors, warnings } = compare(name, exp, parsed, txns);
    if (errors.length > 0) {
      failures.push(name);
      console.log(`✗ ${name}`);
      errors.forEach((e) => console.log(`    ✗ ${e}`));
    } else {
      console.log(`✓ ${name}  ${txns.length} txns, income ${r2(exp.totals.income)}, expense ${r2(exp.totals.expense)}`);
    }
    warnings.forEach((w) => console.log(`    ⚠ ${w}`));
    console.log();
  }

  if (WRITE_EXPECTED) {
    console.log(`--write-expected: ${fixtures.length} oracle file(s) rewritten. Review the diffs, then commit.`);
    return;
  }
  const passed = fixtures.length - failures.length;
  if (failures.length > 0) {
    console.log(`FAILED: ${failures.length}/${fixtures.length} fixtures (${failures.join(', ')})`);
    process.exit(1);
  }
  console.log(`PASSED: ${passed}/${fixtures.length} fixtures match their oracles (model ${MODEL}).`);
})().catch((e) => {
  console.error('✗ unexpected error:', e);
  process.exit(1);
});
