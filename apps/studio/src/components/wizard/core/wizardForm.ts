import { createFormHook, createFormHookContexts } from "@tanstack/react-form"
import type { FigureExtractionMode } from "@adt/types"
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
  figureExtraction: "off" as FigureExtractionMode,
  removeWatermarks: true,
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
   *  kick off extraction. "split" persists `split_mode: true` to book config so
   *  the overview can gate the Split & merge panel on the choice. */
  scope: "whole" as "whole" | "range" | "split",
}

export type WizardFormValues = typeof defaultWizardValues

export function useWizardForm() {
  return useTypedAppFormContext({ defaultValues: defaultWizardValues })
}

/**
 * Once a PDF's pages are counted: a page range already chosen for it that fits the book stays (Add
 * Book's assistant may set it first); anything else, or none, becomes every page.
 */
export function fitPageRange(form: ReturnType<typeof useWizardForm>, count: number) {
  const start = parseInt(form.state.values.startPage)
  const end = parseInt(form.state.values.endPage)
  if (start >= 1 && end >= start && end <= count) return
  form.setFieldValue("startPage", "1")
  form.setFieldValue("endPage", String(count))
}
