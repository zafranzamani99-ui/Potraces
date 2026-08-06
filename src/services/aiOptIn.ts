/**
 * AI opt-in state — the dependency-free core of the AI consent gate.
 *
 * Why this indirection exists: the real flag lives in settingsStore, but
 * settingsStore transitively imports react-native core (AsyncStorage), which
 * cannot load under plain Node/tsx — and geminiClient (the AI choke point
 * that reads this) IS imported by tsx test scripts. So the flag is read
 * through a registered checker instead of a direct store import:
 *
 *   - settingsStore registers the real checker at module scope (app startup).
 *   - Anything that can't load the store (tests) keeps the default checker,
 *     which fails OPEN (AI on) — preserving pre-flag behavior in test runs.
 */
let checker: () => boolean = () => true;

export function registerAiOptInChecker(fn: () => boolean): void {
  checker = fn;
}

export function isAiOptedIn(): boolean {
  return checker();
}
