import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { openBookDb, createBookStorage } from "@adt/storage"
import { zipSync } from "fflate"
import { SCHEMA_VERSION } from "@adt/types"
import type { StageName } from "@adt/types"
import type {
  StageService,
  StageRunJob,
  StageRunOptions,
} from "../services/stage-service.js"
import { createBookEventBus } from "../services/book-event-bus.js"
import { createBookRoutes } from "./books.js"
import { createStageRoutes } from "./stages.js"

const mockEventBus = createBookEventBus()

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-books-route-"))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function createTestBook(label: string): void {
  const bookDir = path.join(tmpDir, label)
  fs.mkdirSync(bookDir, { recursive: true })
  fs.mkdirSync(path.join(bookDir, "images"), { recursive: true })
  const db = openBookDb(path.join(bookDir, `${label}.db`))
  db.run(
    "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
    [
      "metadata",
      "book",
      1,
      JSON.stringify({
        title: "Test Book",
        authors: ["Author"],
        publisher: null,
        language_code: "en",
        cover_page_number: 1,
        reasoning: "test",
      }),
    ]
  )
  db.close()
  fs.writeFileSync(path.join(bookDir, `${label}.pdf`), "fake pdf")
}

function createLegacySchemaBook(label: string): void {
  const bookDir = path.join(tmpDir, label)
  fs.mkdirSync(bookDir, { recursive: true })
  const db = openBookDb(path.join(bookDir, `${label}.db`))
  db.run("UPDATE schema_version SET version = ? WHERE id = 1", [
    1,
  ])
  db.close()
  fs.writeFileSync(path.join(bookDir, `${label}.pdf`), "fake pdf")
}

describe("GET /books", () => {
  it("returns empty array when no books", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it("returns list of books", async () => {
    createTestBook("my-book")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books")
    expect(res.status).toBe(200)
    const books = await res.json()
    expect(books).toHaveLength(1)
    expect(books[0].label).toBe("my-book")
    expect(books[0].title).toBe("Test Book")
  })

  it("includes legacy schema books as needs rebuild instead of failing", async () => {
    createLegacySchemaBook("old-book")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books")
    expect(res.status).toBe(200)
    const books = await res.json()
    expect(books).toHaveLength(1)
    expect(books[0].label).toBe("old-book")
    expect(books[0].needsRebuild).toBe(true)
  })
})

describe("GET /books/:label", () => {
  it("returns book detail", async () => {
    createTestBook("detail")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/detail")
    expect(res.status).toBe(200)
    const book = await res.json()
    expect(book.label).toBe("detail")
    expect(book.metadata).toBeTruthy()
  })

  it("returns 404 for missing book", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/missing")
    expect(res.status).toBe(404)
  })

  it("returns 400 for invalid label", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/-bad")
    expect(res.status).toBe(400)
  })

  it("returns legacy schema books as needs rebuild", async () => {
    createLegacySchemaBook("old-book")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/old-book")
    expect(res.status).toBe(200)
    const book = await res.json()
    expect(book.needsRebuild).toBe(true)
    expect(book.rebuildReason).toContain("older storage schema")
  })
})

describe("POST /books", () => {
  it("creates a book with PDF upload", async () => {
    const app = createBookRoutes(tmpDir)
    const formData = new FormData()
    formData.append("label", "new-book")
    formData.append(
      "pdf",
      new Blob(["%PDF-1.0 fake"], { type: "application/pdf" }),
      "test.pdf"
    )

    const res = await app.request("/books", {
      method: "POST",
      body: formData,
    })
    expect(res.status).toBe(201)
    const book = await res.json()
    expect(book.label).toBe("new-book")
    expect(book.hasSourcePdf).toBe(true)

    expect(
      fs.existsSync(path.join(tmpDir, "new-book", "new-book.pdf"))
    ).toBe(true)
  })

  it("creates a book with config overrides", async () => {
    const app = createBookRoutes(tmpDir)
    const formData = new FormData()
    formData.append("label", "configured")
    formData.append(
      "pdf",
      new Blob(["%PDF-1.0"], { type: "application/pdf" }),
      "test.pdf"
    )
    formData.append(
      "config",
      JSON.stringify({ concurrency: 4 })
    )

    const res = await app.request("/books", {
      method: "POST",
      body: formData,
    })
    expect(res.status).toBe(201)
    expect(
      fs.existsSync(path.join(tmpDir, "configured", "config.yaml"))
    ).toBe(true)
  })

  it("returns 400 when label is missing", async () => {
    const app = createBookRoutes(tmpDir)
    const formData = new FormData()
    formData.append(
      "pdf",
      new Blob(["fake"], { type: "application/pdf" }),
      "test.pdf"
    )

    const res = await app.request("/books", {
      method: "POST",
      body: formData,
    })
    expect(res.status).toBe(400)
  })

  it("returns 400 when pdf is missing", async () => {
    const app = createBookRoutes(tmpDir)
    const formData = new FormData()
    formData.append("label", "no-pdf")

    const res = await app.request("/books", {
      method: "POST",
      body: formData,
    })
    expect(res.status).toBe(400)
  })

  it("returns 409 for duplicate label", async () => {
    createTestBook("duplicate")
    const app = createBookRoutes(tmpDir)
    const formData = new FormData()
    formData.append("label", "duplicate")
    formData.append(
      "pdf",
      new Blob(["fake"], { type: "application/pdf" }),
      "test.pdf"
    )

    const res = await app.request("/books", {
      method: "POST",
      body: formData,
    })
    expect(res.status).toBe(409)
  })
})

describe("DELETE /books/:label", () => {
  it("deletes a book", async () => {
    createTestBook("to-delete")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/to-delete", { method: "DELETE" })
    expect(res.status).toBe(200)
    expect(fs.existsSync(path.join(tmpDir, "to-delete"))).toBe(false)
  })

  it("returns 404 for missing book", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/ghost", { method: "DELETE" })
    expect(res.status).toBe(404)
  })
})

