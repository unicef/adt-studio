import { Trans } from "@lingui/react/macro"
import { Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AvailableRelease } from "@/hooks/use-update-status"

interface BetaVersionActionsProps {
  release?: AvailableRelease
  preparing: boolean
  checking: boolean
  onClose: () => void
  onInstall: () => void
}

export function BetaVersionActions({
  release,
  preparing,
  checking,
  onInstall,
}: BetaVersionActionsProps) {
  if (release?.direction === "current") return null

  return (
    <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-3">
      {release && (
        <Button onClick={onInstall} disabled={preparing || checking}>
          {preparing ? (
            <Loader2 className="animate-spin motion-reduce:animate-none" />
          ) : (
            <Download />
          )}
          {preparing ? (
            <Trans>Preparing…</Trans>
          ) : release.direction === "downgrade" ? (
            <Trans>Install older version</Trans>
          ) : (
            <Trans>Install update</Trans>
          )}
        </Button>
      )}
    </div>
  )
}
