import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { useStore } from "@tanstack/react-form"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useWizard } from "@/components/wizard"
import { useWizardForm, defaultWizardValues } from "@/components/wizard/wizardForm"
import { type PresetId, PRESETS, getPresetAccent } from "@/components/wizard/constants"
import { PresetGrid } from "./PresetGrid"
// eslint-disable-next-line lingui/no-unlocalized-strings -- Preset reset warning text
const STEP1_FIELDS = new Set(["label", "file", "startPage", "endPage", "selectedPreset"])

function applyPreset(form: ReturnType<typeof useWizardForm>, id: PresetId) {
  const preset = PRESETS.find((p) => p.id === id)

  for (const [key, value] of Object.entries(defaultWizardValues)) {
    if (STEP1_FIELDS.has(key)) continue
    form.setFieldValue(key as never, value as never)
  }

  if (preset?.formDefaults) {
    for (const [key, value] of Object.entries(preset.formDefaults)) {
      form.setFieldValue(key as never, value as never)
    }
  }
}

export function Step0Preset() {
  const {
    setCurrentStep,
    setPhase,
    stepDirection,
    committedStep0Preset,
    setCommittedStep0Preset,
  } = useWizard()
  const form = useWizardForm()
  const selected = useStore(form.store, (s) => s.values.selectedPreset) as PresetId | null
  const accent = getPresetAccent(selected)

  const presetChanged =
    committedStep0Preset !== null &&
    selected !== null &&
    selected !== committedStep0Preset

  function handleSelect(id: PresetId) {
    form.setFieldValue("selectedPreset", id)
  }

  function handleContinue() {
    if (!selected) return
    if (presetChanged || committedStep0Preset === null) {
      applyPreset(form, selected)
    }
    setCommittedStep0Preset(selected)
    setCurrentStep(1)
  }

  return (
    <div
      className={cn(
        "flex flex-1 min-h-0 w-full bg-background flex-col items-center justify-center gap-6 sm:gap-8 px-4 py-10",
        stepDirection === "forward"
          ? "animate-step-enter-forward"
          : "animate-step-enter-back",
      )}
    >
      <div className="relative flex flex-col items-center gap-1">
        <h1
          id="preset-step-heading"
          className="text-2xl sm:text-[30px] font-semibold leading-tight sm:leading-9 tracking-[-0.75px] text-foreground text-center"
        >
          <Trans>Choose a Preset</Trans>
        </h1>
        <p className="max-w-xl text-center text-sm text-foreground/80">
          <Trans>
            Presets add recommendations and specific settings for your use case. You still choose
            each option step by step, and you can go back to select a different preset at any
            time.
          </Trans>
        </p>
        <div
          className="pointer-events-none absolute left-1/2 top-full mt-2 flex w-full max-w-lg -translate-x-1/2 items-center justify-center px-2"
          aria-live="polite"
        >
          <p
            className={cn(
              "flex items-center justify-center gap-1.5 text-center text-sm text-red-600 transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none motion-reduce:transform-none",
              presetChanged
                ? "opacity-100 translate-y-0"
                : "select-none opacity-0 translate-y-1",
            )}
            aria-hidden={!presetChanged}
          >
            <RotateCcw
              className={cn(
                "h-3.5 w-3.5 shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none",
                presetChanged ? "rotate-0" : "-rotate-45 scale-90",
              )}
              aria-hidden
            />
            <Trans>Continuing will reset your current configuration.</Trans>
          </p>
        </div>
      </div>

      <PresetGrid selected={selected} onSelect={handleSelect} />

      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          onClick={() => setPhase("upload")}
          className="h-9 px-3 py-2 bg-muted text-foreground hover:bg-muted border-0"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" />
          <Trans>Back</Trans>
        </Button>
        <Button
          disabled={!selected}
          onClick={handleContinue}
          className="h-9 px-3 py-2 text-white transition-[background-color,opacity] duration-300 ease-out hover:opacity-90 disabled:opacity-50 border-0"
          style={{ backgroundColor: accent.bg }}
        >
          <Trans>Continue</Trans>
          <ArrowRight className="h-4 w-4 ml-1.5" />
        </Button>
      </div>
    </div>
  )
}