describe("GET /books/:label/config", () => {
  it("returns empty config when no overrides exist", async () => {
    createTestBook("config-test")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/config-test/config")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ config: {} })
  })

  it("returns config overrides when they exist", async () => {
    createTestBook("config-has")
    fs.writeFileSync(
      path.join(tmpDir, "config-has", "config.yaml"),
      "concurrency: 4\n"
    )
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/config-has/config")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.config).toEqual({ concurrency: 4 })
  })

  it("returns 404 for missing book", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/ghost/config")
    expect(res.status).toBe(404)
  })

  it("returns 400 for invalid label", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/-bad/config")
    expect(res.status).toBe(400)
  })
})

describe("PUT /books/:label/config", () => {
  it("writes config overrides and returns them", async () => {
    createTestBook("put-config")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/put-config/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: { concurrency: 8 } }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.config).toEqual({ concurrency: 8 })

    expect(
      fs.existsSync(path.join(tmpDir, "put-config", "config.yaml"))
    ).toBe(true)
  })

  it("persists image meaningfulness settings", async () => {
    createTestBook("meaningful-config")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/meaningful-config/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        config: {
          image_filters: {
            min_side: 100,
            max_side: 5000,
            min_stddev: 2,
            meaningfulness: false,
          },
          image_meaningfulness: {
            prompt: "image_meaningfulness",
            model: "openai:gpt-5.4",
          },
        },
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.config.image_filters).toEqual({
      min_side: 100,
      max_side: 5000,
      min_stddev: 2,
      meaningfulness: false,
    })
    expect(body.config.image_meaningfulness).toEqual({
      prompt: "image_meaningfulness",
      model: "openai:gpt-5.4",
    })
  })

  it("removes config file when empty overrides", async () => {
    createTestBook("clear-config")
    fs.writeFileSync(
      path.join(tmpDir, "clear-config", "config.yaml"),
      "concurrency: 4\n"
    )
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/clear-config/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: {} }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.config).toEqual({})
  })

  it("returns 404 for missing book", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/ghost/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: { concurrency: 2 } }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 400 for invalid label", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/-bad/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config: {} }),
    })
    expect(res.status).toBe(400)
  })

  it("returns 400 when config is missing from body", async () => {
    createTestBook("no-body")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/no-body/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })
})

describe("PUT /books/:label/metadata", () => {
  function seedDownstream(label: string, languageCode?: string): void {
    const storage = createBookStorage(label, tmpDir)
    try {
      if (languageCode) {
        storage.putNodeData("metadata", "book", {
          title: "Test Book",
          authors: ["Author"],
          publisher: null,
          language_code: languageCode,
          cover_page_number: 1,
          reasoning: "test",
        })
      }
      // page-sectioning must survive a language change; the rest must be cleared.
      storage.putNodeData("page-sectioning", "pg001", { sections: [] })
      storage.putNodeData("easy-read", "book", { blocks: [] })
      storage.putNodeData("quiz-generation", "book", { quizzes: [] })
      // book-summary (Extract stage) is written in the book's language and only
      // regenerates on a true base-language change.
      storage.putNodeData("book-summary", "book", { summary: "x" })
      storage.markStepCompleted("page-sectioning")
      storage.markStepCompleted("translation")
      storage.markStepCompleted("easy-read")
      storage.markStepCompleted("quiz-generation")
      storage.markStepCompleted("book-summary")
      storage.markStepCompleted("package-web")
    } finally {
      storage.close()
    }
  }

  function readMetadata(label: string) {
    const storage = createBookStorage(label, tmpDir)
    try {
      return storage.getLatestNodeData("metadata", "book")
    } finally {
      storage.close()
    }
  }

  function readState(label: string) {
    const storage = createBookStorage(label, tmpDir)
    try {
      const steps = new Map(storage.getStepRuns().map((r) => [r.step, r.status]))
      return {
        steps,
        easyRead: storage.getLatestNodeData("easy-read", "book"),
        quiz: storage.getLatestNodeData("quiz-generation", "book"),
        sectioning: storage.getLatestNodeData("page-sectioning", "pg001"),
        bookSummary: storage.getLatestNodeData("book-summary", "book"),
      }
    } finally {
      storage.close()
    }
  }

  it("updates bibliographic fields without cascading to LLM stages", async () => {
    createTestBook("meta-biblio")
    seedDownstream("meta-biblio")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/meta-biblio/metadata", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Edited Title",
        authors: ["New Author"],
        publisher: "New Publisher",
        language_code: "en",
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.languageChanged).toBe(false)
    expect(body.version).toBe(2)

    const stored = readMetadata("meta-biblio")
    expect(stored?.data).toMatchObject({
      title: "Edited Title",
      authors: ["New Author"],
      publisher: "New Publisher",
    })

    const state = readState("meta-biblio")
    // Bibliographic edits only refresh packaging.
    expect(state.steps.has("package-web")).toBe(false)
    expect(state.steps.get("easy-read")).toBe("done")
    expect(state.steps.get("translation")).toBe("done")
    expect(state.easyRead).not.toBeNull()
    expect(state.quiz).not.toBeNull()
  })

  it("cascades downstream LLM stages on a base-language change, signaling summary regen without clearing it", async () => {
    createTestBook("meta-lang") // seeded language "en"
    seedDownstream("meta-lang")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/meta-lang/metadata", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Test Book",
        authors: ["Author"],
        publisher: null,
        language_code: "fr",
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.languageChanged).toBe(true)
    // Signals the client to regenerate the summary via the dedicated endpoint.
    expect(body.baseLanguageChanged).toBe(true)

    const stored = readMetadata("meta-lang")
    expect((stored?.data as { language_code: string }).language_code).toBe("fr")

    const state = readState("meta-lang")
    // Language-dependent outputs cleared...
    expect(state.easyRead).toBeNull()
    expect(state.quiz).toBeNull()
    expect(state.steps.has("easy-read")).toBe(false)
    expect(state.steps.has("quiz-generation")).toBe(false)
    // ...but the book summary is NOT cleared here — it stays visible and is
    // refreshed via the book-summary regenerate endpoint, so Extract isn't reset.
    expect(state.bookSummary).not.toBeNull()
    expect(state.steps.get("book-summary")).toBe("done")
    // ...and Sectioning (page structure + in-place translation) survives.
    expect(state.sectioning).not.toBeNull()
    expect(state.steps.get("page-sectioning")).toBe("done")
    expect(state.steps.get("translation")).toBe("done")
  })

  it("keeps the book summary on a locale-only refinement (es -> es-UY)", async () => {
    createTestBook("meta-locale")
    seedDownstream("meta-locale", "es") // start from base Spanish
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/meta-locale/metadata", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Test Book",
        authors: ["Author"],
        publisher: null,
        language_code: "es-uy",
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.languageChanged).toBe(true)
    // Same base language → no summary regeneration signal.
    expect(body.baseLanguageChanged).toBe(false)

    const stored = readMetadata("meta-locale")
    // Normalized to BCP-47 dash form with uppercase region.
    expect((stored?.data as { language_code: string }).language_code).toBe("es-UY")

    const state = readState("meta-locale")
    // Language-dependent LLM outputs still re-run (the locale feeds prompts)...
    expect(state.easyRead).toBeNull()
    expect(state.steps.has("easy-read")).toBe(false)
    // ...but the book summary stays — same base language (Spanish).
    expect(state.bookSummary).not.toBeNull()
    expect(state.steps.get("book-summary")).toBe("done")
    expect(state.sectioning).not.toBeNull()
  })

  it("preserves cover_page_number and reasoning when the client omits them", async () => {
    createTestBook("meta-preserve")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/meta-preserve/metadata", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Only Title Changed",
        authors: ["Author"],
        publisher: null,
        language_code: "en",
      }),
    })
    expect(res.status).toBe(200)

    const stored = readMetadata("meta-preserve")
    expect(stored?.data).toMatchObject({
      title: "Only Title Changed",
      cover_page_number: 1,
      reasoning: "test",
    })
  })

  it("returns 404 when the book has no metadata to edit", async () => {
    const storage = createBookStorage("meta-empty", tmpDir)
    storage.close()
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/meta-empty/metadata", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x", authors: [], publisher: null, language_code: "en" }),
    })
    expect(res.status).toBe(404)
  })

  it("returns 400 for invalid label", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/-bad/metadata", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "x", authors: [], publisher: null, language_code: "en" }),
    })
    expect(res.status).toBe(400)
  })
})

