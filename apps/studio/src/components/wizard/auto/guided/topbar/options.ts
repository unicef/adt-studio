import { createContext } from "react"

/** The top bar's design choices being compared (dev lab, ?width=&pdf=&leave=&help=&look=&page=). */
export type TopBarOptions = {
  /** The bar's contents follow the page column of each step, or keep one width. */
  width: "column" | "fixed"
  /** The PDF chip on the right, or next to the title. */
  pdf: "right" | "title"
  /** Back to the library: the logo (arrow on hover), a "← Library" button, or a Close on the right. */
  back: "logo" | "library" | "close"
  /** How the PDF shows. */
  pdfLook: "chip" | "text" | "cover"
  /** How Change PDF shows. */
  change: "text" | "icon" | "outline" | "dialog"
  /** A "?" button that replays the first-run tour. */
  help: "none" | "button"
  /** Border and frosted background, or the bar sitting on the page. */
  look: "border" | "plain"
  /** The page column's width per step, or the same on every step. */
  page: "step" | "same"
}

export const TOPBAR_NOW: TopBarOptions = { width: "column", pdf: "right", back: "logo", pdfLook: "chip", change: "text", help: "none", look: "border", page: "step" }

export const TopBarOptionsContext = createContext<TopBarOptions>(TOPBAR_NOW)
