# Website screenshot shot-list (log-it playbook)

5 phone mockups on the site are **CSS fakes**. You capture the real screens; I do the HTML swap + fix the alt text.

**You don't need exact numbers.** The visible captions are generic (no figures), so they stay.
The only text with specifics is the hidden `alt`/`aria` line — **I rewrite that to match your real shot.**
So: log realistic data → screenshot → tell me the actual numbers → I sync the text.

**Shoot rules (all 5):** same phone · portrait · full screen · **light mode** (mocks use the light CALM olive palette). Drop into a new folder `site/assets/screens/`, named exactly as below.

---

## 1 — `dashboard.png`
**Screen:** Personal **Dashboard**
**Caption (stays):** *"Dashboard — what's kept, front and centre."*
**Log, one by one:**
1. A few **income** entries this month (e.g. a couple of kuih/food orders) — enough that "kept this month" is a healthy **positive** number.
2. A few **expenses** spread across the **last 7 days** (so the week-bar chart isn't empty).
3. Make these the **3 most recent** so they sit on top of "Recent":
   - Kuih order **+RM 45** (income · TNG)
   - Petrol **−RM 30** (Transport · bank)
   - Nasi lemak **−RM 8** (Food · cash)
→ Whatever the totals land at, send them and I'll match the alt text.

## 2 — `quick-log.png`
**Screen:** **Quick Log** (the parse result)
**Caption (stays):** *"Log it fast — type one line, we sort it."*
**Log:**
1. Open Quick Log, type one natural line — e.g. **`order kuih rm45`**.
2. Screenshot the parsed screen (Amount / Type / Wallet rows filled in).
→ Tell me the exact line you typed; I match the alt.

## 3 — `echo-chat.png`
**Screen:** **Echo** (AI chat)
**Caption (stays):** *"Ask Echo — straight answers from your own numbers."*
**Log:**
1. Ask a money question, e.g. **"berapa aku belanja makan bulan ni?"**
2. Ask a short follow-up, e.g. **"boleh ke aku belanja RM 100 weekend ni?"**
3. Screenshot with **both** questions + answers visible and the input bar showing.
→ Send Echo's actual replies; I match the alt.

## 4 — `budget.png`
**Screen:** **Budget** (soft budgets)
**Caption (stays):** *"Soft budgets — 'getting close', never scolding."*
**Log:**
1. Set a **weekly** budget with spend well under it → shows the calm "comfortable / to spare" state.
2. Set a **Transport** budget with spend **near the limit** → shows the "getting close" state.
   (The two states side by side are the whole point of this shot.)
→ Numbers flexible; send them and I match the alt.

## 5 — `seller.png`
**Screen:** **Seller mode** (POS + DuitNow QR)
**Caption (stays):** *"Seller mode — take orders, get paid by DuitNow QR."*
**Log:**
1. Switch to seller/business mode, add **2 menu items** (e.g. Kuih lapis RM4, Brownies RM12).
2. Build an order with both, open the **DuitNow QR** screen (exact amount, e.g. RM16).
3. Screenshot the tiles + QR.
→ Send the items/amount; I match the alt.

---

### After you send the 5 PNGs
I replace each mock with `<img class="shot" src="/assets/screens/<name>.png" alt="…">` (the `SHOT SLOT` comment is already above every slot) and rewrite the alt/aria to your real numbers. No layout work on your end.

### Your existing `Website image phone/` folder
Homepage, Wallet, Bills, Debt, Goals — only **Homepage ≈ dashboard**. No site slots use Wallet/Bills/Debt/Goals. The 4 genuinely missing: **quick-log, echo-chat, budget, seller**.
