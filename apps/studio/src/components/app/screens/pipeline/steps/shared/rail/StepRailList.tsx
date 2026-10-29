import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { useLingui } from "@lingui/react/macro"
import { useParams } from "@tanstack/react-router"
import { ScrollArea } from "@/components/ui/scroll-area"
import { prefersReducedMotion } from "@/lib/utils"
import { StepRailHeader } from "@/components/app/screens/pipeline/rail/StepRailHeader"
import type { RailEntry } from "../ui"
import { matchesRailQuery } from "./railFilter"
import { RailSearch } from "./RailSearch"
import { RailRow } from "./RailRows"
import { RailHoverPreview } from "./RailHoverPreview"

export function StepRailList({
  heading,
  hex,
  entries,
  activeKey,
  onSelect,
  footer,
  hoverPreview = false,
}: {
  heading: ReactNode
  hex: string
  entries: RailEntry[]
  activeKey?: string | null
  onSelect?: (key: string | null) => void
  footer?: ReactNode
  hoverPreview?: boolean
}) {
  const { t } = useLingui()
  const { label } = useParams({ strict: false }) as { label?: string }
  const [query, setQuery] = useState("")
  const needle = query.trim().toLowerCase()
  const listRef = useRef<HTMLDivElement>(null)
  const rows = useMemo(() => entries.filter((entry) => !entry.key || matchesRailQuery(entry, needle)), [entries, needle])
  const matches = rows.filter((entry) => !!entry.key)
  const activeIndex = rows.findIndex((entry) => entry.key === (activeKey ?? ""))
  const focusIndex = activeIndex >= 0 ? activeIndex : 0

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>("[data-rail-row][aria-current]")
    node?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" })
  }, [activeKey, needle])

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return
    const buttons = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-rail-row]") ?? [])]
    if (buttons.length === 0) return
    const from = buttons.indexOf(document.activeElement as HTMLElement)
    const start = from >= 0 ? from : focusIndex
    const step = event.key === "ArrowDown" ? 1 : -1
    const target = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : Math.min(buttons.length - 1, Math.max(0, start + step))
    event.preventDefault()
    buttons[target]?.focus()
    buttons[target]?.scrollIntoView({ block: "nearest" })
  }

  return (
    <>
      <StepRailHeader>{heading}</StepRailHeader>
      <div className="mb-2">
        <RailSearch
          query={query}
          onQuery={setQuery}
          matches={needle ? matches.length : null}
          onSubmit={() => {
            const first = matches[0]
            if (first) onSelect?.(first.key)
          }}
        />
      </div>

      <ScrollArea className="-mx-1 min-h-0 flex-1" viewportClassName="[&>div]:block!">
        <div ref={listRef} onKeyDown={moveFocus} className="flex flex-col gap-0.5 px-1 pb-1">
          {rows.map((entry, index) => (
            <div key={entry.key ?? "__unassigned"} className="relative">
              <RailRow
                entry={entry}
                active={entry.key === (activeKey ?? "")}
                hex={hex}
                tabIndex={index === focusIndex ? 0 : -1}
                onSelect={() => onSelect?.(entry.key)}
              />
              {hoverPreview && label && entry.key && <RailHoverPreview label={label} pageId={entry.key} />}
            </div>
          ))}
          {needle && matches.length === 0 && (
            <p className="px-3 py-6 text-center text-[12px] text-muted-foreground animate-in fade-in duration-200 motion-reduce:animate-none">
              {t`No pages match “${query.trim()}”.`}
            </p>
          )}
        </div>
      </ScrollArea>

      {footer && <div className="border-t pt-2.5 text-[10px] leading-relaxed text-muted-foreground">{footer}</div>}
    </>
  )
}
