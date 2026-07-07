# Potraces Quick Log — Back Tap Shortcut

Log an expense by double-tapping the back of the iPhone — without opening the
app. The Shortcut collects amount/category/payment/note with native prompts,
POSTs to the `quick-log` edge function (authenticated by the user's Quick-Log
key), and the app materializes the entry on next open.

## User setup (what the in-app Quick Log screen walks through)

1. In Potraces: Settings → **Quick Log (Back Tap)** → **Generate my key** →
   **Copy key**. (Requires Cloud Backup — the screen gates on it.)
2. Tap **Get the Shortcut** — Safari downloads the signed file; open the
   download and tap **Add Shortcut**.
3. Run it once — the copied key appears **pre-filled** (read from the
   clipboard); just tap Done. It's saved to iCloud Drive/Shortcuts as
   `potraces-key.txt` and never asked again.
4. iOS Settings → Accessibility → Touch → **Back Tap** → **Double Tap** →
   choose **Potraces Quick Log**.

Offline note: if the POST fails there's no retry in v1 — the entry is not
logged (the notification shows the error instead of `"ok":true`).

## Maintainer pipeline (no iPhone needed)

The Shortcut is **generated from source**, signed on a Mac, and hosted on the
public `web` storage bucket — so it can be updated in place at a stable URL
(unlike iCloud share links, which mint a new URL on every re-share).

```bash
python3 scripts/build-quick-log-shortcut.py     # source of truth → unsigned plist
plutil -lint shortcut/PotracesQuickLog-unsigned.shortcut
shortcuts sign --mode anyone \
  -i shortcut/PotracesQuickLog-unsigned.shortcut \
  -o "shortcut/Potraces Quick Log.shortcut"
npx supabase storage cp "shortcut/Potraces Quick Log.shortcut" \
  ss:///web/PotracesQuickLog.shortcut --experimental \
  --content-type application/x-apple-shortcut
```

Public URL (wired into `QuickLogSetup.tsx` as `SHORTCUT_URL`):

```
https://iydqeeonaljqapulboaz.supabase.co/storage/v1/object/public/web/PotracesQuickLog.shortcut?download=Potraces%20Quick%20Log.shortcut
```

Gotchas learned the hard way:
- `shortcuts sign` routes on the input **file extension** — it must be
  `.shortcut` or `.wflow`; a `.plist` extension fails with "isn't in the
  correct format" regardless of contents.
- The `web` bucket has a MIME allowlist (SEC-H4);
  `application/x-apple-shortcut` was added for this file
  (migration `20260708000000_web_bucket_shortcut_mime.sql`).
- Shortcuts attachment ranges are UTF-16 offsets; the builder handles this.
- **Updating in place:** `storage cp` refuses to overwrite (409) and
  `storage rm` is silently broken in supabase CLI 2.109 (`deleted: []`).
  Working update dance:
  `storage mv ss:///web/PotracesQuickLog.shortcut ss:///web/PotracesQuickLog-old.shortcut`
  then `storage cp` the new file. Stale `-old` objects accumulate — clear
  them from the dashboard occasionally.
- Users who already added the Shortcut do NOT auto-update — they must
  re-download and re-add (their saved `potraces-key.txt` survives, so the
  key is not re-asked).

## What the Shortcut does (actions, in order)

1. **Get File** `potraces-key.txt` (Shortcuts folder, no picker, no error).
2. **If** it has no value (first run): **Get Clipboard** → **Ask for Input**
   "Your Potraces Quick Log key" with the clipboard pre-filled → **Save File**
   → set variable `PotracesKey`. **Otherwise** `PotracesKey` = file contents.
3. **Ask for Input** (Number) — "Amount (RM)".
4. **List** → **Choose from List** — Category (labels carry emoji; the server's
   `resolveCategory` strips non-alphanumerics, so `🍔 Food & Dining` → `food`).
5. **List** → **Choose from List** — Payment (`💵 Cash`, `🏦 Maybank`, …;
   `resolveWallet` fuzzy-matches by name, falls back to the default wallet).
6. **Ask for Input** (Text) — note, optional.
7. **Get Contents of URL** — POST JSON `{key, amount, category, wallet, note}`
   to `https://iydqeeonaljqapulboaz.supabase.co/functions/v1/quick-log`.
8. **Show Notification** — `RM<amount> · <category>` + the server response.

First run also shows a one-time iOS prompt to allow connecting to
`*.supabase.co` — tap **Always Allow**.

## Roadmap (v2): native App Intent

The zero-key, zero-server route: a Swift `AppIntent` in the main app target
(iOS 16+) that prompts for amount/category/note natively, writes to the
`group.com.potraces.app` App Group, and the app drains it on next open — works
offline and without Cloud Backup. Back Tap still needs a one-action wrapper
shortcut (Back Tap only lists personal shortcuts). Prereqs: add the App Group
to the MAIN app entitlements (currently only the share extension has it);
deliver Swift via a config plugin to survive `expo prebuild --clean`.
