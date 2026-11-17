import { Trans, useLingui } from "@lingui/react/macro"
import { Check, Loader2, RotateCcw, Undo2 } from "lucide-react"
import { hasReaderUiCustomization } from "@adt/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ReaderUiDraft } from "../hooks/use-reader-ui-draft"
import { READER_STEP_ACCENT } from "../lib/accent"

interface SaveBarProps {
  draft: ReaderUiDraft
  className?: string
  /** Stack vertically (narrow panels) instead of one row. */
  layout?: "row" | "stack"
}

/** Unsaved-state indicator with Discard / Reset / Save. */
export function SaveBar({ draft, className, layout = "row" }: SaveBarProps) {
  const { t } = useLingui()
  const customized = hasReaderUiCustomization(draft.value)

  return (
    <div className={cn("flex gap-2", layout === "stack" ? "flex-col" : "items-center", className)}>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
        {draft.dirty ? (
          <>
            <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
            <Trans>Unsaved changes</Trans>
          </>
        ) : (
          <>
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
            {customized ? <Trans>Saved to this book</Trans> : <Trans>Using the default reader</Trans>}
          </>
        )}
      </div>
      {draft.saveError ? <p className="text-xs text-red-600">{draft.saveError}</p> : null}
      <div className="flex items-center gap-1.5">
        {draft.dirty ? (
          <Button size="sm" variant="ghost" onClick={draft.discard} title={t`Discard unsaved changes`}>
            <Undo2 className="mr-1 h-3.5 w-3.5" />
            <Trans>Discard</Trans>
          </Button>
        ) : null}
        {customized ? (
          <Button size="sm" variant="ghost" onClick={draft.resetToDefaults} title={t`Back to the default reader`}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            <Trans>Reset</Trans>
          </Button>
        ) : null}
        <Button
          size="sm"
          disabled={!draft.dirty || draft.isSaving}
          onClick={draft.save}
          className="text-white"
          style={{ background: READER_STEP_ACCENT }}
        >
          {draft.isSaving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          <Trans>Save</Trans>
        </Button>
      </div>
    </div>
  )
}
