import { Trans, useLingui } from "@lingui/react/macro"
import { GitBranch, GitPullRequest } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { previewPullRequestNumber } from "../release-banner-utils"

/**
 * Marks a pull-request preview build. Names the branch it was built from when
 * known — easier to recognise than a PR number — and falls back to the number.
 */
export function ReleaseKindBadge({
  version,
  branch,
  className,
}: {
  version: string
  branch?: string
  className?: string
}) {
  const { t } = useLingui()
  const prNumber = previewPullRequestNumber(version)
  if (prNumber == null) return null

  return (
    <Badge
      variant="outline"
      title={
        branch
          ? t`Preview build of PR #${prNumber} from ${branch}`
          : t`Preview build of PR #${prNumber}`
      }
      className={cn(
        "min-w-0 max-w-full gap-1 border-amber-400/50 bg-amber-500/5 text-[10px] text-amber-700 dark:text-amber-300",
        className,
      )}
    >
      {branch ? (
        <>
          <GitBranch className="size-3 shrink-0" />
          <span className="truncate">
            <Trans>Preview · {branch}</Trans>
          </span>
        </>
      ) : (
        <>
          <GitPullRequest className="size-3 shrink-0" />
          <Trans>Preview · #{prNumber}</Trans>
        </>
      )}
    </Badge>
  )
}
