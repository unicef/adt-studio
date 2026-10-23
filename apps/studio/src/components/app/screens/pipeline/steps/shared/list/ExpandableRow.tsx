import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { tint } from "@/components/app/screens/pipeline/shared/tint"
import { MUTED_CONTAINER } from "../ui"

export interface ExpandableRowProps {
  id: string
  summary: ReactNode
  lead?: ReactNode
  children?: ReactNode
  expanded: boolean
  onToggle?: () => void
  locked?: boolean
  muted?: boolean
  mutedLabel?: string
  edited?: boolean
  accent: string
  actions?: ReactNode
  flash?: boolean
  className?: string
}

export function ExpandableRow({
  id,
  summary,
  lead,
  children,
  expanded,
  onToggle,
  muted = false,
  mutedLabel,
  edited = false,
  accent,
  actions,
  flash = false,
  className,
}: ExpandableRowProps) {
  const { t } = useLingui()
  const editorId = useId()
  const summaryRef = useRef<HTMLButtonElement>(null)
  const toggleable = !!onToggle && !!children
  const open = !!children && (expanded || !onToggle)
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)

  const onEditorKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented || !toggleable || !expanded) return
    if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, [contenteditable='true']")) return
    event.preventDefault()
    onToggle?.()
    summaryRef.current?.focus()
  }

  return (
    <div
      role="group"
      data-row-key={id}
      aria-description={muted ? mutedLabel : edited ? t`edited` : undefined}
      className={cn(
        "group/row rounded-lg border transition-[background-color,box-shadow] duration-300 motion-reduce:transition-none",
        muted ? MUTED_CONTAINER : "bg-card",
        !muted && !expanded && "hover:bg-muted/40",
        className,
      )}
      style={flash ? { boxShadow: `0 0 0 3px ${tint(accent, 0.15)}`, background: tint(accent, 0.15) } : undefined}
    >
      <div className="flex min-h-11 items-center gap-2 px-3 py-2">
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full transition-[opacity,transform] duration-200 motion-reduce:transition-none",
            edited ? "scale-100 opacity-100" : "scale-50 opacity-0",
          )}
          style={{ background: accent }}
        />
        {lead && <div className="flex shrink-0 items-center gap-2">{lead}</div>}
        {toggleable ? (
          <button
            ref={summaryRef}
            type="button"
            aria-expanded={expanded}
            aria-controls={editorId}
            onClick={onToggle}
            className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {summary}
          </button>
        ) : (
          <div className="min-w-0 flex-1">{summary}</div>
        )}
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        {toggleable && (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            onClick={onToggle}
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronDown className={cn("size-3.5 transition-transform duration-300 motion-reduce:transition-none", expanded && "rotate-180")} />
          </button>
        )}
      </div>
      {children && (
        <div
          id={editorId}
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
            open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
          )}
          inert={!open}
        >
          <div className="min-h-0 overflow-hidden">
            <div onKeyDown={onEditorKeyDown} className="border-t px-3 py-3 pl-[1.625rem]">
              {mounted ? children : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
