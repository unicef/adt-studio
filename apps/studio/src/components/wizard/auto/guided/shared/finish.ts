import { createContext, useContext } from "react"

/** Creating ends inside its own message (the ring becomes the Open button), so the flow provides how to open the book. */
export const FinishContext = createContext<{ onOpen: (label: string) => void } | null>(null)
export const useFinish = () => useContext(FinishContext)
