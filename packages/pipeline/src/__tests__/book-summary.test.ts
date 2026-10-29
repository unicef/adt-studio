import { describe, it, expect, vi } from "vitest"
import {
  generateBookSummary,
  buildBookSummaryConfig,
  selectBookSummaryInput,
  buildBookSummaryInput,
  describeBookSummarySelection,
  bookSummaryWarning,
  summarizeBookOptionally,
  evenlySpacedIndices,
  BOOK_SUMMARY_MAX_PAGE_CHARS,
  BOOK_SUMMARY_MAX_TOTAL_CHARS,
  BOOK_SUMMARY_MAX_RENDER_PAGES,
} from "../book-summary.js"
import type { BookSummaryConfig, BookSummaryPageInput, BookSummarySourcePage } from "../book-summary.js"
import type { BookSummaryOutput, AppConfig } from "@adt/types"
import type { LLMModel, GenerateObjectResult, GenerateObjectOptions } from "@adt/llm"

function makeFakeLLMModel(response: BookSummaryOutput): LLMModel {
  return {
    generateObject: async <T>() => ({
      object: response as T,
      usage: { inputTokens: 100, outputTokens: 50 },
    }) as GenerateObjectResult<T>,
  }
}

function capturingModel(response: BookSummaryOutput): { model: LLMModel; options: () => GenerateObjectOptions } {
  let captured: unknown
  const model: LLMModel = {
    generateObject: async <T>(options: unknown) => {
      captured = options
      return {
        object: response as T,
        usage: { inputTokens: 100, outputTokens: 50 },
      } as GenerateObjectResult<T>
    },
  }
  return { model, options: () => captured as GenerateObjectOptions }
}

const sampleSummary: BookSummaryOutput = {
  summary: "A short summary of the book.",
}

function sourcePages(count: number, text: (pageNumber: number) => string): BookSummarySourcePage[] {
  return Array.from({ length: count }, (_, index) => ({
    pageId: `pg${String(index + 1).padStart(3, "0")}`,
    pageNumber: index + 1,
    text: text(index + 1),
  }))
}

describe("evenlySpacedIndices", () => {
  it("returns every index when the count covers the total", () => {
    expect(evenlySpacedIndices(3, 3)).toEqual([0, 1, 2])
    expect(evenlySpacedIndices(3, 5)).toEqual([0, 1, 2])
  })

  it("spreads the picks over the range, first and last included", () => {
    expect(evenlySpacedIndices(12, 8)).toEqual([0, 2, 3, 5, 6, 8, 9, 11])
    expect(evenlySpacedIndices(100, 4)).toEqual([0, 33, 66, 99])
    expect(evenlySpacedIndices(10, 1)).toEqual([0])
  })

  it("is empty for an empty range or no picks", () => {
    expect(evenlySpacedIndices(0, 4)).toEqual([])
    expect(evenlySpacedIndices(4, 0)).toEqual([])
  })
})

