import { useEffect, useRef, useState, type ReactNode } from "react"
import { Plural, Trans } from "@lingui/react/macro"
import { AlertTriangle, BookOpen, Check, ChevronDown, Loader2, RotateCcw, Sparkles, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { ErrorDetails } from "../../errors/ErrorState"
import { NameField, useCreate } from "../../review/parts"
import { PrimaryButton } from "../../../core/ui"
import { HeightMorph, ReadyViewContext } from "../livechat/ideas/expand/HeightMorph"
import { morphName } from "../livechat/ideas/expand/morph"
import { BookGather, Sparkle } from "../livechat/ideas/finish/Celebrate"
import { useFinish } from "../livechat/ideas/finish/context"
import { RingCreate } from "../livechat/ideas/finish/RingCreate"
import { Chip } from "./bubbles"
import { useIdea } from "./ideas"
import { useLiving } from "./look"
import type { CreateRun } from "./useCreateRun"

export const NAME_INPUT = "wizard-project-name"

/** The ready step: the setup on one line (`setup`), the wizard's Project Name field (same validation) and the one Create action. */
export function ReadyCard({ setup, onCreate, locked }: { setup: ReactNode; onCreate: () => void; locked: boolean }) {
  const create = useCreate(onCreate)
  const living = useLiving()
  const expand = useIdea("expand")
  const [view, setView] = useState<"main" | "change">("main")
  const box = "flex w-full flex-col gap-3 rounded-[22px] bg-card/95 p-4 ring-1 ring-border shadow-[0_18px_44px_-26px_rgba(15,23,42,0.5)] backdrop-blur"
  const rest = (
    <>
      <div className="h-px bg-border/70" />
      <NameField />
      <div className="flex justify-end">
        <PrimaryButton onClick={create} disabled={locked} icon={<Sparkles className="size-4" />}>
          <Trans>Create the book</Trans>
        </PrimaryButton>
      </div>
    </>
  )
  // b10: one card, two pages (the setup with name and Create, or the settings to change); only its height eases between them.
  if (living && expand === "b10")
    return (
      <ReadyViewContext.Provider value={{ view, setView }}>
        <HeightMorph className={cn(box, "block gap-0 p-0")}>
          <div inert={locked} className="flex flex-col gap-3 p-4">
            {setup}
            {view === "main" && (
              <div key="main" className="ix-swap flex flex-col gap-3">
                {rest}
              </div>
            )}
          </div>
        </HeightMorph>
      </ReadyViewContext.Provider>
    )
  return (
    <div inert={locked} className={box} style={living && expand === "b6" ? morphName("ix-ready") : undefined}>
      {setup}
      {rest}
    </div>
  )
}

type StepState = "todo" | "doing" | "done" | "failed" | "warning"

function StepDot({ state }: { state: StepState }) {
  return (
    <span className={cn("grid size-5 shrink-0 place-items-center rounded-full transition-colors duration-300", state === "done" ? "bg-emerald-500 text-white" : state === "failed" ? "bg-destructive text-white" : state === "warning" ? "bg-amber-500 text-white" : "bg-muted")}>
      {state === "doing" && <Loader2 className="size-3 animate-spin text-brand-600 motion-reduce:animate-none" />}
      {state === "done" && <Check className="size-3 stroke-[3]" />}
      {state === "failed" && <X className="size-3 stroke-[3]" />}
      {state === "warning" && <AlertTriangle className="size-2.5 stroke-[2.5]" />}
    </span>
  )
}

/** What creating is doing right now, step by step: only the steps that really run. */
export function CreateSteps({ run }: { run: CreateRun }) {
  const living = useLiving()
  const finish = useIdea("finish")
  if (living && finish === "f26" && run.status !== "failed") return <RingCreate run={run} />
  if (living && finish === "f29" && run.status !== "failed") return <StepsFold run={run} />
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

/**
 * f29 · Steps fold into "Done in N steps": the checklist folds away the moment it finishes and the
 * one "Open the book" takes its place; the steps are a tap away.
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
  return (
    <div className="flex flex-col items-start">
      {done && (
        <button type="button" aria-expanded={listOpen} onClick={() => setListOpen((o) => !o)} className="fx-fade-in -ml-1 inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-2.5 font-semibold transition-colors hover:bg-muted">
          <StepDot state={run.warning ? "warning" : "done"} />
          <Plural value={steps.length} one="Done in # step" other="Done in # steps" />
          <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none", listOpen && "rotate-180")} />
        </button>
      )}
      <div className="fx-fold w-full" data-open={!done || listOpen} inert={done && !listOpen}>
        <div>
          <div className={done ? "pl-1 pt-2" : ""}>
            <StepList run={run} />
          </div>
        </div>
      </div>
      {done && (
        <div ref={end} className="fx-fade-in mt-3 flex flex-col items-start gap-2" style={{ animationDelay: "0.25s" }}>
          {run.warning && <ErrorDetails detail={run.warning} className="items-start [&>button]:-ml-2" />}
          <PrimaryButton onClick={() => run.label && finish?.onOpen(run.label)} icon={<BookOpen className="size-4" />} className="h-12 px-7 text-[15px]">
            <Trans>Open the book</Trans>
          </PrimaryButton>
        </div>
      )}
    </div>
  )
}

/** The end of the thread: the book is there, open it. */
export function Ready({ run, onOpen }: { run: CreateRun; onOpen: () => void }) {
  const living = useLiving()
  const finish = useIdea("finish")
  if (living && finish === "f27") return <ReadyWith run={run} onOpen={onOpen} art={<BookGather name={run.name} />} late />
  if (living && finish === "f28" && !run.warning) return <ReadyWith run={run} onOpen={onOpen} art={<Sparkle />} />
  return <ReadyText run={run} onOpen={onOpen} />
}

/** f27 / f28: the ready card with its small celebration at the side (`late`: the words wait for it). */
function ReadyWith({ run, onOpen, art, late }: { run: CreateRun; onOpen: () => void; art: ReactNode; late?: boolean }) {
  return (
    <div className="flex w-full items-center gap-5 rounded-[22px] bg-gradient-to-br from-emerald-50 via-card to-card p-4 pl-5 ring-1 ring-emerald-200 shadow-[0_18px_44px_-26px_rgba(16,185,129,0.6)] dark:from-emerald-500/15 dark:ring-emerald-500/30">
      {art}
      <div className={cn("min-w-0 flex-1", late && "fx-after-book")}>
        <ReadyText run={run} onOpen={onOpen} bare />
      </div>
    </div>
  )
}

function ReadyText({ run, onOpen, bare }: { run: CreateRun; onOpen: () => void; bare?: boolean }) {
  return (
    <div className={cn("flex w-full flex-col items-start gap-3", !bare && "rounded-[22px] bg-gradient-to-br from-emerald-50 via-card to-card p-4 ring-1 ring-emerald-200 shadow-[0_18px_44px_-26px_rgba(16,185,129,0.6)] dark:from-emerald-500/15 dark:ring-emerald-500/30")}>
      <p className="text-[22px] font-bold leading-tight tracking-[-0.02em]">
        <Trans>
          {run.name} is <span className="bg-gradient-to-br from-emerald-400 to-emerald-700 bg-clip-text text-transparent dark:from-emerald-300 dark:to-emerald-500">ready</span>
        </Trans>
      </p>
      <p className="text-[14px] text-muted-foreground">
        {run.warning ? (
          <Trans>Processing didn&apos;t start, so no pages are converted yet. You can start it from the book page.</Trans>
        ) : run.extract ? (
          <Trans>The first pages are on their way; the rest keep converting in the background.</Trans>
        ) : (
          <Trans>Your book and its settings are saved. Start processing from the book page whenever you&apos;re ready.</Trans>
        )}
      </p>
      {run.warning && <ErrorDetails detail={run.warning} className="items-start [&>button]:-ml-2" />}
      <PrimaryButton onClick={onOpen} icon={<BookOpen className="size-4" />} className="h-12 px-7 text-[15px]">
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
