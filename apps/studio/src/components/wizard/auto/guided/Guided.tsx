import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode, type RefObject } from "react"
import { flushSync } from "react-dom"
import { Trans, useLingui } from "@lingui/react/macro"
import { FileDropOverlay } from "@/components/ui/file-drop-overlay"
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
import { ReadingCard, ReadingMessage } from "./shared/Reading"
import { useAnswers } from "./shared/useAnswers"
import { useCreateRun } from "./shared/useCreateRun"
import { markTourSeen, useFirstBook, useFirstRun } from "./shared/useFirstBook"
import { Bubble } from "./Bubble"
import { CheckFlow } from "./check/CheckFlow"
import { confirmedVariety } from "./check/screens"
import { CheckBars } from "./check/CheckBars"
import { CheckSays } from "./check/CheckSays"
import { useCheck } from "./check/useCheck"
import { useScreenValues } from "./check/useScreenValues"
import { CreatePanel, CreateSays } from "./CreatePanel"
import { Morph } from "./Morph"
import { FlowTopBar } from "@/components/FlowTopBar"
import { PdfRow } from "./pdf/PdfRow"
import { Stepper } from "./Stepper"
import { STEPS, type StepId } from "./steps"
import { UploadPanel, UploadSays } from "./UploadPanel"
import "./guided.css"
import { useStore } from "@tanstack/react-form"
import { useDevMode } from "../dev/devMode"

// Dev builds only: dev mode's decision report (`?dev`). Left out of production bundles.
// eslint-disable-next-line lingui/no-unlocalized-strings -- module path
const DecisionReport = import.meta.env.DEV ? lazy(() => import("../dev/DecisionReport")) : null

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
/** `value` while `active`; while not, the last value it had when it was. */
function useHeldWhile<T>(active: boolean, value: T): T {
  const [held, setHeld] = useState(value)
  if (active && held !== value) setHeld(value)
  return active ? value : held
}

