import type { ReactNode } from "react"
import { DevToolbar, useLabParams, type LabControl } from "@/lab/DevToolbar"
import { PdfOptionsContext, type PdfOptions } from "./options"

const CONTROLS: LabControl[] = [
  {
    key: "row",
    label: "PDF row",
    cycle: true,
    options: [
      { value: "plain", label: "Plain (now)" },
      { value: "card", label: "Card" },
      { value: "compact", label: "Compact line" },
      { value: "strip", label: "Page strip" },
    ],
  },
  {
    key: "picks",
    label: "Picks",
    options: [
      { value: "none", label: "None (now)" },
      { value: "chips", label: "Chips under the steps" },
      { value: "trail", label: "Trail in the stepper" },
    ],
  },
]

/** Dev only: how the PDF row looks and where the picks show (?row= &picks=, ← → for the row). */
export default function PdfLab({ children }: { children: ReactNode }) {
  const [values, set] = useLabParams(CONTROLS)
  return (
    <PdfOptionsContext.Provider value={values as PdfOptions}>
      {children}
      <DevToolbar controls={CONTROLS} values={values} onChange={set} />
    </PdfOptionsContext.Provider>
  )
}
