import { useState, useRef, useEffect } from "react"
import {
  Copy,
  Eye,
  EyeOff,
  Merge,
  MoreHorizontal,
  Trash2,
} from "lucide-react"
import { useLingui } from "@lingui/react/macro"

export interface SectionActionsDropdownProps {
  sectionIndex: number
  sectionCount: number
  isPruned: boolean
  hasPrevPage?: boolean
  hasNextPage?: boolean
  onTogglePrune: () => void
  onMerge: (direction: "prev" | "next") => void
  onMergeCrossPage?: (direction: "prev" | "next") => void
  onClone: () => void
  onDelete: () => void
  /** Called before destructive merge actions to show confirmation. If not provided, merges fire immediately. */
  onConfirmMerge?: (label: string, action: () => void) => void
  disabled: boolean
  /** Message shown at the top of the menu while disabled. */
  disabledReason?: string
  /** Overrides `disabled` for the prune toggle (a local edit on some screens). */
  pruneDisabled?: boolean
}

/**
 * Reusable three-dot dropdown menu for section actions (merge, clone, delete, prune).
 * Used by both SectioningOverview and SectionEditPanel.
 */
export function SectionActionsDropdown({
  sectionIndex,
  sectionCount,
  isPruned,
  hasPrevPage,
  hasNextPage,
  onTogglePrune,
  onMerge,
  onMergeCrossPage,
  onClone,
  onDelete,
  onConfirmMerge,
  disabled,
  disabledReason,
  pruneDisabled,
}: SectionActionsDropdownProps) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const handleAction = (action: () => void) => {
    setOpen(false)
    action()
  }

  const wrapMerge = (label: string, action: () => void) => {
    if (onConfirmMerge) {
      handleAction(() => onConfirmMerge(label, action))
    } else {
      handleAction(action)
    }
  }

  const canMergePrev = sectionIndex > 0
  const canMergeNext = sectionIndex < sectionCount - 1
  const canMergeCrossPagePrev = !canMergePrev && !!hasPrevPage && !!onMergeCrossPage
  const canMergeCrossPageNext = !canMergeNext && !!hasNextPage && !!onMergeCrossPage

  return (
    <div className="relative" ref={menuRef} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer"
      >
        <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-md border bg-popover py-1 text-xs shadow-md">
          {disabled && (
            <p className="px-3 py-1.5 text-[10px] text-muted-foreground italic">{disabledReason ?? t`Actions disabled while storyboard is running`}</p>
          )}
          <button
            type="button"
            onClick={() => handleAction(onTogglePrune)}
            disabled={pruneDisabled ?? disabled}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent transition-colors disabled:opacity-30"
          >
            {isPruned ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {isPruned ? t`Include in render` : t`Exclude from render`}
          </button>
          <div className="my-1 border-t" />
          {canMergePrev && (
            <button
              type="button"
              onClick={() => wrapMerge(t`merge with previous section`, () => onMerge("prev"))}
              disabled={disabled}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent transition-colors disabled:opacity-30"
            >
              <Merge className="h-3.5 w-3.5" />
              {t`Merge with previous`}
            </button>
          )}
          {canMergeCrossPagePrev && (
            <button
              type="button"
              onClick={() => wrapMerge(t`merge this section into the last section of the previous page`, () => onMergeCrossPage!("prev"))}
              disabled={disabled}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent transition-colors disabled:opacity-30"
            >
              <Merge className="h-3.5 w-3.5" />
              {t`Merge with last section of previous page`}
            </button>
          )}
          {canMergeNext && (
            <button
              type="button"
              onClick={() => wrapMerge(t`merge with next section`, () => onMerge("next"))}
              disabled={disabled}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent transition-colors disabled:opacity-30"
            >
              <Merge className="h-3.5 w-3.5 rotate-180" />
              {t`Merge with next`}
            </button>
          )}
          {canMergeCrossPageNext && (
            <button
              type="button"
              onClick={() => wrapMerge(t`merge this section into the first section of the next page`, () => onMergeCrossPage!("next"))}
              disabled={disabled}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent transition-colors disabled:opacity-30"
            >
              <Merge className="h-3.5 w-3.5 rotate-180" />
              {t`Merge with first section of next page`}
            </button>
          )}
          <button
            type="button"
            onClick={() => handleAction(onClone)}
            disabled={disabled}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-accent transition-colors disabled:opacity-30"
          >
            <Copy className="h-3.5 w-3.5" />
            {t`Duplicate`}
          </button>
          <div className="my-1 border-t" />
          <button
            type="button"
            onClick={() => handleAction(onDelete)}
            disabled={disabled}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-30"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t`Delete`}
          </button>
        </div>
      )}
    </div>
  )
}