export function Guided({ onManual, active = true }: { onManual: () => void; active?: boolean }) {
  const { t } = useLingui()
  const form = useWizardForm()
  const devMode = useDevMode()
  const devForm = useStore(form.store, (st) => ({ scope: st.values.scope, startPage: st.values.startPage, endPage: st.values.endPage, editingLanguage: st.values.editingLanguage, label: st.values.label }))
  const create = useCreateRun()
  // While the book is being saved or its extraction starts, the PDF can't change (no drop, no Change PDF).
  const creating = create.runs.some((r) => r.status === "saving" || r.status === "extracting")
  const flow = useUploadFlow({ active: active && !creating })
  const validFile = !!flow.file && flow.pageCount > 0 && !flow.error
  const [attempt, setAttempt] = useState(0)
  const [rejectedAt, setRejectedAt] = useState(0)
  const [view, setView] = useState<StepId | null>(null)
  const [revealed, setRevealed] = useState(false)
  // While the manual wizard is open over this flow, a PDF picked there must not start (and pay for)
  // a reading here; the flow catches up when the user comes back.
  const engineFile = useHeldWhile(active, validFile ? flow.file : null)
  const fileKey = useHeldWhile(active, flow.fileKey)
  const run = useEngineRun(engineFile, attempt)
  const rec = run.status === "done" ? run.rec : null
  const failure = run.status === "failed" ? run.failure : null
  const chat = useAnswers(rec)
  const check = useCheck(rec, chat)
  const firstBook = useFirstBook()
  const assistant = useAssistantName()
  const lastRun = create.runs[create.runs.length - 1]
  const values = useScreenValues(rec, chat.derived, flow.pageCount)

  // A new PDF starts again from Reading.
  useEffect(() => {
    setAttempt(0)
    setView(null)
    chat.reset()
    create.reset()
  }, [fileKey])
  useEffect(() => {
    if (flow.rejectedAt) setRejectedAt(flow.rejectedAt)
  }, [flow.rejectedAt])
  useEffect(() => {
    if (validFile) setRejectedAt(0)
  }, [validFile])

  // Check: the bubble first, then the first screen under it.
  useEffect(() => {
    if (!rec) return setRevealed(false)
    const id = window.setTimeout(() => morph(() => setRevealed(true)), REVEAL_MS)
    return () => window.clearTimeout(id)
  }, [rec])

  // The step the flow is at; what's on screen follows it through a morph, so every step change animates.
  // The drop zone shows that the PDF is fine for a moment before the flow moves on (reading has
  // already started underneath).
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!validFile) return setReady(false)
    const id = window.setTimeout(() => setReady(true), READY_MS)
    return () => window.clearTimeout(id)
  }, [validFile, flow.fileKey])
  const atNow: StepId = !validFile || !ready ? "upload" : !rec ? "reading" : lastRun ? "create" : "check"
  const [at, setAt] = useState<StepId>(atNow)
  useEffect(() => {
    if (at !== atNow) morph(() => setAt(atNow))
  }, [atNow])

  // A first run starts with a tour of the page: the assistant, each card, then the drop zone.
  const firstRun = useFirstRun()
  const [tour, setTour] = useState<number | null>(null)
  const toured = useRef(false)
  useEffect(() => {
    if (firstRun && !toured.current && !flow.file) {
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

  const manual = () => {
    if (chat.derived) applySettings(form, chat.derived.effective)
    onManual()
  }
  const onCreate = () => {
    if (!chat.derived || !rec) return
    const left = chat.derived.asked.filter((f) => !(f.id in chat.answers))
    if (left.length) chat.skipRest(left)
    setView(null)
    // The variety found in the book goes with it when the user picked none and the signals agree.
    const variety = form.state.values.editingLanguage.trim() ? null : confirmedVariety(rec)
    if (variety) form.setFieldValue("editingLanguage", variety)
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
  // One page width for every step, so nothing shifts as the flow moves on.
  const column = "max-w-[760px] lg:max-w-[880px]"
  // The top bar lines up with the same column (its width in px, times the page's zoom), or keeps one width.
  const wide = useWide()
  const columnPx = wide ? 880 : 760

  const scroller = useRef<HTMLDivElement>(null)
  const { scale, vh } = usePageScale(scroller)
  return (
    <FinishContext.Provider value={{ onOpen: create.open }}>
      <div className="lc-root gd-root relative flex h-full min-h-0 flex-1 flex-col overflow-clip" data-tone={tone}>
        {/* Its own view-transition layer with no animation (guided.css): step morphs never move or fade the bar. */}
        {/* Above the page (z-40), so the dock can open over it. */}
        <div className="relative z-40 shrink-0" style={{ viewTransitionName: "gd-topbar" }}>
          <FlowTopBar
            title={t`Add Book`}
            contentWidth={columnPx * scale}
          />
        </div>
        <FileDropOverlay overlay={flow.overlay} dropLabel={<Trans>Drop PDF here</Trans>} errorLabel={<Trans>Only PDF files are supported</Trans>} accent="blue" />
        <input ref={flow.inputRef} type="file" accept="application/pdf" className="hidden" onChange={flow.onInputChange} />

        <div ref={scroller} className="relative flex-1 overflow-y-auto overflow-x-hidden">
          {/* One column per step, and the stepper takes the same width, so its ends line up with the
              bubble and the content. On big windows the whole page scales up (zoom) instead of
              floating small in the middle; on short ones the spacing tightens. */}
          <div className="mx-auto flex w-full flex-col px-4 pb-24 pt-6 sm:px-6 sm:pt-8 [@media(max-height:800px)]:pt-4" style={{ zoom: scale, "--gd-vh": `${vh}px` } as CSSProperties}>
            <div className={cn("gd-col mx-auto w-full", column)}>
              <PdfRow flow={flow} locked={creating} />
              <Stepper
                at={at}
                shown={shown}
                failed={!!failure && at === "reading"}
                locked={create.locked}
                complete={lastRun?.status === "done"}
                onGo={(s) => morph(() => setView(s === at ? null : s))}
                checkBars={bars}
              />
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
      {DecisionReport && devMode && (
        <Suspense fallback={null}>
          <DecisionReport rec={rec} chat={chat} file={flow.file ?? null} failure={failure} form={devForm} stage={shown === "check" ? `check:${check.at}` : shown === "create" && lastRun ? `create:${lastRun.status}` : shown} />
        </Suspense>
      )}
    </FinishContext.Provider>
  )
}

/**
 * How much the page scales up on a big window: 1 up to the desktop app's default window
 * (1440x900), then with the window (width and height both), up to 1.5. A desktop window is never
 * smaller than 1280x720, where the page stays at 1 and its spacing tightens instead.
 */
// eslint-disable-next-line lingui/no-unlocalized-strings -- CSS media query
const WIDE = "(min-width: 1024px)"

/** The window is at least Tailwind's \`lg\` wide (where the page column widens). */
function useWide(): boolean {
  return useSyncExternalStore(
    (on) => {
      const mq = window.matchMedia(WIDE)
      mq.addEventListener("change", on)
      return () => mq.removeEventListener("change", on)
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  )
}

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
