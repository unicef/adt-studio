import { useContext, useEffect, useState, type ReactNode } from "react"
import { flushSync } from "react-dom"
import { Trans, useLingui } from "@lingui/react/macro"
import type { SetupBookFactId, SetupSettingId } from "@adt/types"
import { FileDropOverlay } from "@/components/ui/file-drop-overlay"
import { FlowTopBar } from "@/components/FlowTopBar"
import { applySettings } from "../../engine/answers"
import { useEngineRun } from "../../engine/useEngineRun"
import { useWizardForm } from "../../../core/wizardForm"
import { useUploadFlow } from "../../../start/upload/useUploadFlow"
import "../../../core/flow.css"
import { FinishContext } from "../livechat/ideas/finish/context"
import { NAME_INPUT } from "../chat/Create"
import { EngineError } from "../chat/EngineError"
import { LabDriveContext, useLabDrive } from "../chat/labDrive"
import { ReadingMessage } from "../chat/Reading"
import { useAnswers, type SettingValue } from "../chat/useAnswers"
import { useCreateRun } from "../chat/useCreateRun"
import { Bubble } from "./Bubble"
import { CheckAside, CheckMain } from "./CheckPanel"
import { CreatePanel, CreateSays } from "./CreatePanel"
import { useGuidedIdea } from "./ideas"
import { Morph } from "./Morph"
import { Stepper } from "./Stepper"
import { STEPS, type StepId } from "./steps"
import { Summary } from "./Summary"
import { UploadPanel, UploadSays } from "./UploadPanel"
import "./guided.css"

/** How long the Check bubble stands alone before the questions and settings come in under it. */
const REVEAL_MS = 650

/**
 * Guided: Add Book as four steps (Upload · Reading · Check · Create) with the ADT Assistant's one
 * bubble under the stepper, its words replaced at every step. Under the bubble is only what the
 * step needs: the drop zone, the questions the engine asks (often none) with the setup in plain
 * words, then the progress and the end. No composer and no thread: answers tick their question,
 * and the steps already done (in the stepper) open again.
 */
