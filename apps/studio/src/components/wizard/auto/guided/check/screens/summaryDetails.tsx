import type { ReactNode } from "react"
import { useStore } from "@tanstack/react-form"
import { Plural, Trans, useLingui } from "@lingui/react/macro"
import { LayoutTemplate, Lock, Sparkles } from "lucide-react"
import type { SetupBookFactId, SetupDecided, SetupRecommendation, SetupSettingId } from "@adt/types"
import { useWizardForm } from "../../../../core/wizardForm"
import { SETTING_NAME, SETTING_VALUE } from "../../../engine/words"
import { plainTitle } from "../../shared/words"
import { usesAI } from "../../shared/MethodTag"
import type { ScreenId } from "../screens"
import { useBookLanguage } from "./LanguageScreen"

/** An icon in front of a detail line, sized and tinted like the text. */
// eslint-disable-next-line lingui/no-unlocalized-strings -- class names
const icon = "mr-1 inline size-3.5 -translate-y-px align-middle"

/**
 * One short line under each choice on the summary: what it means for the finished book. The kind
 * of book: what its settings are made for; Language: translated or kept; the layout: made by the
 * AI or from a template; Facing pages: fixed once set up; Pages: how many; the activities: the
 * settings they turn on.
 */
export function useSummaryDetails(rec: SetupRecommendation, settings: SetupDecided, facts: SetupBookFactId[], pageCount: number): Partial<Record<ScreenId, ReactNode>> {
  const { i18n, t } = useLingui()
  const form = useWizardForm()
  const scope = useStore(form.store, (s) => s.values.scope)
  const start = parseInt(useStore(form.store, (s) => s.values.startPage)) || 1
  const end = parseInt(useStore(form.store, (s) => s.values.endPage)) || pageCount
  const { found, changed } = useBookLanguage(rec)
  const value = (id: SetupSettingId) => settings[id]?.value
  const means = (id: SetupSettingId) => {
    const words = SETTING_VALUE[id]?.[String(value(id))]?.means
    return words ? i18n._(words) : null
  }
  // "Interactive activities: On" — the setting an answer turns on or off, by its name.
  const named = (id: SetupSettingId) => {
    const label = i18n._(SETTING_NAME[id])
    const words = plainTitle(id, value(id))
    const said = words ? i18n._(words) : String(value(id) ?? "")
    return t`${label}: ${said}`
  }
  const count = Math.max(0, end - start + 1)
  const ranged = scope === "range" && (start > 1 || end < pageCount)
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a setting id
  const ai = usesAI(String(value("renderStrategy") ?? ""))

  return {
    kind: means("preset"),
    language: changed ? (
      <Trans>Your pick. The text is translated into it.</Trans>
    ) : found ? (
      <Trans>Sets the spelling and the voices. The book isn&apos;t translated.</Trans>
    ) : (
      <Trans>I couldn&apos;t tell from the PDF. It&apos;s found when the pages are read.</Trans>
    ),
    look: ai ? (
      <>
        <Sparkles aria-hidden className={`${icon} text-brand-600`} />
        <Trans>Made by the AI · takes longer, the AI service may charge</Trans>
      </>
    ) : (
      <>
        <LayoutTemplate aria-hidden className={icon} />
        <Trans>No AI needed · quick, costs nothing extra</Trans>
      </>
    ),
    spreads: (
      <>
        <Lock aria-hidden className={icon} />
        <Trans>Fixed once the book is set up.</Trans>
      </>
    ),
    pages:
      scope === "split" ? (
        <Trans>The parts are converted after the book is created.</Trans>
      ) : ranged ? (
        <Plural value={count} one="# page" other="# pages" />
      ) : (
        <Trans>Every page is converted.</Trans>
      ),
    // eslint-disable-next-line lingui/no-unlocalized-strings -- fact and setting ids, and the separator also used for the values
    activities: [facts.includes("exercises") ? named("activitiesGenerator") : null, facts.includes("diagrams") ? named("figureExtraction") : null].filter(Boolean).join(" · "),
  }
}
