import { useCallback, useEffect, useRef } from 'react';

/**
 * Guards an action against double-fire — the double-tap that creates duplicate
 * financial records (two transactions, two payments, two orders).
 *
 * Uses a SYNCHRONOUS ref, not React state, so a second tap fired before the next
 * render is still blocked. It covers both shapes of money write:
 *  - async handlers (network/AI): the guard stays up for the whole in-flight
 *    (await) window;
 *  - sync handlers (immediate store write): the guard stays up for `cooldownMs`
 *    after the call, catching a spaced double-tap that a state-based `disabled`
 *    prop would miss (React state lags a render).
 *
 * The returned function has a stable identity and always calls the latest
 * `action`, so it is safe to pass to memoized children. Pair with
 * `disabled={...}` only for visual feedback — this hook is the race-free guard.
 *
 * @example
 *   const onSave = useSubmitGuard(async () => { await placeOrder(); nav.goBack(); });
 *   <Button onPress={onSave} />
 */
export function useSubmitGuard<A extends any[]>(
  action: (...args: A) => void | Promise<void>,
  cooldownMs = 600,
): (...args: A) => Promise<void> {
  const running = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always invoke the freshest action without changing the returned identity.
  const actionRef = useRef(action);
  actionRef.current = action;
  const cooldownRef = useRef(cooldownMs);
  cooldownRef.current = cooldownMs;

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return useCallback(async (...args: A) => {
    if (running.current) return;
    running.current = true;
    try {
      await actionRef.current(...args);
    } finally {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        running.current = false;
        timer.current = null;
      }, cooldownRef.current);
    }
  }, []);
}
