import { memo, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { ImageOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { extractedImageUrl } from "../useExtractImages"
import { reasonText } from "./imageLabel"
import type { PageImageEntry } from "./usePageDetailData"

export const ImageThumb = memo(function ImageThumb({
  label,
  entry,
  cacheKey,
  active,
  selected,
  onHover,
  onSelect,
  className,
}: {
  label: string
  entry: PageImageEntry
  cacheKey: number
  active: boolean
  selected: boolean
  onHover: (imageId: string | null) => void
  onSelect: (imageId: string) => void
  className?: string
}) {
  const { t, i18n } = useLingui()
  const [failed, setFailed] = useState(false)
  const description = entry.isPruned ? t`Image ${entry.number}, filtered out: ${reasonText(i18n, entry)}` : t`Image ${entry.number}, kept`
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={description}
      title={description}
      onClick={() => onSelect(entry.imageId)}
      onMouseEnter={() => onHover(entry.imageId)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(entry.imageId)}
      onBlur={() => onHover(null)}
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted/40 p-1.5 transition-[border-color,box-shadow,opacity,background-color] duration-[180ms] ease-out motion-reduce:transition-none",
        "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_55%,transparent)] focus-visible:ring-offset-1 focus-visible:ring-offset-card",
        active || selected
          ? "border-[var(--chrome-hex)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--chrome-hex)_20%,transparent)]"
          : "hover:border-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)]",
        className,
      )}
    >
      {failed ? (
        <ImageOff className="size-4 text-muted-foreground/50" />
      ) : (
        <img
          src={extractedImageUrl(label, entry.imageId, cacheKey)}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className={cn("max-h-full max-w-full object-contain", entry.isPruned && "opacity-50 grayscale")}
        />
      )}
      <span
        className={cn(
          "absolute top-1 left-1 grid h-4 min-w-4 place-items-center rounded px-1 font-mono text-[10px] font-semibold tabular-nums transition-colors duration-200 motion-reduce:transition-none",
          active || selected ? "bg-[var(--chrome-hex)] text-white" : entry.isPruned ? "bg-foreground/55 text-background" : "bg-card/90 text-foreground shadow-sm",
        )}
      >
        {entry.number}
      </span>
    </button>
  )
})
