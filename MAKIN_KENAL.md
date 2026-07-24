# MAKIN KENAL — how Potraces wins

> **The one-line bet:** Potraces is *the Malaysian money app that learns **you**.* Every correction you make trains one visible, portable brain — so the longer you use it, the more you'd throw away by leaving.
>
> **The hook (store page + onboarding):** *makin lama, makin kenal you.*

Grounded strategy, 2026-07-24. Built from the real codebase + live App Store / web ground-truth on the current competitors. No hype — every claim below traces to a real Potraces asset or a real competitor gap. This file is the single source for the flagship direction **and** the concrete near-term roadmap.

---

## 1. Why now — the field just commoditized every single-feature wedge

Mid-2026 killed "have a cool feature" as a moat. In one season:

- **Finny** took *"AI capture without bank-linking"* — globally, at $1.99.
- **RinggitWise** took *"Malaysian + BM AI coaching."*
- **Belanje** took *"two books / spend-and-sell"* — and ships **daily**.
- **Money2Time** proved a single signature hook (*"every expense in HOURS of your life"*) + a privacy promise drives installs.

So a feature is no longer a moat — anyone clones one in a quarter. **The one edge left is per-user *accumulation*,** and Potraces already shipped the plumbing for it: the learning notebook. The window to plant the "compounding relationship" flag is open right now, because a rival can't backfill it — it's accumulated user data, not code.

---

## 2. The honest map — who already took what

| App | Their strength | Their gap | Potraces' edge |
|---|---|---|---|
| **Belanje** (MY) | Personal/Business toggle live today, ships daily, 5.0★ | Two **cold** ledgers that never talk; speaks Net Profit / Revenue / Margin; a spreadsheet-with-a-toggle. No AI, no learning, no social, no capture. | **One warm Echo** reading *both* books to answer "can I afford my life this month," + the *"you kept RMx"* number Belanje can't say without abandoning its accounting voice |
| **Finny** (global) | AI + receipt capture, no bank-link, offline, $1.99 | Generic/global, English-only, an **input tool** — categorises model-globally, never compounds *your* corrections; no BM, no two-books, no social | The notebook plays back **your** authored rules; Echo speaks casual BM; reads both books — capture that gets *personal* |
| **RinggitWise** (MY) | Malaysian, AI coaching EN+BM, 24 local categories | **Coaches in the abstract** — no learning notebook, no two-books, no social loop, no capture primitives | Conversational **logging** (not lectures) + a visible compounding brain + DuitNow-screenshot capture |
| **Money2Time** (MY) | Owns a memorable hook ("in hours"), privacy-first, 4.9★ | A single behavioral **framing**, not a relationship. Not AI, not BM, not social, not two-books | Steal the *lesson* not the feature — our own hook backed by a real compounding assistant |
| **Cleo / Copilot** (global) | Polished AI chat, gig-income heatmaps | US/UK, English, bank-link-dependent (barely works for MY), read-only, "probabilistic language" burden | *"Sebab you ajar"* provenance replaces hedged guesses with the user's own rule — only possible with our per-user history |

**Dead wedges — do not fight here:** "we're also Malaysian" (RinggitWise owns it) and "we also have a business mode" (Belanje owns it). Win only on the **intersection + the compounding notebook** no one else has.

---

## 3. The moats (ranked by how hard they are to copy)

1. **The Learning Notebook — a per-user compounding brain.** Four count-weighted tables (category / person-alias / wallet / type-correction), capped at 100 with lowest-count eviction, trusted only at count≥2 so one accident can't poison it. Written from ~10 correction sites, read *before* built-in guesses in every capture path, injected into Echo's prompt via `getPromptHints()`, cloud-synced so it follows the user across devices. → [learningStore.ts](src/store/learningStore.ts). **Why uncopyable:** it's accumulated *data*, not a feature. A rival ships the same UI tomorrow and every user starts at zero; a 6-month Potraces user has 120+ authored rules that can't be exported to a competitor. The only asset here that's worth *more* the longer you stay.
2. **One warm Echo over BOTH books.** The business→personal settlement bridge already exists ([transferBridge.ts](src/services/transferBridge.ts), `getTotalTransferredToPersonal`), so one AI can answer the question no rival can: *"how much did my hustle actually pay me, and can I afford my life this month?"* Belanje has a toggle but two ledgers that never talk; Finny/RinggitWise have only the personal book.
3. **Server-metered Echo grounded in Malaysian money literacy.** Every AI call routes through [ai-proxy](src/services/aiProxy.ts) (keys server-only, per-tier metering); the confirmation-chip model means **Echo can never write** — every entry is a chip the owner taps. Grounded in curated MY knowledge (PTPTN, EPF, RON95, zakat, Belanjawanku) with a "never invent figures" guard. This is real engineering, not a Gemini wrapper.
4. **Collectz — a social acquisition loop.** Group-collection with a public web join page puts Potraces in front of non-users person-to-person, pulled in by a friend collecting money, not an ad. **None** of the four competitors has a distribution graph.

