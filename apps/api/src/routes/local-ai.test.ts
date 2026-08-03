import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createLocalAIRoutes, recommendLocalGemma } from "./local-ai.js"
import type { LocalLlmRuntime } from "../services/local-llm-runtime.js"

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

function fakeRuntime(): LocalLlmRuntime {
  return {
    status: () => ({
      runtime: "embedded-llama.cpp",
      runtimeAvailable: true,
      runtimeVersion: "b10236",
      state: "stopped",
      backend: "detecting",
      device: null,
      deviceMemoryBytes: null,
      modelGpuMemoryBytes: null,
      loadedModelId: null,
      endpoint: null,
      contextSize: 8192,
      gpuLayersRequested: 99,
      gpuLayersLoaded: null,
      processId: null,
      requests: 0,
      lastRequestMs: null,
      promptTokensPerSecond: null,
      generatedTokensPerSecond: null,
      error: null,
    }),
    ensureRunning: vi.fn(),
    stop: vi.fn(),
    recordResponse: vi.fn(),
  }
}

describe("recommendLocalGemma", () => {
  it.each([
    [8, "local:gemma4-e2b"],
    [16, "local:gemma4-e4b"],
    [24, "local:gemma4-12b"],
    [32, "local:gemma4-12b"],
    [48, "local:gemma4-26b"],
    [64, "local:gemma4-26b"],
  ])("recommends a safe tier for %d GiB", (gib, expected) => {
    expect(recommendLocalGemma(gib * 1024 ** 3).id).toBe(expected)
  })
})

describe("local AI routes", () => {
  it("reports the embedded runtime and hardware recommendation", async () => {
    const modelsDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-local-ai-test-"))
    temporaryDirectories.push(modelsDir)
    const app = createLocalAIRoutes({
      totalMemoryBytes: 32 * 1024 ** 3,
      modelsDir,
      runtime: fakeRuntime(),
    })

    const response = await app.request("/local-ai/status")
    const body = await response.json() as {
      runtime: string
      runtimeAvailable: boolean
      recommendedModelId: string
      models: Array<{ id: string; installed: boolean }>
    }

    expect(response.status).toBe(200)
    expect(body.runtime).toBe("embedded-llama.cpp")
    expect(body.runtimeAvailable).toBe(true)
    expect(body.recommendedModelId).toBe("local:gemma4-12b")
    expect(body.models.every((model) => !model.installed)).toBe(true)
  })

  it("does not expose arbitrary model names to the pull endpoint", async () => {
    const app = createLocalAIRoutes({ runtime: fakeRuntime() })
    const response = await app.request("/local-ai/pull", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modelId: "local:untrusted" }),
    })

    expect(response.status).toBe(400)
  })

  it("authenticates the private llama.cpp proxy with its internal key", async () => {
    const runtime = fakeRuntime()
    vi.mocked(runtime.ensureRunning).mockResolvedValue({ baseUrl: "http://127.0.0.1:4567/v1", apiKey: "secret" })
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [] }), {
      headers: { "Content-Type": "application/json" },
    }))
    const app = createLocalAIRoutes({ runtime, fetchImpl })

    const response = await app.request("/local-ai/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer local" },
      body: JSON.stringify({ model: "gemma4-e2b", messages: [] }),
    })

    expect(response.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:4567/v1/chat/completions",
      expect.objectContaining({ headers: expect.any(Headers) }),
    )
    const headers = vi.mocked(fetchImpl).mock.calls[0][1]?.headers as Headers
    expect(headers.get("authorization")).toBe("Bearer secret")
  })
})
