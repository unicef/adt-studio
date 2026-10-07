import { useState } from "react"
import { useLingui } from "@lingui/react/macro"
import type { AvailableExportFeatures } from "@/hooks/use-export-features"
import {
  DEFAULT_ACCESS_CHOICE,
  generateAccessCode,
  isValidAccessCode,
  normalizeAccessCodeInput,
  type AccessChoiceValue,
} from "../access-code"
import {
  DEFAULT_EXPIRY_CHOICE,
  EXPIRY_OPTIONS,
  expiryChoiceToIso,
  formatPublishDate,
  type ExpiryChoiceValue,
} from "../expiry-options"
import {
  DEFAULT_INCLUDE_CHOICE,
  includeChoiceToFeatures,
  type IncludeChoiceValue,
} from "./include-choice"

export type IncludeKey = keyof IncludeChoiceValue

/**
 * Everything the setup panel asks, and the preview reads, in one place.
 *
 * It lives with the page rather than the panel so a run that fails and hands the form back
 * hands back the same answers — above all the same access code, which the author may already
 * have written on the board.
 */
export function useShareForm(available: AvailableExportFeatures) {
  const { t, i18n } = useLingui()
  const [access, setAccess] = useState<AccessChoiceValue>(DEFAULT_ACCESS_CHOICE)
  /** Generated once, so the code the author is looking at is the code that gets shared. */
  const [code, setCodeRaw] = useState(() => generateAccessCode())
  const [expiry, setExpiry] = useState<ExpiryChoiceValue>(DEFAULT_EXPIRY_CHOICE)
  const [include, setInclude] = useState<IncludeChoiceValue>(DEFAULT_INCLUDE_CHOICE)

  /** A book with no narration shows no narration row, rather than a switch that does nothing. */
  const includeRows = (
    [
      { key: "readAloud", label: t`Read aloud`, heavy: true },
      { key: "quizzes", label: t`Quizzes`, heavy: false },
      { key: "glossary", label: t`Glossary`, heavy: false },
      { key: "signLanguage", label: t`Sign language`, heavy: true },
    ] as const
  ).filter((row) => available[row.key])
  const included = includeRows.filter((row) => include[row.key])
  const codeValid = isValidAccessCode(code)
  const expiresAt = expiryChoiceToIso(expiry)

  return {
    access,
    setAccess,
    code,
    setCode: (next: string) => setCodeRaw(normalizeAccessCodeInput(next)),
    regenerate: () => setCodeRaw(generateAccessCode()),
    codeValid,
    codeReady: access === "open" || codeValid,
    expiry,
    setExpiry,
    expiryOptions: EXPIRY_OPTIONS.map((option) => option.value),
    expiryDate: expiresAt ? formatPublishDate(expiresAt, i18n.locale) : null,
    include,
    toggleInclude: (key: IncludeKey) =>
      setInclude((current) => ({ ...current, [key]: !current[key] })),
    includeRows,
    includedCount: included.length,
    /** What the publish route takes. Built at the moment of sharing, so an end date is counted
     *  from the click, not from when the page opened. */
    toPublishOptions: () => {
      const features = includeChoiceToFeatures(include)
      return {
        expiresAt: expiryChoiceToIso(expiry),
        accessCode: access === "code" ? normalizeAccessCodeInput(code) : null,
        ...(features === undefined ? {} : { features }),
      }
    },
  }
}

export type ShareForm = ReturnType<typeof useShareForm>
