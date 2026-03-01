import { StallSession } from '../types';

/**
 * Rule-based insight generator for a single stall session.
 * Returns a calm, observational sentence — never advice or judgement.
 */
export const explainStallSession = (session: StallSession): string | null => {
  if (!session.closedAt) return null;

  const { sales, totalRevenue, totalCash, totalQR, condition, productsSnapshot } = session;
  const saleCount = sales.length;

  if (saleCount === 0) {
    return 'quiet session — sometimes that happens.';
  }

  const closedAt = session.closedAt instanceof Date ? session.closedAt : new Date(session.closedAt);
  const startedAt = session.startedAt instanceof Date ? session.startedAt : new Date(session.startedAt);
  const duration = Math.round((closedAt.getTime() - startedAt.getTime()) / 60000);

  // Count product breakdown
  const productCounts: Record<string, { name: string; qty: number; revenue: number }> = {};
  sales.forEach((s) => {
    if (!productCounts[s.productId]) {
      productCounts[s.productId] = { name: s.productName, qty: 0, revenue: 0 };
    }
    productCounts[s.productId].qty += s.quantity;
    productCounts[s.productId].revenue += s.total;
  });

  const topProduct = Object.values(productCounts).sort((a, b) => b.revenue - a.revenue)[0];

  // Products that sold out
  const soldOut = productsSnapshot.filter(
    (ps) => ps.startQty > 0 && ps.remainingQty === 0
  );

  // Build insight based on conditions
  const lines: string[] = [];

  // Duration insight
  if (duration < 60) {
    lines.push(`short session — ${duration} minutes.`);
  } else if (duration > 300) {
    lines.push(`long day — ${Math.round(duration / 60)} hours.`);
  }

  // Revenue per hour
  if (duration > 0) {
    const perHour = (totalRevenue / duration) * 60;
    if (perHour > 50) {
      lines.push(`RM${perHour.toFixed(0)}/hour pace.`);
    }
  }

  // Top product
  if (topProduct && Object.keys(productCounts).length > 1) {
    lines.push(`${topProduct.name} was the favourite — ${topProduct.qty} sold.`);
  }

  // Sold out
  if (soldOut.length === 1) {
    lines.push(`${soldOut[0].productName} habis.`);
  } else if (soldOut.length > 1) {
    lines.push(`${soldOut.length} items habis — consider bringing more next time.`);
  }

  // Cash vs QR ratio
  const qrRatio = totalRevenue > 0 ? totalQR / totalRevenue : 0;
  if (qrRatio > 0.6 && saleCount > 3) {
    lines.push('mostly QR payments today.');
  } else if (qrRatio < 0.2 && saleCount > 3 && totalQR > 0) {
    lines.push('almost all cash today.');
  }

  // Condition context
  if (condition === 'rainy') {
    lines.push('rainy day, but you showed up.');
  } else if (condition === 'slow') {
    lines.push('slow day — that\'s okay.');
  } else if (condition === 'hot') {
    lines.push('hot day — you pushed through.');
  } else if (condition === 'good') {
    lines.push('good day out there.');
  }

  // Big session
  if (totalRevenue > 500) {
    lines.push('solid session.');
  }

  // Return the most relevant insight (first one)
  return lines.length > 0 ? lines[0] : `${saleCount} sales, RM${totalRevenue.toFixed(0)} total.`;
};
