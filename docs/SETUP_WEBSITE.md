# Potraces website — founder setup checklist

The marketing site + beta feedback page live in `docs/` and are served by Vercel at
**jejakbaki.my** (`vercel.json` → `outputDirectory: "docs"`, no framework).

| File | Served at | Purpose |
|---|---|---|
| `docs/index.html` | `/` | Marketing site (root) |
| `docs/beta.html` | `/beta.html` | Account-gated beta feedback page |
| `docs/order.html` | `/?slug=…` (via rewrite) | Existing seller order page — **do not touch** |
| `docs/privacy.html` | `/privacy.html` | Privacy policy (linked in footers) |
| `docs/beta_feedback.sql` | (not served) | Supabase DDL for the beta backend |

> **Do not deploy until `jejakbaki.my` SSL is confirmed valid** (green padlock, no cert
> warnings). The OAuth redirect + magic links all use the `https://jejakbaki.my` origin,
> so a broken cert breaks sign-in.

---

## A. Supabase steps (project `iydqeeonaljqapulboaz`)

1. **Apply the SQL.** Dashboard → SQL Editor → paste all of `docs/beta_feedback.sql` → **Run**.
   It is idempotent (create-if-not-exists / drop-policy-if-exists), so re-running is safe.
   Optionally also commit it as `supabase/migrations/20260616120000_beta_feedback.sql`.
   - This creates the `beta_feedback` table, its RLS policies, **and** the private
     `beta-screenshots` storage bucket + its policies in one run.

2. **Verify table + RLS.** Table editor → `beta_feedback` exists. Authentication → Policies
   shows `beta_feedback_insert_own` and `beta_feedback_select_own`, both scoped to
   `authenticated` with `auth.uid() = user_id`. `anon` has **no** grants.

3. **Verify bucket.** Storage → `beta-screenshots` exists and is **Private** (not public).
   Storage policies show `beta_screenshots_owner_insert` and `beta_screenshots_owner_read`,
   scoped to `authenticated` with the `(storage.foldername(name))[1] = auth.uid()` check.

4. **Enable Google provider.** Authentication → Providers → Google → **Enable**. Paste the
   Web OAuth **Client ID + Secret** from the existing **"Potraces"** GCP project
   (owner acct `jejakbaki.app@gmail.com`). Then in Google Cloud Console → Credentials →
   that Web OAuth client, add the **Authorized redirect URI**:
   ```
   https://iydqeeonaljqapulboaz.supabase.co/auth/v1/callback
   ```
   (This is the Supabase callback — **not** the page URL.)

5. **Enable Email magic link.** Authentication → Providers → Email — ensure Email is enabled
   (magic link works out of the box, no SMS/Twilio). The default Supabase SMTP is
   rate-limited; wire a production SMTP before real beta volume.

6. **Set Site URL + redirect URLs.** Authentication → URL Configuration:
   - **Site URL:** `https://jejakbaki.my`
   - **Additional Redirect URLs** (one per line — must EXACTLY match `beta.html`):
     ```
     https://jejakbaki.my/beta.html
     http://localhost:3000/beta.html
     http://127.0.0.1:3000/beta.html
     http://localhost:5173/beta.html
     ```

7. **Smoke test (local).** Serve the folder and test both sign-in paths:
   ```
   npx serve docs -l 3000
   # open http://localhost:3000/beta.html
   ```
   - Sign in with **Google** AND with an **email magic link**.
   - Submit feedback **with** and **without** a screenshot.
   - Confirm the row lands in `beta_feedback` with the correct `user_id`.
   - Confirm a **second** account cannot SELECT the first account's rows (RLS).

8. **Founder triage.** Read/triage in Dashboard → Table editor (service_role bypasses RLS).
   Flip `status` `new → triaged/fixed/done` as you process. View private screenshots in the
   Storage browser, or mint a signed URL:
   `storage.from('beta-screenshots').createSignedUrl(path, 3600)`.

> The public anon key is already embedded client-side in `docs/order.html` and reused in
> `docs/beta.html`. It is public + RLS-protected. **Never** put the `service_role` key in any
> file under `docs/`.

---

## B. Vercel routing (for whoever owns `vercel.json` — parent task)

`beta.html` is a normal static file, so `/beta.html` works with no config. The only routing
rule needed is so the **existing seller order page** keeps working at `/?slug=…`:

- `docs/index.html` = marketing site (root `/`).
- `docs/beta.html` = beta feedback (`/beta.html`).
- Add a **rewrite** so a request to `/` **with a `slug` query param** serves `order.html`,
  while a bare `/` still serves the marketing `index.html`. Example:
  ```jsonc
  {
    "outputDirectory": "docs",
    "rewrites": [
      { "source": "/", "has": [{ "type": "query", "key": "slug" }], "destination": "/order.html" }
    ]
  }
  ```
- Do **not** edit `order.html` — its CSP (`default-src 'none'`) is intentional for that page.
  `beta.html` carries its own, looser CSP that allows the esm.sh module CDN + Supabase +
  Google (the order page's CSP would block esm.sh).

---

## C. Pre-launch placeholders to fill

1. **Store URLs.** The app is not yet on the App Store / Google Play. The badges in
   `index.html` render in a **"Coming soon / Beta"** state and link to `/beta.html`. When the
   listings go live, replace `href="/beta.html"` on the badge links with the real store URLs
   (and swap the recreated SVG badges for the official downloaded artwork — see the HTML
   comment at the top of `index.html`).

2. **Screenshots.** No screenshot PNGs exist yet — the phone screens are CSS mockups using
   exact CALM colors. Drop real PNGs into `docs/assets/` and replace the `.phone-screen` /
   `.mock-card` contents (keep `loading="lazy" decoding="async"` + explicit width/height on
   raster images to avoid layout shift). Same applies to the optional OG card (`1200×630`).

---

## D. Final reminder

- [ ] SQL applied + RLS/bucket verified
- [ ] Google provider enabled + redirect URI added in GCP
- [ ] Email magic link enabled
- [ ] Site URL + redirect URLs set
- [ ] Local smoke test passed (Google + magic link, with/without screenshot, RLS isolation)
- [ ] Vercel rewrite for `/?slug=` added (parent)
- [ ] Store URLs + real screenshots filled
- [ ] **`jejakbaki.my` SSL valid — only then deploy**
