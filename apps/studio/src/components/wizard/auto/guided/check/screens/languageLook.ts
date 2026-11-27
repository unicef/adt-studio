import { createContext } from "react"

/** The Language screen's design being compared (dev lab, ?language=): today's, the stamp, or the tile. */
export type LanguageLook = "now" | "stamp" | "tile"
export const LanguageLookContext = createContext<LanguageLook>("now")
