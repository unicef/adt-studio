import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import type { ProofService, ProofSSEEvent } from "../services/proof-service.js"

const ProofRunBody = z.object({}).strict()

export function createProofRoutes(
  service: ProofService,
  booksDir: string,
  promptsDir: string,
  configPath?: string
): Hono {
  const app = new Hono()

  // POST /books/:label/proof/run — Start proof generation (post-storyboard steps)
  app.post("/books/:label/proof/run", async (c) => {
    const { label } = c.req.param()
    const apiKey = c.req.header("X-OpenAI-Key")

    if (!apiKey) {
      throw new HTTPException(400, {
        message: "API key required. Set X-OpenAI-Key header.",
      })
    }

    const existing = service.getStatus(label)
    if (existing?.status === "running") {
      throw new HTTPException(409, {
        message: `Proof generation already running for book: ${label}`,
      })
    }

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

      const parsed = ProofRunBody.safeParse(body)
      if (!parsed.success) {
        throw new HTTPException(400, {
          message: `Invalid proof run options: ${parsed.error.message}`,
        })
      }
    }

    service
      .startProof(label, {
        booksDir,
        apiKey,
        promptsDir,
        configPath,
      })
      .catch(() => {
        // Error is tracked in job status
      })

    return c.json({ status: "started", label })
  })

  // GET /books/:label/proof/status — Get proof generation status (JSON or SSE)
  app.get("/books/:label/proof/status", (c) => {
    const { label } = c.req.param()
    const accept = c.req.header("accept") ?? ""

    if (accept.includes("text/event-stream")) {
      return streamSSE(c, async (stream) => {
        const job = service.getStatus(label)

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

        const queue: ProofSSEEvent[] = []
        let done = false

        const unsubscribe = service.addListener(label, (event) => {
          if (done) return
          queue.push(event)
        })

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

        while (!done) {
          while (queue.length > 0) {
            const event = queue.shift()!
            try {
              if (event.type === "progress") {
                await stream.writeSSE({
                  event: "progress",
                  data: JSON.stringify(event.data),
                })
              } else if (event.type === "proof-complete") {
                await stream.writeSSE({
                  event: "complete",
                  data: JSON.stringify({ label: event.label }),
                })
                done = true
                break
              } else if (event.type === "proof-error") {
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

    const job = service.getStatus(label)
    if (!job) {
      return c.json({ status: "idle", label })
    }
    return c.json(job)
  })

  return app
}
