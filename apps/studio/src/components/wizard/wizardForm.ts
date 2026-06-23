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
  /** UI-only: what to do after creating the book. "process" runs extraction
   *  immediately; "split" skips it so the book can be handed out as parts.
   *  Not written to book config. */
  intent: "process" as "process" | "split",
}

export type WizardFormValues = typeof defaultWizardValues

export function useWizardForm() {
  return useTypedAppFormContext({ defaultValues: defaultWizardValues })
}

