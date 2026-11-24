import { createContext, useContext, useEffect, useRef } from "react"
import type { SetupRecommendation } from "@adt/types"
import type { Answers } from "./useAnswers"
import type { useCreateRun } from "./useCreateRun"
import type { Message } from "./useThread"

/** Where the conversation is, in flow order, for the lab's stepper. */
export type FlowStep = "start" | "reading" | "found" | "q1" | "q2" | "ready" | "creating" | "done" | "error"

const ORDER: FlowStep[] = ["start", "reading", "found", "q1", "q2", "ready", "creating", "done", "error"]

/**
 * The lab's hold on the thread (dev only; `null` everywhere else): `target` is the step the lab
 * jumped to, so the thread answers what comes before it with the assistant's guesses; `onStep`
 * hears where the thread really is, also when the user clicks through it by hand.
 */
export const LabDriveContext = createContext<{ target: FlowStep | null; onStep: (step: FlowStep) => void } | null>(null)

const useDrive = () => useContext(LabDriveContext)

/** On a jump to Found, the thread stops after what was found (the first question waits). */
export function useHoldAtFound(messages: Message[]) {
  const drive = useDrive()
  return drive?.target === "found" ? messages.filter((m) => m.step === "book" || m.step === "found") : messages
}

type DriveInput = {
  validFile: boolean
  failed: boolean
  rec: SetupRecommendation | null
  chat: Answers
  create: ReturnType<typeof useCreateRun>
  lastStep: string | undefined
  flush: () => void
}

/** The step the thread is at, from what it shows. */
function stepOf({ validFile, failed, rec, chat, create, lastStep }: DriveInput): FlowStep {
  if (!validFile) return "start"
  if (failed) return "error"
  if (!rec) return "reading"
  const run = create.runs[create.runs.length - 1]
  if (run && run.status !== "failed") return run.status === "done" ? "done" : "creating"
  const step = lastStep ?? ""
  if (step.startsWith("q-")) return (chat.derived?.asked.findIndex((f) => `q-${f.id}` === step) ?? 0) > 0 ? "q2" : "q1"
  if (step === "ready" || step === "skip" || step.startsWith("create-")) return "ready"
  return "found"
}

/**
 * Lab only: reports the thread's step, and plays a jump. Once the engine answers it shows what's
 * there at once, answers the questions before the target with the assistant's own guesses, and
 * for Creating / Done creates the book (through the lab's simulated creation).
 */
export function useLabDrive(input: DriveInput) {
  const drive = useDrive()
  const step = stepOf(input)
  const { rec, chat, create, flush } = input
  const target = drive?.target ?? null
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
    const asked = chat.derived.asked
    const before = target === "found" || target === "q1" ? [] : target === "q2" ? asked.slice(0, 1) : asked
    for (const f of before) chat.answer(f.id, f.value)
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
