import { Trans } from "@lingui/react/macro"
import { ArrowUpRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cleanPullRequestTitle } from "@/components/updates/beta/beta-version-utils"
import { openPullRequest, previewBuildMessage } from "@/components/updates/preview-build-message"
import { formatVersion } from "@/components/updates/release-banner-utils"
import type { PreviewBuildStatus } from "@/hooks/use-preview-build"
import { cn } from "@/lib/utils"

const TONE = {
  open: ["border-amber-400/40 bg-amber-500/[0.06]", "text-amber-600"],
  merged: ["border-emerald-400/40 bg-emerald-500/[0.06]", "text-emerald-600"],
  closed: ["border-border bg-muted/40", "text-muted-foreground"],
}

export function PreviewBuildBanner({
  status,
  onSwitch,
}: {
  status: PreviewBuildStatus
  onSwitch: (version: string) => void
}) {
  const { icon: Icon, title, body } = previewBuildMessage(status)
  const { title: prTitle, author } = status.pullRequest
  const target = status.latestBeta
  const [box, tone] = TONE[status.state]

  return (
    <div
      className={cn(
        "mb-3 flex shrink-0 flex-wrap items-center gap-4 rounded-2xl border px-5 py-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300",
        box,
      )}
    >
      <Icon className={cn("size-5 shrink-0", tone)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{title}</p>
        {prTitle && (
          <p className="mt-0.5 truncate text-[12.5px] text-foreground/80">
            {cleanPullRequestTitle(prTitle)}
            {author && <span className="text-muted-foreground"> · @{author}</span>}
          </p>
        )}
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">{body}</p>
      </div>
      <Button variant="ghost" size="sm" onClick={() => openPullRequest(status)}>
        <Trans>View PR</Trans>
        <ArrowUpRight className="size-3.5" />
      </Button>
      {target && (
        <Button
          variant={status.state === "open" ? "outline" : "default"}
          size="sm"
          onClick={() => onSwitch(target)}
        >
          <Trans>Switch to {formatVersion(target)}</Trans>
        </Button>
      )}
    </div>
  )
}
