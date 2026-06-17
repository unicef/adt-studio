import { useEffect, useRef, useState } from "react"
import { ImageOff, Loader2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { usePageImage } from "@/hooks/use-pages"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"

/** Zoomable full-page preview opened from a page cover. */
export function PageLightbox({
  bookLabel,
  pageId,
  open,
  onOpenChange,
}: {
  bookLabel: string
  pageId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useLingui()
  const isRequested = open && !!pageId
  const { data, isError, refetch } = usePageImage(bookLabel, pageId ?? "", {
    enabled: isRequested,
  })
  const imageBase64 = data?.imageBase64 ?? null
  const imageState: "idle" | "loading" | "error" | "ready" = !isRequested
    ? "idle"
    : imageBase64
      ? "ready"
      : isError
        ? "error"
        : "loading"

  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  // Reset zoom/pan whenever a new page opens.
  useEffect(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }, [pageId, open])

  const MIN = 1
  const MAX = 6
  const applyScale = (next: number) => {
    const clamped = Math.min(MAX, Math.max(MIN, next))
    setScale(clamped)
    if (clamped === 1) setOffset({ x: 0, y: 0 })
  }
  const reset = () => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  const handleWheel = (e: React.WheelEvent) => {
    applyScale(scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12))
  }
  const handlePointerDown = (e: React.PointerEvent) => {
    if (scale <= 1) return
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
    setDragging(true)
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  }
  const handlePointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current
    if (!d) return
    setOffset({ x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) })
  }
  const endDrag = () => {
    dragRef.current = null
    setDragging(false)
  }

  const btn =
    "flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-white/10"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {pageId && (
        <DialogContent className="flex h-[94vh] w-[96vw] max-w-none flex-col gap-0 border-0 bg-neutral-900/95 p-0 text-white">
          <DialogTitle className="sr-only">{t`Page preview`}</DialogTitle>
          <DialogDescription className="sr-only">
            {t`Full-size source page preview.`}
          </DialogDescription>

          <div className="flex shrink-0 items-center justify-center gap-1.5 px-4 py-2">
            <button
              type="button"
              onClick={() => applyScale(scale / 1.25)}
              disabled={scale <= MIN}
              title={t`Zoom out`}
              className={btn}
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="min-w-14 text-center text-xs tabular-nums text-white">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => applyScale(scale * 1.25)}
              disabled={scale >= MAX}
              title={t`Zoom in`}
              className={btn}
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={reset}
              disabled={scale === 1}
              title={t`Reset zoom`}
              className={btn}
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>

          <div
            className="flex flex-1 items-center justify-center overflow-hidden p-4"
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerLeave={endDrag}
            onDoubleClick={() => (scale === 1 ? applyScale(2) : reset())}
            style={{ cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "default" }}
          >
            {imageState === "ready" && imageBase64 ? (
              <img
                src={`data:image/png;base64,${imageBase64}`}
                alt={t`Page preview`}
                draggable={false}
                className="max-h-full max-w-full select-none object-contain"
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                  transition: dragging ? "none" : "transform 0.12s ease-out",
                }}
              />
            ) : imageState === "error" ? (
              <div className="flex flex-col items-center justify-center gap-2 text-sm text-white/80">
                <ImageOff className="h-5 w-5" />
                <span>{t`Image unavailable`}</span>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="rounded border border-white/30 px-2 py-0.5 text-xs transition-colors hover:bg-white/10"
                >
                  {t`Retry`}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-white/80">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t`Loading image...`}</span>
              </div>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  )
}
