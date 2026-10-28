import { useRef, type MouseEvent } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ImageOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { entryAt } from "./pageRect"
import { PageHighlight } from "./PageHighlight"
import type { PageImageEntry, PageSize } from "./usePageDetailData"

export function PagePreview({
  src,
  pageNumber,
  size,
  onSize,
  entries,
  hoverId,
  selectedId,
  onHover,
  onSelect,
  className,
}: {
  src: string | null
  pageNumber: number
  size: PageSize | null
  onSize?: (size: PageSize) => void
  entries: PageImageEntry[]
  hoverId: string | null
  selectedId: string | null
  onHover: (imageId: string | null) => void
  onSelect: (imageId: string) => void
  className?: string
}) {
  const { t } = useLingui()
  const frame = useRef<HTMLDivElement>(null)

  const pick = (event: MouseEvent<HTMLDivElement>) => {
    const box = frame.current?.getBoundingClientRect()
    if (!box || !size) return null
    return entryAt(entries, size, ((event.clientX - box.left) / box.width) * 100, ((event.clientY - box.top) / box.height) * 100)
  }

  if (!src)
    return (
      <div className={cn("grid aspect-[3/4] w-full max-w-md place-items-center rounded-xl border bg-muted/50 text-[12.5px] text-muted-foreground", className)}>
        <span className="flex flex-col items-center gap-2">
          <ImageOff className="size-6" />
          <Trans>No image available</Trans>
        </span>
      </div>
    )

  const selected = entries.find((entry) => entry.imageId === selectedId) ?? null
  const hovered = hoverId !== selectedId ? (entries.find((entry) => entry.imageId === hoverId) ?? null) : null

  return (
    <div
      ref={frame}
      className={cn("relative max-h-full max-w-full overflow-hidden rounded-xl border bg-card shadow-sm", entries.length > 0 && "cursor-crosshair", className)}
      style={size ? { width: `min(100cqw, calc(100cqh * ${(size.w / size.h).toFixed(4)}))` } : undefined}
      onMouseMove={(event) => onHover(pick(event)?.imageId ?? null)}
      onMouseLeave={() => onHover(null)}
      onClick={(event) => {
        const entry = pick(event)
        if (entry) onSelect(entry.imageId)
      }}
    >
      <img
        src={src}
        alt={t`Page ${pageNumber}`}
        className={cn("block h-auto w-full", !size && "max-h-full object-contain")}
        onLoad={onSize ? (event) => onSize({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight }) : undefined}
      />
      {size && (
        <>
          <PageHighlight entry={hovered} size={size} tone="hover" />
          <PageHighlight entry={selected} size={size} tone="selected" />
        </>
      )}
    </div>
  )
}
