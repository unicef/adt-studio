import { createContext, useContext } from "react"

/**
 * Finish ideas that end the thread inside the creating message (f26, f29) need to open the book from
 * there; the thread provides how.
 */
export const FinishContext = createContext<{ onOpen: (label: string) => void } | null>(null)
export const useFinish = () => useContext(FinishContext)

/** Finish ideas where the creating message itself becomes the end, so the separate "ready" message isn't shown. */
export const ENDS_IN_PLACE = ["f26", "f29"]
