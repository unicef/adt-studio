import { useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { BookOpen, Check, LayoutTemplate, PencilLine, Sparkles } from "lucide-react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ACTIVITY_PRESETS, AI_ACTIVITY_PRESETS } from "./activity-presets"
import { ActivityTemplatePicker } from "./ActivityTemplatePicker"

export type ActivityGenMode = "auto" | "templated" | "custom"

interface GenerateActivityDialogProps {
  anchorPageId: string
  anchorPageNumber: number
  onSubmit: (description: string, options: { inclusiveDesign: boolean; mode: ActivityGenMode }) => void
  onClose: () => void
}

export function GenerateActivityDialog({ anchorPageNumber, onSubmit, onClose }: GenerateActivityDialogProps) {
  const { t } = useLingui()
  const [descriptions, setDescriptions] = useState<Record<ActivityGenMode, string>>({ auto: "", templated: "", custom: "" })
  const [mode, setMode] = useState<ActivityGenMode>("auto")
  const [selectedPreset, setSelectedPreset] = useState<typeof ACTIVITY_PRESETS[number] | null>(null)
  const [selectedAiPreset, setSelectedAiPreset] = useState<string | null>(null)
  const description = descriptions[mode]
  const setDescription = (value: string) => setDescriptions((current) => ({ ...current, [mode]: value }))
  const canGenerate = !!description.trim() && (mode !== "templated" || selectedPreset !== null)
  const styles = [
    { value: "auto", label: t`Let AI choose the layout`, Icon: Sparkles },
    { value: "templated", label: t`Use a standard layout`, Icon: LayoutTemplate },
    { value: "custom", label: t`Create a custom layout`, Icon: PencilLine },
  ] as const

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100%-2rem)] max-w-6xl flex-col gap-3 overflow-hidden p-4 sm:p-6">
        <DialogTitle className="flex items-center gap-3 pr-10 text-xl"><LayoutTemplate aria-hidden="true" className="size-6 text-primary" />{t`Generate activity`}</DialogTitle>
        <DialogDescription>
          {t`Choose an activity style, then tell us what to create from your page.`}
        </DialogDescription>
        <div className="min-h-0 overflow-auto px-1 py-2">
          <fieldset className="mb-6">
            <legend className="mb-3 text-sm font-semibold">{t`Activity style`}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {styles.map(({ value, label, Icon }) => (
                <button key={value} type="button" aria-pressed={mode === value} aria-controls="activity-style-options"
                  onClick={() => setMode(value)}
                  className="flex min-h-16 items-center gap-3 rounded-xl border p-3 text-left text-sm font-medium hover:bg-muted/50 aria-pressed:border-primary aria-pressed:bg-primary/5 aria-pressed:ring-1 aria-pressed:ring-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                  <Icon aria-hidden="true" className="size-5 shrink-0 text-primary" />
                  <span className="flex-1">{label}</span>
                  {mode === value && <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />}
                </button>
              ))}
            </div>
          </fieldset>
          <div id="activity-style-options">
            {mode === "auto" && (
              <fieldset className="space-y-3">
                <legend className="mb-2 text-sm font-semibold">{t`What should AI create?`}</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {AI_ACTIVITY_PRESETS.map((preset) => {
                    const Icon = preset.key === "replicate" ? BookOpen : Sparkles
                    return (
                      <button key={preset.key} type="button" aria-label={i18n._(preset.label)} aria-pressed={selectedAiPreset === preset.key}
                        onClick={() => { setSelectedAiPreset(preset.key); setDescription(i18n._(preset.template)) }}
                        className="flex items-start gap-3 rounded-xl border p-4 text-left hover:bg-muted/50 aria-pressed:border-primary aria-pressed:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring">
                        <Icon aria-hidden="true" className="size-6 shrink-0 text-primary" />
                        <span className="flex-1 space-y-1">
                          <span className="block text-sm font-medium">{i18n._(preset.label)}</span>
                          <span className="block text-sm text-muted-foreground">{preset.key === "replicate" ? t`Adapt an existing exercise from this page.` : t`Create a new exercise from this page's content.`}</span>
                        </span>
                        {selectedAiPreset === preset.key && <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />}
                      </button>
                    )
                  })}
                </div>
                <p className="text-sm text-muted-foreground">{t`AI will choose the activity format and layout from your page and instructions.`}</p>
              </fieldset>
            )}
            {mode === "templated" && <ActivityTemplatePicker selectedPreset={selectedPreset} onSelect={(preset) => {
              setSelectedPreset(preset)
              setDescription(i18n._(preset.template))
            }} />}
            <div className="mt-6 space-y-4">
              <div>
                <label htmlFor="activity-description" className="mb-2 block text-sm font-semibold">{t`Describe the activity`}</label>
                <textarea id="activity-description" value={description} onChange={(event) => setDescription(event.target.value)}
                  placeholder={mode === "custom" ? t`Describe the content, layout, and how learners should interact with the activity.` : t`e.g. multiple-choice question about photosynthesis with 4 options`}
                  rows={mode === "custom" ? 6 : 3} className="w-full rounded-lg border bg-background p-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" />
              </div>
              <p className="text-sm text-muted-foreground">
                {t`All activities request keyboard access, alternatives to dragging, and feedback that does not rely on color. Review the generated activity before publishing.`}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">{t`Generate adds a new activity to page ${anchorPageNumber}. You can review and edit it afterwards.`}</p>
          <div className="flex shrink-0 justify-end gap-2">
            <Button variant="outline" className="min-h-11" onClick={onClose}>{t`Cancel`}</Button>
            <Button className="min-h-11" disabled={!canGenerate} onClick={() => {
              if (canGenerate) onSubmit(description.trim(), { inclusiveDesign: true, mode })
            }}>{t`Generate`}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
