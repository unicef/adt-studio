import { describe, expect, it } from "vitest"
import type { AppConfig, ContentNodeData } from "@adt/types"
import type { LLMModel, GenerateObjectResult, GenerateObjectOptions } from "@adt/llm"
import { buildRenderStrategyResolver, renderPage, type RenderConfig } from "../web-rendering.js"
import { generateWithFallback } from "../render-llm.js"

const html = '<div id="content" class="container"><section data-section-type="text_only" data-section-id="pg001_sec001"><p data-id="pg001_t1">Hello</p></section></div>'

const sectioning = {
  reasoning: "",
  sections: [{
    sectionId: "pg001_sec001",
    sectionType: "text_only",
    nodes: [{ nodeId: "pg001_t1", isPruned: false, role: "text", text: "Hello" } satisfies ContentNodeData],
    backgroundColor: "#ffffff",
    textColor: "#000000",
    pageNumber: 1,
    isPruned: false,
  }],
}

const withFallback = (afterAttempts = 2): RenderConfig => ({
  renderType: "llm",
  promptName: "web_generation_html",
  modelId: "openai:gpt-6-luna",
  maxRetries: 5,
  timeoutMs: 180000,
  temperature: 0.3,
  answerPromptName: "",
  templateName: "",
  fallback: { modelId: "openai:gpt-6.1-sol", reasoningEffort: "medium", afterAttempts },
})

type Call = { model: string; maxRetries?: number; reasoningEffort?: string }

/** A resolver whose primary model fails (or succeeds) and records every call. */
function models(calls: Call[], primaryFails: boolean, fallbackFails = false) {
  const make = (id: string, fails: boolean): LLMModel => ({
    generateObject: async <T>(opts: GenerateObjectOptions) => {
      calls.push({ model: id, maxRetries: opts.maxRetries, reasoningEffort: opts.reasoningEffort })
      if (fails) throw new Error(`Failed after ${(opts.maxRetries ?? 0) + 1} attempts. Errors:\nMissing required text data-id: "pg001_t1"`)
      return { object: { reasoning: id, content: html } as T } as GenerateObjectResult<T>
    },
  })
  const primary = make("openai:gpt-6-luna", primaryFails)
  const fallback = make("openai:gpt-6.1-sol", fallbackFails)
  return (modelId: string) => (modelId === "openai:gpt-6.1-sol" ? fallback : primary)
}

const input = { label: "book", pageId: "pg001", pageImageBase64: "img", sectioning, images: new Map() }

describe("render-strategy fallback (#1259)", () => {
  it("reads the fallback block, defaulting to two primary attempts", () => {
    const appConfig: AppConfig = {
      role_types: { heading: "Heading" },
      structure_types: { paragraph: "Paragraph" },
      default_render_strategy: "llm",
      render_strategies: {
        llm: { render_type: "llm", config: { fallback: { model: "openai:gpt-6.1-sol", reasoning_effort: "medium" } } },
        plain: { render_type: "llm", config: {} },
      },
      section_render_strategies: { boxed_text: "plain" },
    }
    const resolve = buildRenderStrategyResolver(appConfig)
    expect(resolve("text_only").fallback).toEqual({ modelId: "openai:gpt-6.1-sol", reasoningEffort: "medium", afterAttempts: 2 })
    expect(resolve("boxed_text").fallback).toBeUndefined()
  })

  it("gives the fallback model the remaining attempts when the primary fails", async () => {
    const calls: Call[] = []
    const result = await renderPage(input, () => withFallback(), models(calls, true))
    expect(calls).toEqual([
      { model: "openai:gpt-6-luna", maxRetries: 1, reasoningEffort: undefined },
      { model: "openai:gpt-6.1-sol", maxRetries: 3, reasoningEffort: "medium" },
    ])
    expect(result.sections[0].reasoning).toBe("openai:gpt-6.1-sol")
  })

  it("never calls the fallback when the primary succeeds", async () => {
    const calls: Call[] = []
    await renderPage(input, () => withFallback(), models(calls, false))
    expect(calls.map((c) => c.model)).toEqual(["openai:gpt-6-luna"])
  })

  it("keeps every attempt on the primary when after_attempts covers them all", async () => {
    const calls: Call[] = []
    await renderPage(input, () => withFallback(6), models(calls, false))
    expect(calls).toEqual([{ model: "openai:gpt-6-luna", maxRetries: 5, reasoningEffort: undefined }])
  })

  it("does not fall back on a cancelled run", async () => {
    const calls: Call[] = []
    const controller = new AbortController()
    const cancelling: LLMModel = {
      generateObject: async () => {
        calls.push({ model: "openai:gpt-6-luna" })
        controller.abort()
        throw new Error("Operation aborted")
      },
    }
    await expect(renderPage(input, () => withFallback(), (id) => (id === "openai:gpt-6.1-sol" ? models(calls, false)(id) : cancelling), undefined, undefined, { signal: controller.signal }))
      .rejects.toThrow("Operation aborted")
    expect(calls.map((c) => c.model)).toEqual(["openai:gpt-6-luna"])
  })

  it("rethrows the fallback's own error, naming both models", async () => {
    const fallbackError = new Error("Failed after 4 attempts.")
    const thrown = await generateWithFallback(withFallback(), { fallbackModel: {} as LLMModel }, {
      primary: async () => { throw new Error("primary") },
      fallback: async () => { throw fallbackError },
    }).catch((err: unknown) => err)
    expect(thrown).toBe(fallbackError)
    expect((thrown as Error).message).toBe("openai:gpt-6-luna failed 2 attempt(s); then openai:gpt-6.1-sol: Failed after 4 attempts.")
  })
})