describe("selectBookSummaryInput", () => {
  it("drops pages without a text layer and keeps the rest in page order", () => {
    const pages: BookSummarySourcePage[] = [
      { pageId: "pg003", pageNumber: 3, text: "third" },
      { pageId: "pg001", pageNumber: 1, text: "first" },
      { pageId: "pg002", pageNumber: 2, text: "   \n " },
    ]
    const selection = selectBookSummaryInput(pages)
    expect(selection.pages).toEqual([
      { pageNumber: 1, text: "first" },
      { pageNumber: 3, text: "third" },
    ])
    expect(selection.textPages).toBe(2)
    expect(selection.totalPages).toBe(3)
    expect(selection.sampled).toBe(false)
  })

  it("cuts long pages at a word boundary and marks the cut", () => {
    const word = "palabra "
    const long = word.repeat(600) // 4,800 chars
    const [page] = selectBookSummaryInput([{ pageId: "pg001", pageNumber: 1, text: long }]).pages
    expect(page.text.length).toBeLessThanOrEqual(BOOK_SUMMARY_MAX_PAGE_CHARS + " […]".length)
    expect(page.text.endsWith("palabra […]")).toBe(true)
    expect(page.text).not.toContain("palabr […]")
  })

  it("counts characters, not UTF-16 units, when cutting a page", () => {
    const text = "😀".repeat(30)
    const [page] = selectBookSummaryInput([{ pageId: "pg001", pageNumber: 1, text }], { maxPageChars: 10 }).pages
    expect(Array.from(page.text.replace(" […]", ""))).toHaveLength(10)
  })

  it("keeps every page while the total fits the budget", () => {
    const pages = sourcePages(30, () => "x".repeat(BOOK_SUMMARY_MAX_PAGE_CHARS))
    const selection = selectBookSummaryInput(pages)
    expect(selection.pages).toHaveLength(30)
    expect(selection.sampled).toBe(false)
  })

  it("samples pages evenly once the total exceeds the budget, cut marks included", () => {
    const pages = sourcePages(500, (n) => `page ${n} ` + "x".repeat(3_000))
    const selection = selectBookSummaryInput(pages)
    const total = selection.pages.reduce((sum, page) => sum + Array.from(page.text).length, 0)
    expect(total).toBeLessThanOrEqual(BOOK_SUMMARY_MAX_TOTAL_CHARS)
    // Each kept page is maxPageChars plus the mark, so one fewer than the naive 30 fit.
    expect(selection.pages).toHaveLength(Math.floor(BOOK_SUMMARY_MAX_TOTAL_CHARS / (BOOK_SUMMARY_MAX_PAGE_CHARS + " […]".length)))
    expect(selection.pages[0].pageNumber).toBe(1)
    expect(selection.pages[selection.pages.length - 1].pageNumber).toBe(500)
    expect(selection.sampled).toBe(true)
    expect(selection.renderPageIds).toEqual([])
  })

  it("keeps as many short pages as the budget allows instead of a fixed count", () => {
    // 400 pages × 200 chars = 80k: just over the budget, so 300 of them still fit.
    const pages = sourcePages(400, () => "y".repeat(200))
    const selection = selectBookSummaryInput(pages)
    expect(selection.pages).toHaveLength(300)
    expect(selection.sampled).toBe(true)
    const total = selection.pages.reduce((sum, page) => sum + page.text.length, 0)
    expect(total).toBe(BOOK_SUMMARY_MAX_TOTAL_CHARS)
  })

  it("measures the budget in characters, not UTF-16 units", () => {
    const pages = sourcePages(40, () => "😀".repeat(1_800))
    const selection = selectBookSummaryInput(pages)
    const total = selection.pages.reduce((sum, page) => sum + Array.from(page.text).length, 0)
    expect(total).toBeLessThanOrEqual(BOOK_SUMMARY_MAX_TOTAL_CHARS)
    expect(selection.pages.length).toBeGreaterThanOrEqual(33)
  })

  it("keeps the largest even sample that fits, even when a smaller one does not", () => {
    // Four pages do not fit (the even pick lands on both long pages) but five do.
    const sizes = [1, 10, 1, 1, 10, 1, 1]
    const pages = sizes.map((size, index) => ({ pageId: `pg00${index + 1}`, pageNumber: index + 1, text: "a".repeat(size) }))
    const selection = selectBookSummaryInput(pages, { maxTotalChars: 9 })
    expect(selection.pages.map((page) => page.pageNumber)).toEqual([1, 3, 4, 6, 7])
  })

  it("never exceeds the budget, even when one page alone is longer", () => {
    const selection = selectBookSummaryInput(sourcePages(3, () => "word ".repeat(400)), { maxPageChars: 2_000, maxTotalChars: 500 })
    const total = selection.pages.reduce((sum, page) => sum + Array.from(page.text).length, 0)
    expect(total).toBeLessThanOrEqual(500)
    expect(selection.pages.length).toBeGreaterThan(0)
  })

  it("cuts at any whitespace, not only a space", () => {
    const text = Array.from({ length: 300 }, (_, i) => `línea${i}`).join("\n")
    const [page] = selectBookSummaryInput([{ pageId: "pg001", pageNumber: 1, text }], { maxPageChars: 100 }).pages
    expect(page.text).toMatch(/^línea0\n(línea\d+\n)*línea\d+ \[…\]$/)
    expect(Array.from(page.text).length).toBeLessThanOrEqual(104)
  })

  it("is deterministic for the same pages", () => {
    const pages = sourcePages(120, (n) => `page ${n} ` + "y".repeat(1_500))
    expect(selectBookSummaryInput(pages)).toEqual(selectBookSummaryInput([...pages].reverse()))
  })

  it("asks for page renders spread over the book when almost no page has text", () => {
    const pages = sourcePages(100, (n) => (n === 50 ? "the only text" : ""))
    const selection = selectBookSummaryInput(pages)
    expect(selection.pages).toEqual([{ pageNumber: 50, text: "the only text" }])
    expect(selection.renderPageIds).toHaveLength(BOOK_SUMMARY_MAX_RENDER_PAGES)
    expect(selection.renderPageIds[0]).toBe("pg001")
    expect(selection.renderPageIds[BOOK_SUMMARY_MAX_RENDER_PAGES - 1]).toBe("pg100")
    expect(selection.renderPageIds).toEqual([...selection.renderPageIds].sort())
    // The page whose text is already sent is not rendered again.
    expect(selection.renderPageIds).not.toContain("pg050")
  })

  it("draws the renders from the pages without text", () => {
    const pages = sourcePages(20, (n) => (n % 10 === 1 ? "texto" : ""))
    const selection = selectBookSummaryInput(pages, { maxRenderPages: 3 })
    expect(selection.pages.map((page) => page.pageNumber)).toEqual([1, 11])
    expect(selection.renderPageIds).toEqual(["pg002", "pg012", "pg020"])
  })

  it("renders every page of a small image-only book", () => {
    const selection = selectBookSummaryInput(sourcePages(3, () => ""))
    expect(selection.pages).toEqual([])
    expect(selection.renderPageIds).toEqual(["pg001", "pg002", "pg003"])
  })

  it("sends no renders when at least a fifth of the pages have text", () => {
    const pages = sourcePages(10, (n) => (n <= 2 ? "text" : ""))
    expect(selectBookSummaryInput(pages).renderPageIds).toEqual([])
    const weaker = sourcePages(10, (n) => (n <= 1 ? "text" : ""))
    expect(selectBookSummaryInput(weaker).renderPageIds).toHaveLength(8)
  })

  it("asks for nothing on an empty book", () => {
    const selection = selectBookSummaryInput([])
    expect(selection).toEqual({ pages: [], renderPageIds: [], textPages: 0, totalPages: 0, sampled: false })
  })
})

