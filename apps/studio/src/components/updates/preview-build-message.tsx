import type { ReactNode } from "react"
import { Trans } from "@lingui/react/macro"
import {
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  PackageCheck,
  PackageX,
  type LucideIcon,
} from "lucide-react"
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
  if (status.removed) {
    return {
      icon: PackageX,
      title: <Trans>The preview of PR #{pr} was removed</Trans>,
      body: <Trans>It won't get new builds. Switch back to the latest beta to keep getting updates.</Trans>,
    }
  }
  return {
    icon: GitPullRequest,
    title: <Trans>You're on a preview of PR #{pr}</Trans>,
    body: <Trans>You'll get new builds of this PR as updates. This page tells you when the PR merges or closes.</Trans>,
  }
}

export function openPullRequest(status: PreviewBuildStatus) {
  window.open(status.pullRequest.url, "_blank", "noopener,noreferrer")
}
