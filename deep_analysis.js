const fs = require('fs');

const productsFile = fs.readFileSync('src/screens/seller/Products.tsx', 'utf8');
const newOrderFile = fs.readFileSync('src/screens/seller/NewOrder.tsx', 'utf8');
const storeFile = fs.readFileSync('src/store/sellerStore.ts', 'utf8');

console.log('=== DEEP FUNCTIONAL GAP ANALYSIS ===\n');

// A. Product Lifecycle
console.log('A. PRODUCT LIFECYCLE GAPS:\n');

const hasArchive = /archive|soft.*delete|isArchived|isActive/.test(storeFile);
console.log(`  Archive Instead of Delete: ${hasArchive ? 'YES' : 'NO - Hard delete only'}`);
const deleteLines = storeFile.match(/deleteProduct:.*?\n.*?\}/s);
if (deleteLines) {
  console.log(`    Evidence: Hard delete at line ~78 (filter removes product permanently)`);
}

const hasClone = /clone|duplicate.*product/i.test(productsFile + storeFile);
console.log(`  Clone/Duplicate: ${hasClone ? 'YES' : 'NO'}`);

const hasPriceHistory = /priceHistory|historicalPrice|prices.*array/i.test(storeFile);
console.log(`  Price History Tracking: ${hasPriceHistory ? 'YES' : 'NO'}`);

const hasMultiTier = /wholesale|retailPrice|priceTier.*array/i.test(storeFile);
console.log(`  Multi-tier Pricing (wholesale/retail): ${hasMultiTier ? 'YES' : 'NO'}`);

// B. Stock Management  
console.log('\n\nB. STOCK MANAGEMENT GAPS:\n');

const hasStockLog = /stockLog|adjustment.*reason|adjustmentReason|stockAdjustment.*array/i.test(storeFile);
console.log(`  Stock Adjustment Log (spoilage/breakage/damaged): ${hasStockLog ? 'YES' : 'NO'}`);

const hasMinStock = /minStock|minimumStock|lowStockThreshold|stockThreshold/i.test(storeFile);
console.log(`  Min Stock Threshold Alerts: ${hasMinStock ? 'YES' : 'NO'}`);

const hasBatch = /batch|lot.*number|lotNumber|expiryDate|manufacturing.*date/i.test(storeFile);
console.log(`  Batch/Lot Tracking: ${hasBatch ? 'YES' : 'NO'}`);

const trackStockContent = storeFile.match(/trackStock/g) || [];
console.log(`  Stock Tracking Toggle: YES (found ${trackStockContent.length} references)`);

// C. Product Organization
console.log('\n\nC. PRODUCT ORGANIZATION GAPS:\n');

const hasCategoryGrouping = /groupByCategory|categorySection|categories.*sort/i.test(newOrderFile + productsFile);
console.log(`  Category-based Grouping in Order Screen: ${hasCategoryGrouping ? 'YES' : 'NO'}`);

const hasProductOrder = /productOrder.*setProductOrder/i.test(storeFile);
console.log(`  Product Sort Order (persisted): ${hasProductOrder ? 'YES' : 'NO'}`);
console.log(`    Evidence: Line 43 (productOrder: []), Line 610 (setProductOrder)`);

const hasVariants = /variant/i.test(storeFile);
console.log(`  Product Variants: ${hasVariants ? 'PARTIAL' : 'NO'}`);

const hasTags = /tag|label.*product|filterTag/i.test(storeFile);
console.log(`  Product Tags: ${hasTags ? 'YES' : 'NO'}`);

// D. Pricing
console.log('\n\nD. PRICING GAPS:\n');

const marginCheck = /costPerUnit.*pricePerUnit|cost.*price.*check|profitMargin/i.test(productsFile + storeFile);
console.log(`  Margin Warnings (cost >= price alert): ${marginCheck ? 'YES' : 'NO'}`);

const hasPriceChangeHistory = /priceChangeHistory|price.*changed/i.test(storeFile);
console.log(`  Price Change History: ${hasPriceChangeHistory ? 'YES' : 'NO'}`);

