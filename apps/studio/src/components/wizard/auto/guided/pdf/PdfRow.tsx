import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { FileUp, LayoutGrid } from "lucide-react"
import { cn } from "@/lib/utils"
import { Cover, MUTED, PdfMeta, type PdfProps } from "./parts"
import { PdfPages } from "./PdfPages"

const ROW_BUTTON = "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium ring-1 ring-border transition-[background-color,transform] duration-150 hover:bg-[var(--lc-bubble)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none max-sm:w-8 max-sm:justify-center max-sm:px-0"

/**
 * The PDF as a row in the page, above the steps: cover, name, pages and size, with See pages and
 * Change PDF always in view (icons on phones). Part of the task, not of the window.
 */
export function PdfRow({ flow, locked, className }: Pick<PdfProps, "flow" | "locked"> & { className?: string }) {
  const { t } = useLingui()
  const [pagesOpen, setPagesOpen] = useState(false)
  if (!flow.file) return null
  return (
    <div className={cn("flex items-center gap-3 animate-in fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none", className)}>
      <Cover flow={flow} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold leading-tight">{flow.title}</p>
        <p className={cn("text-[12.5px] tabular-nums", MUTED)}>
          <PdfMeta flow={flow} />
        </p>
      </div>
      <button type="button" onClick={() => setPagesOpen(true)} className={ROW_BUTTON}>
        <LayoutGrid className="size-3.5 text-brand-600" />
        <span className="max-sm:sr-only">
          <Trans>See pages</Trans>
        </span>
      </button>
      <button type="button" onClick={flow.openPicker} disabled={locked} title={locked ? t`The book is being set up, so its PDF can't change now.` : undefined} className={ROW_BUTTON}>
        <FileUp className="size-3.5 text-brand-600" />
        <span className="max-sm:sr-only">
          <Trans>Change PDF</Trans>
        </span>
      </button>
      <PdfPages file={flow.file} title={flow.title} pageCount={flow.pageCount} open={pagesOpen} onClose={() => setPagesOpen(false)} onChange={() => { setPagesOpen(false); flow.openPicker() }} locked={locked} />
    </div>
  )
}
