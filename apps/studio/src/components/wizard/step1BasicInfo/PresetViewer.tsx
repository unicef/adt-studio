import { RotateCcw } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { useStore } from "@tanstack/react-form"
import { useWizard } from "@/components/wizard"
import { useWizardForm } from "@/components/wizard/wizardForm"
import { PRESETS, getPresetAccent } from "@/components/wizard/constants"

export function PresetViewer() {
  const { i18n } = useLingui()
  const { setCurrentStep } = useWizard()
  const form = useWizardForm()
  const selectedPreset = useStore(form.store, (s) => s.values.selectedPreset)
  const preset = PRESETS.find((p) => p.id === selectedPreset)
  const accent = getPresetAccent(selectedPreset)

  if (!preset) return null

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground">
          <Trans>Preset</Trans>
        </label>
        <button
          type="button"
          onClick={() => setCurrentStep(0)}
          className="flex items-center gap-1.5 text-xs font-medium transition-[color,opacity] duration-300 cursor-pointer hover:underline hover:opacity-80"
          style={{ color: accent.text }}
        >
          <RotateCcw className="h-3 w-3" />
          <Trans>Change Preset</Trans>
        </button>
      </div>

      <div className="flex items-center gap-3 border border-border rounded-lg p-1">
        <div
          className={`flex items-center justify-center shrink-0 rounded overflow-hidden w-[97px] h-[80px] ${preset.bgColor}`}
        >
          {preset.id === "custom" ? (
            <preset.Icon className={`size-10 ${preset.iconColor} opacity-60`} strokeWidth={1.5} />
          ) : (
            <preset.Icon className="w-full h-full" />
          )}
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-0 px-2 py-1">
          <p className="text-sm font-bold text-foreground">{i18n._(preset.title)}</p>
          <p className="text-xs text-muted-foreground leading-5 line-clamp-2">{i18n._(preset.description)}</p>
        </div>
      </div>
    </div>
  )
}
