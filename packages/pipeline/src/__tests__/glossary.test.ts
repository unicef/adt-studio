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
  getGlossaryItemTextId,
  mergeGeneratedGlossaryWithManualItems,
  regenerateGlossaryPreservingEdits,
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
      role_types: { section_text: "Main" },
      structure_types: { paragraph: "Para" },
    }
    const config = buildGlossaryConfig(appConfig, "English")
    expect(config.promptName).toBe("glossary")
    expect(config.modelId).toBe("openai:gpt-4.1")
    expect(config.maxRetries).toBe(5)
    expect(config.language).toBe("English")
    expect(config.batchSize).toBe(10)
  })

  it("uses glossary config overrides", () => {
    const appConfig: AppConfig = {
      role_types: { section_text: "Main" },
      structure_types: { paragraph: "Para" },
      glossary: {
        prompt: "custom_glossary",
        model: "openai:gpt-5.4",
        max_retries: 5,
      },
    }
    const config = buildGlossaryConfig(appConfig, "French")
    expect(config.promptName).toBe("custom_glossary")
    expect(config.modelId).toBe("openai:gpt-5.4")
    expect(config.maxRetries).toBe(5)
    expect(config.language).toBe("French")
  })

  it("falls back to page_sectioning model when glossary model not set", () => {
    const appConfig: AppConfig = {
      structure_types: { paragraph: "Para" },
      role_types: { text: "Main" },
      page_sectioning: { model: "openai:gpt-4.1-mini" },
    }
    const config = buildGlossaryConfig(appConfig, "en")
    expect(config.modelId).toBe("openai:gpt-4.1-mini")
  })

  it("reads amount, user prompt, and seed terms from app config", () => {
    const appConfig: AppConfig = {
      role_types: { section_text: "Main" },
      structure_types: { paragraph: "Para" },
      glossary_amount: "comprehensive",
      glossary_user_prompt: "Focus on scientific vocabulary.",
      glossary_seed_terms: [
        {
          id: "gl001",
          word: "Mitochondria",
          definition: "The powerhouse of the cell.",
          variations: ["mitochondrion"],
          emojis: ["🔬"],
        },
      ],
    }
    const config = buildGlossaryConfig(appConfig, "English")
    expect(config.amount).toBe("comprehensive")
    expect(config.userPrompt).toBe("Focus on scientific vocabulary.")
    expect(config.seedTerms).toHaveLength(1)
    expect(config.seedTerms?.[0].word).toBe("Mitochondria")
  })

  it("treats empty user prompt and empty seed_terms as undefined", () => {
    const appConfig: AppConfig = {
      role_types: { section_text: "Main" },
      structure_types: { paragraph: "Para" },
      glossary_user_prompt: "",
      glossary_seed_terms: [],
    }
    const config = buildGlossaryConfig(appConfig, "English")
    expect(config.userPrompt).toBeUndefined()
    expect(config.seedTerms).toBeUndefined()
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
        { role_types: {}, structure_types: {} },
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
      { role_types: {}, structure_types: {} },
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
        { role_types: {}, structure_types: {} },
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
          { role_types: {}, structure_types: {} },
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
      { role_types: {}, structure_types: {} },
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

  it("defaults amount, user_instructions, and seed_terms to empty in LLM context when unset", async () => {
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

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "" },
    ]

    let capturedContext: Record<string, unknown> | null = null
    const llmModel: LLMModel = {
      generateObject: async <T>(options: GenerateObjectOptions) => {
        capturedContext = options.context as Record<string, unknown>
        return {
          object: { reasoning: "", items: [] } as T,
        } as GenerateObjectResult<T>
      },
    }

    await generateGlossary({
      storage,
      pages,
      config: buildGlossaryConfig(
        { role_types: {}, structure_types: {} },
        "English"
      ),
      llmModel,
    })

    expect(capturedContext?.amount).toBe("")
    expect(capturedContext?.user_instructions).toBe("")
    expect(capturedContext?.seed_terms).toEqual([])
  })

  it("threads amount, user instructions, and seed term words into LLM context", async () => {
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

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "" },
    ]

    let capturedContext: Record<string, unknown> | null = null
    const llmModel: LLMModel = {
      generateObject: async <T>(options: GenerateObjectOptions) => {
        capturedContext = options.context as Record<string, unknown>
        return {
          object: { reasoning: "", items: [] } as T,
        } as GenerateObjectResult<T>
      },
    }

    await generateGlossary({
      storage,
      pages,
      config: {
        ...buildGlossaryConfig(
          { role_types: {}, structure_types: {} },
          "English"
        ),
        amount: "comprehensive",
        userPrompt: "Skip proper nouns.",
        seedTerms: [
          {
            id: "gl001",
            word: "Mitochondria",
            definition: "x",
            variations: [],
            emojis: [],
          },
          {
            id: "gl002",
            word: "Photosynthesis",
            definition: "y",
            variations: [],
            emojis: [],
          },
        ],
      },
      llmModel,
    })

    expect(capturedContext?.amount).toBe("comprehensive")
    expect(capturedContext?.user_instructions).toBe("Skip proper nouns.")
    expect(capturedContext?.seed_terms).toEqual([
      "Mitochondria",
      "Photosynthesis",
    ])
  })

  it("pins seed terms in output as manual items, overriding LLM duplicates", async () => {
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

    const pages: PageData[] = [
      { pageId: "pg001", pageNumber: 1, text: "" },
    ]

    // LLM returns a term that overlaps with a seed
    const llmModel = makeFakeLLMModel([
      [
        {
          word: "Mitochondria",
          definition: "LLM definition (should be overridden)",
          variations: ["mitochondrion"],
          emojis: ["🤖"],
        },
        {
          word: "Forest",
          definition: "A large area with trees",
          variations: ["forests"],
          emojis: ["🌲"],
        },
      ],
    ])

    const result = await generateGlossary({
      storage,
      pages,
      config: {
        ...buildGlossaryConfig(
          { role_types: {}, structure_types: {} },
          "English"
        ),
        seedTerms: [
          {
            id: "gl001",
            word: "Mitochondria",
            definition: "The powerhouse of the cell.",
            variations: ["mitochondrion"],
            emojis: ["🔬"],
          },
          {
            id: "gl002",
            word: "Symbiosis",
            definition: "A long-term relationship between species.",
            variations: [],
            emojis: ["🤝"],
          },
        ],
      },
      llmModel,
    })

    const mitochondria = result.items.find((i) => i.word === "Mitochondria")
    expect(mitochondria?.source).toBe("manual")
    expect(mitochondria?.definition).toBe("The powerhouse of the cell.")

    const symbiosis = result.items.find((i) => i.word === "Symbiosis")
    expect(symbiosis).toBeDefined()
    expect(symbiosis?.source).toBe("manual")

    const forest = result.items.find((i) => i.word === "Forest")
    expect(forest?.source).toBe("ai")
  })
})

