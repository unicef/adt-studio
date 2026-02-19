import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import type { PipelineService, PipelineSSEEvent } from "../services/pipeline-service.js"

const PipelineRunBody = z
  .object({
    startPage: z.number().int().min(1).optional(),
    endPage: z.number().int().min(1).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.startPage !== undefined &&
      value.endPage !== undefined &&
      value.endPage < value.startPage
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endPage"],
        message: "endPage must be greater than or equal to startPage",
      })
    }
  })

export function createPipelineRoutes(
  service: PipelineService,
  booksDir: string,
  promptsDir: string,
  configPath?: string
): Hono {
  const app = new Hono()

  // POST /books/:label/pipeline/run — Start pipeline execution
  app.post("/books/:label/pipeline/run", async (c) => {
    const { label } = c.req.param()
    const apiKey = c.req.header("X-OpenAI-Key")

    if (!apiKey) {
      throw new HTTPException(400, {
        message: "API key required. Set X-OpenAI-Key header.",
      })
    }

    // Check if already running
    const existing = service.getStatus(label)
    if (existing?.status === "running") {
      throw new HTTPException(409, {
        message: `Pipeline already running for book: ${label}`,
      })
    }

    // Parse optional body params
    let startPage: number | undefined
    let endPage: number | undefined

    const contentType = c.req.header("content-type")
    if (contentType?.includes("application/json")) {
      let body: unknown
      try {
        body = await c.req.json()
      } catch {
        throw new HTTPException(400, {
          message: "Invalid JSON body",
        })
      }

      const parsed = PipelineRunBody.safeParse(body)
      if (!parsed.success) {
        throw new HTTPException(400, {
          message: `Invalid pipeline run options: ${parsed.error.message}`,
        })
      }

      startPage = parsed.data.startPage
      endPage = parsed.data.endPage
    }

    const azureSpeechKey = c.req.header("X-Azure-Speech-Key") || undefined
    const azureSpeechRegion = c.req.header("X-Azure-Speech-Region") || undefined

    // Fire-and-forget: startPipeline runs async, we return immediately
    service
      .startPipeline(label, {
        booksDir,
        apiKey,
        promptsDir,
        configPath,
        startPage,
        endPage,
        azureSpeechKey,
        azureSpeechRegion,
      })
      .catch(() => {
        // Error is tracked in job status, no need to handle here
      })

    return c.json({ status: "started", label })
  })

  // GET /books/:label/pipeline/status — Get pipeline status (JSON or SSE)
  app.get("/books/:label/pipeline/status", (c) => {
    const { label } = c.req.param()
    const accept = c.req.header("accept") ?? ""

    // If client accepts SSE, stream events
    if (accept.includes("text/event-stream")) {
      return streamSSE(c, async (stream) => {
        const job = service.getStatus(label)

        // If already completed or failed, send the final state and close
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

        // Queue-based SSE: listener pushes events, loop drains with awaited writes
        const queue: PipelineSSEEvent[] = []
        let done = false

        const unsubscribe = service.addListener(label, (event) => {
          if (done) return
          queue.push(event)
        })

        // Re-check status after subscribing to avoid race where pipeline
        // completes between the initial check and listener registration
        const jobAfterSubscribe = service.getStatus(label)
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

        // Drain queue with proper await on each write
        while (!done) {
          while (queue.length > 0) {
            const event = queue.shift()!
            try {
              if (event.type === "progress") {
                await stream.writeSSE({
                  event: "progress",
                  data: JSON.stringify(event.data),
                })
              } else if (event.type === "pipeline-complete") {
                await stream.writeSSE({
                  event: "complete",
                  data: JSON.stringify({ label: event.label }),
                })
                done = true
                break
              } else if (event.type === "pipeline-error") {
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
              // Stream write failed (client disconnected)
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

    // JSON status endpoint
    const job = service.getStatus(label)
    if (!job) {
      return c.json({ status: "idle", label })
    }
    return c.json(job)
  })

  return app
}
