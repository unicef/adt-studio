import { i18n } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { z } from "zod"
import type { WizardFormValues } from "../wizardForm"

/** The id of the book name's input (the wizard's Project Name, the guided flow's Book name), to focus it. */
export const PROJECT_NAME_INPUT_ID = "wizard-project-name"

const REQUIRED_MSG = msg`Required`
const LABEL_FORMAT_MSG = msg`Only letters, numbers, dots, dashes, underscores. Must start with a letter or number.`
const LABEL_DUPLICATE_MSG = msg`A book with this name already exists.`

export function createProjectLabelSchema(existingLabels: readonly string[]) {
  return z
    .string()
    .min(1, i18n._(REQUIRED_MSG))
    .regex(
      /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/,
      i18n._(LABEL_FORMAT_MSG),
    )
    .refine(
      (val) => !existingLabels.some((l) => l.toLowerCase() === val.toLowerCase()),
      i18n._(LABEL_DUPLICATE_MSG),
    )
}

export function isStep1BasicInfoValid(
  v: WizardFormValues,
  existingLabels: readonly string[],
): boolean {
  if (!v.file) return false
  return createProjectLabelSchema(existingLabels).safeParse(v.label).success
}
