import { useSyncExternalStore } from "react"

export interface DraftPersistence<T> {
  key: string
  read: () => T[] | null
  write: (draft: T[] | null) => void
}

export interface DraftStore<T> {
  read: (key: string, version: string) => T[] | null
  write: (key: string, version: string, draft: T[] | null) => void
  keys: () => ReadonlySet<string>
  subscribe: (listener: () => void) => () => void
  bind: (key: string, version: string) => DraftPersistence<T>
}

export function createDraftStore<T>(): DraftStore<T> {
  const drafts = new Map<string, { version: string; draft: T[] }>()
  const listeners = new Set<() => void>()
  let keys: ReadonlySet<string> = new Set()

  const emit = () => {
    keys = new Set(drafts.keys())
    for (const listener of listeners) listener()
  }

  const read = (key: string, version: string) => {
    const entry = drafts.get(key)
    return entry && entry.version === version ? entry.draft : null
  }

  const write = (key: string, version: string, draft: T[] | null) => {
    const current = drafts.get(key)
    if (draft === null) {
      if (!current) return
      drafts.delete(key)
      emit()
      return
    }
    if (current && current.version === version && current.draft === draft) return
    const added = !current
    drafts.set(key, { version, draft })
    if (added) emit()
  }

  return {
    read,
    write,
    keys: () => keys,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    bind: (key, version) => ({ key: `${key}@${version}`, read: () => read(key, version), write: (draft) => write(key, version, draft) }),
  }
}

const NO_KEYS: ReadonlySet<string> = new Set()
const noopSubscribe = () => () => undefined

export function useDraftKeys<T>(store: DraftStore<T> | undefined): ReadonlySet<string> {
  return useSyncExternalStore(store ? store.subscribe : noopSubscribe, store ? store.keys : () => NO_KEYS)
}
