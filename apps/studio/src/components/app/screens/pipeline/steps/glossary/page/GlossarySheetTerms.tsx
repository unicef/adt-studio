import { useEffect, useRef, useState } from "react"
import { prefersReducedMotion } from "@/lib/utils"
import { GlossaryTermRow, type GlossaryRowContext } from "../GlossaryTermRow"
import type { GlossaryRow } from "../glossaryRows"

export function GlossarySheetTerms({ rows, ctx, focusKey }: { rows: GlossaryRow[]; ctx: GlossaryRowContext; focusKey: string | null }) {
  const list = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set(focusKey ? [focusKey] : rows.length <= 2 ? rows.map((row) => row._key) : []))
  const [focused, setFocused] = useState(focusKey)
  if (focused !== focusKey) {
    setFocused(focusKey)
    if (focusKey) setExpanded((previous) => new Set([...previous, focusKey]))
  }

  useEffect(() => {
    if (!focusKey) return
    const frame = requestAnimationFrame(() =>
      list.current
        ?.querySelector(`[data-row-key="${CSS.escape(focusKey)}"]`)
        ?.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" }),
    )
    return () => cancelAnimationFrame(frame)
  }, [focusKey])

  const toggle = (key: string) =>
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div ref={list} className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <GlossaryTermRow key={row._key} row={row} ctx={ctx} expanded={expanded.has(row._key)} onToggle={() => toggle(row._key)} flash={false} />
      ))}
    </div>
  )
}
