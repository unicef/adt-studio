import type { PublishFeatureSelection } from "@adt/types"

export interface IncludeChoiceValue {
  readAloud: boolean
  quizzes: boolean
  glossary: boolean
  signLanguage: boolean
}

/** Everything the book has, which is what sharing sends unless the author says otherwise. */
export const DEFAULT_INCLUDE_CHOICE: IncludeChoiceValue = {
  readAloud: true,
  quizzes: true,
  glossary: true,
  signLanguage: true,
}

/**
 * Only the exclusions are sent. A selection that leaves everything in produces `undefined`, so
 * the request carries no `features` key and the API cannot tell it apart from a call made before
 * this control existed — which is what keeps "share the whole book" the unchanged default.
 */
export function includeChoiceToFeatures(
  value: IncludeChoiceValue,
): PublishFeatureSelection | undefined {
  const excluded = Object.entries(value).filter(([, included]) => !included)
  if (excluded.length === 0) return undefined
  return Object.fromEntries(excluded.map(([key]) => [key, false])) as PublishFeatureSelection
}
