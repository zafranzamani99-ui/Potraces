# Potraces

A money app that doesn't make you feel bad about money.

Built for Malaysians who earn in different ways — salary, freelance, delivery rides, roadside stalls, home-based selling, or all of the above. It tracks what comes in and what goes out, and talks to you like a friend, not a financial advisor.

No "profit". No "loss". No "you should save more". Just honest numbers and calm observations.

---

## How it works

The app runs in two modes: **Personal** (your daily money) and **Business** (your earnings). You switch between them with a toggle at the top of the screen. Each mode has its own dashboard, navigation, and data — but they share wallets, debts, and settings.

### Personal Mode

```
Tab bar: Home | Budget | Notes | Chat | Settings

Dashboard → balance, week timeline, insights, quick actions
  → Tap "Add" → ExpenseEntry (manual, voice, or photo)
  → Quick actions → Wallets / Savings / Debts / Commitments / Reports / Goals / Chat / Scan
Budget tab → category limits, spending vs budget tracking
Notes tab → freeform notes with AI intent detection
Money Chat tab → plain-language AI Q&A about your spending
Settings tab → currency, name, QR codes, categories, haptics, data
```

**Adding a transaction:**
1. Tap the center "+" button on the tab bar
2. Choose: type text, speak, or take a photo
3. AI parses it into a structured transaction (amount, category, wallet)
4. Review, adjust if needed, save
5. Wallet balance and budget tracking update automatically

**Wallet system:**
- Bank (Maybank, CIMB, etc.), E-Wallet (TNG, GrabPay, Boost), Credit/BNPL (Atome, SPayLater)
- Each transaction linked to a wallet
- Transfer between wallets
- Credit wallets track `creditLimit`, `usedCredit`, and available balance separately
- Dashboard hero balance excludes credit wallets — credit isn't cash

**Budget flow:**
1. Set a limit for a category (e.g., Food: RM 500/month)
2. Every expense in that category auto-deducts from the budget
3. Approaching limit → "getting close" — not "danger"
4. Exceeded → noted calmly — no red alerts

**Categories:**
- Expense: Food & Dining, Transportation, Shopping, Entertainment, Bills & Utilities, Healthcare, Education, Family, Subscriptions, Business Cost, Debt Payment, Other
- Income: Salary, Freelance, Business, Investment, Gift, From Business, Debt Paid, Other
- Investment: TNG+, Robo Crypto, ESA, Bank, ASB, Tabung Haji, Stocks, Gold, Other
- Business expense: Rent & Lease, Inventory/COGS, Payroll, Marketing, Utilities, Office Supplies, Travel, Insurance, Maintenance, Professional Services, Shipping, Other
- Business income: Sales, Service Income, Consulting, Commission, Rental Income, Interest & Returns, Other
- Product: Food & Beverages, Clothing, Electronics, Accessories, Books, Toys, Health & Beauty, Home & Garden, Other
- All categories customizable — add, rename, reorder, delete via CategoryManager

### Business Mode

When you first enter business mode, you pick your income type. Navigation tabs change to match:

```
Choose income type: Seller / Stall / Freelance / Part-time / Rider / Mixed
→ Navigation and screens adapt to your type
```

#### Seller Mode (WhatsApp order-based + Online Order Page)

Built for home-based food sellers who take orders on WhatsApp and online.

```
Tab bar: Home | Orders | + New Order | Customers | Manage

New order flow:
  1. Paste WhatsApp message → local Malay parser extracts items
  2. If parser fails → AI fallback (Gemini)
  3. Add customer name, phone, address
  4. Review items, adjust quantities/prices
  5. Save → order appears in pipeline

Order lifecycle:
  Pending → Confirmed → Ready → Delivered → Completed
  Payment recorded at any stage (partial deposits supported)

Online Order Page (Vercel):
  1. Set up shop link in Dashboard → choose slug + display name
  2. Upload shop logo (stored in Supabase Storage)
  3. Customers visit https://potraces.vercel.app/?slug=your-slug
  4. Browse products with images, add to cart, submit order
  5. Order syncs to your app via Supabase realtime
  6. Push notification sent to seller

Season flow:
  1. Start a season (Raya, CNY, Deepavali, or custom)
  2. Orders during the season link to it
  3. Log ingredient costs against the season (one-time + recurring)
  4. Close season → summary: what you kept, orders fulfilled,
     cost breakdown, product performance, daily trend chart
  5. Transfer earnings to personal wallet

Product management:
  - Name, price per unit, cost per unit, product image
  - Custom units: tin, balang, kotak, pack, piece (or create your own)
  - "Kept per unit" calculated automatically
  - Stock tracking with low-stock indicators
  - Upload product photos (shown in app + order page)
  - Drag-to-reorder product list

Customer management:
  - Auto-created from order history
  - Import from phone contacts
  - Search, sort, filter by outstanding/repeat
  - Tap to call or WhatsApp
  - Total orders, total spent, outstanding per customer

Cost management:
  - Log costs per season (ingredients, packaging, delivery)
  - Cost types: one-time, recurring
  - Season cost breakdown in summary

Manage tab:
  - Products (CRUD + reorder + images)
  - Cost management
  - Season management (start/close/past seasons)
  - Transactions list
  - Shop link settings
```

#### Stall Mode (session-based POS)

Built for pasar malam vendors and roadside sellers.

