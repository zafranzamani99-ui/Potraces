# -*- coding: utf-8 -*-
"""Feature guide (PLANNED): Smart Capture — nudge to log. Run: python gen_smart_capture.py"""
import os, _docgen as dg

d = dg.FeatureDoc(
    kicker="POTRACES · FEATURE GUIDE · PLANNED (NOT BUILT YET)",
    title="Smart Capture — Nudge to Log",
    subtitle="\"Detect a payment somewhere → ask 'record this expense?' → you confirm\"",
    meta="Updated June 2026 · feature spec & feasibility · NOT YET IMPLEMENTED",
)

d.callout("This describes a PLANNED feature, not something in the app today. It captures the "
          "founder's vision and the honest platform limits so we build the right thing.", kind="note")
d.callout("BUILD STATUS (June 2026): Step 1 is SHIPPED. (a) The deep link `potraces://add` / "
          "`potraces://income` opens Quick Add from anywhere; Settings has a 'Quick add shortcut' "
          "setup card. (b) The deep link also accepts PARAMETERS — "
          "`potraces://add?amount=35.50&category=entertainment&date=2026-04-07&type=expense` — and "
          "logs the transaction directly with an Undo toast (default wallet, fuzzy category match). "
          "This lets an Apple Shortcut collect amount/category/date with native prompts (like the "
          "popular #shortcuts expense trackers) and hand the values to Potraces. Remaining: native "
          "App Intent / Siri (fully headless, no app-open), email-alert nudges, Android "
          "NotificationListener, Apple Pay automation. NOTE: the `potraces://` scheme only resolves "
          "in a real dev/production build, NOT Expo Go.", kind="tip")

# VISION
d.h("1.  The vision (refined)")
d.p("**Suggest, don't auto-log.** When a payment happens in another app (TNG, a bank app, Grab…), "
    "Potraces fires a push: **\"Want to record this expense?\"** You tap **Record** (or double-tap "
    "the back of the phone) and log it. We **don't even need the amount** — the nudge is enough; "
    "you fill the details. Calm, you stay in control, never a silent write.")

# THE WALL
d.h("2.  The one hard truth — the wall is DETECTION, not the amount")
d.p("To send \"record this?\", the app must first **know a payment happened in another app.** On "
    "iPhone, *knowing another app did anything at all* is the blocked capability — not reading the "
    "amount. Dropping the amount does **not** lower the bar; the bar is at the first step.")
d.callout("iOS has NO API that says 'another app just took a payment.' It cannot read other apps' "
          "notifications or SMS. So a TNG/bank/QR payment cannot be detected on iPhone to nudge "
          "from. This is a privacy design, not a missing feature — it won't change for these "
          "channels.", kind="manual")

# WHAT CAN SIGNAL A PAYMENT
d.h("3.  What can actually signal 'a payment happened'")
d.legend([("WORKS", dg.OLIVE_TINT, dg.OLIVE),
          ("PARTIAL / PROXY", dg.GOLD_TINT, dg.GOLD),
          ("IMPOSSIBLE", dg.TERRA_TINT, dg.TERRA)])
d.table(
    ["Signal", "iPhone", "Android", "Notes"],
    [
        ["Another app's push notification (TNG, bank, Grab)",
         ("Impossible", dg.TERRA_TINT, dg.TERRA), ("Works", dg.OLIVE_TINT, dg.OLIVE),
         "Android NotificationListener sees any app. iOS 26.3 forwards only to paired hardware, not to apps (§8)"],
        ["Bank SMS arrives",
         ("Partial", dg.GOLD_TINT, dg.GOLD), ("Restricted", dg.TERRA_TINT, dg.TERRA),
         "iOS: only via a user-built Shortcuts automation. Android: READ_SMS is default-SMS-app only on Play (§8)"],
        ["Apple Pay / Google Pay tap-to-pay",
         ("Works", dg.OLIVE_TINT, dg.OLIVE), ("Works", dg.OLIVE_TINT, dg.OLIVE),
         "iOS Shortcuts 'Wallet' trigger (was 'Transaction'); tap-to-pay cards only"],
        ["Bank ALERT EMAIL arrives",
         ("Works", dg.OLIVE_TINT, dg.OLIVE), ("Works", dg.OLIVE_TINT, dg.OLIVE),
         "We read email w/ consent (server-side) → our own push"],
        ["You left a shop (geofence)",
         ("Proxy", dg.GOLD_TINT, dg.GOLD), ("Proxy", dg.GOLD_TINT, dg.GOLD),
         "Not a real txn; battery/privacy cost; noisy"],
        ["Time of day (lunch / end of day)",
         ("Works", dg.OLIVE_TINT, dg.OLIVE), ("Works", dg.OLIVE_TINT, dg.OLIVE),
         "Dumb reminder; zero permissions; works everywhere"],
    ],
    widths=[2.9, 1.0, 1.0, 2.7],
)

