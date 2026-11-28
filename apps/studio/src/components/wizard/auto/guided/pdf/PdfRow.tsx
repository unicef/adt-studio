import { useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { FileUp, LayoutGrid } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UploadFlow } from "../../../start/upload/useUploadFlow"
import { Cover, MUTED, PdfMeta } from "./parts"
import { PdfPages } from "./PdfPages"

const EASE = "ease-[cubic-bezier(0.32,0.72,0,1)]"
/** A clear secondary button on the page: solid card fill, a firm hairline and dark text; it tints brand blue on hover and presses in. */
const BUTTON =
  "group/btn flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-card px-3 text-[12.5px] font-semibold text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.08)] ring-1 ring-foreground/15 transition-[background-color,box-shadow,color,transform] duration-150 hover:bg-brand-50 hover:text-brand-800 hover:ring-brand-400 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:opacity-60 disabled:shadow-none disabled:hover:bg-card disabled:hover:ring-foreground/15 disabled:active:scale-100 motion-reduce:transition-none max-sm:w-8 max-sm:justify-center max-sm:px-0"
const ICON = "size-3.5 text-brand-700 transition-transform duration-200 motion-reduce:transition-none group-disabled/btn:text-muted-foreground"

/**
 * Opens and closes the row by its height (grid rows 0fr → 1fr) with a fade and a short slide, so
 * the steps and the page below glide instead of jumping. Closed, it can't take focus.
 */
function Reveal({ shown, children }: { shown: boolean; children: ReactNode }) {
  return (
    <div className={cn("grid transition-[grid-template-rows,opacity,margin] duration-500 motion-reduce:transition-none", EASE, shown ? "mb-4 grid-rows-[1fr] opacity-100" : "mb-0 grid-rows-[0fr] opacity-0")} inert={!shown} aria-hidden={!shown || undefined}>
      {/* The clip has 6px of room on every side (padding, cancelled by a negative margin) so the buttons' border and shadow aren't cut. */}
      <div className="-m-1.5 min-h-0 overflow-hidden p-1.5">
        <div className={cn("transition-transform duration-500 motion-reduce:transition-none", EASE, shown ? "translate-y-0" : "-translate-y-2")}>{children}</div>
      </div>
    </div>
  )
}

/**
 * The PDF as a row in the page, above the steps: what the book is (cover, name, pages, size), See
 * pages and Change PDF, always in view (icons on phones). It opens smoothly when a PDF is chosen
 * and its content fades over when the PDF changes. `locked`: the book is being saved, so the PDF
 * can't change.
 */
export function PdfRow({ flow, locked }: { flow: UploadFlow; locked: boolean }) {
  const { t } = useLingui()
  const [pagesOpen, setPagesOpen] = useState(false)
  const file = flow.file
  return (
    <Reveal shown={!!file}>
      {/* A new PDF fades its own content in where the old one was. */}
      <div key={flow.fileKey} className="flex items-center gap-3 animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none">
        {file && (
          <>
            <Cover flow={flow} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold leading-tight">{flow.title}</p>
              <p className={cn("text-[12.5px] tabular-nums", MUTED)}>
                <PdfMeta flow={flow} />
              </p>
            </div>
            {/* A PDF that can't be read has no pages to see. */}
            {!flow.error && (
              <button type="button" onClick={() => setPagesOpen(true)} className={BUTTON}>
                <LayoutGrid className={cn(ICON, "group-hover/btn:scale-110")} />
                <span className="max-sm:sr-only">
                  <Trans>See pages</Trans>
                </span>
              </button>
            )}
            <button type="button" onClick={flow.openPicker} disabled={locked} title={locked ? t`The book is being set up, so its PDF can't change now.` : undefined} className={BUTTON}>
              <FileUp className={cn(ICON, "group-hover/btn:-translate-y-0.5")} />
              <span className="max-sm:sr-only">
                <Trans>Change PDF</Trans>
              </span>
            </button>
          </>
        )}
      </div>
      {file && !flow.error && <PdfPages file={file} title={flow.title} pageCount={flow.pageCount} open={pagesOpen} onClose={() => setPagesOpen(false)} onChange={() => { setPagesOpen(false); flow.openPicker() }} locked={locked} />}
    </Reveal>
  )
}