```
Tab bar: Home | History | Sell | Regulars | Settings

Session flow:
  1. Start session on dashboard
  2. Set starting inventory per product (optional)
  3. Choose condition: good / slow / rainy / hot
  4. POS sell screen: product grid, cart, QR/cash toggle, discount
  5. Close session → summary: total revenue, cash vs QR,
     product sales, duration, revenue per hour
  6. Transfer earnings to personal wallet

Stall products:
  - Separate product list from seller mode
  - Name, price, stock tracking
  - Grid-based POS layout for quick tapping

Regular customers:
  - Track frequent buyers
  - Quick re-order support
```

#### Freelance Mode

Built for designers, writers, tutors — anyone billing clients.

```
Tab bar: Home | Clients | Notes | Settings

Dashboard: total earned, pending payments, client count, trends
Clients: add/edit clients, log payments per client, view history
Reports: earnings breakdown, averages, monthly comparison
```

#### Part-time Mode

Built for people with a main job plus side income.

```
Tab bar: Home | Notes | Settings

Setup: configure main vs side income types
Dashboard: main vs side breakdown, monthly comparison
Add income: log to main or side bucket
History: filterable income log
Reports: split analysis, trends
```

#### On-the-Road Mode (Rider)

Built for Grab, Foodpanda, Lalamove riders.

```
Tab bar: Home | Notes | Settings

Setup: vehicle type, fuel preferences
Dashboard: daily earnings, costs (petrol, toll, maintenance), net kept
Add earnings: log daily earnings
Add cost: log petrol, toll, maintenance
Cost history: filterable log
Reports: earnings vs costs, net analysis
```

#### Mixed Mode

Built for people with multiple income streams.

```
Tab bar: Home | Notes | Settings

Setup: create named income streams with colors
Dashboard: combined view, per-stream breakdown
Add income/cost: log to any stream
Stream history: per-stream filterable log
Reports: stream comparison, trends
```

### Shared Features

#### Debt & Split Tracking

```
Debt: Add → pick contact → "I Owe" or "They Owe Me" → record payments
      → status: Pending → Partial → Settled
      → due date support
      → request payment via WhatsApp with amount + optional QR
      → edit audit trail on payments (who changed what, when)

Split: Add → enter total → add participants → choose method:
       Equal / Custom / Item-based
       → tax handling → track who paid → mark settled
       → scan receipt to auto-assign items
       → edit audit trail on split amounts
```

#### Notes (AI-Powered)

Freeform notes with intent detection:
- Write a note like "lunch with Ali RM 25"
- AI detects financial intent (expense, debt, subscription)
- Tap to confirm and create the transaction
- Supports Manglish (Malaysian English + Malay mix)
- Confirmation card UI for reviewing detected intent
- Query result cards for data lookups

#### Money Chat

Ask about your money in plain language:
- "Where does most of my money go?"
- "Am I spending more this month?"
- "How was business compared to last month?"
- Voice input: hold mic button, speak in English/Malay/Manglish, auto-transcribed
- Action execution: AI can create transactions, add debts, check budgets
- Conversation history with auto-archive
- Text selection (word-level copy)
- Scroll-to-bottom floating button
- Auto-retry on failed sends
- Context-aware: knows your wallets, budgets, recent transactions, debts

Powered by Gemini. Works in both personal and business mode.

#### Receipt Scanner

1. Take photo or pick from gallery
2. OCR extracts text (Google Cloud Vision)
3. Gemini parses into structured data (vendor, items, tax, total)
4. Create transaction or send items to split screen

#### Financial Pulse

- Wellness score based on spending patterns
- Spending velocity tracking
- Category streaks
- Monthly trends

#### Reports

- Monthly/yearly spending breakdown
- Category-wise analysis
- Income vs expense comparison
- Exportable to Excel (xlsx)

#### Savings Tracker

- Named savings accounts with target amounts
- Value snapshots over time
- Progress tracking toward goals

#### Goals

- Financial goals with deadlines
- Contribution tracking
- Milestone markers

#### Subscriptions

- Recurring payment tracking
- Billing cycle: weekly, monthly, quarterly, yearly
- Due date reminders (3 days before)
- Total committed per period

#### Account Overview

- Consolidated view across all wallets
- BNPL/credit balance summary
- Net worth calculation (excl. credit)

#### Onboarding

- First-launch guided tour
- Feature highlights for new users

---

## Design Philosophy

### CALM Design System

Anxiety-reducing visual language:

- **Palette** — Warm off-white `#F9F9F7`, olive accent `#4F5104`, bronze `#B2780A`, gold `#DEAB22`, lavender `#B8AFBC`, deep olive `#332D03`. No red anywhere.
- **Typography** — Hero amounts: 48px, weight 200 (ultralight). Balance: 36px, weight 300. Labels: 12px uppercase, muted. Insights: 14px, line-height 22. All numeric text uses `tabular-nums` font variant for alignment.
- **Type scale** — xs: 11, sm: 13, base: 15, lg: 17, xl: 20, 2xl: 24, 3xl: 30, 4xl: 36, 5xl: 48.
- **Font weights** — extraLight: 200, light: 300, regular: 400, medium: 500, semibold: 600, bold: 700.
- **Spacing** — 8-point grid. xs: 4, sm: 8, md: 16, lg: 16, xl: 24, 2xl: 24, 3xl: 32, 4xl: 40, 5xl: 48, 6xl: 56, 7xl: 64.
- **Border radius** — xs: 4, sm: 6, md: 10, lg: 14, xl: 20, 2xl: 28, full: 9999.
- **Shadows** — Max opacity 0.06 for subtle (`sm`), up to 0.14 for modals (`2xl`). Inspired by Stripe/Linear: "felt, not seen." Shadow levels: none, xs, sm, md, lg, xl, 2xl.
- **Status colors** — Pending: warm amber. Partial: bronze. Settled: calm teal. No red for anything.
- **Dark mode** — Full dark color set defined (`COLORS_DARK`). Dark surfaces: `#0F1419`, `#1A1F2E`, `#252B3B`. Dark text: `#F8F9FE`, `#A1A8B8`.