---

## 4. The flagship — *Echo's Notebook*

**Make the invisible compounding moat visible, felt, and cited.**

A read-only *"what Echo knows about you"* screen that renders the already-formatted learned patterns in plain BM/EN with a live counter:

> **Echo dah belajar 47 benda pasal you**
> `"grab" → Pengangkutan` · `Kak Long = Siti` · `makan biasa you bayar guna TnG`

Tap any row to fix or forget it. Backed by two enablers:

1. **Feed the richest correction site.** Wire the receipt category-edit into `learnCategory` so users literally watch a new row appear after a scan.
2. **Let Echo cite the rule.** *"Filed bawah Makan — sebab you betulkan 'mamak' 4× before."* A hedged guess becomes the user's own authored fact.

**Why this is the bet:** it's the single move that converts accumulated corrections into something a user would visibly **lose** by leaving — the moat made tangible. It's cheap (the strings already exist in `getPromptHints()`; the screen is a thin render). None of Finny / Belanje / RinggitWise / Cleo has any "here's what I learned about you" artifact — nothing to lose by uninstalling them. And it finally gives Potraces the **signature hook** it lacks (the Money2Time lesson): *makin lama, makin kenal you.*

---

## 5. The two ways this loses — read this twice

The strategy above is a **retention/depth** play, and its honest weaknesses are both about the *start*:

- **RISK 1 — FOCUS.** A solo, maintenance-averse founder is spread across ~5 surfaces (personal, seller, Echo, capture, Collectz) while each rival nails ONE thing and ships fast (Belanje: daily). **If Potraces keeps adding surfaces instead of deepening the notebook, it loses on every axis.** The flagship is chosen precisely because it adds *no* new surface — it renders data that already exists. The **Do-Not list (§7) is the strategy** as much as the moves are.
- **RISK 2 — COLD START (the sharpest one).** Every moat here is **back-loaded and invisible** at the exact moment you win or lose a user. A brand-new user has an *empty* notebook — on day one Potraces looks like a slower Finny ($1.99, instant utility) or Belanje (ships daily). Nothing in the depth story wins the first session. **Two fixes, both mandatory:**
  - **Seed a week-one win.** The visible counter + receipt-feed must land early — a new user must *watch a row appear after their first scan*, so compounding is felt in week one, not month six.
  - **Pair acquisition with retention.** The panel over-indexed on depth and nearly ignored the one thing that brings *new* users. **Collectz's public join page must be a funnel into Echo** (§6). A deeper, better-retained app that nobody installs still loses to a shallower app that ships daily and gets discovered.

---

## 6. Supporting moves

- **`Kept, not Profit` — one warm signature number** *(S)*. Surface a single number across both ledgers: *"you kept RM1,820 this month"* (hustle take-home settled in, minus personal spend). Reuses existing `kept/youKept` i18n. **This is the install hook** — uncopyable by Belanje, which is locked into Net Profit/Margin.
- **Take-Home Truth — both-books answer in personal Echo** *(M)*. Inject a **narrow** summary (transferred-this-month + unpaid-order total) into personal-scope Echo so it can answer affordability across both books cheaply. Do **not** drop the business-scope gate at [moneyChat.ts](src/services/moneyChat.ts) (that floods the token budget).
- **Collectz join-page → soft install nudge** *(S)* **— the acquisition move.** After a non-user pays their share on the public join page, a light *"track your own money"* entry point. Reuses a surface where strangers already land — no new engine.
- **One opt-in monthly check-in** *(M, trimmed)*. A single opt-in message citing one learned fact + one ringgit figure from the user's *own* history: *"Hujung bulan — Astro (RM60) biasa keluar dari Maybank, dah bayar?"* The data is the moat; delivery stays minimal. **No scheduler, no nudge engine.**

