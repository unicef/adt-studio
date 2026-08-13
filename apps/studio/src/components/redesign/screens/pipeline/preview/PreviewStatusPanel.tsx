import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, Eye, Loader2, RotateCcw } from "lucide-react"
import { tint } from "@/components/redesign/screens/pipeline/shared/plugins"

export interface PreviewStatusPanelProps {
  hex: string
  error: string | null
  onRetry: () => void
}

/** Occupies the canvas while the bundle is being built, or when it failed. */
export function PreviewStatusPanel({ hex, error, onRetry }: PreviewStatusPanelProps) {
  const { t } = useLingui()

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/20 px-6">
      <div
        className="w-[440px] overflow-hidden rounded-2xl border bg-card shadow-[0_24px_60px_-30px_rgba(0,0,0,0.35)]"
        style={{ borderColor: tint(hex, 0.35) }}
      >
        <div className="flex items-center gap-3 px-4 py-3.5" style={{ background: tint(hex, 0.08) }}>
          <span
            className="grid size-9 shrink-0 place-items-center rounded-full text-white"
            style={{ background: error ? "#dc2626" : hex }}
          >
            {error ? <AlertTriangle className="size-4.5" /> : <Eye className="size-4.5" strokeWidth={2.4} />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {!error && <Loader2 className="size-3.5 shrink-0 animate-spin" style={{ color: hex }} />}
              <span className="truncate text-[14px] font-bold tracking-[-0.01em]">
                {error ? <Trans>Preview could not be built</Trans> : <Trans>Building the preview</Trans>}
              </span>
            </div>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
              {error ?? (
                <Trans>
                  Packaging the book so the preview shows exactly what the reader gets.
                </Trans>
              )}
            </p>
          </div>
        </div>

        {error && (
          <div className="px-4 py-3.5">
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
        )}
      </div>
    </div>
  )
}