### BIZ Color System (Business Mode)

| Meaning | Color | Hex |
|---|---|---|
| Earned value | Deep olive | `#332D03` |
| Negative / loss | Bronze | `#B2780A` |
| Overdue | Burnt orange | `#B87333` |
| Unpaid | Warm sand | `#C4956A` |
| Pending | Warm amber-orange | `#D4884A` |
| Settled | Calm teal-blue | `#6BA3BE` |
| Warning | Warm gold | `#D4A03C` |
| Error | Burnt sienna | `#A0714A` |

### Language Rules (Non-negotiable)

| Never use | Always use |
|-----------|-----------|
| Profit | Kept |
| Loss | Went out |
| Revenue | Came in |
| ROI | — |
| Inventory | Products |
| You should | (never give advice) |

### Semantic Color System (Debts & Status)

| Meaning | Color | Hex |
|---|---|---|
| I Owe / my responsibility | Terracotta | `#C1694F` |
| My side / involvement | Mauve | `#A688B8` |
| In progress / partial | Bronze | `#B2780A` |
| Resolved / settled | Sky blue | `#6BA3BE` |
| Urgent / pending | Bright gold | `#DEAB22` |
| They Owe / owed to me | Olive | `#4F5104` |

### Chart Colors

Palette-aligned, no red, no bright green:
- `#4F5104` (olive) → `#B2780A` (bronze) → `#DEAB22` (gold) → `#6BA3BE` (sky) → `#A06CD5` (purple) → `#B8AFBC` (lavender)

### Mode Accent Colors

- Personal mode: `#4F5104` (olive)
- Business mode: `#B2780A` (bronze)

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | React Native + Expo SDK | RN 0.81.5, Expo 54 |
| Language | TypeScript | 5.3 |
| State | Zustand + Immer + AsyncStorage persistence | Zustand 4.5, Immer 10 |
| Navigation | React Navigation (Stack + Dynamic Bottom Tabs) | 7.x |
| Backend | Supabase (Auth + Postgres + Storage + Realtime) | 2.98 |
| AI | Gemini via REST API (geminiClient.ts) | — |
| OCR | Google Cloud Vision | — |
| Receipt parsing | Gemini Vision | — |
| Voice transcription | Gemini 2.0 Flash (via expo-audio recording + base64 upload) | — |
| Charts | react-native-chart-kit | 6.12 |
| Animations | react-native-reanimated | 4.1 |
| Gestures | react-native-gesture-handler | 2.28 |
| Haptics | expo-haptics | 15.0 |
| Date handling | date-fns | 3.6 |
| Icons | Feather (via @expo/vector-icons) | 15.0 |
| Drag & Drop | react-native-draggable-flatlist | 4.0 |
| Export | xlsx (Excel export) | 0.18 |
| Push notifications | expo-notifications | 0.32 |
| Image picker | expo-image-picker | 17.0 |
| Image manipulation | expo-image-manipulator | 14.0 |
| Audio recording | expo-audio | 1.1 |
| File system | expo-file-system | 19.0 |
| Contacts | expo-contacts | 15.0 |
| Clipboard | expo-clipboard | 8.0 |
| Sharing | expo-sharing | 14.0 |
| Linear gradients | expo-linear-gradient | 15.0 |
| Blur effects | expo-blur | 15.0 |
| SVG | react-native-svg | 15.12 |
| Keyboard | react-native-keyboard-controller | 1.18 |
| Safe area | react-native-safe-area-context | 5.6 |
| Screens | react-native-screens | 4.16 |
| Date/time picker | @react-native-community/datetimepicker | 8.4 |
| Async storage | @react-native-async-storage/async-storage | 2.2 |
| OTA Updates | EAS Update (expo-updates) | 29.0 |
| Hosting | Vercel (order page) | — |

---

## Backend (Supabase)

Seller mode data syncs to Supabase for multi-device access and the online order page.

### Auth Flow

```
Phone + password sign up → Telegram OTP verification → Session persisted via AsyncStorage
Sign out → stays in business mode → shows AuthScreen (does NOT switch to personal)
```

### Database Schema

```sql
seller_profiles  — user_id, display_name, slug (unique), currency, shop_notice,
                    phone, logo_url, is_verified, created_at, updated_at

seller_products  — user_id, local_id, name, price, cost, unit, stock, image_url,
                    description, category, is_active, sort_order, created_at, updated_at

seller_orders    — user_id, profile_id, local_id, customer_name, customer_phone,
                    customer_address, items (jsonb), status, payment_status,
                    total_amount, paid_amount, deposits (jsonb), notes,
                    source ('app' | 'order_link'), season_id, supabase_id,
                    created_at, updated_at

seller_seasons   — user_id, local_id, name, start_date, end_date, budget,
                    is_active, created_at, updated_at

seller_customers — user_id, local_id, name, phone, address,
                    created_at, updated_at

seller_costs     — user_id, season_id, local_id, description, amount,
                    cost_type ('one_time' | 'recurring'), category,
                    created_at, updated_at
```

