import { useEffect, useRef, useState } from "react"
import { Trans } from "@lingui/react/macro"
import { ArrowUp, Check, FileWarning, Lock, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { Book3D } from "../../core/Book3D"
import { BoldActions, BookDetails, DropMessage, Subtitle } from "./cardParts"
import { UploadChrome } from "./parts"
import type { UploadFlow } from "./useUploadFlow"
import { DotGrid } from "../../core/ui"

/**
 * "Convert a PDF" — the first step. One hairline card carries the whole "book picked" moment: it
 * confirms the drop, widens into the book card, the cover flies into its slot and the details stagger
 * in (including how much of the book to convert); Continue lights up last.
 */
const SOFT = "shadow-[0_1px_2px_rgba(15,23,42,0.04),0_18px_44px_-26px_rgba(15,23,42,0.28)]"

export function UploadScreen({ flow }: { flow: UploadFlow }) {
  const card = flow.showCard && !!flow.file
  const [leaving, setLeaving] = useState<UploadFlow | null>(null)
  const previous = useRef(flow)
  useEffect(() => {
    const before = previous.current
    previous.current = flow
    if (card && before.fileKey && flow.fileKey && before.fileKey !== flow.fileKey) setLeaving(before)
  })
  useEffect(() => {
    if (!leaving) return
    const id = window.setTimeout(() => setLeaving(null), 420)
    return () => window.clearTimeout(id)
  }, [leaving])
  return (
    <UploadChrome flow={flow}>
      <DotGrid />

      <div className="relative flex flex-1 flex-col items-center justify-center gap-7 overflow-y-auto px-6 py-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-card/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-700 backdrop-blur">
            <Sparkles className="size-3.5" />
            <Trans>New book</Trans>
          </span>
          <h1 className="text-[68px] font-bold leading-[1.02] tracking-[-0.04em]">
            <Trans>
              Convert a{" "}
              <span className="bg-gradient-to-br from-brand-400 via-brand-600 to-brand-800 bg-clip-text text-transparent">PDF</span>
            </Trans>
          </h1>
          <Subtitle flow={flow} className="text-[16.5px] leading-relaxed text-muted-foreground" />
        </div>

        <div
          className={cn(
            "relative min-h-[350px] w-[740px] overflow-hidden rounded-[24px] border bg-card transition-[border-color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            SOFT,
            flow.accepted && !card ? "border-brand-300" : "border-border",
          )}
        >
          <button
            type="button"
            onClick={flow.openPicker}
            tabIndex={card ? -1 : 0}
            className={cn(
              "group absolute inset-0 p-3 text-left transition-[opacity,transform,filter] ease-out",
              card ? "pointer-events-none scale-[0.97] opacity-0 blur-[3px] duration-150" : "opacity-100 duration-300",
            )}
          >
            <span
              className={cn(
                "flex size-full flex-col items-center justify-center gap-6 rounded-[22px] border-2 transition-colors duration-300",
                flow.accepted ? "border-solid border-brand-300 bg-brand-50/60" : (flow.rejected && !flow.showCard) || flow.error ? "border-dashed border-destructive/40 bg-destructive/[0.03] group-hover:border-destructive/60" : "border-dashed border-brand-200 group-hover:border-brand-400",
              )}
            >
              <span aria-hidden className="grid h-[92px] w-[120px] place-items-center">
                {flow.accepted ? (
                  <span key="check" className="relative grid size-[72px] place-items-center">
                    <span className="absolute inset-0 rounded-full bg-brand-500/40 animate-[am-pulse-once_0.9s_ease-out_both] motion-reduce:hidden" />
                    <span className="grid size-[72px] place-items-center rounded-full bg-brand-600 text-primary-foreground shadow-[0_12px_30px_rgba(43,127,255,0.5)] animate-[am-check-pop_0.45s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none">
                      <Check className="size-9 stroke-[3]" />
                    </span>
                  </span>
                ) : (flow.rejected && !flow.showCard) || flow.error ? (
                  <span key={`problem-${flow.rejected && !flow.showCard ? `rejected-${flow.rejectedAt}` : flow.error}`} className="grid size-[72px] place-items-center rounded-full bg-destructive/10 text-destructive animate-[am-check-pop_0.45s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none">
                    {flow.error === "password" && !(flow.rejected && !flow.showCard) ? <Lock className="size-8" /> : <FileWarning className="size-8" />}
                  </span>
                ) : (
                  (
                    <span key="drop" className="relative h-[92px] w-[120px]">
                      <span className="absolute left-1 top-3 h-[78px] w-[60px] -rotate-12 rounded-lg border border-brand-100 bg-card shadow-md transition-transform duration-500 group-hover:-translate-x-2 group-hover:-rotate-[18deg]" />
                      <span className="absolute right-1 top-3 h-[78px] w-[60px] rotate-12 rounded-lg border border-brand-100 bg-card shadow-md transition-transform duration-500 group-hover:translate-x-2 group-hover:rotate-[18deg]" />
                      <span className="absolute left-1/2 top-0 grid h-[84px] w-[64px] -translate-x-1/2 place-items-center rounded-lg bg-card shadow-lg ring-1 ring-brand-100 transition-transform duration-500 group-hover:-translate-y-2">
                        <span className="grid size-9 place-items-center rounded-full bg-brand-600 text-primary-foreground shadow-[0_6px_16px_rgba(43,127,255,0.5)]">
                          <ArrowUp className="size-5" />
                        </span>
                      </span>
                    </span>
                  )
                )}
              </span>
              <span className="grid h-[60px] place-items-center">
                {flow.accepted ? (
                  <span key="got" className="flex flex-col items-center gap-1 text-center animate-[am-fade-up_0.35s_ease-out_120ms_both] motion-reduce:animate-none">
                    <span className="text-[19px] font-semibold tracking-[-0.01em] text-brand-700">
                      <Trans>Got it!</Trans>
                    </span>
                    <span className="max-w-[420px] truncate text-[13.5px] text-muted-foreground">{flow.file?.name}</span>
                  </span>
                ) : (
                  <DropMessage
                    key="message"
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
                )}
              </span>
            </span>
          </button>

          {card && (
            <div className="relative flex min-h-[350px] gap-8 p-7">
              <div className="relative grid w-[270px] shrink-0 place-items-center">
                {leaving && (
                  <div aria-hidden className="absolute inset-0 grid place-items-center animate-[am-book-out_0.4s_cubic-bezier(0.4,0,1,1)_both] motion-reduce:hidden">
                    <Book3D src={leaving.cover} />
                  </div>
                )}
                {flow.cover ? (
                  <div key={`${flow.fileKey}:book`} className="relative animate-[am-book-in_0.75s_cubic-bezier(0.22,1,0.36,1)_180ms_both] motion-reduce:animate-none">
                    <Book3D src={flow.cover} alt={flow.title} settle />
                  </div>
                ) : (
                  <div key={`${flow.fileKey}:book-wait`} className="relative animate-[am-fade-up_0.3s_ease-out_350ms_both] motion-reduce:animate-none">
                    <Book3D />
                  </div>
                )}
              </div>
              <div className="relative min-w-0 flex-1">
                {leaving && (
                  <div aria-hidden className="pointer-events-none absolute inset-0 animate-[am-fade-out_0.18s_ease-out_both] motion-reduce:hidden">
                    <BookDetails flow={leaving} className="h-full justify-center" titleClassName="text-[26px]" />
                  </div>
                )}
                <BookDetails key={flow.fileKey} flow={flow} animated delay={flow.replacing ? 200 : 380} className="h-full justify-center" titleClassName="text-[26px]" />
              </div>
            </div>
          )}
        </div>

        <BoldActions flow={flow} />
      </div>

    </UploadChrome>
  )
}