function addPagesAndRenderings(label: string, count: number): void {
  const storage = createBookStorage(label, tmpDir)
  try {
    for (let i = 1; i <= count; i++) {
      const pageId = `${label}_p${i}`
      storage.putExtractedPage({
        pageId,
        pageNumber: i,
        text: `Page ${i}`,
        pageImage: {
          imageId: `${pageId}_page`,
          buffer: Buffer.from("fake-png"),
          format: "png",
          hash: `hash${i}`,
          width: 800,
          height: 600,
        },
        images: [],
      })
      storage.putNodeData("web-rendering", pageId, {
        sections: [{ html: `<p>Rendered page ${i}</p>` }],
      })
    }
  } finally {
    storage.close()
  }
}

function addExtractPages(label: string, count: number): void {
  const storage = createBookStorage(label, tmpDir)
  try {
    for (let i = 1; i <= count; i++) {
      const pageId = `${label}_p${i}`
      storage.putExtractedPage({
        pageId,
        pageNumber: i,
        text: `Page ${i}`,
        pageImage: {
          imageId: `${pageId}_page`,
          buffer: Buffer.from("fake-png"),
          format: "png",
          hash: `hash${i}`,
          width: 800,
          height: 600,
        },
        images: [],
      })
    }
  } finally {
    storage.close()
  }
}

function addExtractNodes(label: string, count: number, includeSummary = true): void {
  const storage = createBookStorage(label, tmpDir)
  try {
    for (let i = 1; i <= count; i++) {
      const pageId = `${label}_p${i}`
      storage.putNodeData("image-filtering", pageId, { images: [] })
    }
    if (includeSummary) {
      storage.putNodeData("book-summary", "book", { summary: "Test summary" })
    }
  } finally {
    storage.close()
  }
}

describe("POST /books/:label/stages/run", () => {
  it("passes renderOnly and preserves page sectioning data for storyboard reruns", async () => {
    const label = "render-only-route"
    createTestBook(label)
    const storage = createBookStorage(label, tmpDir)
    try {
      storage.putNodeData("page-sectioning", "pg001", {
        reasoning: "existing",
        sections: [],
      })
      storage.putNodeData("web-rendering", "pg001", {
        sections: [{ sectionIndex: 0, sectionType: "content", reasoning: "", html: "<p>x</p>" }],
      })
      storage.markStepCompleted("page-sectioning")
      storage.markStepCompleted("web-rendering")
    } finally {
      storage.close()
    }

    let receivedOptions: StageRunOptions | undefined
    const stageService: StageService = {
      getStatus: () => ({ active: null, queue: [] }),
      getQueuedStages: () => [],

      startStageRun: (_label, options) => {
        receivedOptions = options
        return { status: "started" as const, id: "run-1" }
      },
    }

    const app = createStageRoutes(stageService, mockEventBus, tmpDir, "", "")
    const res = await app.request(`/books/${label}/stages/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OpenAI-Key": "sk-test",
      },
      body: JSON.stringify({
        fromStage: "storyboard",
        toStage: "storyboard",
        renderOnly: true,
      }),
    })

    expect(res.status).toBe(200)
    expect(receivedOptions?.renderOnly).toBe(true)

    const verifyStorage = createBookStorage(label, tmpDir)
    try {
      expect(verifyStorage.getLatestNodeData("page-sectioning", "pg001")).not.toBeNull()
      expect(verifyStorage.getLatestNodeData("web-rendering", "pg001")).toBeNull()
      const runs = new Map(verifyStorage.getStepRuns().map((r) => [r.step, r.status]))
      expect(runs.get("page-sectioning")).toBe("done")
      expect(runs.has("web-rendering")).toBe(false)
    } finally {
      verifyStorage.close()
    }
  })

  it("passes Gemini credentials through to the stage runner options", async () => {
    const label = "gemini-stage-run"
    createTestBook(label)

    let receivedOptions: StageRunOptions | undefined
    const stageService: StageService = {
      getStatus: () => ({ active: null, queue: [] }),
      getQueuedStages: () => [],
      addListener: () => () => {},
      startStageRun: (_label, options) => {
        receivedOptions = options
        return { status: "started" as const, id: "run-2" }
      },
    }

    const app = createStageRoutes(stageService, mockEventBus, tmpDir, "", "")
    const res = await app.request(`/books/${label}/stages/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OpenAI-Key": "sk-test",
        "X-Gemini-API-Key": "gm-test",
      },
      body: JSON.stringify({
        fromStage: "translate",
        toStage: "speech",
      }),
    })

    expect(res.status).toBe(200)
    expect(receivedOptions?.geminiApiKey).toBe("gm-test")
  })
})

