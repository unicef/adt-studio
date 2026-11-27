import type { ReactNode } from "react"
import { DevToolbar, useLabParams, type LabControl } from "@/lab/DevToolbar"
import { TopBarOptionsContext, type TopBarOptions } from "./options"

const CONTROLS: LabControl[] = [
  { key: "width", label: "Bar width", cycle: true, options: [{ value: "column", label: "Follows the column (now)" }, { value: "fixed", label: "Fixed" }] },
  { key: "page", label: "Page width", options: [{ value: "step", label: "Per step (now)" }, { value: "same", label: "Same on every step" }] },
  { key: "pdf", label: "PDF", options: [{ value: "right", label: "Right (now)" }, { value: "title", label: "Next to the title" }] },
  { key: "back", label: "Back", options: [{ value: "logo", label: "Logo (now)" }, { value: "library", label: "← Library" }, { value: "close", label: "Close ✕" }] },
  { key: "pdfLook", label: "PDF look", options: [{ value: "chip", label: "Chip (now)" }, { value: "text", label: "Text" }, { value: "cover", label: "Cover" }] },
  { key: "change", label: "Change PDF", options: [{ value: "text", label: "Icon + text (now)" }, { value: "icon", label: "Icon only" }, { value: "outline", label: "Button" }, { value: "dialog", label: "In the pages dialog" }] },
  { key: "help", label: "Help", options: [{ value: "none", label: "None (now)" }, { value: "button", label: "? button" }] },
  { key: "look", label: "Look", options: [{ value: "border", label: "Border (now)" }, { value: "plain", label: "On the page" }] },
]

/** Dev only: flips the Add Book top bar's options (URL params, ← → for the width), next to the flow. */
export default function TopBarLab({ children }: { children: ReactNode }) {
  const [values, set] = useLabParams(CONTROLS)
  return (
    <TopBarOptionsContext.Provider value={values as TopBarOptions}>
      {children}
      <DevToolbar controls={CONTROLS} values={values} onChange={set} />
    </TopBarOptionsContext.Provider>
  )
}