### Storage Buckets

| Bucket | Purpose | Access |
|--------|---------|--------|
| `shop-logos` | Seller shop logos | Public read, owner write |
| `product-images` | Product photos | Public read, owner write |

### Row Level Security (RLS)

- `seller_orders_owner` — `auth.uid() = user_id` (owner CRUD)
- `seller_orders_link_read` — subquery on `seller_profiles` for order link access (user_id = null)
- Realtime enabled with RLS policies for live order sync

### Migrations (16 files)

```
20260307062816 — Initial seller schema (profiles, products, orders, seasons, customers)
20260307080000 — Sync indexes for efficient pull/push
20260307090000 — Storage web bucket setup
20260307170000 — Unique slug constraint on seller_profiles
20260307171000 — Fix upsert indexes (full unique, not partial)
20260307172000 — Enable realtime subscriptions
20260307180000 — Push notification infrastructure
20260309100000 — Product description column
20260309110000 — Shop notice column
20260309120000 — Order deposits (jsonb array)
20260309130000 — Claim profile flow
20260309140000 — Order link delete/update policies
20260311000000 — Auth verification (is_verified flag)
20260311100000 — Ingredient + recurring cost types
20260313000000 — Shop logo storage + URL column
20260313100000 — Product images storage + URL column
```

### Sync Strategy

- **Pull-before-push**: `pullAll()` fetches remote data first to prevent empty local store from deleting remote records via tombstone logic
- **Tombstone logic**: local deletions tracked in `_deletedXxxIds` sets to prevent re-pull of deleted items
- **Startup sequence**: waits for auth session AND Zustand store hydration before syncing
- **Date safety**: all dates from Supabase use null guards (`val ? new Date(val) : new Date()`). Missing date fields cause `RangeError: Invalid time value` crashes without guards.
- **Image uploads**: product images and shop logos uploaded to Supabase Storage with public URLs stored on the record

### Order Page

Static HTML hosted on Vercel at `docs/index.html`:
- Fetches shop profile + products from Supabase REST API client-side
- Customers browse menu with product images, add to cart, submit orders
- Orders inserted into `seller_orders` with `source: 'order_link'`
- Push notification sent to seller via Supabase Edge Function
- Features: image lightbox, skeleton loader, order history, WhatsApp CTA
- URL pattern: `https://potraces.vercel.app/?slug={slug}`

---

## AI Integration

### Gemini Client (`geminiClient.ts`)

Central wrapper for all Gemini API calls:
- Rate limiting with cooldown
- API key validation
- Configurable temperature, max tokens
- Used by: moneyChat, chatActions, aiService, receiptScanner, intentEngine, useVoiceInput

### Money Chat (`moneyChat.ts` + `chatActions.ts`)

- Builds financial context from stores (transactions, wallets, budgets, debts, subscriptions, goals, savings)
- 2-second TTL cache on context building to prevent redundant store reads
- Sends context + user message to Gemini
- Parses AI response for executable actions (add expense, create debt, check budget, etc.)
- Action executor with unique ID generation (collision-resistant with counter suffix)
- Race condition guard: request ID counter prevents stale responses from overwriting newer ones

### Voice Input (`useVoiceInput.ts`)

- Records audio via expo-audio (`HIGH_QUALITY` preset)
- Reads recording as base64
- Sends to Gemini 2.0 Flash with transcription prompt
- Supports Malay, English, and Manglish (mixed)
- Cleanup on unmount (stops recorder, resets audio mode)
- Premium/quota gating via premiumStore

### Intent Engine (`intentEngine.ts` + `useIntentEngine.ts`)

- Detects financial intent from freeform notes
- Categories: expense, debt, subscription, query
- Extracts: amount, category, contact, date

### Manglish Parser (`manglishParser.ts`)

- Parses Malaysian English + Malay mixed text
- Understands local food references, abbreviations
- Used by WhatsApp order parser and AI fallback

### Receipt Scanner (`receiptScanner.ts` + `ocrService.ts`)

- Google Cloud Vision OCR for text extraction
- Gemini Vision for structured parsing (vendor, items, tax, total)

### Spending Mirror (`spendingMirror.ts`)

- AI-generated spending insights
- Pattern analysis, category trends

### Query Engine (`queryEngine.ts`)

- Natural language data queries
- Returns structured results for display in notes/chat

### AI Service (`aiService.ts`)

- Transaction parsing (text → structured transaction)
- Product parsing for seller mode
- Chat response generation

---

## Data Architecture

### Stores (20 Zustand stores with AsyncStorage persistence)

