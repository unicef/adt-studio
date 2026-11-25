import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useStore } from "@tanstack/react-form"
import { useLabParams, type LabControl } from "@/lab/DevToolbar"
import { LabBar, type StepItem } from "./LabBar"
import { WizardProvider } from "@/components/wizard/core/WizardProvider"
import { WizardFormProvider } from "@/components/wizard/core/WizardFormProvider"
import { useWizardForm } from "@/components/wizard/core/wizardForm"
import { BookCreationProvider } from "@/components/wizard/core/useBookCreation"
import { EngineClientProvider, useEngineClient } from "../engine/client"
import { askedFacts } from "../engine/answers"
import { labEngine, loadScenario, SCENARIOS, type LabError, type ScenarioId, type Speed } from "./mockEngine"
import { labCreation } from "./labCreation"
import { forgetSavedPdf, loadSavedPdf, savePdf } from "./savedPdf"
import { VARIANTS } from "../variants"
import { IDEA_GROUPS, IdeasContext, type IdeaGroup, type Ideas } from "../variants/chat/ideas"
import { LabDriveContext, type FlowStep } from "../variants/chat/labDrive"
import { GUIDED_IDEAS, GUIDED_STEP_GROUPS, PLAIN } from "../variants/guided/ideas"

/** The flow in order; Error branches off Reading. Question steps show only as many as the book answer asks. */
const FLOW: StepItem[] = [
  { id: "start", label: "Start" },
  { id: "reading", label: "Reading" },
  { id: "found", label: "Found" },
  { id: "q1", label: "Q1" },
  { id: "q2", label: "Q2" },
  { id: "ready", label: "Ready" },
  { id: "creating", label: "Creating" },
  { id: "done", label: "Done" },
  { id: "error", label: "Error" },
]

/**
 * Living chat: the ideas that change each step. Checked by opening every step with each idea on and
 * comparing it with "Now" (screenshot, DOM and the animations that run), then kept to the ones that
 * matter for what the step is about (an idea that only restyles a folded earlier step isn't listed).
 */
const STEP_IDEAS: Record<FlowStep, string[]> = {
  start: ["a1", "a4", "g30", "g31", "g32", "g33", "g34"],
  reading: ["c12", "c13", "c14", "c15", "c16", "c17", "a1", "a2", "a4", "b7", "g30", "g31", "g32", "g34"],
  found: ["cite", "e22", "e23", "e25", "c14", "c15", "a1", "a2", "a3", "a4", "b6", "b7", "b8", "b11", "g31", "g32", "g34"],
  q1: ["d18", "d19", "d21", "cite", "e23", "a1", "a2", "a3", "a4", "b6", "b7", "b8", "b11", "g31", "g32", "g33", "g34"],
  q2: ["d18", "d19", "d21", "cite", "e23", "a1", "a2", "a3", "a4", "b6", "b7", "b8", "b11", "g31", "g32", "g33", "g34"],
  ready: ["b6", "b7", "b8", "b9", "b10", "b11", "e24", "a1", "a2", "a3", "a4", "g31", "g32", "g33", "g34"],
  creating: ["f26", "f29", "a1", "a4", "b7", "g30", "g31", "g34"],
  done: ["f26", "f27", "f28", "f29", "a1", "a4", "b7", "g31", "g33", "g34"],
  error: ["a1", "a2", "a4", "b7", "g30", "g31", "g32", "g33", "g34"],
}
const groupOf = (idea: string) => IDEA_GROUPS.find((g) => g.options.some(([v]) => v === idea))!.key
export const STEP_GROUPS = Object.fromEntries(
  Object.entries(STEP_IDEAS).map(([step, ideas]) => [step, [...new Set(ideas.map(groupOf))]]),
) as Record<FlowStep, IdeaGroup[]>

const SETTINGS: LabControl[] = [
  { key: "variant", label: "Design", default: "livechat", options: VARIANTS.map((v) => ({ value: v.id, label: v.short })) },
  { key: "book", label: "Book answer", default: "two-questions", options: SCENARIOS.map((s) => ({ value: s.id, label: s.label })) },
  { key: "speed", label: "Speed", default: "normal", options: [{ value: "fast", label: "Fast" }, { value: "normal", label: "Normal" }, { value: "slow", label: "Slow" }, { value: "hold", label: "Never" }] },
  {
    key: "error",
    label: "Error",
    options: [
      { value: "none", label: "No error" },
      { value: "auth", label: "API key" },
      { value: "quota", label: "Quota" },
      { value: "offline", label: "Offline" },
      { value: "unknown", label: "Other" },
    ],
  },
]
const STEP_CONTROL: LabControl = { key: "step", label: "Step", default: "start", options: FLOW.map((s) => ({ value: s.id, label: s.label })) }

