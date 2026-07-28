/**
 * Node storage shim for tsx test scripts — import FIRST (before any store).
 *
 * Any zustand `persist` store write in Node hits AsyncStorage's web fallback
 * (`window.localStorage`), which doesn't exist outside a browser → the process
 * dies with "ReferenceError: window is not defined" (seen in
 * test-quick-log-inbox.ts). Import order is preserved by tsx, so a first-line
 * `import './test-storage-shim';` installs the stub before store modules load.
 */
const mem = new Map<string, string>();
const localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
(globalThis as any).window = (globalThis as any).window || {};
(globalThis as any).window.localStorage = localStorage;