| Store | File | What it manages |
|-------|------|----------------|
| **appStore** | `appStore.ts` | Active mode (personal / business), first launch flag |
| **authStore** | `authStore.ts` | Phone auth, verification status, session, user ID |
| **personalStore** | `personalStore.ts` | Transactions, subscriptions, budgets, goals |
| **businessStore** | `businessStore.ts` | Income type, business transactions, clients, streams |
| **sellerStore** | `sellerStore.ts` | Products, orders, seasons, costs, customers, custom units, shop settings |
| **stallStore** | `stallStore.ts` | Sessions, sales, stall products, regular customers |
| **walletStore** | `walletStore.ts` | Wallets, transfers, credit tracking (limit, used, available) |
| **debtStore** | `debtStore.ts` | Debts, splits, payments, participant tracking, edit audit logs |
| **settingsStore** | `settingsStore.ts` | Currency, name, payment QRs, haptics toggle, display preferences |
| **categoryStore** | `categoryStore.ts` | Custom categories, overrides, ordering per category type |
| **premiumStore** | `premiumStore.ts` | Subscription tier, AI call quota, feature gates |
| **savingsStore** | `savingsStore.ts` | Savings accounts, value snapshots, target tracking |
| **notesStore** | `notesStore.ts` | Freeform notes with AI intent metadata |
| **aiInsightsStore** | `aiInsightsStore.ts` | Cached AI insights, spending mirror results |
| **learningStore** | `learningStore.ts` | User patterns, category preferences, suggestion learning |
| **crmStore** | `crmStore.ts` | Customer relationship data (business mode) |
| **freelancerStore** | `freelancerStore.ts` | Freelancer clients, payments, project tracking |
| **partTimeStore** | `partTimeStore.ts` | Main/side income tracking, type configuration |
| **onTheRoadStore** | `onTheRoadStore.ts` | Vehicle setup, daily earnings, costs (petrol/toll/maintenance) |
| **mixedStore** | `mixedStore.ts` | Multiple named income streams with colors |

All stores use safe date rehydration: inline `sd()` helper on `onRehydrateStorage` prevents `Invalid Date` from crashing `format()` calls.

### Core Data Models

```
Transaction     — id, amount, category, date, type (expense/income/investment),
                  wallet, note, tags[], aiContext, recurringId
Wallet          — id, name, type (bank/ewallet/credit/bnpl), balance,
                  creditLimit, usedCredit, icon, color, sortOrder
Debt            — id, contact, contactPhone, type (i_owe/they_owe),
                  totalAmount, paidAmount, dueDate, payments[],
                  editLog[], status (pending/partial/settled)
SplitExpense    — id, description, totalAmount, participants[], items[],
                  splitMethod (equal/custom/item_based), taxAmount,
                  editLog[], settled
SellerOrder     — id, localId, items[], customerName, customerPhone,
                  customerAddress, status, paymentStatus, totalAmount,
                  paidAmount, deposits[], notes, source (app/order_link),
                  seasonId, supabaseId, createdAt
SellerProduct   — id, localId, name, pricePerUnit, costPerUnit, unit,
                  stock, imageUrl, description, category, isActive, sortOrder
Season          — id, localId, name, startDate, endDate, isActive, budget
SellerCost      — id, localId, seasonId, description, amount,
                  costType (one_time/recurring), category
SellerCustomer  — id, localId, name, phone, address
StallSession    — id, startTime, endTime, condition, sales[], revenue,
                  cashAmount, qrAmount, productsSold
Goal            — id, name, targetAmount, deadline, contributions[], milestones[]
Subscription    — id, name, amount, category, billingCycle, nextDueDate, wallet
Budget          — id, category, limit, period (weekly/monthly/yearly), spent
Note            — id, content, intent, intentData, confirmed, createdAt
SavingsAccount  — id, name, targetAmount, snapshots[]
```

---

## Project Structure

