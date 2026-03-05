# Potraces

A money app that doesn't make you feel bad about money.

Potraces is built for Malaysians who earn in different ways — salary, freelance, delivery rides, roadside stalls, home-based selling, or all of the above. It tracks what comes in and what goes out, and talks to you like a friend, not a financial advisor.

No "profit". No "loss". No "you should save more". Just honest numbers and calm observations.

---

## How it works

The app runs in two modes: **Personal** (your daily money) and **Business** (your earnings). You switch between them with a toggle at the top of the screen. Each mode has its own dashboard, navigation, and data — but they share wallets, debts, and settings.

### Personal Mode Flow

```
Open app
  → Dashboard (balance, week timeline, insights, quick actions)
    → Tap "Add" → ExpenseEntry (manual, voice, or photo)
    → Tap insight card → FinancialPulse (wellness score, velocity, streaks)
    → Tap quick action → Wallets / Savings / Debts / Commitments / Reports / Goals / Chat / Scan
  → Budget tab → Set category limits, track spending vs budget
  → Money Chat tab → Ask questions about your money in plain language
  → Settings tab → Currency, name, QR codes, categories, haptics, data
```

**Adding a transaction:**
1. Tap the center "+" button on the tab bar
2. Choose input method: type text, speak, or take a photo
3. AI parses it into a structured transaction (amount, category, wallet)
4. Review, adjust if needed, and save
5. Transaction appears in the list, wallet balance updates, budget tracking updates

**Wallet system:**
- Create wallets by type: Bank (Maybank, CIMB, etc.), E-Wallet (TNG, GrabPay, Boost), or Credit/BNPL (Atome, SPayLater)
- Each transaction is linked to a wallet
- Transfer between wallets with one tap
- Credit wallets track `creditLimit`, `usedCredit`, and `balance` (available credit) separately
- Dashboard hero balance **excludes credit wallets** — credit isn't cash

**Budget flow:**
1. Set a limit for a category (e.g., Food: RM 500/month)
2. Every expense in that category automatically deducts from the budget
3. When you're close, it says "getting close" — not "danger"
4. When exceeded, it notes it calmly — no red alerts

### Business Mode Flow

When you first enter business mode, you pick your income type. The entire bottom navigation changes:

```
Business Mode Setup
  → Choose income type: Seller / Stall / Freelance / Part-time / Rider / Mixed
  → Navigation tabs change to match your type
  → Each type gets exactly the screens it needs
```

#### Seller Mode Flow (WhatsApp order-based)

Built for home-based food sellers who take orders on WhatsApp.

```
Seller Navigation: Orders | + New Order | Products | Seasons | Manage

New order flow:
  1. Paste WhatsApp message → Local Malay parser extracts items
     ("nak order semperit kuning 2 tin dan jem tart 1 tin" → 2 items parsed)
  2. If parser fails → AI fallback (Claude Haiku)
  3. Add customer name, phone, address
  4. Review items, adjust quantities/prices
  5. Save → Order appears in pipeline

Order lifecycle:
  Pending → Confirmed → Ready → Delivered → Completed
  Each status change updates the order card with softer status colors.
  Payment can be recorded at any stage.

Season flow:
  1. Start a season (Raya, CNY, Deepavali, or custom)
  2. All orders created during the season link to it
  3. Log ingredient costs against the season
  4. Close season → Summary shows:
     - What you kept (big number, light weight)
     - How many orders fulfilled
     - How many customers trusted your food
     - Cost breakdown, product performance, daily trend chart
  5. Transfer earnings to personal wallet

Product management:
  - Add products with name, price per unit, cost per unit
  - Custom units: tin, balang, kotak, pack, piece (or create your own)
  - "Kept per unit" calculated automatically (price - cost)
  - Stock tracking with low-stock indicators

Customer management:
  - Customers auto-created from order history
  - Import from phone contacts
  - Search, sort, filter by outstanding/repeat
  - Tap to call or WhatsApp directly
  - Track total orders, total spent, outstanding amount per customer

Cost management:
  - Log ingredient costs with description and amount
  - Attach to specific season or standalone
  - Budget tracking per season
  - Cost templates for repeated purchases
```

