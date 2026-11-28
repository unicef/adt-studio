import { useMemo, useState } from "react"
import type { SetupBookFactId, SetupFact, SetupRecommendation, SetupSettingId } from "@adt/types"
import { askedFacts, fitPreset, genreFor, proposedAnswers, settingsChangedBy, settingsFor, type FactAnswers } from "../../engine/answers"

export type Source = "ai" | "asked" | "changed"
export type SettingValue = string | boolean

/**
 * What the user has said about one engine answer: answers to the questions it
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

  /** A newer answer wins over a hand change to the settings it moves. */
  const answer = (fact: SetupBookFactId, value: string) => {
    if (rec && derived) {
      const moved = settingsChangedBy(rec, derived.current, fact, value)
      if (moved.length) setOverrides((o) => Object.fromEntries(Object.entries(o).filter(([id]) => !moved.includes(id as SetupSettingId))))
    }
    setAnswers((a) => ({ ...a, [fact]: value }))
  }

  return {
    derived,
    answers,
    skipped,
    overrides,
    answer,
    /** Takes the engine's own guess for every question not answered yet. */
    skipRest: (facts: SetupFact[]) => {
      setSkipped(facts.map((f) => f.id))
      setAnswers((a) => ({ ...Object.fromEntries(facts.map((f) => [f.id, f.value])), ...a }))
    },
    /**
     * A hand change to one setting. The preset is the rulebook's answer to the genre fact (one to
     * one), so changing it answers that fact instead and the rulebook works out the rest.
     */
    override: (id: SetupSettingId, value: SettingValue) => {
      const genre = id === "preset" ? genreFor(value) : null
      if (genre) {
        setOverrides((o) => {
          const { preset: _, ...rest } = o
          return rest
        })
        return answer("genre", genre)
      }
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