describe("GET /books/:label/step-status", () => {
  const extractStageSteps = [
    "extract",
    "metadata",
    "book-summary",
    "image-filtering",
    "image-segmentation",
    "image-cropping",
    "image-meaningfulness",
  ] as const

  function markExtractStageComplete(label: string): void {
    const storage = createBookStorage(label, tmpDir)
    try {
      for (const step of extractStageSteps) {
        storage.markStepCompleted(step)
      }
    } finally {
      storage.close()
    }
  }

  function makeActiveRun(overrides?: Partial<StageRunJob>): StageRunJob {
    return {
      label: "mock-book",
      status: "running",
      fromStage: "extract",
      toStage: "extract",
      ...overrides,
    }
  }

  /** Minimal mock StageService — DB is the source of truth for step/stage state.
   *  Only queuedStages and active run error come from in-memory. */
  function mockStageService(options?: {
    queuedStages?: StageName[]
    active?: StageRunJob | null
  }): StageService {
    return {
      getStatus: () => ({ active: options?.active ?? null, queue: [] }),
      getQueuedStages: () => options?.queuedStages ?? [],

      startStageRun: () => ({ status: "started" as const, id: "mock" }),
    }
  }

  it("returns all stages/steps idle when DB is missing and no run state exists", async () => {
    const app = createStageRoutes(mockStageService(), mockEventBus, tmpDir, "", "")
    const res = await app.request("/books/missing-db/step-status")
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.stages.extract).toBe("idle")
    expect(body.stages.storyboard).toBe("idle")
    expect(body.stages.package).toBe("idle")
    expect(body.steps.extract).toBe("idle")
    expect(body.steps.metadata).toBe("idle")
    expect(body.steps["package-web"]).toBe("idle")
    expect(body.error).toBeNull()
    expect(body.stepErrors).toBeNull()
    expect(body.stepMessages).toBeNull()
  })

  it("returns queued stages from in-memory queue", async () => {
    const app = createStageRoutes(
      mockStageService({ queuedStages: ["extract", "storyboard"] }),
      mockEventBus,
      tmpDir,
      "",
      ""
    )
    const res = await app.request("/books/missing-db-queued/step-status")
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.stages.extract).toBe("queued")
    expect(body.stages.storyboard).toBe("queued")
    expect(body.stages.quizzes).toBe("idle")
  })

  it("returns active run error in response", async () => {
    createTestBook("status-error")
    const app = createStageRoutes(
      mockStageService({
        active: makeActiveRun({ status: "failed", error: "pipeline failed" }),
      }),
      mockEventBus,
      tmpDir,
      "",
      ""
    )
    const res = await app.request("/books/status-error/step-status")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.error).toBe("pipeline failed")
  })

  it("reports stale running steps from a failed active run as errors", async () => {
    createTestBook("failed-running-step")
    const storage = createBookStorage("failed-running-step", tmpDir)
    try {
      storage.markStepStarted("catalog-translation")
    } finally {
      storage.close()
    }

    const app = createStageRoutes(
      mockStageService({
        active: makeActiveRun({
          status: "failed",
          fromStage: "translate",
          toStage: "translate",
          error: "translation failed",
        }),
      }),
      mockEventBus,
      tmpDir,
      "",
      ""
    )

    const res = await app.request("/books/failed-running-step/step-status")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stages.translate).toBe("error")
    expect(body.steps["catalog-translation"]).toBe("error")
    expect(body.stepErrors["catalog-translation"]).toBe("translation failed")
  })

  it("does not mark extract complete when only some steps are done", async () => {
    createTestBook("extract-incomplete")
    const storage = createBookStorage("extract-incomplete", tmpDir)
    try {
      storage.markStepCompleted("extract")
      storage.markStepCompleted("metadata")
    } finally {
      storage.close()
    }
    const app = createStageRoutes(mockStageService(), mockEventBus, tmpDir, "", "")

    const res = await app.request("/books/extract-incomplete/step-status")
    expect(res.status).toBe(200)
    const body = await res.json()
    // Extract stage should not be done — only 2 of its steps are complete
    expect(body.stages.extract).not.toBe("done")
    // Individual steps should be marked done
    expect(body.steps.extract).toBe("done")
    expect(body.steps.metadata).toBe("done")
  })

  it("marks extract complete when all extract steps are done", async () => {
    createTestBook("extract-complete")
    markExtractStageComplete("extract-complete")
    const app = createStageRoutes(mockStageService(), mockEventBus, tmpDir, "", "")

    const res = await app.request("/books/extract-complete/step-status")
    expect(res.status).toBe(200)
    const body = await res.json()
    // All extract steps done → stage should be done
    expect(body.stages.extract).toBe("done")
  })

  it("keeps stage queued even when all stage steps are complete in DB", async () => {
    createTestBook("extract-complete-queued")
    markExtractStageComplete("extract-complete-queued")

    const app = createStageRoutes(
      mockStageService({ queuedStages: ["extract"] }),
      mockEventBus,
      tmpDir,
      "",
      ""
    )

    const res = await app.request("/books/extract-complete-queued/step-status")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stages.extract).toBe("queued")
  })

  it("shows stage error when a step has error status in DB", async () => {
    createTestBook("step-error-test")
    const storage = createBookStorage("step-error-test", tmpDir)
    try {
      storage.markStepCompleted("extract")
      storage.markStepCompleted("metadata")
      storage.recordStepError("image-filtering", "LLM rate limit exceeded")
    } finally {
      storage.close()
    }
    const app = createStageRoutes(mockStageService(), mockEventBus, tmpDir, "", "")

    const res = await app.request("/books/step-error-test/step-status")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stages.extract).toBe("error")
    expect(body.steps["image-filtering"]).toBe("error")
    expect(body.stepErrors["image-filtering"]).toBe("LLM rate limit exceeded")
  })

  it("shows stage running when a step has running status in DB", async () => {
    createTestBook("step-running-test")
    const storage = createBookStorage("step-running-test", tmpDir)
    try {
      storage.markStepCompleted("extract")
      storage.markStepStarted("metadata")
    } finally {
      storage.close()
    }
    const app = createStageRoutes(mockStageService(), mockEventBus, tmpDir, "", "")

    const res = await app.request("/books/step-running-test/step-status")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stages.extract).toBe("running")
    expect(body.steps.metadata).toBe("running")
  })

  it("returns step progress messages from DB", async () => {
    createTestBook("step-message-test")
    const storage = createBookStorage("step-message-test", tmpDir)
    try {
      storage.markStepStarted("tts")
      storage.updateStepMessage("tts", "4/12 audio entries")
    } finally {
      storage.close()
    }
    const app = createStageRoutes(mockStageService(), mockEventBus, tmpDir, "", "")

    const res = await app.request("/books/step-message-test/step-status")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stages.speech).toBe("running")
    expect(body.steps.tts).toBe("running")
    expect(body.stepMessages.tts).toBe("4/12 audio entries")
  })

  it("shows active run range: running extract, queued storyboard", async () => {
    createTestBook("active-range")
    const storage = createBookStorage("active-range", tmpDir)
    try {
      storage.markStepStarted("extract")
    } finally {
      storage.close()
    }
    // Active run from extract→storyboard, extract step is running in DB
    const app = createStageRoutes(
      mockStageService({
        active: makeActiveRun({ fromStage: "extract", toStage: "storyboard" }),
      }),
      mockEventBus,
      tmpDir,
      "",
      ""
    )

    const res = await app.request("/books/active-range/step-status")
    expect(res.status).toBe(200)
    const body = await res.json()
    // Running DB state takes priority for extract
    expect(body.stages.extract).toBe("running")
    // Storyboard in active range with idle steps → queued
    expect(body.stages.storyboard).toBe("queued")
  })

  it("shows done for completed stage within active run range", async () => {
    createTestBook("active-range-done")
    markExtractStageComplete("active-range-done")
    // Active run from extract→storyboard, but extract is already done in DB
    const app = createStageRoutes(
      mockStageService({
        active: makeActiveRun({ fromStage: "extract", toStage: "storyboard" }),
      }),
      mockEventBus,
      tmpDir,
      "",
      ""
    )

    const res = await app.request("/books/active-range-done/step-status")
    expect(res.status).toBe(200)
    const body = await res.json()
    // Extract steps all done → "done" despite being in active run range
    expect(body.stages.extract).toBe("done")
    // Storyboard steps all idle + in active range → queued
    expect(body.stages.storyboard).toBe("queued")
  })

  it("returns null stepErrors when no errors exist", async () => {
    createTestBook("no-errors")
    markExtractStageComplete("no-errors")
    const app = createStageRoutes(mockStageService(), mockEventBus, tmpDir, "", "")

    const res = await app.request("/books/no-errors/step-status")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stepErrors).toBeNull()
  })

  it("derives error from step errors when no active run error", async () => {
    createTestBook("derived-error")
    const storage = createBookStorage("derived-error", tmpDir)
    try {
      storage.recordStepError("metadata", "API key invalid")
    } finally {
      storage.close()
    }
    const app = createStageRoutes(mockStageService(), mockEventBus, tmpDir, "", "")

    const res = await app.request("/books/derived-error/step-status")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.error).toBe("API key invalid")
  })

  it("treats skipped steps as done for stage completion", async () => {
    createTestBook("skipped-steps")
    const storage = createBookStorage("skipped-steps", tmpDir)
    try {
      for (const step of extractStageSteps) {
        if (step === "image-segmentation" || step === "translation") {
          storage.markStepSkipped(step)
        } else {
          storage.markStepCompleted(step)
        }
      }
    } finally {
      storage.close()
    }
    const app = createStageRoutes(mockStageService(), mockEventBus, tmpDir, "", "")

    const res = await app.request("/books/skipped-steps/step-status")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stages.extract).toBe("done")
  })

  it("marks preview done when adt directory exists", async () => {
    createTestBook("preview-done")
    fs.mkdirSync(path.join(tmpDir, "preview-done", "adt"), { recursive: true })

    const app = createStageRoutes(mockStageService(), mockEventBus, tmpDir, "", "")
    const res = await app.request("/books/preview-done/step-status")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stages.preview).toBe("done")
  })

  it("returns 400 for invalid book labels", async () => {
    const app = createStageRoutes(mockStageService(), mockEventBus, tmpDir, "", "")
    const res = await app.request("/books/-bad/step-status")
    expect(res.status).toBe(400)
  })
})

