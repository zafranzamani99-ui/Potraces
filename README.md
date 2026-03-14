# Potraces

A money app that doesn't make you feel bad about money.

Built for Malaysians who earn in different ways — salary, freelance, delivery rides, roadside stalls, home-based selling, or all of the above. It tracks what comes in and what goes out, and talks to you like a friend, not a financial advisor.

No "profit". No "loss". No "you should save more". Just honest numbers and calm observations.

---

## How it works

The app runs in two modes: **Personal** (your daily money) and **Business** (your earnings). You switch between them with a toggle at the top of the screen. Each mode has its own dashboard, navigation, and data — but they share wallets, debts, and settings.

### Personal Mode

```
Dashboard → balance, week timeline, insights, quick actions
  → Tap "Add" → ExpenseEntry (manual, voice, or photo)
  → Quick actions → Wallets / Savings / Debts / Commitments / Reports / Goals / Chat / Scan
Budget tab → category limits, spending vs budget tracking
Money Chat tab → plain-language AI Q&A about your spending
Notes tab → freeform notes with AI intent detection
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

### Business Mode

When you first enter business mode, you pick your income type. Navigation tabs change to match:

```
Choose income type: Seller / Stall / Freelance / Part-time / Rider / Mixed
→ Navigation and screens adapt to your type
```

#### Seller Mode (WhatsApp order-based + Online Order Page)

Built for home-based food sellers who take orders on WhatsApp and online.

```
Navigation: Home | Orders | + New Order | Customers | Manage

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
  3. Log ingredient costs against the season
  4. Close season → summary: what you kept, orders fulfilled,
     cost breakdown, product performance, daily trend chart
  5. Transfer earnings to personal wallet

Product management:
  - Name, price per unit, cost per unit, product image
  - Custom units: tin, balang, kotak, pack, piece (or create your own)
  - "Kept per unit" calculated automatically
  - Stock tracking with low-stock indicators
  - Upload product photos (shown in app + order page)

Customer management:
  - Auto-created from order history
  - Import from phone contacts
  - Search, sort, filter by outstanding/repeat
  - Tap to call or WhatsApp
  - Total orders, total spent, outstanding per customer
```

#### Stall Mode (session-based POS)

Built for pasar malam vendors and roadside sellers.

```
Navigation: Dashboard | Sell | History | Regulars

Session flow:
  1. Start session on dashboard
  2. Set starting inventory per product (optional)
  3. Choose condition: good / slow / rainy / hot
  4. POS sell screen: product grid, cart, QR/cash toggle, discount
  5. Close session → summary: total revenue, cash vs QR,
     product sales, duration, revenue per hour
  6. Transfer earnings to personal wallet
```

#### Other Business Modes

| Mode | Who it's for | Key flow |
|------|-------------|----------|
| **Freelance** | Designers, writers, tutors | Log payments per client → track total earned → view averages and trends |
| **Part-time** | Main job + side income | Toggle Main vs Side → split breakdown → monthly comparison |
| **Rider** | Grab, Foodpanda, Lalamove | Log daily earnings → log costs (petrol, toll) → see net kept |
| **Mixed** | Multiple income streams | Named streams with colors → log from any → combined reports |

### Shared Features

#### Debt & Split Tracking

```
Debt: Add → pick contact → "I Owe" or "They Owe Me" → record payments
      → status: Pending → Partial → Settled
      → request payment via WhatsApp with amount + optional QR

Split: Add → enter total → add participants → choose method:
       Equal / Custom / Item-based
       → tax handling → track who paid → mark settled
       → scan receipt to auto-assign items
```

#### Notes (AI-Powered)

Freeform notes with intent detection:
- Write a note like "lunch with Ali RM 25"
- AI detects financial intent (expense, debt, subscription)
- Tap to confirm and create the transaction
- Supports Manglish (Malaysian English + Malay mix)

#### Money Chat

Ask about your money in plain language:
- "Where does most of my money go?"
- "Am I spending more this month?"
- "How was business compared to last month?"

Powered by Gemini. Works in both personal and business mode.

#### Receipt Scanner

1. Take photo or pick from gallery
2. OCR extracts text (Google Cloud Vision)
3. Gemini parses into structured data (vendor, items, tax, total)
4. Create transaction or send items to split screen

---

## Design Philosophy

### CALM Design System

Anxiety-reducing visual language:

- **Palette** — Warm off-white `#F9F9F7`, olive accent `#4F5104`, bronze `#B2780A`, gold `#DEAB22`. No red anywhere.
- **Typography** — Hero amounts: 48px, weight 200. Labels: 11px muted. Numbers always bigger than labels.
- **Spacing** — 8-point grid. Generous padding (16px). Breathing room.
- **Shadows** — Max opacity 0.06. Subtle.
- **Status colors** — Pending: warm amber. Partial: bronze. Settled: calm teal. No red for anything.

### Language Rules (Non-negotiable)

| Never use | Always use |
|-----------|-----------|
| Profit | Kept |
| Loss | Went out |
| Revenue | Came in |
| ROI | — |
| Inventory | Products |
| You should | (never give advice) |

