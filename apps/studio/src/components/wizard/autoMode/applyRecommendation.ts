import type { SetupDecided } from "@adt/types"
import type { useWizardForm } from "../wizardForm"
import { applyPreset } from "../step0preset"
import type { PresetId, RenderStrategyId } from "../constants"

/** Auto mode is on in dev builds, or when `localStorage["adt:auto-mode"] === "1"` (testers). */
export function isAutoModeEnabled(): boolean {
  if (import.meta.env.DEV) return true
  try {
    return window.localStorage.getItem("adt:auto-mode") === "1"
  } catch {
    return false
  }
}

/** Puts the picked settings into the wizard form, on top of the preset's own defaults. */
export function applyRecommendation(
  form: ReturnType<typeof useWizardForm>,
  settings: SetupDecided,
) {
  const preset = settings.preset!.value as PresetId
  form.setFieldValue("selectedPreset", preset)
  applyPreset(form, preset)
  form.setFieldValue("renderStrategy", settings.renderStrategy!.value as RenderStrategyId)
  form.setFieldValue("pageGrouping", settings.pageGrouping!.value as "single" | "spread")
  form.setFieldValue("sectioningMode", settings.sectioningMode!.value as "page" | "dynamic")
  form.setFieldValue("activitiesGenerator", settings.activitiesGenerator!.value === true)
  form.setFieldValue("figureExtraction", settings.figureExtraction!.value as "off" | "auto")
  // The page range is the user's choice (how much of the PDF to convert): auto mode leaves it alone.
}