export function Guided({ onManual }: { onManual: () => void }) {
  const { t } = useLingui()
  const form = useWizardForm()
  const flow = useUploadFlow()
  const validFile = !!flow.file && flow.pageCount > 0 && !flow.error
  const [attempt, setAttempt] = useState(0)
  const [rejectedAt, setRejectedAt] = useState(0)
  const [view, setView] = useState<StepId | null>(null)
  const [revealed, setRevealed] = useState(false)
  const run = useEngineRun(validFile ? flow.file : null, attempt)
  const rec = run.status === "done" ? run.rec : null
  const failure = run.status === "failed" ? run.failure : null
  const chat = useAnswers(rec)
  const create = useCreateRun()
  const drive = useContext(LabDriveContext)
  const loader = useGuidedIdea("loader")
  const ambient = useGuidedIdea("ambient")
  const lastRun = create.runs[create.runs.length - 1]

  // A new PDF starts again from Reading.
  useEffect(() => {
    setAttempt(0)
    setView(null)
    chat.reset()
    create.reset()
  }, [flow.fileKey])
  useEffect(() => {
    if (flow.rejectedAt) setRejectedAt(flow.rejectedAt)
  }, [flow.rejectedAt])
  useEffect(() => {
    if (validFile) setRejectedAt(0)
  }, [validFile])

  // Check: the bubble first, then what's under it (a lab jump to Found holds it there).
  useEffect(() => {
    if (!rec) return setRevealed(false)
    if (drive?.target === "found") return
    const id = window.setTimeout(() => setRevealed(true), REVEAL_MS)
    return () => window.clearTimeout(id)
  }, [rec])

  const at: StepId = !validFile ? "upload" : !rec ? "reading" : lastRun ? "create" : "check"
  const shown: StepId = view && STEPS.indexOf(view) < STEPS.indexOf(at) ? view : at
  const pending = chat.derived?.pending ?? null

  // Dev lab only (no-op elsewhere): reports the step and plays the lab's jumps.
  useLabDrive({
    validFile,
    failed: !!failure,
    rec,
    chat,
    create,
    lastStep: !revealed ? "found" : pending ? `q-${pending.id}` : "ready",
    flush: () => drive?.target !== "found" && setRevealed(true),
  })

  const manual = () => {
    if (chat.derived) applySettings(form, chat.derived.effective)
    onManual()
  }
  const onAnswer = (fact: SetupBookFactId, value: string) => chat.answer(fact, value)
  const onSetting = (id: SetupSettingId, value: SettingValue) => chat.override(id, value)
  const onCreate = () => {
    if (!chat.derived || !rec) return
    const left = chat.derived.asked.filter((f) => !(f.id in chat.answers))
    if (left.length) chat.skipRest(left)
    setView(null)
    void create.start(chat.derived.effective, rec.id)
  }
  const onRename = () => {
    flushSync(() => setView("check"))
    const input = document.getElementById(NAME_INPUT) as HTMLInputElement | null
    input?.focus()
    input?.select()
  }

  // What the bubble says, and what's under it, for the step on screen.
  let says: ReactNode
  let swap: string = shown
  let panel: ReactNode = null
  let aside: ReactNode = null
  if (shown === "upload") {
    says = <UploadSays flow={flow} rejected={!!rejectedAt && !validFile} />
    swap = `upload-${rejectedAt}-${flow.error ?? ""}-${validFile}`
    panel = <UploadPanel flow={flow} onContinue={validFile ? () => setView(null) : null} />
  } else if (shown === "reading") {
    if (failure) {
      swap = `failed-${attempt}`
      says = <EngineError failure={failure} current onRetry={() => setAttempt((a) => a + 1)} onManual={manual} />
    } else {
      swap = `reading-${attempt}`
      says = <ReadingMessage idea={loader} file={flow.file!} pageCount={flow.pageCount} run={run} rec={rec} onManual={manual} />
    }
  } else if (shown === "check" && rec && chat.derived) {
    const left = chat.derived.asked.filter((f) => !(f.id in chat.answers)).length
    says = <Summary rec={rec} derived={chat.derived} file={flow.file} left={left} />
    panel = revealed && <CheckMain rec={rec} chat={chat} file={flow.file} locked={create.locked} onAnswer={onAnswer} />
    aside = revealed && <CheckAside rec={rec} chat={chat} file={flow.file} pageCount={flow.pageCount} locked={create.locked} onSetting={onSetting} onCreate={onCreate} onManual={manual} />
  } else if (shown === "create" && lastRun) {
    swap = `create-${lastRun.n}-${lastRun.status === "failed" ? "failed" : lastRun.status === "done" ? "done" : "busy"}`
    says = <CreateSays run={lastRun} onRetry={onCreate} onRename={onRename} />
    panel = <CreatePanel run={lastRun} onOpen={create.open} />
  }

  const busy = (shown === "reading" && !failure) || (shown === "create" && !!lastRun && (lastRun.status === "saving" || lastRun.status === "extracting"))
  const tone = failure && shown === "reading" ? "error" : lastRun?.status === "failed" && shown === "create" ? "error" : lastRun?.status === "done" && shown === "create" ? "done" : shown

  return (
    <FinishContext.Provider value={{ onOpen: create.open }}>
      <div className="lc-root gd-root relative flex h-full min-h-0 flex-1 flex-col overflow-hidden" data-tone={tone}>
        <FlowTopBar title={t`Add Book`} />
        <FileDropOverlay overlay={flow.overlay} dropLabel={<Trans>Drop PDF here</Trans>} errorLabel={<Trans>Only PDF files are supported</Trans>} accent="blue" />
        <input ref={flow.inputRef} type="file" accept="application/pdf" className="hidden" onChange={flow.onInputChange} />
        {ambient === "g34" && (
          <div aria-hidden className="gd-tint pointer-events-none absolute inset-0">
            {(["upload", "reading", "check", "create", "done", "error"] as const).map((k) => (
              <span key={k} data-tint={k} />
            ))}
          </div>
        )}

        <div className="relative flex-1 overflow-y-auto overflow-x-hidden">
          {/* Check uses the width: what was found and the questions on the left, the setup and Create beside it. The other steps stay one calm column. */}
          <div className="mx-auto flex w-full max-w-[1120px] flex-col px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
            <div className="mx-auto w-full max-w-[760px]">
              <Stepper at={at} shown={shown} failed={!!failure && at === "reading"} locked={create.locked} complete={lastRun?.status === "done"} onGo={(s) => setView(s === at ? null : s)} />
            </div>
            <div className={shown === "check" ? "mt-7 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-8" : "mx-auto mt-7 w-full max-w-[760px]"}>
              <div className="min-w-0">
                <Bubble swap={swap} busy={busy}>
                  {says}
                </Bubble>
                <Morph swap={`${shown}-${!!panel}`} className="-mx-2 mt-4" inner="px-2 pb-3 pt-1">
                  {panel}
                </Morph>
              </div>
              {aside}
            </div>
          </div>
        </div>
        <span role="status" className="sr-only">
          {busy && shown === "reading" ? <Trans>The ADT Assistant is reading your book…</Trans> : null}
        </span>
      </div>
    </FinishContext.Provider>
  )
}
