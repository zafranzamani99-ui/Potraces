# AI Proxy — deploy & cutover guide (2026-06-13)

Moves the Gemini + Anthropic keys OFF the client into the `ai-proxy` Edge Function,
which meters every call against a per-identity monthly token budget.

## ⚠️ Until this is deployed, AI is OFF in the app
The client no longer holds any provider key — every AI call now goes to the proxy.
Echo, receipt scan, product parsing, money-chat all return "AI unavailable" (graceful,
no crash) until steps 1–3 are done. There are no live users yet, so this is safe to
stage. Do it in this order.

## 1. Set the server secrets (rotate the keys!)
The old `EXPO_PUBLIC_*` keys shipped inside past app bundles, so treat them as
compromised — generate NEW keys, set the new ones here, then revoke the old ones.

```
npx supabase secrets set GEMINI_API_KEY=<new_gemini_key>
npx supabase secrets set ANTHROPIC_API_KEY=<new_anthropic_key>
```
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do NOT set them.

## 2. Apply the migration (usage table + metering RPC)
```
npx supabase db push
```
Creates `public.ai_proxy_usage` (RLS on, no client policies) + `add_ai_proxy_usage()` (service-role
only). Named separately from the existing `ai_usage` quota-log table (used by parse-statement) — they
do not collide.

## 3. Deploy the function
```
npx supabase functions deploy ai-proxy
```
`config.toml` already sets `verify_jwt = false` (signed-out personal users call with the
anon key; the function resolves identity itself).

## 4. Remove the dead client env vars + rebuild
Delete from `.env` and EAS secrets (no longer read anywhere in the app):
- `EXPO_PUBLIC_GEMINI_API_KEY`
- `EXPO_PUBLIC_ANTHROPIC_API_KEY`

KEEP `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` — the proxy transport needs them.
Then rebuild so the new bundle ships without the keys.

## 5. Device test (mandatory — the function was not runtime-tested when written)
- Echo conversation streams a reply (this is the Anthropic Sonnet path → confirms Anthropic proxying + streaming-adjacent path).
- Receipt scan extracts items (Gemini vision via proxy).
- Product list/image parse works.
- In Supabase → Table editor → `ai_proxy_usage`: a row appears for your identity with rising token counts.
- Budget path: temporarily set `MONTHLY_TOKEN_CAP` low in the function, redeploy, confirm AI degrades to "unavailable" once exceeded, then restore.

## Tuning knobs (in `supabase/functions/ai-proxy/index.ts`)
- `MONTHLY_TOKEN_CAP` — per-identity monthly budget (default 1.5M tokens).
- `MAX_OUTPUT_TOKENS` / `MAX_THINKING_BUDGET` — anti-runaway ceilings on a single call.
- `ALLOWED_MODELS` — the only models the proxy will call.

## Known limitation → follow-up
The proxy is JWT-free so signed-out users can reach it, which means it's a *public*
endpoint: a determined attacker could call it directly by rotating device ids. The keys
are still safe (never exposed) and abuse is bounded per identity, but to fully stop
off-app calls, add **app attestation** (Play Integrity on Android, App Attest on iOS) as
layer 2. Also: wire **tier-aware budgets** (free vs Potraces+) once a server-trusted
entitlement source exists (e.g. a RevenueCat webhook writing the user's tier).
