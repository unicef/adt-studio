import { useSyncExternalStore } from "react"

export const LIBRARY_SORTS = ["recent", "title", "progress", "pages", "created"] as const
export type LibrarySort = (typeof LIBRARY_SORTS)[number]

export const LIBRARY_GROUPS = ["none", "attention"] as const
export type LibraryGroup = (typeof LIBRARY_GROUPS)[number]

export const LIBRARY_VIEWS = ["grid", "list"] as const
export type LibraryViewMode = (typeof LIBRARY_VIEWS)[number]

export interface LibraryPrefs {
  sort: LibrarySort
  group: LibraryGroup
  view: LibraryViewMode
}

const STORAGE_KEY = "adt.library"

const DEFAULTS: LibraryPrefs = {
  sort: "recent",
  group: "none",
  view: "grid",
}

function read(): LibraryPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULTS
    const parsed = JSON.parse(raw) as Partial<LibraryPrefs>
    return {
      sort: LIBRARY_SORTS.includes(parsed.sort as LibrarySort) ? (parsed.sort as LibrarySort) : DEFAULTS.sort,
      group: LIBRARY_GROUPS.includes(parsed.group as LibraryGroup) ? (parsed.group as LibraryGroup) : DEFAULTS.group,
      view: LIBRARY_VIEWS.includes(parsed.view as LibraryViewMode) ? (parsed.view as LibraryViewMode) : DEFAULTS.view,
    }
  } catch {
    return DEFAULTS
  }
}

let current = read()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return
    current = read()
    emit()
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getLibraryPrefs(): LibraryPrefs {
  return current
}

export function setLibraryPrefs(patch: Partial<LibraryPrefs>) {
  current = { ...current, ...patch }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    /* ignore */
  }
  emit()
}

export function useLibraryPrefs() {
  return [useSyncExternalStore(subscribe, getLibraryPrefs), setLibraryPrefs] as const
}
