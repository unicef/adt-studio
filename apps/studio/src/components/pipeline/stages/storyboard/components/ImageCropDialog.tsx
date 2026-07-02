import { useState, useRef, useEffect, useCallback } from "react"
import { Loader2, Lock, Square, RectangleHorizontal, Pentagon } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { NO_DRAG_REGION } from "@/constants"
import { usePlatform } from "@/hooks/use-platform"
import { useWindowControls } from "@/hooks/use-window-controls"
import { MacOSTrafficLightSpacer } from "@/components/title-bar"

interface Point {
  x: number
  y: number
}

interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

interface ImageCropDialogProps {
  /** Image URL to crop */
  imageSrc: string
  /**
   * Optional initial crop rectangle, in the source image's natural-pixel
   * coordinates. Used by recrop-from-page to overlay the selection on the
   * region the image originally came from. Falls back to the full image when
   * absent or degenerate.
   */
  initialRect?: { x: number; y: number; width: number; height: number }
  /** Called with the cropped image blob */
  onApply: (blob: Blob) => Promise<void>
  /** Called when user cancels */
  onClose: () => void
}

const VERTEX_RADIUS = 6
const MIDPOINT_RADIUS = 4
const EDGE_HANDLE = 8
const MIN_POINTS = 3
/** Minimum width/height of a rectangle crop, in image pixels. */
const MIN_RECT = 16

/**
 * Full-page images are rendered at 2× PDF points (~144 DPI); see
 * packages/pdf/src/extract.ts. PDF-point placement bounds (imagesMeta[].bounds)
 * must be scaled by this to map onto the page image's pixels.
 */
export const PAGE_IMAGE_SCALE = 2

/** Convert PDF-point placement bounds to a crop rect in page-image pixels. */
export function pageBoundsToCropRect(bounds: { x: number; y: number; width: number; height: number }) {
  return {
    x: bounds.x * PAGE_IMAGE_SCALE,
    y: bounds.y * PAGE_IMAGE_SCALE,
    width: bounds.width * PAGE_IMAGE_SCALE,
    height: bounds.height * PAGE_IMAGE_SCALE,
  }
}

/**
 * Crop modes:
 * - `rect`: axis-aligned rectangle, resized freely (corners + edges). Default.
 * - `polygon`: free-form polygon — drag/add/remove vertices and edges.
 * - `lock`: rectangle locked to whatever aspect ratio it currently has.
 * - `square`: rectangle locked to 1:1.
 */
type RatioMode = "rect" | "polygon" | "lock" | "square"

interface RectHandleMeta {
  key: string
  /** Position as a fraction of the rect (0 = left/top, 1 = right/bottom). */
  fx: number
  fy: number
  cursor: string
  /** Which edges this handle moves. */
  L: boolean
  T: boolean
  R: boolean
  B: boolean
}

const RECT_HANDLES: RectHandleMeta[] = [
  { key: "tl", fx: 0, fy: 0, cursor: "nwse-resize", L: true, T: true, R: false, B: false },
  { key: "t", fx: 0.5, fy: 0, cursor: "ns-resize", L: false, T: true, R: false, B: false },
  { key: "tr", fx: 1, fy: 0, cursor: "nesw-resize", L: false, T: true, R: true, B: false },
  { key: "r", fx: 1, fy: 0.5, cursor: "ew-resize", L: false, T: false, R: true, B: false },
  { key: "br", fx: 1, fy: 1, cursor: "nwse-resize", L: false, T: false, R: true, B: true },
  { key: "b", fx: 0.5, fy: 1, cursor: "ns-resize", L: false, T: false, R: false, B: true },
  { key: "bl", fx: 0, fy: 1, cursor: "nesw-resize", L: true, T: false, R: false, B: true },
  { key: "l", fx: 0, fy: 0.5, cursor: "ew-resize", L: true, T: false, R: false, B: false },
]

