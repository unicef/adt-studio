import { createFormHook, createFormHookContexts } from "@tanstack/react-form"
import type {
  RenderStrategyId,
  WizardPageGrouping,
  WizardSectioningMode,
} from "./constants"

export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts()

export const { useAppForm, useTypedAppFormContext } = createFormHook({
  fieldComponents: {},
  formComponents: {},
  fieldContext,
  formContext,
})

export const defaultWizardValues = {
  selectedPreset: null as string | null,
  label: "",
  file: null as File | null,
  startPage: "",
  endPage: "",
  outputLanguages: [] as string[],
  renderStrategy: "" as RenderStrategyId | "",
  pageGrouping: "" as WizardPageGrouping,
  sectioningMode: "" as WizardSectioningMode,
  activitiesGenerator: false,
  imageCropping: false,
  imageSegmentation: false,
  figureExtraction: false,
  segmentationMinSide: "",
  imageFilterMinSide: 0,
  imageFilterMaxSide: 5000,
  editingLanguage: "",
  styleguide: "",
  /** UI-only: how much of the book to process here, and how. Set in step 1
   *  alongside the page-range slider (same page-window primitive):
   *  - "whole" — process every page on this machine.
   *  - "range" — process only `startPage`..`endPage` here (terminal subset).
   *  - "split" — this is the canonical full book; defer extraction and hand
   *    out page-range parts to merge back later.
   *  Only "range" writes `start_page`/`end_page` to config; only "whole"/"range"
   *  kick off extraction. Not itself written to book config. */
  scope: "whole" as "whole" | "range" | "split",
}

export type WizardFormValues = typeof defaultWizardValues

export function useWizardForm() {
  return useTypedAppFormContext({ defaultValues: defaultWizardValues })
}

