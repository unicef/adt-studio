import { useStore } from "@tanstack/react-form"
import { useLingui } from "@lingui/react/macro"
import type { SetupRecommendation } from "@adt/types"
import { languageName } from "../shared/languageName"
import { useWizardForm } from "../../../core/wizardForm"
import type { Derived } from "../shared/useAnswers"
import { plainTitle } from "../shared/words"
import { activityFacts, bookLanguage, type ScreenId } from "./screens"
import { useWizardNames, WIZARD_SETTING, wizardValue } from "../shared/wizardNames"

/** What each screen settled, in a few words, for the list of screens and the summary. */
export function useScreenValues(rec: SetupRecommendation | null, derived: Derived | null, pageCount: number): Record<ScreenId, string> | null {
  const { t, i18n } = useLingui()
  const names = useWizardNames()
  const form = useWizardForm()
  const scope = useStore(form.store, (s) => s.values.scope)
  const start = parseInt(useStore(form.store, (s) => s.values.startPage)) || 1
  const end = parseInt(useStore(form.store, (s) => s.values.endPage)) || pageCount
  const editing = useStore(form.store, (s) => s.values.editingLanguage).trim()
  if (!rec || !derived) return null
  const plain = (id: Parameters<typeof plainTitle>[0]) => {
    if (names) {
      const w = wizardValue(id, derived.effective[id]?.value)
      return typeof w === "string" ? w : i18n._(w)
    }
    const words = plainTitle(id, derived.effective[id]?.value)
    return words ? i18n._(words) : String(derived.effective[id]?.value ?? "")
  }
  const pages = scope === "split" ? t`Split into parts` : scope === "range" && (start > 1 || end < pageCount) ? t`Pages ${start}–${end}` : t`All ${pageCount} pages`
  const facts = activityFacts(rec, derived.current)
  const named = (id: "activitiesGenerator" | "figureExtraction") => `${i18n._(WIZARD_SETTING[id])}: ${plain(id)}`
  const activities = [
    // eslint-disable-next-line lingui/no-unlocalized-strings -- setting ids
    facts.includes("exercises") ? (names ? named("activitiesGenerator") : derived.effective.activitiesGenerator?.value === true ? t`Activities on` : t`No activities`) : null,
    // eslint-disable-next-line lingui/no-unlocalized-strings -- setting ids
    facts.includes("diagrams") ? (names ? named("figureExtraction") : derived.effective.figureExtraction?.value === "auto" ? t`Maps and diagrams kept with their labels` : t`No maps or diagrams`) : null,
  ]
    .filter(Boolean)
    .join(" · ")
  const found = bookLanguage(rec)
  const language = editing ? languageName(editing, i18n.locale, true) : found ? languageName(found, i18n.locale, true) : t`The book's own`
  // eslint-disable-next-line lingui/no-unlocalized-strings -- setting ids
  return { kind: plain("preset"), language, look: plain("renderStrategy"), pages, activities, name: "" }
}
