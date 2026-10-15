import "./frame"
import { useCallback } from "react"
import { createPersistentStore } from "@/hooks/create-persistent-store"

const store = createPersistentStore<Record<string, string[]>>(
  "adt.lab.outputs",
  {},
  (value): value is Record<string, string[]> => typeof value === "object" && value !== null && !Array.isArray(value),
)

export function useAddedOutputs(label: string): [string[], (slug: string) => void, (slug: string) => void] {
  const [all, set] = store.use()
  const added = all[label] ?? []
  const add = useCallback(
    (slug: string) => set((previous) => ({ ...previous, [label]: [...new Set([...(previous[label] ?? []), slug])] })),
    [label, set],
  )
  const remove = useCallback(
    (slug: string) => set((previous) => ({ ...previous, [label]: (previous[label] ?? []).filter((item) => item !== slug) })),
    [label, set],
  )
  return [added, add, remove]
}

let lastAdded: { slug: string; at: number } | null = null

export function markJustAdded(slug: string) {
  lastAdded = { slug, at: Date.now() }
}

export function wasJustAdded(slug: string): boolean {
  return !!lastAdded && lastAdded.slug === slug && Date.now() - lastAdded.at < 4000
}

export function clearAddedOutputs() {
  store.set({})
}

const dismissedStore = createPersistentStore<string[]>(
  "adt.lab.needs-dismissed",
  [],
  (value): value is string[] => Array.isArray(value),
)

export function useNeedsDismissed(label: string): [boolean, () => void, () => void] {
  const [all, set] = dismissedStore.use()
  return [
    all.includes(label),
    () => set((previous) => [...new Set([...previous, label])]),
    () => set((previous) => previous.filter((item) => item !== label)),
  ]
}

export function clearNeedsDismissed() {
  dismissedStore.set([])
}

export const SETUP_FINISHED_TOAST = "setup-finished"

let readerCardShown = false

export function setReaderCardShown(shown: boolean) {
  readerCardShown = shown
}

export function isReaderCardShown(): boolean {
  return readerCardShown
}

export function setOutputsFor(label: string, slugs: string[]) {
  store.set((previous) => ({ ...previous, [label]: slugs }))
}

export function setNeedsDismissedFor(label: string, dismissed: boolean) {
  dismissedStore.set((previous) => (dismissed ? [...new Set([...previous, label])] : previous.filter((item) => item !== label)))
}