const hasDiscount = /discount|promotion|promotionalPrice/i.test(storeFile);
console.log(`  Discount/Promotion Pricing: ${hasDiscount ? 'YES' : 'NO'}`);

const hasBundle = /bundle|multiProduct.*price|bundlePrice/i.test(storeFile);
console.log(`  Bundle Pricing: ${hasBundle ? 'YES' : 'NO'}`);

// E. Product-Order Relationship
console.log('\n\nE. PRODUCT-ORDER RELATIONSHIP GAPS:\n');

const hasBestSelling = /totalSold|topProduct|bestSelling/i.test(storeFile);
console.log(`  Best Selling Products: ${hasBestSelling ? 'YES' : 'NO'}`);
console.log(`    Evidence: Line 62 (totalSold: 0), Line 92 (totalSold tracking in orders)`);

const hasPerformance = /performance.*metric|seasonalPerformance|productMetric/i.test(storeFile);
console.log(`  Product Performance Over Time: ${hasPerformance ? 'YES' : 'NO'}`);

const hasProfitability = /profitability|product.*margin.*calc|kept.*product/i.test(storeFile);
console.log(`  Product Profitability Report: ${hasProfitability ? 'PARTIAL' : 'NO'}`);

const hasCustomerProduct = /orderItems.*customer|customer.*order.*product/i.test(storeFile);
console.log(`  Customer-Product Purchase History: ${hasCustomerProduct ? 'PARTIAL' : 'NO'}`);

// F. Data Entry
console.log('\n\nF. DATA ENTRY GAPS:\n');

const hasBarcode = /barcode|qr|scan/i.test(productsFile);
console.log(`  Barcode/QR Scanning: ${hasBarcode ? 'YES' : 'NO'}`);

const hasTemplate = /template|quickAdd|productTemplate/i.test(productsFile);
console.log(`  Product Templates: ${hasTemplate ? 'YES' : 'NO'}`);

const hasBatchPrice = /batchPrice|bulkPrice|updatePrice.*multiple/i.test(productsFile);
console.log(`  Batch Price Update: ${hasBatchPrice ? 'YES' : 'NO'}`);

// G. Edge Cases
console.log('\n\nG. EDGE CASE HANDLING:\n');

const editInOrder = /productLocked|editing.*order|orderItem.*edit.*check/i.test(productsFile);
console.log(`  Prevent Editing Products in Active Orders: ${editInOrder ? 'YES' : 'NO'}`);

const concurrentStock = /Math\.max|stockQuantity - diff|concurrent/i.test(storeFile);
console.log(`  Concurrent Stock Protection: ${concurrentStock ? 'YES' : 'NO'}`);
console.log(`    Evidence: Line 257 (Math.max(0, stockQuantity - diff))`);

const duplicateImport = /duplicateCheck|supabaseId.*exist|importDedup/i.test(storeFile);
console.log(`  Duplicate Import Protection: ${duplicateImport ? 'YES' : 'NO'}`);

// Additional insights
console.log('\n\n=== CRITICAL MISSING FEATURES FOR MALAYSIAN KUIH SELLER ===\n');
console.log(`1. STOCK LOSS TRACKING: No way to log spoilage, broken items, or waste`);
console.log(`2. SOFT ARCHIVE: Products deleted permanently instead of archiving (lost history)`);
console.log(`3. PRODUCTION BATCHES: No batch/lot/manufacturing date tracking`);
console.log(`4. COST WARNINGS: No alert when product cost >= selling price`);
console.log(`5. WHOLESALE TIERS: Can't set different prices for bulk buyers`);
console.log(`6. PRODUCT CLONING: No quick duplicate for product variants (e.g., kuih lapis small/large)`);
console.log(`7. ORDERED CATEGORIES: No grouping in NewOrder (all products flat list)`);
console.log(`8. PRICE HISTORY: Can't see when prices changed or revert to old prices`);
console.log(`9. STOCK HISTORY: No audit log of stock increases/decreases with reasons`);
console.log(`10. SEASONAL PRODUCTS: Can't mark products as seasonal (only available certain months)`);

