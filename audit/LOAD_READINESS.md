# Load Readiness — 1,000 Users / ~100 Concurrent Requests

> **Question answered:** Is Potraces ready for ~1,000 users and ~100 concurrent server requests without crashing or losing data?
>
> **Verdict: CONDITIONAL-GO.** The app will not crash and will not exhaust connections at this scale — the local-first architecture keeps real server concurrency in the *tens*, not hundreds. But two things gate the "GO": (1) two **always-on** ceilings in the public order path + shared-AI quota that the user must size/load-test against their actual Supabase + provider plan; (2) one **unverified data-loss class** in seller-mode sync (multi-device tombstone delete + buyer double-submit) that no adversarial reviewer cleared and that triggers at **2 devices / 1 dropped response**, far below the 1,000-user bar.
>
> This is a synthesis of 4 dimension audits (client ceilings, backend concurrency, edge/quotas, sync-concurrency), each adversarially verified. A code audit **cannot** replace the load test in the final section — it can only tell you where to point it.

---

## TL;DR

| Axis | Result |
|---|---|
| **Will the server crash at 1,000 users?** | No. Personal sync is dormant (opt-out, forced false on rehydrate) → ~1,000 installs generate near-zero authenticated server load. |
| **Will it survive ~100 concurrent requests?** | Yes for sync/order PostgREST traffic (Supavisor multiplexes; not 100 raw PG connections). **No** for 100 concurrent *AI* requests on a free provider tier. |
| **Will it lose data under concurrency?** | **Unproven.** The verified client/backend audits *refuted* the headline "tombstone mass-delete" single-device claim. But the 2-device seller-sync delete-divergence and buyer double-submit duplication were **not** adversarially verified and remain the single biggest open risk. |
| **Binding ceiling today** | Shared AI provider RPM (free tier ~15 RPM) **and** the unverified seller multi-device data-integrity path — not connections, not CPU. |

**Realistic concurrency ceiling:** comfortably handles **tens of simultaneous seller syncs + a few hundred order-page views/min**. First *real* break points: **~15 concurrent AI calls** on Gemini free tier (tier-dependent), and **data corruption at 2 concurrent devices on one seller account** (load-independent, correctness not capacity).

---

## How to weight these findings (local-first lens)

The architecture is local-first. That single fact reshuffles every ceiling:

- **Personal sync is gated OFF by default** (`settingsStore.personalSyncEnabled=false`, forced false on rehydrate). ~1,000 personal users → near-zero server load. **Any ceiling that lives only in personal sync barely matters for launch.**
- **The real server surface is:** seller-mode sync (always-on for sellers), the **public unauthenticated order page + place-order**, **ai-proxy / parse-statement** (shared global keys), and the **order-push fan-out**.
- **Capacity ≠ correctness.** The server won't fall over. The thing that can actually hurt a user at this scale is **data loss in always-on seller sync**, which is a structural correctness bug, not a load bug — it does not wait for 1,000 users.

So the ordering below is: **data-loss-under-concurrency first → always-on capacity/quota ceilings → tier-dependent unknowns → dropped (refuted) claims → load-test plan.**

---

## BLOCKING — must resolve or consciously accept before scaling

### B1. Seller multi-device sync can delete the other device's rows (UNVERIFIED, data-loss, always-on) 🔴

- **Source:** sync-concurrency dimension (verdict text). **Status: NOT adversarially verified** — this dimension returned findings in prose with **empty `ceilings`/`verified` arrays**, so no reviewer cleared *or* refuted it. Treat as an open, high-credibility hypothesis.
- **Mechanism claimed:** the per-table push step hard-`DELETE`s remote rows that are simply *absent from the syncing device's local view*. Two devices on one seller account — or a reinstall whose pull is incomplete before push — can permanently wipe orders/products the other device legitimately holds.
- **Why this is the #1 blocker:** it is the only **DATA-LOSS-under-concurrency** path in an **always-on** flow (seller sync ships live; personal sync is dormant). It triggers at **2 devices**, independent of total user count.
- **Critical nuance vs. the verified audits:** the client/backend reviewers *refuted* the **single-device** version of this (SCALE-C6, SCALE-C1 catastrophe chain) — truncation causes *under*-deletion that self-heals, a failed write leaves the prior blob intact, an empty store hits a `pushOrders` early-return, and `syncAll` pulls-before-push. **Those refutations do not cover the 2-device-incomplete-pull case**, because there both devices have *real, non-empty, divergent* local sets and the early-return/self-heal guards don't apply. This gap is exactly what the load test must settle.
- **Action:** (a) drive deletions off the local `_deletedXxxIds` tombstone arrays the store already maintains, never off "absent from local view"; (b) run the **two-device concurrent-edit scenario** in the load plan below before any seller account is allowed a second device.

