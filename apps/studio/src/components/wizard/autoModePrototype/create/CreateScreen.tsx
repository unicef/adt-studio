import { useEffect, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { LabButton, LabToggle } from "../labControls"
import { CoverBox, useBookFacts } from "../review/parts"
import "../upload/upload.css"
import { ENTER, PrimaryButton, ScreenShell } from "../ui"

type Variant = "checklist" | "book"
const KEY = "am-create-variant"
const read = (): Variant => (window.localStorage.getItem(KEY) === "book" ? "book" : "checklist")
const STEPS_AT = [700, 1500, 2400]
const DONE_AT = 2900

function useCreateRun(run: number) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    setStep(0)
    const ids = [...STEPS_AT, DONE_AT].map((at, i) => window.setTimeout(() => setStep(i + 1), at))
    return () => ids.forEach((id) => window.clearTimeout(id))
  }, [run])
  return { step, done: step > STEPS_AT.length }
}

function OpenBook({ done, onOpen }: { done: boolean; onOpen: () => void }) {
  return (
    <div className={cn("flex flex-col items-center gap-3 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]", done ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0")} aria-hidden={!done}>
      <PrimaryButton onClick={onOpen} disabled={!done} className="h-12 px-7 text-[15px] disabled:opacity-100">
        <Trans>Open the book</Trans>
      </PrimaryButton>
      <p className="text-[13px] text-muted-foreground">
        <Trans>The rest of the pages keep converting in the background.</Trans>
      </p>
    </div>
  )
}

/**
 * Step 7 — the hand-off. A short, simulated "creating" moment (the lab never creates a real book),
 * then "Open the book", where the real app continues on the book page with the pipeline running.
 * Lab toggle "Create": Checklist (what's happening, step by step) · Book (one calm progress line).
 */
export function CreateScreen({ onOpen }: { onOpen: () => void }) {
  const { t } = useLingui()
  const [variant, setVariant] = useState<Variant>(read)
  const [run, setRun] = useState(0)
  const { step, done } = useCreateRun(run)
  const facts = useBookFacts()
  const title = facts.title || t`your book`
  const steps = [<Trans key="s">Saving your settings</Trans>, <Trans key="c">Copying the PDF into the book folder</Trans>, <Trans key="p">Starting on the first pages</Trans>]
  const progress = Math.min(1, step / (STEPS_AT.length + 1))

  return (
    <ScreenShell
      backdrop={
          <div className={cn("absolute left-1/2 top-[40%] h-[420px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl transition-colors duration-700", done ? "bg-emerald-300/20" : "bg-brand-300/20")} />
      }
      overlay={
        <>
          <span role="status" className="sr-only">
            {done ? <Trans>Your book is ready to open.</Trans> : <Trans>Creating your book…</Trans>}
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
          </div>
        </>
      }
    >
      <div key={`${variant}-${run}`} className="m-auto flex w-full max-w-[640px] flex-col items-center gap-8 py-10 text-center">
        <div className={ENTER}>
          <CoverBox src={facts.cover} title={title} size={variant === "book" ? 280 : 210} />
        </div>

        <div className={cn("grid h-[96px] w-full place-items-center", ENTER)} style={{ animationDelay: "80ms" }}>
          <div className="col-start-1 row-start-1 flex flex-col items-center gap-2 transition-[opacity,filter] duration-300" style={{ opacity: done ? 0 : 1, filter: done ? "blur(3px)" : "none" }} aria-hidden={done}>
            <h1 className="text-[38px] font-bold leading-[1.05] tracking-[-0.03em]">
              <Trans>Creating {title}…</Trans>
            </h1>
            <p className="text-[15px] text-muted-foreground">
              <Trans>This only takes a moment.</Trans>
            </p>
          </div>
          <div className="col-start-1 row-start-1 flex flex-col items-center gap-2 transition-[opacity,filter] duration-500" style={{ opacity: done ? 1 : 0, filter: done ? "none" : "blur(3px)" }} aria-hidden={!done}>
            <h1 className="text-[38px] font-bold leading-[1.05] tracking-[-0.03em]">
              <Trans>
                {title} is <span className="bg-gradient-to-br from-emerald-400 to-emerald-700 bg-clip-text text-transparent">ready</span>
              </Trans>
            </h1>
            <p className="text-[15px] text-muted-foreground">
              <Trans>Your settings are saved and the first pages are on their way.</Trans>
            </p>
          </div>
        </div>

        {variant === "checklist" ? (
          <ul className={cn("flex w-full max-w-[420px] flex-col gap-2 rounded-[22px] border bg-card/90 p-3 text-left backdrop-blur", ENTER)} style={{ animationDelay: "160ms" }}>
            {steps.map((label, i) => {
              const state = step > i ? "done" : step === i ? "doing" : "todo"
              return (
                <li key={i} className="flex items-center gap-3 rounded-2xl px-3 py-2">
                  <span className="relative grid size-6 shrink-0 place-items-center">
                    <span className={cn("absolute inset-0 grid place-items-center rounded-full bg-muted transition-[opacity,transform] duration-300", state === "done" ? "scale-50 opacity-0" : "scale-100 opacity-100")}>{state === "doing" && <Loader2 className="size-3.5 animate-spin text-brand-600 motion-reduce:animate-none" />}</span>
                    <span className={cn("absolute inset-0 grid place-items-center rounded-full bg-emerald-500 text-white transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]", state === "done" ? "scale-100 opacity-100" : "scale-50 opacity-0")}>
                      <Check className="size-3.5 stroke-[3]" />
                    </span>
                  </span>
                  <span className={cn("text-[14.5px] font-medium transition-colors duration-300", state === "todo" ? "text-muted-foreground/60" : "text-foreground")}>{label}</span>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className={cn("flex w-full max-w-[420px] flex-col gap-2", ENTER)} style={{ animationDelay: "160ms" }}>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full w-full origin-left rounded-full transition-[transform,background-color] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]", done ? "bg-emerald-500" : "bg-brand-600")} style={{ transform: `scaleX(${Math.max(0.04, progress)})` }} />
            </div>
            <div className="grid h-5 text-[13px] font-medium text-muted-foreground">
              {steps.map((label, i) => (
                <span key={i} className="col-start-1 row-start-1 transition-opacity duration-300" style={{ opacity: step === i ? 1 : 0 }}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}

        <OpenBook done={done} onOpen={onOpen} />
      </div>
    </ScreenShell>
  )
}
