import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useStore } from "@tanstack/react-form"
import { useLabParams, type LabControl } from "@/lab/DevToolbar"
import { LabBar, type StepItem } from "./LabBar"
import { WizardProvider } from "@/components/wizard/core/WizardProvider"
import { WizardFormProvider } from "@/components/wizard/core/WizardFormProvider"
import { useWizardForm } from "@/components/wizard/core/wizardForm"
import { BookCreationProvider } from "@/components/wizard/core/useBookCreation"
import { EngineClientProvider, useEngineClient } from "../engine/client"
import { proposedAnswers } from "../engine/answers"
import { labEngine, loadScenario, SCENARIOS, type LabError, type ScenarioId, type Speed } from "./mockEngine"
import { labCreation } from "./labCreation"
import { forgetSavedPdf, loadSavedPdf, savePdf } from "./savedPdf"
import { LabDriveContext, type FlowStep } from "../guided/shared/labDrive"
import { activitiesApply } from "../guided/check/screens"
import { GuidedFlow } from "../guided"
import { setAssistantStyle, type AssistantLookId } from "../guided/shared/assistantLook"
import { setCheckLayout, type CheckLayout } from "../guided/shared/checkLayout"

/** The flow in order; Error branches off Reading. Check is its screens; Activities shows only when the book answer has it. */
const FLOW: StepItem[] = [
  { id: "start", label: "Start" },
  { id: "reading", label: "Reading" },
  { id: "kind", label: "Kind" },
  { id: "language", label: "Language" },
  { id: "look", label: "Look" },
  { id: "pages", label: "Pages" },
  { id: "activities", label: "Activities" },
  { id: "name", label: "Name" },
  { id: "creating", label: "Creating" },
  { id: "done", label: "Done" },
  { id: "error", label: "Error" },
]

const SETTINGS: LabControl[] = [
  { key: "book", label: "Book answer", default: "two-questions", options: SCENARIOS.map((s) => ({ value: s.id, label: s.label })) },
  { key: "speed", label: "Speed", default: "normal", options: [{ value: "fast", label: "Fast" }, { value: "normal", label: "Normal" }, { value: "slow", label: "Slow" }, { value: "hold", label: "Never" }] },
  {
    key: "agent",
    label: "Assistant",
    default: "orb",
    options: [
      { value: "orb", label: "Assistant (orb)" },
      { value: "wizard", label: "Wizard" },
      { value: "buddy", label: "Buddy (book)" },
      { value: "bot", label: "Bot" },
    ],
  },
  {
    key: "layout",
    label: "Check layout",
    default: "card",
    options: [
      { value: "card", label: "Card (current)" },
      { value: "list", label: "List" },
      { value: "evidence", label: "Evidence" },
      { value: "sentence", label: "Sentence" },
    ],
  },
  {
    key: "library",
    label: "Library",
    default: "auto",
    options: [
      { value: "auto", label: "Real library" },
      { value: "empty", label: "Empty (first book)" },
      { value: "books", label: "Has books" },
    ],
  },
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
const STEP_CONTROL: LabControl = { key: "step", label: "Step", default: "start", options: [...FLOW.map((s) => ({ value: s.id, label: s.label }))] }

const ALL_CONTROLS = [...SETTINGS, STEP_CONTROL]

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
 * Add Book lab (dev builds only, `/books/new?lab`) for the Guided design. The bar's
 * stepper jumps the real flow to any step of the flow, with the steps before it answered with
 * the assistant's guesses, and follows the flow when you click through it by hand. The book
 * answer, speed and error are in its settings. Creating a book is simulated (no request reaches the API), and the last PDF
 * dropped is kept in IndexedDB so the jumps work after a reload.
 */
export default function AddBookLab() {
  const [values, set] = useLabParams(ALL_CONTROLS)
  const [file, setFile] = useState<File | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [jump, setJump] = useState<Jump>(() => ({ step: values.step as FlowStep, n: 0 }))
  const [actual, setActual] = useState<FlowStep>(() => (FLOW.some((s) => s.id === values.step) ? (values.step as FlowStep) : "kind"))
  const [activities, setActivities] = useState(true)
  const real = useEngineClient()

  useEffect(() => {
    void loadSavedPdf().then((f) => {
      if (f) setFile((cur) => cur ?? f)
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    let live = true
    void loadScenario(values.book as ScenarioId).then((rec) => live && setActivities(activitiesApply(rec, proposedAnswers(rec))))
    return () => {
      live = false
    }
  }, [values.book])

  // The Assistant setting picks the assistant's look (the user can still change it by clicking it).
  useEffect(() => {
    if (values.agent) setAssistantStyle({ look: values.agent as AssistantLookId })
  }, [values.agent])
  useEffect(() => {
    if (values.layout) setCheckLayout(values.layout as CheckLayout)
  }, [values.layout])

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

  const scenario = SCENARIOS.find((s) => s.id === values.book)

  const steps = FLOW.filter((s) => s.id !== "activities" || activities)

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
  const library = values.library === "empty" || values.library === "books" ? (values.library as "empty" | "books") : undefined
  const drive = useMemo(() => ({ target: mode === "play" ? null : mode, onStep, library }), [mode, onStep, library])

  const onChange = (key: string, value: string) => {
    if (key === "step") return goTo(value as FlowStep)
    set(key, value)
    // A new engine answer replays the flow to the step you were at, so entrances
    // and loaders play again with the new pick.
    if (key !== "speed" && key !== "error" && key !== "agent" && key !== "layout") setJump((j) => ({ step: j.step === "play" ? "play" : actual, n: j.n + 1 }))
  }

  return (
    <EngineClientProvider value={engine}>
      <BookCreationProvider value={creation}>
        {loaded && (
          <WizardProvider key={jump.n}>
            <WizardFormProvider>
              <KeepFile file={file} seed={mode !== "start"} onFile={keepFile} />
              <LabDriveContext.Provider value={drive}>
                <GuidedFlow />
              </LabDriveContext.Provider>
            </WizardFormProvider>
          </WizardProvider>
        )}
      </BookCreationProvider>
      <LabBar
        steps={steps}
        actual={actual}
        onStep={goTo}
        pdfName={file?.name ?? null}
        settings={SETTINGS}
        values={values}
        onChange={onChange}
        onReplay={() => goTo("play")}
        onForgetPdf={() => {
          setFile(null)
          void forgetSavedPdf()
          goTo("start")
        }}
        note={scenario?.note}
      />
    </EngineClientProvider>
  )
}
