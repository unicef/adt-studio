import type { ReactNode } from "react"
import { DevToolbar, useLabParams, type LabControl } from "@/lab/DevToolbar"
import { StepperVariantContext, type StepperVariant } from "."

const CONTROLS: LabControl[] = [
  {
    key: "stepper",
    label: "Stepper",
    cycle: true,
    options: [
      { value: "dots", label: "Numbered (now)" },
      { value: "segments", label: "Bars" },
      { value: "pills", label: "Pills" },
      { value: "icons", label: "Icons" },
      { value: "compact", label: "Compact" },
      { value: "header", label: "In the header" },
    ],
  },
]

/** Dev only: flips the stepper design (`?stepper=`, ←/→), next to the flow it drives. */
export default function StepperLab({ children }: { children: ReactNode }) {
  const [values, set] = useLabParams(CONTROLS)
  return (
    <StepperVariantContext.Provider value={values.stepper as StepperVariant}>
      {children}
      <DevToolbar controls={CONTROLS} values={values} onChange={set} />
    </StepperVariantContext.Provider>
  )
}
