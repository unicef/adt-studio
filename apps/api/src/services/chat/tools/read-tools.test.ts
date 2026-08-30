import { afterEach, beforeEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createBookStorage } from "@adt/storage"
import type { ChatToolContext } from "../context.js"
import type { StageService } from "../../stage-service.js"
import type { TaskService } from "../../task-service.js"
import {
  getBookOverview,
  getPage,
  getStageConfig,
  getStageOutput,
  getTranslations,
  listPages,
} from "./read-tools.js"
import { budgetedPage, clampText } from "./budget.js"

const LABEL = "tool-book"

let booksDir: string
let ctx: ChatToolContext

function seedPage(pageId: string, pageNumber: number, text: string) {
  const storage = createBookStorage(LABEL, booksDir)
  try {
    storage.putExtractedPage({
      pageId,
      pageNumber,
      text,
      pageImage: {
        imageId: `${pageId}_page`,
        buffer: Buffer.from("fake"),
        format: "png",
        hash: `hash-${pageId}`,
        width: 100,
        height: 100,
      },
      images: [],
    })
  } finally {
    storage.close()
  }
}

function putNode(node: string, itemId: string, data: unknown) {
  const storage = createBookStorage(LABEL, booksDir)
  try {
    storage.putNodeData(node, itemId, data)
  } finally {
    storage.close()
  }
}

function sectioning(texts: string[]) {
  return {
    reasoning: "",
    sections: texts.map((text, index) => ({
      sectionId: `s${index}`,
      sectionType: "content",
      backgroundColor: "#fff",
      textColor: "#000",
      pageNumber: 1,
      isPruned: false,
      nodes: [{ nodeId: `n${index}`, isPruned: false, role: "paragraph", text }],
    })),
  }
}

beforeEach(() => {
  booksDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-chat-tools-"))
  createBookStorage(LABEL, booksDir).close()
  ctx = {
    paths: {
      booksDir,
      promptsDir: path.join(booksDir, "prompts"),
      webAssetsDir: path.join(booksDir, "assets"),
      configPath: path.join(booksDir, "config.yaml"),
    },
    safeLabel: LABEL,
    chatId: "chat-1",
    threadId: "thread-1",
    credentials: {},
    locale: "en",
    screen: {},
    stageService: {} as StageService,
    taskService: {} as TaskService,
  }
})

afterEach(() => {
  fs.rmSync(booksDir, { recursive: true, force: true })
})

describe("budget helpers", () => {
  it("marks clamped text and leaves short text alone", () => {
    expect(clampText("hello", 10)).toEqual({ text: "hello", truncated: false })
    const clamped = clampText("abcdefghij", 4)
    expect(clamped).toEqual({ text: "abcd…", truncated: true })
  })

  it("stops at the row limit and reports the next offset", () => {
    const page = budgetedPage([1, 2, 3, 4, 5], (n) => ({ n }), { offset: 1, limit: 2 })
    expect(page.items).toEqual([{ n: 2 }, { n: 3 }])
    expect(page).toMatchObject({ total: 5, offset: 1, returned: 2, truncated: true, nextOffset: 3 })
  })

  it("stops at the character budget before the row limit", () => {
    const long = "x".repeat(500)
    const page = budgetedPage([long, long, long], (text) => ({ text }), {
      limit: 10,
      charBudget: 900,
    })
    expect(page.returned).toBe(1)
    expect(page.nextOffset).toBe(1)
  })

  it("always returns at least one item, even when it alone busts the budget", () => {
    const page = budgetedPage(["x".repeat(5000)], (text) => ({ text }), { charBudget: 10 })
    expect(page.returned).toBe(1)
    expect(page.nextOffset).toBeNull()
  })
})

