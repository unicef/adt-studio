import { describe, expect, it, vi } from "vitest"
import type { SetupRecommendation } from "@adt/types"
import askKind from "../../engine/fixtures/asks-kind.json"
import spread from "../../engine/fixtures/spread-no-questions.json"
import textbook from "../../engine/fixtures/textbook.json"
import twoQuestions from "../../engine/fixtures/two-questions.json"
import { proposedAnswers } from "../../engine/answers"
import { bookLanguage, CHECK_START, checkScreens, moveCheck, screenFacts, screenOf, screenSure, shownScreen, type CheckState, type ScreenId } from "./screens"

// The macros aren't compiled under vitest; the preset constants use them.
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray) => ({ id: strings.join("") }) }))

const as = (json: unknown) => json as SetupRecommendation
const screensOf = (rec: SetupRecommendation) => checkScreens(rec, proposedAnswers(rec))
const ids = (rec: SetupRecommendation, screen: ScreenId) => screenFacts(rec, proposedAnswers(rec), screen).map((f) => f.id)

describe("which screens show", () => {
  it("leaves Activities out for a story the engine is sure of", () => {
    expect(screensOf(as(spread))).toEqual(["kind", "language", "look", "pages", "name"])
  })

  it("shows Activities for a school book, with both exercises and labelled pictures", () => {
    expect(screensOf(as(textbook))).toEqual(["kind", "language", "look", "pages", "activities", "name"])
    expect(ids(as(textbook), "activities")).toEqual(["exercises", "diagrams"])
  })

  it("shows Activities when the engine asks about labelled pictures, with only that item", () => {
    expect(screensOf(as(twoQuestions))).toContain("activities")
    expect(ids(as(twoQuestions), "activities")).toEqual(["diagrams"])
  })

  it("follows the answers: calling the book a school book brings Activities in", () => {
    const rec = as(askKind)
    expect(checkScreens(rec, proposedAnswers(rec))).not.toContain("activities")
    expect(checkScreens(rec, { ...proposedAnswers(rec), genre: "textbook" })).toContain("activities")
  })

  it("picks the layout itself on Look when where the words sit doesn't change it", () => {
    expect(ids(as(textbook), "look")).toEqual([])
    expect(ids(as(spread), "look")).toEqual(["composition"])
  })
})

describe("sure vs asked", () => {
  it("is sure on every screen when nothing is asked", () => {
    const rec = as(spread)
    for (const s of screensOf(rec)) expect(screenSure(rec, proposedAnswers(rec), s)).toBe(true)
  })

  it("asks on the screens of the asked facts only", () => {
    const rec = as(twoQuestions)
    const sure = Object.fromEntries(screensOf(rec).map((s) => [s, screenSure(rec, proposedAnswers(rec), s)]))
    expect(sure).toEqual({ kind: true, language: true, look: false, pages: true, activities: false, name: true })
    expect(screenSure(as(askKind), proposedAnswers(as(askKind)), "kind")).toBe(false)
  })

  it("maps each fact to its screen", () => {
    expect([screenOf("genre"), screenOf("composition"), screenOf("exercises"), screenOf("diagrams")]).toEqual(["kind", "look", "activities", "activities"])
  })
})

describe("moving through Check", () => {
  const screens: ScreenId[] = ["kind", "look", "pages", "activities", "name"]
  const run = (actions: Parameters<typeof moveCheck>[1][], from: CheckState = CHECK_START) => actions.reduce((s, a) => moveCheck(s, a, screens), from)

  it("goes forward and back, marking the screens passed", () => {
    const s = run([{ type: "next" }, { type: "next" }, { type: "back" }])
    expect(s.at).toBe("look")
    expect(s.done).toEqual(["kind", "look"])
  })

  it("skips to the end with every screen before it passed", () => {
    const s = run([{ type: "end" }])
    expect(s.at).toBe("name")
    expect(s.done).toEqual(["kind", "look", "pages", "activities"])
  })

  it("only opens screens already passed", () => {
    expect(run([{ type: "go", to: "pages" }]).at).toBe("kind")
    expect(run([{ type: "next" }, { type: "next" }, { type: "go", to: "kind" }]).at).toBe("kind")
  })

  it("comes back to the summary after an Edit from it", () => {
    const s = run([{ type: "end" }, { type: "go", to: "look", edit: true }])
    expect(s.at).toBe("look")
    expect(run([{ type: "next" }], s).at).toBe("name")
  })

  it("moves off a screen that stopped applying", () => {
    expect(shownScreen({ ...CHECK_START, at: "activities" }, ["kind", "look", "pages", "name"])).toBe("name")
  })
})

describe("book language", () => {
  it("takes the engine's language, else what the PDF says", () => {
    expect(bookLanguage({ ...as(spread), language: { code: "sq", source: "ai" } })).toBe("sq")
    expect(bookLanguage({ ...as(spread), language: { code: null, source: null } })).toBeNull()
    expect(bookLanguage({ ...as(spread), language: undefined, measured: { ...as(spread).measured, language: "pt" } })).toBe("pt")
  })
})
