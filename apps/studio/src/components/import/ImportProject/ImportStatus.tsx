import { useState } from "react"
import { Trans } from "@lingui/react/macro"
import { AlertCircle, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { FriendlyError } from "@/hooks/use-archive-error"
import { cn } from "@/lib/utils"

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
      <div className="flex min-h-[56px] items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-red-800 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-200">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{error.title}</p>
          {error.hint ? (
            <p className="mt-0.5 max-w-3xl text-xs leading-relaxed opacity-80">{error.hint}</p>
          ) : null}
          {rawError ? (
            <div className="mt-1.5 text-xs">
              <button
                type="button"
                onClick={() => setShowDetails(true)}
                aria-haspopup="dialog"
                className="inline-flex items-center gap-1 font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2"
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
            <p className="max-h-[50vh] overflow-auto break-words rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700">
              {rawError}
            </p>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}