type DragMode =
  | { type: "vertex"; index: number; startX: number; startY: number; origPoints: Point[] }
  | { type: "edge"; index: number; startX: number; startY: number; origPoints: Point[] }
  | { type: "rect"; handle: RectHandleMeta; startX: number; startY: number; origRect: Rect }
  | { type: "move"; startX: number; startY: number; origPoints: Point[] }

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * Full-screen dialog for cropping images. Four modes share a single polygon
 * source of truth: a free rectangle, a free-form polygon, an aspect-locked
 * rectangle, and a 1:1 square.
 *
 * The output is a rectangular PNG cropped to the polygon's bounding box,
 * with transparent pixels outside the polygon.
 */
export function ImageCropDialog({ imageSrc, initialRect, onApply, onClose }: ImageCropDialogProps) {
  const { t } = useLingui()
  const platform = usePlatform()
  const { available: hasWindowControls } = useWindowControls()
  const showMacOSSpacer = hasWindowControls && platform === "macos"
  const [points, setPoints] = useState<Point[]>([])
  const [imageNatural, setImageNatural] = useState<{ w: number; h: number } | null>(null)
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(null)
  const [ratioMode, setRatioMode] = useState<RatioMode>("rect")
  const [aspectRatio, setAspectRatio] = useState<number | null>(null)
  const [applying, setApplying] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragMode | null>(null)
  const imageRef = useRef<HTMLDivElement>(null)
  const loadedImageRef = useRef<HTMLImageElement | null>(null)
  const scaleRef = useRef(1)
  const aspectRef = useRef<number | null>(null)
  aspectRef.current = aspectRatio
  // Read the latest initial rect inside the (image-load) effect without making
  // it a dependency — it's set once when the dialog opens.
  const initialRectRef = useRef(initialRect)
  initialRectRef.current = initialRect

  // Rectangle modes use 8 handles + drag-to-move; polygon mode is free-form.
  const isRect = ratioMode !== "polygon"

  // Load image once with crossOrigin for canvas compatibility
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      loadedImageRef.current = img
      const nat = { w: img.naturalWidth, h: img.naturalHeight }
      setImageNatural(nat)
      // Initialize as a free rectangle. If an initial region was supplied (e.g.
      // recrop-from-page overlaying the image's original placement) start there;
      // otherwise cover the full image.
      const r = initialRectRef.current
      const left = r ? clamp(Math.round(r.x), 0, nat.w) : 0
      const top = r ? clamp(Math.round(r.y), 0, nat.h) : 0
      const right = r ? clamp(Math.round(r.x + r.width), 0, nat.w) : nat.w
      const bottom = r ? clamp(Math.round(r.y + r.height), 0, nat.h) : nat.h
      const valid = right - left >= MIN_RECT && bottom - top >= MIN_RECT
      setPoints(
        bboxToPoints(valid ? { left, top, right, bottom } : { left: 0, top: 0, right: nat.w, bottom: nat.h })
      )
      setRatioMode("rect")
      setAspectRatio(null)
    }
    img.src = imageSrc
  }, [imageSrc])

  // Compute display size to fit image in container
  useEffect(() => {
    if (!imageNatural) return
    const update = () => {
      const container = containerRef.current
      if (!container) return
      const maxW = container.clientWidth - 48
      const maxH = container.clientHeight - 48
      if (maxW <= 0 || maxH <= 0) return
      const s = Math.min(maxW / imageNatural.w, maxH / imageNatural.h, 1)
      setDisplaySize({ w: imageNatural.w * s, h: imageNatural.h * s })
    }
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [imageNatural])

  const scale = displaySize && imageNatural ? displaySize.w / imageNatural.w : 1
  scaleRef.current = scale

  // Compute midpoints between consecutive vertices (for "add point" handles)
  const midpoints = points.length >= MIN_POINTS
    ? points.map((p, i) => {
        const next = points[(i + 1) % points.length]
        return { x: (p.x + next.x) / 2, y: (p.y + next.y) / 2 }
      })
    : []

  // ── Mode switching ──────────────────────────────────────────────────────────

  /**
   * Build an axis-aligned rectangle of the given aspect ratio (w/h), inscribed
   * in the current bounding box, centered, and clamped to image bounds.
   */
  const rectForRatio = useCallback(
    (ratio: number): Point[] => {
      if (!imageNatural) return points
      const iw = imageNatural.w
      const ih = imageNatural.h
      const bbox = getBoundingBox(points)
      const cx = (bbox.left + bbox.right) / 2
      const cy = (bbox.top + bbox.bottom) / 2
      const bw = Math.max(bbox.w, MIN_RECT)
      const bh = Math.max(bbox.h, MIN_RECT)
      let w = Math.min(bw, bh * ratio, iw, ih * ratio)
      const h = w / ratio
      const left = clamp(cx - w / 2, 0, iw - w)
      const top = clamp(cy - h / 2, 0, ih - h)
      return bboxToPoints({ left, top, right: left + w, bottom: top + h })
    },
    [imageNatural, points]
  )

  const applyRatioMode = useCallback(
    (mode: RatioMode) => {
      if (!imageNatural) return
      if (mode === "polygon") {
        // Keep the current shape; just allow free-form editing.
        setRatioMode("polygon")
        setAspectRatio(null)
        return
      }
      const bbox = getBoundingBox(points)
      if (mode === "rect") {
        setRatioMode("rect")
        setAspectRatio(null)
        setPoints(bboxToPoints(bbox)) // rectangularize (e.g. when coming from polygon)
        return
      }
      // Locked modes: snap to a rectangle of the target ratio.
      if (mode === "square") {
        setRatioMode("square")
        setAspectRatio(1)
        setPoints(rectForRatio(1))
      } else {
        // "lock" → keep whatever ratio the box currently has
        const ratio = Math.max(bbox.w, MIN_RECT) / Math.max(bbox.h, MIN_RECT)
        setRatioMode("lock")
        setAspectRatio(ratio)
        setPoints(bboxToPoints(bbox))
      }
    },
    [imageNatural, points, rectForRatio]
  )

  // ── Polygon handlers ────────────────────────────────────────────────────────

  const handleVertexMouseDown = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      type: "vertex",
      index,
      startX: e.clientX,
      startY: e.clientY,
      origPoints: points.map((p) => ({ ...p })),
    }
  }, [points])

  const handleVertexRightClick = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault()
    e.stopPropagation()
    if (points.length <= MIN_POINTS) return
    setPoints((prev) => prev.filter((_, i) => i !== index))
  }, [points.length])

  const handleEdgeMouseDown = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      type: "edge",
      index,
      startX: e.clientX,
      startY: e.clientY,
      origPoints: points.map((p) => ({ ...p })),
    }
  }, [points])

  const handleMidpointClick = useCallback((e: React.MouseEvent, afterIndex: number) => {
    e.preventDefault()
    e.stopPropagation()
    const mid = midpoints[afterIndex]
    if (!mid) return
    setPoints((prev) => {
      const next = [...prev]
      next.splice(afterIndex + 1, 0, { x: Math.round(mid.x), y: Math.round(mid.y) })
      return next
    })
  }, [midpoints])

  // ── Rectangle handlers ──────────────────────────────────────────────────────

  const handleRectMouseDown = useCallback((e: React.MouseEvent, handle: RectHandleMeta) => {
    e.preventDefault()
    e.stopPropagation()
    const bbox = getBoundingBox(points)
    dragRef.current = {
      type: "rect",
      handle,
      startX: e.clientX,
      startY: e.clientY,
      origRect: { left: bbox.left, top: bbox.top, right: bbox.right, bottom: bbox.bottom },
    }
  }, [points])

  const handleBodyMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      type: "move",
      startX: e.clientX,
      startY: e.clientY,
      origPoints: points.map((p) => ({ ...p })),
    }
  }, [points])

  // Global mouse move/up for all drag interactions
  useEffect(() => {
    if (!imageNatural) return
    const iw = imageNatural.w
    const ih = imageNatural.h

    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const s = scaleRef.current
      const dx = (e.clientX - drag.startX) / s
      const dy = (e.clientY - drag.startY) / s

      if (drag.type === "vertex") {
        const orig = drag.origPoints[drag.index]
        const newX = clamp(Math.round(orig.x + dx), 0, iw)
        const newY = clamp(Math.round(orig.y + dy), 0, ih)
        setPoints((prev) => {
          const next = [...prev]
          next[drag.index] = { x: newX, y: newY }
          return next
        })
      } else if (drag.type === "edge") {
        // Polygon edge drag: move both endpoints of the edge together
        const i1 = drag.index
        const i2 = (drag.index + 1) % drag.origPoints.length
        const orig1 = drag.origPoints[i1]
        const orig2 = drag.origPoints[i2]
        setPoints((prev) => {
          const next = [...prev]
          next[i1] = {
            x: clamp(Math.round(orig1.x + dx), 0, iw),
            y: clamp(Math.round(orig1.y + dy), 0, ih),
          }
          next[i2] = {
            x: clamp(Math.round(orig2.x + dx), 0, iw),
            y: clamp(Math.round(orig2.y + dy), 0, ih),
          }
          return next
        })
      } else if (drag.type === "rect") {
        const r = resizeRect(drag.origRect, drag.handle, dx, dy, aspectRef.current, iw, ih)
        setPoints(bboxToPoints({
          left: Math.round(r.left),
          top: Math.round(r.top),
          right: Math.round(r.right),
          bottom: Math.round(r.bottom),
        }))
      } else {
        // Move the whole rectangle, clamped so it stays within the image.
        const bbox = getBoundingBox(drag.origPoints)
        const tx = clamp(dx, -bbox.left, iw - bbox.right)
        const ty = clamp(dy, -bbox.top, ih - bbox.bottom)
        setPoints(
          drag.origPoints.map((p) => ({
            x: Math.round(p.x + tx),
            y: Math.round(p.y + ty),
          }))
        )
      }
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
  }, [imageNatural])

  const handleApply = async () => {
    if (points.length < MIN_POINTS || !loadedImageRef.current) return
    setApplying(true)
    try {
      const blob = await getCroppedImagePolygon(loadedImageRef.current, points)
      await onApply(blob)
    } catch {
      setApplying(false)
    }
  }

  const hasValidRegion = points.length >= MIN_POINTS

  // Build SVG polygon string for display coordinates
  const svgPolygon = points.map((p) => `${p.x * scale},${p.y * scale}`).join(" ")

  // Compute bounding box dimensions for info display
  const bbox = hasValidRegion ? getBoundingBox(points) : null

  const ratioOptions: Array<{ key: RatioMode; label: string; title: string; Icon: typeof Lock }> = [
    { key: "rect", label: t`Rectangle`, title: t`Free rectangle — resize without skewing`, Icon: RectangleHorizontal },
    { key: "polygon", label: t`Polygon`, title: t`Free-form polygon — move, add, and remove points`, Icon: Pentagon },
    { key: "lock", label: t`Lock`, title: t`Lock the current aspect ratio`, Icon: Lock },
    { key: "square", label: t`1:1`, title: t`Lock to a square`, Icon: Square },
  ]

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col" style={NO_DRAG_REGION}>
      {/* Header — `drag-region` lets the window be moved by the empty header
          area; its interactive children are reset to no-drag via CSS. Electron
          computes app regions globally (ignoring z-index), so the overlay must
          declare no-drag or the app's title-bar drag strip beneath it would
          swallow clicks on these buttons in the packaged desktop app. */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-background border-b shrink-0 drag-region">
        <div className="flex items-center gap-3 min-w-0">
          {showMacOSSpacer && <MacOSTrafficLightSpacer />}
          <h2 className="text-sm font-medium shrink-0">{t`Crop Image`}</h2>
          {/* Mode / ratio control */}
          <div className="flex items-center rounded-md border bg-muted/50 p-0.5 gap-0.5">
            {ratioOptions.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => applyRatioMode(opt.key)}
                disabled={applying}
                title={opt.title}
                aria-pressed={ratioMode === opt.key}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors cursor-pointer disabled:opacity-50",
                  ratioMode === opt.key
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <opt.Icon className="h-3 w-3" />
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={applying}
            className="text-xs font-medium rounded px-3 py-1.5 bg-muted hover:bg-accent transition-colors cursor-pointer disabled:opacity-50"
          >
            <Trans>Cancel</Trans>
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={applying || !hasValidRegion}
            className="flex items-center gap-1 text-xs font-medium rounded px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white cursor-pointer transition-colors disabled:opacity-50"
          >
            {applying && <Loader2 className="h-3 w-3 animate-spin" />}
            <Trans>Apply</Trans>
          </button>
        </div>
      </div>

      {/* Image + polygon overlay */}
      <div ref={containerRef} className="flex-1 flex items-center justify-center overflow-hidden">
        {displaySize && (
          <div
            ref={imageRef}
            className="relative select-none"
            style={{ width: displaySize.w, height: displaySize.h }}
          >
            <img
              src={imageSrc}
              crossOrigin="anonymous"
              alt={t`Crop preview`}
              className="w-full h-full block pointer-events-none"
              draggable={false}
            />

            {/* Dimmed overlay outside polygon */}
            {hasValidRegion && (
              <div
                className="absolute inset-0 bg-black/50 pointer-events-none"
                style={{
                  clipPath: (() => {
                    // Inner polygon must be CCW (reversed) to create a cutout
                    // with the CW outer rectangle under nonzero fill rule
                    const reversed = [...points].reverse()
                    return `polygon(
                      0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
                      ${reversed.map((p) => `${p.x * scale}px ${p.y * scale}px`).join(", ")},
                      ${reversed[0].x * scale}px ${reversed[0].y * scale}px,
                      0% 0%
                    )`
                  })(),
                }}
              />
            )}

            {/* SVG overlay for edges, vertices, and handles */}
            {hasValidRegion && bbox && (
              <svg
                className="absolute inset-0"
                width={displaySize.w}
                height={displaySize.h}
                style={{ overflow: "visible" }}
              >
                {/* Polygon outline */}
                <polygon
                  points={svgPolygon}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={2}
                />

                {isRect ? (
                  <>
                    {/* Draggable body for moving the rectangle */}
                    <rect
                      x={bbox.left * scale}
                      y={bbox.top * scale}
                      width={bbox.w * scale}
                      height={bbox.h * scale}
                      fill="transparent"
                      style={{ cursor: "move" }}
                      onMouseDown={handleBodyMouseDown}
                    />
                    {/* Corner + edge resize handles */}
                    {RECT_HANDLES.map((h) => {
                      const hx = (bbox.left + bbox.w * h.fx) * scale
                      const hy = (bbox.top + bbox.h * h.fy) * scale
                      const isCorner = (h.L || h.R) && (h.T || h.B)
                      return isCorner ? (
                        <circle
                          key={h.key}
                          cx={hx}
                          cy={hy}
                          r={VERTEX_RADIUS}
                          fill="#3b82f6"
                          stroke="white"
                          strokeWidth={1.5}
                          style={{ cursor: h.cursor }}
                          onMouseDown={(e) => handleRectMouseDown(e, h)}
                        />
                      ) : (
                        <rect
                          key={h.key}
                          x={hx - EDGE_HANDLE / 2}
                          y={hy - EDGE_HANDLE / 2}
                          width={EDGE_HANDLE}
                          height={EDGE_HANDLE}
                          rx={2}
                          fill="#3b82f6"
                          stroke="white"
                          strokeWidth={1.5}
                          style={{ cursor: h.cursor }}
                          onMouseDown={(e) => handleRectMouseDown(e, h)}
                        />
                      )
                    })}
                  </>
                ) : (
                  <>
                    {/* Invisible wider edge hit areas for dragging */}
                    {points.map((p, i) => {
                      const next = points[(i + 1) % points.length]
                      return (
                        <line
                          key={`edge-${i}`}
                          x1={p.x * scale}
                          y1={p.y * scale}
                          x2={next.x * scale}
                          y2={next.y * scale}
                          stroke="transparent"
                          strokeWidth={12}
                          style={{ cursor: "move" }}
                          onMouseDown={(e) => handleEdgeMouseDown(e, i)}
                        />
                      )
                    })}

                    {/* Midpoint handles (add point) */}
                    {midpoints.map((mp, i) => (
                      <circle
                        key={`mid-${i}`}
                        cx={mp.x * scale}
                        cy={mp.y * scale}
                        r={MIDPOINT_RADIUS}
                        fill="#3b82f6"
                        fillOpacity={0.4}
                        stroke="#3b82f6"
                        strokeWidth={1}
                        style={{ cursor: "copy" }}
                        onMouseDown={(e) => handleMidpointClick(e, i)}
                      />
                    ))}

                    {/* Vertex handles */}
                    {points.map((p, i) => (
                      <circle
                        key={`v-${i}`}
                        cx={p.x * scale}
                        cy={p.y * scale}
                        r={VERTEX_RADIUS}
                        fill="#3b82f6"
                        stroke="white"
                        strokeWidth={1.5}
                        style={{ cursor: "grab" }}
                        onMouseDown={(e) => handleVertexMouseDown(e, i)}
                        onContextMenu={(e) => handleVertexRightClick(e, i)}
                      />
                    ))}
                  </>
                )}
              </svg>
            )}
          </div>
        )}
      </div>

      {/* Info bar */}
      <div className="bg-background border-t shrink-0 px-4 py-2 flex items-center gap-4 text-[10px] text-muted-foreground">
        <span>
          {ratioMode === "polygon" ? (
            <Trans>Drag vertices to reshape. Click midpoints (+) to add points. Right-click a vertex to remove it.</Trans>
          ) : aspectRatio !== null ? (
            <Trans>Drag the handles to resize (aspect ratio locked). Drag inside to move.</Trans>
          ) : (
            <Trans>Drag the handles to crop a rectangle. Drag inside to move.</Trans>
          )}
        </span>
        {bbox && (
          <span className="ml-auto font-mono">
            {ratioMode === "polygon"
              ? t`${bbox.w} × ${bbox.h}px · ${points.length} points`
              : t`${bbox.w} × ${bbox.h}px`}
          </span>
        )}
      </div>
    </div>
  )
}

