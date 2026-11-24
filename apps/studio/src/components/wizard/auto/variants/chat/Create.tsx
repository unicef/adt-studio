import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { AlertTriangle, BookOpen, Check, Loader2, RotateCcw, Sparkles, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { ErrorDetails } from "../../errors/ErrorState"
import { NameField, useCreate } from "../../review/parts"
import { PrimaryButton } from "../../../core/ui"
import { Chip } from "./bubbles"
import type { CreateRun } from "./useCreateRun"

export const NAME_INPUT = "wizard-project-name"

/** The ready step: the setup on one line (`setup`), the wizard's Project Name field (same validation) and the one Create action. */
export function ReadyCard({ setup, onCreate, locked }: { setup: ReactNode; onCreate: () => void; locked: boolean }) {
  const create = useCreate(onCreate)
  return (
    <div inert={locked} className="flex w-full flex-col gap-3 rounded-[22px] bg-card/95 p-4 ring-1 ring-border shadow-[0_18px_44px_-26px_rgba(15,23,42,0.5)] backdrop-blur">
      {setup}
      <div className="h-px bg-border/70" />
      <NameField />
      <div className="flex justify-end">
        <PrimaryButton onClick={create} disabled={locked} icon={<Sparkles className="size-4" />}>
          <Trans>Create the book</Trans>
        </PrimaryButton>
      </div>
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
  const save: StepState = run.status === "failed" ? "failed" : run.status === "saving" ? "doing" : "done"
  const extract: StepState = run.status === "extracting" ? "doing" : run.status === "done" ? (run.warning ? "warning" : "done") : "todo"
  const steps: { key: string; label: ReactNode; state: StepState }[] = [
    { key: "save", label: <Trans>Saving the book and its PDF</Trans>, state: save },
    ...(run.extract && run.status !== "failed" ? [{ key: "extract", label: <Trans>Starting on the first pages</Trans>, state: extract }] : []),
  ]
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

/** The end of the thread: the book is there, open it. */
export function Ready({ run, onOpen }: { run: CreateRun; onOpen: () => void }) {
  return (
    <div className="flex w-full flex-col items-start gap-3 rounded-[22px] bg-gradient-to-br from-emerald-50 via-card to-card p-4 ring-1 ring-emerald-200 shadow-[0_18px_44px_-26px_rgba(16,185,129,0.6)] dark:from-emerald-500/15 dark:ring-emerald-500/30">
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
