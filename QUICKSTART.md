# FinFlow - Quick Start Guide

Get FinFlow running in under 5 minutes!

## Prerequisites Check

Make sure you have:
- [ ] Node.js installed (check: `node --version`)
- [ ] npm installed (check: `npm --version`)
- [ ] Expo CLI installed (if not: `npm install -g expo-cli`)

## Installation Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Development Server
```bash
npm start
```

This will open the Expo Dev Tools in your browser.

### 3. Run the App

Choose one option:

**Option A: Physical Device** (Easiest!)
1. Install "Expo Go" app from App Store or Play Store
2. Scan the QR code shown in the terminal or browser
3. App will load on your device

**Option B: iOS Simulator** (Mac only)
1. Press `i` in the terminal
2. Simulator will launch automatically

**Option C: Android Emulator**
1. Make sure Android Studio is installed
2. Start an Android Virtual Device (AVD)
3. Press `a` in the terminal

## First Time Setup

### Personal Mode

1. **Add Your First Transaction**
   - Tap the "Add Expense" tab (plus icon)
   - Select "Expense" or "Income"
   - Enter amount (e.g., 50.00)
   - Choose a category (e.g., Food & Dining)
   - Add description (e.g., "Lunch at cafe")
   - Tap "Add Expense"

2. **Create a Budget**
   - Tap the "Budget" tab (pie chart icon)
   - Tap "Create Budget"
   - Select category
   - Enter budget amount
   - Choose period (Monthly recommended)
   - Tap "Create"

3. **Add a Subscription** (Optional)
   - Tap the "Subscriptions" tab (repeat icon)
   - Tap "Add Subscription"
   - Enter name (e.g., "Netflix")
   - Enter amount and billing cycle
   - Tap "Add"

### Business Mode

1. **Switch to Business Mode**
   - Tap the "Business" button at the top

2. **Add Your First Product**
   - Tap the "Inventory" tab (package icon)
   - Tap "Add Product"
   - Enter product name (e.g., "Coca Cola 500ml")
   - Select category
   - Enter selling price and cost
   - Enter initial stock
   - Tap "Add"

3. **Make a Sale**
   - Tap the "POS" tab (shopping cart icon)
   - Tap on a product to add to cart
   - Adjust quantity if needed
   - Tap "Checkout"
   - Select payment method (Cash/Digital/Card)
   - Sale complete!

## Tips for New Users

### Personal Finance Tips
- ✅ Add transactions as they happen for accuracy
- ✅ Review your Dashboard weekly to track spending
- ✅ Set realistic budgets based on past spending
- ✅ Use tags to categorize related expenses

### Business Tips
- ✅ Keep inventory updated to avoid overselling
- ✅ Set low stock thresholds for popular items
- ✅ Review daily sales in the Dashboard
- ✅ Track supplier information for easy reordering
- ✅ Use the POS in landscape mode for easier access

## Common Issues

### "Cannot find module" errors
```bash
rm -rf node_modules
npm install
```

### Metro bundler stuck
```bash
npx expo start --clear
```

### App crashes on startup
- Clear Expo cache: `npx expo start -c`
- Restart your device/simulator

## Next Steps

1. ⭐ Explore all features in both modes
2. ⭐ Check the Reports tab for visual insights
3. ⭐ Customize categories in `src/constants/index.ts`
4. ⭐ Read the full README.md for advanced features

## Need Help?

- Check the main README.md for detailed documentation
- Review the project structure to understand the code
- Examine the screens in `src/screens/` for examples

---

**You're ready to go! Start tracking your finances and managing your business with FinFlow.**