function getBoundingBox(points: Point[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  const left = Math.max(0, minX)
  const top = Math.max(0, minY)
  return {
    left,
    top,
    right: maxX,
    bottom: maxY,
    w: maxX - left,
    h: maxY - top,
  }
}

/** Convert a rectangle to its 4 corner points in canonical order: TL, TR, BR, BL. */
function bboxToPoints(r: Rect): Point[] {
  return [
    { x: r.left, y: r.top },
    { x: r.right, y: r.top },
    { x: r.right, y: r.bottom },
    { x: r.left, y: r.bottom },
  ]
}

/**
 * Resize a rectangle by dragging one of its 8 handles.
 * When `ratio` is null, sides move freely. Otherwise the aspect ratio (w/h) is
 * preserved: corner handles anchor at the opposite corner; edge handles grow the
 * perpendicular dimension symmetrically about the rect's center.
 */
function resizeRect(orig: Rect, h: RectHandleMeta, dx: number, dy: number, ratio: number | null, iw: number, ih: number): Rect {
  if (ratio == null) {
    let { left, top, right, bottom } = orig
    if (h.L) left = clamp(orig.left + dx, 0, orig.right - MIN_RECT)
    if (h.R) right = clamp(orig.right + dx, orig.left + MIN_RECT, iw)
    if (h.T) top = clamp(orig.top + dy, 0, orig.bottom - MIN_RECT)
    if (h.B) bottom = clamp(orig.bottom + dy, orig.top + MIN_RECT, ih)
    return { left, top, right, bottom }
  }

  const isCorner = (h.L || h.R) && (h.T || h.B)
  if (isCorner) {
    const anchorX = h.L ? orig.right : orig.left
    const anchorY = h.T ? orig.bottom : orig.top
    const signX = h.L ? -1 : 1
    const signY = h.T ? -1 : 1
    const cornerX = h.L ? orig.left : orig.right
    const cornerY = h.T ? orig.top : orig.bottom
    const desiredW = Math.max(MIN_RECT, (cornerX + dx - anchorX) * signX)
    const desiredH = Math.max(MIN_RECT, (cornerY + dy - anchorY) * signY)
    let w = desiredW / ratio >= desiredH ? desiredW : desiredH * ratio
    const maxW = signX > 0 ? iw - anchorX : anchorX
    const maxH = signY > 0 ? ih - anchorY : anchorY
    w = Math.max(MIN_RECT, Math.min(w, maxW, maxH * ratio))
    const hh = w / ratio
    const left = signX > 0 ? anchorX : anchorX - w
    const top = signY > 0 ? anchorY : anchorY - hh
    return { left, top, right: left + w, bottom: top + hh }
  }

  if (h.L || h.R) {
    // Horizontal edge: width drives, height follows ratio, centered vertically.
    const cy = (orig.top + orig.bottom) / 2
    const anchorX = h.L ? orig.right : orig.left
    const sign = h.L ? -1 : 1
    const movingX = h.L ? orig.left : orig.right
    let w = Math.max(MIN_RECT, (movingX + dx - anchorX) * sign)
    w = Math.min(w, sign > 0 ? iw - anchorX : anchorX)
    let hh = w / ratio
    const maxH = 2 * Math.min(cy, ih - cy)
    if (hh > maxH) { hh = maxH; w = hh * ratio }
    w = Math.max(w, MIN_RECT)
    hh = w / ratio
    const left = sign > 0 ? anchorX : anchorX - w
    const top = cy - hh / 2
    return { left, top, right: left + w, bottom: top + hh }
  }

  // Vertical edge: height drives, width follows ratio, centered horizontally.
  const cx = (orig.left + orig.right) / 2
  const anchorY = h.T ? orig.bottom : orig.top
  const sign = h.T ? -1 : 1
  const movingY = h.T ? orig.top : orig.bottom
  let hh = Math.max(MIN_RECT, (movingY + dy - anchorY) * sign)
  hh = Math.min(hh, sign > 0 ? ih - anchorY : anchorY)
  let w = hh * ratio
  const maxW = 2 * Math.min(cx, iw - cx)
  if (w > maxW) { w = maxW; hh = w / ratio }
  hh = Math.max(hh, MIN_RECT)
  w = hh * ratio
  const top = sign > 0 ? anchorY : anchorY - hh
  const left = cx - w / 2
  return { left, top, right: left + w, bottom: top + hh }
}

/**
 * Crop an image to a polygon region using canvas clipping.
 * Output is the bounding box of the polygon, with transparent pixels outside.
 * Scaled to the original image's full width to preserve display size in layouts.
 */
function getCroppedImagePolygon(image: HTMLImageElement, points: Point[]): Promise<Blob> {
  const iw = image.naturalWidth
  const ih = image.naturalHeight

  // Clamp points to image bounds
  const clamped = points.map((p) => ({
    x: Math.max(0, Math.min(iw, p.x)),
    y: Math.max(0, Math.min(ih, p.y)),
  }))

  // Compute bounding box
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of clamped) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }

  const cropW = maxX - minX
  const cropH = maxY - minY
  if (cropW <= 0 || cropH <= 0) {
    return Promise.reject(new Error("Crop region is empty"))
  }

  // Output at the selection's native resolution (no upscaling) so a small
  // region cropped out of a large page image stays sharp and compact.
  const outputWidth = Math.round(cropW)
  const outputHeight = Math.round(cropH)

  const canvas = document.createElement("canvas")
  canvas.width = outputWidth
  canvas.height = outputHeight
  const ctx = canvas.getContext("2d")!

  // Draw clipping polygon (translated to canvas coordinates, 1:1)
  ctx.beginPath()
  for (let i = 0; i < clamped.length; i++) {
    const px = clamped[i].x - minX
    const py = clamped[i].y - minY
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.clip()

  // Draw the image cropped to the bounding box at 1:1
  ctx.drawImage(
    image,
    minX, minY, cropW, cropH,
    0, 0, outputWidth, outputHeight,
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error("Canvas toBlob failed"))
      },
      "image/png",
    )
  })
}