describe("GET /books/:label/export-project", () => {
  const webAssetsDir = path.resolve(process.cwd(), "assets", "adt")

  it("returns ZIP for valid book", async () => {
    createTestBook("export-book")
    addPagesAndRenderings("export-book", 2)
    const app = createBookRoutes(tmpDir, webAssetsDir)
    const res = await app.request("/books/export-book/export-project")
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/zip")
    expect(res.headers.get("Content-Disposition")).toContain('filename="export-book-project.zip"')
    const buf = await res.arrayBuffer()
    expect(buf.byteLength).toBeGreaterThan(0)
  })

  it("exports even when storyboard not accepted", async () => {
    createTestBook("not-accepted-export")
    addPagesAndRenderings("not-accepted-export", 1)
    const app = createBookRoutes(tmpDir, webAssetsDir)
    const res = await app.request("/books/not-accepted-export/export-project")
    expect(res.status).toBe(200)
  })

  it("returns 404 for missing book", async () => {
    const app = createBookRoutes(tmpDir, webAssetsDir)
    const res = await app.request("/books/ghost/export-project")
    expect(res.status).toBe(404)
  })

  it("returns 500 when web assets directory is missing (prepare-export)", async () => {
    createTestBook("missing-assets-export")
    addPagesAndRenderings("missing-assets-export", 1)
    const app = createBookRoutes(tmpDir, path.join(tmpDir, "no-web-assets"))
    const res = await app.request("/books/missing-assets-export/prepare-export", { method: "POST" })
    expect(res.status).toBe(500)
  })
})