describe("getGlossaryItemTextId", () => {
  it("preserves explicit glossary item ids", () => {
    expect(
      getGlossaryItemTextId({ id: "gl_manual_soil" }, 0),
    ).toBe("gl_manual_soil")
  })

  it("falls back to positional ids for legacy glossary items", () => {
    expect(
      getGlossaryItemTextId({}, 1),
    ).toBe("gl002")
  })
})

describe("regenerateGlossaryPreservingEdits", () => {
  it("preserves media for unchanged words and remaps shifted video ids", async () => {
    const rendering: WebRenderingOutput = {
      sections: [
        {
          sectionIndex: 0,
          sectionType: "content",
          reasoning: "",
          html: "<p>Ash, forest and river.</p>",
        },
      ],
    }
    const existing = {
      items: [
        {
          word: "Forest",
          definition: "Old trees",
          variations: [],
          emojis: ["🌲"],
          source: "ai" as const,
          imageId: "pg001_im001",
        },
        {
          id: "gl_manual_river",
          word: "River",
          definition: "A flow of water",
          variations: [],
          emojis: ["🏞️"],
          source: "manual" as const,
          imageId: "pg001_im002",
        },
      ],
      pageCount: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
    }
    const assignments: Array<{ videoId: string; sectionId: string | null }> = []
    const storage = {
      getLatestNodeData: (node: string, itemId: string) => {
        if (node === "glossary" && itemId === "book") {
          return { version: 1, data: existing }
        }
        if (node === "web-rendering" && itemId === "pg001") {
          return { version: 1, data: rendering }
        }
        return null
      },
      getSignLanguageVideos: () => [
        { videoId: "v1", sectionId: "gl001" },
        { videoId: "v2", sectionId: "gl_manual_river" },
        { videoId: "v3", sectionId: "pg001_sec001" },
        { videoId: "v4", sectionId: "gl099" },
      ],
      assignSignLanguageVideo: (videoId: string, sectionId: string | null) => {
        assignments.push({ videoId, sectionId })
      },
    } as unknown as Storage

    const result = await regenerateGlossaryPreservingEdits({
      storage,
      pages: [{ pageId: "pg001", pageNumber: 1, text: "" }],
      config: buildGlossaryConfig(
        { role_types: {}, structure_types: {} },
        "English",
      ),
      llmModel: makeFakeLLMModel([
        [
          {
            word: "Ash",
            definition: "Powder left after burning",
            variations: [],
            emojis: [],
          },
          {
            word: "Forest",
            definition: "A large area with trees",
            variations: ["forests"],
            emojis: ["🌲"],
          },
          {
            word: "River",
            definition: "Generated water flow",
            variations: ["rivers"],
            emojis: ["🌊"],
          },
        ],
      ]),
    })

    expect(result.items.map((item) => ({ word: item.word, imageId: item.imageId }))).toEqual([
      { word: "Ash", imageId: undefined },
      { word: "Forest", imageId: "pg001_im001" },
      { word: "River", imageId: "pg001_im002" },
    ])
    expect(assignments).toEqual([
      { videoId: "v1", sectionId: "gl002" },
      { videoId: "v2", sectionId: "gl003" },
      { videoId: "v4", sectionId: null },
    ])
  })

  it("detaches videos when their glossary word is removed", async () => {
    const rendering: WebRenderingOutput = {
      sections: [
        {
          sectionIndex: 0,
          sectionType: "content",
          reasoning: "",
          html: "<p>Forest.</p>",
        },
      ],
    }
    const existing = {
      items: [
        {
          word: "Mountain",
          definition: "High land",
          variations: [],
          emojis: [],
          source: "ai" as const,
          imageId: "pg001_im001",
        },
      ],
      pageCount: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
    }
    const assignments: Array<{ videoId: string; sectionId: string | null }> = []
    const storage = {
      getLatestNodeData: (node: string, itemId: string) => {
        if (node === "glossary" && itemId === "book") {
          return { version: 1, data: existing }
        }
        if (node === "web-rendering" && itemId === "pg001") {
          return { version: 1, data: rendering }
        }
        return null
      },
      getSignLanguageVideos: () => [
        { videoId: "v1", sectionId: "gl001" },
        { videoId: "v2", sectionId: "pg001_sec001" },
      ],
      assignSignLanguageVideo: (videoId: string, sectionId: string | null) => {
        assignments.push({ videoId, sectionId })
      },
    } as unknown as Storage

    const result = await regenerateGlossaryPreservingEdits({
      storage,
      pages: [{ pageId: "pg001", pageNumber: 1, text: "" }],
      config: buildGlossaryConfig(
        { role_types: {}, structure_types: {} },
        "English",
      ),
      llmModel: makeFakeLLMModel([
        [
          {
            word: "Forest",
            definition: "A large area with trees",
            variations: [],
            emojis: [],
          },
        ],
      ]),
    })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ word: "Forest" })
    expect(result.items[0].imageId).toBeUndefined()
    expect(assignments).toEqual([{ videoId: "v1", sectionId: null }])
  })
})

