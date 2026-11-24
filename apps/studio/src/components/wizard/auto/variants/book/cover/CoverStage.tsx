import { Trans } from "@lingui/react/macro"
import { ArrowUp, BookOpen, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Book3D } from "../../../../core/Book3D"
import { BackButton, DotGrid, PrimaryButton } from "../../../../core/ui"
import { BookDetails, DropMessage } from "../../../../start/upload/cardParts"
import { UploadChrome } from "../../../../start/upload/parts"
import type { UploadFlow } from "../../../../start/upload/useUploadFlow"
import { TextButton } from "../open/parts"

const GRADIENT = "bg-gradient-to-br from-brand-400 via-brand-600 to-brand-800 bg-clip-text text-transparent"

/** The empty place for a book: a dashed, book-shaped drop target with a spine. */
function DropBook({ flow }: { flow: UploadFlow }) {
  const problem = (flow.rejected && !flow.showCard) || !!flow.error
  return (
    <button
      type="button"
      onClick={flow.openPicker}
      className={cn(
        "group relative flex h-[310px] w-[256px] flex-col items-center justify-center gap-5 rounded-[6px_18px_18px_6px] border-2 bg-card/70 px-5 text-center backdrop-blur transition-[border-color,background-color,transform] duration-300 hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-300/60",
        flow.accepted ? "border-solid border-brand-400 bg-brand-50/70 dark:bg-brand-500/10" : problem ? "border-dashed border-destructive/50" : "border-dashed border-brand-300 hover:border-brand-500",
      )}
    >
      <span aria-hidden className="absolute inset-y-3 left-4 w-px border-l-2 border-dashed border-brand-200" />
      <span aria-hidden className="absolute -bottom-4 left-[8%] h-5 w-[92%] rounded-[50%] bg-slate-900/15 blur-md dark:bg-black/40" />
      <span aria-hidden className="grid size-16 place-items-center">
        {flow.accepted ? (
          <span className="grid size-14 place-items-center rounded-full bg-brand-600 text-white shadow-[0_10px_26px_rgba(43,127,255,0.5)] animate-[am-check-pop_0.45s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none">
            <Check className="size-7 stroke-[3]" />
          </span>
        ) : (
          <span className="grid size-14 place-items-center rounded-full bg-brand-600 text-white shadow-[0_8px_20px_rgba(43,127,255,0.45)] transition-transform duration-300 group-hover:-translate-y-1">
            <ArrowUp className="size-6" />
          </span>
        )}
      </span>
      <span className="grid min-h-[84px] place-items-center pl-2">
        <DropMessage
          flow={flow}
          idle={
            <span className="flex flex-col items-center gap-1.5">
              <span className="text-[17px] font-semibold leading-tight tracking-[-0.01em]">
                <Trans>Drop your PDF here</Trans>
              </span>
              <span className="text-[13px] text-muted-foreground">
                <Trans>
                  or <span className="font-semibold text-brand-700 underline decoration-brand-300 underline-offset-4">browse your files</span>
                </Trans>
              </span>
            </span>
          }
        />
      </span>
    </button>
  )
}

/**
 * The first step of the "Open book" design: drop a PDF and it stands up as the user's own book,
 * with how much of it to convert (the user's choice, never the AI's). "Open the book" starts the
 * reading; "Set it up myself" goes to the step-by-step wizard with the PDF kept.
 */
export function CoverStage({ flow, onOpen, onManual }: { flow: UploadFlow; onOpen: () => void; onManual: () => void }) {
  const card = flow.showCard && !!flow.file
  const ready = card && !flow.replacing && flow.pageCount > 0
  return (
    <UploadChrome flow={flow}>
      <DotGrid>
        <div className="absolute left-1/2 top-[52%] h-[420px] w-[760px] max-w-full -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-300/20 blur-3xl motion-reduce:hidden" />
      </DotGrid>
      <div className="relative flex flex-1 flex-col items-center overflow-y-auto px-4 pt-8 sm:px-6 sm:pb-8">
        <div className="m-auto flex w-full max-w-[860px] flex-col items-center gap-9">
          <div className="flex flex-col items-center gap-3 text-center">
            <h1 className="text-[40px] font-bold leading-[1.02] tracking-[-0.04em] sm:text-[60px]">
              {card ? (
                <Trans>
                  Here&apos;s your <span className={GRADIENT}>book</span>
                </Trans>
              ) : (
                <Trans>
                  Open your <span className={GRADIENT}>book</span>
                </Trans>
              )}
            </h1>
            <p className="max-w-[520px] text-[15.5px] leading-relaxed text-muted-foreground">
              {card ? (
                <Trans>Choose how much of it to convert, then open it. The AI reads it and leaves notes in the margin for you to check.</Trans>
              ) : (
                <Trans>Drop the PDF of your book. We&apos;ll open it, read it, and mark what we find on its own pages.</Trans>
              )}
            </p>
          </div>

          {card ? (
            <div key={flow.fileKey} className="flex w-full flex-col items-center gap-10 sm:flex-row sm:items-center sm:justify-center">
              <div className="grid h-[320px] w-[260px] shrink-0 place-items-center">
                <div className="animate-[am-book-in_0.75s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none">
                  <Book3D src={flow.cover} alt={flow.title} height={300} maxWidth={250} settle />
                </div>
              </div>
              <BookDetails flow={flow} animated delay={250} className="w-full max-w-[400px]" titleClassName="text-[26px]" />
            </div>
          ) : (
            <DropBook flow={flow} />
          )}

          <div className="flex flex-wrap items-center justify-center gap-2 max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:-mx-4 max-sm:w-[calc(100%+32px)] max-sm:border-t max-sm:bg-background/85 max-sm:px-4 max-sm:py-3 max-sm:backdrop-blur">
            <span className="max-sm:hidden">
              <BackButton onClick={flow.onBack} />
            </span>
            {card && (
              <TextButton onClick={onManual}>
                <Trans>Set it up myself</Trans>
              </TextButton>
            )}
            <PrimaryButton onClick={onOpen} disabled={!ready} pulse={ready} icon={<BookOpen className="size-4" />}>
              <Trans>Open the book</Trans>
            </PrimaryButton>
          </div>
        </div>
      </div>
    </UploadChrome>
  )
}
