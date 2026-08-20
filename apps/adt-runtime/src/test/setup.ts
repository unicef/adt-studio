/**
 * Node 26 exposes an incomplete experimental `localStorage` global unless a
 * CLI storage file is configured. Install an isolated browser-compatible
 * implementation so jsdom tests do not depend on the developer's Node flags.
 */
const values = new Map<string, string>();

const testLocalStorage: Storage = {
  get length() {
    return values.size;
  },
  clear() {
    values.clear();
  },
  getItem(key) {
    return values.get(String(key)) ?? null;
  },
  key(index) {
    return [...values.keys()][index] ?? null;
  },
  removeItem(key) {
    values.delete(String(key));
  },
  setItem(key, value) {
    values.set(String(key), String(value));
  },
};

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: testLocalStorage,
});
