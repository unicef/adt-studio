import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { createBookStorage } from "@adt/storage"
import { StageName, PIPELINE } from "@adt/types"
import type { StepService, StepSSEEvent } from "../services/step-service.js"
import type { PipelineService } from "../services/pipeline-service.js"

const StepRunBody = z
  .object({
    fromStep: StageName,
    toStep: StageName,
  })
  .strict()

/** Node types produced by each stage — derived from PIPELINE step names.
 *  storyboard-acceptance is an extra node type written by the storyboard runner. */
const STAGE_NODES: Record<string, string[]> = Object.fromEntries(
  PIPELINE.map((stage) => [
    stage.name,
    [
      ...stage.steps.map((s) => s.name),
      ...(stage.name === "storyboard" ? ["storyboard-acceptance"] : []),
      ...(stage.name === "text-and-speech" ? ["text-catalog-translation"] : []),
    ],
  ]),
)

/** Direct downstream dependents — derived from PIPELINE dependsOn. */
const STAGE_DEPENDENTS: Record<string, string[]> = Object.fromEntries(
  PIPELINE.map((stage) => [
    stage.name,
    PIPELINE.filter((s) => s.dependsOn.includes(stage.name)).map((s) => s.name),
  ]),
)

/** Collect node types for a stage and all its transitive dependents. */
function getNodesToClear(stage: string): string[] {
  const nodes = [...(STAGE_NODES[stage] ?? [])]
  const queue = [...(STAGE_DEPENDENTS[stage] ?? [])]
  const visited = new Set<string>()
  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    nodes.push(...(STAGE_NODES[current] ?? []))
    queue.push(...(STAGE_DEPENDENTS[current] ?? []))
  }
  return nodes
}

export function createStepRoutes(
  stepService: StepService,
  pipelineService: PipelineService,
  booksDir: string,
  promptsDir: string,
  configPath?: string
): Hono {
  const app = new Hono()

  // POST /books/:label/steps/run — Start a step-scoped run
  app.post("/books/:label/steps/run", async (c) => {
    const { label } = c.req.param()
    const apiKey = c.req.header("X-OpenAI-Key")

    if (!apiKey) {
      throw new HTTPException(400, {
        message: "API key required. Set X-OpenAI-Key header.",
      })
    }

    // Check for conflicts
    const pipelineJob = pipelineService.getStatus(label)
    if (pipelineJob?.status === "running") {
      throw new HTTPException(409, {
        message: `Full pipeline already running for book: ${label}`,
      })
    }

    const existing = stepService.getStatus(label)
    if (existing?.status === "running") {
      throw new HTTPException(409, {
        message: `Step run already in progress for book: ${label}`,
      })
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" })
    }

    const parsed = StepRunBody.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid step run options: ${parsed.error.message}`,
      })
    }

    const { fromStep, toStep } = parsed.data

    // Synchronously clear data that will be rebuilt (including all
    // downstream dependents) before returning, so the frontend can
    // immediately reflect the cleared state.
    if (fromStep === "extract") {
      const storage = createBookStorage(label, booksDir)
      try {
        storage.clearExtractedData()
      } finally {
        storage.close()
      }
    } else {
      const nodes = getNodesToClear(fromStep)
      if (nodes.length > 0) {
        const storage = createBookStorage(label, booksDir)
        try {
          storage.clearNodesByType(nodes)
        } finally {
          storage.close()
        }
      }
    }

    const azureSpeechKey = c.req.header("X-Azure-Speech-Key") || undefined
    const azureSpeechRegion = c.req.header("X-Azure-Speech-Region") || undefined

    console.log(`[steps] ${label}: ${fromStep}→${toStep} azureKey=${azureSpeechKey ? "set" : "NOT SET"} azureRegion=${azureSpeechRegion ?? "NOT SET"}`)

    stepService
      .startStepRun(label, {
        booksDir,
        apiKey,
        promptsDir,
        configPath,
        fromStep,
        toStep,
        azureSpeechKey,
        azureSpeechRegion,
      })
      .catch(() => {
        // Error is tracked in job status
      })

    return c.json({ status: "started", label, fromStep, toStep })
  })

  // GET /books/:label/steps/status — Get step run status (JSON or SSE)
  app.get("/books/:label/steps/status", (c) => {
    const { label } = c.req.param()
    const accept = c.req.header("accept") ?? ""

    if (accept.includes("text/event-stream")) {
      return streamSSE(c, async (stream) => {
        const job = stepService.getStatus(label)

        if (job?.status === "completed") {
          await stream.writeSSE({
            event: "complete",
            data: JSON.stringify({ label }),
          })
          return
        }
        if (job?.status === "failed") {
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({ label, error: job.error }),
          })
          return
        }

        const queue: StepSSEEvent[] = []
        let done = false

        const unsubscribe = stepService.addListener(label, (event) => {
          if (done) return
          queue.push(event)
        })

        // Re-check after subscribing to avoid race
        const jobAfterSubscribe = stepService.getStatus(label)
        if (
          jobAfterSubscribe?.status === "completed" ||
          jobAfterSubscribe?.status === "failed"
        ) {
          const event =
            jobAfterSubscribe.status === "completed" ? "complete" : "error"
          const data =
            jobAfterSubscribe.status === "completed"
              ? { label }
              : { label, error: jobAfterSubscribe.error }
          await stream.writeSSE({ event, data: JSON.stringify(data) })
          unsubscribe()
          return
        }

        stream.onAbort(() => {
          done = true
          unsubscribe()
        })

        while (!done) {
          while (queue.length > 0) {
            const event = queue.shift()!
            try {
              if (event.type === "progress") {
                await stream.writeSSE({
                  event: "progress",
                  data: JSON.stringify(event.data),
                })
              } else if (event.type === "step-run-complete") {
                await stream.writeSSE({
                  event: "complete",
                  data: JSON.stringify({ label: event.label }),
                })
                done = true
                break
              } else if (event.type === "step-run-error") {
                await stream.writeSSE({
                  event: "error",
                  data: JSON.stringify({
                    label: event.label,
                    error: event.error,
                  }),
                })
                done = true
                break
              }
            } catch {
              done = true
              break
            }
          }
          if (!done) {
            await new Promise((r) => setTimeout(r, 50))
          }
        }

        unsubscribe()
      })
    }

    const job = stepService.getStatus(label)
    if (!job) {
      return c.json({ status: "idle", label })
    }
    return c.json(job)
  })

  return app
}
