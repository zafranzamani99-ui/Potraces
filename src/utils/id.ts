/**
 * Generate a collision-resistant local ID.
 * Combines a millisecond timestamp with ~62 bits of Math.random entropy
 * (two independent calls, base36). Collision space ~2.5e19 per millisecond.
 *
 * Format: <timestamp>-<12 random chars>
 * Example: "1729123456789-k3f8a7x2q1l"
 */
export function newId(): string {
  const r1 = Math.random().toString(36).slice(2, 8);
  const r2 = Math.random().toString(36).slice(2, 8);
  return `${Date.now().toString(36)}-${r1}${r2}`;
}
