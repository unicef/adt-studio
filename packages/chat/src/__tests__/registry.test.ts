import { describe, expect, it } from "vitest"
import { z } from "zod"
import { createChatToolRegistry, defineChatTool } from "../registry.js"
import { deriveThreadTitle, firstUserText } from "../title.js"
import { availableChatModels, chatProviderOf } from "../models.js"

const noopTool = (name: string, mutating = false) =>
  defineChatTool<unknown, Record<string, never>>({
    name,
    description: name,
    inputSchema: z.object({}),
    mutating,
    execute: () => null,
  })

describe("chat tool registry", () => {
  it("registers and looks up tools by name", () => {
    const registry = createChatToolRegistry([noopTool("get_book_overview")])
    registry.register(noopTool("run_stages", true))

    expect(registry.names()).toEqual(["get_book_overview", "run_stages"])
    expect(registry.get("run_stages")?.mutating).toBe(true)
    expect(registry.get("nope")).toBeUndefined()
  })

  it("refuses a duplicate registration", () => {
    const registry = createChatToolRegistry([noopTool("list_pages")])
    expect(() => registry.register(noopTool("list_pages"))).toThrow(/already registered/)
  })
})

describe("thread titles", () => {
  it("uses the first user text message", () => {
    expect(
      firstUserText([
        { id: "a", role: "assistant", parts: [{ type: "text", text: "hi" }] },
        { id: "u", role: "user", parts: [{ type: "text", text: "  Summarise   page 3 " }] },
      ]),
    ).toBe("Summarise   page 3")
  })

  it("truncates long titles with an ellipsis", () => {
    const title = deriveThreadTitle("a".repeat(200))
    expect(title).toHaveLength(60)
    expect(title.endsWith("…")).toBe(true)
  })

  it("keeps short titles intact", () => {
    expect(deriveThreadTitle("  Fix the\nglossary  ")).toBe("Fix the glossary")
  })
})

describe("chat models", () => {
  it("parses the provider out of a model id", () => {
    expect(chatProviderOf("anthropic:claude-opus-4")).toBe("anthropic")
    expect(chatProviderOf("gpt-5.4")).toBe("openai")
    expect(() => chatProviderOf("mistral:large")).toThrow(/Unsupported chat provider/)
  })

  it("only offers models whose provider has a key", () => {
    const models = availableChatModels({ googleApiKey: "g" })
    expect(models.length).toBeGreaterThan(0)
    expect(models.every((m) => m.provider === "google")).toBe(true)
    expect(availableChatModels({})).toEqual([])
  })
})
