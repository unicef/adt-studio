/**
 * Persistence helpers for Jotai atoms.
 *
 * Replaces the cookies.js helpers from the vanilla runtime. Each book ships
 * as a multi-page EPUB-style bundle, so atoms need to survive full page reloads
 * (every navigation reloads the document and re-mounts the runtime).
 *
 * Storage strategy:
 *  - WebPub/EPUB mode (showNavigationControls disabled): the book is often
 *    consumed inside an external reader where cookies don't reliably persist
 *    across navigations. Use localStorage as the primary store.
 *  - Web mode: localStorage is shared across books on the same origin, which
 *    leaks settings between titles. Use cookies scoped to the basePath.
 *
 * The original implementation chose between cookies and localStorage at boot
 * by inspecting the loaded config. We mirror that with a custom Jotai storage
 * adapter that delegates to whichever store the runtime selected.
 */
import { atomWithStorage, createJSONStorage } from "jotai/utils"
import { atom } from "jotai"
import { getBasePath } from "@/shared/lib/utils"

export type StorageMode = "cookie" | "localStorage"

let storageMode: StorageMode = "localStorage"

export function setStorageMode(mode: StorageMode) {
  storageMode = mode
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null
  const target = `${name}=`
  const parts = document.cookie.split(";")
  for (let raw of parts) {
    raw = raw.trim()
    if (raw.startsWith(target)) return decodeURIComponent(raw.slice(target.length))
  }
  return null
}

function writeCookie(name: string, value: string, days = 365) {
  if (typeof document === "undefined") return
  const expires = new Date(Date.now() + days * 86_400_000).toUTCString()
  const path = getBasePath()
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=${path}`
}

function eraseCookie(name: string) {
  if (typeof document === "undefined") return
  const path = getBasePath()
  document.cookie = `${name}=; Max-Age=-99999999; path=${path}`
}

const adapter = {
  getItem(key: string): string | null {
    if (storageMode === "localStorage" && typeof localStorage !== "undefined") {
      const fromLs = localStorage.getItem(key)
      if (fromLs !== null) return fromLs
    }
    return readCookie(key)
  },
  setItem(key: string, value: string) {
    if (storageMode === "localStorage" && typeof localStorage !== "undefined") {
      localStorage.setItem(key, value)
      return
    }
    writeCookie(key, value)
  },
  removeItem(key: string) {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key)
    eraseCookie(key)
  },
}

const jsonStorage = createJSONStorage<unknown>(() => adapter)

// `getOnInit: true` makes atomWithStorage read the persisted value
// synchronously at atom creation, so consumers see a plain T (not T | Promise<T>).
const STORAGE_OPTS = { getOnInit: true } as const

/**
 * Carry a value over from a key we used to write, so a rename does not reset
 * settings for anyone already using the reader. Copies once — the old key is
 * left in place, since another build may still read it.
 */
export function migratePersistedKey(legacyKey: string, key: string): void {
  try {
    if (adapter.getItem(key) !== null) return
    const legacy = adapter.getItem(legacyKey)
    if (legacy === null) return
    adapter.setItem(key, legacy)
  } catch {
    // Storage refusal just means the default applies.
  }
}

/** Boolean toggle that survives page navigation. */
export function persistedBoolAtom(key: string, defaultValue: boolean) {
  return atomWithStorage<boolean>(key, defaultValue, jsonStorage as never, STORAGE_OPTS)
}

/** Number value that survives page navigation. */
export function persistedNumberAtom(key: string, defaultValue: number) {
  return atomWithStorage<number>(key, defaultValue, jsonStorage as never, STORAGE_OPTS)
}

/** String value that survives page navigation. */
export function persistedStringAtom(key: string, defaultValue: string) {
  return atomWithStorage<string>(key, defaultValue, jsonStorage as never, STORAGE_OPTS)
}

/** Object (JSON-serializable) value that survives page navigation. */
export function persistedJsonAtom<T>(key: string, defaultValue: T) {
  return atomWithStorage<T>(key, defaultValue, jsonStorage as never, STORAGE_OPTS)
}

/** In-memory atom — resets every page load. */
export function ephemeralAtom<T>(initial: T) {
  return atom(initial)
}

/**
 * Returns true if the configured storage already holds a value for `key`.
 * Used at boot to decide whether to seed an atom from a config-provided
 * default — we only override when the reader hasn't picked their own value.
 */
export function hasPersistedValue(key: string): boolean {
  return adapter.getItem(key) !== null
}
