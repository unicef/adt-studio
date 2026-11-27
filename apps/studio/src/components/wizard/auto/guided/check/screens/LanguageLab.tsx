import type { ReactNode } from "react"
import { DevToolbar, useLabParams, type LabControl } from "@/lab/DevToolbar"
import { LanguageLookContext, type LanguageLook } from "./languageLook"

const CONTROLS: LabControl[] = [
  {
    key: "language",
    label: "Language screen",
    cycle: true,
    options: [
      { value: "now", label: "Now" },
      { value: "stamp", label: "Stamp" },
      { value: "tile", label: "Tile" },
    ],
  },
]

/** Dev only: the Language screen's design (?language=, ← → to flip), next to the flow it drives. */
export default function LanguageLab({ children }: { children: ReactNode }) {
  const [values, set] = useLabParams(CONTROLS)
  return (
    <LanguageLookContext.Provider value={values.language as LanguageLook}>
      {children}
      <DevToolbar controls={CONTROLS} values={values} onChange={set} />
    </LanguageLookContext.Provider>
  )
}