---

## 7. Do NOT build (the refusals that keep a solo founder alive)

- **A second "insights AI" / separate ML model / per-surface learning.** One 100-slot table already serves chat, notes, receipts, quick-log and auto-log. A second brain is the maintenance trap that kills a solo founder. **Deepen the one table, never fork it.**
- **A nudge/scheduling engine.** Timing/permission/frequency tuning is endless ops and generic "smart notifications" are the AI-slop every finance app ships. Cap at ONE opt-in monthly check-in. No scheduler.
- **Auto-routing DuitNow screenshots to the "right" book.** Failure mode = money in the *wrong* book — a trust failure worse than a wrong category. Keep capture landing in one place with a manual book toggle.
- **Competing on "we're also Malaysian" or "we also have business mode."** Dead wedges (RinggitWise / Belanje own them). Win on the intersection.
- **Net Profit / Revenue / Cost / Margin vocabulary.** That's Belanje's cold register. Our warmth — *"you kept RM1,820"*, finance-for-the-intimidated — is the uncopyable positioning. The moment the copy goes cold, the differentiation is gone.
- **Bank-linking / auto-log-from-card as the headline.** Barely works for MY banks; Finny already proved capture-without-linking. Invest in DuitNow-screenshot share-to-log + receipt OCR — the SEA-native edge — not fragile aggregator plumbing.

---

## 8. Near-term roadmap — the concrete proof (start here)

These are the small, grounded, zero-new-maintenance steps that make the flagship real. Ordered.

1. **Receipts → `learnCategory`** *(S, one line)*. The app's **richest correction site teaches nothing today** — `learn*` appears in ~10 files; the receipt scanner is not one of them. Fix "MR D.I.Y." from Shopping → Barang Rumah twice and every future MR DIY receipt auto-files, and it feeds card auto-log + Echo chat for free (both read `getSuggestedCategory`). → [ReceiptScanner.tsx](src/screens/shared/ReceiptScanner.tsx).
2. **Chat category-edits teach too** *(S, likely one line)*. Confirm the `edit_transaction` path writes `learnCategory(newDescription, newCategory)` — today the edit correction is silently lost. → [chatActions.ts](src/services/chatActions.ts).
3. **Ship the *Echo's Notebook* screen** *(S)*. A read-only render of the learned-pattern strings + a live counter. **Caveat:** the counter must sum the *full* tables, not the capped `getPromptHints()` slice (it caps at 10/10/5/10 and would undercount what Echo actually knows).
4. **`Sebab you ajar` provenance** *(M)*. `getSuggestedCategory/Wallet` pick the highest-count match but discard the winning keyword+count — change the return shape to carry them, thread into the confirmation chip so the auto-fill states its reason.
5. **`Kept, not Profit` number + Collectz join-page nudge** — the hook and the acquisition funnel, once the notebook is visibly compounding.

**Skipped deliberately** (from the design pass): receipt→wallet learning (the store can't update a learned wallet — first one sticks forever), receipt→MyTax relief (needs a whole new store dimension for a once-a-year niche), and reinforcing person-aliases (no count threshold, so it changes nothing).

---

## 9. Where Potraces is in ~12 months

Known in Malaysia as *"the money app that learns you."* A 6-month user opens Echo's Notebook and sees 120+ things it learned — merchant→category rules, who "Kak Long" is, which wallet pays Astro — every scan and correction visibly adding to the pile, synced across their phones. They ask *"boleh ke aku afford makan luar minggu ni,"* and one Echo reads their hustle take-home **and** personal spend and answers in casual BM, citing their own rules (*"sebab you betulkan mamak 4×"*). Collectz keeps funnelling new users in person-to-person, and the join page turns payers into trackers. The store page says *makin lama, makin kenal you — you kept RM1,820 this month.*

**Critically: no new AI surface was built all year.** The same 100-slot table just got deeper per user — the moat widened while maintenance stayed flat. Finny, RinggitWise and Belanje each still nail their one thing, but none can play back a year of a brain that knows you.
