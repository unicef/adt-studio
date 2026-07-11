import fs from "node:fs"
import path from "node:path"
import { upgradeWebSocket } from "@hono/node-server"
import {
  CreatePreviewLiveSessionRequest,
  parseBookLabel,
} from "@adt/types"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import type { PreviewLiveSessionService } from "../services/preview-live-session-service.js"
import { joinUrlsForRequest } from "./quiz-live-sessions.js"

export function createPreviewLiveSessionRoutes(
  booksDir: string,
  sessions: PreviewLiveSessionService
): Hono {
  const app = new Hono()

  app.post("/books/:label/preview-live-sessions", async (c) => {
    const label = parseBookLabel(c.req.param("label"))
    const dbPath = path.join(path.resolve(booksDir), label, `${label}.db`)
    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${label}` })
    }
    const parsed = CreatePreviewLiveSessionRequest.safeParse(await c.req.json())
    if (!parsed.success) {
      throw new HTTPException(400, {
        message: `Invalid live review settings: ${parsed.error.message}`,
      })
    }
    const previewPath = `/api/books/${encodeURIComponent(label)}/adt/v-${encodeURIComponent(parsed.data.previewVersion)}/`
    const created = sessions.create(previewPath)
    const quizStyleUrls = joinUrlsForRequest(
      c.req.url,
      c.req.header("X-Forwarded-Host") ?? c.req.header("Host"),
      c.req.header("X-Forwarded-Proto"),
      parsed.data.joinBaseUrl,
      created.code
    )
    return c.json({
      ...created,
      joinUrls: quizStyleUrls.map((url) =>
        url.replace(`/play/${created.code}`, `/review/${created.code}`)
      ),
    })
  })

  app.get("/preview-live-sessions/:code", (c) => {
    const snapshot = sessions.getSnapshot(c.req.param("code"))
    if (!snapshot) {
      throw new HTTPException(404, { message: "Live review session not found." })
    }
    return c.json(snapshot)
  })

  app.get(
    "/preview-live-sessions/:code/ws",
    upgradeWebSocket((c) => {
      const code = (c.req.param("code") ?? "").toUpperCase()
      let connectionId: string | null = null
      return {
        onOpen(_event, ws) {
          connectionId = sessions.connect(code, ws)
          if (!connectionId) ws.close(4404, "Session not found")
        },
        onMessage(event) {
          if (!connectionId || typeof event.data !== "string") return
          sessions.receive(code, connectionId, event.data)
        },
        onClose() {
          if (connectionId) sessions.disconnect(code, connectionId)
        },
        onError() {
          if (connectionId) sessions.disconnect(code, connectionId)
        },
      }
    })
  )

  return app
}
