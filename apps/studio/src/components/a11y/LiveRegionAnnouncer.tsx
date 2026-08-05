import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react"

export type AnnouncePoliteness = "polite" | "assertive"

export interface AnnouncerContextValue {
  /**
   * Announce a message to screen-reader users via a global ARIA live region.
   * Use "assertive" for errors/interruptions, "polite" (default) for status.
   */
  announce: (message: string, politeness?: AnnouncePoliteness) => void
}

// Default no-op so `useAnnouncer()` is safe to call even outside the provider
// (e.g. in unit tests that render a component in isolation).
const AnnouncerContext = createContext<AnnouncerContextValue>({
  announce: () => {},
})

/** Access the global screen-reader announcer. Never throws — falls back to no-op. */
export function useAnnouncer(): AnnouncerContextValue {
  return useContext(AnnouncerContext)
}

/**
 * Mounts two visually-hidden ARIA live regions (polite + assertive) and exposes
 * an `announce()` function through context. The app is otherwise a silent SPA:
 * route changes, long-running pipeline jobs, saves and errors produce no spoken
 * feedback. This is the single channel screen-reader users rely on to know that
 * anything happened.
 *
 * Uses a two-slot ("double buffer") technique: each message is written to the
 * slot the previous one did not use, so even an identical repeated string is a
 * genuine DOM change that the screen reader re-announces.
 */
export function LiveRegionAnnouncer({ children }: { children: ReactNode }) {
  const [polite, setPolite] = useState<[string, string]>(["", ""])
  const [assertive, setAssertive] = useState<[string, string]>(["", ""])
  const politeSlot = useRef(0)
  const assertiveSlot = useRef(0)

  const announce = useCallback(
    (message: string, politeness: AnnouncePoliteness = "polite") => {
      const text = message.trim()
      if (!text) return
      if (politeness === "assertive") {
        assertiveSlot.current = assertiveSlot.current === 0 ? 1 : 0
        setAssertive(assertiveSlot.current === 0 ? [text, ""] : ["", text])
      } else {
        politeSlot.current = politeSlot.current === 0 ? 1 : 0
        setPolite(politeSlot.current === 0 ? [text, ""] : ["", text])
      }
    },
    [],
  )

  return (
    <AnnouncerContext.Provider value={{ announce }}>
      {children}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        <div>{polite[0]}</div>
        <div>{polite[1]}</div>
      </div>
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        <div>{assertive[0]}</div>
        <div>{assertive[1]}</div>
      </div>
    </AnnouncerContext.Provider>
  )
}
