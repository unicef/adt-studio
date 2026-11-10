import { Check, Loader2 } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import type { CaptionSaveState } from "./useCaptionEdits"

export function CaptionSaveTick({ state, onUndo }: { state: CaptionSaveState; onUndo: () => void }) {
  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground animate-in fade-in duration-200 motion-reduce:animate-none">
      {state === "saving" ? (
        <>
          <Loader2 aria-hidden className="size-3 animate-spin motion-reduce:animate-none" />
          <Trans>Saving…</Trans>
        </>
      ) : (
        <>
          <Check aria-hidden className="size-3 text-[var(--chrome-hex)]" strokeWidth={3} />
          <Trans>Saved</Trans>
          <button
            type="button"
            onClick={onUndo}
            className="rounded px-1 font-semibold text-foreground underline-offset-2 transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--chrome-hex)_45%,transparent)] focus-visible:outline-none"
          >
            <Trans>Undo</Trans>
          </button>
        </>
      )}
    </span>
  )
}
