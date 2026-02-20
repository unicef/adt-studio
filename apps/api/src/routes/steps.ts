import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { createBookStorage } from "@adt/storage"
import { StageName, PIPELINE, getStageClearNodes, getStageClearOrder } from "@adt/types"
import type { StepService, StepSSEEvent } from "../services/step-service.js"
import type { PipelineService } from "../services/pipeline-service.js"

const StepRunBody = z
  .object({
    fromStep: StageName,
    toStep: StageName,
  })
  .strict()

/** Build a beforeRun callback that clears downstream data for a stage.
 *  The returned function is idempotent — only runs once even if called multiple times. */
function makeBeforeRun(label: string, fromStep: StageName, booksDir: string): () => void {
  let ran = false
  return () => {
    if (ran) return
    ran = true
    const storage = createBookStorage(label, booksDir)
    try {
      if (fromStep === "extract") {
        // clearExtractedData also clears step_completions
        storage.clearExtractedData()
      } else {
        const nodes = getStageClearNodes(fromStep)
        if (nodes.length > 0) {
          storage.clearNodesByType(nodes)
        }
        // Clear step completion records for all downstream stages
        const stagesToClear = getStageClearOrder(fromStep)
        const stepsToClear = PIPELINE
          .filter((s) => stagesToClear.includes(s.name))
          .flatMap((s) => s.steps.map((step) => step.name))
        storage.clearStepCompletions(stepsToClear)
      }
    } finally {
      storage.close()
    }
  }
}

export function createStepRoutes(
  stepService: StepService,
  pipelineService: PipelineService,
  booksDir: string,
  promptsDir: string,
  configPath?: string
): Hono {
  const app = new Hono()

  // POST /books/:label/steps/run — Start or queue a step-scoped run
  app.post("/books/:label/steps/run", async (c) => {
    const { label } = c.req.param()
    const apiKey = c.req.header("X-OpenAI-Key")

    if (!apiKey) {
      throw new HTTPException(400, {
        message: "API key required. Set X-OpenAI-Key header.",
      })
    }

    // Full pipeline conflict is still a hard block
    const pipelineJob = pipelineService.getStatus(label)
    if (pipelineJob?.status === "running") {
      throw new HTTPException(409, {
        message: `Full pipeline already running for book: ${label}`,
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

    const azureSpeechKey = c.req.header("X-Azure-Speech-Key") || undefined
    const azureSpeechRegion = c.req.header("X-Azure-Speech-Region") || undefined

    console.log(`[steps] ${label}: ${fromStep}→${toStep} azureKey=${azureSpeechKey ? "set" : "NOT SET"} azureRegion=${azureSpeechRegion ?? "NOT SET"}`)

    const clearData = makeBeforeRun(label, fromStep, booksDir)

    const result = stepService.startStepRun(label, {
      booksDir,
      apiKey,
      promptsDir,
      configPath,
      fromStep,
      toStep,
      azureSpeechKey,
      azureSpeechRegion,
      // Queued jobs clear data when they start executing
      beforeRun: clearData,
    })

    // For immediately started jobs, clear data synchronously so the
    // frontend can refetch and see the cleared state right away.
    if (result.status === "started") {
      clearData()
    }

    return c.json({ status: result.status, label, fromStep, toStep })
  })

  // GET /books/:label/steps/status — Get step run status (JSON or SSE)
  app.get("/books/:label/steps/status", (c) => {
    const { label } = c.req.param()
    const accept = c.req.header("accept") ?? ""

    if (accept.includes("text/event-stream")) {
      return streamSSE(c, async (stream) => {
        const { active: job } = stepService.getStatus(label)

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

        const eventQueue: StepSSEEvent[] = []
        let done = false

        const unsubscribe = stepService.addListener(label, (event) => {
          if (done) return
          eventQueue.push(event)
        })

        // Re-check after subscribing to avoid race
        const { active: jobAfterSubscribe } = stepService.getStatus(label)
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
          while (eventQueue.length > 0) {
            const event = eventQueue.shift()!
            try {
              if (event.type === "progress") {
                await stream.writeSSE({
                  event: "progress",
                  data: JSON.stringify(event.data),
                })
              } else if (event.type === "queue-next") {
                await stream.writeSSE({
                  event: "queue-next",
                  data: JSON.stringify({
                    fromStep: event.fromStep,
                    toStep: event.toStep,
                  }),
                })
              } else if (event.type === "step-run-complete") {
                await stream.writeSSE({
                  event: "complete",
                  data: JSON.stringify({ label: event.label }),
                })
                // Only close the stream if nothing else is running or queued
                const { active, queue } = stepService.getStatus(label)
                if (!active || active.status !== "running") {
                  if (queue.length === 0) {
                    done = true
                    break
                  }
                }
              } else if (event.type === "step-run-error") {
                await stream.writeSSE({
                  event: "error",
                  data: JSON.stringify({
                    label: event.label,
                    error: event.error,
                  }),
                })
                // Only close the stream if nothing else is running or queued
                const { active, queue } = stepService.getStatus(label)
                if (!active || active.status !== "running") {
                  if (queue.length === 0) {
                    done = true
                    break
                  }
                }
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

    const { active, queue } = stepService.getStatus(label)
    if (!active) {
      return c.json({ status: "idle", label, queue: [] })
    }
    return c.json({ ...active, queue })
  })

  return app
}
