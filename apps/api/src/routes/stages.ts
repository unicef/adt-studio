import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { createBookStorage } from "@adt/storage"
import { StageName, PIPELINE, getStageClearNodes, getStageClearOrder } from "@adt/types"
import type { StageService, StageSSEEvent } from "../services/stage-service.js"

const StageRunBody = z
  .object({
    fromStage: StageName,
    toStage: StageName,
  })
  .strict()

/** Build a beforeRun callback that clears downstream data for a stage.
 *  The returned function is idempotent — only runs once even if called multiple times. */
function makeBeforeRun(label: string, fromStage: StageName, booksDir: string): () => void {
  let ran = false
  return () => {
    if (ran) return
    ran = true
    const storage = createBookStorage(label, booksDir)
    try {
      if (fromStage === "extract") {
        // clearExtractedData also clears step_completions
        storage.clearExtractedData()
      } else {
        const nodes = getStageClearNodes(fromStage)
        if (nodes.length > 0) {
          storage.clearNodesByType(nodes)
        }
        // Clear step completion records for all downstream stages
        const stagesToClear = getStageClearOrder(fromStage)
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

export function createStageRoutes(
  stageService: StageService,
  booksDir: string,
  promptsDir: string,
  configPath?: string
): Hono {
  const app = new Hono()

  // POST /books/:label/stages/run — Start or queue a stage-scoped run
  app.post("/books/:label/stages/run", async (c) => {
    const { label } = c.req.param()
    const apiKey = c.req.header("X-OpenAI-Key")

    if (!apiKey) {
      throw new HTTPException(400, {
        message: "API key required. Set X-OpenAI-Key header.",
      })
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new HTTPException(400, { message: "Invalid JSON body" })
    }

    const parsed = StageRunBody.safeParse(body)
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid stage run options: ${parsed.error.message}`,
      })
    }

    const { fromStage, toStage } = parsed.data

    const azureSpeechKey = c.req.header("X-Azure-Speech-Key") || undefined
    const azureSpeechRegion = c.req.header("X-Azure-Speech-Region") || undefined

    console.log(`[stages] ${label}: ${fromStage}→${toStage} azureKey=${azureSpeechKey ? "set" : "NOT SET"} azureRegion=${azureSpeechRegion ?? "NOT SET"}`)

    const clearData = makeBeforeRun(label, fromStage, booksDir)

    const result = stageService.startStageRun(label, {
      booksDir,
      apiKey,
      promptsDir,
      configPath,
      fromStage,
      toStage,
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

    return c.json({ status: result.status, label, fromStage, toStage })
  })

  // GET /books/:label/stages/status — Get stage run status (JSON or SSE)
  app.get("/books/:label/stages/status", (c) => {
    const { label } = c.req.param()
    const accept = c.req.header("accept") ?? ""

    if (accept.includes("text/event-stream")) {
      return streamSSE(c, async (stream) => {
        const { active: job } = stageService.getStatus(label)

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

        const eventQueue: StageSSEEvent[] = []
        let done = false

        const unsubscribe = stageService.addListener(label, (event) => {
          if (done) return
          eventQueue.push(event)
        })

        // Re-check after subscribing to avoid race
        const { active: jobAfterSubscribe } = stageService.getStatus(label)
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
                    fromStage: event.fromStage,
                    toStage: event.toStage,
                  }),
                })
              } else if (event.type === "stage-run-complete") {
                await stream.writeSSE({
                  event: "complete",
                  data: JSON.stringify({ label: event.label }),
                })
                // Only close the stream if nothing else is running or queued
                const { active, queue } = stageService.getStatus(label)
                if (!active || active.status !== "running") {
                  if (queue.length === 0) {
                    done = true
                    break
                  }
                }
              } else if (event.type === "stage-run-error") {
                await stream.writeSSE({
                  event: "error",
                  data: JSON.stringify({
                    label: event.label,
                    error: event.error,
                  }),
                })
                // Only close the stream if nothing else is running or queued
                const { active, queue } = stageService.getStatus(label)
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

    const { active, queue } = stageService.getStatus(label)
    if (!active) {
      return c.json({ status: "idle", label, queue: [] })
    }
    return c.json({ ...active, queue })
  })

  return app
}
