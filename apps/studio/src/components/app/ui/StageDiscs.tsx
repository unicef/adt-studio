import { cn } from "@/lib/utils"
import type { StageDisc } from "../data"

export interface StageDiscsProps {
  discs: StageDisc[]
  size?: number
  max?: number
  className?: string
}

export function StageDiscs({ discs, size = 28, max, className }: StageDiscsProps) {
  const shown = max != null ? discs.slice(0, max) : discs
  const overflow = max != null && discs.length > max ? discs.length - max : 0
  const glyph = Math.round(size * 0.53)
  return (
    <div className={cn("flex flex-wrap items-center gap-[3px]", className)}>
      {shown.map((d) => {
        const Icon = d.icon
        return (
          <span
            key={d.slug}
            className="grid shrink-0 place-items-center rounded-full text-white"
            style={{ width: size, height: size, background: d.hex }}
          >
            <Icon style={{ width: glyph, height: glyph }} strokeWidth={2.6} />
          </span>
        )
      })}
      {overflow > 0 && (
        <span className="ml-0.5 font-mono text-[11px] font-semibold text-muted-foreground">+{overflow}</span>
      )}
    </div>
  )
}
