# parse-statement regression fixtures

Golden-test fixtures for the `parse-statement` edge function
(`supabase/functions/parse-statement/index.ts`), per
`docs/plans/import-reconciliation-design.md` §7. Gemini model churn has broken
this parser twice in production (2.0-flash retired, then 2.5-flash gated);
bank statement layouts are unpublished, so these fixtures are the only ground
truth. Re-run the golden test on **every model or prompt change**.

## Synthetic vs real

All 5 PDFs here are **synthetic** — names, account numbers and amounts are
invented, so they are safe to commit:

| File | Layout exercised |
| --- | --- |
| `maybank-savings.pdf` | 2 pages, header repeated, Reference column, USD FX row |
| `cimb-savings.pdf` | Withdrawals/Deposits columns, B/F opening row |
| `bankislam-savings.pdf` | Debit/Credit columns, own-name transfer to another bank |
| `hongleong-savings.pdf` | Cheque No column, "BALANCE BROUGHT FORWARD", SGD FX row |
| `tng-ewallet.pdf` | e-wallet Money Out/Money In, own-bank reload rows |

When real anonymized statements replace these (design doc §7), keep the same
filenames so the test and oracles keep working, and delete the corresponding
entry in `gen-fixtures.ts`.

Each `<name>.pdf` has a hand-written oracle `<name>.expected.json` (count,
income/expense totals, and per-row date/amount/type/is_transfer/FX fields plus
warn-only `descTokens`). It is an **oracle, not a snapshot** — edit it when a
fixture changes, and only via the reviewed `--write-expected` workflow below.

## Regenerate the PDFs

```
npm run gen:statementfixtures
```

Rewrites the 5 PDFs from `gen-fixtures.ts` (hand-rolled minimal PDF writer, no
npm deps). Never touches the `.expected.json` files.

## Run the golden test

```
GEMINI_API_KEY=... npm run test:statementparser
```

The test calls Gemini directly with the same prompt / model / generationConfig
/ normalization the edge function uses (all imported from
`supabase/functions/parse-statement/parserConfig.ts`). It does **not** call the
deployed function because that enforces the 5-statements/user/month quota and
requires a user JWT. Use the same API key the function uses.

Optional: `GEMINI_MODEL=gemini-x.y` overrides the model to trial a candidate
before switching `STATEMENT_MODEL` in `parserConfig.ts`.

Useful flags:

- `--print` — dump the raw model JSON per fixture.
- `--write-expected` — rewrite every `.expected.json` from the live model
  output (with empty `descTokens`). Use after changing the prompt or fixtures:
  regenerate, review the diff by hand, then commit. Never commit unreviewed
  `--write-expected` output — that defeats the point of an oracle.

`test:statementparser` is deliberately **not** in the `npm test` chain — it
needs network access and a secret key, so it stays opt-in.
