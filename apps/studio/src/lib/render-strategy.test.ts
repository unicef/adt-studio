import { describe, expect, it } from "vitest"
import {
  isFixedLayoutConfig,
  listDefaultRenderStrategies,
  listSelectableRenderStrategies,
  normalizeDefaultRenderStrategy,
} from "./render-strategy"

describe("listSelectableRenderStrategies", () => {
  it("filters out activity strategies", () => {
    const strategies = {
      llm: { render_type: "llm" },
      two_column: { render_type: "template" },
      activity_multiple_choice: { render_type: "activity" },
    }

    expect(listSelectableRenderStrategies(strategies)).toEqual([
      "llm",
      "two_column",
    ])
  })

  it("filters out fixed_layout (not a per-section override)", () => {
    const strategies = {
      llm: { render_type: "llm" },
      fixed_layout: { render_type: "fixed_layout" },
    }

    expect(listSelectableRenderStrategies(strategies)).toEqual(["llm"])
  })
})

describe("listDefaultRenderStrategies", () => {
  it("includes fixed_layout but still excludes activities", () => {
    const strategies = {
      llm: { render_type: "llm" },
      two_column: { render_type: "template" },
      fixed_layout: { render_type: "fixed_layout" },
      activity_multiple_choice: { render_type: "activity" },
    }

    expect(listDefaultRenderStrategies(strategies)).toEqual([
      "llm",
      "two_column",
      "fixed_layout",
    ])
  })
})

describe("isFixedLayoutConfig", () => {
  const strategies = {
    llm: { render_type: "llm" },
    two_column: { render_type: "template" },
    fixed_layout: { render_type: "fixed_layout" },
  }

  it("returns false for nullish config", () => {
    expect(isFixedLayoutConfig(undefined)).toBe(false)
    expect(isFixedLayoutConfig(null)).toBe(false)
  })

  it("is false for every non-fixed book type (the fixed_layout entry is only an available option)", () => {
    // A real book's render_strategies map always lists fixed_layout as an
    // available option — but the warning must only fire when it is the SELECTED
    // strategy. Every other book type must resolve to false.
    const fullStrategies = {
      single_column: { render_type: "template" },
      llm: { render_type: "llm" },
      "llm-overlay": { render_type: "llm" },
      two_column: { render_type: "template" },
      two_column_story: { render_type: "template" },
      fixed_layout: { render_type: "fixed_layout" },
    }
    for (const selected of [
      "single_column",
      "llm",
      "llm-overlay",
      "two_column",
      "two_column_story",
      "dynamic", // legacy sentinel
      "", // unset
    ]) {
      expect(
        isFixedLayoutConfig({
          default_render_strategy: selected,
          render_strategies: fullStrategies,
        })
      ).toBe(false)
    }
    // Config with no strategy fields at all.
    expect(isFixedLayoutConfig({})).toBe(false)
  })

  it("is true when the book-wide default resolves to fixed_layout", () => {
    expect(
      isFixedLayoutConfig({
        default_render_strategy: "fixed_layout",
        render_strategies: strategies,
      })
    ).toBe(true)
  })

  it("is false when the default resolves to a reflowable strategy", () => {
    expect(
      isFixedLayoutConfig({
        default_render_strategy: "two_column",
        render_strategies: strategies,
      })
    ).toBe(false)
  })

  it("is true when any per-section strategy is fixed_layout", () => {
    expect(
      isFixedLayoutConfig({
        default_render_strategy: "two_column",
        render_strategies: strategies,
        section_render_strategies: { chapter: "two_column", cover: "fixed_layout" },
      })
    ).toBe(true)
  })

  it("is false when a fixed_layout strategy exists but nothing references it", () => {
    expect(
      isFixedLayoutConfig({
        default_render_strategy: "two_column",
        render_strategies: strategies,
      })
    ).toBe(false)
  })
})

describe("normalizeDefaultRenderStrategy", () => {
  it("maps legacy dynamic to two_column when available", () => {
    const strategies = {
      llm: { render_type: "llm" },
      two_column: { render_type: "template" },
    }

    expect(normalizeDefaultRenderStrategy("dynamic", strategies)).toBe(
      "two_column"
    )
  })

  it("maps legacy dynamic to first non-activity strategy when two_column is missing", () => {
    const strategies = {
      llm_overlay: { render_type: "llm" },
      story: { render_type: "template" },
    }

    expect(normalizeDefaultRenderStrategy("dynamic", strategies)).toBe(
      "llm_overlay"
    )
  })

  it("keeps an explicit valid strategy", () => {
    const strategies = {
      llm: { render_type: "llm" },
      two_column: { render_type: "template" },
    }

    expect(normalizeDefaultRenderStrategy("llm", strategies)).toBe("llm")
  })

  it("falls back when requested strategy does not exist", () => {
    const strategies = {
      llm: { render_type: "llm" },
      two_column: { render_type: "template" },
    }

    expect(normalizeDefaultRenderStrategy("missing", strategies)).toBe(
      "two_column"
    )
  })

  it("allows fixed_layout as an explicit default", () => {
    const strategies = {
      llm: { render_type: "llm" },
      two_column: { render_type: "template" },
      fixed_layout: { render_type: "fixed_layout" },
    }

    expect(normalizeDefaultRenderStrategy("fixed_layout", strategies)).toBe(
      "fixed_layout"
    )
  })

  it("never auto-falls-back to fixed_layout", () => {
    const strategies = {
      two_column: { render_type: "template" },
      fixed_layout: { render_type: "fixed_layout" },
    }

    expect(normalizeDefaultRenderStrategy("dynamic", strategies)).toBe(
      "two_column"
    )
  })

  it("does not allow activity strategies as default", () => {
    const strategies = {
      llm: { render_type: "llm" },
      activity_multiple_choice: { render_type: "activity" },
    }

    expect(
      normalizeDefaultRenderStrategy("activity_multiple_choice", strategies)
    ).toBe("llm")
  })

  it("returns empty when there are no selectable strategies", () => {
    const strategies = {
      activity_multiple_choice: { render_type: "activity" },
    }

    expect(normalizeDefaultRenderStrategy("dynamic", strategies)).toBe("")
  })
})
