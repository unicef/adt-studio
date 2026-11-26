// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { SetupRecommendation } from "@adt/types"
import textbook from "../../lab/fixtures/textbook.json"
import { useAnswers } from "./useAnswers"

// The macros aren't compiled under vitest; the preset constants use them.
vi.mock("@lingui/core/macro", () => ({ msg: (strings: TemplateStringsArray) => ({ id: strings.join("") }) }))
vi.mock("@lingui/react/macro", () => ({ Trans: ({ children }: { children?: unknown }) => children, useLingui: () => ({ t: (s: TemplateStringsArray) => s.join("") }) }))

const rec = textbook as unknown as SetupRecommendation

afterEach(cleanup)

const value = (r: { current: ReturnType<typeof useAnswers> }, id: keyof SetupRecommendation["settings"]) => r.current.derived!.effective[id]?.value

describe("useAnswers", () => {
  it("starts from the engine's settings", () => {
    const { result } = renderHook(() => useAnswers(rec))
    expect(value(result, "preset")).toBe("textbook")
    expect(value(result, "activitiesGenerator")).toBe(true)
    expect(value(result, "sectioningMode")).toBe("dynamic")
  })

  it("lets a newer answer clear the hand changes it moves, and keeps the others", () => {
    const { result } = renderHook(() => useAnswers(rec))
    act(() => result.current.override("renderStrategy", "two_column"))
    act(() => result.current.override("figureExtraction", "off"))
    expect(result.current.overrides).toEqual({ renderStrategy: "two_column", figureExtraction: "off" })
    expect(result.current.derived!.source("renderStrategy")).toBe("changed")

    // Reference moves the render strategy (to Single Column), but not figure extraction for these answers.
    act(() => result.current.answer("genre", "reference"))
    expect(result.current.overrides.renderStrategy).toBeUndefined()
    expect(value(result, "renderStrategy")).toBe("single_column")
    expect(result.current.overrides.figureExtraction).toBe("off")
    expect(value(result, "figureExtraction")).toBe("off")
  })

  it("treats a hand change of the preset as an answer to the genre, so the rulebook sets the rest", () => {
    const { result } = renderHook(() => useAnswers(rec))
    act(() => result.current.override("preset", "storybook"))
    expect(result.current.answers.genre).toBe("story")
    expect(result.current.overrides.preset).toBeUndefined()
    // A storybook gets the rulebook's story row, not School book settings with a new name.
    expect(value(result, "preset")).toBe("storybook")
    expect(value(result, "activitiesGenerator")).toBe(false)
    expect(value(result, "sectioningMode")).toBe("page")
  })

  it("keeps a preset the rulebook never picks as a hand change, fitted to the preset", () => {
    const { result } = renderHook(() => useAnswers(rec))
    act(() => result.current.override("renderStrategy", "two_column_story"))
    act(() => result.current.override("preset", "reference"))
    // Reference doesn't offer Two Column Story; the guard falls back to the preset's own strategy.
    expect(value(result, "preset")).toBe("reference")
    expect(value(result, "renderStrategy")).not.toBe("two_column_story")
  })

  it("reset forgets every answer and change", () => {
    const { result } = renderHook(() => useAnswers(rec))
    act(() => result.current.override("preset", "storybook"))
    act(() => result.current.override("figureExtraction", "off"))
    act(() => result.current.reset())
    expect(result.current.answers).toEqual({})
    expect(result.current.overrides).toEqual({})
    expect(value(result, "preset")).toBe("textbook")
  })
})
