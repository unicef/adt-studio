import { Copy, Eye, EyeOff, Merge, MoreHorizontal, Trash2 } from "lucide-react"
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
}

/**
 * Reusable three-dot dropdown menu for section actions (merge, clone, delete, prune).
 * Used by SectioningOverview, SectionEditPanel, and the Sectioning screen.
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
          icon: isPruned ? Eye : EyeOff,
          label: isPruned ? t`Include in render` : t`Exclude from render`,
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
          label: t`Delete`,
          onClick: onDelete,
          danger: true,
          disabled,
        },
      ]}
    />
  )
}
