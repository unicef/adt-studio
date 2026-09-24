import { useState } from "react"
import { Trans } from "@lingui/react/macro"
import { AlertCircle } from "lucide-react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { FriendlyError } from "@/hooks/use-archive-error"

export function ImportStatus({
  error,
  rawError,
}: {
  error: FriendlyError
  rawError: string | null
}) {
  const [showDetails, setShowDetails] = useState(false)

  return (
    <div aria-live="polite">
      <div className="flex min-h-[56px] items-start gap-3 rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-2.5 text-red-800 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200 dark:text-red-200">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{error.title}</p>
          {error.hint ? (
            <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-pretty opacity-80">{error.hint}</p>
          ) : null}
          {rawError ? (
            <div className="mt-1.5 text-xs">
              <button
                type="button"
                onClick={() => setShowDetails(true)}
                aria-haspopup="dialog"
                className="inline-flex min-h-6 items-center gap-1 rounded-sm font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Trans>Show error details</Trans>
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {rawError ? (
        <Dialog open={showDetails} onOpenChange={setShowDetails}>
          <DialogContent className="max-w-xl">
            <DialogHeader className="space-y-3">
              <DialogTitle><Trans>Error details</Trans></DialogTitle>
              <DialogDescription>{error.hint}</DialogDescription>
            </DialogHeader>
            <p className="max-h-[50vh] overflow-auto break-words rounded-lg border border-border bg-muted p-4 font-mono text-xs leading-relaxed text-foreground">
              {rawError}
            </p>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}
