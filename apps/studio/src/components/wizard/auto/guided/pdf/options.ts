import { createContext } from "react"

/** Where the PDF shows (dev lab, ?pdf=): the dock in the bar, next to the title, a row above the steps, or a side rail on wide windows. */
export type PdfPlacement = "dock" | "title" | "row" | "rail"
/** Where the picks show (dev lab, ?picks=): only in the PDF's panel, chips under the steps, or a trail in the stepper. */
export type PicksPlacement = "menu" | "chips" | "trail"
export type PdfOptions = { pdf: PdfPlacement; picks: PicksPlacement }

export const PDF_NOW: PdfOptions = { pdf: "dock", picks: "menu" }
export const PdfOptionsContext = createContext<PdfOptions>(PDF_NOW)
