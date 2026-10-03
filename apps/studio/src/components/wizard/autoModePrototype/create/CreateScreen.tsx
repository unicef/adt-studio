import { useEffect, useState, type ReactNode } from "react"
import { useStore } from "@tanstack/react-form"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, Check, Loader2, RotateCcw, X } from "lucide-react"
import { useWizardForm } from "@/components/wizard/wizardForm"
import { cn } from "@/lib/utils"
import { LabButton, LabToggle } from "../labControls"
import { CoverBox, useBookFacts } from "../review/parts"
import { ErrorDetails, SecondaryButton } from "../errors/ErrorState"
import "../upload/upload.css"
import { ENTER, PrimaryButton, ScreenShell } from "../ui"

type Variant = "checklist" | "book"
type Result = "ok" | "failed" | "taken" | "nostart"
type StepState = "todo" | "doing" | "done" | "failed" | "warning"

const KEY = "am-create-variant"
const read = (): Variant => (window.localStorage.getItem(KEY) === "book" ? "book" : "checklist")
const STEPS_AT = [700, 1500, 2400]
const DONE_AT = 2900
const FAILS_AT: Partial<Record<Result, number>> = { taken: 0, failed: 1, nostart: 2 }

/* eslint-disable lingui/no-unlocalized-strings -- raw provider and server messages, shown as-is */
const MOCK_DETAIL: Record<Exclude<Result, "ok">, string> = {
  failed: "EACCES: permission denied, mkdir '/Users/me/Library/Application Support/@adt/desktop/books/volcanoes'",
  taken: "409 Conflict · A book with the label \"volcanoes\" already exists.",
  nostart: "Pipeline did not start: no free worker (task queue is full). Start processing from the book page.",
}
/* eslint-enable lingui/no-unlocalized-strings */

/** The simulated create: steps finish one by one; `result` decides whether one of them fails or only warns. */
function useCreateRun(run: number, result: Result) {
  const [step, setStep] = useState(0)
  const failsAt = FAILS_AT[result]
  useEffect(() => {
    setStep(0)
    const stops = failsAt === undefined || result === "nostart" ? [...STEPS_AT, DONE_AT] : STEPS_AT.slice(0, failsAt + 1)
    const ids = stops.map((at, i) => window.setTimeout(() => setStep(i + 1), at))
    return () => ids.forEach((id) => window.clearTimeout(id))
  }, [run, result])
  const stopped = result === "failed" || result === "taken" ? failsAt !== undefined && step > failsAt : false
  const done = step > STEPS_AT.length
  const state = (i: number): StepState => {
    if (failsAt === i && step > i) return result === "nostart" ? "warning" : "failed"
    if (step > i) return "done"
    return step === i && !stopped ? "doing" : "todo"
  }
  return { step, done, stopped, state }
}

function StepIcon({ state }: { state: StepState }) {
  const layer = "absolute inset-0 grid place-items-center rounded-full transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
  const on = (s: StepState) => (state === s ? "scale-100 opacity-100" : "scale-50 opacity-0")
  return (
    <span className="relative grid size-6 shrink-0 place-items-center">
      <span className={cn(layer, "bg-muted", state === "todo" || state === "doing" ? "scale-100 opacity-100" : "scale-50 opacity-0")}>{state === "doing" && <Loader2 className="size-3.5 animate-spin text-brand-600 motion-reduce:animate-none" />}</span>
      <span className={cn(layer, "bg-emerald-500 text-white", on("done"))}>
        <Check className="size-3.5 stroke-[3]" />
      </span>
      <span className={cn(layer, "bg-destructive text-white", on("failed"))}>
        <X className="size-3.5 stroke-[3]" />
      </span>
      <span className={cn(layer, "bg-amber-500 text-white", on("warning"))}>
        <AlertTriangle className="size-3 stroke-[2.5]" />
      </span>
    </span>
  )
}

