import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"

/**
 * The assistant's "Not sure? I can explain" offer in its bubble opens the explanation of what's
 * on screen (the options dialog, or how languages work). The part of the screen that owns that
 * dialog registers it with the flow's ExplainProvider; the bubble offers it while one is
 * registered, and opens the first.
 */
export type ExplainWhat = "options" | "languages"
type Entry = { what: ExplainWhat; open: () => void }

/** Adds an entry; returns its removal. Stable for the provider's life, so registering never re-runs. */
const RegisterContext = createContext<((entry: Entry) => () => void) | null>(null)
const CurrentContext = createContext<Entry | null>(null)

export function ExplainProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const register = useCallback((entry: Entry) => {
    setEntries((list) => [...list, entry])
    return () => setEntries((list) => list.filter((e) => e !== entry))
  }, [])
  return (
    <RegisterContext.Provider value={register}>
      <CurrentContext.Provider value={entries[0] ?? null}>{children}</CurrentContext.Provider>
    </RegisterContext.Provider>
  )
}

/** Registers `open` as the screen's explanation while the caller is mounted (and `on`). */
export function useExplain(what: ExplainWhat, open: () => void, on = true) {
  const register = useContext(RegisterContext)
  const latest = useRef(open)
  latest.current = open
  useEffect(() => {
    if (!on || !register) return
    return register({ what, open: () => latest.current() })
  }, [register, what, on])
}

/** What the screen can explain (null: nothing) and how to open it, for the bubble. */
export function useExplainable(): Entry | null {
  return useContext(CurrentContext)
}