describe("GET /books/:label/export-webpub", () => {
  const webAssetsDir = path.resolve(process.cwd(), "assets", "adt")

  function createBookWithTitle(label: string, title: string): void {
    const bookDir = path.join(tmpDir, label)
    fs.mkdirSync(bookDir, { recursive: true })
    fs.mkdirSync(path.join(bookDir, "images"), { recursive: true })
    const db = openBookDb(path.join(bookDir, `${label}.db`))
    db.run(
      "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
      [
        "metadata",
        "book",
        1,
        JSON.stringify({
          title,
          authors: ["Author"],
          publisher: null,
          language_code: "en",
          cover_page_number: 1,
          reasoning: "test",
        }),
      ]
    )
    db.close()
  }

  it("returns ZIP with RFC 5987 Content-Disposition for ASCII titles", async () => {
    createBookWithTitle("webpub-ascii", "My Book")
    addPagesAndRenderings("webpub-ascii", 1)
    const app = createBookRoutes(tmpDir, webAssetsDir)
    // Prepare first (builds webpub directory)
    const prepRes = await app.request("/books/webpub-ascii/prepare-export?format=webpub", { method: "POST" })
    expect(prepRes.status).toBe(200)
    const res = await app.request("/books/webpub-ascii/export-webpub")
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/zip")
    const disposition = res.headers.get("Content-Disposition") ?? ""
    expect(disposition).toContain('filename="webpub-ascii.webpub"')
    expect(disposition).toContain("filename*=UTF-8''")
  }, 15_000)

  it("uses safe label filename for non-ASCII titles", async () => {
    createBookWithTitle("sinhala-export", "\u0DC3\u0DD2\u0D82\u0DC4\u0DBD")
    addPagesAndRenderings("sinhala-export", 1)
    const app = createBookRoutes(tmpDir, webAssetsDir)
    // Prepare first (builds webpub directory)
    await app.request("/books/sinhala-export/prepare-export?format=webpub", { method: "POST" })
    const res = await app.request("/books/sinhala-export/export-webpub")
    expect(res.status).toBe(200)
    const disposition = res.headers.get("Content-Disposition") ?? ""
    // ASCII fallback uses the safe label
    expect(disposition).toContain('filename="sinhala-export.webpub"')
    // UTF-8 encoded filename contains the Sinhala title
    expect(disposition).toContain("filename*=UTF-8''")
    expect(disposition).toContain(encodeURIComponent("\u0DC3\u0DD2\u0D82\u0DC4\u0DBD"))
  }, 15_000)

  it("returns 404 for missing book", async () => {
    const app = createBookRoutes(tmpDir, webAssetsDir)
    const res = await app.request("/books/ghost/export-webpub")
    expect(res.status).toBe(404)
  })

  it("returns 500 when web assets directory is missing (prepare-export)", async () => {
    createBookWithTitle("missing-assets-wp", "Missing")
    addPagesAndRenderings("missing-assets-wp", 1)
    const app = createBookRoutes(tmpDir, path.join(tmpDir, "no-web-assets"))
    const res = await app.request("/books/missing-assets-wp/prepare-export?format=webpub", { method: "POST" })
    expect(res.status).toBe(500)
  })
})

function createProjectZip(label: string, options?: { omitPdf?: boolean; omitDb?: boolean; corruptDb?: boolean }): Buffer {
  const files: Record<string, Uint8Array> = {}

  if (!options?.omitDb) {
    if (options?.corruptDb) {
      files[`${label}.db`] = new TextEncoder().encode("not a database")
    } else {
      const tmpZipDir = fs.mkdtempSync(path.join(os.tmpdir(), "adt-zip-"))
      const dbPath = path.join(tmpZipDir, `${label}.db`)
      const db = openBookDb(dbPath)
      db.run(
        "INSERT INTO pages (page_id, page_number, text) VALUES (?, ?, ?)",
        [`${label}_p1`, 1, "Page 1"],
      )
      db.run(
        "INSERT INTO node_data (node, item_id, version, data) VALUES (?, ?, ?, ?)",
        ["metadata", "book", 1, JSON.stringify({
          title: "Test Import",
          authors: ["Author A"],
          publisher: "Pub",
          language_code: "en",
          cover_page_number: 1,
          reasoning: "test",
        })],
      )
      db.close()
      files[`${label}.db`] = new Uint8Array(fs.readFileSync(dbPath))
      fs.rmSync(tmpZipDir, { recursive: true, force: true })
    }
  }

  if (!options?.omitPdf) {
    files[`${label}.pdf`] = new TextEncoder().encode("%PDF-1.0 fake")
  }

  files["images/img1.png"] = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

  return Buffer.from(zipSync(files))
}

