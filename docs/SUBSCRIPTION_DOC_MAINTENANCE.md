# Keeping the Subscription & Echo guide up to date

**The doc:** `Potraces_Subscription_and_Echo_Guide.docx` (repo root) — a plain-English, founder-facing Word file explaining the whole subscription system: tiers & prices, every limit per plan, what "Echo" (the AI) is, what happens after each limit, a screen-by-screen gate map, the planned-but-unbuilt gaps, and general "worth knowing" notes.

**The rule (also LOCKED in `CLAUDE.md`):** whenever Echo or the subscription/limit system changes, this docx must be regenerated in the **same** change. Triggers:

- Prices or plan structure → `TIERS` / `STORE_TIER` in `src/components/common/PaywallModal.tsx`
- Any limit number or capability flag → `TIER_LIMITS` in `src/constants/tiers.ts` (re-exported by `src/constants/premium.ts`)
- The gating engine (counters, resets, block-vs-nudge) → `src/store/premiumStore.ts`
- Echo chat limits / where Echo appears → `src/screens/personal/MoneyChat.tsx`, `src/components/wallet/EchoFab.tsx`, `src/services/moneyChat.ts`, `src/services/chatModel.ts`
- Adding/removing a paywall gate on any screen (anything importing `PaywallModal`)

## How the doc is built

```
data.json  ──(python-docx)──►  Potraces_Subscription_and_Echo_Guide.docx
   ▲
   └── structured facts pulled from the source code
```

Two files live in `scripts/subscription_docx/`:

- **`data.json`** — the structured content (tiers, limits, echo, engine, worth, screens, gaps). This is the source of truth for the doc's *content*.
- **`make_docx.py`** — renders `data.json` into the styled `.docx`. Pure formatting; no facts live here. Needs `python-docx` (`pip install python-docx`).

### Fast path — a known, small change

You already know exactly what changed (e.g. Pro AI limit 800 → 1000):

1. Edit the matching value in `scripts/subscription_docx/data.json`.
2. Regenerate:
   ```bash
   python scripts/subscription_docx/make_docx.py \
     scripts/subscription_docx/data.json \
     Potraces_Subscription_and_Echo_Guide.docx
   ```
3. Commit the changed source file, `data.json`, and the `.docx` together.

### Full path — a broad change (Claude/agent)

When the change is large or you're not sure what all moved, rebuild `data.json` from the code instead of hand-editing it. Re-run the research fan-out (the same one that first built this): agents read `tiers.ts`, `premium.ts`, `premiumStore.ts`, `PaywallModal.tsx`, the Echo files, every screen importing `PaywallModal`, and the plan docs (`docs/MONETIZATION_AND_PRICING.md`, `budget-models-echo-spec.md`, `step2/step3 July.md`, `PLAN.md`) for the gap section. It returns the seven-section object; write it to `scripts/subscription_docx/data.json`, then run `make_docx.py` as above.

The `data.json` shape (keys `make_docx.py` expects): `tiers`, `limits`, `echo`, `engine`, `worth`, `screens`, `gaps`. Every fact in it is grounded in a `file:line` source so it can be re-verified.

## Sanity check after regenerating

```bash
python - <<'PY'
from docx import Document
d = Document('Potraces_Subscription_and_Echo_Guide.docx')
print('paragraphs:', len(d.paragraphs), 'tables:', len(d.tables))
print('table sizes:', [(len(t.rows), len(t.columns)) for t in d.tables])
PY
```

Expect 4 tables (plans / limits / screens / gaps) and all non-empty.