### Semantic Color System

| Meaning | Color | Hex |
|---|---|---|
| I Owe / my responsibility | Terracotta | `#C1694F` |
| My side / involvement | Mauve | `#A688B8` |
| In progress / partial | Bronze | `#B2780A` |
| Resolved / settled | Sky blue | `#6BA3BE` |
| Urgent / pending | Bright gold | `#DEAB22` |
| They Owe / owed to me | Olive | `#4F5104` |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native 0.76 + Expo SDK 52 |
| Language | TypeScript 5.3 |
| State | Zustand 4.5 + Immer + AsyncStorage persistence |
| Navigation | React Navigation 7 (Stack + Dynamic Bottom Tabs) |
| Backend | Supabase (Auth + Postgres + Storage + Realtime) |
| AI | Gemini via REST API |
| OCR | Google Cloud Vision |
| Receipt parsing | Gemini Vision |
| Speech | Google Cloud Speech-to-Text |
| Charts | react-native-chart-kit |
| Animations | react-native-reanimated |
| Haptics | expo-haptics |
| Date handling | date-fns |
| Icons | Feather (via @expo/vector-icons) |
| Drag & Drop | react-native-draggable-flatlist |
| Export | xlsx (Excel export) |
| Hosting | Vercel (order page) |
| OTA Updates | EAS Update |

---

## Backend (Supabase)

Seller mode data syncs to Supabase for multi-device access and the online order page.

### Auth Flow

```
Phone + password sign up → Telegram OTP verification → Session persisted via AsyncStorage
Sign out → stays in business mode → shows AuthScreen
```

### Database Schema

```
seller_profiles  — user_id, display_name, slug, currency, shop_notice, phone, logo_url
seller_products  — user_id, local_id, name, price, cost, unit, stock, image_url
seller_orders    — user_id, profile_id, customer, items, status, payment, source
seller_seasons   — user_id, local_id, name, start/end dates, budget
seller_customers — user_id, local_id, name, phone, address
seller_costs     — user_id, season_id, description, amount, type
```

### Storage Buckets

| Bucket | Purpose |
|--------|---------|
| `shop-logos` | Seller shop logos (public read, owner write) |
| `product-images` | Product photos (public read, owner write) |

### Sync Strategy

- **Pull-before-push**: `pullAll()` fetches remote data first to prevent empty local store from deleting remote records
- **Tombstone logic**: local deletions tracked in `_deletedXxxIds` sets to prevent re-pull
- **Startup**: waits for auth session AND Zustand store hydration before syncing

### Order Page

Static HTML hosted on Vercel at `docs/index.html`:
- Fetches shop profile + products from Supabase REST API client-side
- Customers browse menu, add to cart, submit orders
- Orders inserted into `seller_orders` with `source: 'order_link'`
- Push notification sent to seller via Supabase Edge Function
- Features: image lightbox, skeleton loader, order history, WhatsApp CTA

---

## Data Architecture

### Stores (Zustand + AsyncStorage)

| Store | What it manages |
|-------|----------------|
| **appStore** | Active mode (personal / business) |
| **authStore** | Phone auth, verification status, session |
| **personalStore** | Transactions, subscriptions, budgets, goals |
| **businessStore** | Income type, business transactions, clients, streams |
| **sellerStore** | Products, orders, seasons, costs, customers, units |
| **stallStore** | Sessions, sales, stall products, regular customers |
| **walletStore** | Wallets, transfers, credit tracking |
| **debtStore** | Debts, splits, payments, participant tracking |
| **settingsStore** | Currency, name, payment QRs, haptics |
| **categoryStore** | Custom categories, overrides, ordering |
| **premiumStore** | Subscription tier, feature gates |
| **savingsStore** | Savings accounts, value snapshots |
| **notesStore** | Freeform notes with AI intent |
| **aiInsightsStore** | Cached AI insights, spending mirror |
| **learningStore** | User patterns, category preferences |
| **crmStore** | Customer relationship data |
| **freelancerStore** | Freelancer clients and payments |
| **partTimeStore** | Main/side income tracking |
| **onTheRoadStore** | Vehicle setup, earnings, costs |
| **mixedStore** | Multiple income streams |

### Core Data Models

```
Transaction     — amount, category, date, type, wallet, AI context
Wallet          — type (bank/ewallet/credit), balance, creditLimit, usedCredit
Debt            — contact, type (i_owe/they_owe), totalAmount, paidAmount, payments[]
SplitExpense    — participants[], items[], splitMethod, taxAmount
SellerOrder     — items[], customer, status, payment, deposits[], source (app/order_link)
SellerProduct   — name, pricePerUnit, costPerUnit, unit, stock, imageUrl
Season          — dateRange, orders, costs, budget
StallSession    — startTime, endTime, sales[], revenue (cash/QR)
Goal            — target, deadline, contributions[], milestones
Subscription    — name, amount, frequency, nextDueDate
Budget          — category, limit, period, spent
Note            — content, intent (expense/debt/subscription), confirmed status
```

---

## Project Structure

