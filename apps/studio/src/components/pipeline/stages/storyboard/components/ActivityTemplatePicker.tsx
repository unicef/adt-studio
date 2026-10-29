import { useLingui } from "@lingui/react/macro"
import { i18n } from "@lingui/core"
import { Check, Eye, LayoutTemplate } from "lucide-react"
import { ACTIVITY_PRESETS } from "./activity-presets"
import { ActivityTemplateIllustration } from "./ActivityTemplateIllustration"
import { ActivityTemplatePreview } from "./ActivityTemplatePreview"

export function ActivityTemplatePicker({ selectedPreset, onSelect }: {
  selectedPreset: typeof ACTIVITY_PRESETS[number] | null
  onSelect: (preset: typeof ACTIVITY_PRESETS[number]) => void
}) {
  const { t } = useLingui()
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <fieldset className="min-w-0">
        <legend className="mb-3 text-sm font-semibold">{t`Choose a template`}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ACTIVITY_PRESETS.filter((preset) => preset.mode === "templated").map((preset) => (
            <button key={preset.key} type="button" aria-pressed={selectedPreset?.key === preset.key}
              onClick={() => onSelect(preset)}
              className="min-w-0 rounded-xl border p-2 text-left text-sm transition-colors hover:border-primary/50 hover:bg-muted/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-primary/5 aria-pressed:ring-1 aria-pressed:ring-primary motion-reduce:transition-none">
              <ActivityTemplateIllustration presetKey={preset.key} />
              <span className="mt-2 flex min-h-10 items-center justify-between gap-1 px-1 font-medium">
                {i18n._(preset.label)}
                {selectedPreset?.key === preset.key && <Check aria-hidden="true" className="size-4 shrink-0 text-primary" />}
              </span>
            </button>
          ))}
        </div>
      </fieldset>
      <section aria-label={t`Layout preview`} className="min-w-0 space-y-4 rounded-2xl border bg-muted/40 p-4 lg:sticky lg:top-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Eye aria-hidden="true" className="size-4" />{t`Layout preview`}</h2>
          {selectedPreset && <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium">{i18n._(selectedPreset.label)}</span>}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">{t`Layout example only. Your activity will use your page and instructions; the final content and appearance may differ.`}</p>
        {selectedPreset ? <ActivityTemplatePreview key={selectedPreset.key} presetKey={selectedPreset.key} /> : (
          <div className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-background p-6 text-center text-muted-foreground">
            <LayoutTemplate aria-hidden="true" className="size-12 text-primary/60" />
            <p className="max-w-64 text-sm">{t`Select a template to preview its layout.`}</p>
          </div>
        )}
      </section>
    </div>
  )
}
