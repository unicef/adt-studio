import { useEffect, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowRight, Check, Target } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  AccentButton,
  BookLine,
  BookThumb,
  ExportFormatRows,
  ExportGoButton,
  ExportOptionsPanel,
  ExportSample,
  FormatBadge,
  FormatTile,
  IncludedChips,
  accentStyle,
  useExportBook,
  useFormatMeta,
} from "./ExportParts"
import type { ExportFlow } from "./useExportFlow"

type Step = "format" | "options"

function Stepper({ step, onStep }: { step: Step; onStep: (step: Step) => void }) {
  const { t } = useLingui()
  const steps: { key: Step; label: string }[] = [
    { key: "format", label: t`Format` },
    { key: "options", label: t`What goes in` },
  ]
  const activeIndex = steps.findIndex((candidate) => candidate.key === step)
  return (
    <ol className="flex items-center gap-2" aria-label={t`Steps`}>
      {steps.map((candidate, index) => {
        const done = index < activeIndex
        const active = index === activeIndex
        return (
          <li key={candidate.key} className="flex items-center gap-2">
            {index > 0 && (
              <span
                aria-hidden
                className={cn("h-px w-6 transition-colors duration-300", done || active ? "bg-(--frame)" : "bg-border")}
              />
            )}
            <button
              type="button"
              disabled={!done}
              onClick={() => onStep(candidate.key)}
              aria-current={active ? "step" : undefined}
              className="flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2 text-[12px] transition-colors enabled:hover:bg-muted"
            >
              <span
                className={cn(
                  "grid size-5 place-items-center rounded-full text-[11px] font-semibold transition-colors duration-300",
                  done || active ? "bg-(--frame) text-white" : "bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3" strokeWidth={3} /> : index + 1}
              </span>
              <span className={cn("transition-colors duration-300", active ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {candidate.label}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function FormatDetail({ flow, label }: { flow: ExportFlow; label: string }) {
  const meta = useFormatMeta(flow, flow.format)
  return (
    <aside className="flex min-h-0 flex-col gap-5 border-l bg-[color-mix(in_oklab,var(--accent)_5%,transparent)] p-5 transition-[background-color] duration-300">
      <div key={flow.format} className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none">
        <div className="flex items-center gap-3">
          <FormatTile flow={flow} format={flow.format} size="lg" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[15px] font-semibold">{meta.label}</span>
              <FormatBadge flow={flow} format={flow.format} />
            </span>
            <span className="w-fit rounded-md bg-background/70 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{meta.ext}</span>
          </div>
        </div>
        <p className="line-clamp-3 h-[61px] text-[12.5px] leading-relaxed text-muted-foreground">{meta.description}</p>
        <p className="flex h-5 items-center gap-1.5 text-[12px]">
          <Target className="size-3.5 shrink-0 text-(--accent) transition-colors duration-300" />
          <span className="text-muted-foreground">
            <Trans>Best for</Trans>
          </span>
          <span className="truncate font-medium">{meta.bestFor}</span>
        </p>
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Trans>What goes in</Trans>
        </h3>
        <div className="h-[50px]">
          <IncludedChips flow={flow} label={label} wrap />
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Trans>Sample</Trans>
        </h3>
        <ExportSample flow={flow} className="min-h-0 flex-1" />
      </section>
    </aside>
  )
}

export function ExportStepDialog({
  flow,
  label,
  open,
  onOpenChange,
}: {
  flow: ExportFlow
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useLingui()
  const [step, setStep] = useState<Step>("options")
  useEffect(() => {
    if (open) setStep("options")
  }, [open])
  const book = useExportBook(label)
  const close = () => onOpenChange(false)

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close())}>
      <DialogContent
        style={accentStyle(flow.format)}
        className="flex h-[min(680px,88vh)] w-[94vw] max-w-[1000px] flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl"
      >
        <DialogTitle className="sr-only">{t`Export`}</DialogTitle>
        <DialogDescription className="sr-only">
          <Trans>Choose a format and what goes in, then export.</Trans>
        </DialogDescription>
        <div aria-hidden className="h-[3px] shrink-0 bg-gradient-to-r from-(--frame) to-(--accent) transition-colors duration-300" />

        <div className="flex h-[72px] shrink-0 items-center gap-3 border-b pl-5 pr-16">
          <BookThumb src={book.cover} className="h-12 w-9" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[16px] font-semibold leading-tight">
              <Trans>Export</Trans>
            </span>
            <BookLine label={label} />
          </div>
          <Stepper step={step} onStep={setStep} />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px]">
          <div key={step} className="min-h-0 overflow-y-auto animate-in fade-in duration-200 motion-reduce:animate-none">
            {step === "format" ? (
              <div className="p-3">
                <ExportFormatRows flow={flow} density="detailed" />
              </div>
            ) : (
              <div className="px-6 py-5">
                <ExportOptionsPanel flow={flow} label={label} />
              </div>
            )}
          </div>
          <FormatDetail flow={flow} label={label} />
        </div>

        <div className="flex h-[68px] shrink-0 items-center gap-3 border-t px-5">
          <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
            <Trans>Your choices are kept for the next export.</Trans>
          </span>
          <button
            type="button"
            onClick={step === "format" ? close : () => setStep("format")}
            className="h-9 w-24 rounded-lg text-[13px] font-medium transition-colors hover:bg-muted"
          >
            {step === "format" ? <Trans>Cancel</Trans> : <Trans>Back</Trans>}
          </button>
          {step === "format" ? (
            <AccentButton onClick={() => setStep("options")} className="w-[148px]" icon={null}>
              <Trans>Continue</Trans>
              <ArrowRight className="size-4" />
            </AccentButton>
          ) : (
            <ExportGoButton flow={flow} onDone={close} className="w-[148px]" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
