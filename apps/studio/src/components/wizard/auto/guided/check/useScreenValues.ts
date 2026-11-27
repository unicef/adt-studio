import { useStore } from "@tanstack/react-form"
import { useLingui } from "@lingui/react/macro"
import type { SetupRecommendation } from "@adt/types"
import { languageName } from "../shared/languageName"
import { useWizardForm } from "../../../core/wizardForm"
import type { Derived } from "../shared/useAnswers"
import { plainTitle } from "../shared/words"
import { FACT_SHORT } from "../../engine/words"
import { activityFacts, bookLanguage, type ScreenId } from "./screens"

/** What each screen settled, in a few words, for the list of screens and the summary. */
export function useScreenValues(rec: SetupRecommendation | null, derived: Derived | null, pageCount: number): Record<ScreenId, string> | null {
  const { t, i18n } = useLingui()
  const form = useWizardForm()
  const scope = useStore(form.store, (s) => s.values.scope)
  const start = parseInt(useStore(form.store, (s) => s.values.startPage)) || 1
  const end = parseInt(useStore(form.store, (s) => s.values.endPage)) || pageCount
  const editing = useStore(form.store, (s) => s.values.editingLanguage).trim()
  if (!rec || !derived) return null
  const plain = (id: Parameters<typeof plainTitle>[0]) => {
    const words = plainTitle(id, derived.effective[id]?.value)
    return words ? i18n._(words) : String(derived.effective[id]?.value ?? "")
  }
  const pages = scope === "split" ? t`Split into parts` : scope === "range" && (start > 1 || end < pageCount) ? t`Pages ${start}–${end}` : t`All ${pageCount} pages`
  const facts = activityFacts(rec, derived.current)
  // The person's own answers ("Yes, a few"), named only when the screen asked both questions.
  const answer = (id: "exercises" | "diagrams", label: string) => {
    const value = derived.current[id]
    const short = value ? FACT_SHORT[id][value] : undefined
    const said = short ? i18n._(short) : ""
    return facts.length > 1 ? t`${label}: ${said}` : said
  }
  const activities = [
    facts.includes("exercises") ? answer("exercises", t`Exercises`) : null,
    facts.includes("diagrams") ? answer("diagrams", t`Maps and diagrams`) : null,
  ]
    .filter(Boolean)
    .join(" · ")
  const found = bookLanguage(rec)
  const language = editing ? languageName(editing, i18n.locale, true) : found ? languageName(found, i18n.locale, true) : t`The book's own`
  // eslint-disable-next-line lingui/no-unlocalized-strings -- setting ids
  return { kind: plain("preset"), language, look: plain("renderStrategy"), spreads: plain("pageGrouping"), pages, activities, name: "" }
}
