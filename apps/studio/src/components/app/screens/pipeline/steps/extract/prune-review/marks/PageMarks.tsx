import type { CSSProperties } from "react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import type { PageRect } from "@/components/app/screens/pipeline/steps/shared/page-inspector/pageRect"
import type { HumanReason } from "../../page-detail/humanReason"
import { reasonLabel } from "../ReasonChip"
import type { Tier } from "../tier"
import { TIER_LABEL } from "../tierTone"

export interface PageMark {
  imageId: string
  number: number
  rect: PageRect
  tier: Tier | null
  why: string
  reason: HumanReason
  verdict?: "keep" | "unsure" | "remove" | null
}

const VERDICT_TONE = {
  keep: { border: "border-2 border-solid border-emerald-500", fill: "bg-emerald-500/15", ring: "shadow-[0_0_0_3px_rgba(16,185,129,0.3)]", label: "bg-emerald-600 text-white" },
  unsure: { border: "border-2 border-solid border-amber-400", fill: "bg-amber-400/15", ring: "shadow-[0_0_0_3px_rgba(251,191,36,0.35)]", label: "bg-amber-400 text-amber-950" },
  remove: { border: "border-2 border-dashed border-zinc-400", fill: "bg-zinc-400/12", ring: "shadow-[0_0_0_3px_rgba(161,161,170,0.3)]", label: "bg-zinc-500 text-white" },
  none: { border: "border-2 border-dashed border-[var(--chrome-hex)]", fill: "bg-[color-mix(in_srgb,var(--chrome-hex)_14%,transparent)]", ring: "shadow-[0_0_0_3px_color-mix(in_srgb,var(--chrome-hex)_30%,transparent)]", label: "bg-[var(--chrome-hex)] text-white" },
} as const

function boxStyle(rect: PageRect): CSSProperties {
  return {
    left: `${rect.left}%`,
    top: `${rect.top}%`,
    width: `${rect.width}%`,
    height: `${rect.height}%`,
    minWidth: 6,
    minHeight: 6,
  }
}

function OutlineMark({ mark, active, selected }: { mark: PageMark; active: boolean; selected: boolean }) {
  const tone = VERDICT_TONE[mark.verdict ?? "none"]
  return (
    <span
      aria-hidden
      className={cn(
        "absolute inset-0 block rounded-[3px] transition-[background-color,box-shadow,opacity,scale] duration-200 ease-out starting:scale-95 starting:opacity-0 motion-reduce:transition-none",
        tone.border,
        selected ? cn(tone.fill, tone.ring) : active && tone.fill,
        mark.verdict === "remove" && !active && !selected && "opacity-70",
      )}
    >
      <span
        className={cn(
          "absolute -top-px -left-px grid h-4 min-w-4 place-items-center rounded-[3px] px-1 font-mono text-[10px] font-semibold tabular-nums transition-opacity duration-200 motion-reduce:transition-none",
          tone.label,
          active || selected ? "opacity-100" : "opacity-90",
        )}
      >
        {mark.number}
      </span>
    </span>
  )
}

export function PageMarks({
  marks,
  hoverId,
  selectedId,
  onHover,
  onPick,
}: {
  marks: readonly PageMark[]
  hoverId: string | null
  selectedId: string | null
  onHover: (imageId: string | null) => void
  onPick: (imageId: string) => void
}) {
  const { t, i18n } = useLingui()
  const ordered = [...marks].sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height)
  return (
    <div className="pointer-events-none absolute inset-0" data-left-out-marks="outline">
      {ordered.map((mark) => {
        const tierName = mark.tier ? i18n._(TIER_LABEL[mark.tier]) : reasonLabel((descriptor) => i18n._(descriptor), mark.reason)
        const label = mark.why ? t`Left-out image ${mark.number}, ${tierName}: ${mark.why}` : t`Left-out image ${mark.number}: ${tierName}`
        const active = hoverId === mark.imageId
        const selected = selectedId === mark.imageId
        return (
          <button
            key={mark.imageId}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={selected}
            data-left-out-mark={mark.number}
            data-tier={mark.tier ?? undefined}
            onClick={(event) => {
              event.stopPropagation()
              onPick(mark.imageId)
            }}
            onMouseEnter={() => onHover(mark.imageId)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(mark.imageId)}
            onBlur={() => onHover(null)}
            className="pointer-events-auto absolute rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--chrome-hex)] focus-visible:ring-offset-1"
            style={boxStyle(mark.rect)}
          >
            <OutlineMark mark={mark} active={active} selected={selected} />
          </button>
        )
      })}
    </div>
  )
}
