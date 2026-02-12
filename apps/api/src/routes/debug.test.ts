import { describe, it, expect, beforeEach, afterEach } from "vitest"
import fs from "node:fs"
import path from "node:path"
import os from "node:os"
import { Hono } from "hono"
import { createBookStorage } from "@adt/storage"
import { openBookDb } from "@adt/storage"
import { errorHandler } from "../middleware/error-handler.js"
import { createDebugRoutes } from "./debug.js"
import type { PipelineService } from "../services/pipeline-service.js"

function makeMockPipelineService(
  overrides?: Partial<PipelineService>
): PipelineService {
  return {
    getStatus: () => null,
    addListener: () => () => {},
    startPipeline: async () => {},
    ...overrides,
  }
}

describe("Debug routes", () => {
  let tmpDir: string
  let app: Hono
  const label = "test-book"

  function seedLlmLogs(dbPath: string) {
    const db = openBookDb(dbPath)
    try {
      // Insert LLM log entries with known data
      const entries = [
        {
          step: "text-classification",
          item_id: `${label}_p1`,
          data: {
            promptName: "classify-text",
            modelId: "gpt-4o",
            cacheHit: false,
            durationMs: 1200,
            usage: { inputTokens: 500, outputTokens: 200 },
            validationErrors: [],
          },
        },
        {
          step: "text-classification",
          item_id: `${label}_p2`,
          data: {
            promptName: "classify-text",
            modelId: "gpt-4o",
            cacheHit: true,
            durationMs: 50,
            usage: { inputTokens: 500, outputTokens: 200 },
          },
        },
        {
          step: "page-sectioning",
          item_id: `${label}_p1`,
          data: {
            promptName: "section-page",
            modelId: "gpt-4o",
            cacheHit: false,
            durationMs: 2000,
            usage: { inputTokens: 1000, outputTokens: 500 },
            validationErrors: ["Invalid section type"],
          },
        },
        {
          step: "metadata",
          item_id: "book",
          data: {
            promptName: "extract-metadata",
            modelId: "gpt-4o",
            cacheHit: false,
            durationMs: 3000,
            usage: { inputTokens: 2000, outputTokens: 300 },
          },
        },
      ]

      for (const entry of entries) {
        db.run(
          "INSERT INTO llm_log (timestamp, step, item_id, data) VALUES (?, ?, ?, ?)",
          [new Date().toISOString(), entry.step, entry.item_id, JSON.stringify(entry.data)]
        )
      }
    } finally {
      db.close()
    }
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "debug-routes-"))

    // Create a book with extracted pages
    const storage = createBookStorage(label, tmpDir)
    try {
      storage.putExtractedPage({
        pageId: `${label}_p1`,
        pageNumber: 1,
        text: "Page one text",
        pageImage: {
          imageId: `${label}_p1_page`,
          buffer: Buffer.from("fake-png"),
          format: "png" as const,
          hash: "abc123",
          width: 800,
          height: 600,
        },
        images: [],
      })
      storage.putExtractedPage({
        pageId: `${label}_p2`,
        pageNumber: 2,
        text: "Page two text",
        pageImage: {
          imageId: `${label}_p2_page`,
          buffer: Buffer.from("fake-png-2"),
          format: "png" as const,
          hash: "def456",
          width: 800,
          height: 600,
        },
        images: [],
      })

      // Add node_data with multiple versions
      storage.putNodeData("text-classification", `${label}_p1`, { version: "v1" })
      storage.putNodeData("text-classification", `${label}_p1`, { version: "v2" })
      storage.putNodeData("text-classification", `${label}_p1`, { version: "v3" })
    } finally {
      storage.close()
    }

    // Seed LLM logs
    const dbPath = path.join(tmpDir, label, `${label}.db`)
    seedLlmLogs(dbPath)

    const pipelineService = makeMockPipelineService()
    const routes = createDebugRoutes(pipelineService, tmpDir, tmpDir)
    app = new Hono()
    app.onError(errorHandler)
    app.route("/api", routes)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe("GET /api/books/:label/debug/llm-logs", () => {
    it("returns paginated logs with total count", async () => {
      const res = await app.request(`/api/books/${label}/debug/llm-logs`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.total).toBe(4)
      expect(body.logs).toHaveLength(4)
      // Newest first
      expect(body.logs[0].step).toBe("metadata")
    })

    it("filters by step", async () => {
      const res = await app.request(
        `/api/books/${label}/debug/llm-logs?step=text-classification`
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.total).toBe(2)
      expect(body.logs).toHaveLength(2)
      for (const log of body.logs) {
        expect(log.step).toBe("text-classification")
      }
    })

    it("filters by itemId", async () => {
      const res = await app.request(
        `/api/books/${label}/debug/llm-logs?itemId=${label}_p1`
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.total).toBe(2)
    })

    it("respects limit and offset", async () => {
      const res = await app.request(
        `/api/books/${label}/debug/llm-logs?limit=2&offset=1`
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.total).toBe(4)
      expect(body.logs).toHaveLength(2)
    })

    it("clamps limit to 200", async () => {
      const res = await app.request(
        `/api/books/${label}/debug/llm-logs?limit=999`
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.logs.length).toBeLessThanOrEqual(200)
    })

    it("returns 404 for nonexistent book", async () => {
      const res = await app.request("/api/books/no-such-book/debug/llm-logs")
      expect(res.status).toBe(404)
    })
  })

  describe("GET /api/books/:label/debug/stats", () => {
    it("returns aggregated stats by step", async () => {
      const res = await app.request(`/api/books/${label}/debug/stats`)
      expect(res.status).toBe(200)
      const body = await res.json()

      expect(body.steps).toBeDefined()
      expect(Array.isArray(body.steps)).toBe(true)
      expect(body.totals).toBeDefined()

      // Check total counts
      expect(body.totals.calls).toBe(4)
      expect(body.totals.cacheHits).toBe(1)

      // Check step-level data
      const textStep = body.steps.find(
        (s: { step: string }) => s.step === "text-classification"
      )
      expect(textStep).toBeDefined()
      expect(textStep.calls).toBe(2)
      expect(textStep.cacheHits).toBe(1)
    })

    it("includes pipeline run timing when available", async () => {
      const pipelineService = makeMockPipelineService({
        getStatus: () => ({
          label,
          status: "completed",
          startedAt: 1000,
          completedAt: 5000,
        }),
      })
      const routes = createDebugRoutes(pipelineService, tmpDir, tmpDir)
      const appWithTiming = new Hono()
      appWithTiming.onError(errorHandler)
      appWithTiming.route("/api", routes)

      const res = await appWithTiming.request(`/api/books/${label}/debug/stats`)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.pipelineRun).toBeDefined()
      expect(body.pipelineRun.status).toBe("completed")
      expect(body.pipelineRun.wallClockMs).toBe(4000)
    })

    it("returns 404 for nonexistent book", async () => {
      const res = await app.request("/api/books/no-such-book/debug/stats")
      expect(res.status).toBe(404)
    })
  })

  describe("GET /api/books/:label/debug/versions/:node/:itemId", () => {
    it("returns version list without data by default", async () => {
      const res = await app.request(
        `/api/books/${label}/debug/versions/text-classification/${label}_p1`
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.versions).toHaveLength(3)
      // Newest first
      expect(body.versions[0].version).toBe(3)
      expect(body.versions[0].data).toBeUndefined()
    })

    it("includes data when includeData=true", async () => {
      const res = await app.request(
        `/api/books/${label}/debug/versions/text-classification/${label}_p1?includeData=true`
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.versions).toHaveLength(3)
      expect(body.versions[0].data).toBeDefined()
      expect(body.versions[0].data.version).toBe("v3")
    })

    it("returns empty list for unknown node/item", async () => {
      const res = await app.request(
        `/api/books/${label}/debug/versions/unknown-node/unknown-item`
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.versions).toHaveLength(0)
    })

    it("returns 404 for nonexistent book", async () => {
      const res = await app.request(
        "/api/books/no-such-book/debug/versions/text-classification/p1"
      )
      expect(res.status).toBe(404)
    })
  })
})