```
src/
├── components/
│   ├── common/              # Reusable UI components
│   │   ├── AnimatedNumber, Button, Card, CategoryPicker
│   │   ├── CollapsibleSection, ContactPicker, EmptyState
│   │   ├── FAB, FreshStart, ModeToggle, PaywallModal
│   │   ├── ProgressBar, StatCard, Toast, TransactionItem
│   │   ├── UnitManager, WalletPicker, WeekBar
│   │   └── CalendarPicker    # Custom calendar (no external dep)
│   └── navigation/
│       └── CustomTabBar       # Animated bottom tab bar
├── constants/
│   ├── index.ts              # CALM palette, typography, spacing, BIZ colors
│   └── premium.ts            # Tier limits, wallet colors/icons
├── context/
│   └── ToastContext.tsx       # Global toast notifications
├── hooks/
│   ├── useCategories.ts      # Merged default + custom categories
│   ├── useFinancialInsights.ts # Wellness score, velocity, streaks
│   └── useVoiceInput.ts      # Speech-to-text hook
├── navigation/
│   ├── RootNavigator.tsx     # Root stack + auth gating
│   ├── PersonalNavigator.tsx  # Personal bottom tabs
│   └── BusinessNavigator.tsx  # Dynamic tabs per income type
├── screens/
│   ├── personal/             # Dashboard, ExpenseEntry, BudgetPlanning,
│   │                         # MoneyChat, SubscriptionList, FinancialPulse,
│   │                         # SavingsTracker, Goals, TransactionsList,
│   │                         # WalletManagement, AccountOverview, Reports
│   ├── seller/               # Dashboard, NewOrder, OrderList, Products,
│   │                         # CostManagement, Customers, SeasonSummary,
│   │                         # PastSeasons, Manage, Transactions
│   ├── stall/                # Dashboard, SellScreen, SessionSetup,
│   │                         # CloseSession, SessionSummary, SessionHistory,
│   │                         # StallProducts, RegularCustomers
│   ├── business/             # Dashboard, Setup + sub-modes:
│   │   ├── freelancer/       # Dashboard, ClientList, ClientDetail, AddPayment
│   │   ├── parttime/         # Setup, AddIncome, IncomeHistory
│   │   ├── ontheroad/        # Setup, AddEarnings, AddCost, CostHistory
│   │   └── mixed/            # Setup, AddIncome, AddCost, StreamHistory
│   ├── notes/                # NotesHome, NoteEditor, QueryResultCard
│   └── shared/               # Settings, DebtTracking, ReceiptScanner, Onboarding
├── services/
│   ├── supabase.ts           # Supabase client (auth + storage + realtime)
│   ├── sellerSync.ts         # Push/pull sync, image uploads, profile management
│   ├── geminiClient.ts       # Gemini API wrapper
│   ├── aiService.ts          # AI parsing (transactions, products, chat)
│   ├── intentEngine.ts       # Note intent detection (expense/debt/sub)
│   ├── manglishParser.ts     # Malaysian English + Malay parser
│   ├── moneyChat.ts          # Chat context builder
│   ├── chatActions.ts        # Chat action execution
│   ├── queryEngine.ts        # Natural language data queries
│   ├── spendingMirror.ts     # AI spending insights
│   ├── receiptScanner.ts     # Gemini receipt parsing
│   ├── ocrService.ts         # Google Cloud Vision
│   ├── speechService.ts      # Google Cloud Speech-to-Text
│   ├── pushNotifications.ts  # Expo push notifications
│   └── haptics.ts            # Haptic feedback
├── store/                    # 20 Zustand stores with AsyncStorage persistence
├── types/
│   └── index.ts              # All TypeScript definitions
├── utils/
│   ├── parseWhatsAppOrder    # Malay-aware WhatsApp message parser
│   ├── splitCalculator       # Equal/custom/item-based split
│   ├── enrichTransaction     # AI context (time, day, frequency)
│   ├── explainMonth          # Personal/business/seller month insights
│   └── transferBridge        # Business → personal transfer
docs/
│   └── index.html            # Order page (Vercel-hosted)
supabase/
│   └── migrations/           # 16 SQL migration files
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
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Run
npm start
```

Scan the QR code with Expo Go, or press `i` for iOS simulator / `a` for Android emulator.

The app works without API keys — AI features gracefully degrade and let you enter things manually.

---

## Deployment

- **Order page**: Auto-deploys to Vercel on push (`docs/index.html`)
- **Database migrations**: `npx supabase db push --linked`
- **OTA updates**: EAS Update configured (owner: `zafranzamani`, project: `48e7d14d-4320-467b-a02a-72d41a4d33d9`)

---

## Who This Is For

Malaysians who:
- Earn irregularly and are tired of apps that assume a steady paycheck
- Sell kuih from home and track orders on WhatsApp
- Set up a stall at pasar malam and want to know what they kept
- Ride for Grab and want to know what they actually keep after petrol
- Freelance and juggle multiple clients with different payment timelines
- Just want to see their money without feeling bad about it

---

Built with care for people whose relationship with money is complicated. Because most people's is.
