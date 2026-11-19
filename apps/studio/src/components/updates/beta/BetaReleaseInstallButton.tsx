import { Trans } from "@lingui/react/macro"
import { Check, Download, Loader2, TriangleAlert } from "lucide-react"
import { useState } from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import type { AvailableRelease } from "@/hooks/use-update-status"
import { formatVersion, previewPullRequestNumber } from "../release-banner-utils"
import { showsDirection } from "./beta-version-utils"

interface BetaReleaseInstallButtonProps {
  release: AvailableRelease
  currentVersion?: string | null
  preparing: boolean
  checking: boolean
  onInstall: () => void
}

/** Compares the X.Y.Z of two versions, ignoring any prerelease; 0 when either can't be read. */
function compareCore(a: string, b: string): number {
  const core = (version: string) => /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim())?.slice(1).map(Number)
  const left = core(a)
  const right = core(b)
  if (!left || !right) return 0
  for (let index = 0; index < 3; index++) {
    if (left[index] !== right[index]) return left[index] - right[index]
  }
  return 0
}

export function BetaReleaseInstallButton({
  release,
  currentVersion,
  preparing,
  checking,
  onInstall,
}: BetaReleaseInstallButtonProps) {
  const [open, setOpen] = useState(false)

  if (release.direction === "current") {
    return (
      <Button variant="outline" disabled>
        <Check />
        <Trans>Installed</Trans>
      </Button>
    )
  }

  /** Older/newer only means something on the same track: a preview ranks below every numbered
   *  beta of its X.Y.Z, so against a beta (or another PR's preview) "downgrade" says nothing —
   *  unless the preview really is built on an older X.Y.Z, where the books warning still applies. */
  const sameTrack = showsDirection(release, currentVersion)
  const olderCore = compareCore(release.version, currentVersion ?? "") < 0
  const downgrade = release.direction === "downgrade" && (sameTrack || olderCore)
  const previewPr = previewPullRequestNumber(release.version)
  const otherPreview = previewPr != null && !sameTrack
  const confirm = downgrade || otherPreview

  const button = (
    <Button
      variant={confirm ? "outline" : "default"}
      disabled={preparing || checking}
      onClick={confirm ? undefined : onInstall}
      aria-live="polite"
    >
      {preparing ? (
        <Loader2 className="animate-spin motion-reduce:animate-none" />
      ) : (
        <Download />
      )}
      {preparing ? (
        <Trans>Preparing…</Trans>
      ) : otherPreview ? (
        <Trans>Install preview</Trans>
      ) : downgrade ? (
        <Trans>Install older version</Trans>
      ) : (
        <Trans>Install update</Trans>
      )}
    </Button>
  )

  if (!confirm) {
    return button
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 border-border bg-popover p-4 text-popover-foreground shadow-lg"
      >
        <div className="flex gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-500">
            <TriangleAlert className="size-4.5" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {otherPreview ? (
                <Trans>Install a preview build?</Trans>
              ) : (
                <Trans>Install an older beta?</Trans>
              )}
            </p>
            {otherPreview && (
              <p className="mt-1 text-pretty text-xs leading-5 text-muted-foreground">
                <Trans>
                  This is a preview of PR #{previewPr}. You'll get new builds of
                  this PR as updates, and Versions tells you when the PR merges
                  or closes.
                </Trans>
              </p>
            )}
            {downgrade && (
              <p className="mt-1 text-pretty text-xs leading-5 text-muted-foreground">
                <Trans>
                  You are about to install {formatVersion(release.version)}.
                  Books or settings edited with a newer version may not work as
                  expected. Back up your books before continuing.
                </Trans>
              </p>
            )}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            <Trans>Cancel</Trans>
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setOpen(false)
              onInstall()
            }}
          >
            {otherPreview ? (
              <Trans>Install preview</Trans>
            ) : downgrade ? (
              <Trans>Install older version</Trans>
            ) : (
              <Trans>Install update</Trans>
            )}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
