import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { openBookDb, createBookStorage } from "@adt/storage"
import { SCHEMA_VERSION } from "@adt/types"
import type { StageName } from "@adt/types"
import type { StageService, StageRunJob } from "../services/stage-service.js"
import { createBookRoutes } from "./books.js"
import { createStageRoutes } from "./stages.js"

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
            model: "openai:gpt-5.2",
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
      model: "openai:gpt-5.2",
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
      storage.putNodeData("text-classification", pageId, { groups: [] })
      storage.putNodeData("image-filtering", pageId, { images: [] })
    }
    if (includeSummary) {
      storage.putNodeData("book-summary", "book", { summary: "Test summary" })
    }
  } finally {
    storage.close()
  }
}

describe("GET /books/:label/step-status", () => {
  const extractStageSteps = [
    "extract",
    "metadata",
    "image-filtering",
    "image-segmentation",
    "image-cropping",
    "image-meaningfulness",
    "text-classification",
    "book-summary",
    "translation",
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
      addListener: () => () => {},
      startStageRun: () => ({ status: "started" as const, id: "mock" }),
    }
  }

  it("returns all stages/steps idle when DB is missing and no run state exists", async () => {
    const app = createStageRoutes(mockStageService(), tmpDir, "")
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
  })

  it("returns queued stages from in-memory queue", async () => {
    const app = createStageRoutes(
      mockStageService({ queuedStages: ["extract", "storyboard"] }),
      tmpDir,
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
      tmpDir,
      ""
    )
    const res = await app.request("/books/status-error/step-status")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.error).toBe("pipeline failed")
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
    const app = createStageRoutes(mockStageService(), tmpDir, "")

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
    const app = createStageRoutes(mockStageService(), tmpDir, "")

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
      tmpDir,
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
    const app = createStageRoutes(mockStageService(), tmpDir, "")

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
    const app = createStageRoutes(mockStageService(), tmpDir, "")

    const res = await app.request("/books/step-running-test/step-status")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stages.extract).toBe("running")
    expect(body.steps.metadata).toBe("running")
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
      tmpDir,
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
      tmpDir,
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
    const app = createStageRoutes(mockStageService(), tmpDir, "")

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
    const app = createStageRoutes(mockStageService(), tmpDir, "")

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
    const app = createStageRoutes(mockStageService(), tmpDir, "")

    const res = await app.request("/books/skipped-steps/step-status")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stages.extract).toBe("done")
  })

  it("marks preview done when adt directory exists", async () => {
    createTestBook("preview-done")
    fs.mkdirSync(path.join(tmpDir, "preview-done", "adt"), { recursive: true })

    const app = createStageRoutes(mockStageService(), tmpDir, "")
    const res = await app.request("/books/preview-done/step-status")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.stages.preview).toBe("done")
  })

  it("returns 400 for invalid book labels", async () => {
    const app = createStageRoutes(mockStageService(), tmpDir, "")
    const res = await app.request("/books/-bad/step-status")
    expect(res.status).toBe(400)
  })
})

describe("GET /books/:label/export", () => {
  it("returns ZIP for valid book", async () => {
    createTestBook("export-book")
    addPagesAndRenderings("export-book", 2)
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/export-book/export")
    expect(res.status).toBe(200)
    expect(res.headers.get("Content-Type")).toBe("application/zip")
    expect(res.headers.get("Content-Disposition")).toContain("export-book.zip")
    const buf = await res.arrayBuffer()
    expect(buf.byteLength).toBeGreaterThan(0)
  })

  it("exports even when storyboard not accepted", async () => {
    createTestBook("not-accepted-export")
    addPagesAndRenderings("not-accepted-export", 1)
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/not-accepted-export/export")
    expect(res.status).toBe(200)
  })

  it("returns 404 for missing book", async () => {
    const app = createBookRoutes(tmpDir)
    const res = await app.request("/books/ghost/export")
    expect(res.status).toBe(404)
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