#### Stall Mode Flow (session-based POS)

Built for pasar malam vendors and roadside sellers.

```
Stall Navigation: Dashboard | Sell | History | Regulars

Session flow:
  1. Tap "Start Session" on dashboard
  2. Set starting inventory per product (optional)
  3. Choose condition: good / slow / rainy / hot
  4. POS sell screen:
     - Product grid with + / - quantity buttons
     - Collapsible cart shows running total
     - Toggle payment: QR or Cash
     - Apply discount if needed
     - Each sale auto-decrements inventory
  5. Close session → Summary:
     - Total revenue, cash vs QR breakdown
     - Product-by-product sales count
     - Duration and revenue per hour
     - AI observation about the session
  6. Transfer earnings to personal wallet

Regular customers:
  - Track frequent buyers by name
  - Record usual order, visit count, last visit
  - Notes field for preferences
```

#### Other Business Modes

| Mode | Who it's for | Key flow |
|------|-------------|----------|
| **Freelance** | Designers, writers, tutors | Log payments per client → Track total earned per client → View averages and trends |
| **Part-time** | Main job + side income | Toggle "Main" vs "Side" when logging → See split breakdown → Monthly comparison |
| **Rider** | Grab, Foodpanda, Lalamove | Log daily earnings → Log costs (petrol, maintenance, toll) → See net kept after costs |
| **Mixed** | Multiple income streams | Create named streams with colors → Log from any stream → Combined and per-stream reports |

### Shared Features (Both Modes)

#### Debt & Split Tracking

```
Debt flow:
  1. Add debt → Pick contact → Choose "I Owe" or "They Owe Me"
  2. Enter amount and description
  3. Debt appears in list with status: Pending
  4. Record partial payments → Status moves to Partial
  5. When fully paid → Status moves to Settled
  6. Each payment can be linked to a wallet (money comes in/goes out)
  7. Request payment via WhatsApp (auto-generates message with amount + optional QR)

Split flow:
  1. Add split → Enter total amount and description
  2. Add participants (from contacts or manual)
  3. Choose split method:
     - Equal: divide evenly
     - Custom: set specific amounts per person
     - Item-based: assign receipt items to people
  4. Tax handling: divide among participants or waive
  5. Track who has paid and who hasn't
  6. Mark participants as paid when they settle up

Split from receipt:
  1. Scan receipt with camera
  2. OCR extracts items and amounts
  3. Assign items to participants
  4. System calculates each person's share including tax
```

#### Settings & Configuration

- **Payment QR codes** — Add multiple QR images, label them. Used on Dashboard (tap QR icon to show) and in debt payment requests (attach to WhatsApp message).
- **Custom categories** — Add, rename, reorder expense/income/business categories. Overrides persist across sessions.
- **Context-aware sections** — Settings shows categories in personal mode, product units in seller/stall mode.
- **Navigate to section** — "Manage in Settings" links from CategoryPicker/Dashboard scroll directly to the relevant Settings section.

#### Receipt Scanner

1. Take a photo or pick from gallery
2. Google Cloud Vision extracts text
3. Gemini parses text into structured data (vendor, items, tax, total, date)
4. Review extracted data, adjust if needed
5. Create transaction from receipt, or send items to split screen

#### Money Chat

Ask questions about your money in plain language:
- "Where does most of my money go?"
- "Am I spending more this month?"
- "How was business compared to last month?"
- "Can I afford a new phone?"

Powered by Claude Haiku. Works in both personal and business mode with full context of your transactions.

---

## Design Philosophy

### CALM Design System

The app uses an anxiety-reducing visual language:

- **Palette** — Warm off-white background (`#FFFFFF`), olive accent (`#4F5104`), bronze secondary (`#B2780A`), gold highlight (`#DEAB22`). No red anywhere. No bright green.
- **Typography** — Hero amounts in large, light type (48px, weight 200). Labels in small muted text (11px). Numbers always bigger than labels.
- **Spacing** — 8-point grid system. Generous padding inside cards (16px). Breathing room between elements.
- **Shadows** — Maximum opacity 0.06. Subtle, not dramatic.
- **Surfaces** — Every interactive element sits inside a container with background, border, and radius.
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

