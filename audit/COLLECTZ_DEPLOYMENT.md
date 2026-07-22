# Collectz — deployment checklist (2026-07-23)

Everything below is uncommitted. Nothing from this session is deployed yet
**except** migration `20260723010000` (contact columns), which is already on prod
per `npx supabase migration list`. Deploy in this exact order.

---

## 0. Current state (verified)

- `npx supabase migration list` — all migrations match remote **except**:
  - `20260723020000_collectz_server_hardening.sql` — **NOT on prod**
  - `20260723030000_collectz_removed_notify_throttle.sql` — **NOT on prod**
  - (`20260723010000_collectz_contact.sql` IS already applied remotely — `socials`
    / `group_url` columns exist on prod. The file is still untracked in git; commit it.)
- Edge functions changed locally, none deployed: `collectz-join` (organizer-contact
  view fields + team actions + session_full + brute-force brake), `collectz-notify`
  (last_notified_at / removed_notified_at cooldowns), `collectz-remind`.
- `supabase/config.toml` — **unchanged** (no diff). All three functions registered
  with `verify_jwt = false` (self-authz inside each function). Nothing to update.
- Site: `site/collectz.html` changed (plus the broader SEGAR v6 site redesign files).
- App: all Collectz changes are pure TS under `src/` — OTA-able, no native rebuild.
- No new env vars / secrets (functions use only `SUPABASE_URL` +
  `SUPABASE_SERVICE_ROLE_KEY`, both platform-provided).

---

## 1. DB migrations — push FIRST

The new `collectz-join` reads/writes `collectz_view_attempts`; the new
`collectz-notify` updates `last_notified_at` / `removed_notified_at`. Those objects
come from the two unpushed migrations, so the DB must lead the functions.

**SQL safety review (both files):**

| Migration | Ops | Verdict |
|---|---|---|
| `20260723020000_collectz_server_hardening.sql` | `add column if not exists`, `create table if not exists`, `create index if not exists`, `enable row level security`, `CREATE OR REPLACE FUNCTION` ×2, `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`, `drop policy if exists` + `create policy` (same name it drops) | **Safe.** Fully idempotent, additive only, no data-destructive ops. Depends on `collectz_is_session_owner`, `device_tokens`, `net.http_post` — all already on prod (20260721000000 / 20260722010000). |
| `20260723030000_collectz_removed_notify_throttle.sql` | single `add column if not exists` | **Safe.** Idempotent, additive. |

**Command:**

```
npx supabase db push
```

(Only the two migrations above will apply — verified via `migration list`.)

**Verify:** `npx supabase migration list` → no rows with empty `remote`.

**Rollback:** additive-only, so a broken push is rolled back with:
```sql
drop table if exists public.collectz_view_attempts;
alter table public.collectz_sessions drop column if exists last_notified_at;
alter table public.collectz_participants drop column if exists removed_notified_at;
```
and re-running the 20260721000000/20260722010000 bodies of
`collectz_participant_guard` / `notify_collectz_status` / the proofs delete policy.
Column drops lose only throttle timestamps — harmless.

---

## 2. Edge functions — deploy SECOND (after db push)

All three changed; **none deployed**. Prod `collectz-join` currently returns neither
the organizer-contact fields (`socials`, `group_url`) nor today's fixes (team
actions, `session_full`, `reject_note` in view, brute-force brake).

```
npx supabase functions deploy collectz-join
npx supabase functions deploy collectz-notify
npx supabase functions deploy collectz-remind
```

(No `--no-verify-jwt` flag needed — `verify_jwt = false` comes from `config.toml`.)

**Verify:** `curl` a known share_code against
`https://jngmanwvhbpkpkeklfiv.supabase.co/functions/v1/collectz-join`
(action `view`) and confirm the response now carries `socials`, `group_url`,
`max_participants`, `team_*`, and per-participant `team_idx` / `reject_note`.

**Rollback:** `git stash` (or checkout the committed file) →
`npx supabase functions deploy <name>` redeploys the previous version. The old
functions run fine against the migrated DB (extra columns/table are ignored), so
rolling back a function does NOT require rolling back the DB.

---

## 3. Site — deploys automatically on `git push` (do this LAST)

**How the site ships:** Vercel Git integration — auto-deploys on push, static,
no build (`vercel.json` → `outputDirectory: "site"`, `/collectz/:path*` rewrite →
`/collectz.html`; README "Auto-deploys to Vercel on push"). There is no site step
in `.github/workflows/ci.yml` (typecheck+tests only) and no manual deploy script.

**Ordering constraint — verified both ways:**
- `site/collectz.html` guards every new field
  (`session.group_url && /^https:\/\/chat\.whatsapp\.com\//…`,
  `session.socials && session.socials[k]`,
  `p.status === 'rejected' && p.reject_note`), so it **degrades gracefully**
  against the old function — contact chips / reject notes simply don't render.
- Still deploy **function before site** (steps 1–2 before `git push`): the site
  deploy is coupled to the push, and pushing first would also ship the page with
  zero benefit while the function lags.

**Command:** commit + `git push` (main). That single push ships **every**
uncommitted site file (index.html, site.css, tokens.css, admin/beta/privacy/terms,
new `site/assets/screens/` …) — the SEGAR v6 redesign rides along. If that isn't
wanted yet, commit the site files separately and hold that commit back.

**Rollback:** Vercel dashboard → Deployments → promote the previous deployment
(instant), or `git revert` + push.

---

## 4. App (OTA vs native)

- All Collectz app changes are TS/TSX under `src/` (+ new `src/constants/flags.ts`,
  `assets/e-wallet/mae-logo.png`). `package.json` untouched — **no new native
  modules → OTA-able via EAS Update.** No native rebuild implied.
- Publish OTA **after** step 2 — the app calls the new `set_team` /
  `set_team_name` actions and reads the new view fields.
- **Do NOT ship:** `android/app/src/main/AndroidManifest.xml` and
  `android/app/src/main/res/values/strings.xml` show as modified but the diff is
  **line-endings only** (CRLF noise from earlier unrelated work — `git diff --stat`
  on them is empty). Leave them out of the commit
  (`git checkout -- android/app/src/main/AndroidManifest.xml android/app/src/main/res/values/strings.xml`
  is safe) so a stray native change can't ride along.

---

## 5. Env vars / secrets

**None needed.** The changed functions read only `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`, which Supabase injects automatically. No new client
env keys; `.env.example` diff carries nothing Collectz-related that requires a
secret. Confirmed.

---

## Ship order (TL;DR)

1. `npx supabase db push`  (applies 20260723020000 + 20260723030000; both idempotent/additive)
2. `npx supabase functions deploy collectz-join`
3. `npx supabase functions deploy collectz-notify`
4. `npx supabase functions deploy collectz-remind`
5. Commit (exclude the two CRLF-only android files) + `git push` → Vercel auto-deploys the site
6. EAS Update (OTA) for the app — no native rebuild
