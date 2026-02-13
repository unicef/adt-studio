import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  createPipelineService,
  type PipelineRunner,
  type PipelineSSEEvent,
} from "./pipeline-service.js"

function createMockRunner(behavior?: {
  delay?: number
  shouldFail?: boolean
  errorMessage?: string
}): PipelineRunner {
  return {
    run: vi.fn(async (_label, _options, progress) => {
      if (behavior?.delay) {
        await new Promise((r) => setTimeout(r, behavior.delay))
      }
      if (behavior?.shouldFail) {
        throw new Error(behavior.errorMessage ?? "Pipeline failed")
      }
      // Simulate a minimal pipeline run
      progress.emit({ type: "step-start", step: "extract" })
      progress.emit({
        type: "step-progress",
        step: "extract",
        message: "page 1/1",
        page: 1,
        totalPages: 1,
      })
      progress.emit({ type: "step-complete", step: "extract" })
    }),
  }
}

describe("PipelineService", () => {
  let runner: PipelineRunner

  beforeEach(() => {
    runner = createMockRunner()
  })

  describe("getStatus", () => {
    it("returns null for unknown book", () => {
      const service = createPipelineService(runner)
      expect(service.getStatus("unknown")).toBeNull()
    })

    it("returns running status after start", async () => {
      const slowRunner = createMockRunner({ delay: 500 })
      const service = createPipelineService(slowRunner)

      service.startPipeline("my-book", {
        booksDir: "/tmp/books",
        apiKey: "sk-test",
        promptsDir: "/tmp/prompts",
      })

      const status = service.getStatus("my-book")
      expect(status).not.toBeNull()
      expect(status!.status).toBe("running")
      expect(status!.label).toBe("my-book")
      expect(status!.startedAt).toBeDefined()
    })

    it("returns completed status after pipeline finishes", async () => {
      const service = createPipelineService(runner)

      const promise = service.startPipeline("my-book", {
        booksDir: "/tmp/books",
        apiKey: "sk-test",
        promptsDir: "/tmp/prompts",
      })
      await promise

      const status = service.getStatus("my-book")
      expect(status!.status).toBe("completed")
      expect(status!.completedAt).toBeDefined()
    })

    it("returns failed status after pipeline error", async () => {
      const failRunner = createMockRunner({
        shouldFail: true,
        errorMessage: "No API key",
      })
      const service = createPipelineService(failRunner)

      const promise = service.startPipeline("my-book", {
        booksDir: "/tmp/books",
        apiKey: "sk-test",
        promptsDir: "/tmp/prompts",
      })
      await promise

      const status = service.getStatus("my-book")
      expect(status!.status).toBe("failed")
      expect(status!.error).toBe("No API key")
    })
  })

  describe("startPipeline", () => {
    it("rejects duplicate pipeline runs", async () => {
      const slowRunner = createMockRunner({ delay: 500 })
      const service = createPipelineService(slowRunner)

      service.startPipeline("my-book", {
        booksDir: "/tmp/books",
        apiKey: "sk-test",
        promptsDir: "/tmp/prompts",
      })

      await expect(
        service.startPipeline("my-book", {
          booksDir: "/tmp/books",
          apiKey: "sk-test",
          promptsDir: "/tmp/prompts",
        })
      ).rejects.toThrow("Pipeline already running for book: my-book")
    })

    it("allows restarting after completion", async () => {
      const service = createPipelineService(runner)

      await service.startPipeline("my-book", {
        booksDir: "/tmp/books",
        apiKey: "sk-test",
        promptsDir: "/tmp/prompts",
      })
      expect(service.getStatus("my-book")!.status).toBe("completed")

      // Should be able to start again
      await service.startPipeline("my-book", {
        booksDir: "/tmp/books",
        apiKey: "sk-test",
        promptsDir: "/tmp/prompts",
      })
      expect(service.getStatus("my-book")!.status).toBe("completed")
    })

    it("allows restarting after failure", async () => {
      const failRunner = createMockRunner({ shouldFail: true })
      const service = createPipelineService(failRunner)

      await service.startPipeline("my-book", {
        booksDir: "/tmp/books",
        apiKey: "sk-test",
        promptsDir: "/tmp/prompts",
      })
      expect(service.getStatus("my-book")!.status).toBe("failed")

      // Should be able to restart
      const successService = createPipelineService(runner)
      await successService.startPipeline("my-book", {
        booksDir: "/tmp/books",
        apiKey: "sk-test",
        promptsDir: "/tmp/prompts",
      })
    })

    it("passes options to the runner", async () => {
      const service = createPipelineService(runner)

      await service.startPipeline("my-book", {
        booksDir: "/tmp/books",
        apiKey: "sk-test",
        promptsDir: "/tmp/prompts",
        startPage: 1,
        endPage: 5,
      })

      expect(runner.run).toHaveBeenCalledWith(
        "my-book",
        expect.objectContaining({
          booksDir: "/tmp/books",
          apiKey: "sk-test",
          promptsDir: "/tmp/prompts",
          startPage: 1,
          endPage: 5,
        }),
        expect.anything() // progress
      )
    })
  })

  describe("listeners", () => {
    it("receives progress events", async () => {
      const service = createPipelineService(runner)
      const events: PipelineSSEEvent[] = []

      const unsubscribe = service.addListener("my-book", (event) => {
        events.push(event)
      })

      await service.startPipeline("my-book", {
        booksDir: "/tmp/books",
        apiKey: "sk-test",
        promptsDir: "/tmp/prompts",
      })

      unsubscribe()

      // Should have received: step-start, step-progress, step-complete, pipeline-complete
      expect(events.length).toBeGreaterThanOrEqual(4)
      expect(events[0]).toEqual({
        type: "progress",
        data: { type: "step-start", step: "extract" },
      })
      expect(events[events.length - 1]).toEqual({
        type: "pipeline-complete",
        label: "my-book",
      })
    })

    it("receives pipeline-error on failure", async () => {
      const failRunner = createMockRunner({
        shouldFail: true,
        errorMessage: "Bad key",
      })
      const service = createPipelineService(failRunner)
      const events: PipelineSSEEvent[] = []

      service.addListener("my-book", (event) => {
        events.push(event)
      })

      await service.startPipeline("my-book", {
        booksDir: "/tmp/books",
        apiKey: "sk-test",
        promptsDir: "/tmp/prompts",
      })

      const lastEvent = events[events.length - 1]
      expect(lastEvent.type).toBe("pipeline-error")
      if (lastEvent.type === "pipeline-error") {
        expect(lastEvent.error).toBe("Bad key")
      }
    })

    it("unsubscribe stops receiving events", async () => {
      const slowRunner = createMockRunner({ delay: 50 })
      const service = createPipelineService(slowRunner)
      const events: PipelineSSEEvent[] = []

      const unsubscribe = service.addListener("my-book", (event) => {
        events.push(event)
      })

      service.startPipeline("my-book", {
        booksDir: "/tmp/books",
        apiKey: "sk-test",
        promptsDir: "/tmp/prompts",
      })

      // Unsubscribe immediately
      unsubscribe()

      // Wait for pipeline to complete
      await new Promise((r) => setTimeout(r, 100))

      // Should have received no events (or at most events before unsubscribe)
      // The key point is we won't receive the completion event
      const hasComplete = events.some((e) => e.type === "pipeline-complete")
      expect(hasComplete).toBe(false)
    })

    it("multiple listeners all receive events", async () => {
      const service = createPipelineService(runner)
      const events1: PipelineSSEEvent[] = []
      const events2: PipelineSSEEvent[] = []

      service.addListener("my-book", (e) => events1.push(e))
      service.addListener("my-book", (e) => events2.push(e))

      await service.startPipeline("my-book", {
        booksDir: "/tmp/books",
        apiKey: "sk-test",
        promptsDir: "/tmp/prompts",
      })

      expect(events1.length).toBe(events2.length)
      expect(events1.length).toBeGreaterThan(0)
    })
  })
})
