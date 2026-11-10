import { Check, Loader2, TriangleAlert } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import type { RowSaveState } from "./useTranslationSave"

const LINK =
  "rounded px-1 font-semibold text-foreground underline-offset-2 transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)] focus-visible:outline-none"

export function RowSaveTick({ state, onUndo, onRetry }: { state: RowSaveState; onUndo: () => void; onRetry: () => void }) {
  return (
    <span role="status" className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground animate-in fade-in duration-200 motion-reduce:animate-none">
      {state === "saving" ? (
        <>
          <Loader2 aria-hidden className="size-3 animate-spin motion-reduce:animate-none" />
          <Trans>Saving…</Trans>
        </>
      ) : state === "failed" ? (
        <>
          <TriangleAlert aria-hidden className="size-3 text-destructive" />
          <span className="text-destructive">
            <Trans>Not saved</Trans>
          </span>
          <button type="button" onClick={onRetry} className={LINK}>
            <Trans>Try again</Trans>
          </button>
        </>
      ) : (
        <>
          <Check aria-hidden className="size-3 text-[var(--chrome-hex)]" strokeWidth={3} />
          <Trans>Saved</Trans>
          <button type="button" onClick={onUndo} className={LINK}>
            <Trans>Undo</Trans>
          </button>
        </>
      )}
    </span>
  )
}
