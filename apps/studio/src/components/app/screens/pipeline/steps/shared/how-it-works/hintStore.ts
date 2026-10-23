import { createPersistentStore, type PersistentStore } from "@/hooks/create-persistent-store"

const HINT_KEY_PREFIX = "adt.step-hint."
const stores = new Map<string, PersistentStore<boolean>>()

export function hintStore(slug: string): PersistentStore<boolean> {
  let store = stores.get(slug)
  if (!store) {
    store = createPersistentStore<boolean>(HINT_KEY_PREFIX + slug, false, (value): value is boolean => typeof value === "boolean")
    stores.set(slug, store)
  }
  return store
}
