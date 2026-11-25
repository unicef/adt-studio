import { useEffect, useRef, useState, type ReactNode } from "react"
import { Plural, Trans } from "@lingui/react/macro"
import { AlertTriangle, BookOpen, Check, ChevronDown, Loader2, RotateCcw, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { ErrorDetails } from "../../../errors/ErrorState"
import { PrimaryButton } from "../../../../core/ui"
import { BookGather, Sparkle } from "./ideas/finish/Celebrate"
import { useFinish } from "./ideas/finish/context"
import { RingCreate } from "./ideas/finish/RingCreate"
import { Chip } from "./bubbles"
import { useIdea } from "./ideaGroups"
import type { CreateRun } from "./useCreateRun"

export const NAME_INPUT = "wizard-project-name"

/** The filled button: the board's flat button (no glow), in the app's brand blue. */
export const LC_PRIMARY = "rounded-[12px] shadow-none hover:shadow-none"

type StepState = "todo" | "doing" | "done" | "failed" | "warning"

function StepDot({ state }: { state: StepState }) {
  return (
    <span className={cn("grid size-5 shrink-0 place-items-center rounded-full transition-colors duration-300", state === "done" ? "bg-brand-600 text-primary-foreground" : state === "failed" ? "bg-destructive text-white" : state === "warning" ? "bg-amber-500 text-white" : "bg-muted")}>
      {state === "doing" && <Loader2 className="size-3 animate-spin text-brand-600 motion-reduce:animate-none" />}
      {state === "done" && <Check className="size-3 stroke-[3]" />}
      {state === "failed" && <X className="size-3 stroke-[3]" />}
      {state === "warning" && <AlertTriangle className="size-2.5 stroke-[2.5]" />}
    </span>
  )
}

/** What creating is doing right now, step by step: only the steps that really run. */
export function CreateSteps({ run }: { run: CreateRun }) {
  const finish = useIdea("finish")
  if (finish === "f26" && run.status !== "failed") return <RingCreate run={run} />
  if (finish === "f29" && run.status !== "failed") return <StepsFold run={run} />
  return <StepList run={run} />
}

function useSteps(run: CreateRun) {
  const save: StepState = run.status === "failed" ? "failed" : run.status === "saving" ? "doing" : "done"
  const extract: StepState = run.status === "extracting" ? "doing" : run.status === "done" ? (run.warning ? "warning" : "done") : "todo"
  const steps: { key: string; label: ReactNode; state: StepState }[] = [
    { key: "save", label: <Trans>Saving the book and its PDF</Trans>, state: save },
    ...(run.extract && run.status !== "failed" ? [{ key: "extract", label: <Trans>Starting on the first pages</Trans>, state: extract }] : []),
  ]
  return steps
}

function StepList({ run }: { run: CreateRun }) {
  const steps = useSteps(run)
  return (
    <ul className="flex flex-col gap-1.5">
      {steps.map((s) => (
        <li key={s.key} className="flex items-center gap-2.5">
          <StepDot state={s.state} />
          <span className={cn("text-[14.5px]", s.state === "todo" && "text-muted-foreground")}>{s.label}</span>
        </li>
      ))}
    </ul>
  )
}

/** f29's rows: a bare brand check once a step is done, a thin spinner while it runs, nothing before. */
function FoldMark({ state }: { state: StepState }) {
  if (state === "doing") return <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-brand-600 motion-reduce:animate-none" />
  if (state === "warning") return <AlertTriangle aria-hidden className="size-4 shrink-0 text-amber-500" />
  if (state === "todo") return <span aria-hidden className="size-4 shrink-0" />
  return <Check aria-hidden className="size-4 shrink-0 text-brand-600" strokeWidth={2.5} />
}

/**
 * f29 · Steps fold into "Done in N steps": a quiet checklist (small muted rows, a check as each
 * ends); the moment it finishes the list folds up into one summary row with a chevron at its end,
 * and the one "Open the book" takes the space under it. The steps are a tap away.
 */
function StepsFold({ run }: { run: CreateRun }) {
  const steps = useSteps(run)
  const finish = useFinish()
  const done = run.status === "done"
  const [listOpen, setListOpen] = useState(true)
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!done) return
    setListOpen(false)
    const active = document.activeElement
    if (!active || active === document.body || !active.isConnected) end.current?.querySelector("button")?.focus({ preventScroll: true })
  }, [done])
  const list = (
    <ul className="flex flex-col gap-2 text-[14.5px] text-muted-foreground">
      {steps.map((s) => (
        <li key={s.key} className={cn("flex items-center gap-2.5", s.state === "doing" && "text-foreground")}>
          <FoldMark state={s.state} />
          {s.label}
        </li>
      ))}
    </ul>
  )
  return (
    <div className="flex w-[320px] max-w-full flex-col">
      {done && (
        <button type="button" aria-expanded={listOpen} onClick={() => setListOpen((o) => !o)} className="fx-fade-in -mx-2 flex items-center gap-2.5 rounded-[10px] px-2 py-1 text-left font-medium transition-colors hover:bg-muted">
          <FoldMark state={run.warning ? "warning" : "done"} />
          <Plural value={steps.length} one="Done in # step" other="Done in # steps" />
          <ChevronDown className={cn("ml-auto size-4 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none", listOpen && "rotate-180")} />
        </button>
      )}
      <div className="fx-fold w-full" data-open={!done || listOpen} inert={done && !listOpen}>
        <div>
          <div className={done ? "pt-2" : ""}>{list}</div>
        </div>
      </div>
      {done && (
        <div ref={end} className="fx-fade-in mt-3 flex flex-col items-start gap-2" style={{ animationDelay: "0.25s" }}>
          {run.warning && <ErrorDetails detail={run.warning} className="items-start [&>button]:-ml-2" />}
          <PrimaryButton onClick={() => run.label && finish?.onOpen(run.label)} icon={<BookOpen className="size-4" />} className={cn("h-11 px-6 text-[15px]", LC_PRIMARY)}>
            <Trans>Open the book</Trans>
          </PrimaryButton>
        </div>
      )}
    </div>
  )
}

