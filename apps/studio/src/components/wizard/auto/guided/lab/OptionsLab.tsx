import type { ReactNode } from "react"
import { DevToolbar, useLabParams, type LabControl } from "@/lab/DevToolbar"
import { OptionsLayoutContext, type OptionsLayout } from "../shared/optionsLayout"

const CONTROLS: LabControl[] = [
  {
    key: "options",
    label: "Other options",
    options: [
      { value: "accordion", label: "Accordion (current)" },
      { value: "inline", label: "Inline cards" },
    ],
    cycle: true,
  },
]

/** Dev only: flips how the Check screens show their other options, via `?options=`. */
export default function OptionsLab({ children }: { children: ReactNode }) {
  const [values, set] = useLabParams(CONTROLS)
  return (
    <OptionsLayoutContext.Provider value={values.options as OptionsLayout}>
      {children}
      <DevToolbar controls={CONTROLS} values={values} onChange={set} />
    </OptionsLayoutContext.Provider>
  )
}
