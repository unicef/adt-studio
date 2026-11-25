import { describe, expect, it, vi } from "vitest"
import type { I18n } from "@lingui/core"
import type { SetupRecommendation } from "@adt/types"
import textbook from "../lab/fixtures/textbook.json"
import { toSetupResult } from "./toSetupResult"

// The macros aren't compiled under vitest; the preset constants and the words use them.
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray) => ({ id: strings.join("") }) }))
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children?: unknown }) => children, useLingui: () => ({ t: (s: TemplateStringsArray) => s.join("") }) }))

const i18n = { _: (m: { id?: string } | string) => (typeof m === "string" ? m : (m.id ?? "")) } as unknown as I18n
const base = structuredClone(textbook) as unknown as SetupRecommendation

describe("toSetupResult", () => {
  it("reports the readings' time as the AI time, not the measurement", () => {
    const rec = { ...base, timings: { ...base.timings, factsMs: 3, questionsMs: 4100, labelsMs: 5200 } }
    expect(toSetupResult(rec, i18n, "en").timing?.inferenceMs).toBe(5200)
  })

  it("offers an alternative when the engine asks because it saw few body pages", () => {
    // Both readings agree that there are many diagrams, but there were too few body pages to be sure.
    const facts = base.facts.map((f) => (f.id === "diagrams" ? { ...f, secondOpinion: f.value, ask: true, askReason: "few-body-pages" as const } : { ...f, ask: false, askReason: null }))
    const result = toSetupResult({ ...base, facts }, i18n, "en")
    expect(result.recommendation.figureExtraction.alternative).toBe("off")
    expect(result.recommendation.figureExtraction.confidence).toBe("medium")
    expect(result.recommendation.figureExtraction.ambiguityReason).toMatch(/only a few pages/)
  })

  it("offers no alternative when nothing is asked", () => {
    const facts = base.facts.map((f) => ({ ...f, ask: false, askReason: null }))
    const result = toSetupResult({ ...base, facts }, i18n, "en")
    expect(Object.values(result.recommendation).every((d) => d.alternative === null)).toBe(true)
  })
})
