import { atomWithStorage, createJSONStorage } from "jotai/utils"

/**
 * Atoms that must survive a page turn but not the tab.
 *
 * Every navigation in this runtime reloads the document, so these cannot be in-memory. They
 * equally must not sit in `localStorage` beside the reading preferences: coming back to a book
 * tomorrow and being dragged around by whoever you followed last week is not a preference.
 * `sessionStorage` is exactly the lifetime wanted — one tab, one sitting.
 */

const memory = new Map<string, string>()

/** Private browsing and embedded readers can both refuse `sessionStorage`. Falling back to
 *  memory means the feature lasts until the next page turn instead of throwing. */
const available: Storage | undefined = (() => {
  try {
    const probe = globalThis.sessionStorage
    probe.setItem("__adt_probe__", "1")
    probe.removeItem("__adt_probe__")
    return probe
  } catch {
    return undefined
  }
})()

const adapter: Storage = available ?? {
  get length() {
    return memory.size
  },
  clear: () => memory.clear(),
  getItem: (key: string) => memory.get(key) ?? null,
  key: (index: number) => [...memory.keys()][index] ?? null,
  removeItem: (key: string) => {
    memory.delete(key)
  },
  setItem: (key: string, value: string) => {
    memory.set(key, value)
  },
}

interface SyncJsonStorage<Value> {
  getItem: (key: string, initialValue: Value) => Value
  setItem: (key: string, newValue: Value) => void
  removeItem: (key: string) => void
}

const jsonStorage = createJSONStorage<unknown>(() => adapter)

/** Survives a page turn, dies with the tab. `getOnInit` so the value is read synchronously at
 *  atom creation and consumers see a plain `T` rather than `T | Promise<T>`. */
export function sessionAtom<T>(key: string, initial: T) {
  return atomWithStorage<T>(
    key,
    initial,
    jsonStorage as unknown as SyncJsonStorage<T>,
    { getOnInit: true },
  )
}
