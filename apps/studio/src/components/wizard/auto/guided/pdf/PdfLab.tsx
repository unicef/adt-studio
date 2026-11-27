import type { ReactNode } from "react"
import { DevToolbar, useLabParams, type LabControl } from "@/lab/DevToolbar"
import { PdfOptionsContext, type PdfOptions } from "./options"

const CONTROLS: LabControl[] = [
  {
    key: "pdf",
    label: "PDF",
    cycle: true,
    options: [
      { value: "dock", label: "Dock in the bar (now)" },
      { value: "title", label: "Next to the title" },
      { value: "row", label: "Row above the steps" },
      { value: "rail", label: "Side rail (wide)" },
    ],
  },
  {
    key: "picks",
    label: "Picks",
    options: [
      { value: "menu", label: "In the PDF panel (now)" },
      { value: "chips", label: "Chips under the steps" },
      { value: "trail", label: "Trail in the stepper" },
    ],
  },
]

/** Dev only: where the PDF and the picks show (?pdf= &picks=, ← → for the PDF), next to the flow it drives. */
export default function PdfLab({ children }: { children: ReactNode }) {
  const [values, set] = useLabParams(CONTROLS)
  return (
    <PdfOptionsContext.Provider value={values as PdfOptions}>
      {children}
      <DevToolbar controls={CONTROLS} values={values} onChange={set} />
    </PdfOptionsContext.Provider>
  )
}
