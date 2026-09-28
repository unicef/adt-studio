import { Trans } from "@lingui/react/macro"
import { GitPullRequest } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { previewPullRequestNumber } from "../release-banner-utils"

export function ReleaseKindBadge({ version, className }: { version: string; className?: string }) {
  const prNumber = previewPullRequestNumber(version)
  if (prNumber == null) return null

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 border-amber-400/50 bg-amber-500/5 text-[10px] text-amber-700 dark:text-amber-300",
        className,
      )}
    >
      <GitPullRequest className="size-3" />
      <Trans>Preview · #{prNumber}</Trans>
    </Badge>
  )
}
