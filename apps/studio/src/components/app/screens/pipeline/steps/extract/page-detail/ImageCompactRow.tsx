import { memo, useEffect, useRef, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { EyeOff, ImageOff, RotateCcw } from "lucide-react"
import { cn, prefersReducedMotion } from "@/lib/utils"
import { extractedImageUrl } from "../useExtractImages"
import { reasonText } from "./imageLabel"
import { imageDetailTooltip } from "./imageDetails"
import type { PageImageEntry } from "./usePageDetailData"

const QUICK_ACTION = cn(
  "grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-[opacity,background-color,color] duration-150 group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-muted hover:text-foreground motion-reduce:transition-none",
  "outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)]",
)

export const ImageCompactRow = memo(function ImageCompactRow({
  label,
  entry,
  cacheKey,
  active,
  selected,
  onHover,
  onSelect,
  onTogglePrune,
}: {
  label: string
  entry: PageImageEntry
  cacheKey: number
  active: boolean
  selected: boolean
  onHover: (imageId: string | null) => void
  onSelect: (imageId: string) => void
  onTogglePrune: (imageId: string) => void
}) {
  const { t, i18n } = useLingui()
  const [failed, setFailed] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (active || selected) ref.current?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" })
  }, [active, selected])
  const summary = entry.isPruned ? reasonText(i18n, entry) : entry.width && entry.height ? `${entry.width} × ${entry.height}` : t`Kept`
  return (
    <div
      ref={ref}
      className={cn(
        "group flex h-8 items-center gap-1 rounded-md pr-1 transition-[background-color,box-shadow] duration-[180ms] ease-out motion-reduce:transition-none",
        selected
          ? "bg-[color-mix(in_srgb,var(--chrome-hex)_14%,transparent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--chrome-hex)_45%,transparent)]"
          : active
            ? "bg-[color-mix(in_srgb,var(--chrome-hex)_8%,transparent)]"
            : "hover:bg-muted/60",
      )}
      onMouseEnter={() => onHover(entry.imageId)}
      onMouseLeave={() => onHover(null)}
    >
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect(entry.imageId)}
        onFocus={() => onHover(entry.imageId)}
        onBlur={() => onHover(null)}
        title={imageDetailTooltip(i18n, entry)}
        className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-md pl-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)]"
      >
        <span
          className={cn(
            "grid h-5 min-w-6 shrink-0 place-items-center rounded px-1 font-mono text-[10.5px] font-semibold tabular-nums transition-colors duration-[180ms] motion-reduce:transition-none",
            active || selected ? "bg-[var(--chrome-hex)] text-white" : "bg-muted text-muted-foreground",
          )}
        >
          {entry.number}
        </span>
        <span className="grid size-6 shrink-0 place-items-center overflow-hidden rounded border bg-muted/40">
          {failed ? (
            <ImageOff className="size-3 text-muted-foreground/50" />
          ) : (
            <img
              src={extractedImageUrl(label, entry.imageId, cacheKey)}
              alt=""
              loading="lazy"
              onError={() => setFailed(true)}
              className={cn("max-h-full max-w-full object-contain", entry.isPruned && "opacity-50 grayscale")}
            />
          )}
        </span>
        <span className={cn("min-w-0 flex-1 truncate text-[12px]", entry.isPruned ? "text-muted-foreground" : "text-foreground")} title={entry.reason}>
          {summary}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onTogglePrune(entry.imageId)}
        aria-label={entry.isPruned ? t`Bring back image ${entry.number}` : t`Filter out image ${entry.number}`}
        title={entry.isPruned ? t`Bring back` : t`Filter out`}
        className={QUICK_ACTION}
      >
        {entry.isPruned ? <RotateCcw className="size-3" /> : <EyeOff className="size-3" />}
      </button>
    </div>
  )
})