# PER PLATFORM
d.h("4.  So the idea splits by platform")
d.h2("Android — your exact vision works (and is simple)")
d.bullet("Use **NotificationListenerService** to detect a notification from a known finance app "
         "(filter to TNG / Maybank / CIMB / GrabPay / Boost package names — ignore WhatsApp etc.).")
d.bullet("We don't even parse it — just fire **\"Record this expense?\"** with **Record / Skip** "
         "buttons. Tap Record → quick-add (optionally pre-filled if we did parse).")
d.bullet("**Use notifications, NOT SMS.** Google Play restricts `READ_SMS` to the user's default "
         "SMS app only — a third-party expense app can't ship SMS-reading. NotificationListener is "
         "the viable channel.")
d.callout("Android caveat: the user must grant a special 'Notification access' permission, and "
          "Google Play scrutinises apps that use it (BIND_NOTIFICATION_LISTENER_SERVICE is a "
          "sensitive permission) — it's allowed for expense trackers but must be declared as a "
          "genuine core feature.", kind="manual")

d.h2("iPhone — true detection is Apple Pay + email only")
d.bullet("**Apple Pay:** an iOS Shortcuts 'Wallet' automation (called 'Transaction' before iOS 26; "
         "set up once) fires on tap-to-pay → calls our App Intent → \"record this?\". Runs on-device, "
         "no aggregator. Covers Apple Pay tap-to-pay spend only.")
d.bullet("**Bank email:** if the bank emails alerts, we read them (Gmail/IMAP, with consent, "
         "server-side) and send our own push \"record this?\". Works on iPhone because reading "
         "*email* is allowed — unlike reading another app's notification.")
d.bullet("**TNG on iPhone: no signal at all** — push-only, no email, no API. Stays a gap until "
         "open finance (~2029).")

d.h2("Both platforms — the universal version needs no detection at all")
d.p("Since you don't need the amount, the version that works **everywhere with zero sandbox "
    "issues** is a **smart reminder**, not transaction-detection:")
d.bullet("\"You were near a kedai 5 minutes ago — spend anything?\" (geofence-exit)")
d.bullet("\"Lunch time — log today's makan?\" / \"End of day — any cash spends to log?\" (time-based)")
d.p("These nudge you to log without ever observing another app — so they're identical on iPhone "
    "and Android.")

# THE NOTIFICATION + ACTIONS
d.h("5.  What the nudge looks like, and where back-tap fits")
d.bullet("**The push** carries action buttons: **Record** (opens quick-add, pre-filled if we have "
         "data) and **Skip**. Tapping Record is the primary confirm.")
d.bullet("**Double-tap the back of the phone** is best as a *separate* accelerator — \"add an "
         "expense right now from scratch\" — via an iOS App Intent + Back Tap assignment. It can "
         "also be wired to 'confirm the last pending nudge' if wanted.")
d.bullet("Same App Intent also lights up **Siri, Spotlight, Control Centre, and widgets** — one "
         "build, many entry points.")

# RECOMMENDED BUILD
d.h("6.  Recommended build (confirm-first, on-brand)")
d.table(
    ["Phase", "What", "Platform", "Effort"],
    [
        ["1", "App Intent quick-add (Back Tap / Siri / widget)", "iOS", "Medium"],
        ["2", "Smart reminders (time + optional geofence) → \"log your spends?\"", "Both", "Low–Med"],
        ["3", "Email-alert detection → \"record this?\" push", "Both", "Medium"],
        ["4", "Apple Pay Shortcuts automation → \"record this?\"", "iOS", "Low"],
        ["5", "NotificationListener detection → \"record this?\"", "Android", "Medium"],
    ],
    widths=[0.6, 4.2, 1.2, 1.0],
)
d.p("Every nudge ends in a **user confirmation** — never a silent write. Full BM + EN copy, calm "
    "tone, no red. Auto-/suggested entries are clearly marked as suggestions.")

# SHORTCUT RECIPE
d.h("7.  Apple Shortcut recipe & URL parameters (Path A — shipped)")
d.p("Build this in the Shortcuts app to recreate the popular #shortcuts expense flow, but landing "
    "in Potraces. Steps 1–4 are native floating prompts (the look from the TikTok). Run it from "
    "Back Tap, the Action Button, or a Lock Screen widget.")
