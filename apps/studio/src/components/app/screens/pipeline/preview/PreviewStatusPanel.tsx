import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, RotateCcw } from "lucide-react"

export interface PreviewStatusPanelProps {
  error: string
  onRetry: () => void
}

export function PreviewStatusPanel({ error, onRetry }: PreviewStatusPanelProps) {
  const { t } = useLingui()

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/40 px-6">
      <div className="w-[440px] overflow-hidden rounded-2xl border bg-card shadow-[0_24px_60px_-30px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-bold tracking-[-0.01em]">
              <Trans>Preview could not be built</Trans>
            </span>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{error}</p>
          </div>
        </div>

        <div className="border-t px-4 py-3.5">
          <button
            type="button"
            onClick={onRetry}
            title={t`Build the preview again`}
            className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12.5px] font-medium transition-colors hover:bg-muted"
          >
            <RotateCcw className="size-3.5" />
            <Trans>Try again</Trans>
          </button>
        </div>
      </div>
    </div>
  )
}
