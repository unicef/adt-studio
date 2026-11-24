import { useEffect, useMemo, useRef, useState } from "react"
import { useStore } from "@tanstack/react-form"
import { DevToolbar, useLabParams, type LabControl } from "@/lab/DevToolbar"
import { WizardProvider } from "@/components/wizard/core/WizardProvider"
import { WizardFormProvider } from "@/components/wizard/core/WizardFormProvider"
import { useWizardForm } from "@/components/wizard/core/wizardForm"
import { EngineClientProvider, useEngineClient } from "../engine/client"
import { labEngine, SCENARIOS, type LabError, type ScenarioId, type Speed } from "./mockEngine"
import { VARIANTS } from "../variants"
import { IDEA_GROUPS, IdeasContext, type Ideas } from "../variants/chat/ideas"

const CONTROLS: LabControl[] = [
  { key: "variant", label: "Design", options: VARIANTS.map((v) => ({ value: v.id, label: v.name })), cycle: true },
  { key: "book", label: "Engine answer", options: [{ value: "real", label: "Real engine" }, ...SCENARIOS.map((s) => ({ value: s.id, label: s.label }))] },
  { key: "speed", label: "Speed", default: "normal", options: [{ value: "fast", label: "Fast" }, { value: "normal", label: "6.5 s" }, { value: "slow", label: "Slow 22 s" }, { value: "hold", label: "Never answers" }] },
  {
    key: "error",
    label: "Error",
    options: [
      { value: "none", label: "None" },
      { value: "auth", label: "API key" },
      { value: "quota", label: "Quota" },
      { value: "offline", label: "Offline" },
      { value: "unknown", label: "Other" },
    ],
  },
]

/** Living chat only: one control per group of ideas from the reference board. */
const IDEA_CONTROLS: LabControl[] = IDEA_GROUPS.map((g) => ({
  key: g.key,
  label: g.label,
  options: [{ value: "now", label: "Now" }, ...g.options.map(([value, label]) => ({ value, label }))],
}))
const ALL_CONTROLS = [...CONTROLS, ...IDEA_CONTROLS]

/** Puts the last PDF back into a fresh form, so Restart and switching designs don't ask for it again. */
function KeepFile({ file, onFile }: { file: File | null; onFile: (f: File) => void }) {
  const form = useWizardForm()
  const current = useStore(form.store, (s) => s.values.file)
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    if (file && !form.state.values.file) {
      form.setFieldValue("file", file)
      form.setFieldValue("label", file.name.replace(/\.pdf$/i, "").replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 48))
    }
  }, [file, form])
  useEffect(() => {
    if (current && current !== file) onFile(current)
  }, [current])
  return null
}

/**
 * Add Book variant lab (dev builds only, `/books/new?lab`): every design is a whole flow, from
 * upload to create, fed by the same engine seam. The toolbar picks the design and what the engine
 * answers: the real engine, or a saved answer from a real book, at a chosen speed, or a real error.
 */
export default function AddBookLab() {
  const [values, set] = useLabParams(ALL_CONTROLS)
  const [run, setRun] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const real = useEngineClient()
  const engine = useMemo(
    () => labEngine(values.book as ScenarioId | "real", values.speed as Speed, values.error as LabError, real),
    [values.book, values.speed, values.error, real],
  )
  const variant = VARIANTS.find((v) => v.id === values.variant) ?? VARIANTS[0]
  const Variant = variant.Component
  const scenario = SCENARIOS.find((s) => s.id === values.book)
  const living = variant.id === "livechat"
  const ideas = useMemo(() => Object.fromEntries(IDEA_GROUPS.map((g) => [g.key, living ? values[g.key] : "now"])) as Ideas, [living, values])

  return (
    <EngineClientProvider value={engine}>
      <WizardProvider key={`${values.variant}-${values.book}-${values.speed}-${values.error}-${run}`}>
        <WizardFormProvider>
          <KeepFile file={file} onFile={setFile} />
          <IdeasContext.Provider value={ideas}>
            <Variant />
          </IdeasContext.Provider>
        </WizardFormProvider>
      </WizardProvider>
      <DevToolbar
        controls={living ? ALL_CONTROLS : CONTROLS}
        values={values}
        onChange={set}
        note={scenario ? <span title={scenario.note}>{scenario.note.split(" · ")[0]}</span> : undefined}
        actions={[{ key: "restart", label: "Restart", onClick: () => setRun((r) => r + 1) }]}
      />
    </EngineClientProvider>
  )
}
