import { useStore } from "@tanstack/react-form"
import { useWizardForm } from "../core/wizardForm"
import { PRESET_RECOMMENDATIONS, type PresetRecommendations } from "../core/constants"

export function usePresetRecommendations(): PresetRecommendations {
  const form = useWizardForm()
  const selectedPresetId = useStore(form.store, (s) => s.values.selectedPreset)
  if (!selectedPresetId) return {}
  return PRESET_RECOMMENDATIONS[selectedPresetId as keyof typeof PRESET_RECOMMENDATIONS] ?? {}
}
