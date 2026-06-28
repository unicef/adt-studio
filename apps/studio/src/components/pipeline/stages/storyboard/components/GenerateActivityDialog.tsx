import { useState } from "react"
import { Sparkles, X } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import { i18n } from "@lingui/core"

export type ActivityGenMode = "auto" | "templated" | "custom"

interface GenerateActivityDialogProps {
  /** The anchor page the new activity section will be appended to. */
  anchorPageId: string
  anchorPageNumber: number
  onSubmit: (
    description: string,
    options: { inclusiveDesign: boolean; mode: ActivityGenMode },
  ) => void
  onClose: () => void
}

const PRESETS: Array<{
  key: string
  label: ReturnType<typeof msg>
  template: ReturnType<typeof msg>
}> = [
  {
    key: "multiple-choice",
    label: msg`Multiple choice`,
    template: msg`Generate a 4-option multiple-choice question testing comprehension of this page.`,
  },
  {
    key: "fill-in-the-blank",
    label: msg`Fill in the blank`,
    template: msg`Generate a fill-in-the-blank activity with 3 sentences based on this page.`,
  },
  {
    key: "true-false",
    label: msg`True / false`,
    template: msg`Generate 3 true/false statements about the content of this page.`,
  },
  {
    key: "open-ended",
    label: msg`Open-ended question`,
    template: msg`Generate an open-ended reflection question about this page.`,
  },
]

/**
 * "Generate a new activity based on this page." A textarea + a few quick-fill
 * presets. On submit, the dialog closes and the parent kicks off the agent
 * call. Progress flows back through the existing task surface.
 */
export function GenerateActivityDialog({
  anchorPageId,
  anchorPageNumber,
  onSubmit,
  onClose,
}: GenerateActivityDialogProps) {
  const { t } = useLingui()
  const [description, setDescription] = useState("")
  const [inclusiveDesign, setInclusiveDesign] = useState(true)
  const [mode, setMode] = useState<ActivityGenMode>("auto")

  const STYLE_OPTIONS: Array<{
    value: ActivityGenMode
    label: string
    hint: string
  }> = [
    { value: "auto", label: t`Auto`, hint: t`Let the agent choose` },
    {
      value: "templated",
      label: t`Templated`,
      hint: t`Standard built-in activity types`,
    },
    {
      value: "custom",
      label: t`Custom`,
      hint: t`Bespoke, freeform interactive activity`,
    },
  ]

  const canSubmit = description.trim().length > 0

  const handleSubmit = () => {
    if (!canSubmit) return
    onSubmit(description.trim(), { inclusiveDesign, mode })
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-8">
      <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden max-h-[80vh]">
        <div className="flex items-center justify-between px-5 py-3.5 border-b shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-600" />
            <h2 className="text-sm font-semibold">{t`Generate activity`}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-muted transition-colors"
            aria-label={t`Close`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5 space-y-4">
          <p className="text-xs text-muted-foreground">
            {t`A new activity section will be appended to page ${anchorPageNumber} (${anchorPageId}). The agent may read other pages in the book to mirror their layout.`}
          </p>

          <div>
            <label className="block text-[11px] font-medium text-muted-foreground mb-1.5">
              {t`Describe the activity`}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t`e.g. multiple-choice question about photosynthesis with 4 options`}
              rows={5}
              autoFocus
              className="w-full text-xs border rounded-md px-2 py-1.5 resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50"
            />
          </div>

          <div>
            <div className="text-[11px] font-medium text-muted-foreground mb-1.5">
              {t`Activity style`}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {STYLE_OPTIONS.map((opt) => {
                const active = mode === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMode(opt.value)}
                    aria-pressed={active}
                    title={opt.hint}
                    className={`flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left transition-colors ${
                      active
                        ? "border-violet-500 bg-violet-50 dark:bg-violet-950/40"
                        : "border-input hover:bg-muted/60"
                    }`}
                  >
                    <span className="text-xs font-medium">{opt.label}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight">
                      {opt.hint}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-medium text-muted-foreground mb-1.5">
              {t`Quick fill`}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setDescription(i18n._(p.template))}
                  className="px-2 py-1 text-[11px] rounded-full bg-muted hover:bg-muted/70 transition-colors"
                >
                  {i18n._(p.label)}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={inclusiveDesign}
              onChange={(e) => setInclusiveDesign(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-input text-violet-600 focus-visible:ring-2 focus-visible:ring-violet-500/50"
            />
            <span className="flex-1">
              <span className="block text-xs font-medium">
                {t`Inclusive design`}
              </span>
              <span className="block text-[11px] text-muted-foreground mt-0.5">
                {t`Adds Universal Design for Learning guidance (plain language, keyboard + click fallback for drag, aria-live grading, no color-only feedback). Turn off to compare output without this guidance.`}
              </span>
            </span>
          </label>
        </div>

        <div className="px-5 py-3 border-t flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-md hover:bg-muted transition-colors"
          >
            {t`Cancel`}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="px-3 py-1.5 text-xs rounded-md bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {t`Generate`}
          </button>
        </div>
      </div>
    </div>
  )
}