```
c:\Project\Potraces\
├── App.tsx                          # Entry point: auth listener, store hydration,
│                                    #   sync startup, navigation container
├── app.json                         # Expo config: icons, permissions, EAS, plugins
├── eas.json                         # EAS Build profiles
├── babel.config.js                  # Babel config (reanimated plugin)
├── tsconfig.json                    # TypeScript config
├── package.json                     # Dependencies (50+ packages)
├── vercel.json                      # Vercel deployment config (docs/ as output)
├── google-services.json             # Firebase config (push notifications)
├── .env.example                     # Environment variable template
│
├── assets/
│   └── icon.png                     # App icon (adaptive icon on Android)
│
├── docs/
│   ├── index.html                   # Order page (Vercel-hosted, static HTML)
│   ├── AI_SCENARIOS.md              # AI integration scenarios documentation
│   ├── BUILDING_CHECKLIST.md        # Recurring perf/keyboard/nav/styling issues
│   ├── DEPLOYMENT_CHECKLIST.md      # Pre-deployment verification steps
│   ├── QUICKSTART.md                # Quick start guide
│   ├── SELLER_MODE_AUDIT.md         # Seller mode readiness audit (87.78%)
│   ├── Potraces_Integration_Plan.pdf # Integration planning document
│   └── ai-drafts/                   # AI-generated draft files
│
├── supabase/
│   └── migrations/                  # 16 SQL migration files (schema, indexes,
│                                    #   storage, RLS, realtime, notifications)
│
└── src/
    ├── components/
    │   ├── common/                  # 28 reusable UI components
    │   │   ├── AnimatedNumber.tsx      # Smooth number transitions
    │   │   ├── BreathingRoom.tsx       # Spacer / padding component
    │   │   ├── Button.tsx             # Styled button with variants
    │   │   ├── CalendarPicker.tsx      # Custom calendar (no external dependency)
    │   │   ├── Card.tsx               # Base card with CALM styling
    │   │   ├── CategoryManager.tsx     # Inline category CRUD (add/edit/delete/reorder)
    │   │   ├── CategoryPicker.tsx      # Category selection with search
    │   │   ├── CollapsibleSection.tsx   # Expandable section with subtitle
    │   │   ├── ContactPicker.tsx       # Contact selection (keyboard-safe)
    │   │   ├── EmptyState.tsx          # Empty list placeholder
    │   │   ├── ErrorBoundary.tsx       # React error boundary wrapper
    │   │   ├── ErrorState.tsx          # Error display component
    │   │   ├── FAB.tsx                # Floating action button
    │   │   ├── FreshStart.tsx          # First-use welcome state
    │   │   ├── GlassCard.tsx           # Frosted glass effect card
    │   │   ├── GradientButton.tsx      # Linear gradient button
    │   │   ├── HeroCard.tsx            # Large feature card (dashboard)
    │   │   ├── ModeToggle.tsx          # Personal ↔ Business toggle
    │   │   ├── PaywallModal.tsx        # Premium feature gate modal
    │   │   ├── ProgressBar.tsx         # Progress indicator
    │   │   ├── QuickAddExpense.tsx      # Inline quick expense entry
    │   │   ├── SkeletonLoader.tsx       # Loading skeleton placeholder
    │   │   ├── StatCard.tsx            # Dashboard statistic card
    │   │   ├── Toast.tsx              # Toast notification
    │   │   ├── TransactionItem.tsx      # Transaction list row (income/expense)
    │   │   ├── UnitManager.tsx         # Custom unit CRUD for products
    │   │   ├── WalletPicker.tsx        # Wallet selection dropdown
    │   │   └── WeekBar.tsx            # 7-day spending bar chart
    │   ├── business/                # 6 business-specific components
    │   │   ├── BusinessEmptyState.tsx   # Business mode empty state
    │   │   ├── BusinessFAB.tsx         # Business floating action button
    │   │   ├── BusinessHeroNumber.tsx   # Large business metric display
    │   │   ├── BusinessInsightLine.tsx  # Business insight text row
    │   │   ├── BusinessSectionHeader.tsx # Business section header
    │   │   └── FilterTabRow.tsx        # Filter/tab row for business lists
    │   └── navigation/
    │       └── CustomTabBar.tsx        # Animated bottom tab bar with center "+" button
    │
    ├── constants/
    │   ├── index.ts                   # CALM palette, COLORS, COLORS_DARK, BIZ,
    │   │                              #   TYPE, TYPOGRAPHY, SPACING, RADIUS, SHADOWS,
    │   │                              #   ICON_SIZE, LETTER_SPACING, BLUR, ANIMATION,
    │   │                              #   categories (expense/income/investment/business/product),
    │   │                              #   billing cycles, budget periods, payment methods,
    │   │                              #   split methods, debt types/statuses,
    │   │                              #   receipt scanner config, app config,
    │   │                              #   withAlpha() helper, coloredShadow() helper
    │   ├── premium.ts                 # Tier limits, wallet colors/icons, feature gates
    │   └── gradients.ts               # Gradient color definitions
    │
    ├── context/
    │   └── ToastContext.tsx            # Global toast notification provider
    │
    ├── hooks/
    │   ├── useBNPLTotal.ts            # Calculate total BNPL/credit obligations
    │   ├── useCategories.ts           # Merged default + custom categories
    │   ├── useFinancialInsights.ts     # Wellness score, velocity, streaks, trends
    │   ├── useIntentEngine.ts         # Hook wrapper for intent detection service
    │   ├── useKeptNumber.ts           # Calculate "kept" amount (income - expenses)
    │   └── useVoiceInput.ts           # Voice recording → Gemini transcription hook
    │
    ├── navigation/
    │   ├── RootNavigator.tsx          # Root stack: auth gating (AuthGatedBusiness),
    │   │                              #   mode switching, all stack screens registered
    │   ├── PersonalNavigator.tsx       # Personal bottom tabs (5 tabs)
    │   ├── BusinessNavigator.tsx       # Dynamic tabs per income type (6 configurations)
    │   └── navigationRef.ts           # Global navigation ref for outside-component nav
    │
    ├── screens/
    │   ├── auth/
    │   │   ├── AuthScreen.tsx            # Phone + password sign up / sign in
    │   │   └── OtpVerificationScreen.tsx  # Telegram OTP verification
    │   │
    │   ├── personal/                  # 12 personal mode screens
    │   │   ├── Dashboard.tsx             # Balance, week bar, insights, quick actions
    │   │   ├── ExpenseEntry.tsx           # Add transaction (text/voice/photo)
    │   │   ├── BudgetPlanning.tsx         # Category budget limits + tracking
    │   │   ├── MoneyChat.tsx             # AI chat with financial context
    │   │   ├── TransactionsList.tsx       # All transactions with search/filter/sort
    │   │   ├── WalletManagement.tsx       # Wallet CRUD + transfers
    │   │   ├── AccountOverview.tsx        # Consolidated wallet overview
    │   │   ├── SavingsTracker.tsx         # Savings accounts + snapshots
    │   │   ├── Goals.tsx                 # Financial goals + milestones
    │   │   ├── SubscriptionList.tsx       # Recurring payments
    │   │   ├── FinancialPulse.tsx         # Wellness score + spending analysis
    │   │   └── Reports.tsx               # Monthly/yearly reports + Excel export
    │   │
    │   ├── seller/                    # 10 seller mode screens
    │   │   ├── Dashboard.tsx             # Season status, earnings, shop link
    │   │   ├── NewOrder.tsx              # WhatsApp paste → AI parse → order creation
    │   │   ├── OrderList.tsx             # Order pipeline (status-filtered)
    │   │   ├── Products.tsx              # Product CRUD + images + drag-to-reorder
    │   │   ├── Customers.tsx             # Customer list (derived from orders + contacts)
    │   │   ├── Manage.tsx                # Hub: products, costs, seasons, transactions
    │   │   ├── CostManagement.tsx        # Season costs (one-time + recurring)
    │   │   ├── SeasonSummary.tsx          # Season close: kept, costs, trends, charts
    │   │   ├── PastSeasons.tsx           # Historical season archive
    │   │   └── Transactions.tsx          # Seller transaction history
    │   │
    │   ├── stall/                     # 8 stall mode screens
    │   │   ├── Dashboard.tsx             # Session status, earnings, quick start
    │   │   ├── SellScreen.tsx            # POS: product grid, cart, QR/cash
    │   │   ├── SessionSetup.tsx          # Pre-session: inventory, condition
    │   │   ├── CloseSession.tsx          # End session + summary
    │   │   ├── SessionSummary.tsx         # Post-session analytics
    │   │   ├── SessionHistory.tsx        # Past sessions list
    │   │   ├── StallProducts.tsx         # Stall product management
    │   │   └── RegularCustomers.tsx      # Frequent buyer tracking
    │   │
    │   ├── business/                  # 11 shared business screens + 4 sub-modes
    │   │   ├── Dashboard.tsx             # Generic business dashboard (fallback)
    │   │   ├── Setup.tsx                 # Income type selection
    │   │   ├── Reports.tsx               # Business reports
    │   │   ├── ClientList.tsx            # Client management (generic)
    │   │   ├── CRM.tsx                   # Customer relationship management
    │   │   ├── Inventory.tsx             # Product inventory (legacy)
    │   │   ├── POS.tsx                   # Point of sale (legacy)
    │   │   ├── LogIncome.tsx             # Log income entry
    │   │   ├── RiderCosts.tsx            # Rider cost logging
    │   │   ├── IncomeStreams.tsx          # Income stream management
    │   │   ├── SupplierList.tsx          # Supplier management
    │   │   │
    │   │   ├── freelancer/            # 5 freelancer screens
    │   │   │   ├── FreelancerDashboard.tsx  # Freelancer home
    │   │   │   ├── ClientList.tsx          # Freelancer client list
    │   │   │   ├── ClientDetail.tsx        # Client detail + payment history
    │   │   │   ├── AddPayment.tsx         # Log payment from client
    │   │   │   └── FreelancerReports.tsx   # Freelancer analytics
    │   │   │
    │   │   ├── parttime/              # 5 part-time screens
    │   │   │   ├── PartTimeDashboard.tsx   # Part-time home
    │   │   │   ├── PartTimeSetup.tsx      # Main vs side config
    │   │   │   ├── AddIncome.tsx           # Log income (main/side)
    │   │   │   ├── IncomeHistory.tsx       # Income history log
    │   │   │   └── PartTimeReports.tsx    # Part-time analytics
    │   │   │
    │   │   ├── ontheroad/             # 6 on-the-road screens
    │   │   │   ├── OnTheRoadDashboard.tsx  # Rider home
    │   │   │   ├── OnTheRoadSetup.tsx     # Vehicle config
    │   │   │   ├── AddEarnings.tsx         # Log daily earnings
    │   │   │   ├── AddCost.tsx            # Log petrol/toll/maintenance
    │   │   │   ├── CostHistory.tsx        # Cost history log
    │   │   │   └── OnTheRoadReports.tsx   # Rider analytics
    │   │   │
    │   │   └── mixed/                 # 6 mixed mode screens
    │   │       ├── MixedDashboard.tsx      # Mixed streams home
    │   │       ├── MixedSetup.tsx         # Create named streams
    │   │       ├── AddIncome.tsx           # Log income to stream
    │   │       ├── AddCost.tsx            # Log cost to stream
    │   │       ├── StreamHistory.tsx       # Per-stream history
    │   │       └── MixedReports.tsx       # Mixed analytics
    │   │
    │   ├── notes/                     # 4 notes screens/components
    │   │   ├── NotesHome.tsx             # Notes list + new note
    │   │   ├── NoteEditor.tsx            # Note editing with AI intent
    │   │   ├── ConfirmationCard.tsx       # Intent confirmation UI
    │   │   └── QueryResultCard.tsx       # Data query result display
    │   │
    │   └── shared/                    # 4 shared screens
    │       ├── Settings.tsx              # App settings (currency, name, QRs, categories,
    │       │                             #   haptics, data export/import, account)
    │       ├── DebtTracking.tsx           # Debt & split management
    │       ├── ReceiptScanner.tsx         # Camera → OCR → Gemini → transaction
    │       └── Onboarding.tsx            # First-launch guided tour
    │
    ├── services/
    │   ├── geminiClient.ts              # Gemini API wrapper (rate limiting, cooldown, key check)
    │   ├── aiService.ts                 # AI parsing (transactions, products, chat responses)
    │   ├── moneyChat.ts                 # Chat context builder (2s TTL cache)
    │   ├── chatActions.ts               # Chat action parser + executor (unique ID generation)
    │   ├── intentEngine.ts              # Note intent detection (expense/debt/subscription/query)
    │   ├── manglishParser.ts            # Malaysian English + Malay text parser
    │   ├── queryEngine.ts               # Natural language data queries
    │   ├── spendingMirror.ts            # AI spending insights + pattern analysis
    │   ├── receiptScanner.ts            # Gemini receipt parsing (vendor, items, tax, total)
    │   ├── ocrService.ts                # Google Cloud Vision OCR
    │   ├── speechService.ts             # Google Cloud Speech-to-Text (legacy, replaced by Gemini)
    │   ├── supabase.ts                  # Supabase client (auth + storage + realtime + session)
    │   ├── sellerSync.ts                # Push/pull sync, image uploads, profile management
    │   ├── pushNotifications.ts          # Expo push notification setup + handling
    │   └── haptics.ts                   # Haptic feedback patterns (light, medium, selection, success)
    │
    ├── store/                         # 20 Zustand stores (see Data Architecture section)
    │
    ├── types/
    │   └── index.ts                     # All TypeScript type definitions
    │
    └── utils/
        ├── parseWhatsAppOrder.ts        # Malay-aware WhatsApp message parser
        ├── splitCalculator.ts           # Equal/custom/item-based split math
        ├── enrichTransaction.ts         # AI context enrichment (time, day, frequency)
        ├── explainMonth.ts              # Personal monthly spending insights (AI text)
        ├── explainBusinessMonth.ts      # Generic business month insights
        ├── explainSellerMonth.ts        # Seller mode month insights
        ├── explainStallSession.ts       # Stall session analytics text
        ├── explainStallHistory.ts       # Stall history summary text
        ├── explainFreelancerMonth.ts    # Freelancer month insights
        ├── explainPartTimeMonth.ts      # Part-time month insights
        ├── explainOnTheRoadMonth.ts     # Rider month insights
        ├── explainMixedMonth.ts         # Mixed streams month insights
        ├── transferBridge.ts            # Business → personal wallet transfer
        ├── formatters.ts                # Number/currency/date formatting helpers
        ├── safeDate.ts                  # Safe date parsing (prevents Invalid Date crashes)
        ├── validation.ts                # Input validation utilities
        ├── accessibility.ts             # Accessibility helpers
        ├── animations.ts                # Animation presets and helpers
        ├── calculateBuffer.ts           # Buffer calculation for financial forecasting
        ├── colorScheme.ts               # Color scheme utilities
        ├── fadeSlide.ts                 # Fade + slide animation config
        └── performance.ts               # Performance monitoring utilities
```

