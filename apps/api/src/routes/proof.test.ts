import { describe, it, expect, vi, beforeEach } from "vitest"
import { Hono } from "hono"
import {
  createProofService,
  type ProofRunner,
} from "../services/proof-service.js"
import { createProofRoutes } from "./proof.js"
import { errorHandler } from "../middleware/error-handler.js"

function createMockRunner(behavior?: {
  delay?: number
  shouldFail?: boolean
  errorMessage?: string
}): ProofRunner {
  return {
    run: vi.fn(async (_label, _options, progress) => {
      if (behavior?.delay) {
        await new Promise((r) => setTimeout(r, behavior.delay))
      }
      if (behavior?.shouldFail) {
        throw new Error(behavior.errorMessage ?? "Proof failed")
      }
      progress.emit({ type: "step-start", step: "image-captioning" })
      progress.emit({ type: "step-complete", step: "image-captioning" })
    }),
  }
}

function createTestApp(runner: ProofRunner): { app: Hono; runner: ProofRunner } {
  const service = createProofService(runner)
  const routes = createProofRoutes(service, "/tmp/books", "/tmp/prompts")
  const app = new Hono()
  app.onError(errorHandler)
  app.route("/api", routes)
  return { app, runner }
}

describe("Proof routes", () => {
  let runner: ProofRunner
  let app: Hono

  beforeEach(() => {
    runner = createMockRunner()
    const result = createTestApp(runner)
    app = result.app
    runner = result.runner
  })

  describe("POST /api/books/:label/proof/run", () => {
    it("starts proof generation and returns status", async () => {
      const res = await app.request(
        "/api/books/my-book/proof/run",
        {
          method: "POST",
          headers: {
            "X-OpenAI-Key": "sk-test-key",
          },
        }
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.status).toBe("started")
      expect(body.label).toBe("my-book")
    })

    it("requires API key header", async () => {
      const res = await app.request(
        "/api/books/my-book/proof/run",
        { method: "POST" }
      )

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("API key")
    })

    it("rejects duplicate runs", async () => {
      const slowRunner = createMockRunner({ delay: 500 })
      const { app: testApp } = createTestApp(slowRunner)

      const res1 = await testApp.request(
        "/api/books/my-book/proof/run",
        {
          method: "POST",
          headers: { "X-OpenAI-Key": "sk-test" },
        }
      )
      expect(res1.status).toBe(200)

      await new Promise((r) => setTimeout(r, 20))

      const res2 = await testApp.request(
        "/api/books/my-book/proof/run",
        {
          method: "POST",
          headers: { "X-OpenAI-Key": "sk-test" },
        }
      )
      expect(res2.status).toBe(409)
    })

    it("accepts empty JSON body", async () => {
      const res = await app.request(
        "/api/books/my-book/proof/run",
        {
          method: "POST",
          headers: {
            "X-OpenAI-Key": "sk-test-key",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      )

      expect(res.status).toBe(200)
    })

    it("rejects unsupported run options", async () => {
      const res = await app.request(
        "/api/books/my-book/proof/run",
        {
          method: "POST",
          headers: {
            "X-OpenAI-Key": "sk-test-key",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            concurrency: 4,
          }),
        }
      )

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("Invalid proof run options")
    })

    it("rejects invalid JSON body", async () => {
      const res = await app.request(
        "/api/books/my-book/proof/run",
        {
          method: "POST",
          headers: {
            "X-OpenAI-Key": "sk-test-key",
            "Content-Type": "application/json",
          },
          body: "{not-json",
        }
      )

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toContain("Invalid JSON body")
    })
  })

  describe("GET /api/books/:label/proof/status", () => {
    it("returns status for a book", async () => {
      await app.request("/api/books/my-book/proof/run", {
        method: "POST",
        headers: { "X-OpenAI-Key": "sk-test" },
      })

      await new Promise((r) => setTimeout(r, 50))

      const res = await app.request(
        "/api/books/my-book/proof/status"
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.status).toBe("completed")
      expect(body.label).toBe("my-book")
    })

    it("returns idle for unknown book", async () => {
      const res = await app.request(
        "/api/books/unknown/proof/status"
      )

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.status).toBe("idle")
    })
  })
})
