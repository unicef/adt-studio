import { createContext, useContext } from "react"

/**
 * How a sure pick shows its other options: behind "See the other options" (accordion, the default)
 * or always in view as compact cards under the pick (inline). Set only by the dev-only lab
 * (lab/OptionsLab.tsx, `?options=inline`) while the two are compared.
 */
export type OptionsLayout = "accordion" | "inline"
export const OptionsLayoutContext = createContext<OptionsLayout>("accordion")
export const useOptionsLayout = () => useContext(OptionsLayoutContext)

/** Set by a sure pick around its options when they're shown inline: the cards draw compact (picture beside the words). */
export const CompactOptionsContext = createContext(false)
