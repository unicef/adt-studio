import { useStore } from "@tanstack/react-form"
import { useLingui } from "@lingui/react/macro"
import type { SetupRecommendation } from "@adt/types"
import { useWizardForm } from "../../../core/wizardForm"
import type { Derived } from "../shared/useAnswers"
import { plainTitle } from "../shared/words"
import { activityFacts, type ScreenId } from "./screens"

/** What each screen settled, in a few words, for the list of screens and the summary. */
export function useScreenValues(rec: SetupRecommendation | null, derived: Derived | null, pageCount: number): Record<ScreenId, string> | null {
  const { t, i18n } = useLingui()
  const form = useWizardForm()
  const scope = useStore(form.store, (s) => s.values.scope)
  const start = parseInt(useStore(form.store, (s) => s.values.startPage)) || 1
  const end = parseInt(useStore(form.store, (s) => s.values.endPage)) || pageCount
  if (!rec || !derived) return null
  const plain = (id: Parameters<typeof plainTitle>[0]) => {
    const words = plainTitle(id, derived.effective[id]?.value)
    return words ? i18n._(words) : String(derived.effective[id]?.value ?? "")
  }
  const pages = scope === "split" ? t`Split into parts` : scope === "range" && (start > 1 || end < pageCount) ? t`Pages ${start}–${end}` : t`All ${pageCount} pages`
  const facts = activityFacts(rec, derived.current)
  const activities = [
    facts.includes("exercises") ? (derived.effective.activitiesGenerator?.value === true ? t`Activities on` : t`No activities`) : null,
    facts.includes("diagrams") ? (derived.effective.figureExtraction?.value === "auto" ? t`Labelled pictures kept whole` : t`No labelled pictures`) : null,
  ]
    .filter(Boolean)
    .join(" · ")
  // eslint-disable-next-line lingui/no-unlocalized-strings -- setting ids
  return { kind: plain("preset"), look: plain("renderStrategy"), pages, activities, name: "" }
}
