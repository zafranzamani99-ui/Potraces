/**
 * Exponential-backoff gating for sync operations.
 *
 * In-memory, per-key. App restart clears state (fresh retry on next launch —
 * fine: users manually reopening the app implies they expect another attempt).
 *
 * Stages in ms: 30s, 1m, 2m, 5m, 15m, 30m, 1h (capped).
 * First attempt is always allowed (index 0 = 0ms delay).
 */

type BackoffState = {
  consecutiveFailures: number;
  nextAllowedAt: number;
  lastError: string | null;
  lastFailureAt: number;
};

const STAGES_MS = [0, 30_000, 60_000, 120_000, 300_000, 900_000, 1_800_000, 3_600_000];

const states = new Map<string, BackoffState>();

export function canRun(key: string): boolean {
  const s = states.get(key);
  if (!s) return true;
  return Date.now() >= s.nextAllowedAt;
}

export function recordSuccess(key: string): void {
  states.delete(key);
}

export function recordFailure(key: string, error: unknown): void {
  const prev = states.get(key);
  const next: BackoffState = {
    consecutiveFailures: Math.min(
      (prev?.consecutiveFailures ?? 0) + 1,
      STAGES_MS.length - 1,
    ),
    nextAllowedAt: 0,
    lastError: error instanceof Error ? error.message : String(error),
    lastFailureAt: Date.now(),
  };
  next.nextAllowedAt = Date.now() + STAGES_MS[next.consecutiveFailures];
  states.set(key, next);
}

export function getBackoffStatus(key: string): BackoffState | null {
  return states.get(key) ?? null;
}

export function resetBackoff(key?: string): void {
  if (key) states.delete(key);
  else states.clear();
}

/**
 * Run `fn` only if backoff permits. Records success/failure automatically.
 * Returns `{ skipped: true }` if under backoff, else the fn result or rethrow.
 */
export async function withBackoff<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<{ skipped: true } | { skipped: false; result: T }> {
  if (!canRun(key)) return { skipped: true };
  try {
    const result = await fn();
    recordSuccess(key);
    return { skipped: false, result };
  } catch (err) {
    recordFailure(key, err);
    throw err;
  }
}