The AI observes — "Slower than last month. That happens between seasons." It never judges.

### Interaction Patterns

- **Modals** — Selection modals float centered. Input modals slide up as bottom sheets.
- **Lists** — Long press enters selection mode with checkboxes. Single select = Edit + Delete. Multi select = Bulk Delete. No per-item buttons visible by default.
- **Progressive disclosure** — Expandable content shows a chevron icon. Cards expand on tap to reveal actions.
- **Tabs** — Single indicator (bottom border OR filled background, never both).
- **Filters** — Pill chips with `flexWrap: 'wrap'`. Tap to select, tap again to deselect.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native 0.81 + Expo SDK 54 |
| Language | TypeScript 5.3 |
| State | Zustand 4.5 + Immer + AsyncStorage persistence |
| Navigation | React Navigation 7 (Stack + Dynamic Bottom Tabs) |
| AI | Claude Haiku via Anthropic REST API |
| OCR | Google Cloud Vision |
| Receipt Parsing | Gemini Vision |
| Speech | Google Cloud Speech-to-Text |
| Charts | react-native-chart-kit |
| Animations | react-native-reanimated 4.1 |
| Haptics | expo-haptics |
| Date handling | date-fns |
| Icons | Feather (via @expo/vector-icons) |
| Drag & Drop | react-native-draggable-flatlist |
| Export | xlsx (Excel export) |

---

## Data Architecture

### Stores (Zustand + AsyncStorage)

All data persists locally on-device. No cloud sync (yet).

| Store | What it manages |
|-------|----------------|
| **appStore** | Active mode (personal / business) |
| **personalStore** | Transactions, subscriptions, budgets, goals |
| **businessStore** | Income type, business transactions, clients, streams, transfers |
| **sellerStore** | Products, orders, seasons, ingredient costs, customers, custom units |
| **stallStore** | Sessions, sales, stall products, regular customers |
| **walletStore** | Wallets (bank/ewallet/credit), transfers, credit tracking |
| **debtStore** | Debts, split expenses, payments, participant tracking |
| **settingsStore** | Currency, user name, payment QRs, haptics, notifications |
| **categoryStore** | Custom categories, overrides, ordering |
| **premiumStore** | Subscription tier, scan count, feature gates |
| **savingsStore** | Savings accounts, value snapshots over time |
| **freelancerStore** | Freelancer clients and payments |
| **partTimeStore** | Main/side income tracking |
| **onTheRoadStore** | Vehicle setup, earnings, costs by category |
| **mixedStore** | Multiple income streams, combined tracking |

### Core Data Models

```
Transaction     — amount, category, date, type, wallet, AI context
Wallet          — type (bank/ewallet/credit), balance, creditLimit, usedCredit
Debt            — contact, type (i_owe/they_owe), totalAmount, paidAmount, payments[], status
SplitExpense    — participants[], items[], splitMethod, taxAmount, taxHandling
SellerOrder     — items[], customer, status pipeline, payment tracking
SellerProduct   — name, pricePerUnit, costPerUnit, unit, stock
Season          — dateRange, orders, costs, budget
StallSession    — startTime, endTime, sales[], revenue (cash/QR split)
Goal            — target, deadline, contributions[], milestones
Subscription    — name, amount, frequency, nextDueDate
Budget          — category, limit, period, spent
```

---

## Project Structure

