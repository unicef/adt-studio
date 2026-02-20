import { useState, useRef, useCallback, useEffect } from "react"
import { Loader2 } from "lucide-react"

export interface SegmentRegion {
  label: string
  cropLeft: number
  cropTop: number
  cropRight: number
  cropBottom: number
}

interface SegmentPreviewDialogProps {
  imageSrc: string
  imageWidth: number
  imageHeight: number
  regions: SegmentRegion[]
  onApply: (regions: SegmentRegion[]) => Promise<void>
  onClose: () => void
}

const EDGE_SIZE = 8

type DragMode =
  | { type: "move"; startX: number; startY: number; origRegion: SegmentRegion }
  | { type: "resize"; edge: string; startX: number; startY: number; origRegion: SegmentRegion }

export function SegmentPreviewDialog({
  imageSrc,
  imageWidth,
  imageHeight,
  regions: initialRegions,
  onApply,
  onClose,
}: SegmentPreviewDialogProps) {
  const [regions, setRegions] = useState<SegmentRegion[]>(initialRegions)
  const [applying, setApplying] = useState(false)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ mode: DragMode; regionIdx: number } | null>(null)

  // Compute display size: fit image within available space
  useEffect(() => {
    const update = () => {
      const container = containerRef.current
      if (!container) return
      const maxW = container.clientWidth - 48
      const maxH = container.clientHeight - 48
      if (maxW <= 0 || maxH <= 0) return
      const scale = Math.min(maxW / imageWidth, maxH / imageHeight, 1)
      setDisplaySize({ w: imageWidth * scale, h: imageHeight * scale })
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [imageWidth, imageHeight])

  const scale = displaySize ? displaySize.w / imageWidth : 1

  // Convert pixel coords to display coords
  const toDisplay = useCallback(
    (region: SegmentRegion) => ({
      left: region.cropLeft * scale,
      top: region.cropTop * scale,
      width: (region.cropRight - region.cropLeft) * scale,
      height: (region.cropBottom - region.cropTop) * scale,
    }),
    [scale]
  )

  // Determine cursor based on position within a box
  const getEdge = (e: React.MouseEvent, rect: DOMRect): string => {
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const w = rect.width
    const h = rect.height
    const top = y < EDGE_SIZE
    const bottom = y > h - EDGE_SIZE
    const left = x < EDGE_SIZE
    const right = x > w - EDGE_SIZE
    if (top && left) return "nw"
    if (top && right) return "ne"
    if (bottom && left) return "sw"
    if (bottom && right) return "se"
    if (top) return "n"
    if (bottom) return "s"
    if (left) return "w"
    if (right) return "e"
    return "move"
  }

  const getCursor = (edge: string) => {
    const map: Record<string, string> = {
      nw: "nwse-resize",
      se: "nwse-resize",
      ne: "nesw-resize",
      sw: "nesw-resize",
      n: "ns-resize",
      s: "ns-resize",
      e: "ew-resize",
      w: "ew-resize",
      move: "grab",
    }
    return map[edge] ?? "default"
  }

  const handleBoxMouseDown = (e: React.MouseEvent, idx: number) => {
    e.preventDefault()
    e.stopPropagation()
    setSelectedIdx(idx)

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const edge = getEdge(e, rect)
    const region = regions[idx]

    if (edge === "move") {
      dragRef.current = {
        mode: { type: "move", startX: e.clientX, startY: e.clientY, origRegion: { ...region } },
        regionIdx: idx,
      }
    } else {
      dragRef.current = {
        mode: { type: "resize", edge, startX: e.clientX, startY: e.clientY, origRegion: { ...region } },
        regionIdx: idx,
      }
    }
  }

  // Global mouse move/up for drag
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const dx = (e.clientX - drag.mode.startX) / scale
      const dy = (e.clientY - drag.mode.startY) / scale
      const orig = drag.mode.origRegion

      setRegions((prev) => {
        const updated = [...prev]
        let region: SegmentRegion

        if (drag.mode.type === "move") {
          const w = orig.cropRight - orig.cropLeft
          const h = orig.cropBottom - orig.cropTop
          let newLeft = orig.cropLeft + dx
          let newTop = orig.cropTop + dy
          // Clamp to image bounds
          newLeft = Math.max(0, Math.min(imageWidth - w, newLeft))
          newTop = Math.max(0, Math.min(imageHeight - h, newTop))
          region = {
            ...orig,
            cropLeft: Math.round(newLeft),
            cropTop: Math.round(newTop),
            cropRight: Math.round(newLeft + w),
            cropBottom: Math.round(newTop + h),
          }
        } else {
          const edge = drag.mode.edge
          let { cropLeft, cropTop, cropRight, cropBottom } = orig
          if (edge.includes("w")) cropLeft = Math.max(0, Math.min(cropRight - 10, orig.cropLeft + dx))
          if (edge.includes("e")) cropRight = Math.min(imageWidth, Math.max(cropLeft + 10, orig.cropRight + dx))
          if (edge.includes("n")) cropTop = Math.max(0, Math.min(cropBottom - 10, orig.cropTop + dy))
          if (edge.includes("s")) cropBottom = Math.min(imageHeight, Math.max(cropTop + 10, orig.cropBottom + dy))
          region = {
            ...orig,
            cropLeft: Math.round(cropLeft),
            cropTop: Math.round(cropTop),
            cropRight: Math.round(cropRight),
            cropBottom: Math.round(cropBottom),
          }
        }

        updated[drag.regionIdx] = region
        return updated
      })
    }

    const handleMouseUp = () => {
      dragRef.current = null
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [scale, imageWidth, imageHeight])

  const handleApply = async () => {
    setApplying(true)
    try {
      await onApply(regions)
      // Don't setApplying(false) here — onApply closes the dialog (unmounts this component).
      // Calling setState on an unmounting component causes React DOM reconciliation errors.
    } catch {
      // On error the dialog stays open — reset so user can retry
      setApplying(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-background border-b shrink-0">
        <h2 className="text-sm font-medium">
          Segment Preview
          <span className="ml-2 text-xs text-muted-foreground">
            {regions.length} region{regions.length !== 1 ? "s" : ""} detected
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            className="text-xs font-medium rounded px-3 py-1.5 bg-muted hover:bg-accent transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={applying || regions.length === 0}
            className="flex items-center gap-1 text-xs font-medium rounded px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white cursor-pointer transition-colors disabled:opacity-50"
          >
            {applying && <Loader2 className="h-3 w-3 animate-spin" />}
            Apply Segmentation
          </button>
        </div>
      </div>

      {/* Image + bounding boxes */}
      <div ref={containerRef} className="flex-1 flex items-center justify-center overflow-hidden">
        {displaySize && (
          <div
            className="relative select-none"
            style={{ width: displaySize.w, height: displaySize.h }}
            onClick={() => setSelectedIdx(null)}
          >
            <img
              src={imageSrc}
              alt="Segmentation preview"
              className="w-full h-full block"
              draggable={false}
            />
            {regions.map((region, idx) => {
              const d = toDisplay(region)
              const isSelected = idx === selectedIdx
              return (
                <div
                  key={idx}
                  className="absolute"
                  style={{
                    left: d.left,
                    top: d.top,
                    width: d.width,
                    height: d.height,
                    border: `2px solid ${isSelected ? "#ef4444" : "#f87171"}`,
                    backgroundColor: isSelected ? "rgba(239,68,68,0.15)" : "rgba(239,68,68,0.08)",
                    boxSizing: "border-box",
                    cursor: dragRef.current?.regionIdx === idx ? "grabbing" : "grab",
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => handleBoxMouseDown(e, idx)}
                  onMouseMove={(e) => {
                    if (dragRef.current) return
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    const edge = getEdge(e, rect)
                    ;(e.currentTarget as HTMLElement).style.cursor = getCursor(edge)
                  }}
                >
                  {/* Label */}
                  <div
                    className="absolute -top-5 left-0 text-[10px] font-medium px-1.5 py-0.5 rounded-t whitespace-nowrap pointer-events-none"
                    style={{
                      backgroundColor: isSelected ? "#ef4444" : "#f87171",
                      color: "white",
                    }}
                  >
                    {region.label}
                  </div>
                  {/* Resize handles at corners */}
                  {isSelected && (
                    <>
                      <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-red-500 border border-white rounded-sm cursor-nwse-resize" />
                      <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 border border-white rounded-sm cursor-nesw-resize" />
                      <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-red-500 border border-white rounded-sm cursor-nesw-resize" />
                      <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-red-500 border border-white rounded-sm cursor-nwse-resize" />
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Info bar */}
      <div className="bg-background border-t shrink-0 px-4 py-2 flex items-center gap-4 text-[10px] text-muted-foreground">
        <span>Drag to move boxes, drag edges/corners to resize</span>
        {selectedIdx != null && regions[selectedIdx] && (
          <span className="ml-auto font-mono">
            {regions[selectedIdx].label}: ({regions[selectedIdx].cropLeft}, {regions[selectedIdx].cropTop}) → ({regions[selectedIdx].cropRight}, {regions[selectedIdx].cropBottom})
          </span>
        )}
      </div>
    </div>
  )
}
