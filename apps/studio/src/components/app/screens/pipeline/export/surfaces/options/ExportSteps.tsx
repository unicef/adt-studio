import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { ArrowLeft, ArrowRight, CircleCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { AccentButton, ExportGoButton, useExportBook, useFormatMeta } from "../ExportParts"
import { AccessMeter } from "./AccessMeter"
import { BookMock } from "./BookMock"
import { FeatureTiles } from "./FeatureTiles"
import { FormatGrid } from "./FormatGrid"
import { LanguageList, ResetLanguageOrder } from "./LanguageList"
import { ProjectTiles } from "./ProjectTiles"
import { Receipt } from "./Receipt"
import { ReviewRows } from "./ReviewRows"
import { StepTiles } from "./StepTiles"
import { useExportOptions } from "./useExportOptions"
import { useExportSteps } from "./useExportSteps"
import type { ExportFlow } from "../useExportFlow"

function Question({ title, hint }: { title: ReactNode; hint: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-[20px] font-semibold leading-tight tracking-tight">{title}</h2>
      <p className="text-[12.5px] text-muted-foreground">{hint}</p>
    </div>
  )
}

export function ExportSteps({ flow, label, onClose }: { flow: ExportFlow; label: string; onClose: () => void }) {
  const options = useExportOptions(flow, label)
  const steps = useExportSteps(flow, options)
  const book = useExportBook(label)
  const meta = useFormatMeta(flow, flow.format)
  const busy = flow.watcher.isPreparing
  const failed = flow.watcher.error?.format === flow.format ? flow.watcher.error.message : null

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[380px_minmax(0,1fr)]">
      <aside className="relative flex min-h-0 flex-col gap-5 overflow-hidden bg-[color-mix(in_oklab,var(--accent)_8%,var(--background))] p-6 transition-[background-color] duration-300 dark:bg-[color-mix(in_oklab,var(--accent)_3%,var(--card))]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,color-mix(in_oklab,var(--accent)_22%,transparent),transparent_62%)] transition-[background] duration-300 dark:bg-[radial-gradient(ellipse_70%_45%_at_50%_42%,color-mix(in_oklab,var(--accent)_9%,transparent),transparent_70%)]"
        />
        <div className="relative flex min-w-0 flex-col gap-0.5">
          <span className="text-[11.5px] font-medium text-muted-foreground">
            <Trans>Exporting</Trans>
          </span>
          <span className="line-clamp-2 text-[15px] font-semibold leading-snug">{book.title}</span>
        </div>
        <BookMock format={flow.format} src={book.cover} fileName={book.title} className="relative flex-1" />
        <div className="relative flex h-[188px] shrink-0 flex-col justify-end gap-2.5">
          <p key={flow.format} className="line-clamp-3 text-[12px] leading-relaxed text-muted-foreground animate-in fade-in duration-300 motion-reduce:animate-none">
            <span className="font-medium text-foreground">{meta.bestFor}.</span> {meta.summary}
          </p>
          <Receipt flow={flow} options={options} />
        </div>
      </aside>

      <div className="flex min-h-0 flex-col">
        <div className="flex h-[60px] shrink-0 items-center pl-6 pr-16">
          <span className="text-[16px] font-semibold">
            <Trans>Export</Trans>
          </span>
        </div>
        <div className="shrink-0 px-4">
          <StepTiles steps={steps} />
        </div>
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden border-t">
          <div
            key={steps.step}
            className={cn(
              "flex flex-col gap-5 px-6 py-5 duration-300 ease-out animate-in fade-in motion-reduce:animate-none",
              steps.direction === 1 ? "slide-in-from-right-2" : "slide-in-from-left-2",
            )}
          >
            {steps.step === "format" && (
              <>
                <Question title={<Trans>What do you want to make?</Trans>} hint={<Trans>Pick one. You can change it before you export.</Trans>} />
                <FormatGrid flow={flow} />
              </>
            )}
            {steps.step === "content" && (
              <>
                <Question
                  title={options.isProject ? <Trans>Everything goes in</Trans> : <Trans>Choose what goes in</Trans>}
                  hint={
                    options.isProject ? (
                      <Trans>There's nothing to choose for a backup.</Trans>
                    ) : (
                      <Trans>Turn off what you don't need. Smaller files download faster.</Trans>
                    )
                  }
                />
                {options.isProject ? (
                  <ProjectTiles />
                ) : (
                  <>
                    <FeatureTiles flow={flow} options={options} label={label} />
                    {options.languages.all.length > 1 && (
                      <section className="flex flex-col gap-1.5">
                        <div className="flex h-6 items-center justify-between gap-2">
                          <h3 className="text-[12.5px] font-semibold">
                            <Trans>Languages</Trans>
                          </h3>
                          <ResetLanguageOrder options={options} />
                        </div>
                        <LanguageList options={options} disabled={busy} />
                      </section>
                    )}
                  </>
                )}
              </>
            )}
            {steps.step === "review" && (
              <>
                <Question title={<Trans>Ready to export</Trans>} hint={<Trans>Here's what you'll get.</Trans>} />
                <ReviewRows flow={flow} options={options} goTo={steps.setStep} />
                {options.isProject ? <ProjectTiles /> : <AccessMeter options={options} label={label} onNavigate={onClose} />}
              </>
            )}
          </div>
        </div>
        <div className="flex h-[68px] shrink-0 items-center gap-2 border-t px-5">
          <span className="mr-auto flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
            {failed ? (
              <span className="truncate text-red-700 dark:text-red-300">{failed}</span>
            ) : (
              <>
                <CircleCheck className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="truncate">
                  <Trans>Choices are saved for next time</Trans>
                </span>
              </>
            )}
          </span>
          <button
            type="button"
            onClick={steps.isFirst ? onClose : steps.back}
            className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors hover:bg-muted"
          >
            {steps.isFirst ? (
              <Trans>Cancel</Trans>
            ) : (
              <>
                <ArrowLeft className="size-3.5" />
                <Trans>Back</Trans>
              </>
            )}
          </button>
          {steps.isLast ? (
            <ExportGoButton flow={flow} onDone={onClose} className="w-[184px] animate-in fade-in duration-200 motion-reduce:animate-none" />
          ) : (
            <AccentButton onClick={steps.next} className="w-[184px]" icon={null}>
              <span className="truncate">
                <Trans>Next: {steps.nextStep?.title}</Trans>
              </span>
              <ArrowRight className="size-4 shrink-0" />
            </AccentButton>
          )}
        </div>
      </div>
    </div>
  )
}
