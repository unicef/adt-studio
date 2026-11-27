import { createContext } from "react"

/** Where the picks show (dev lab, ?picks=): nowhere extra, chips under the steps, or a trail in the stepper. */
export type PicksPlacement = "none" | "chips" | "trail"
export type PdfOptions = { picks: PicksPlacement }

export const PDF_NOW: PdfOptions = { picks: "none" }
export const PdfOptionsContext = createContext<PdfOptions>(PDF_NOW)