d.num("Ask for Input → Number → \"What is the amount?\"")
d.num("Choose from Menu → your categories (Food, Shopping, Transport, Entertainment, …)")
d.num("Choose from Menu → your payment method / wallet (Maybank, TNG, Cash, credit card, …)")
d.num("Ask for Input → Date → \"What is the date?\" → then Format Date → yyyy-MM-dd")
d.num("Text → potraces://add?amount=[Amount]&category=[Category]&wallet=[Wallet]&date=[Date]")
d.num("Open URLs → the Text from step 5")
d.p("Potraces resolves the category and wallet by fuzzy name-match, logs the transaction with the "
    "right payment method, and shows an Undo toast (e.g. \"RM 35.50 went out · TNG\").")
d.h2("URL parameters")
d.table(
    ["Parameter", "Meaning", "Example", "Default"],
    [
        ["amount / amt", "Amount — required to log", "35.50", "omit = just opens the sheet"],
        ["type", "income or expense", "income", "expense"],
        ["wallet / account / method / from", "Payment method (wallet name or id)", "TNG", "Default wallet"],
        ["category / cat", "Category (fuzzy matched)", "Entertainment", "Other"],
        ["date / day", "Date (yyyy-MM-dd or ISO)", "2026-04-07", "Today"],
        ["note / description / desc", "Free-text note", "lunch ali", "Category name"],
    ],
    widths=[2.3, 2.2, 1.5, 1.6],
)
d.callout("Keep category & wallet menu labels simple (avoid '&'): the '&' character breaks URL "
          "query parsing. Potraces fuzzy-matches, so \"Food\" finds \"Food & Drinks\" and "
          "\"Maybank\" finds your Maybank wallet. (Or add a URL-Encode action before the Text step.)",
          kind="manual")
d.p("A credit-card / BNPL wallet passed as the payment method works correctly — it uses credit "
    "instead of cash, same as logging in-app.", size=9.5, color=dg.MUTED, italic=True)

# LATEST DEVELOPMENTS (verified)
d.h("8.  What changed recently (verified June 2026)")
d.p("Researched against current Apple/Google docs and reporting — not assumed:")
d.bullet("**iOS 26.3 (Dec 2025) added an `AccessoryNotifications` framework**, and Apple published "
         "privacy rules for it (Mar 2026). It forwards iPhone notifications to a **paired hardware "
         "accessory** (a wearable) under EU/DMA — controlled by a user setting. It is **not** an "
         "app-to-app reading API: the rules explicitly bar using forwarded data in 'any other "
         "Application' or for profiling. So it does NOT enable in-app transaction detection — but "
         "it shows the EU is steadily forcing Apple open. **Worth monitoring**, not building on yet. "
         "[9to5Mac, Mar 2026; MacRumors, Mar 2026]")
d.bullet("**iOS Shortcuts automations can run immediately** (turn off 'Ask Before Running') — "
         "including the **Message** trigger and the **Wallet/Apple Pay** trigger. Confirmed current. "
         "[Apple Support; Matthew Cassinelli]")
d.bullet("**Google Play tightened SMS access:** `READ_SMS` is limited to the user's **default SMS "
         "handler** (narrow exceptions only). A third-party expense app can't rely on reading bank "
         "SMS on Android — use NotificationListener instead. [Google Play Console Help, 2025]")
d.bullet("**No change to the core wall:** an iPhone app still cannot see another app's notification "
         "for its own logic. Verified across current Apple docs and developer reporting.")

# WHAT'S IMPOSSIBLE
d.h("9.  Bottom line — what's possible vs not")
d.bullet("**Possible:** Android = real \"a payment happened → record this?\" for any finance app. "
         "iPhone = same for Apple Pay + banks that email. Both = smart reminders that nudge you to "
         "log (no detection needed).")
d.bullet("**Impossible (iPhone):** detecting a TNG / bank-app / QR payment to nudge from — there is "
         "no signal to read. No amount, no parse, nothing; the detection itself is blocked.")
d.bullet("**Never:** silent auto-logging. By design, you always confirm.")

d.rule()
d.p("Background & sources: docs/Potraces-Bank-Connection-Plan.docx and "
    "docs/research/auto-capture-global-research.md. Status: PLANNED — not in the app yet.",
    size=8.5, color=dg.MUTED, italic=True)

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "04-Smart-Capture-Nudge-to-Log.docx")
d.save(out)
print("WROTE:", out)
