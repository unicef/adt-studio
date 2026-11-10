import { memo } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ArrowUpRight, Check, Loader2, RotateCcw, Undo2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { FilteredThumb } from "./FilteredThumb"
import { reasonLabel } from "./ReasonChip"
import type { FilteredImage } from "./useFilteredImages"

export const ROW_BUTTON = cn(
  "flex h-7 shrink-0 items-center gap-1 rounded-md border bg-card px-2 text-[11.5px] font-semibold text-foreground transition-[background-color,opacity] duration-150 hover:bg-muted disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none",
  "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)]",
)

export const ReviewRow = memo(function ReviewRow({
  label,
  item,
  busy,
  disabled,
  showReason,
  onBringBack,
  onUndo,
  onOpenPage,
}: {
  label: string
  item: FilteredImage
  busy: boolean
  disabled: boolean
  showReason: boolean
  onBringBack: (item: FilteredImage) => void
  onUndo: (item: FilteredImage) => void
  onOpenPage: (pageId: string) => void
}) {
  const { t, i18n } = useLingui()
  const pageElements = item.reason.kind === "page-elements"
  const text = reasonLabel((descriptor) => i18n._(descriptor), item.reason)
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg px-2 py-2 transition-[background-color] duration-200 motion-reduce:transition-none",
        item.restored ? "bg-emerald-500/8 dark:bg-emerald-400/10" : "hover:bg-muted/50",
      )}
    >
      <FilteredThumb label={label} imageId={item.imageId} alt={t`Image ${item.number} on page ${item.pageNumber}`} muted={!item.restored} className="size-14" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <button
          type="button"
          onClick={() => onOpenPage(item.pageId)}
          className="flex w-fit items-center gap-0.5 rounded text-[12px] font-semibold text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)]"
        >
          <Trans>
            Page {item.pageNumber} · image {item.number}
          </Trans>
          <ArrowUpRight className="size-3 text-muted-foreground" aria-hidden />
        </button>
        {item.restored ? (
          <span className="flex items-center gap-1 text-[11.5px] font-medium text-emerald-700 dark:text-emerald-400">
            <Check className="size-3" aria-hidden />
            {pageElements ? <Trans>Kept as an image</Trans> : <Trans>Brought back</Trans>}
          </span>
        ) : (
          <>
            {showReason && <span className={cn("truncate text-[11.5px] font-medium", pageElements ? "text-[var(--chrome-hex)]" : "text-muted-foreground")}>{text}</span>}
            {item.reason.detail && (
              <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground/90 italic" title={item.reason.detail}>
                <Trans>AI: {item.reason.detail}</Trans>
              </span>
            )}
          </>
        )}
      </div>
      {item.restored ? (
        <button type="button" onClick={() => onUndo(item)} disabled={busy || disabled} className={ROW_BUTTON}>
          {busy ? <Loader2 className="size-3 animate-spin motion-reduce:animate-none" /> : <Undo2 className="size-3" />}
          <Trans>Undo</Trans>
        </button>
      ) : (
        <button type="button" onClick={() => onBringBack(item)} disabled={busy || disabled} className={ROW_BUTTON}>
          {busy ? <Loader2 className="size-3 animate-spin motion-reduce:animate-none" /> : <RotateCcw className="size-3" />}
          {pageElements ? <Trans>Keep as image</Trans> : <Trans>Bring back</Trans>}
        </button>
      )}
    </div>
  )
})
