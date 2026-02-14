import { describe, expect, it } from "vitest"
import type { AppConfig, WebRenderingOutput } from "@adt/types"
import type {
  GenerateObjectOptions,
  GenerateObjectResult,
  LLMModel,
} from "@adt/llm"
import type { Storage, PageData } from "@adt/storage"
import {
  stripHtml,
  buildGlossaryConfig,
  collectPageTexts,
  generateGlossary,
} from "../glossary.js"

describe("stripHtml", () => {
  it("strips HTML tags", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world")
  })

  it("decodes HTML entities", () => {
    expect(stripHtml("&amp; &lt; &gt; &quot; &#39;")).toBe('& < > " \'')
  })

  it("handles &nbsp;", () => {
    expect(stripHtml("hello&nbsp;world")).toBe("hello world")
  })

  it("collapses whitespace", () => {
    expect(stripHtml("<p>Hello</p>  <p>World</p>")).toBe("Hello World")
  })

  it("returns empty string for empty input", () => {
    expect(stripHtml("")).toBe("")
  })

  it("handles nested tags", () => {
    expect(
      stripHtml('<div class="x"><span>text</span></div>')
    ).toBe("text")
  })
})

describe("buildGlossaryConfig", () => {
  it("uses defaults when no config specified", () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Main" },
      text_group_types: { paragraph: "Para" },
    }
    const config = buildGlossaryConfig(appConfig, "English")
    expect(config.promptName).toBe("glossary")
    expect(config.modelId).toBe("openai:gpt-4.1")
    expect(config.maxRetries).toBe(2)
    expect(config.language).toBe("English")
    expect(config.batchSize).toBe(10)
  })

  it("uses glossary config overrides", () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Main" },
      text_group_types: { paragraph: "Para" },
      glossary: {
        prompt: "custom_glossary",
        model: "openai:gpt-5.2",
        max_retries: 5,
      },
    }
    const config = buildGlossaryConfig(appConfig, "French")
    expect(config.promptName).toBe("custom_glossary")
    expect(config.modelId).toBe("openai:gpt-5.2")
    expect(config.maxRetries).toBe(5)
    expect(config.language).toBe("French")
  })

  it("falls back to text_classification model when glossary model not set", () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Main" },
      text_group_types: { paragraph: "Para" },
      text_classification: { model: "openai:gpt-4.1-mini" },
    }
    const config = buildGlossaryConfig(appConfig, "en")
    expect(config.modelId).toBe("openai:gpt-4.1-mini")
  })
})

describe("collectPageTexts", () => {
  it("extracts text from rendered pages", () => {
    const rendering: WebRenderingOutput = {
      sections: [
        { sectionIndex: 0, sectionType: "content", reasoning: "", html: "<p>Hello world</p>" },
        { sectionIndex: 1, sectionType: "content", reasoning: "", html: "<p>Second section</p>" },
      ],
    }
    const storage = {
      getLatestNodeData: (node: string, _itemId: string) => {
        if (node === "web-rendering") {
          return { version: 1, data: rendering }
        }
        return null
      },
    } as Storage

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "raw" },
    ]

    const result = collectPageTexts(storage, pages)
    expect(result).toHaveLength(1)
    expect(result[0].pageNumber).toBe(1)
    expect(result[0].text).toBe("Hello world Second section")
  })

  it("skips pages without rendering", () => {
    const storage = {
      getLatestNodeData: () => null,
    } as unknown as Storage

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "raw" },
    ]

    const result = collectPageTexts(storage, pages)
    expect(result).toHaveLength(0)
  })
})

function makeFakeLLMModel(
  batchResponses: Array<{ word: string; definition: string; variations: string[]; emojis: string[] }[]>,
  onCall?: (options: GenerateObjectOptions, callIndex: number) => void
): LLMModel {
  let callIndex = 0
  return {
    generateObject: async <T>(options: GenerateObjectOptions) => {
      const idx = callIndex++
      onCall?.(options, idx)
      const items = batchResponses[idx] ?? []
      return {
        object: { reasoning: "test", items } as T,
        usage: { inputTokens: 10, outputTokens: 10 },
      } as GenerateObjectResult<T>
    },
  }
}