describe("buildBookSummaryInput", () => {
  it("loads only the selected renders and labels them with their page number", () => {
    const pages = sourcePages(4, () => "")
    const selection = selectBookSummaryInput(pages, { maxRenderPages: 2 })
    const loaded: string[] = []
    const input = buildBookSummaryInput(selection, pages, (pageId) => {
      loaded.push(pageId)
      return `img-${pageId}`
    })
    expect(loaded).toEqual(["pg001", "pg004"])
    expect(input.renders).toEqual([
      { pageNumber: 1, imageBase64: "img-pg001" },
      { pageNumber: 4, imageBase64: "img-pg004" },
    ])
    expect(input.pages).toEqual([])
  })

  it("refuses a selection that names a page the book does not have", () => {
    const pages = sourcePages(1, () => "")
    const selection = { ...selectBookSummaryInput(pages), renderPageIds: ["pg999"] }
    expect(() => buildBookSummaryInput(selection, pages, () => "x")).toThrow("unknown page: pg999")
  })
})

describe("describeBookSummarySelection", () => {
  it("names the sample, the renders and the sampling", () => {
    const pages = sourcePages(100, (n) => (n === 1 ? "cover" : ""))
    expect(describeBookSummarySelection(selectBookSummaryInput(pages))).toBe(
      "1 of 1 text page(s), 100 page(s) in the book, 8 page render(s)",
    )
    const big = sourcePages(500, () => "z".repeat(3_000))
    expect(describeBookSummarySelection(selectBookSummaryInput(big))).toBe(
      "29 of 500 text page(s), 500 page(s) in the book, sampled to fit the input budget",
    )
  })
})

describe("bookSummaryWarning", () => {
  it("is a summary-missing step warning carrying a bounded, one-line error", () => {
    expect(bookSummaryWarning(new Error("model  does not\nexist"))).toEqual({ kind: "summary-missing", error: "model does not exist" })
    const warning = bookSummaryWarning("x".repeat(400))
    expect(warning.kind === "summary-missing" && warning.error).toBe("x".repeat(119) + "…")
  })
})

