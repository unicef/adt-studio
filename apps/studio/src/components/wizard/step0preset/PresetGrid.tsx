import { useState } from "react"
import { PRESETS, type PresetId } from "@/components/wizard/constants"
import { PresetCard } from "./PresetCard"
import { ExamplesModal } from "./ExamplesModal"
import { hasAvailableExamples } from "./exampleAvailability"

interface PresetGridProps {
  selected: PresetId | null
  onSelect: (id: PresetId) => void
}

export function PresetGrid({ selected, onSelect }: PresetGridProps) {
  const [examplesPresetId, setExamplesPresetId] = useState<PresetId | null>(null)

  const examplesPreset = examplesPresetId
    ? PRESETS.find((p) => p.id === examplesPresetId) ?? null
    : null
  const canShowExamples =
    examplesPreset !== null && hasAvailableExamples(examplesPreset)

  return (
    <>
      <div
        role="radiogroup"
        aria-labelledby="preset-step-heading"
        className="w-full max-w-[1280px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 px-4 sm:px-6 overflow-auto py-1"
      >
        {PRESETS.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            selected={selected === preset.id}
            radioName="wizard-preset"
            onSelect={onSelect}
            onShowExamples={setExamplesPresetId}
          />
        ))}
      </div>

      {examplesPreset && canShowExamples && (
        <ExamplesModal
          open={examplesPresetId !== null}
          onClose={() => setExamplesPresetId(null)}
          preset={examplesPreset}
        />
      )}
    </>
  )
}
