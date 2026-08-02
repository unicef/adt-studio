import { describe, expect, it, vi } from "vitest"
import { createLocalAIRoutes, recommendLocalGemma } from "./local-ai.js"

describe("recommendLocalGemma", () => {
  it.each([
    [8, "ollama:gemma4-e2b"],
    [16, "ollama:gemma4-e4b"],
    [24, "ollama:gemma4-12b"],
    [32, "ollama:gemma4-12b"],
    [48, "ollama:gemma4-26b"],
    [64, "ollama:gemma4-31b"],
  ])("recommends a safe tier for %d GiB", (gib, expected) => {
    expect(recommendLocalGemma(gib * 1024 ** 3).id).toBe(expected)
  })
})

describe("local AI routes", () => {
  it("reports installed models and the hardware recommendation", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      models: [{ name: "gemma4:26b" }],
    })))
    const app = createLocalAIRoutes({ fetchImpl, totalMemoryBytes: 32 * 1024 ** 3 })

    const response = await app.request("/local-ai/status")
    const body = await response.json() as {
      runtimeAvailable: boolean
      recommendedModelId: string
      models: Array<{ id: string; installed: boolean }>
    }

    expect(response.status).toBe(200)
    expect(body.runtimeAvailable).toBe(true)
    expect(body.recommendedModelId).toBe("ollama:gemma4-12b")
    expect(body.models.find((model) => model.id === "ollama:gemma4-26b")?.installed).toBe(true)
  })

  it("does not expose arbitrary model names to the pull endpoint", async () => {
    const fetchImpl = vi.fn()
    const app = createLocalAIRoutes({ fetchImpl })
    const response = await app.request("/local-ai/pull", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId: "ollama:untrusted" }),
    })

    expect(response.status).toBe(400)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
