import { useEffect } from "react"
import { Trans } from "@lingui/react/macro"
import { ArrowUp, Check, FileWarning, Lock, Monitor, Smartphone } from "lucide-react"
import { cn } from "@/lib/utils"
import { DropMessage } from "../../../start/upload/cardParts"
import { UploadChrome } from "../../../start/upload/parts"
import type { UploadFlow } from "../../../start/upload/useUploadFlow"
import { BackButton, DotGrid } from "../../../core/ui"

const GRADIENT = "bg-gradient-to-br from-brand-400 via-brand-600 to-brand-800 bg-clip-text text-transparent"
const HANDOFF_MS = 650

/**
 * The drop, kept fast: a PDF in, a beat of "Got it", then straight to the canvas. Everything else
 * (pages to convert, name, settings) lives on the canvas.
 */
export function DropScreen({ flow }: { flow: UploadFlow }) {
  const ready = flow.accepted && flow.pageCount > 0 && !flow.error
  useEffect(() => {
    if (!ready) return
    const id = window.setTimeout(flow.onContinue, HANDOFF_MS)
    return () => window.clearTimeout(id)
  }, [ready])
  const problem = (flow.rejected && !flow.accepted) || !!flow.error
  return (
    <UploadChrome flow={flow}>
      <DotGrid>
        <div className="absolute left-1/2 top-[42%] h-[420px] w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-300/20 blur-3xl motion-reduce:hidden" />
      </DotGrid>
      <div className="relative flex flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-card/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-700 backdrop-blur">
            <Monitor className="size-3.5" />
            <Smartphone className="size-3.5" />
            <Trans>New book</Trans>
          </span>
          <h1 className="text-[40px] font-bold leading-[1.02] tracking-[-0.04em] sm:text-[64px]">
            <Trans>
              See your book <span className={GRADIENT}>digital</span>
            </Trans>
          </h1>
          <p className="max-w-[560px] text-[15.5px] leading-relaxed text-muted-foreground sm:text-[16.5px]">
            <Trans>Drop a PDF and watch it turn into a book for computers and phones. Nothing is created until you say so.</Trans>
          </p>
        </div>

        <button
          type="button"
          onClick={flow.openPicker}
          className={cn(
            "group relative grid h-[300px] w-full max-w-[680px] place-items-center rounded-[28px] border-2 bg-card/80 p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_44px_-26px_rgba(15,23,42,0.28)] backdrop-blur transition-[border-color,background-color,transform] duration-300 active:scale-[0.995]",
            flow.accepted ? "border-solid border-brand-300 bg-brand-50/60" : problem ? "border-dashed border-destructive/40 hover:border-destructive/60" : "border-dashed border-brand-200 hover:border-brand-400",
          )}
        >
          <span className="flex flex-col items-center gap-6">
            <span aria-hidden className="grid h-[92px] w-[150px] place-items-center">
              {flow.accepted ? (
                <span key="ok" className="relative grid size-[72px] place-items-center">
                  <span className="absolute inset-0 rounded-full bg-brand-500/40 animate-[am-pulse-once_0.9s_ease-out_both] motion-reduce:hidden" />
                  <span className="grid size-[72px] place-items-center rounded-full bg-brand-600 text-primary-foreground shadow-[0_12px_30px_rgba(43,127,255,0.5)] animate-[am-check-pop_0.45s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none">
                    <Check className="size-9 stroke-[3]" />
                  </span>
                </span>
              ) : problem ? (
                <span key="problem" className="grid size-[72px] place-items-center rounded-full bg-destructive/10 text-destructive animate-[am-check-pop_0.45s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none">
                  {flow.error === "password" ? <Lock className="size-8" /> : <FileWarning className="size-8" />}
                </span>
              ) : (
                <span key="idle" className="relative h-[92px] w-[150px]">
                  <span className="absolute left-0 top-4 h-[64px] w-[92px] -rotate-6 rounded-lg border-2 border-slate-300 bg-card shadow-md transition-transform duration-500 group-hover:-translate-x-2 group-hover:-rotate-12 dark:border-slate-600">
                    <span className="absolute inset-x-0 top-0 h-2.5 rounded-t-md bg-slate-200 dark:bg-slate-700" />
                  </span>
                  <span className="absolute right-1 top-3 h-[72px] w-[38px] rotate-6 rounded-[10px] border-[3px] border-slate-700 bg-card shadow-md transition-transform duration-500 group-hover:translate-x-2 group-hover:rotate-12" />
                  <span className="absolute left-1/2 top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-brand-600 text-primary-foreground shadow-[0_6px_16px_rgba(43,127,255,0.5)] transition-transform duration-500 group-hover:-translate-y-[60%]">
                    <ArrowUp className="size-5" />
                  </span>
                </span>
              )}
            </span>
            <span className="grid min-h-[60px] place-items-center">
              <DropMessage
                flow={flow}
                idle={
                  <span className="flex flex-col items-center gap-1.5">
                    <span className="text-[19px] font-semibold tracking-[-0.01em]">
                      <Trans>Drop your PDF here</Trans>
                    </span>
                    <span className="text-[13.5px] text-muted-foreground">
                      <Trans>
                        or <span className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4">browse your files</span>
                      </Trans>
                    </span>
                  </span>
                }
              />
            </span>
          </span>
        </button>

        <BackButton onClick={flow.onBack} />
      </div>
    </UploadChrome>
  )
}
