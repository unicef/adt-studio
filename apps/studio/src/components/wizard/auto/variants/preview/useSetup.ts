import { useEffect, useMemo, useState } from "react"
import type { SetupBookFactId, SetupDecided, SetupRecommendation, SetupSettingId, SetupSettings } from "@adt/types"
import { askedFacts, fitPreset, fitStrategy, genreFor, proposedAnswers, SETTING_IDS, settingsFor, settingsTouchedBy, type FactAnswers } from "../../engine/answers"

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

/** A look with its render strategy fitted to its preset (a guard: the rulebook's rows always fit). */
const fitLook = (look: Look): Look => ({ ...look, renderStrategy: fitStrategy(look.preset, look.renderStrategy) as Look["renderStrategy"] })

const parse = (id: SetupSettingId, value: string): Look[SetupSettingId] => (id === "activitiesGenerator" ? value === "true" : value) as Look[SetupSettingId]

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
    const look = fitLook({ ...base, ...overrides })
    const pending = askedFacts(rec).filter((f) => !answered.includes(f.id))

    const source = (id: SetupSettingId): Source => (id in overrides && overrides[id] !== base[id] ? "changed" : base[id] !== ai[id] ? "answered" : "ai")

    /** What the book would look like with another answer to `fact`; the user's own changes stay, except on the settings that fact decides. */
    const lookFor = (fact: SetupBookFactId, value: string): Look => {
      const moved = settingsTouchedBy(rec, answers, fact)
      const kept = Object.fromEntries(Object.entries(overrides).filter(([id]) => !moved.includes(id as SetupSettingId)))
      return fitLook({ ...lookOf(settingsFor(rec, { ...answers, [fact]: value })), ...kept })
    }

    const answer = (fact: SetupBookFactId, value: string) => {
      const moved = settingsTouchedBy(rec, answers, fact)
      setAnswers({ ...answers, [fact]: value })
      setAnswered((a) => (a.includes(fact) ? a : [...a, fact]))
      setOverrides((o) => Object.fromEntries(Object.entries(o).filter(([id]) => !moved.includes(id as SetupSettingId))))
    }

    const set = (id: SetupSettingId, raw: string) => {
      const value = parse(id, raw)
      // The preset is the rulebook's answer to the genre (one to one): changing it answers that fact.
      const genre = id === "preset" ? genreFor(value) : null
      if (genre) return answer("genre", genre)
      const next: Partial<Look> = { ...overrides }
      if (value === base[id]) delete next[id]
      else (next as Record<string, unknown>)[id] = value
      setOverrides(next)
    }

    /** The settings to create the book with, as the engine's decided row (the rule says "user" where the user changed it). */
    const decided: SetupDecided = fitPreset(
      Object.fromEntries(SETTING_IDS.map((id) => [id, id in overrides ? { value: look[id], rule: "user" } : ruled[id]!])) as SetupDecided,
    )

    return { rec, answers, answered, look, ai, base, pending, source, lookFor, answer, set, decided, rule: (id: SetupSettingId) => ruled[id]?.rule }
  }, [rec, answers, answered, overrides])
}

export type CanvasSetup = NonNullable<ReturnType<typeof useSetup>>
