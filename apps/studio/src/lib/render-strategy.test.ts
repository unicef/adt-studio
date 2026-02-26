import { describe, expect, it } from "vitest"
import {
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
