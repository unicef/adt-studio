import { useLingui } from "@lingui/react/macro"
import { plural } from "@lingui/core/macro"
import type { MessageDescriptor } from "@lingui/core"
import { Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { GROUP_TITLE } from "./groupTitle"
import type { KindCount } from "./tier"
import { RIGHT_KIND_LABEL } from "./tierTone"

export function rightSummary(translate: (descriptor: MessageDescriptor) => string, kinds: readonly KindCount[]): string {
  return kinds.map((entry) => `${translate(RIGHT_KIND_LABEL[entry.kind] ?? GROUP_TITLE[entry.kind]).toLowerCase()} ${entry.count}`).join(", ")
}

export function NoiseToggle({
  showAll,
  onChange,
  total,
  right,
  rightKinds,
  compact = false,
  className,
}: {
  showAll: boolean
  onChange: (value: boolean) => void
  total: number
  right: number
  rightKinds: readonly KindCount[]
  compact?: boolean
  className?: string
}) {
  const { t, i18n } = useLingui()
  if (right === 0 && !showAll) return null
  const detail = rightSummary((descriptor) => i18n._(descriptor), rightKinds)
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2 text-[11.5px] text-muted-foreground", className)} data-left-out-noise>
      {right > 0 && !compact && (
        <span className="truncate" title={detail}>
          {showAll
            ? t`${plural(right, { one: "Includes # probably right", other: "Includes # probably right" })}`
            : t`${plural(right, { one: "# probably right, hidden", other: "# probably right, hidden" })}`}
          {detail && <span className="text-muted-foreground/80"> ({detail})</span>}
        </span>
      )}
      <button
        type="button"
        aria-pressed={showAll}
        onClick={() => onChange(!showAll)}
        title={compact && right > 0 ? t`${plural(right, { one: "# probably right", other: "# probably right" })}: ${detail}` : undefined}
        className={cn(
          "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-semibold transition-[background-color,color,border-color] duration-200 motion-reduce:transition-none",
          "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)]",
          showAll
            ? "border-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)] bg-[color-mix(in_srgb,var(--chrome-hex)_12%,transparent)] text-[var(--chrome-hex)]"
            : "bg-card text-foreground hover:bg-muted",
        )}
      >
        {showAll ? <EyeOff className="size-3" aria-hidden /> : <Eye className="size-3" aria-hidden />}
        {showAll ? t`Hide probably right` : t`Show all (${total})`}
      </button>
    </span>
  )
}
