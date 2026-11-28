import { describe, expect, it } from "vitest"
import { taskConfigPath } from "@adt/types"
import { writePath } from "./bookConfigPath"

const activity = { kind: "render-strategy" as const, configKey: "activity_matching" }

describe("writePath", () => {
  it("creates the nested block a render strategy override needs", () => {
    const config: Record<string, unknown> = {}
    writePath(config, taskConfigPath(activity, "model"), "openai:gpt-5.4")
    expect(config).toEqual({ render_strategies: { activity_matching: { config: { model: "openai:gpt-5.4" } } } })
  })

  it("resetting a pinned model keeps the rest of the saved strategy block", () => {
    const config: Record<string, unknown> = {
      render_strategies: {
        activity_matching: { render_type: "activity", config: { prompt: "activity_matching", model: "openai:gpt-5.4" } },
      },
    }
    writePath(config, taskConfigPath(activity, "model"), null)
    expect(config).toEqual({
      render_strategies: { activity_matching: { render_type: "activity", config: { prompt: "activity_matching" } } },
    })
  })

  it("removes blocks left empty so the book inherits the global config", () => {
    const config: Record<string, unknown> = { book_outline: { reasoning_effort: "low" }, start_page: 3 }
    writePath(config, taskConfigPath({ kind: "step", configKey: "book_outline" }, "reasoning_effort"), null)
    expect(config).toEqual({ start_page: 3 })
  })
})
