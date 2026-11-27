import type { ReactNode } from "react"
import { DevToolbar, useLabParams, type LabControl } from "@/lab/DevToolbar"
import { PdfOptionsContext, type PdfOptions } from "./options"

const CONTROLS: LabControl[] = [
  {
    key: "picks",
    label: "Picks",
    cycle: true,
    options: [
      { value: "none", label: "None (now)" },
      { value: "chips", label: "Chips under the steps" },
      { value: "trail", label: "Trail in the stepper" },
    ],
  },
]

/** Dev only: where the picks show (?picks=, ← → to flip). */
export default function PdfLab({ children }: { children: ReactNode }) {
  const [values, set] = useLabParams(CONTROLS)
  return (
    <PdfOptionsContext.Provider value={values as PdfOptions}>
      {children}
      <DevToolbar controls={CONTROLS} values={values} onChange={set} />
    </PdfOptionsContext.Provider>
  )
}