function OpenBook({ shown, onOpen, note }: { shown: boolean; onOpen: () => void; note: ReactNode }) {
  return (
    <div inert={!shown} className={cn("col-start-1 row-start-1 flex flex-col items-center gap-3 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]", shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0")} aria-hidden={!shown}>
      <PrimaryButton onClick={onOpen} disabled={!shown} className="h-12 px-7 text-[15px] disabled:opacity-100">
        <Trans>Open the book</Trans>
      </PrimaryButton>
      <p className="text-[13px] text-muted-foreground">{note}</p>
    </div>
  )
}

/** One headline layer; the layers share a grid cell so swapping them never moves the page. */
function Headline({ shown, title, body }: { shown: boolean; title: ReactNode; body: ReactNode }) {
  return (
    <div className="col-start-1 row-start-1 flex flex-col items-center gap-2 transition-[opacity,filter] duration-500" style={{ opacity: shown ? 1 : 0, filter: shown ? "none" : "blur(3px)" }} aria-hidden={!shown}>
      <h1 className="text-[38px] font-bold leading-[1.05] tracking-[-0.03em]">{title}</h1>
      <p className="max-w-[560px] text-[15px] text-muted-foreground">{body}</p>
    </div>
  )
}

/**
 * Step 7 — the hand-off. A short, simulated "creating" moment (the lab never creates a real book),
 * then "Open the book", where the real app continues on the book page with the pipeline running.
 * Lab toggles: "Create" Checklist · Book (one calm progress line), and "Result": it works, it fails
 * (nothing is saved, settings are kept), the name was taken meanwhile, or the book is saved but
 * processing didn't start.
 */
export function CreateScreen({ onOpen, onBack }: { onOpen: () => void; onBack: () => void }) {
  const { t } = useLingui()
  const form = useWizardForm()
  const label = useStore(form.store, (s) => s.values.label)
  const [variant, setVariant] = useState<Variant>(read)
  const [result, setResult] = useState<Result>("ok")
  const [run, setRun] = useState(0)
  const { step, done, stopped, state } = useCreateRun(run, result)
  const facts = useBookFacts()
  const title = facts.title || t`your book`
  const steps = [<Trans key="s">Saving your settings</Trans>, <Trans key="c">Copying the PDF into the book folder</Trans>, <Trans key="p">Starting on the first pages</Trans>]
  const progress = Math.min(1, step / (STEPS_AT.length + 1))
  const warned = done && result === "nostart"
  const headline = stopped ? result : done ? (warned ? "warned" : "done") : "creating"

  return (
    <ScreenShell
      backdrop={
        <div className={cn("absolute left-1/2 top-[40%] h-[420px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl transition-colors duration-700 motion-reduce:hidden", stopped ? "bg-muted/60" : done ? (warned ? "bg-amber-300/20" : "bg-emerald-300/20") : "bg-brand-300/20")} />
      }
      overlay={
        <>
          <span role="status" className="sr-only">
            {stopped ? <Trans>The book couldn&apos;t be created.</Trans> : done ? <Trans>Your book is ready to open.</Trans> : <Trans>Creating your book…</Trans>}
          </span>
          <div className="fixed bottom-5 left-5 z-50 flex items-center gap-2">
            <LabButton onClick={() => setRun((r) => r + 1)}>
              <Trans>Replay</Trans>
            </LabButton>
            <LabToggle
              label={<Trans>Create</Trans>}
              value={variant}
              onChange={(v) => {
                window.localStorage.setItem(KEY, v)
                setVariant(v)
                setRun((r) => r + 1)
              }}
              options={[
                { value: "checklist", label: <Trans>Checklist</Trans> },
                { value: "book", label: <Trans>Book</Trans> },
              ]}
            />
            <LabToggle
              label={<Trans>Result</Trans>}
              value={result}
              onChange={(v) => {
                setResult(v)
                setRun((r) => r + 1)
              }}
              options={[
                { value: "ok", label: <Trans>Works</Trans> },
                { value: "failed", label: <Trans>Fails</Trans> },
                { value: "taken", label: <Trans>Name taken</Trans> },
                { value: "nostart", label: <Trans>Not started</Trans> },
              ]}
            />
          </div>
        </>
      }
    >
      <div key={`${variant}-${run}`} className="m-auto flex w-full max-w-[640px] flex-col items-center gap-8 py-10 text-center">
        <div className={cn("transition-[filter] duration-500", stopped && "grayscale", ENTER)}>
          <CoverBox src={facts.cover} title={title} size={variant === "book" ? 280 : 210} />
        </div>

        <div className={cn("grid min-h-[96px] w-full place-items-center", ENTER)} style={{ animationDelay: "80ms" }}>
          <Headline shown={headline === "creating"} title={<Trans>Creating {title}…</Trans>} body={<Trans>This only takes a moment.</Trans>} />
          <Headline
            shown={headline === "done"}
            title={
              <Trans>
                {title} is <span className="bg-gradient-to-br from-emerald-400 to-emerald-700 bg-clip-text text-transparent">ready</span>
              </Trans>
            }
            body={<Trans>Your settings are saved and the first pages are on their way.</Trans>}
          />
          <Headline shown={headline === "warned"} title={<Trans>{title} is saved</Trans>} body={<Trans>Processing didn&apos;t start, so no pages are converted yet. You can start it from the book page.</Trans>} />
          <Headline shown={headline === "failed"} title={<Trans>We couldn&apos;t create {title}</Trans>} body={<Trans>Nothing was saved and your settings are kept. Try again, or go back to the review.</Trans>} />
          <Headline shown={headline === "taken"} title={<Trans>That name is already taken</Trans>} body={<Trans>Another book called {label} was created while you were setting this one up. Choose a new name and create it again.</Trans>} />
        </div>

        {variant === "checklist" ? (
          <ul className={cn("flex w-full max-w-[420px] flex-col gap-2 rounded-[22px] border bg-card/90 p-3 text-left backdrop-blur", ENTER)} style={{ animationDelay: "160ms" }}>
            {steps.map((stepLabel, i) => {
              const s = state(i)
              return (
                <li key={i} className="flex items-center gap-3 rounded-2xl px-3 py-2">
                  <StepIcon state={s} />
                  <span className={cn("text-[14.5px] font-medium transition-colors duration-300", s === "todo" ? "text-muted-foreground/60" : s === "failed" ? "text-destructive" : "text-foreground")}>{stepLabel}</span>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className={cn("flex w-full max-w-[420px] flex-col gap-2", ENTER)} style={{ animationDelay: "160ms" }}>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full w-full origin-left rounded-full transition-[transform,background-color] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]", stopped ? "bg-destructive" : warned ? "bg-amber-500" : done ? "bg-emerald-500" : "bg-brand-600")} style={{ transform: `scaleX(${Math.max(0.04, progress)})` }} />
            </div>
            <div className="grid h-5 text-[13px] font-medium text-muted-foreground">
              {steps.map((stepLabel, i) => (
                <span key={i} className="col-start-1 row-start-1 transition-opacity duration-300" style={{ opacity: Math.min(step, steps.length - 1) === i && !done ? 1 : 0 }}>
                  {stepLabel}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="grid w-full place-items-center">
          <OpenBook
            shown={done}
            onOpen={onOpen}
            note={warned ? <Trans>Start processing from the book page whenever you&apos;re ready.</Trans> : <Trans>The rest of the pages keep converting in the background.</Trans>}
          />
          <div inert={!stopped} className={cn("col-start-1 row-start-1 flex items-center gap-3 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]", stopped ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0")} aria-hidden={!stopped}>
            {result === "taken" ? (
              <PrimaryButton onClick={onBack}>
                <Trans>Choose a new name</Trans>
              </PrimaryButton>
            ) : (
              <>
                <SecondaryButton onClick={onBack}>
                  <Trans>Back to review</Trans>
                </SecondaryButton>
                <PrimaryButton onClick={() => setRun((r) => r + 1)} icon={<RotateCcw className="size-4 transition-transform duration-300 group-hover:-rotate-45" />}>
                  <Trans>Try again</Trans>
                </PrimaryButton>
              </>
            )}
          </div>
        </div>
        <div className="-mt-4 min-h-8 w-full">{(stopped || warned) && result !== "ok" && <ErrorDetails detail={MOCK_DETAIL[result]} className="mx-auto" />}</div>
      </div>
    </ScreenShell>
  )
}