/** Living chat: one control per group of ideas from the reference board. */
const IDEA_CONTROLS: LabControl[] = IDEA_GROUPS.map((g) => ({
  key: g.key,
  label: g.label,
  // eslint-disable-next-line lingui/no-unlocalized-strings -- dev-only lab labels
  options: [{ value: "now", label: "Now", hint: "Living chat as it is, no idea on." }, ...g.options.map(([value, label, hint]) => ({ value, label, hint }))],
}))

/**
 * Guided: only the groups and ideas that apply to it. "Now" is Guided's own pick (its default);
 * Plain turns the group off.
 */
const GUIDED_CONTROLS: LabControl[] = IDEA_GROUPS.flatMap((g) => {
  const spec = (GUIDED_IDEAS as Record<string, { default: string; options: readonly string[] }>)[g.key]
  if (!spec) return []
  const option = (id: string) => g.options.find(([value]) => value === id)!
  const [, defLabel, defHint] = option(spec.default)
  return [
    {
      key: g.key,
      label: g.label,
      options: [
        // eslint-disable-next-line lingui/no-unlocalized-strings -- dev-only lab labels
        { value: "now", label: `Default: ${defLabel}`, hint: `Guided's pick (${spec.default}). ${defHint}` },
        ...spec.options.filter((id) => id !== spec.default).map((id) => {
          const [value, label, hint] = option(id)
          return { value, label, hint }
        }),
        // eslint-disable-next-line lingui/no-unlocalized-strings -- dev-only lab labels
        { value: PLAIN, label: "Plain", hint: "No idea from the board for this group." },
      ],
    },
  ]
})

/** Every value a group can take in any design, so the URL keeps it when switching designs. */
const PARAM_CONTROLS: LabControl[] = IDEA_CONTROLS.map((c) => {
  const guided = GUIDED_CONTROLS.find((g) => g.key === c.key)
  return { ...c, options: [...c.options, ...(guided?.options.filter((o) => !c.options.some((x) => x.value === o.value)) ?? [])] }
})
const ALL_CONTROLS = [...SETTINGS, STEP_CONTROL, ...PARAM_CONTROLS]

/** The idea controls and the groups each step shows, per design (none for the designs without ideas). */
const DESIGN_IDEAS: Record<string, { controls: LabControl[]; groups: Record<FlowStep, IdeaGroup[]>; only?: Record<FlowStep, string[]> }> = {
  livechat: { controls: IDEA_CONTROLS, groups: STEP_GROUPS, only: STEP_IDEAS },
  guided: { controls: GUIDED_CONTROLS, groups: GUIDED_STEP_GROUPS },
}

/** A design's idea value for a group: the lab's value when the design offers it, else "now". */
const valueFor = (controls: LabControl[], key: string, value: string | undefined) => (controls.find((c) => c.key === key)?.options.some((o) => o.value === value) ? value! : "now")

/** A jump: the step to land on ("play" runs from the PDF at the chosen speed), and a counter that remounts the flow. */
type Jump = { step: FlowStep | "play"; n: number }