describe("mergeGeneratedGlossaryWithManualItems", () => {
  it("appends manual glossary items that do not exist in generated output", () => {
    const merged = mergeGeneratedGlossaryWithManualItems(
      {
        items: [
          {
            word: "Forest",
            definition: "Trees in one place",
            variations: ["forests"],
            emojis: ["🌲"],
            source: "ai",
          },
        ],
        pageCount: 1,
        generatedAt: "2026-01-01T00:00:00.000Z",
      },
      [
        {
          id: "gl_manual_river",
          source: "manual",
          word: "River",
          definition: "A long flow of water",
          variations: ["rivers"],
          emojis: ["🏞️"],
        },
      ],
    )

    expect(merged.items).toHaveLength(2)
    expect(merged.items[1]).toEqual({
      id: "gl_manual_river",
      source: "manual",
      word: "River",
      definition: "A long flow of water",
      variations: ["rivers"],
      emojis: ["🏞️"],
    })
  })

  it("preserves pruned AI items and drops re-generated ones that match", () => {
    const merged = mergeGeneratedGlossaryWithManualItems(
      {
        items: [
          {
            word: "Forest",
            definition: "Trees",
            variations: [],
            emojis: ["🌲"],
            source: "ai",
          },
          {
            word: "River",
            definition: "Water flow",
            variations: [],
            emojis: ["🏞️"],
            source: "ai",
          },
        ],
        pageCount: 1,
        generatedAt: "2026-01-01T00:00:00.000Z",
      },
      [
        {
          word: "River",
          definition: "Old definition",
          variations: [],
          emojis: ["🏞️"],
          source: "ai",
          pruned: true,
        },
      ],
    )

    const words = merged.items.map((item) => ({ word: item.word, pruned: item.pruned }))
    expect(words).toEqual([
      { word: "Forest", pruned: undefined },
      { word: "River", pruned: true },
    ])
  })

  it("lets manual glossary entries override generated ones while preserving generated ids", () => {
    const merged = mergeGeneratedGlossaryWithManualItems(
      {
        items: [
          {
            word: "Forest",
            definition: "AI definition",
            variations: ["forests"],
            emojis: ["🌲"],
            source: "ai",
          },
        ],
        pageCount: 1,
        generatedAt: "2026-01-01T00:00:00.000Z",
      },
      [
        {
          id: "gl_manual_forest",
          source: "manual",
          word: "Forest",
          definition: "Manual definition",
          variations: ["forest"],
          emojis: ["🌳"],
        },
      ],
    )

    expect(merged.items).toEqual([
      {
        id: "gl001",
        source: "manual",
        word: "Forest",
        definition: "Manual definition",
        variations: ["forest"],
        emojis: ["🌳"],
      },
    ])
  })
})
