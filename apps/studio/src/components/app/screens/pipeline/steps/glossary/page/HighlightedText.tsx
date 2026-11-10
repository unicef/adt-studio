import { useMemo } from "react"
import { cn } from "@/lib/utils"
import type { GlossaryRow } from "../glossaryRows"
import { splitByTerms } from "./termMatches"

const MARK = cn(
  "rounded-[3px] px-px text-inherit transition-[background-color,box-shadow] duration-150 motion-reduce:transition-none",
  "cursor-pointer bg-[color-mix(in_srgb,var(--chrome-hex)_16%,transparent)] shadow-[inset_0_-1.5px_0_color-mix(in_srgb,var(--chrome-hex)_60%,transparent)]",
)
const MARK_ON = "bg-[color-mix(in_srgb,var(--chrome-hex)_34%,transparent)] shadow-[inset_0_-2px_0_var(--chrome-hex)]"
const MARK_PRUNED = "bg-muted shadow-[inset_0_-1.5px_0_var(--border)]"

export function HighlightedText({
  text,
  rows,
  activeKey,
  onHover,
  onSelect,
  className,
}: {
  text: string
  rows: readonly GlossaryRow[]
  activeKey: string | null
  onHover: (key: string | null) => void
  onSelect: (key: string) => void
  className?: string
}) {
  const segments = useMemo(() => splitByTerms(text, rows), [text, rows])
  const pruned = useMemo(() => new Set(rows.filter((row) => row.pruned).map((row) => row._key)), [rows])
  return (
    <p className={className}>
      {segments.map((segment, index) =>
        segment.key ? (
          <mark
            key={index}
            data-term={segment.key}
            onMouseEnter={() => onHover(segment.key)}
            onMouseLeave={() => onHover(null)}
            onClick={() => segment.key && onSelect(segment.key)}
            className={cn(MARK, pruned.has(segment.key) && MARK_PRUNED, segment.key === activeKey && MARK_ON)}
          >
            {segment.text}
          </mark>
        ) : (
          segment.text
        ),
      )}
    </p>
  )
}