describe("POST /books/preview-import", () => {
  it("returns preview for a valid project ZIP", async () => {
    const zip = createProjectZip("preview-test")
    const app = createBookRoutes(tmpDir)
    const formData = new FormData()
    formData.append("zip", new Blob([zip], { type: "application/zip" }), "preview-test.zip")
    const res = await app.request("/books/preview-import", { method: "POST", body: formData })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.label).toBe("preview-test")
    expect(body.title).toBe("Test Import")
    expect(body.authors).toEqual(["Author A"])
    expect(body.pageCount).toBe(1)
    expect(body.hasSourcePdf).toBe(true)
    expect(body.imageCount).toBe(1)
    expect(body.validationError).toBeNull()
  })

  it("returns 400 for non-ZIP data", async () => {
    const app = createBookRoutes(tmpDir)
    const formData = new FormData()
    formData.append("zip", new Blob(["not a zip"], { type: "application/zip" }), "bad.zip")
    const res = await app.request("/books/preview-import", { method: "POST", body: formData })
    expect(res.status).toBe(400)
  })

  it("returns 400 when .db file is missing", async () => {
    const zip = createProjectZip("no-db", { omitDb: true })
    const app = createBookRoutes(tmpDir)
    const formData = new FormData()
    formData.append("zip", new Blob([zip], { type: "application/zip" }), "no-db.zip")
    const res = await app.request("/books/preview-import", { method: "POST", body: formData })
    expect(res.status).toBe(400)
    const text = await res.text()
    expect(text).toContain("Invalid project archive")
  })

  it("returns validationError for corrupt database", async () => {
    const zip = createProjectZip("corrupt-db", { corruptDb: true })
    const app = createBookRoutes(tmpDir)
    const formData = new FormData()
    formData.append("zip", new Blob([zip], { type: "application/zip" }), "corrupt-db.zip")
    const res = await app.request("/books/preview-import", { method: "POST", body: formData })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.validationError).toBeTruthy()
  })

  it("returns 400 when zip field is missing", async () => {
    const app = createBookRoutes(tmpDir)
    const formData = new FormData()
    const res = await app.request("/books/preview-import", { method: "POST", body: formData })
    expect(res.status).toBe(400)
  })
})

describe("POST /books/import", () => {
  it("imports a valid project ZIP", async () => {
    const zip = createProjectZip("import-test")
    const app = createBookRoutes(tmpDir)
    const formData = new FormData()
    formData.append("zip", new Blob([zip], { type: "application/zip" }), "import-test.zip")
    const res = await app.request("/books/import", { method: "POST", body: formData })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.label).toBe("import-test")
    expect(body.title).toBe("Test Import")
    expect(body.hasSourcePdf).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, "import-test", "import-test.db"))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, "import-test", "import-test.pdf"))).toBe(true)
  })

  it("auto-resolves label when book already exists", async () => {
    createTestBook("dupe-import")
    const zip = createProjectZip("dupe-import")
    const app = createBookRoutes(tmpDir)
    const formData = new FormData()
    formData.append("zip", new Blob([zip], { type: "application/zip" }), "dupe-import.zip")
    const res = await app.request("/books/import", { method: "POST", body: formData })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.label).toBe("dupe-import-2")
  })

  it("returns 400 when PDF is missing", async () => {
    const zip = createProjectZip("no-pdf-import", { omitPdf: true })
    const app = createBookRoutes(tmpDir)
    const formData = new FormData()
    formData.append("zip", new Blob([zip], { type: "application/zip" }), "no-pdf.zip")
    const res = await app.request("/books/import", { method: "POST", body: formData })
    expect(res.status).toBe(400)
    const text = await res.text()
    expect(text).toContain("Invalid project archive")
  })

  it("returns 400 for non-ZIP data", async () => {
    const app = createBookRoutes(tmpDir)
    const formData = new FormData()
    formData.append("zip", new Blob(["not a zip"], { type: "application/zip" }), "bad.zip")
    const res = await app.request("/books/import", { method: "POST", body: formData })
    expect(res.status).toBe(400)
  })

  it("cleans up on failure", async () => {
    const zip = createProjectZip("cleanup-test", { corruptDb: true })
    const app = createBookRoutes(tmpDir)
    const formData = new FormData()
    formData.append("zip", new Blob([zip], { type: "application/zip" }), "cleanup-test.zip")
    const res = await app.request("/books/import", { method: "POST", body: formData })
    expect(res.status).toBe(500)
    expect(fs.existsSync(path.join(tmpDir, "cleanup-test"))).toBe(false)
  })
})

describe("GET /books/:label/export-adt", () => {
  it("returns ZIP of the adt/ directory", async () => {
    createTestBook("adt-export")
    addPagesAndRenderings("adt-export", 1)
    const adtDir = path.join(tmpDir, "adt-export", "adt")
    fs.mkdirSync(adtDir, { recursive: true })
    fs.writeFileSync(path.join(adtDir, "index.html"), "<html></html>")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/adt-export/export-adt")
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/zip")
    const disposition = res.headers.get("Content-Disposition") ?? ""
    expect(disposition).toContain('filename="adt-export-adt.zip"')
    expect(disposition).toContain("filename*=UTF-8''")
  })

  it("returns 404 for missing book", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/ghost/export-adt")
    expect(res.status).toBe(404)
  })

  it("returns 400 when adt/ directory is missing", async () => {
    createTestBook("no-adt-dir")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/no-adt-dir/export-adt")
    expect(res.status).toBe(400)
  })
})

