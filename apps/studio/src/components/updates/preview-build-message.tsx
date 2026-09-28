import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import { GitMerge, GitPullRequest, GitPullRequestClosed, PackageCheck, type LucideIcon } from "lucide-react"
import type { PreviewBuildStatus } from "@/hooks/use-preview-build"
import { formatVersion } from "./release-banner-utils"

export interface PreviewBuildMessage {
  icon: LucideIcon
  title: ReactNode
  body: ReactNode
}

export function previewBuildMessage(status: PreviewBuildStatus): PreviewBuildMessage {
  const pr = status.pullRequest.number
  if (status.state === "closed") {
    return {
      icon: GitPullRequestClosed,
      title: <Trans>PR #{pr} was closed without merging</Trans>,
      body: <Trans>Switch back to the latest beta to keep getting updates.</Trans>,
    }
  }
  if (status.state === "merged" && status.shippedIn) {
    const shippedIn = formatVersion(status.shippedIn)
    return {
      icon: PackageCheck,
      title: <Trans>PR #{pr} shipped in {shippedIn}</Trans>,
      body: <Trans>Switch to the beta to keep getting updates.</Trans>,
    }
  }
  if (status.state === "merged") {
    return {
      icon: GitMerge,
      title: <Trans>PR #{pr} was merged</Trans>,
      body: <Trans>It will arrive in the next beta.</Trans>,
    }
  }
  return {
    icon: GitPullRequest,
    title: <Trans>You're on a preview of PR #{pr}</Trans>,
    body: <Trans>Preview builds don't get update notices. This page tells you when the PR merges or closes.</Trans>,
  }
}

export function openPullRequest(status: PreviewBuildStatus) {
  window.open(status.pullRequest.url, "_blank", "noopener,noreferrer")
}
