import { useRef, useState, type MouseEvent } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { ImageOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { entryAt } from "./pageRect"
import { PageHighlight } from "./PageHighlight"
import type { PageImageEntry, PageSize } from "./usePageDetailData"

export function PagePreview({
  src,
  lowSrc,
  pageNumber,
  size,
  entries,
  hoverId,
  selectedId,
  onHover,
  onSelect,
  className,
}: {
  src: string | null
  lowSrc?: string | null
  pageNumber: number
  size: PageSize | null
  entries: PageImageEntry[]
  hoverId: string | null
  selectedId: string | null
  onHover: (imageId: string | null) => void
  onSelect: (imageId: string) => void
  className?: string
}) {
  const { t } = useLingui()
  const frame = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<{ src: string | null; status: "loading" | "loaded" | "failed" }>({ src, status: "loading" })
  const status = state.src === src ? state.status : "loading"

  const pick = (event: MouseEvent<HTMLDivElement>) => {
    const box = frame.current?.getBoundingClientRect()
    if (!box || !size) return null
    return entryAt(entries, size, ((event.clientX - box.left) / box.width) * 100, ((event.clientY - box.top) / box.height) * 100)
  }

  if (!src || status === "failed")
    return (
      <div className={cn("grid size-full place-items-center rounded-md bg-muted/50 text-[12.5px] text-muted-foreground", className)}>
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
      className={cn("relative max-h-full max-w-full overflow-hidden rounded-md shadow-[0_1px_3px_rgba(15,23,42,0.12),0_0_0_1px_rgba(15,23,42,0.06)]", entries.length > 0 && "cursor-crosshair", className)}
      style={size ? { width: `min(100cqw, calc(100cqh * ${(size.w / size.h).toFixed(4)}))` } : undefined}
      onMouseMove={(event) => onHover(pick(event)?.imageId ?? null)}
      onMouseLeave={() => onHover(null)}
      onClick={(event) => {
        const entry = pick(event)
        if (entry) onSelect(entry.imageId)
      }}
    >
      {lowSrc && lowSrc !== src && status !== "loaded" && (
        <img aria-hidden alt="" src={lowSrc} className="absolute inset-0 size-full object-contain" />
      )}
      <img
        src={src}
        alt={t`Page ${pageNumber}`}
        decoding="async"
        style={size ? { aspectRatio: `${size.w} / ${size.h}` } : undefined}
        className={cn(
          "relative block h-auto w-full transition-opacity duration-300 ease-out motion-reduce:transition-none",
          !size && "max-h-full object-contain",
          status === "loaded" || (!lowSrc && !size) ? "opacity-100" : "opacity-0",
        )}
        onLoad={() => setState({ src, status: "loaded" })}
        onError={() => setState({ src, status: "failed" })}
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
