import { useEffect, useRef, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import type { ImageCleanupRegion } from "@adt/types"

/** Pointer selection plus equivalent numeric controls, in natural page pixels. */
export function FigureRegionPicker({ imageSrc, region, onChange, onValidityChange, disabled }: {
  imageSrc: string
  region: ImageCleanupRegion
  onChange: (region: ImageCleanupRegion) => void
  onValidityChange: (valid: boolean) => void
  disabled: boolean
}) {
  const { t } = useLingui()
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [failed, setFailed] = useState(false)
  const drag = useRef<{ x: number; y: number; region: ImageCleanupRegion; mode: string; pointerId: number } | null>(null)
  const valid = region.width >= 16 && region.height >= 16 && region.x >= 0 && region.y >= 0 &&
    region.x + region.width <= dimensions.width && region.y + region.height <= dimensions.height
  useEffect(() => onValidityChange(valid && !failed), [valid, failed, onValidityChange])

  function point(event: React.PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.round(Math.max(0, Math.min(dimensions.width, (event.clientX - bounds.left) / bounds.width * dimensions.width))),
      y: Math.round(Math.max(0, Math.min(dimensions.height, (event.clientY - bounds.top) / bounds.height * dimensions.height))),
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground"><Trans>Drag inside the box to move it, use the corners to resize, or draw a new box outside it. Include any labels you want to keep.</Trans></p>
      <div className="rounded-lg border bg-muted/40 p-2">
        <div className="relative mx-auto w-fit">
          <img src={imageSrc} alt={t`Original PDF page`} draggable={false}
            className="block max-h-[48vh] max-w-full"
            onError={() => setFailed(true)}
            onLoad={(event) => {
              setDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })
            }} />
          {dimensions.width > 0 && (
            <svg className="absolute inset-0 h-full w-full touch-none cursor-crosshair"
              viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
              aria-hidden="true"
              onPointerDown={(event) => {
                if (disabled || event.button !== 0 || drag.current) return
                const start = point(event)
                const corner = (event.target as Element).getAttribute("data-corner")
                const inside = start.x >= region.x && start.x <= region.x + region.width &&
                  start.y >= region.y && start.y <= region.y + region.height
                drag.current = { ...start, region: { ...region }, mode: corner ?? (inside && valid ? "move" : "draw"), pointerId: event.pointerId }
                event.currentTarget.setPointerCapture(event.pointerId)
              }}
              onPointerMove={(event) => {
                const start = drag.current
                if (!start || disabled || start.pointerId !== event.pointerId) return
                const next = point(event)
                const original = start.region
                if (start.mode === "move") {
                  onChange({ ...original,
                    x: Math.max(0, Math.min(dimensions.width - original.width, original.x + next.x - start.x)),
                    y: Math.max(0, Math.min(dimensions.height - original.height, original.y + next.y - start.y)),
                  })
                } else if (start.mode === "draw") {
                  onChange({ x: Math.min(start.x, next.x), y: Math.min(start.y, next.y),
                    width: Math.abs(next.x - start.x), height: Math.abs(next.y - start.y) })
                } else {
                  const right = original.x + original.width
                  const bottom = original.y + original.height
                  const x = start.mode.includes("w") ? Math.min(next.x, right - 16) : original.x
                  const y = start.mode.includes("n") ? Math.min(next.y, bottom - 16) : original.y
                  onChange({ x, y,
                    width: (start.mode.includes("e") ? Math.max(next.x, x + 16) : right) - x,
                    height: (start.mode.includes("s") ? Math.max(next.y, y + 16) : bottom) - y,
                  })
                }
              }}
              onPointerUp={(event) => {
                drag.current = null
                if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
              }}
              onLostPointerCapture={() => { drag.current = null }}
              onPointerCancel={() => { drag.current = null }}>
              <path className="fill-black/40" fillRule="evenodd"
                d={`M0 0H${dimensions.width}V${dimensions.height}H0Z M${region.x} ${region.y}h${region.width}v${region.height}h-${region.width}Z`} />
              <rect x={region.x} y={region.y} width={region.width} height={region.height}
                className="cursor-move fill-transparent stroke-violet-500" strokeWidth={3} />
              {valid && (["nw", "ne", "se", "sw"] as const).map((corner) => (
                <circle key={corner} data-corner={corner}
                  cx={region.x + (corner.includes("e") ? region.width : 0)}
                  cy={region.y + (corner.includes("s") ? region.height : 0)} r={dimensions.width / 90}
                  className={corner === "nw" || corner === "se" ? "cursor-nwse-resize fill-white stroke-violet-500" : "cursor-nesw-resize fill-white stroke-violet-500"}
                  strokeWidth={3} />
              ))}
            </svg>
          )}
        </div>
      </div>
      {failed && <p role="alert" className="text-sm text-destructive"><Trans>Could not load the original page.</Trans></p>}
      <div className="grid grid-cols-4 gap-2">
        {([
          ["x", t`Left`], ["y", t`Top`], ["width", t`Width`], ["height", t`Height`],
        ] as const).map(([field, label]) => (
          <label key={field} className="space-y-1 text-xs text-muted-foreground">
            <span>{label}</span>
            <input type="number" step={1} min={field === "x" || field === "y" ? 0 : 16}
              max={field === "x" || field === "width" ? dimensions.width : dimensions.height}
              value={region[field]} disabled={disabled}
              onChange={(event) => onChange({ ...region, [field]: Math.round(Number(event.target.value)) })}
              className="w-full rounded border bg-background px-2 py-1.5 text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" />
          </label>
        ))}
      </div>
      {dimensions.width > 0 && !valid && <p role="alert" className="text-xs text-destructive"><Trans>Select at least 16 × 16 pixels inside the page.</Trans></p>}
    </div>
  )
}
