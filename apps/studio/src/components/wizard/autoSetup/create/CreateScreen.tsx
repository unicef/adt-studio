import { useEffect, useRef, useState, type ReactNode } from "react"
import { useStore } from "@tanstack/react-form"
import { useQueryClient } from "@tanstack/react-query"
import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, Check, Loader2, RotateCcw, X } from "lucide-react"
import { classifyCreateError, useBookCreation, type CreateFailureKind } from "@/components/wizard/shared/useBookCreation"
import { useWizardForm } from "@/components/wizard/wizardForm"
import { cn } from "@/lib/utils"
import { CoverBox, useBookFacts } from "../review/parts"
import { ErrorDetails, SecondaryButton } from "../errors/ErrorState"
import "../upload/upload.css"
import { ENTER, PrimaryButton, ScreenShell } from "../ui"

type StepState = "todo" | "doing" | "done" | "failed" | "warning"
type Outcome = { status: "creating" } | { status: "done"; label: string; warning?: string } | { status: "failed"; kind: CreateFailureKind; detail: string }

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
 * The last step: creates the book (its settings and PDF in one request), starts processing its
 * first pages, then offers "Open the book". Processing is skipped for a split book or without an AI
 * provider, as in the step-by-step wizard. If creating fails nothing is saved and the settings are
 * kept (Try again / Back to review); a name taken meanwhile leads back to rename it; if only the
 * processing failed to start, the book is saved and can still be opened.
 */
export function CreateScreen({ onBack }: { onBack: () => void }) {
  const { t } = useLingui()
  const form = useWizardForm()
  const values = useStore(form.store, (s) => s.values)
  const queryClient = useQueryClient()
  const { createBook, willExtract, startExtract, openBook } = useBookCreation()
  const [run, setRun] = useState(0)
  const [saved, setSaved] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>({ status: "creating" })
  const started = useRef(-1)
  const facts = useBookFacts()
  const title = facts.title || t`your book`
  const extract = willExtract(values)

  useEffect(() => {
    if (started.current === run) return
    started.current = run
    setSaved(false)
    setOutcome({ status: "creating" })
    void (async () => {
      let label: string
      try {
        label = (await createBook(form.state.values)).label
      } catch (error) {
        const failure = classifyCreateError(error)
        if (failure.kind === "taken") void queryClient.invalidateQueries({ queryKey: ["books"] })
        setOutcome({ status: "failed", ...failure })
        return
      }
      setSaved(true)
      if (!extract) return setOutcome({ status: "done", label })
      try {
        await startExtract(label)
        setOutcome({ status: "done", label })
      } catch (error) {
        setOutcome({ status: "done", label, warning: error instanceof Error ? error.message : String(error) })
      }
    })()
  }, [run])

  const steps: { key: string; label: ReactNode; state: StepState }[] = [
    { key: "save", label: <Trans>Saving the book and its PDF</Trans>, state: saved ? "done" : outcome.status === "failed" ? "failed" : "doing" },
    ...(extract
      ? [{ key: "extract", label: <Trans>Starting on the first pages</Trans>, state: (outcome.status === "done" ? (outcome.warning ? "warning" : "done") : saved ? "doing" : "todo") as StepState }]
      : []),
  ]
  const done = outcome.status === "done"
  const failed = outcome.status === "failed"
  const warned = done && !!outcome.warning
  const headline = failed ? outcome.kind : done ? (warned ? "warned" : "done") : "creating"
  const detail = failed ? outcome.detail : warned ? outcome.warning : undefined

  return (
    <ScreenShell
      backdrop={
        <div className={cn("absolute left-1/2 top-[40%] h-[420px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl transition-colors duration-700 motion-reduce:hidden", failed ? "bg-muted/60" : done ? (warned ? "bg-amber-300/20" : "bg-emerald-300/20") : "bg-brand-300/20")} />
      }
      overlay={
        <span role="status" className="sr-only">
          {failed ? <Trans>The book couldn&apos;t be created.</Trans> : done ? <Trans>Your book is ready to open.</Trans> : <Trans>Creating your book…</Trans>}
        </span>
      }
    >
      <div className="m-auto flex w-full max-w-[640px] flex-col items-center gap-8 py-10 text-center">
        <div className={cn("transition-[filter] duration-500", failed && "grayscale", ENTER)}>
          <CoverBox src={facts.cover} title={title} size={210} />
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
            body={extract ? <Trans>Your settings are saved and the first pages are on their way.</Trans> : <Trans>Your book and its settings are saved.</Trans>}
          />
          <Headline shown={headline === "warned"} title={<Trans>{title} is saved</Trans>} body={<Trans>Processing didn&apos;t start, so no pages are converted yet. You can start it from the book page.</Trans>} />
          <Headline shown={headline === "failed"} title={<Trans>We couldn&apos;t create {title}</Trans>} body={<Trans>Nothing was saved and your settings are kept. Try again, or go back to the review.</Trans>} />
          <Headline shown={headline === "taken"} title={<Trans>That name is already taken</Trans>} body={<Trans>Another book called {values.label} was created while you were setting this one up. Choose a new name and create it again.</Trans>} />
        </div>

        <ul className={cn("flex w-full max-w-[420px] flex-col gap-2 rounded-[22px] border bg-card/90 p-3 text-left backdrop-blur", ENTER)} style={{ animationDelay: "160ms" }}>
          {steps.map((step) => (
            <li key={step.key} className="flex items-center gap-3 rounded-2xl px-3 py-2">
              <StepIcon state={step.state} />
              <span className={cn("text-[14.5px] font-medium transition-colors duration-300", step.state === "todo" ? "text-muted-foreground/60" : step.state === "failed" ? "text-destructive" : "text-foreground")}>{step.label}</span>
            </li>
          ))}
        </ul>

        <div className="grid w-full place-items-center">
          <OpenBook
            shown={done}
            onOpen={() => done && openBook(outcome.label, form.state.values)}
            note={warned ? <Trans>Start processing from the book page whenever you&apos;re ready.</Trans> : extract ? <Trans>The rest of the pages keep converting in the background.</Trans> : <Trans>Start processing from the book page whenever you&apos;re ready.</Trans>}
          />
          <div inert={!failed} className={cn("col-start-1 row-start-1 flex items-center gap-3 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]", failed ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0")} aria-hidden={!failed}>
            {headline === "taken" ? (
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
        <div className="-mt-4 min-h-8 w-full">{detail && <ErrorDetails detail={detail} className="mx-auto" />}</div>
      </div>
    </ScreenShell>
  )
}
