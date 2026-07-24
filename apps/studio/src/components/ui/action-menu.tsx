import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react"
import { cn } from "@/lib/utils"

export interface ActionMenuItem {
  icon?: ComponentType<{ className?: string }>
  iconClassName?: string
  label: ReactNode
  onClick: () => void
  danger?: boolean
  hidden?: boolean
  disabled?: boolean
}

/** Entries are items or separators; separators collapse when hiding leaves
 * them leading, trailing, or adjacent. */
export type ActionMenuEntry = ActionMenuItem | { separator: true }

function isSeparator(entry: ActionMenuEntry): entry is { separator: true } {
  return "separator" in entry
}

/**
 * Minimal dropdown menu: a toggle button plus an item list, closed on
 * outside mousedown. Shared by the tree editor row menus, the editor
 * footer buttons, and the section actions menu.
 */
export function ActionMenu({
  trigger,
  triggerClassName,
  triggerDisabled,
  note,
  items,
  itemsDisabled,
  align = "right",
  menuClassName,
}: {
  /** Content of the toggle button. */
  trigger: ReactNode
  triggerClassName: string
  triggerDisabled?: boolean
  /** Optional block shown above the items (e.g. why actions are disabled). */
  note?: ReactNode
  items: ActionMenuEntry[]
  /** Disables every item (per-item `disabled` also applies). */
  itemsDisabled?: boolean
  align?: "left" | "right"
  menuClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  // Drop hidden items, then collapse separators left dangling by the filter.
  const entries: ActionMenuEntry[] = []
  for (const entry of items) {
    if (isSeparator(entry)) {
      if (entries.length === 0 || isSeparator(entries[entries.length - 1])) continue
      entries.push(entry)
    } else if (!entry.hidden) {
      entries.push(entry)
    }
  }
  while (entries.length > 0 && isSeparator(entries[entries.length - 1])) {
    entries.pop()
  }
  if (entries.length === 0) return null

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={triggerDisabled}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          className={cn(
            "absolute top-full z-50 mt-1 min-w-[160px] rounded-md border bg-popover py-1 text-xs shadow-md",
            align === "right" ? "right-0" : "left-0",
            menuClassName
          )}
        >
          {note}
          {entries.map((entry, i) =>
            isSeparator(entry) ? (
              <div key={i} className="my-1 border-t" />
            ) : (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setOpen(false)
                  entry.onClick()
                }}
                disabled={itemsDisabled || entry.disabled}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-default",
                  entry.danger && "text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                )}
              >
                {entry.icon ? (
                  <entry.icon className={cn("h-3.5 w-3.5", entry.iconClassName)} />
                ) : null}
                {entry.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  )
}
