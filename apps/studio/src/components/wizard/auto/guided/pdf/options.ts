import { createContext } from "react"

/** How the PDF row above the steps looks (dev lab, ?row=). */
export type RowLook = "plain" | "card" | "compact" | "strip"
/** Where the picks show (dev lab, ?picks=): nowhere extra, chips under the steps, or a trail in the stepper. */
export type PicksPlacement = "none" | "chips" | "trail"
export type PdfOptions = { row: RowLook; picks: PicksPlacement }

export const PDF_NOW: PdfOptions = { row: "plain", picks: "none" }
export const PdfOptionsContext = createContext<PdfOptions>(PDF_NOW)