/** Puts the lab's PDF into a fresh form (unless the jump is to Start), and keeps any PDF dropped. */
function KeepFile({ file, seed, onFile }: { file: File | null; seed: boolean; onFile: (f: File) => void }) {
  const form = useWizardForm()
  const current = useStore(form.store, (s) => s.values.file)
  const seeded = useRef(false)
  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    if (seed && file && !form.state.values.file) {
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
 * Add Book variant lab (dev builds only, `/books/new?lab`), centred on Living chat and Guided. The bar's
 * stepper jumps the real thread to any step of the flow, with the steps before it answered with
 * the assistant's guesses, and follows the thread when you click through it by hand. Only the idea
 * groups that change the current step are in the bar; the design, the book answer, speed and error
 * are in its settings. Creating a book is simulated (no request reaches the API), and the last PDF
 * dropped is kept in IndexedDB so the jumps work after a reload.
 */
export default function AddBookLab() {
  const [values, set] = useLabParams(ALL_CONTROLS)
  const [file, setFile] = useState<File | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [jump, setJump] = useState<Jump>(() => ({ step: values.step as FlowStep, n: 0 }))
  const [actual, setActual] = useState<FlowStep>(values.step as FlowStep)
  const [questions, setQuestions] = useState<number | null>(null)
  const real = useEngineClient()

  useEffect(() => {
    void loadSavedPdf().then((f) => {
      if (f) setFile((cur) => cur ?? f)
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    let live = true
    setQuestions(null)
    void loadScenario(values.book as ScenarioId).then((rec) => live && setQuestions(askedFacts(rec).length))
    return () => {
      live = false
    }
  }, [values.book])

  const keepFile = useCallback((f: File) => {
    setFile(f)
    void savePdf(f)
  }, [])

  const mode = jump.step
  const natural = mode === "play" || mode === "start"
  const engine = useMemo(() => {
    const speed: Speed = mode === "reading" ? "hold" : natural ? (values.speed as Speed) : "instant"
    const error: LabError = mode === "error" ? (values.error === "none" ? "auth" : (values.error as LabError)) : natural ? (values.error as LabError) : "none"
    return labEngine(values.book as ScenarioId, speed, error, real)
  }, [mode, natural, values.book, values.speed, values.error, real])
  const creation = useMemo(() => labCreation(mode === "creating"), [mode])

  const variant = VARIANTS.find((v) => v.id === values.variant) ?? VARIANTS[0]!
  const Variant = variant.Component
  const chatLike = variant.id === "livechat" || variant.id === "chat" || variant.id === "guided"
  const design = DESIGN_IDEAS[variant.id]
  const scenario = SCENARIOS.find((s) => s.id === values.book)
  const ideas = useMemo(() => Object.fromEntries(IDEA_GROUPS.map((g) => [g.key, design ? valueFor(design.controls, g.key, values[g.key]) : "now"])) as Ideas, [design, values])

  const steps = FLOW.filter((s) => !(s.id === "q1" && questions === 0) && !(s.id === "q2" && questions !== null && questions < 2))

  const goTo = (step: FlowStep | "play") => {
    if (step !== "start" && step !== "play" && !file) return
    setJump((j) => ({ step, n: j.n + 1 }))
    if (step !== "play") {
      setActual(step)
      set("step", step)
    }
  }

  const onStep = useCallback(
    (step: FlowStep) => {
      setActual(step)
      set("step", step)
    },
    [set],
  )
  const drive = useMemo(() => ({ target: mode === "play" ? null : mode, onStep }), [mode, onStep])

  const onChange = (key: string, value: string) => {
    if (key === "step") return goTo(value as FlowStep)
    set(key, value)
    // A new design, engine answer or idea replays the flow to the step you were at, so entrances
    // and loaders play again with the new pick.
    if (key !== "speed" && key !== "error") setJump((j) => ({ step: j.step === "play" ? "play" : actual, n: j.n + 1 }))
  }

  return (
    <EngineClientProvider value={engine}>
      <BookCreationProvider value={creation}>
        {loaded && (
          <WizardProvider key={`${values.variant}-${jump.n}`}>
            <WizardFormProvider>
              <KeepFile file={file} seed={mode !== "start"} onFile={keepFile} />
              <LabDriveContext.Provider value={drive}>
                <IdeasContext.Provider value={ideas}>
                  <Variant />
                </IdeasContext.Provider>
              </LabDriveContext.Provider>
            </WizardFormProvider>
          </WizardProvider>
        )}
      </BookCreationProvider>
      <LabBar
        steps={chatLike ? steps : []}
        actual={actual}
        onStep={goTo}
        pdfName={file?.name ?? null}
        settings={SETTINGS}
        ideas={design?.controls ?? []}
        shownGroups={design?.groups[actual] ?? []}
        shownIdeas={design?.only?.[actual]}
        values={values}
        onChange={onChange}
        onReplay={() => goTo("play")}
        onForgetPdf={() => {
          setFile(null)
          void forgetSavedPdf()
          goTo("start")
        }}
        note={scenario?.note}
        designName={variant.name}
      />
    </EngineClientProvider>
  )
}
