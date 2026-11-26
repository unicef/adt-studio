import { useContext, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react"
import { flushSync } from "react-dom"
import { Trans, useLingui } from "@lingui/react/macro"
import { FileDropOverlay } from "@/components/ui/file-drop-overlay"
import { FlowTopBar } from "@/components/FlowTopBar"
import { cn } from "@/lib/utils"
import { applySettings } from "../engine/answers"
import { useEngineRun } from "../engine/useEngineRun"
import { morph } from "./shared/motion"
import { useAssistantName } from "./shared/Assistant"
import { useWizardForm } from "../../core/wizardForm"
import { useUploadFlow } from "../../start/upload/useUploadFlow"
import "../../core/flow.css"
import { FinishContext } from "./shared/finish"
import { NAME_INPUT } from "./shared/Create"
import { EngineError } from "./shared/EngineError"
import { LabDriveContext, useLabDrive } from "./shared/labDrive"
import { ReadingCard, ReadingMessage } from "./shared/Reading"
import { useAnswers } from "./shared/useAnswers"
import { useCreateRun } from "./shared/useCreateRun"
import { markTourSeen, useFirstBook, useFirstRun } from "./shared/useFirstBook"
import { Bubble } from "./Bubble"
import { CheckFlow } from "./check/CheckFlow"
import { CheckBars } from "./check/CheckBars"
import { CheckSays } from "./check/CheckSays"
import { useCheck } from "./check/useCheck"
import { useScreenValues } from "./check/useScreenValues"
import { CreatePanel, CreateSays } from "./CreatePanel"
import { Morph } from "./Morph"
import { Stepper } from "./Stepper"
import { STEPS, type StepId } from "./steps"
import { UploadPanel, UploadSays } from "./UploadPanel"
import "./guided.css"

/** How long the Check bubble stands alone before the first screen comes in under it. */
const REVEAL_MS = 650

/** How long the drop zone shows that the PDF is fine before the flow moves on. */
const READY_MS = 1100

/**
 * Guided: Add Book as four steps (Upload · Reading · Check · Create) with the ADT Assistant's one
 * bubble under the stepper, its words replaced at every step. Under the bubble is only what the
 * step needs: the drop zone, Check as small screens (one decision each, with bars under the
 * stepper and, on wide screens, the list of screens beside it), then the progress and the end. The
 * steps already done (in the stepper) open again.
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
  const check = useCheck(rec, chat)
  const firstBook = useFirstBook()
  const assistant = useAssistantName()
  const create = useCreateRun()
  const lastRun = create.runs[create.runs.length - 1]
  const values = useScreenValues(rec, chat.derived, flow.pageCount)

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

  const labTarget = useContext(LabDriveContext)?.target
  // Check: the bubble first, then the first screen under it.
  useEffect(() => {
    if (!rec) return setRevealed(false)
    // A lab jump straight to a Check screen shows it at once.
    if (labTarget && labTarget !== "start" && labTarget !== "reading") return setRevealed(true)
    const id = window.setTimeout(() => morph(() => setRevealed(true)), REVEAL_MS)
    return () => window.clearTimeout(id)
  }, [rec])

  // The step the flow is at; what's on screen follows it through a morph, so every step change animates.
  // The drop zone shows that the PDF is fine for a moment before the flow moves on (reading has
  // already started underneath). Lab jumps past Start don't wait.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!validFile) return setReady(false)
    if (labTarget && labTarget !== "start") return setReady(true)
    const id = window.setTimeout(() => setReady(true), READY_MS)
    return () => window.clearTimeout(id)
  }, [validFile, flow.fileKey])
  const atNow: StepId = !validFile || !ready ? "upload" : !rec ? "reading" : lastRun ? "create" : "check"
  const [at, setAt] = useState<StepId>(atNow)
  // A lab jump (or a reload on one) passes through the earlier steps on its way to the target:
  // those changes happen at once, and only the steps after it morph.
  const landed = useRef(false)
  useEffect(() => {
    if (at === atNow) return
    const jumping = !!labTarget && labTarget !== "start" && !landed.current
    if (atNow === "check" || atNow === "create") landed.current = true
    if (jumping) setAt(atNow)
    else morph(() => setAt(atNow))
  }, [atNow])
  // Until a lab jump (or a reload on one) reaches its step, the page stays blank: the steps it
  // passes on the way (upload, reading) never flash. With no PDF to jump with, Upload shows.
  const settling = !!flow.file && !!labTarget && labTarget !== "start" && labTarget !== "reading" && labTarget !== "error" && at !== "check" && at !== "create"

  // A first run starts with a tour of the page: the assistant, each card, then the drop zone.
  const firstRun = useFirstRun()
  const [tour, setTour] = useState<number | null>(null)
  const toured = useRef(false)
  useEffect(() => {
    // Not on a lab jump past Start: the lab opens a later step, not the first-run page.
    if (firstRun && !toured.current && !flow.file && (!labTarget || labTarget === "start")) {
      toured.current = true
      setTour(0)
    }
  }, [firstRun])
  const endTour = () => {
    markTourSeen()
    setTour(null)
  }
  // Dropping a PDF during the tour ends it.
  useEffect(() => {
    if (flow.file && tour !== null) endTour()
  }, [flow.file])
  const shown: StepId = view && STEPS.indexOf(view) < STEPS.indexOf(at) ? view : at
  // Dev lab only (no-op elsewhere): reports the step and plays the lab's jumps.
  useLabDrive({
    validFile,
    failed: !!failure,
    rec,
    chat,
    create,
    screen: rec ? check.at : null,
    jump: check.jump,
    flush: () => setRevealed(true),
  })

  const manual = () => {
    if (chat.derived) applySettings(form, chat.derived.effective)
    onManual()
  }
  const onCreate = () => {
    if (!chat.derived || !rec) return
    const left = chat.derived.asked.filter((f) => !(f.id in chat.answers))
    if (left.length) chat.skipRest(left)
    setView(null)
    void create.start(chat.derived.effective, rec.id)
  }
  const onRename = () => {
    flushSync(() => {
      setView("check")
      check.go("name")
    })
    const input = document.getElementById(NAME_INPUT) as HTMLInputElement | null
    input?.focus()
    input?.select()
  }

  // What the bubble says, and what's under it, for the step on screen.
  let says: ReactNode
  let swap: string = shown
  let panel: ReactNode = null
  let bars: ReactNode = null
  if (shown === "upload") {
    const shownTour = flow.file ? null : tour
    says = <UploadSays flow={flow} rejected={!!rejectedAt && !validFile} />
    swap = `upload-${rejectedAt}-${flow.error ?? ""}-${validFile}-${!!flow.file}-${shownTour === null}`
    panel = <UploadPanel flow={flow} rejected={!!rejectedAt && !validFile} onContinue={view === "upload" && validFile ? () => morph(() => setView(null)) : null} tour={shownTour} onTour={setTour} onTourDone={() => morph(endTour)} onTourAgain={() => setTour(0)} />
  } else if (shown === "reading") {
    if (failure) {
      swap = `failed-${attempt}`
      says = <EngineError failure={failure} current onRetry={() => setAttempt((a) => a + 1)} onManual={manual} />
    } else {
      swap = `reading-${attempt}`
      says = <ReadingMessage run={run} rec={rec} onManual={manual} />
      panel = <ReadingCard file={flow.file} pageCount={flow.pageCount} />
    }
  } else if (shown === "check" && rec && chat.derived && values) {
    swap = `check-${check.at}-${check.trying}`
    says = <CheckSays rec={rec} derived={chat.derived} screen={check.at} file={flow.file} pageCount={flow.pageCount} firstBook={firstBook} trying={check.trying} onTrying={check.setTrying} />
    panel = revealed && <CheckFlow rec={rec} chat={chat} check={check} values={values} file={flow.file} pageCount={flow.pageCount} locked={create.locked} onCreate={onCreate} onManual={manual} />
    bars = <CheckBars screens={check.screens} at={check.at} done={check.done} />
  } else if (shown === "create" && lastRun) {
    swap = `create-${lastRun.n}-${lastRun.status === "failed" ? "failed" : lastRun.status === "done" ? "done" : "busy"}`
    says = <CreateSays run={lastRun} onRetry={onCreate} onRename={onRename} />
    panel = <CreatePanel run={lastRun} />
  }

  const busy = (shown === "reading" && !failure) || (shown === "create" && !!lastRun && (lastRun.status === "saving" || lastRun.status === "extracting"))
  const tone = failure && shown === "reading" ? "error" : lastRun?.status === "failed" && shown === "create" ? "error" : lastRun?.status === "done" && shown === "create" ? "done" : shown

  // The page column: Check is one focused column, Upload shows its three cards side by side.
  const column = shown === "check" ? "max-w-[760px]" : shown === "upload" ? "max-w-[760px] lg:max-w-[1080px]" : "max-w-[760px] lg:max-w-[880px]"
  const scroller = useRef<HTMLDivElement>(null)
  const { scale, vh } = usePageScale(scroller)
  return (
    <FinishContext.Provider value={{ onOpen: create.open }}>
      <div className="lc-root gd-root relative flex h-full min-h-0 flex-1 flex-col overflow-clip" data-tone={tone}>
        <FlowTopBar title={t`Add Book`} />
        <FileDropOverlay overlay={flow.overlay} dropLabel={<Trans>Drop PDF here</Trans>} errorLabel={<Trans>Only PDF files are supported</Trans>} accent="blue" />
        <input ref={flow.inputRef} type="file" accept="application/pdf" className="hidden" onChange={flow.onInputChange} />
        <div aria-hidden className="gd-tint pointer-events-none absolute inset-0">
          {(["upload", "reading", "check", "create", "done", "error"] as const).map((k) => (
            <span key={k} data-tint={k} />
          ))}
        </div>

        <div ref={scroller} className={cn("relative flex-1 overflow-y-auto overflow-x-hidden", settling && "invisible")} aria-busy={settling || undefined}>
          {/* One column per step, and the stepper takes the same width, so its ends line up with the
              bubble and the content. On big windows the whole page scales up (zoom) instead of
              floating small in the middle; on short ones the spacing tightens. */}
          <div className="mx-auto flex w-full flex-col px-4 pb-24 pt-6 sm:px-6 sm:pt-8 [@media(max-height:800px)]:pt-4" style={{ zoom: scale, "--gd-vh": `${vh}px` } as CSSProperties}>
            <div className={cn("gd-col mx-auto w-full", column)}>
              <Stepper at={at} shown={shown} failed={!!failure && at === "reading"} locked={create.locked} complete={lastRun?.status === "done"} onGo={(s) => morph(() => setView(s === at ? null : s))} checkBars={bars} />
            </div>
            <div className={cn("gd-col mx-auto mt-7 w-full lg:mt-9 [@media(max-height:800px)]:mt-4", column)}>
              <div className="min-w-0">
                <Bubble swap={swap} busy={busy} away={shown === "upload" && !flow.file && tour !== null}>
                  {says}
                </Bubble>
                <Morph swap={`${shown}-${!!panel}`} name="gd-panel" className="-mx-2 mt-4" inner="px-2 pb-3 pt-1">
                  {panel}
                </Morph>
              </div>
            </div>
          </div>
        </div>
        <span role="status" className="sr-only">
          {busy && shown === "reading" ? <Trans>The {assistant} is reading your book…</Trans> : null}
        </span>
      </div>
    </FinishContext.Provider>
  )
}

/**
 * How much the page scales up on a big window: 1 up to the desktop app's default window
 * (1440x900), then with the window (width and height both), up to 1.5. A desktop window is never
 * smaller than 1280x720, where the page stays at 1 and its spacing tightens instead.
 */
function usePageScale(ref: RefObject<HTMLElement | null>): { scale: number; vh: number } {
  const [size, setSize] = useState({ scale: 1, vh: typeof window === "undefined" ? 9 : window.innerHeight / 100 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      const s = Math.min(el.clientWidth / 1440, el.clientHeight / 920)
      const scale = Math.round(Math.min(1.5, Math.max(1, s)) * 100) / 100
      // A vh inside the scaled page is scaled too: --gd-vh is one hundredth of the window's height in page units.
      setSize({ scale, vh: window.innerHeight / scale / 100 })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}
