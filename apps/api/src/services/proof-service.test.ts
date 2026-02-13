import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  createProofService,
  type ProofRunner,
  type ProofSSEEvent,
} from "./proof-service.js"

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
      progress.emit({
        type: "step-progress",
        step: "image-captioning",
        message: "page 1/1",
        page: 1,
        totalPages: 1,
      })
      progress.emit({ type: "step-complete", step: "image-captioning" })
    }),
  }
}

describe("ProofService", () => {
  let runner: ProofRunner

  beforeEach(() => {
    runner = createMockRunner()
  })

  describe("getStatus", () => {
    it("returns null for unknown book", () => {
      const service = createProofService(runner)
      expect(service.getStatus("unknown")).toBeNull()
    })

    it("returns running status after start", async () => {
      const slowRunner = createMockRunner({ delay: 500 })
      const service = createProofService(slowRunner)

      service.startProof("my-book", {
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

    it("returns completed status after proof finishes", async () => {
      const service = createProofService(runner)

      const promise = service.startProof("my-book", {
        booksDir: "/tmp/books",
        apiKey: "sk-test",
        promptsDir: "/tmp/prompts",
      })
      await promise

      const status = service.getStatus("my-book")
      expect(status!.status).toBe("completed")
      expect(status!.completedAt).toBeDefined()
    })

    it("returns failed status after proof error", async () => {
      const failRunner = createMockRunner({
        shouldFail: true,
        errorMessage: "Proof error",
      })
      const service = createProofService(failRunner)

      const promise = service.startProof("my-book", {
        booksDir: "/tmp/books",
        apiKey: "sk-test",
        promptsDir: "/tmp/prompts",
      })
      await promise

      const status = service.getStatus("my-book")
      expect(status!.status).toBe("failed")
      expect(status!.error).toBe("Proof error")
    })
  })

  describe("startProof", () => {
    it("rejects duplicate proof runs", async () => {
      const slowRunner = createMockRunner({ delay: 500 })
      const service = createProofService(slowRunner)

      service.startProof("my-book", {
        booksDir: "/tmp/books",
        apiKey: "sk-test",
        promptsDir: "/tmp/prompts",
      })

      await expect(
        service.startProof("my-book", {
          booksDir: "/tmp/books",
          apiKey: "sk-test",
          promptsDir: "/tmp/prompts",
        })
      ).rejects.toThrow("Proof generation already running for book: my-book")
    })

    it("passes options to the runner", async () => {
      const service = createProofService(runner)

      await service.startProof("my-book", {
        booksDir: "/tmp/books",
        apiKey: "sk-test",
        promptsDir: "/tmp/prompts",
      })

      expect(runner.run).toHaveBeenCalledWith(
        "my-book",
        expect.objectContaining({
          booksDir: "/tmp/books",
          apiKey: "sk-test",
          promptsDir: "/tmp/prompts",
        }),
        expect.anything()
      )
    })
  })

  describe("listeners", () => {
    it("receives progress and complete events", async () => {
      const service = createProofService(runner)
      const events: ProofSSEEvent[] = []

      const unsubscribe = service.addListener("my-book", (event) => {
        events.push(event)
      })

      await service.startProof("my-book", {
        booksDir: "/tmp/books",
        apiKey: "sk-test",
        promptsDir: "/tmp/prompts",
      })

      unsubscribe()

      expect(events.length).toBeGreaterThanOrEqual(4)
      expect(events[0]).toEqual({
        type: "progress",
        data: { type: "step-start", step: "image-captioning" },
      })
      expect(events[events.length - 1]).toEqual({
        type: "proof-complete",
        label: "my-book",
      })
    })

    it("receives proof-error on failure", async () => {
      const failRunner = createMockRunner({
        shouldFail: true,
        errorMessage: "Bad key",
      })
      const service = createProofService(failRunner)
      const events: ProofSSEEvent[] = []

      service.addListener("my-book", (event) => {
        events.push(event)
      })

      await service.startProof("my-book", {
        booksDir: "/tmp/books",
        apiKey: "sk-test",
        promptsDir: "/tmp/prompts",
      })

      const lastEvent = events[events.length - 1]
      expect(lastEvent.type).toBe("proof-error")
      if (lastEvent.type === "proof-error") {
        expect(lastEvent.error).toBe("Bad key")
      }
    })
  })
})
