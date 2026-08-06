import { atom } from "jotai"
import { atomWithStorage, createJSONStorage } from "jotai/utils"

/**
 * Following survives a page turn but not the tab.
 *
 * Every navigation reloads the document, so this cannot be in-memory. It equally must not be in
 * `localStorage` beside the reading preferences: coming back to a book tomorrow and being
 * dragged around by whoever you followed last week is not a preference, it is a haunting.
 * `sessionStorage` is exactly the lifetime wanted — one tab, one sitting.
 */

const memory = new Map<string, string>()

/** Private browsing and embedded readers can both refuse `sessionStorage`. Following then lasts
 *  until the next page turn instead of failing, which is a reasonable amount of broken. */
const store: Storage | undefined =
  typeof globalThis === "undefined"
    ? undefined
    : (() => {
        try {
          const probe = globalThis.sessionStorage
          probe.setItem("__adt_probe__", "1")
          probe.removeItem("__adt_probe__")
          return probe
        } catch {
          return undefined
        }
      })()

const adapter: Storage = store ?? {
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

function sessionStorageFor<T>(): SyncJsonStorage<T> {
  return jsonStorage as unknown as SyncJsonStorage<T>
}

const OPTS = { getOnInit: true } as const

/** The name of the peer being followed — see `isFollowable` for why a name and not an id. */
export const followedNameAtom = atomWithStorage<string | null>(
  "commentsFollowing",
  null,
  sessionStorageFor<string | null>(),
  OPTS,
)

/** The section the follow last sent this reader to. Landing anywhere else means they navigated
 *  themselves, which ends the follow. */
export const followSentToAtom = atomWithStorage<string | null>(
  "commentsFollowingSentTo",
  null,
  sessionStorageFor<string | null>(),
  OPTS,
)

export const followingAtom = atom((get) => get(followedNameAtom) !== null)