```
src/
├── components/common/       # 25+ reusable components
│   ├── AnimatedNumber       # Count-up animation for balances
│   ├── Button               # Primary/secondary/ghost with loading state
│   ├── Card                 # Container with variants (elevated/outlined/filled)
│   ├── CategoryPicker       # Modal category selector with "Manage in Settings" link
│   ├── CollapsibleSection   # Expandable section with subtitle hint
│   ├── ContactPicker        # Contact selector with phone import
│   ├── EmptyState           # Empty list with icon and optional CTA
│   ├── FAB                  # Floating action button
│   ├── ModeToggle           # Personal/Business animated toggle
│   ├── PaywallModal         # Premium tier upsell
│   ├── ProgressBar          # Animated linear progress
│   ├── StatCard             # KPI display (icon + label + value + trend)
│   ├── Toast                # Notification system
│   ├── TransactionItem      # Transaction row (category/amount/date)
│   ├── UnitManager          # Custom unit CRUD modal
│   ├── WalletPicker         # Wallet selector modal
│   └── WeekBar              # 7-day timeline with daily segments
├── constants/
│   ├── index.ts             # CALM palette, typography, spacing, categories, wallet presets
│   └── premium.ts           # Free vs premium tier limits (3 wallets, 5 budgets, 15 scans)
├── context/
│   └── ToastContext.tsx      # Global toast notification provider
├── hooks/
│   ├── useCategories.ts     # Merged default + custom categories
│   └── useFinancialInsights.ts  # Wellness score, velocity, streaks
├── navigation/
│   ├── RootNavigator.tsx    # Root stack (all screens)
│   ├── PersonalNavigator.tsx # Personal bottom tabs (5 tabs)
│   └── BusinessNavigator.tsx # Dynamic bottom tabs per income type
├── screens/
│   ├── personal/            # 12 screens
│   │   ├── Dashboard        # Hero balance, insights, week timeline, quick actions
│   │   ├── ExpenseEntry     # Manual/voice/photo transaction entry
│   │   ├── BudgetPlanning   # Category budgets with spending tracking
│   │   ├── MoneyChat        # AI Q&A about spending
│   │   ├── SubscriptionList # Recurring payments and installments
│   │   ├── FinancialPulse   # Wellness score, velocity, patterns
│   │   ├── SavingsTracker   # Investment tracking with snapshots
│   │   ├── Goals            # Savings targets with milestones and confetti
│   │   ├── TransactionsList # Browseable transaction history
│   │   ├── WalletManagement # Create/edit/transfer wallets
│   │   ├── AccountOverview  # Net worth across all accounts
│   │   └── Reports          # Spending analytics by category
│   ├── seller/              # 8 screens
│   │   ├── Dashboard        # KPIs, unpaid tracking, AI observation
│   │   ├── NewOrder         # WhatsApp paste → parsed order
│   │   ├── OrderList        # Status pipeline with filters
│   │   ├── Products         # Catalog with custom units
│   │   ├── CostManagement   # Ingredient costs and budgets
│   │   ├── Customers        # Contact import, outstanding tracking
│   │   ├── SeasonSummary    # End-of-season recap
│   │   └── PastSeasons      # Historical season browse
│   ├── stall/               # 8 screens
│   │   ├── Dashboard        # Active session, lifetime stats
│   │   ├── SellScreen       # POS grid, cart, QR/cash toggle
│   │   ├── SessionSetup     # Inventory + condition setup
│   │   ├── CloseSession     # Finalize totals
│   │   ├── SessionSummary   # Revenue breakdown + AI observation
│   │   ├── SessionHistory   # Past sessions list
│   │   ├── StallProducts    # Product catalog
│   │   └── RegularCustomers # Frequent buyer tracking
│   ├── business/            # 11+ screens (shared business + sub-modes)
│   │   ├── Dashboard, Setup, LogIncome, Reports
│   │   ├── freelancer/      # Dashboard, ClientList, ClientDetail, AddPayment, Reports
│   │   ├── parttime/        # Setup, AddIncome, IncomeHistory, Reports
│   │   ├── ontheroad/       # Setup, AddEarnings, AddCost, CostHistory, Reports
│   │   └── mixed/           # Setup, AddIncome, AddCost, StreamHistory, Reports
│   └── shared/              # 3 screens
│       ├── Settings         # Preferences, QR codes, context-aware sections
│       ├── DebtTracking     # Debts + splits with tap-to-expand cards
│       └── ReceiptScanner   # OCR receipt → structured data
├── services/
│   ├── aiService.ts         # Claude Haiku API (parsing, chat, insights)
│   ├── receiptScanner.ts    # Gemini Vision receipt parsing
│   ├── ocrService.ts        # Google Cloud Vision text extraction
│   ├── speechService.ts     # Google Cloud Speech-to-Text
│   └── haptics.ts           # Haptic feedback (light tap, selection changed)
├── store/                   # 15 Zustand stores with AsyncStorage persistence
├── types/
│   └── index.ts             # All TypeScript definitions
└── utils/
    ├── parseWhatsAppOrder   # Local Malay-aware WhatsApp message parser
    ├── splitCalculator      # Equal/custom/item-based split calculation
    ├── enrichTransaction    # AI context (time, day, size, frequency, emotion)
    ├── explainMonth         # Personal month insights
    ├── explainBusinessMonth # Business month observations
    ├── explainSellerMonth   # Seller observations
    ├── explainStallSession  # Stall session AI commentary
    ├── calculateBuffer      # "X months covered" from savings
    └── transferBridge       # Business → personal transfer helper
```

