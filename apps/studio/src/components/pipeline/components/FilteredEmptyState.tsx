import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { StageEmptyState, type EmptyStateColor } from "./StageEmptyState"

interface FilteredEmptyStateProps {
  icon: LucideIcon
  color: EmptyStateColor
  title: ReactNode
  subtitle?: ReactNode
  /**
   * When provided, renders a reset link that clears the active search/filters.
   * Omit it for the "nothing exists yet" case (no filters to clear).
   */
  onClear?: () => void
  clearLabel?: ReactNode
}

/**
 * Empty state for a filtered or searched list that matched nothing. Wraps
 * {@link StageEmptyState} with the shared "clear" reset affordance so every
 * stage's "no results" view looks and behaves identically.
 */
export function FilteredEmptyState({
  icon,
  color,
  title,
  subtitle,
  onClear,
  clearLabel,
}: FilteredEmptyStateProps) {
  return (
    <StageEmptyState
      icon={icon}
      color={color}
      title={title}
      subtitle={subtitle}
      cta={
        onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium text-muted-foreground hover:text-foreground hover:underline transition-colors cursor-pointer"
          >
            {clearLabel ?? <Trans>Clear filters</Trans>}
          </button>
        ) : undefined
      }
    />
  )
}
