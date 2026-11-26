import { useEffect, useRef, useSyncExternalStore } from "react"

/**
 * The assistant's "Not sure? I can explain" offer in its bubble opens the explanation of what's
 * on screen (the options dialog, or how languages work). The part of the screen that owns that
 * dialog registers it here; the bubble offers it while one is registered, and opens the first.
 */
export type ExplainWhat = "options" | "languages"
type Entry = { what: ExplainWhat; open: () => void }

let entries: Entry[] = []
const listeners = new Set<() => void>()
const emit = () => {
  for (const l of listeners) l()
}

/** Registers `open` as the screen's explanation while the caller is mounted (and `on`). */
export function useExplain(what: ExplainWhat, open: () => void, on = true) {
  const latest = useRef(open)
  latest.current = open
  useEffect(() => {
    if (!on) return
    const entry: Entry = { what, open: () => latest.current() }
    entries = [...entries, entry]
    emit()
    return () => {
      entries = entries.filter((e) => e !== entry)
      emit()
    }
  }, [what, on])
}

/** What the screen can explain (null: nothing), for the bubble. */
export function useExplainable(): ExplainWhat | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => entries[0]?.what ?? null,
    () => null,
  )
}

export function askExplain() {
  entries[0]?.open()
}
