import { SellerOrder, IngredientCost } from '../types';

/**
 * Returns a single passive observation about the seller's current month/season.
 * No advice, no "you should". Just an honest mirror.
 */
export function explainSellerMonth(
  orders: SellerOrder[],
  previousOrders: SellerOrder[],
  costs: IngredientCost[]
): string | null {
  if (orders.length === 0) return null;

  const totalIncome = orders.filter((o) => o.isPaid).reduce((s, o) => s + o.totalAmount, 0);
  const totalCosts = costs.reduce((s, c) => s + c.amount, 0);
  const kept = totalIncome - totalCosts;
  const unpaid = orders.filter((o) => !o.isPaid);

  const prevIncome = previousOrders.filter((o) => o.isPaid).reduce((s, o) => s + o.totalAmount, 0);

  // Unpaid orders are significant
  if (unpaid.length >= 3) {
    const unpaidTotal = unpaid.reduce((s, o) => s + o.totalAmount, 0);
    return `${unpaid.length} orders still unpaid \u2014 RM ${unpaidTotal.toFixed(0)} pending.`;
  }

  // Costs eating into income
  if (totalIncome > 0 && totalCosts / totalIncome > 0.5) {
    return "Ingredient costs took more than half of what came in this time.";
  }

  // Stronger than last period
  if (prevIncome > 0 && totalIncome > prevIncome * 1.3) {
    return "Busier than last time. More orders came in.";
  }

  // Slower than last period
  if (prevIncome > 0 && totalIncome < prevIncome * 0.7) {
    return "Quieter than last time. That happens between seasons.";
  }

  // Most popular product
  const productCounts: Record<string, { name: string; qty: number }> = {};
  for (const order of orders) {
    for (const item of order.items) {
      if (!productCounts[item.productId]) {
        productCounts[item.productId] = { name: item.productName, qty: 0 };
      }
      productCounts[item.productId].qty += item.quantity;
    }
  }
  const topProduct = Object.values(productCounts).sort((a, b) => b.qty - a.qty)[0];
  if (topProduct && orders.length >= 3) {
    return `${topProduct.name} was the most ordered this time.`;
  }

  // Good month
  if (kept > 0 && orders.length >= 2) {
    return `${orders.length} orders, and you kept RM ${kept.toFixed(0)} after costs.`;
  }

  return null;
}