---

## Premium Model

| Feature | Free | Premium (RM 10/month) |
|---------|------|----------------------|
| Wallets | 3 max (1 per type) | Unlimited |
| Budgets | 5 max | Unlimited |
| Receipt scans | 15/month | Unlimited |
| Export data | Yes | Yes |
| Google Docs sync | No | Yes |

---

## Current Progress

### Done

- [x] Personal mode — dashboard, transactions, budgets, wallets, savings, subscriptions, debt tracking
- [x] Business mode — 6 income types with dynamic navigation per type
- [x] Seller mode — WhatsApp order parsing, order pipeline, products, seasons, customers, cost management
- [x] Stall mode — session-based POS, product grid, cart, QR/cash split, inventory, regular customers
- [x] Goals — savings targets with milestones, contributions, confetti on progress
- [x] Financial Pulse — wellness score, spending velocity, weekly patterns, no-spend streaks
- [x] Money Chat — plain-language Q&A powered by Claude Haiku
- [x] Receipt scanner — Google Cloud Vision OCR + Gemini parsing
- [x] AI-powered transaction entry — text, voice, or photo parsed into structured transactions
- [x] CALM design system — anxiety-reducing palette, light typography, no red anywhere
- [x] 25+ reusable components — cards, buttons, toasts, skeleton loaders, confetti, unit manager, etc.
- [x] Custom categories — add, rename, reorder, override default categories
- [x] Custom units — seller/stall product units (tin, balang, kotak, etc.)
- [x] Premium paywall — free tier with limits, RM 10/month for unlimited
- [x] Transfer bridge — move money between business and personal with one tap
- [x] Debt & splits — track who owes who, split by equal/custom/item with tax handling
- [x] Payment QR codes — add multiple QRs, show on dashboard, attach to WhatsApp requests
- [x] Collapsible sections — reusable component with subtitle hints when collapsed
- [x] Context-aware settings — categories shown in personal mode, product units in seller/stall mode
- [x] Deep-link navigation — "Manage in Settings" scrolls to the right section
- [x] Performance optimizations — selective Zustand selectors, useMemo, useCallback across all screens
- [x] Tap-to-expand debt cards — progressive disclosure with chevron affordance
- [x] Merged filter system — type + status filters in one row with toggle behavior

### Not Yet Done

- [ ] Cloud sync for multi-device
- [ ] Export season summaries as shareable images
- [ ] Ingredient cost templates (so you don't re-enter tepung every time)
- [ ] Repeat order from past customers
- [ ] Dark mode
- [ ] Bahasa Malaysia full UI translation
- [ ] Google Docs sync (premium feature, UI exists but not connected)

---

## Setup

```bash
# Clone
git clone https://github.com/zafranzamani99-ui/Potraces.git
cd Potraces

# Install
npm install

# Environment variables (create .env)
EXPO_PUBLIC_ANTHROPIC_API_KEY=your_claude_api_key
EXPO_PUBLIC_GOOGLE_VISION_API_KEY=your_vision_api_key
EXPO_PUBLIC_GOOGLE_SPEECH_API_KEY=your_speech_api_key

# Run
npm start
```

Scan the QR code with Expo Go, or press `i` for iOS simulator / `a` for Android emulator.

The app works without API keys — AI features (text parsing, receipt scanning, voice input, Money Chat) gracefully degrade and let you enter things manually.

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
