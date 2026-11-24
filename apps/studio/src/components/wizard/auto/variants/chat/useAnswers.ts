import { useMemo, useState } from "react"
import type { SetupBookFactId, SetupDecided, SetupFact, SetupRecommendation, SetupSettingId } from "@adt/types"
import { PRESETS } from "@/components/wizard/core/constants"
import { askedFacts, FACT_OPTIONS, proposedAnswers, settingsChangedBy, settingsFor, SETTING_IDS, type FactAnswers } from "../../engine/answers"

export type Source = "ai" | "asked" | "changed"
export type SettingValue = string | boolean

/**
 * What the user has said in the conversation about one engine answer: answers to the questions it
 * asked, "skip to settings", and settings changed by hand. Everything shown is derived from these
 * and the engine's rulebook (`settingsByFacts`), so changing an earlier answer just re-derives.
 */
export function useAnswers(rec: SetupRecommendation | null) {
  const [answers, setAnswers] = useState<Partial<FactAnswers>>({})
  const [skipped, setSkipped] = useState<SetupBookFactId[]>([])
  const [overrides, setOverrides] = useState<Partial<Record<SetupSettingId, SettingValue>>>({})

  const derived = useMemo(() => {
    if (!rec) return null
    const asked = askedFacts(rec)
    const proposed = proposedAnswers(rec)
    const current: FactAnswers = { ...proposed, ...answers }
    const pending = asked.find((f) => !(f.id in answers)) ?? null
    const fromAnswers = settingsFor(rec, current)
    const effective = fitPreset({ ...fromAnswers, ...Object.fromEntries(Object.entries(overrides).map(([id, value]) => [id, { value, rule: "user" }])) })
    const source = (id: SetupSettingId): Source => {
      if (effective[id]?.value !== fromAnswers[id]?.value) return "changed"
      if (fromAnswers[id]?.value !== rec.settings[id]?.value) return "asked"
      return "ai"
    }
    return { asked, proposed, current, pending, fromAnswers, effective, source }
  }, [rec, answers, overrides])

  return {
    derived,
    answers,
    skipped,
    overrides,
    /** A newer answer wins over a hand change to the settings it moves. */
    answer: (fact: SetupBookFactId, value: string) => {
      if (rec && derived) {
        const moved = settingsChangedBy(rec, derived.current, fact, value)
        if (moved.length) setOverrides((o) => Object.fromEntries(Object.entries(o).filter(([id]) => !moved.includes(id as SetupSettingId))))
      }
      setAnswers((a) => ({ ...a, [fact]: value }))
    },
    /** Takes the engine's own guess for every question not answered yet. */
    skipRest: (facts: SetupFact[]) => {
      setSkipped(facts.map((f) => f.id))
      setAnswers((a) => ({ ...Object.fromEntries(facts.map((f) => [f.id, f.value])), ...a }))
    },
    override: (id: SetupSettingId, value: SettingValue) => {
      setOverrides((o) => {
        const next = { ...o, [id]: value }
        // Picking the rulebook's own value again is not a change.
        if (derived && derived.fromAnswers[id]?.value === value) delete next[id]
        return next
      })
    },
    reset: () => {
      setAnswers({})
      setSkipped([])
      setOverrides({})
    },
  }
}

export type Answers = ReturnType<typeof useAnswers>
export type Derived = NonNullable<Answers["derived"]>

/** A preset only offers some render strategies; if the pick isn't one of them, use the preset's own. */
function fitPreset(settings: SetupDecided): SetupDecided {
  const preset = PRESETS.find((p) => p.id === settings.preset?.value)
  const allowed = (preset?.renderStrategies ?? []) as readonly string[]
  const strategy = settings.renderStrategy?.value
  if (!preset || allowed.includes(String(strategy))) return settings
  return { ...settings, renderStrategy: { value: String(preset.recommendations.renderStrategy ?? allowed[0]), rule: "preset-default" } }
}

/** The render strategies the current preset offers. */
export function strategiesFor(preset: SettingValue | undefined): string[] {
  return [...((PRESETS.find((p) => p.id === preset)?.renderStrategies ?? []) as readonly string[])]
}

/** Settings whose value depends on a fact: some other answer to it would change them. */
export function settingsTouchedBy(rec: SetupRecommendation, answers: FactAnswers, fact: SetupBookFactId): SetupSettingId[] {
  const changed = new Set<SetupSettingId>()
  for (const v of FACT_OPTIONS[fact]) for (const id of settingsChangedBy(rec, answers, fact, v)) changed.add(id)
  return SETTING_IDS.filter((id) => changed.has(id))
}

/** Settings that wait on a question: they'd change with another answer to a fact the engine asks about. */
export function settingsWaitingOn(rec: SetupRecommendation, asked: SetupFact[], answers: FactAnswers): Set<SetupSettingId> {
  const out = new Set<SetupSettingId>()
  for (const f of asked) for (const id of settingsTouchedBy(rec, answers, f.id)) out.add(id)
  return out
}