describe("GET /books/:label/images/:imageId", () => {
  function createBookWithImage(label: string): void {
    const storage = createBookStorage(label, tmpDir)
    try {
      storage.putExtractedPage({
        pageId: `${label}_p1`,
        pageNumber: 1,
        text: "Page one",
        pageImage: {
          imageId: `${label}_p1_page`,
          buffer: Buffer.from("fake-png-data"),
          format: "png" as const,
          hash: "abc123",
          width: 800,
          height: 600,
        },
        images: [],
      })
    } finally {
      storage.close()
    }
  }

  function createBookWithImagePath(
    label: string,
    imageId: string,
    imagePath: string
  ): void {
    const bookDir = path.join(tmpDir, label)
    fs.mkdirSync(bookDir, { recursive: true })
    const db = openBookDb(path.join(bookDir, `${label}.db`))
    db.run(
      "INSERT INTO pages (page_id, page_number, text) VALUES (?, ?, ?)",
      [`${label}_p1`, 1, "Page one"]
    )
    db.run(
      "INSERT INTO images (image_id, page_id, path, hash, width, height, source) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [imageId, `${label}_p1`, imagePath, "hash", 100, 100, "extract"]
    )
    db.close()
  }

  it("returns image as PNG binary", async () => {
    createBookWithImage("img-book")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/img-book/images/img-book_p1_page")

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("image/png")
    const buf = await res.arrayBuffer()
    expect(Buffer.from(buf).toString()).toBe("fake-png-data")
  })

  it("returns 404 for nonexistent image", async () => {
    createBookWithImage("img-book2")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/img-book2/images/no-such-image")
    expect(res.status).toBe(404)
  })

  it("returns 404 for nonexistent book", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/no-such-book/images/some-image")
    expect(res.status).toBe(404)
  })

  it("returns 400 for invalid label", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/-bad/images/some-image")
    expect(res.status).toBe(400)
  })

  it("returns image/jpeg content type for .jpeg paths", async () => {
    createBookWithImagePath("img-book-jpeg", "img-book-jpeg_p1_page", "images/photo.jpeg")
    const jpegPath = path.join(tmpDir, "img-book-jpeg", "images", "photo.jpeg")
    fs.mkdirSync(path.dirname(jpegPath), { recursive: true })
    fs.writeFileSync(jpegPath, Buffer.from("fake-jpeg-data"))

    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/img-book-jpeg/images/img-book-jpeg_p1_page")

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("image/jpeg")
  })

  it("returns image/jpeg content type for uppercase .JPG paths", async () => {
    createBookWithImagePath("img-book-jpg-up", "img-book-jpg-up_p1_page", "images/photo.JPG")
    const jpgPath = path.join(tmpDir, "img-book-jpg-up", "images", "photo.JPG")
    fs.mkdirSync(path.dirname(jpgPath), { recursive: true })
    fs.writeFileSync(jpgPath, Buffer.from("fake-jpg-data"))

    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/img-book-jpg-up/images/img-book-jpg-up_p1_page")

    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("image/jpeg")
  })

  it("returns 400 for escaped image paths from DB", async () => {
    createBookWithImagePath("img-book3", "img-book3_p1_page", "../outside.png")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/img-book3/images/img-book3_p1_page")
    expect(res.status).toBe(400)
  })
})

describe("GET /books/:label/captioned-images", () => {
  function setupBook(label: string): void {
    const storage = createBookStorage(label, tmpDir)
    try {
      storage.putExtractedPage({
        pageId: "pg001",
        pageNumber: 1,
        text: "p1",
        pageImage: {
          imageId: "pg001_page",
          buffer: Buffer.from("page"),
          format: "png" as const,
          hash: "h",
          width: 800,
          height: 600,
        },
        images: [
          { imageId: "pg001_im001", buffer: Buffer.from("a"), format: "png" as const, hash: "h1", width: 100, height: 100 },
          { imageId: "pg001_im002", buffer: Buffer.from("b"), format: "png" as const, hash: "h2", width: 100, height: 100 },
        ],
      })
      storage.putNodeData("image-captioning", "pg001", {
        captions: [
          { imageId: "pg001_im001", caption: "First caption" },
          { imageId: "pg001_im002", caption: "Second caption" },
        ],
      })
      storage.putTranslatedImage({
        sourceImageId: "pg001_im001",
        pageId: "pg001",
        languageCode: "es",
        buffer: Buffer.from("var"),
        width: 100,
        height: 100,
      })
    } finally {
      storage.close()
    }
  }

  it("lists images that have captions and excludes translate variants", async () => {
    setupBook("cap-book")
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/cap-book/captioned-images")
    expect(res.status).toBe(200)
    const body = await res.json() as { images: Array<{ imageId: string; caption: string }> }
    const ids = body.images.map((i) => i.imageId).sort()
    expect(ids).toEqual(["pg001_im001", "pg001_im002"])
    expect(body.images.find((i) => i.imageId === "pg001_im001")?.caption).toBe("First caption")
  })

  it("returns 404 for missing book", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/no-such/captioned-images")
    expect(res.status).toBe(404)
  })

  it("returns empty list when no image-captioning data exists", async () => {
    const storage = createBookStorage("nocaps", tmpDir)
    storage.close()
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/nocaps/captioned-images")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ images: [] })
  })
})

describe("GET /books/:label/translated-images", () => {
  it("parses sourceImageId and language from translated image ids", async () => {
    const storage = createBookStorage("tr-book", tmpDir)
    try {
      storage.putExtractedPage({
        pageId: "pg001",
        pageNumber: 1,
        text: "p1",
        pageImage: {
          imageId: "pg001_page",
          buffer: Buffer.from("p"),
          format: "png" as const,
          hash: "h",
          width: 800,
          height: 600,
        },
        images: [
          { imageId: "pg001_im001", buffer: Buffer.from("a"), format: "png" as const, hash: "h1", width: 100, height: 100 },
        ],
      })
      for (const lang of ["es", "fr", "pt-BR"]) {
        storage.putTranslatedImage({
          sourceImageId: "pg001_im001",
          pageId: "pg001",
          languageCode: lang,
          buffer: Buffer.from(`v-${lang}`),
          width: 100,
          height: 100,
        })
      }
    } finally {
      storage.close()
    }

    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/tr-book/translated-images")
    expect(res.status).toBe(200)
    const body = await res.json() as {
      images: Array<{ imageId: string; sourceImageId: string; language: string }>
    }
    const byLang = Object.fromEntries(body.images.map((i) => [i.language, i.sourceImageId]))
    expect(byLang).toEqual({ es: "pg001_im001", fr: "pg001_im001", "pt-BR": "pg001_im001" })
  })

  it("returns empty list when no translated images exist", async () => {
    const storage = createBookStorage("empty-tr", tmpDir)
    storage.close()
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/empty-tr/translated-images")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ images: [] })
  })
})
