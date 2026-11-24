import { useEffect, useMemo, useState } from "react"
import type { SetupBookFactId, SetupDecided, SetupRecommendation, SetupSettingId, SetupSettings } from "@adt/types"
import { PRESETS } from "@/components/wizard/core/constants"
import { askedFacts, FACT_OPTIONS, proposedAnswers, SETTING_IDS, settingsChangedBy, settingsFor, type FactAnswers } from "../../engine/answers"

/** Where a setting's value came from: the AI's own pick, the user's answer to a question, or a direct change. */
export type Source = "ai" | "answered" | "changed"

export type Look = SetupSettings

/** A decided row as plain values, for drawing the preview. */
export function lookOf(decided: SetupDecided): Look {
  return {
    preset: decided.preset?.value as Look["preset"],
    renderStrategy: decided.renderStrategy?.value as Look["renderStrategy"],
    pageGrouping: decided.pageGrouping?.value as Look["pageGrouping"],
    sectioningMode: decided.sectioningMode?.value as Look["sectioningMode"],
    activitiesGenerator: decided.activitiesGenerator?.value === true,
    figureExtraction: decided.figureExtraction?.value as Look["figureExtraction"],
  }
}

const parse = (id: SetupSettingId, value: string): Look[SetupSettingId] => (id === "activitiesGenerator" ? value === "true" : value) as Look[SetupSettingId]

/** The settings a fact can move: any that differ between its answers. */
function movedBy(rec: SetupRecommendation, answers: FactAnswers, fact: SetupBookFactId): SetupSettingId[] {
  return SETTING_IDS.filter((id) => FACT_OPTIONS[fact].some((v) => settingsChangedBy(rec, answers, fact, v).includes(id)))
}

/**
 * The canvas's state for one engine answer: the user's answers to the facts, and any settings they
 * changed directly. The rulebook (`settingsFor`) does the rest. Starts over when a new answer arrives.
 */
export function useSetup(rec: SetupRecommendation | null) {
  const [answers, setAnswers] = useState<FactAnswers | null>(null)
  const [answered, setAnswered] = useState<SetupBookFactId[]>([])
  const [overrides, setOverrides] = useState<Partial<Look>>({})

  useEffect(() => {
    setAnswers(rec ? proposedAnswers(rec) : null)
    setAnswered([])
    setOverrides({})
  }, [rec])

  return useMemo(() => {
    if (!rec || !answers) return null
    const ai = lookOf(settingsFor(rec, proposedAnswers(rec)))
    const ruled = settingsFor(rec, answers)
    const base = lookOf(ruled)
    const look: Look = { ...base, ...overrides }
    const pending = askedFacts(rec).filter((f) => !answered.includes(f.id))

    const source = (id: SetupSettingId): Source => (id in overrides && overrides[id] !== base[id] ? "changed" : base[id] !== ai[id] ? "answered" : "ai")

    /** What the book would look like with another answer to `fact`; the user's own changes stay, except on the settings that fact decides. */
    const lookFor = (fact: SetupBookFactId, value: string): Look => {
      const moved = movedBy(rec, answers, fact)
      const kept = Object.fromEntries(Object.entries(overrides).filter(([id]) => !moved.includes(id as SetupSettingId)))
      return { ...lookOf(settingsFor(rec, { ...answers, [fact]: value })), ...kept }
    }

    const answer = (fact: SetupBookFactId, value: string) => {
      const moved = movedBy(rec, answers, fact)
      setAnswers({ ...answers, [fact]: value })
      setAnswered((a) => (a.includes(fact) ? a : [...a, fact]))
      setOverrides((o) => Object.fromEntries(Object.entries(o).filter(([id]) => !moved.includes(id as SetupSettingId))))
    }

    const set = (id: SetupSettingId, raw: string) => {
      const value = parse(id, raw)
      const next: Partial<Look> = { ...overrides }
      if (value === base[id]) delete next[id]
      else (next as Record<string, unknown>)[id] = value
      if (id === "preset") {
        const allowed = (PRESETS.find((p) => p.id === value)?.renderStrategies ?? []) as readonly string[]
        const strategy = next.renderStrategy ?? base.renderStrategy
        if (!allowed.includes(strategy)) {
          const fallback = PRESETS.find((p) => p.id === value)?.recommendations.renderStrategy as Look["renderStrategy"] | undefined
          if (fallback && fallback !== base.renderStrategy) next.renderStrategy = fallback
          else delete next.renderStrategy
        }
      }
      setOverrides(next)
    }

    /** The settings to create the book with, as the engine's decided row (the rule says "user" where the user changed it). */
    const decided: SetupDecided = Object.fromEntries(
      SETTING_IDS.map((id) => [id, id in overrides ? { value: look[id], rule: "user" } : ruled[id]!]),
    ) as SetupDecided

    return { rec, answers, answered, look, ai, base, pending, source, lookFor, answer, set, decided, rule: (id: SetupSettingId) => ruled[id]?.rule }
  }, [rec, answers, answered, overrides])
}

export type CanvasSetup = NonNullable<ReturnType<typeof useSetup>>
