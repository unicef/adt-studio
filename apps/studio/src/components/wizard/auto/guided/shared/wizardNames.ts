import { useSyncExternalStore } from "react"
import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import type { SetupSettingId } from "@adt/types"
import { PRESETS, RENDER_STRATEGIES, wizardValueLabel } from "../../../core/constants"

/**
 * "Wizard names": a switch on Check that shows the exact settings each choice applies, named as
 * the step-by-step wizard names them (Preset Storybook, Render Strategy Dynamic Overlay, …), for
 * people who know the wizard. Kept in this browser; every Check part reads the same value.
 */
const KEY = "add-book:wizard-names"
const listeners = new Set<() => void>()
let memory: boolean | null = null

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === "1"
  } catch {
    return false
  }
}

export function setWizardNames(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0")
  } catch {
    /* storage blocked: the switch lasts until reload */
    memory = on
  }
  for (const l of listeners) l()
}

export function useWizardNames(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => memory ?? read(),
    () => false,
  )
}

/** The wizard's name for each setting. */
export const WIZARD_SETTING: Record<SetupSettingId, MessageDescriptor> = {
  preset: msg`Preset`,
  renderStrategy: msg`Render Strategy`,
  pageGrouping: msg`Page Grouping`,
  sectioningMode: msg`Sectioning`,
  activitiesGenerator: msg`Activities`,
  figureExtraction: msg`Figure Extraction`,
}

/** A setting's value as the wizard names it. */
export function wizardValue(id: SetupSettingId, value: string | boolean | undefined): MessageDescriptor | string {
  if (id === "preset") return PRESETS.find((p) => p.id === value)?.title ?? String(value)
  if (id === "renderStrategy") return RENDER_STRATEGIES.find((r) => r.id === value)?.title ?? String(value)
  return wizardValueLabel(value)
}
