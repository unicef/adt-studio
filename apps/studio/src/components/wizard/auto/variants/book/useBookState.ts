import { useCallback, useEffect, useMemo, useState } from "react"
import { useLingui } from "@lingui/react/macro"
import type { SetupBookFactId, SetupRecommendation, SetupSettingId } from "@adt/types"
import { PRESETS, RENDER_STRATEGIES } from "@/components/wizard/core/constants"
import { askedFacts, proposedAnswers, settingsChangedBy, type FactAnswers } from "../../engine/answers"
import { SETTING_VALUE } from "../../engine/words"
import { bookSettings, currentSettings, findings, type Overrides, type SettingValue } from "./model"
import { WIZARD_NAME, WIZARD_VALUE } from "./words"

/** The wizard's name for a setting and its values, and what a value means in plain words. */
export function useSettingWords() {
  const { i18n } = useLingui()
  return useMemo(
    () => ({
      name: (id: SetupSettingId) => i18n._(WIZARD_NAME[id]),
      value: (id: SetupSettingId, v: SettingValue) => {
        if (id === "preset") {
          const p = PRESETS.find((x) => x.id === v)
          return p ? i18n._(p.title) : String(v)
        }
        if (id === "renderStrategy") {
          const r = RENDER_STRATEGIES.find((x) => x.id === v)
          return r ? i18n._(r.title) : String(v)
        }
        const m = WIZARD_VALUE[id]?.[String(v)]
        return m ? i18n._(m) : String(v)
      },
      means: (id: SetupSettingId, v: SettingValue) => {
        const m = SETTING_VALUE[id]?.[String(v)]?.means
        return m ? i18n._(m) : ""
      },
    }),
    [i18n],
  )
}

/**
 * What the user does on the open book: answer a note (a fact), change a bookmark (a setting) by
 * hand, or put it back to the AI's pick. Settings always come from the rulebook row for the answers
 * (`settingsFor`), with hand changes on top; answering a fact drops hand changes to the settings
 * that answer moves, so the answer visibly takes effect.
 */
export function useBookState(rec: SetupRecommendation | null) {
  const [answers, setAnswers] = useState<FactAnswers | null>(null)
  const [answered, setAnswered] = useState<Set<SetupBookFactId>>(new Set())
  const [overrides, setOverrides] = useState<Overrides>({})

  useEffect(() => {
    setAnswers(rec ? proposedAnswers(rec) : null)
    setAnswered(new Set())
    setOverrides({})
  }, [rec])

  const current = answers ?? (rec ? proposedAnswers(rec) : null)
  const settings = useMemo(() => (rec && current ? bookSettings(rec, current, overrides, answered) : []), [rec, current, overrides, answered])
  const notes = useMemo(() => (rec ? findings(rec) : []), [rec])
  const questions = useMemo(() => (rec ? askedFacts(rec) : []), [rec])
  const open = questions.filter((q) => !answered.has(q.id))

  /** Answers a fact and returns the settings it changed, with their new values. */
  const answer = useCallback(
    (fact: SetupBookFactId, value: string): { id: SetupSettingId; value: SettingValue }[] => {
      if (!rec || !current) return []
      const moved = settingsChangedBy(rec, current, fact, value)
      const before = currentSettings(rec, current, overrides)
      const nextOverrides = { ...overrides }
      for (const id of moved) delete nextOverrides[id]
      const next = { ...current, [fact]: value }
      const after = currentSettings(rec, next, nextOverrides)
      setAnswers(next)
      setOverrides(nextOverrides)
      setAnswered((s) => new Set(s).add(fact))
      return (Object.keys(after) as SetupSettingId[]).filter((id) => after[id]?.value !== before[id]?.value).map((id) => ({ id, value: after[id]!.value }))
    },
    [rec, current, overrides],
  )

  const change = useCallback(
    (id: SetupSettingId, value: SettingValue) => {
      if (!rec || !current) return
      const base = currentSettings(rec, current, {})
      setOverrides((o) => {
        const next = { ...o }
        if (base[id]?.value === value) delete next[id]
        else next[id] = value
        return next
      })
    },
    [rec, current],
  )

  return {
    answers: current,
    answered,
    settings,
    notes,
    questions,
    open,
    answer,
    change,
    decided: () => (rec && current ? currentSettings(rec, current, overrides) : null),
  }
}

export type BookState = ReturnType<typeof useBookState>
