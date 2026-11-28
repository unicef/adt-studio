import { describe, expect, it, vi } from "vitest"
import { SetupRecommendation } from "@adt/types"
import asksKind from "./fixtures/asks-kind.json"
import spreadNoQuestions from "./fixtures/spread-no-questions.json"
import textbook from "./fixtures/textbook.json"
import twoQuestions from "./fixtures/two-questions.json"
import { RULE_WHY } from "./words"

// The macros aren't compiled under vitest.
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray) => ({ id: strings.join("") }) }))

// The screens' tests read these saved engine answers: they must still be what the engine sends.
describe("engine fixtures", () => {
  it.each([
    ["asks-kind", asksKind],
    ["spread-no-questions", spreadNoQuestions],
    ["textbook", textbook],
    ["two-questions", twoQuestions],
  ])("%s fits the wire schema, and every rule it names has plain words", (_name, fixture) => {
    const rec = SetupRecommendation.parse(fixture)
    for (const decided of [rec.settings, ...Object.values(rec.settingsByFacts)])
      for (const pick of Object.values(decided)) expect(RULE_WHY[pick!.rule], pick!.rule).toBeDefined()
  })
})
