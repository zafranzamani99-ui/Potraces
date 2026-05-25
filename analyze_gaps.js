const fs = require('fs');
const path = require('path');

// Read files
const productsFile = fs.readFileSync('src/screens/seller/Products.tsx', 'utf8');
const newOrderFile = fs.readFileSync('src/screens/seller/NewOrder.tsx', 'utf8');
const dashboardFile = fs.readFileSync('src/screens/seller/Dashboard.tsx', 'utf8');
const customersFile = fs.readFileSync('src/screens/seller/Customers.tsx', 'utf8');
const seasonSummaryFile = fs.readFileSync('src/screens/seller/SeasonSummary.tsx', 'utf8');
const storeFile = fs.readFileSync('src/store/sellerStore.ts', 'utf8');

const allContent = productsFile + newOrderFile + dashboardFile + customersFile + seasonSummaryFile + storeFile;

const features = {
  'Product Lifecycle': {
    'Archive/Soft Delete': /archiveProduct|isArchived|softDelete/i,
    'Clone/Duplicate': /cloneProduct|duplicateProduct/i,
    'Price History': /priceHistory|historicalPrice|priceVersions/i,
    'Multi-tier Pricing': /wholesale|retail.*price|priceTier|tierPrice/i,
  },
  'Stock Management': {
    'Stock Adjustment Log': /stockAdjustment|stockLog|adjustment.*reason|spoilage|breakage/i,
    'Min Stock Alert': /minStock|minimumStock|stockThreshold|lowStock/i,
    'Batch/Lot Tracking': /batch|lotNumber|lot.*tracking|expiryDate|batchDate/i,
    'Stock History': /stockHistory|stock.*log/i,
  },
  'Product Organization': {
    'Product Categories': /productCategories|productCategory|category/i,
    'Category-based Grouping': /categoryGroup|groupByCategory/i,
    'Product Ordering': /productOrder|sortOrder|displayOrder/i,
    'Variants (size/type)': /variant|variantName|size.*small.*large|productVariant/i,
    'Product Tags': /productTag|tags|tagging/i,
  },
  'Pricing': {
    'Margin Warnings': /marginWarning|profitWarning|cost.*price.*check/i,
    'Price Change History': /priceChangeHistory|priceChanged/i,
    'Discount/Promotion': /discount|promotion|promotionalPrice/i,
    'Bundle Pricing': /bundle|bundlePrice|multiItem/i,
  },
  'Product-Order Relationships': {
    'Best Selling Products': /bestSelling|topProduct|mostSold/i,
    'Product Performance': /productPerformance|performanceMetric/i,
    'Product Profitability': /profitability|margin.*product|productProfit/i,
    'Customer-Product Mapping': /customerProduct|productCustomer|purchaseHistory/i,
  },
  'Data Entry': {
    'Barcode/QR Scan': /barcode|qr|qrCode|scan.*barcode/i,
    'Product Templates': /productTemplate|template.*product/i,
    'Batch Price Update': /batchPrice|bulkPrice|priceUpdate.*batch/i,
  },
  'Edge Cases': {
    'Edit-in-order Protection': /editingProduct.*order|orderItem.*edit|productLocked/i,
    'Concurrent Stock': /concurrent|race.*condition|stockQuantity.*math/i,
    'Duplicate Import': /duplicateCheck|importDedup|existingProduct.*import/i,
  }
};

console.log('=== PRODUCT FEATURE AUDIT ===\n');

for (const [category, checks] of Object.entries(features)) {
  console.log(`\n${category}:`);
  for (const [feature, regex] of Object.entries(checks)) {
    const found = regex.test(allContent);
    const status = found ? '✓ EXISTS' : '✗ MISSING';
    console.log(`  ${status}: ${feature}`);
  }
}

// Check for specific store functions
console.log('\n\nStore Actions:');
const storeActions = [
  'deleteProduct', 'addProduct', 'updateProduct',
  'setProductOrder', 'addProductCategory',
  'trackStock', 'stockQuantity'
];
for (const action of storeActions) {
  const found = storeFile.includes(action);
  console.log(`  ${found ? '✓' : '✗'} ${action}`);
}

// Count product properties
const productTypeMatch = storeFile.match(/interface SellerProduct|type SellerProduct/);
if (productTypeMatch) {
  console.log('\n\nProduct Type Fields:');
  const typeStart = storeFile.indexOf(productTypeMatch[0]);
  const typeEnd = storeFile.indexOf('}', typeStart) + 1;
  const typeSection = storeFile.substring(typeStart, typeEnd);
  const fields = typeSection.match(/\w+\?*:/g);
  if (fields) {
    console.log('  ' + fields.join(', '));
  }
}
