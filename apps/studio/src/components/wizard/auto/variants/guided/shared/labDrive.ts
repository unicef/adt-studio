import { createContext, useContext, useEffect, useRef } from "react"
import type { SetupRecommendation } from "@adt/types"
import { askedFacts } from "../../../engine/answers"
import { screenOf, type ScreenId } from "../check/screens"
import type { Answers } from "./useAnswers"
import type { useCreateRun } from "./useCreateRun"

/** Where the flow is, in order, for the lab's stepper: Check is its screens. */
export type FlowStep = "start" | "reading" | ScreenId | "creating" | "done" | "error"

/** A lab jump: a step, or one of the older names (found = the first screen, q1 / q2 = the screen of the first / second question, ready = the last screen). */
export type LabTarget = FlowStep | "found" | "q1" | "q2" | "ready"

const ORDER: FlowStep[] = ["start", "reading", "kind", "look", "pages", "activities", "name", "creating", "done", "error"]

const SCREENS: string[] = ["kind", "look", "pages", "activities", "name"]
const isScreen = (step: string): step is ScreenId => SCREENS.includes(step)

/** The step a jump lands on, once the engine's answer says which screens ask. */
export function resolveTarget(target: LabTarget, rec: SetupRecommendation | null): FlowStep {
  if (target === "found") return "kind"
  if (target === "ready") return "name"
  if (target === "q1" || target === "q2") {
    const asked = rec ? askedFacts(rec) : []
    const fact = asked[target === "q2" ? 1 : 0] ?? asked[0]
    return fact ? screenOf(fact.id) : "kind"
  }
  return target
}

/**
 * The lab's hold on the flow (dev only; `null` everywhere else): `target` is the step the lab
 * jumped to, so the flow opens that screen (the ones before it passed with the assistant's
 * guesses); `onStep` hears where the flow really is, also when the user clicks through it by hand.
 */
export const LabDriveContext = createContext<{ target: LabTarget | null; onStep: (step: FlowStep) => void } | null>(null)

const useDrive = () => useContext(LabDriveContext)

type DriveInput = {
  validFile: boolean
  failed: boolean
  rec: SetupRecommendation | null
  chat: Answers
  create: ReturnType<typeof useCreateRun>
  /** The Check screen on view. */
  screen: ScreenId | null
  /** Opens a Check screen, the ones before it passed. */
  jump: (screen: ScreenId) => void
  flush: () => void
}

/** The step the flow is at, from what it shows. */
function stepOf({ validFile, failed, rec, create, screen }: DriveInput): FlowStep {
  if (!validFile) return "start"
  if (failed) return "error"
  if (!rec) return "reading"
  const run = create.runs[create.runs.length - 1]
  if (run && run.status !== "failed") return run.status === "done" ? "done" : "creating"
  return screen ?? "kind"
}

/**
 * Lab only: reports the flow's step, and plays a jump. Once the engine answers it shows what's
 * there at once: a Check screen opens with the ones before it passed (their guesses kept), and
 * Creating / Done take every guess and create the book (through the lab's simulated creation).
 */
export function useLabDrive(input: DriveInput) {
  const drive = useDrive()
  const step = stepOf(input)
  const { rec, chat, create, jump, flush } = input
  const target = drive?.target ? resolveTarget(drive.target, rec) : null
  const answered = useRef(false)
  const created = useRef(false)

  // While a jump plays, the steps on the way aren't reported (the bar would flicker through them).
  const arrived = useRef(false)
  useEffect(() => {
    if (!drive) return
    if (!arrived.current) arrived.current = !target || step === "error" || ORDER.indexOf(step) >= ORDER.indexOf(target)
    if (arrived.current) drive.onStep(step)
  }, [step, drive])

  useEffect(() => {
    if (!drive || !target || !rec || !chat.derived || answered.current) return
    if (target === "start" || target === "reading" || target === "error") return
    answered.current = true
    if (isScreen(target)) jump(target)
    else for (const f of chat.derived.asked) chat.answer(f.id, f.value)
    flush()
  }, [rec, chat.derived])

  useEffect(() => {
    if (!drive || (target !== "creating" && target !== "done") || !rec || !chat.derived || created.current) return
    if (chat.derived.pending || create.runs.length) return
    created.current = true
    void create.start(chat.derived.effective, rec.id)
    flush()
  }, [chat.derived])
}