describe("get_book_overview", () => {
  it("reports metadata, page count and per-stage status", async () => {
    seedPage("pg001", 1, "Once upon a time")
    putNode("metadata", "book", {
      title: "A Book",
      authors: ["Ada"],
      publisher: null,
      language_code: "en",
      cover_page_number: 1,
      reasoning: "",
    })
    putNode("book-summary", "book", { summary: "A story about testing." })

    const result = (await getBookOverview.execute(ctx, undefined as never)) as {
      title: string
      authors: string[]
      pageCount: number
      summary: string
      stages: Array<{ stage: string; status: string }>
    }

    expect(result.title).toBe("A Book")
    expect(result.authors).toEqual(["Ada"])
    expect(result.pageCount).toBe(1)
    expect(result.summary).toBe("A story about testing.")
    expect(result.stages.find((stage) => stage.stage === "extract")?.status).toBe("idle")
  })

  it("marks a stage as running while one of its steps runs", async () => {
    const storage = createBookStorage(LABEL, booksDir)
    try {
      storage.markStepStarted("page-sectioning")
    } finally {
      storage.close()
    }

    const result = (await getBookOverview.execute(ctx, undefined as never)) as {
      stages: Array<{ stage: string; status: string }>
    }
    expect(result.stages.find((stage) => stage.stage === "sectioning")?.status).toBe("running")
  })
})

describe("list_pages", () => {
  it("previews each page and paginates", async () => {
    seedPage("pg001", 1, "raw one")
    seedPage("pg002", 2, "raw two")
    putNode("page-sectioning", "pg001", sectioning(["Sectioned one"]))

    const first = (await listPages.execute(ctx, { offset: 0, limit: 1 } as never)) as {
      items: Array<{ pageId: string; sectionCount: number; preview: string }>
      nextOffset: number | null
    }
    expect(first.items).toHaveLength(1)
    expect(first.items[0]).toMatchObject({
      pageId: "pg001",
      sectionCount: 1,
      preview: "Sectioned one",
    })
    expect(first.nextOffset).toBe(1)

    const second = (await listPages.execute(ctx, { offset: 1, limit: 1 } as never)) as {
      items: Array<{ pageId: string; preview: string }>
      nextOffset: number | null
    }
    expect(second.items[0]).toMatchObject({ pageId: "pg002", preview: "raw two" })
    expect(second.nextOffset).toBeNull()
  })
})

describe("get_page", () => {
  it("returns section text and leaves HTML out by default", async () => {
    seedPage("pg001", 1, "raw")
    putNode("page-sectioning", "pg001", sectioning(["Hello there"]))
    putNode("web-rendering", "pg001", {
      sections: [{ sectionIndex: 0, sectionType: "content", reasoning: "", html: "<p>Hello</p>" }],
    })

    const withoutHtml = (await getPage.execute(ctx, {
      pageId: "pg001",
      includeHtml: false,
    } as never)) as { sections: Array<Record<string, unknown>> }
    expect(withoutHtml.sections[0]).toMatchObject({ text: "Hello there" })
    expect(withoutHtml.sections[0]).not.toHaveProperty("html")

    const withHtml = (await getPage.execute(ctx, {
      pageId: "pg001",
      includeHtml: true,
    } as never)) as { sections: Array<{ html: string }> }
    expect(withHtml.sections[0].html).toBe("<p>Hello</p>")
  })

  it("truncates a very long section and says so", async () => {
    seedPage("pg001", 1, "raw")
    putNode("page-sectioning", "pg001", sectioning(["y".repeat(9000)]))

    const result = (await getPage.execute(ctx, {
      pageId: "pg001",
      includeHtml: false,
    } as never)) as { sections: Array<{ text: string; textTruncated: boolean }> }
    expect(result.sections[0].textTruncated).toBe(true)
    expect(result.sections[0].text.length).toBeLessThan(9000)
  })

  it("explains what to do when the page has no sectioning", async () => {
    const result = (await getPage.execute(ctx, {
      pageId: "pg404",
      includeHtml: false,
    } as never)) as { status: string; message: string }
    expect(result.status).toBe("not-found")
    expect(result.message).toMatch(/list_pages/)
  })
})

