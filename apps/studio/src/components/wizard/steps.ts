import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import type { ComponentType } from "react"
import type { WizardFormValues } from "./wizardForm"
import { isStep1BasicInfoValid } from "./step1BasicInfo/projectLabelSchema"
import { Step1 } from "./step1BasicInfo"
import { Step2 } from "./step2LayoutOptions"
import { Step3 } from "./step3ContentProcessing"
import { Step4 } from "./step4Languages"
// import { Step5 } from "./step5Styleguide"

export interface WizardStepValidationContext {
  existingBookLabels?: readonly string[]
}

export interface StepDef {
  title: MessageDescriptor
  description: MessageDescriptor
  component: ComponentType
  hasRequiredFields?: boolean
  isValid: (values: WizardFormValues, context?: WizardStepValidationContext) => boolean
  scrollToFirstInvalid?: (values: WizardFormValues, context?: WizardStepValidationContext) => string | null
  hint?: (values: WizardFormValues, context?: WizardStepValidationContext) => MessageDescriptor | null
}

export const STEPS: StepDef[] = [
  {
    title: msg`Basic Information`,
    description: msg`Configure basic document information and file paths`,
    component: Step1,
    hasRequiredFields: true,
    isValid: (v, ctx) => v.generationModel.trim().length > 0 && ctx?.existingBookLabels !== undefined && isStep1BasicInfoValid(v, ctx.existingBookLabels),
    scrollToFirstInvalid: (v, ctx) => {
      if (!v.file) return "wizard-pdf-upload"
      if (!v.generationModel.trim()) return "wizard-generation-method"
      if (!isStep1BasicInfoValid(v, ctx?.existingBookLabels ?? [])) return "wizard-project-name"
      return null
    },
    hint: (v, ctx) => {
      if (!v.file) return msg`Upload a PDF to continue`
      if (!v.generationModel.trim()) return msg`Choose local or cloud generation to continue`
      if (!isStep1BasicInfoValid(v, ctx?.existingBookLabels ?? [])) return msg`Enter a valid project name`
      return null
    },
  },
  {
    title: msg`Visual Layout`,
    description: msg`Choose how the content should be formatted.`,
    component: Step2,
    hasRequiredFields: true,
    isValid: (v) => v.renderStrategy !== "" && v.pageGrouping !== "" && v.sectioningMode !== "",
    scrollToFirstInvalid: (v) => {
      if (!v.renderStrategy) return "wizard-render-strategy"
      if (!v.pageGrouping) return "wizard-page-grouping"
      if (!v.sectioningMode) return "wizard-sectioning-mode"
      return null
    },
    hint: (v) => {
      if (!v.renderStrategy) return msg`Select a render strategy to continue`
      if (!v.pageGrouping) return msg`Select a page grouping to continue`
      if (!v.sectioningMode) return msg`Select a section mode to continue`
      return null
    },
  },
  {
    title: msg`Content Processing`,
    description: msg`Configure activity detection and image processing options for extracted content. Hover any setting to see how it affects the preview.`,
    component: Step3,
    isValid: (v) => {
      if (!v.imageSegmentation) return true
      const t = v.segmentationMinSide.trim()
      if (!t) return true
      const n = Number(t)
      return Number.isInteger(n) && n >= 0
    },
    scrollToFirstInvalid: (v) => {
      if (v.imageSegmentation && v.segmentationMinSide.trim()) {
        const n = Number(v.segmentationMinSide.trim())
        if (!Number.isInteger(n) || n < 0) return "wizard-segmentation-min-side"
      }
      return null
    },
    hint: (v) => {
      if (v.imageSegmentation && v.segmentationMinSide.trim()) {
        const n = Number(v.segmentationMinSide.trim())
        if (!Number.isInteger(n) || n < 0) return msg`Enter a valid minimum dimension (whole number ≥ 0)`
      }
      return null
    },
  },
  {
    title: msg`Languages`,
    description: msg`Set the editing language and choose output languages for the book.`,
    component: Step4,
    isValid: () => true,
  },
  // {
  //   title: msg`Style Guide`,
  //   description: msg`Choose a style guide to control the look and feel of the generated pages.`,
  //   component: Step5,
  //   isValid: () => true,
  // },
]
