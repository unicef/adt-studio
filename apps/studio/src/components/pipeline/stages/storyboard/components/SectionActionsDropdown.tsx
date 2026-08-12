import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, Merge, MoreHorizontal, Trash2 } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { ActionMenu } from "@/components/ui/action-menu"

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
  /**
   * Reading-order moves. Omitted on screens that list sections in source-PDF
   * order, where a move would change the book without moving the row — the
   * control has to sit where its effect is visible.
   */
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
}

/**
 * Reusable three-dot dropdown menu for section actions.
 * Used by SectioningOverview, SectionEditPanel, and the Sectioning screen.
 *
 * Two different removals, deliberately worded so the reversible one is the
 * obvious choice. "Remove from book" only hides the page: it keeps its slot in
 * the reading order and all of its content, so adding it back restores it
 * exactly where it was. "Delete permanently" destroys the section. Both used to
 * read as plain removals — "Exclude from render" and "Delete" — which pushed
 * users towards the destructive one for a job the reversible one does.
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
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: SectionActionsDropdownProps) {
  const { t } = useLingui()

  const canMergePrev = sectionIndex > 0
  const canMergeNext = sectionIndex < sectionCount - 1
  const canMergeCrossPagePrev = !canMergePrev && !!hasPrevPage && !!onMergeCrossPage
  const canMergeCrossPageNext = !canMergeNext && !!hasNextPage && !!onMergeCrossPage

  const confirmable = (label: string, action: () => void) => () => {
    if (onConfirmMerge) onConfirmMerge(label, action)
    else action()
  }

  return (
    <ActionMenu
      trigger={<MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />}
      triggerClassName="p-0.5 rounded hover:bg-accent transition-colors cursor-pointer"
      triggerAriaLabel={t`Section actions`}
      menuClassName="min-w-[200px]"
      note={
        disabled ? (
          <p className="px-3 py-1.5 text-[10px] text-muted-foreground italic">
            {disabledReason ?? t`Actions disabled while storyboard is running`}
          </p>
        ) : undefined
      }
      items={[
        {
          icon: ArrowUp,
          label: t`Move up`,
          onClick: () => onMoveUp?.(),
          hidden: !onMoveUp,
          disabled: disabled || !canMoveUp,
        },
        {
          icon: ArrowDown,
          label: t`Move down`,
          onClick: () => onMoveDown?.(),
          hidden: !onMoveDown,
          disabled: disabled || !canMoveDown,
        },
        // Collapses on its own when both moves are hidden.
        { separator: true },
        {
          icon: isPruned ? Eye : EyeOff,
          label: isPruned ? t`Add back to book` : t`Remove from book`,
          onClick: onTogglePrune,
          disabled: pruneDisabled ?? disabled,
        },
        { separator: true },
        {
          icon: Merge,
          label: t`Merge with previous`,
          onClick: confirmable(t`merge with previous section`, () => onMerge("prev")),
          hidden: !canMergePrev,
          disabled,
        },
        {
          icon: Merge,
          label: t`Merge with last section of previous page`,
          onClick: confirmable(
            t`merge this section into the last section of the previous page`,
            () => onMergeCrossPage!("prev")
          ),
          hidden: !canMergeCrossPagePrev,
          disabled,
        },
        {
          icon: Merge,
          iconClassName: "rotate-180",
          label: t`Merge with next`,
          onClick: confirmable(t`merge with next section`, () => onMerge("next")),
          hidden: !canMergeNext,
          disabled,
        },
        {
          icon: Merge,
          iconClassName: "rotate-180",
          label: t`Merge with first section of next page`,
          onClick: confirmable(
            t`merge this section into the first section of the next page`,
            () => onMergeCrossPage!("next")
          ),
          hidden: !canMergeCrossPageNext,
          disabled,
        },
        {
          icon: Copy,
          label: t`Duplicate`,
          onClick: onClone,
          disabled,
        },
        { separator: true },
        {
          icon: Trash2,
          label: t`Delete permanently`,
          onClick: onDelete,
          danger: true,
          disabled,
        },
      ]}
    />
  )
}