describe("get_stage_output", () => {
  it("reads a book-level node without an explicit item id", async () => {
    putNode("glossary", "book", { entries: [{ id: "gl001", word: "test", definition: "a check" }] })
    const result = (await getStageOutput.execute(ctx, { node: "glossary" } as never)) as {
      status: string
      data: unknown
    }
    expect(result.status).toBe("ok")
    expect(result.data).toMatchObject({ entries: [{ word: "test" }] })
  })

  it("refuses an unknown node and lists what is available", async () => {
    const result = (await getStageOutput.execute(ctx, { node: "nope" } as never)) as {
      status: string
      available: string[]
    }
    expect(result.status).toBe("unknown-node")
    expect(result.available).toContain("glossary")
  })

  it("asks for an item id on a page-scoped node", async () => {
    const result = (await getStageOutput.execute(ctx, { node: "page-sectioning" } as never)) as {
      status: string
    }
    expect(result.status).toBe("missing-item-id")
  })

  it("returns a capped preview instead of a huge payload", async () => {
    putNode("book-outline", "book", { entries: Array.from({ length: 4000 }, (_, i) => ({ id: `e${i}`, title: `Chapter ${i}` })) })
    const result = (await getStageOutput.execute(ctx, { node: "book-outline" } as never)) as {
      truncated?: boolean
      dataPreview?: string
      data?: unknown
    }
    expect(result.truncated).toBe(true)
    expect(result.data).toBeUndefined()
    expect(result.dataPreview?.length).toBeLessThanOrEqual(12_000)
  })
})

describe("get_translations", () => {
  beforeEach(() => {
    putNode("text-catalog", "book", {
      generatedAt: "2026-01-01T00:00:00.000Z",
      entries: [
        { id: "pg001_t001", text: "Hello" },
        { id: "pg001_im001", text: "A photo of a cat" },
        { id: "gl001", text: "glossary term" },
      ],
    })
  })

  it("returns the source catalog with categories when no language is asked for", async () => {
    const result = (await getTranslations.execute(ctx, { offset: 0, limit: 25 } as never)) as {
      status: string
      items: Array<{ id: string; category: string; translation?: string }>
    }
    expect(result.status).toBe("ok")
    expect(result.items.map((entry) => entry.category)).toEqual(["text", "captions", "glossary"])
    expect(result.items[0].translation).toBeUndefined()
  })

  it("pairs source and translation for a language", async () => {
    putNode("text-catalog-translation", "es", {
      generatedAt: "2026-01-01T00:00:00.000Z",
      entries: [{ id: "pg001_t001", text: "Hola" }],
    })

    const result = (await getTranslations.execute(ctx, {
      language: "es",
      offset: 0,
      limit: 25,
    } as never)) as { items: Array<{ id: string; source: string; translation: string }> }
    expect(result.items[0]).toMatchObject({ source: "Hello", translation: "Hola" })
    expect(result.items[2].translation).toBe("")
  })

  it("filters by category", async () => {
    const result = (await getTranslations.execute(ctx, {
      category: "captions",
      offset: 0,
      limit: 25,
    } as never)) as { items: Array<{ id: string }>; total: number }
    expect(result.total).toBe(1)
    expect(result.items[0].id).toBe("pg001_im001")
  })

  it("says which stage to run when the language is untranslated", async () => {
    const result = (await getTranslations.execute(ctx, {
      language: "fr",
      offset: 0,
      limit: 25,
    } as never)) as { status: string; message: string }
    expect(result.status).toBe("not-translated")
    expect(result.message).toMatch(/Translate stage/)
  })
})

describe("get_stage_config", () => {
  it("returns the book overrides and narrows them by stage", async () => {
    fs.writeFileSync(
      path.join(booksDir, LABEL, "config.yaml"),
      "glossary_amount: concise\nstoryboard_effort: high\n",
      "utf8",
    )

    const all = (await getStageConfig.execute(ctx, {} as never)) as {
      config: Record<string, unknown>
    }
    expect(all.config).toMatchObject({ glossary_amount: "concise", storyboard_effort: "high" })

    const narrowed = (await getStageConfig.execute(ctx, { stage: "glossary" } as never)) as {
      config: Record<string, unknown>
    }
    expect(narrowed.config).toEqual({ glossary_amount: "concise" })
  })

  it("says the defaults apply when nothing is overridden", async () => {
    const result = (await getStageConfig.execute(ctx, { stage: "speech" } as never)) as {
      message?: string
    }
    expect(result.message).toMatch(/global defaults/)
  })
})