---

## Setup

```bash
# Clone
git clone https://github.com/zafranzamani99-ui/Potraces.git
cd Potraces

# Install
npm install

# Environment variables (create .env from .env.example)
EXPO_PUBLIC_GEMINI_API_KEY=your_gemini_api_key
EXPO_PUBLIC_SUPABASE_URL=https://iydqeeonaljqapulboaz.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Run
npm start
```

Scan the QR code with Expo Go, or press `i` for iOS simulator / `a` for Android emulator.

The app works without API keys — AI features gracefully degrade and let you enter things manually.

### Android Permissions

```
READ_CONTACTS        — splitting expenses with contacts
WRITE_CONTACTS       — saving contact info
RECORD_AUDIO         — voice input for Money Chat
MODIFY_AUDIO_SETTINGS — audio recording configuration
Camera               — receipt scanning, product photos
Photo library        — receipt scanning, product photos
```

### Expo Plugins

```
expo-contacts         — contact access for splits
expo-image-picker     — camera + gallery for receipts/products
@react-native-community/datetimepicker — date/time selection
expo-audio            — voice recording
expo-notifications    — push notifications for order alerts
expo-font             — custom font loading
expo-asset            — asset preloading
```

---

## Deployment

- **Order page**: Auto-deploys to Vercel on push (`docs/index.html`). Config: `vercel.json` → `outputDirectory: "docs"`, no build, no framework.
- **Database migrations**: `npx supabase db push --linked`
- **OTA updates**: EAS Update configured (owner: `zafranzamani`, project: `48e7d14d-4320-467b-a02a-72d41a4d33d9`). Runtime version policy: `appVersion`.
- **APK builds**: `eas build --platform android --profile preview`
- **Bundle ID**: `com.potraces.app` (both iOS and Android)

---

## Documentation

| File | What it covers |
|------|---------------|
| `docs/BUILDING_CHECKLIST.md` | Recurring perf, keyboard, nav, styling, and data integrity issues |
| `docs/DEPLOYMENT_CHECKLIST.md` | Pre-deployment verification steps |
| `docs/QUICKSTART.md` | Getting started guide |
| `docs/SELLER_MODE_AUDIT.md` | Seller mode readiness audit (87.78% score) |
| `docs/AI_SCENARIOS.md` | AI integration scenarios and edge cases |
| `docs/Potraces_Integration_Plan.pdf` | Integration planning document |

---

## Who This Is For

Malaysians who:
- Earn irregularly and are tired of apps that assume a steady paycheck
- Sell kuih from home and track orders on WhatsApp
- Set up a stall at pasar malam and want to know what they kept
- Ride for Grab and want to know what they actually keep after petrol
- Freelance and juggle multiple clients with different payment timelines
- Work a main job but have side income they want to track separately
- Have multiple income streams and want to see them all in one place
- Just want to see their money without feeling bad about it

---

Built with care for people whose relationship with money is complicated. Because most people's is.
