import { useState, type ReactNode, type CSSProperties } from "react"
import { Pencil, Plus, Sparkles } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

/**
 * Tile + modal editor for a free-form "Custom Instructions" field. Renders a
 * dashed empty-state button when no content exists, or a quiet preview card
 * (clamped to 3 lines) when filled — clicking either opens a focused modal
 * with a 12-row textarea, an Auto-fill action, and Cancel/Save buttons.
 *
 * `compose` produces a string from book context (title, summary, language,
 * etc.) that fills the draft when the user taps Auto-fill. Pass `accentHex`
 * so the dialog wears the stage's accent color (Save button, focus rings).
 */
export function CustomInstructionsField({
  value,
  onChange,
  compose,
  canAutoFill,
  accentHex,
  dialogDescription,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  compose: () => string
  canAutoFill: boolean
  accentHex: string
  dialogDescription: ReactNode
  placeholder: string
}) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")

  const openEditor = () => {
    setDraft(value)
    setOpen(true)
  }

  const handleAutoFill = () => {
    const composed = compose()
    if (!composed) return
    setDraft(composed)
  }

  const handleSave = () => {
    onChange(draft)
    setOpen(false)
  }

  const dialogStyle = {
    "--accent-color": accentHex,
    "--ring": accentHex,
  } as CSSProperties

  return (
    <>
      {value.trim() ? (
        <button
          type="button"
          onClick={openEditor}
          className="group flex w-full items-start gap-3 rounded-md border border-border bg-card px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-ring/40"
        >
          <p className="line-clamp-3 flex-1 text-[12.5px] leading-relaxed text-foreground">
            {value}
          </p>
          <Pencil
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
            strokeWidth={2}
            aria-hidden
          />
        </button>
      ) : (
        <button
          type="button"
          onClick={openEditor}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-muted px-3 py-3 text-[12px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-ring/40"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          <Trans>Add custom instructions</Trans>
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent style={dialogStyle}>
          <DialogHeader>
            <DialogTitle>{t`Custom Instructions`}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={12}
              placeholder={placeholder}
              className="flex-1 resize-none text-[13px] leading-relaxed"
              autoFocus
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={!canAutoFill}
              onClick={handleAutoFill}
              title={t`Auto-fill from book context`}
              aria-label={t`Auto-fill from book context`}
              className="shrink-0 text-muted-foreground hover:text-[var(--accent-color,#525252)]"
            >
              <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t`Cancel`}
            </Button>
            <Button
              onClick={handleSave}
              style={{ backgroundColor: accentHex }}
              className="border-0 text-white hover:brightness-95"
            >
              {t`Save`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
