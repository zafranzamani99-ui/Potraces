# Potraces Quick Log — Back Tap Shortcut

One-time setup for a user:
1. In Potraces: Settings → **Quick Log (Back Tap)** → **Generate my key** → **Copy key**.
2. Open the shared Shortcut link (the "Get the Shortcut" button) and **Add Shortcut**.
3. On first run it asks for your key — **paste** it. (Stored in the Shortcut forever.)
4. Settings (iOS) → Accessibility → Touch → **Back Tap** → **Double Tap** → choose **Potraces Quick Log**.

## Shortcut actions (build once, share as an iCloud link)
1. **Text** → your Quick-Log key (or an Import Question "Your Potraces key").
2. **Ask for Input** — Number — "Amount" → var `Amount`.
3. **Choose from Menu** — Food & Dining / Transportation / Shopping / Entertainment /
   Healthcare / Other. Each branch sets `Category` to the matching id:
   `food` / `transport` / `shopping` / `entertainment` / `health` / `other`.
4. **Choose from Menu** — Cash / Maybank / TNG / Card / … → set `Wallet` to the label text.
5. **Ask for Input** — Text — "Note" → var `Note`.
6. **Get Contents of URL**
   - URL: `https://iydqeeonaljqapulboaz.supabase.co/functions/v1/quick-log`
   - Method: POST, Headers: `Content-Type: application/json`
   - Request Body (JSON):
     `{ "key": Key, "amount": Amount, "category": Category, "wallet": Wallet, "note": Note }`
7. **If** the response contains `"ok":true` → **Show Notification** "Logged RM[Amount] to [Category]".
   **Otherwise** (offline / error) → **Open URL**
   `potraces://add?amount=[Amount]&category=[Category]&wallet=[Wallet]&note=[Note]`
   (the offline fallback — opens the app and logs locally).
