import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"
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
  portal = false,
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
  /** Render the popup into document.body instead of inline. Needed when the
   *  trigger sits inside an `overflow-hidden` ancestor (e.g. a row that
   *  clips content for a hover/width transition) that would otherwise clip
   *  the popup. Position is computed from the trigger's rect on open. */
  portal?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [portalPos, setPortalPos] = useState<{ top: number; left: number; right: number } | null>(null)
  const triggerWrapRef = useRef<HTMLDivElement>(null)
  const portalMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      const insideTrigger = !!triggerWrapRef.current?.contains(target)
      const insidePortalMenu = portal && !!portalMenuRef.current?.contains(target)
      if (!insideTrigger && !insidePortalMenu) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open, portal])

  const handleTriggerClick = () => {
    if (!open && portal && triggerWrapRef.current) {
      const rect = triggerWrapRef.current.getBoundingClientRect()
      setPortalPos({ top: rect.bottom, left: rect.left, right: window.innerWidth - rect.right })
    }
    setOpen((v) => !v)
  }

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

  const menuItems = (
    <>
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
    </>
  )

  return (
    <div className="relative" ref={triggerWrapRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={handleTriggerClick}
        disabled={triggerDisabled}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && portal && portalPos &&
        createPortal(
          <div
            ref={portalMenuRef}
            style={{
              position: "fixed",
              top: portalPos.top + 4,
              ...(align === "right" ? { right: portalPos.right } : { left: portalPos.left }),
            }}
            className={cn(
              "z-50 min-w-[160px] rounded-md border bg-popover py-1 text-xs shadow-md",
              menuClassName
            )}
          >
            {menuItems}
          </div>,
          document.body
        )}
      {open && !portal && (
        <div
          className={cn(
            "absolute top-full z-50 mt-1 min-w-[160px] rounded-md border bg-popover py-1 text-xs shadow-md",
            align === "right" ? "right-0" : "left-0",
            menuClassName
          )}
        >
          {menuItems}
        </div>
      )}
    </div>
  )
}