describe("generateGlossary", () => {
  it("generates glossary from rendered pages", async () => {
    const rendering: WebRenderingOutput = {
      sections: [
        { sectionIndex: 0, sectionType: "content", reasoning: "", html: "<p>The forest is green</p>" },
      ],
    }
    const storage = {
      getLatestNodeData: (node: string) => {
        if (node === "web-rendering") return { version: 1, data: rendering }
        return null
      },
    } as Storage

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "" },
    ]

    const llmModel = makeFakeLLMModel([
      [
        { word: "Forest", definition: "A large area with trees", variations: ["forests"], emojis: ["🌲"] },
      ],
    ])

    const result = await generateGlossary({
      storage,
      pages,
      config: buildGlossaryConfig(
        { text_types: {}, text_group_types: {} },
        "English"
      ),
      llmModel,
    })

    expect(result.items).toHaveLength(1)
    expect(result.items[0].word).toBe("Forest")
    expect(result.pageCount).toBe(1)
    expect(result.generatedAt).toBeTruthy()
  })

  it("deduplicates words case-insensitively, first wins", async () => {
    const mkRendering = (html: string): WebRenderingOutput => ({
      sections: [{ sectionIndex: 0, sectionType: "content", reasoning: "", html }],
    })

    let callCount = 0
    const storage = {
      getLatestNodeData: (node: string) => {
        if (node === "web-rendering") {
          callCount++
          return {
            version: 1,
            data: mkRendering(`<p>page ${callCount}</p>`),
          }
        }
        return null
      },
    } as Storage

    // 2 pages, batch size 1 to force 2 LLM calls
    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "" },
      { pageId: "pg002", pageNumber: 2, text: "" },
    ]

    const llmModel = makeFakeLLMModel([
      [
        { word: "Forest", definition: "First definition", variations: ["forests"], emojis: ["🌲"] },
        { word: "River", definition: "A body of water", variations: ["rivers"], emojis: ["🏞️"] },
      ],
      [
        { word: "forest", definition: "Second definition (should be ignored)", variations: [], emojis: [] },
        { word: "Mountain", definition: "A tall landform", variations: ["mountains"], emojis: ["⛰️"] },
      ],
    ])

    const config = buildGlossaryConfig(
      { text_types: {}, text_group_types: {} },
      "English"
    )
    // Force batch size of 1 to test batching
    config.batchSize = 1

    const result = await generateGlossary({
      storage,
      pages,
      config,
      llmModel,
    })

    expect(result.items).toHaveLength(3)
    // Sorted alphabetically
    expect(result.items.map((i) => i.word)).toEqual(["Forest", "Mountain", "River"])
    // First definition wins for Forest
    expect(result.items[0].definition).toBe("First definition")
  })

  it("returns empty glossary when no pages have renderings", async () => {
    const storage = {
      getLatestNodeData: () => null,
    } as unknown as Storage

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "" },
    ]

    let called = false
    const llmModel: LLMModel = {
      generateObject: async <T>() => {
        called = true
        return { object: { reasoning: "", items: [] } as T }
      },
    }

    const result = await generateGlossary({
      storage,
      pages,
      config: buildGlossaryConfig(
        { text_types: {}, text_group_types: {} },
        "English"
      ),
      llmModel,
    })

    expect(result.items).toHaveLength(0)
    expect(result.pageCount).toBe(0)
    expect(called).toBe(false)
  })

  it("throws controlled error for invalid web-rendering payload", async () => {
    const storage = {
      getLatestNodeData: (node: string) => {
        if (node === "web-rendering") {
          return { version: 1, data: { sections: null } }
        }
        return null
      },
    } as Storage

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "" },
    ]

    const llmModel = makeFakeLLMModel([])

    await expect(
      generateGlossary({
        storage,
        pages,
        config: buildGlossaryConfig(
          { text_types: {}, text_group_types: {} },
          "English"
        ),
        llmModel,
      })
    ).rejects.toThrow("Invalid web-rendering output for page: pg001")
  })

  it("batches pages correctly", async () => {
    const rendering: WebRenderingOutput = {
      sections: [
        { sectionIndex: 0, sectionType: "content", reasoning: "", html: "<p>text</p>" },
      ],
    }
    const storage = {
      getLatestNodeData: (node: string) => {
        if (node === "web-rendering") return { version: 1, data: rendering }
        return null
      },
    } as Storage

    // 15 pages with batch size 10 = 2 batches (10 + 5)
    const pages: PageData[] = Array.from({ length: 15 }, (_, i) => ({
      pageId: `pg${String(i + 1).padStart(3, "0")}`,
      pageNumber: i + 1,
      text: "",
    }))

    const batchSizes: number[] = []
    const llmModel: LLMModel = {
      generateObject: async <T>(options: GenerateObjectOptions) => {
        const ctx = options.context as { pages: unknown[] }
        batchSizes.push(ctx.pages.length)
        return {
          object: { reasoning: "", items: [] } as T,
          usage: { inputTokens: 10, outputTokens: 10 },
        } as GenerateObjectResult<T>
      },
    }

    const config = buildGlossaryConfig(
      { text_types: {}, text_group_types: {} },
      "English"
    )

    await generateGlossary({
      storage,
      pages,
      config,
      llmModel,
    })

    expect(batchSizes).toEqual([10, 5])
  })
})