describe("summarizeBookOptionally", () => {
  const config: BookSummaryConfig = { promptName: "book_summary", modelId: "openai:gpt-4o", maxRetries: 0, outputLanguage: "en" }
  const input = { pages: [{ pageNumber: 1, text: "Some text" }] }
  const model = (call: () => Promise<unknown>, render: () => Promise<unknown> = async () => []): LLMModel => ({
    renderPrompt: render as LLMModel["renderPrompt"],
    generateObject: (async () => ({ object: await call(), usage: { inputTokens: 1, outputTokens: 1 } })) as LLMModel["generateObject"],
  })

  it("returns the summary when the model call succeeds", async () => {
    expect(await summarizeBookOptionally(input, config, model(async () => sampleSummary))).toEqual({ summary: sampleSummary })
  })

  it("returns a summary-missing warning when the model call fails", async () => {
    const outcome = await summarizeBookOptionally(input, config, model(async () => { throw new Error("HTTP 404: no such model") }))
    expect(outcome).toEqual({ warning: { kind: "summary-missing", error: "HTTP 404: no such model" } })
  })

  it("lets a broken prompt template fail the step instead of becoming a warning", async () => {
    const generate = vi.fn(async () => sampleSummary)
    const broken = model(generate, async () => { throw new Error("Liquid syntax error: unexpected token") })
    await expect(summarizeBookOptionally(input, config, broken)).rejects.toThrow("Liquid syntax error")
    expect(generate).not.toHaveBeenCalled()
  })

  it("rethrows what the caller classifies as a cancellation", async () => {
    const cancelled = new Error("Run cancelled")
    await expect(summarizeBookOptionally(input, config, model(async () => { throw cancelled }), (err) => err === cancelled)).rejects.toBe(cancelled)
  })
})

describe("generateBookSummary", () => {
  const config: BookSummaryConfig = {
    promptName: "book_summary",
    modelId: "openai:gpt-4o",
    maxRetries: 5,
    outputLanguage: "fr-FR",
  }

  it("returns summary from LLM", async () => {
    const pages: BookSummaryPageInput[] = [
      { pageNumber: 1, text: "Sample page text" },
    ]

    const result = await generateBookSummary(
      { pages },
      config,
      makeFakeLLMModel(sampleSummary)
    )

    expect(result).toEqual(sampleSummary)
  })

  it("throws when neither text nor renders are provided", async () => {
    await expect(
      generateBookSummary(
        { pages: [], renders: [] },
        config,
        makeFakeLLMModel(sampleSummary)
      )
    ).rejects.toThrow("No page text or page renders provided for book summary")
  })

  it("accepts renders alone for an image-only book", async () => {
    const { model, options } = capturingModel(sampleSummary)
    await generateBookSummary(
      { pages: [], renders: [{ pageNumber: 1, imageBase64: "AAAA" }] },
      config,
      model,
    )
    const ctx = options().context as { pages: unknown[]; page_renders: unknown[] }
    expect(ctx.pages).toEqual([])
    expect(ctx.page_renders).toEqual([{ pageNumber: 1, imageBase64: "AAAA" }])
  })

  it("passes output language context to prompt", async () => {
    const pages: BookSummaryPageInput[] = [
      { pageNumber: 1, text: "Page one" },
      { pageNumber: 2, text: "Page two" },
    ]

    const { model, options } = capturingModel(sampleSummary)
    await generateBookSummary({ pages }, config, model)

    const opts = options()
    const ctx = opts.context as {
      pages: BookSummaryPageInput[]
      page_renders: unknown[]
      output_language_code: string
      output_language: string
    }
    expect(opts.prompt).toBe("book_summary")
    expect(ctx.pages).toHaveLength(2)
    expect(ctx.page_renders).toEqual([])
    expect(ctx.output_language_code).toBe("fr-FR")
    expect(ctx.output_language).toBe("French (France)")
  })
})

describe("buildBookSummaryConfig", () => {
  it("extracts prompt/model/output language from AppConfig", () => {
    const appConfig: AppConfig = {
      role_types: { heading: "Heading" },
      structure_types: { paragraph: "Paragraph" },
      editing_language: "pt_br",
      book_summary: {
        prompt: "custom_summary",
        model: "openai:gpt-4.1-mini",
        max_retries: 10,
      },
    }

    const config = buildBookSummaryConfig(appConfig)
    expect(config.promptName).toBe("custom_summary")
    expect(config.modelId).toBe("openai:gpt-4.1-mini")
    expect(config.maxRetries).toBe(10)
    expect(config.outputLanguage).toBe("pt-BR")
  })

  it("defaults prompt/model/output language", () => {
    const appConfig: AppConfig = {
      role_types: { heading: "Heading" },
      structure_types: { paragraph: "Paragraph" },
    }

    const config = buildBookSummaryConfig(appConfig)
    expect(config.promptName).toBe("book_summary")
    expect(config.modelId).toBe("openai:gpt-5.4")
    expect(config.maxRetries).toBe(5)
    expect(config.outputLanguage).toBe("en")
  })
})