### B2. Public order path has no idempotency key / no unique constraint → duplicate paid-pending orders (UNVERIFIED, data-integrity, always-on) 🔴

- **Source:** sync-concurrency dimension (verdict). **Not adversarially verified.**
- **Mechanism:** `place-order` has no idempotency key and `order_link` rows have no unique constraint, so a lost-response retry or a buyer refresh creates **duplicate paid-pending orders**. Triggers at **1 buyer double-submit**.
- **Compounding:** order_link realtime + pull is **INSERT-only**, so payment/status edits to online orders never propagate to a second device — the two diverge permanently.
- **Action:** add a client-generated idempotency key + a partial unique index on `(seller_id, idempotency_key)`; make order_link sync handle UPDATE, not just INSERT. Verify with the **buyer-double-submit** load scenario.

### B3. Shared AI provider keys have no RPM/global throttle (VERIFIED real, quota, tier-dependent) 🟡

- **Source:** EQ-1 (verified `isReal=true`, severity corrected HIGH→**MEDIUM**, `dependsOnTier=true`); also BC-4 (per-user counter doesn't contend, but provides no global cap).
- **Mechanism:** `ai-proxy` and `parse-statement` share **one** Gemini key + **one** Anthropic key. The only gate is a **monthly per-identity** budget (1.5M tokens / 3,000 calls) that **fails OPEN on any DB error** (EQ-2). There is **no per-minute or global throttle**. 1,000 users drawing AI actions at overlapping times stampede a single provider bucket.
- **Why it gates the 100-concurrent target specifically:** on **Gemini free tier (~15 RPM)** the proxy 429s above ~15 requests/minute — **well below 100 concurrent**. On a paid provider tier the ceiling moves far above 100. The break point is set entirely by the (unread) provider plan.
- **Impact is bounded, not catastrophic:** AI is opt-in and non-core (local-first app works without it). A 429 storm degrades to "AI unavailable" (status passed through to clients), **not** data loss. That's why it's a CONDITIONAL gate, not a hard NO-GO — but at 100 concurrent AI calls it *will* fail on free tier.
- **Action:** confirm provider tier; add a short-window per-identity **and** global token-bucket throttle before the upstream fetch; make the budget read **fail closed** (or enforce the cap atomically in `add_ai_proxy_usage`).

### B4. Supavisor pool size is plan-gated and the public order path can spike independently of user count (VERIFIED real, timeout, tier-dependent) 🟡

- **Source:** BC-6 (verified `isReal=true`, severity kept **HIGH**, `dependsOnTier=true`).
- **Mechanism:** all DB access is PostgREST/Edge over Supavisor (no raw 5432 anywhere; verified via grep). "100 concurrent app requests" ≠ 100 Postgres connections — it's ~100 short pooled statements multiplexed onto a small backend pool. **Classic connection exhaustion is plan-gated, not architecture-gated.** `config.toml` pool values (`default_pool_size=20`, `max_client_conn=100`) are **local dev defaults** — prod size is **not in the repo**.
- **Why HIGH (not downgraded):** the load vector is the **always-on, unauthenticated** public order path (`place-order` does 4 sequential admin queries/order; `order-page` does 2 service-role SELECTs/view, uncached), which spikes **independently of the tiny authenticated-sync load**. Local-first does **not** mitigate this one.
- **Action:** read the prod compute/pool size in the Supabase dashboard; load-test the **order-page burst** target, not the (tiny) sync load.

---

## HIGH — real always-on ceilings, fix before a seller goes viral (not launch-blocking at 1,000)

| ID | Title | Verified severity | Why it still matters | Fix |
|---|---|---|---|---|
| **SCALE-C2** | `pullAll()` re-downloads the **full** seller dataset (no `updated_at` cursor) on every cold start **and** every foreground-active, NetInfo reconnect, and realtime re-subscribe | HIGH (was CRITICAL; egress math is tier+DAU-dependent) | Always-on seller path. A Raya seller (~4,500 orders ≈ 13.5 MB) re-downloads everything on every resume — multi-minute stall on EDGE + wasted mobile data. Correctness safe (`pullPaged` paginates fully). | Persist per-entity `lastSyncAt`; add `.gte('updated_at', iso)` to `pullPaged`; keep a force-refresh full pull on first sync per device (must not let an incremental pull look "complete" before a push). |
| **SCALE-C1** | Cold-start JS-thread block: 7 stores `Promise.all`-awaited before first paint; `onRehydrateStorage` synchronously walks transactions/editLog/goals on the JS thread | HIGH (was CRITICAL; data-loss chain **refuted**, see Dropped) | Perf/UX ceiling (white splash) at ~3,000 personal tx / ~4,500 seller orders. **Not** a crash and **not** data loss. | `partialize` heavy arrays (note: most stores **already** use partialize); migrate heavy arrays to `expo-sqlite` medium-term. (Ignore the `AndroidConfig.asyncStorageDBSize` "fix" — non-existent API in managed Expo.) |
| **BC-6** | Supavisor pool exhaustion on the public path | HIGH | See **B4** above. | See B4. |
| **BC-1 / EQ-3 / SCALE-H4** | New-order push fan-out: `net.http_post` **per device token** inside the order INSERT trigger | MEDIUM (was HIGH; bounded by per-seller FLOOD_LIMIT=10/min) | Always-on order_link path. Per-device loop instead of one batched Expo call; failure mode is push *latency*, not data loss (order is committed before the trigger). | Batch all tokens into one Expo push call (the pattern `qr-payment-webhook` already uses); or move fan-out to an async worker/queue so INSERT commits immediately. ~0.5 day. |

---

## MEDIUM — verified-but-overstated or unverified context (optimize opportunistically)

| ID | Title | Verified status | Note |
|---|---|---|---|
| **SCALE-H11 / BC-2** | `place-order` flood-cap query lacks composite `(seller_id, source, created_at)` index | MEDIUM (was HIGH) | Real missing index on an always-on public endpoint, but it is an **index scan** (seller_id index exists), **not** a sequential scan; bounded by a 10-min `created_at` window and the per-seller flood cap. 15-min migration. Felt-latency depends on compute tier. |
| **BC-3** | Thundering-herd resync: every seller fires `syncAll` (~20 statements) on foreground/reconnect | MEDIUM | Single-flight guard + Supavisor queuing absorb it; add 0–3 s jitter before foreground/online `syncAll` so N devices don't fire in one tick. |
| **EQ-2** | ai-proxy monthly budget check **fails open** on DB error | MEDIUM | Disables the only cost control exactly when load (and DB pressure) is highest. Fail closed or enforce atomically in the RPC. |
| **EQ-4 / EQ-5** | Public order-page reads uncached/unthrottled; Expo push single shared origin, no batching/backoff/token-pruning | MEDIUM (config-dependent) | A scraper/DoS (not 1,000 legit users) is the ceiling. Put CDN cache + per-IP rate limit in front of order-page; batch Expo + prune dead tokens; set `TURNSTILE_SECRET` (captcha currently soft-skipped). |
| **EQ-6** | `parse-statement` accepts ~14 MB base64 PDF inline to Gemini, long synchronous wait, no timeout | MEDIUM | 5/user/month bounds volume; lower size cap, add `AbortController`, fold into the same global AI throttle. |
| **SCALE-H9** | `pullAll()` post-merge `totalSold` recompute O(orders×items) | MEDIUM (was HIGH) | Gated by `ordersChanged`; ~sub-5 ms at cited volume, not 10–25 ms. Pure optimization. |
| **SCALE-M8 / M9** | Push-all-orders every sync (no dirty flag); personalStore rehydrate nested walk | MEDIUM (unverified) | Bandwidth/cold-start optimizations; not load-readiness blockers. |
| **EQ-7 / BC-5** | Fresh Supabase client per edge invocation; public functions no per-IP limit | MEDIUM (assumption/config) | Collapse `place-order`'s verify+insert into one SECURITY DEFINER RPC; confirm edge invocation quota for the plan. |

---

## DROPPED — claims an adversarial reviewer refuted (do **not** treat as blockers)

These were filed as CRITICAL/HIGH but verified `isReal=false` → **NOT_A_CEILING**. Keep them off the blocker list:

- **SCALE-C6 — "push tombstone reads silently mass-DELETE the overflow above 1,000 rows."** **Refuted.** The delete is bounded to the read result; truncated rows never enter the delete set, so truncation causes *under*-deletion (harmless self-healing server cruft), **the inverse** of the claimed mass-delete. *(Caveat: this refutation is about the **single-device** truncation path; it does not clear the separate **2-device** divergence hypothesis in B1.)*
- **SCALE-C1 catastrophe chain — "6.75 MB write fails → store wipes empty → tombstone mass-deletes 4,500 remote orders."** **Refuted.** Failed `setItem` leaves the prior blob intact (no wipe); empty store hits the `pushOrders` early-return; `syncAll` pulls-before-push. Only the **cold-start stall** survives (now SCALE-C1 HIGH above).
- **SCALE-C3 — "moneyChat ~400 ms block + $450/mo uncapped AI."** **Refuted.** Two caps exist (client `maxAiCallsPerMonth=100`, server `ai_proxy_usage` token+call quota); the ~400 ms is inflated ~50–100×.
- **SCALE-C4 — "unfiltered full-table `seller_orders` realtime broadcast."** **Refuted.** The subscription is **already** server-side row-filtered (`seller_id=eq.${profileId}`) — the proposed fix already ships. Residual 500-connection cap is pure plan tier.
- **SCALE-C5 — "RootNavigator re-mounts all 6 sub-mode stacks per toggle."** **Refuted.** Only the active mode's navigator mounts (conditional render + `lazy`/`freezeOnBlur`); O(1), data-independent.
- **SCALE-H12 — "ai-proxy `createClient` per request exhausts the 60-conn pool."** **Refuted.** Client objects aren't connections; calls are stateless PostgREST, not pooled Postgres. Hoisting changes zero connections.
- **SCALE-H10 — "device_tokens / payment_events bare `auth.uid()` RLS = 10× slower bulk."** **Refuted as a ceiling.** Insert path is service-role (bypasses RLS); client writes are single-row; payment path is dormant. Valid 30-min schema-consistency cleanup, **not** a scalability ceiling.

---

## TIER-DEPENDENT UNKNOWNS — the user MUST confirm these (a code audit cannot)

These are the gap between "CONDITIONAL-GO" and "GO". None are readable from the repo.

1. **Supabase plan / compute tier + Supavisor pool size** (`default_pool_size`, `max_client_conn`, max DB connections). Repo only has *local-dev* defaults (20/100). **This sets B4 / BC-6.**
2. **AI provider plan tier (Gemini + Anthropic) — RPM/TPM, not monthly.** Free Gemini ≈ 15 RPM → breaks below 100 concurrent AI calls. Paid tiers move it far above. **This sets B3 / EQ-1.**
3. **Supabase Realtime concurrent-connection cap** for the plan (one connection per active seller is already the minimum). Free ≈ 200, Pro ≈ 500.
4. **Edge Function invocation + concurrency quota** for the plan (first thing to exhaust under a public-link traffic spike).
5. **`pg_net` worker throughput / batch config** (`pg_net.batch_size`, ttl) — sets the true saturation point for the order-push fan-out (SCALE-H4 / BC-1). Not in repo.
6. **Supabase egress quota** (e.g. Pro 250 GB/mo) vs. actual seller DAU — sets whether SCALE-C2's full-redownload is a cost problem (depends on real DAU, also unknown).

---

## LOAD-TEST PLAN — the only thing that actually proves the answer

A code audit located the suspects; it **cannot** measure pool saturation, provider RPM, p95 under burst, or the multi-device race. Run this against a **staging project on the same plan tier as prod** before scaling marketing.

**Tooling:** [k6](https://k6.io) for HTTP scenarios (place-order, order-page, ai-proxy) — scriptable ramps, per-scenario thresholds, built-in p95/error-rate. Supplement with a small **Node/Detox or two-emulator harness** for the seller multi-device sync race (k6 can't drive the Zustand client). Watch the **Supabase dashboard → Database → Connections / Pooler** and **Edge Functions → invocations/errors** live during each run.

### Scenario 1 — Concurrent seller sync (authenticated, always-on)
- **Drive:** 50 → 100 → 200 virtual sellers each running a full `syncAll` (`pullAll` + 9 push fns ≈ 20 statements) within a 1–2 s window (simulates morning app-open / mass NetInfo recovery).
- **Watch:** active DB connections **vs. pool cap**, Supavisor client-connection queue depth, p95 statement latency, PostgREST 5xx/timeout rate.
- **Pass/fail:** **PASS** if active connections stay < 80% of pool cap, p95 < 1.5 s, error rate < 0.5%. **FAIL** if connection queueing appears or any sync returns 5xx. (Add 0–3 s jitter and re-run if it fails — that's BC-3's fix.)

### Scenario 2 — Concurrent public order-page hits + place-order (unauthenticated, the real spike vector)
- **Drive:** ramp anonymous GET `order-page` for one popular slug to **200 → 500 → 1,000 req/min**; in parallel, POST `place-order` to a single shop at **5 → 20 req/s** (note the per-seller flood cap 429s past 10/min — confirm the 429 is clean, not a 5xx).
- **Watch:** order-page p95, DB read load + the flood-cap query plan (confirm index scan after adding the SCALE-H11 composite index), Edge invocation errors, egress.
- **Pass/fail:** **PASS** if order-page p95 < 800 ms at 1,000 req/min and place-order returns clean 200/429 (never 5xx, never a duplicate row). **FAIL** on any 5xx, on flood-cap query CPU spike, or on a duplicate `order_link` row (that's B2).

### Scenario 3 — ai-proxy + parse-statement burst (shared global quota)
- **Drive:** 15 → 30 → 60 → 100 concurrent `ai-proxy` calls (mixed Gemini/Anthropic) from distinct identities; separately, 5 concurrent large-PDF `parse-statement` calls.
- **Watch:** upstream 429 rate, ai-proxy invocation latency + whether the **budget check fails open** under DB pressure (inject DB load and confirm), edge wall-clock timeouts on parse-statement.
- **Pass/fail:** **PASS** if the system **gracefully** surfaces 429 to clients (no 5xx, no unbounded provider billing) and the budget cap still enforces under load. **FAIL** if calls bypass the cap (fail-open under pressure) or parse-statement times out the isolate. *Expect free-tier Gemini to FAIL above ~15 RPM — that result confirms B3 and tells the user they need a paid tier.*

### Scenario 4 — Seller multi-device data-integrity race (THE blocker test — correctness, not load)
- **Drive:** two clients (emulators/devices) signed into **one** seller account. Device A creates orders 1–10 offline; Device B creates orders 11–20 offline; bring both online within the same few seconds. Then: Device A edits order #5's payment status while Device B is mid-sync. Then: reinstall Device A, interrupt its `pullAll` before completion, let it push.
- **Watch:** final remote row count + per-order field values vs. expected union; any row that exists on one device but got `DELETE`d by the other's push; whether order #5's status edit propagated to Device B.
- **Pass/fail:** **PASS** only if the final state is the **union** of both devices' writes with the latest edit winning, and **zero rows deleted that a device legitimately held**. **FAIL** (and B1 is confirmed) if any device's orders are wiped by the other's tombstone push, or if the status edit never propagates. **Run a buyer-double-submit sub-case:** POST place-order twice with the same payload + a dropped first response → **PASS** only if exactly one order row results (proves/refutes B2).

> **Why a code audit can't replace this:** Scenarios 1–3 measure *plan-tier* constraints (pool size, provider RPM, edge quota) that are **not in the repo** — only the live dashboard reveals them. Scenario 4 measures a **timing race** between two clients and a tombstone-delete that no static read can resolve; the verified reviewers explicitly refuted the *single-device* version but never tested the *two-device* version. The verdict on data loss is **literally undecidable from code** — Scenario 4 is the deciding test.

---

## Bottom line

**CONDITIONAL-GO.** Ship to 1,000 users **only after**: (1) running Scenario 4 and fixing B1/B2 if it fails (it likely will — drive deletes off local tombstones, add an idempotency key); (2) confirming the Supabase compute/pool tier (B4) and the AI provider RPM tier (B3) and running Scenarios 1–3 against them. The server won't crash and won't run out of connections at this scale — the binding constraints are **shared AI provider RPM on a free tier** and an **unverified seller multi-device data-loss path**, neither of which 1,000 users in a local-first app will hit by sheer volume, but both of which a single seller's second device or one buyer's double-tap can trigger on day one.