/** The end of the flow: the book is there, open it. */
export function Ready({ run, onOpen }: { run: CreateRun; onOpen: () => void }) {
  const finish = useIdea("finish")
  if (finish === "f27") return <ReadyWith run={run} onOpen={onOpen} art={<BookGather name={run.name} />} late />
  if (finish === "f28" && !run.warning) return <ReadyWith run={run} onOpen={onOpen} art={<Sparkle />} />
  return <ReadyText run={run} onOpen={onOpen} />
}

/**
 * f27 / f28: the board's finale, centred on the one message surface: the art, then the words as its
 * caption and the one Open button under them (`late`: the words wait for the art to land).
 */
function ReadyWith({ run, onOpen, art, late }: { run: CreateRun; onOpen: () => void; art: ReactNode; late?: boolean }) {
  return (
    <div className="lc-surface flex w-full flex-col items-center gap-4 px-6 pb-6 pt-7 text-center">
      {art}
      <div className={cn("flex min-w-0 max-w-[460px] flex-col items-center", late && "fx-after-book")}>
        <ReadyText run={run} onOpen={onOpen} bare centered />
      </div>
    </div>
  )
}

function ReadyText({ run, onOpen, bare, centered }: { run: CreateRun; onOpen: () => void; bare?: boolean; centered?: boolean }) {
  return (
    <div className={cn("flex w-full flex-col gap-3", centered ? "items-center" : "items-start", !bare && "lc-surface p-5")}>
      <p className="text-[20px] font-semibold leading-tight tracking-[-0.02em]">
        <Trans>
          {run.name} is <span className="text-brand-700">ready</span>
        </Trans>
      </p>
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        {run.warning ? (
          <Trans>Processing didn&apos;t start, so no pages are converted yet. You can start it from the book page.</Trans>
        ) : run.extract ? (
          <Trans>The first pages are on their way; the rest keep converting in the background.</Trans>
        ) : (
          <Trans>Your book and its settings are saved. Start processing from the book page whenever you&apos;re ready.</Trans>
        )}
      </p>
      {run.warning && <ErrorDetails detail={run.warning} className={centered ? "items-center" : "items-start [&>button]:-ml-2"} />}
      <PrimaryButton onClick={onOpen} icon={<BookOpen className="size-4" />} className={cn("h-12 px-7 text-[15px]", LC_PRIMARY, centered && "mt-1")}>
        <Trans>Open the book</Trans>
      </PrimaryButton>
    </div>
  )
}

/** Creating failed: nothing was saved. A taken name goes back to the name; anything else can be tried again. */
export function CreateFailed({ run, current, onRetry, onRename }: { run: CreateRun; current: boolean; onRetry: () => void; onRename: () => void }) {
  const taken = run.failure?.kind === "taken"
  return (
    <div className="flex flex-col gap-2">
      <p>
        {taken ? (
          <Trans>
            <strong className="font-semibold">Another book is already called {run.name}.</strong> <span className="text-muted-foreground">Choose a new name above and create it again.</span>
          </Trans>
        ) : (
          <Trans>
            <strong className="font-semibold">I couldn&apos;t create the book.</strong> <span className="text-muted-foreground">Nothing was saved and your setup is kept.</span>
          </Trans>
        )}
      </p>
      {current && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {taken ? (
            <Chip primary onClick={onRename}>
              <Trans>Choose a new name</Trans>
            </Chip>
          ) : (
            <Chip primary onClick={onRetry} icon={<RotateCcw className="size-4" />}>
              <Trans>Try again</Trans>
            </Chip>
          )}
        </div>
      )}
      {!taken && run.failure && <ErrorDetails detail={run.failure.detail} className="items-start [&>button]:-ml-2" />}
    </div>
  )
}
