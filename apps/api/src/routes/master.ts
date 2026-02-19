import fs from "node:fs"
import path from "node:path"
import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { parseBookLabel } from "@adt/types"
import { openBookDb } from "@adt/storage"
import type { MasterService, MasterSSEEvent } from "../services/master-service.js"

const MasterRunBody = z.object({}).strict()

function requireMasterPrerequisites(label: string, booksDir: string): void {
  const safeLabel = parseBookLabel(label)
  const resolvedBooksDir = path.resolve(booksDir)
  const bookDir = path.resolve(resolvedBooksDir, safeLabel)
  if (
    bookDir !== resolvedBooksDir &&
    !bookDir.startsWith(resolvedBooksDir + path.sep)
  ) {
    throw new Error("Invalid book path")
  }

  const dbPath = path.join(bookDir, `${safeLabel}.db`)
  if (!fs.existsSync(dbPath)) {
    throw new HTTPException(404, {
      message: `Book not found: ${safeLabel}`,
    })
  }

  const db = openBookDb(dbPath)
  try {
    const storyboardRows = db.all(
      "SELECT 1 FROM node_data WHERE node = ? AND item_id = ? LIMIT 1",
      ["storyboard-acceptance", "book"]
    ) as Array<Record<string, unknown>>
    if (storyboardRows.length === 0) {
      throw new HTTPException(409, {
        message: "Storyboard must be accepted before running master.",
      })
    }

    const proofRows = db.all(
      "SELECT data FROM node_data WHERE node = ? AND item_id = ? ORDER BY version DESC LIMIT 1",
      ["proof-status", "book"]
    ) as Array<{ data: string }>
    if (proofRows.length === 0) {
      throw new HTTPException(409, {
        message: "Proof must complete before running master.",
      })
    }
    let proofData: { status?: string } | null = null
    try {
      proofData = JSON.parse(proofRows[0].data) as { status?: string }
    } catch {
      proofData = null
    }
    if (proofData?.status !== "completed") {
      throw new HTTPException(409, {
        message: "Proof must complete before running master.",
      })
    }
  } finally {
    db.close()
  }
}

export function createMasterRoutes(
  service: MasterService,
  booksDir: string,
  promptsDir: string,
  configPath?: string
): Hono {
  const app = new Hono()

  // POST /books/:label/master/run — Start master generation (post-proof steps)
  app.post("/books/:label/master/run", async (c) => {
    const { label } = c.req.param()
    const apiKey = c.req.header("X-OpenAI-Key")

    if (!apiKey) {
      throw new HTTPException(400, {
        message: "API key required. Set X-OpenAI-Key header.",
      })
    }

    try {
      requireMasterPrerequisites(label, booksDir)
    } catch (err) {
      if (err instanceof HTTPException) {
        throw err
      }
      const message = err instanceof Error ? err.message : String(err)
      throw new HTTPException(400, { message })
    }

    const existing = service.getStatus(label)
    if (existing?.status === "running") {
      throw new HTTPException(409, {
        message: `Master generation already running for book: ${label}`,
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

      const parsed = MasterRunBody.safeParse(body)
      if (!parsed.success) {
        throw new HTTPException(400, {
          message: `Invalid master run options: ${parsed.error.message}`,
        })
      }
    }

    const azureSpeechKey = c.req.header("X-Azure-Speech-Key") || undefined
    const azureSpeechRegion = c.req.header("X-Azure-Speech-Region") || undefined

    service
      .startMaster(label, {
        booksDir,
        apiKey,
        promptsDir,
        configPath,
        azureSpeechKey,
        azureSpeechRegion,
      })
      .catch(() => {
        // Error is tracked in job status
      })

    return c.json({ status: "started", label })
  })

  // GET /books/:label/master/status — Get master generation status (JSON or SSE)
  app.get("/books/:label/master/status", (c) => {
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

        const queue: MasterSSEEvent[] = []
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
              } else if (event.type === "master-complete") {
                await stream.writeSSE({
                  event: "complete",
                  data: JSON.stringify({ label: event.label }),
                })
                done = true
                break
              } else if (event.type === "master-error") {
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
