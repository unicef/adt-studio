import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { createBookStorage, openBookDb } from "@adt/storage"
import { StageName, STAGE_ORDER, PIPELINE, parseBookLabel, getStageClearNodes, getStageClearOrder } from "@adt/types"
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

  // GET /books/:label/step-status — Unified stage + step status
  // Merges DB step_completions with in-memory StageService run state.
  app.get("/books/:label/step-status", (c) => {
    const { label } = c.req.param()
    let safeLabel: string
    try {
      safeLabel = parseBookLabel(label)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new HTTPException(400, { message })
    }
    const resolvedDir = path.resolve(booksDir)
    const dbPath = path.join(resolvedDir, safeLabel, `${safeLabel}.db`)

    // Run-derived states from the in-memory service
    const runStates = stageService.getStageStates(label)
    const activeSteps = stageService.getRunningSteps(label)
    const { active } = stageService.getStatus(label)

    if (!fs.existsSync(dbPath)) {
      // No DB yet — only return run states
      const stages: Record<string, string> = {}
      for (const stage of STAGE_ORDER) {
        stages[stage] = runStates[stage] ?? "idle"
      }
      const steps: Record<string, string> = {}
      for (const stage of PIPELINE) {
        for (const step of stage.steps) {
          steps[step.name] = activeSteps.has(step.name) ? "running" : "idle"
        }
      }
      return c.json({ stages, steps, error: active?.error ?? null })
    }

    const db = openBookDb(dbPath)
    try {
      const rows = db.all("SELECT step FROM step_completions") as Array<{ step: string }>
      const completedSteps = new Set(rows.map((r) => r.step))

      // Compute per-step state: running (in-memory) > done (DB) > idle
      const steps: Record<string, string> = {}
      for (const stage of PIPELINE) {
        for (const step of stage.steps) {
          if (activeSteps.has(step.name)) {
            steps[step.name] = "running"
          } else if (completedSteps.has(step.name)) {
            steps[step.name] = "done"
          } else {
            steps[step.name] = "idle"
          }
        }
      }

      // Compute per-stage state with precedence:
      // queued/error (explicit run intent/failure) > done (DB) > running/idle
      const stages: Record<string, string> = {}
      for (const stage of PIPELINE) {
        const runState = runStates[stage.name]
        const allDone = stage.steps.length > 0 && stage.steps.every((s) => completedSteps.has(s.name))
        if (runState === "queued" || runState === "error") {
          stages[stage.name] = runState
        } else if (allDone) {
          stages[stage.name] = "done"
        } else {
          stages[stage.name] = runState ?? "idle"
        }
      }

      // Check if ADT is packaged (preview stage)
      const adtDir = path.join(resolvedDir, safeLabel, "adt")
      if (fs.existsSync(adtDir)) stages.preview = "done"

      return c.json({ stages, steps, error: active?.error ?? null })
    } finally {
      db.close()
    }
  })

  // GET /books/:label/stages/status — Always-on SSE stream for stage run events.
  // The connection stays open until the client disconnects. Events are pushed
  // whenever a stage run emits progress, completes, errors, or a queued run starts.
  app.get("/books/:label/stages/status", (c) => {
    const { label } = c.req.param()
    const accept = c.req.header("accept") ?? ""

    if (accept.includes("text/event-stream")) {
      return streamSSE(c, async (stream) => {
        const eventQueue: StageSSEEvent[] = []
        let done = false

        const unsubscribe = stageService.addListener(label, (event) => {
          if (done) return
          eventQueue.push(event)
        })

        stream.onAbort(() => {
          done = true
          unsubscribe()
        })

        // Keep streaming until the client disconnects
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
              } else if (event.type === "stage-run-error") {
                await stream.writeSSE({
                  event: "error",
                  data: JSON.stringify({
                    label: event.label,
                    error: event.error,
                  }),
                })
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

    // JSON fallback for non-SSE requests
    const { active, queue } = stageService.getStatus(label)
    if (!active) {
      return c.json({ status: "idle", label, queue: [] })
    }
    return c.json({ ...active, queue })
  })

  // Removed Feb 2026: POST /books/:label/steps/run was renamed to /stages/run.
  // Return 410 Gone with an actionable message so callers know exactly what changed.
  app.post("/books/:label/steps/run", (c) => {
    return c.json(
      {
        error:
          "This endpoint was removed. Use POST /books/:label/stages/run " +
          "with body { fromStage: string, toStage: string }.",
      },
      410
    )
  })

  return app
}
