import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { upgradeWebSocket } from "@hono/node-server"
import {
  CreateQuizLiveSessionRequest,
  parseBookLabel,
  QuizGenerationOutput,
} from "@adt/types"
import { openBookDb } from "@adt/storage"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import type { QuizLiveSessionService } from "../services/quiz-live-session-service.js"

function safeBookLabel(label: string): string {
  try {
    return parseBookLabel(label)
  } catch (error) {
    throw new HTTPException(400, {
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

export function joinUrlsForRequest(
  requestUrl: string,
  host: string | undefined,
  forwardedProto: string | undefined,
  requestedBaseUrl: string | undefined,
  code: string
): string[] {
  const currentUrl = new URL(requestUrl)
  const pathName = `/play/${code}`
  const addresses = Object.entries(os.networkInterfaces())
    .flatMap(([name, entries]) =>
      (entries ?? []).map((entry) => ({ ...entry, interfaceName: name }))
    )
    .filter(
      (entry) =>
        entry.family === "IPv4" &&
        !entry.internal &&
        !/^(docker|br-|veth|utun|vmnet|vbox)/i.test(entry.interfaceName) &&
        (entry.address.startsWith("192.168.") ||
          entry.address.startsWith("10.") ||
          entry.address.startsWith("172."))
    )
    .map((entry) => entry.address)
  const uniqueAddresses = [...new Set(addresses)].sort((a, b) => {
    const priority = (address: string) =>
      address.startsWith("192.168.") ? 0 : address.startsWith("10.") ? 1 : 2
    return priority(a) - priority(b)
  })

  if (process.env.ADT_ENVIRONMENT === "electron") {
    const port = currentUrl.port
    return uniqueAddresses.length > 0
      ? uniqueAddresses.map((address) => `http://${address}:${port}${pathName}`)
      : [`http://localhost:${port}${pathName}`]
  }

  const protocol = forwardedProto === "https" ? "https:" : currentUrl.protocol
  const configuredBaseUrl = process.env.LIVE_QUIZ_BASE_URL
  const baseUrl = new URL(
    configuredBaseUrl ??
      requestedBaseUrl ??
      `${protocol}//${host ?? currentUrl.host}`
  )
  const isLocalHostname = ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(
    baseUrl.hostname
  )
  const isDocker = fs.existsSync("/.dockerenv")
  if (isLocalHostname && !isDocker && uniqueAddresses.length > 0) {
    return uniqueAddresses.map((address) => {
      const port = baseUrl.port ? `:${baseUrl.port}` : ""
      return new URL(pathName, `${baseUrl.protocol}//${address}${port}`).toString()
    })
  }

  return [new URL(pathName, baseUrl).toString()]
}

export function createQuizLiveSessionRoutes(
  booksDir: string,
  sessions: QuizLiveSessionService
): Hono {
  const app = new Hono()

  app.post("/books/:label/quiz-sessions", async (c) => {
    const label = safeBookLabel(c.req.param("label"))
    const parsedBody = CreateQuizLiveSessionRequest.safeParse(await c.req.json())
    if (!parsedBody.success) {
      throw new HTTPException(400, {
        message: `Invalid session settings: ${parsedBody.error.message}`,
      })
    }

    const dbPath = path.join(path.resolve(booksDir), label, `${label}.db`)
    if (!fs.existsSync(dbPath)) {
      throw new HTTPException(404, { message: `Book not found: ${label}` })
    }

    const db = openBookDb(dbPath)
    try {
      const rows = db.all(
        "SELECT data FROM node_data WHERE node = ? AND item_id = ? ORDER BY version DESC LIMIT 1",
        ["quiz-generation", "book"]
      ) as Array<{ data: string }>
      if (rows.length === 0) {
        throw new HTTPException(409, {
          message: "Create at least one quiz before starting a live session.",
        })
      }

      let stored: unknown
      try {
        stored = JSON.parse(rows[0].data)
      } catch {
        throw new HTTPException(500, { message: "Stored quiz data is corrupted." })
      }
      const quizOutput = QuizGenerationOutput.safeParse(stored)
      if (!quizOutput.success) {
        throw new HTTPException(500, { message: "Stored quiz data is invalid." })
      }

      const requested = parsedBody.data.quizIndexes
      const quizzes = requested
        ? [...new Set(requested)].map((index) => quizOutput.data.quizzes[index])
        : quizOutput.data.quizzes
      if (quizzes.some((quiz) => quiz == null)) {
        throw new HTTPException(400, { message: "A selected quiz does not exist." })
      }
      if (quizzes.length === 0 || quizzes.length > 100) {
        throw new HTTPException(400, {
          message: "A live session must contain between 1 and 100 quizzes.",
        })
      }

      const created = sessions.create(quizzes)
      return c.json({
        ...created,
        joinUrls: joinUrlsForRequest(
          c.req.url,
          c.req.header("X-Forwarded-Host") ?? c.req.header("Host"),
          c.req.header("X-Forwarded-Proto"),
          parsedBody.data.joinBaseUrl,
          created.code
        ),
      })
    } finally {
      db.close()
    }
  })

  app.get("/quiz-sessions/:code", (c) => {
    const snapshot = sessions.getSnapshot(c.req.param("code"))
    if (!snapshot) {
      throw new HTTPException(404, { message: "Live quiz session not found." })
    }
    return c.json(snapshot)
  })

  app.get(
    "/quiz-sessions/:code/ws",
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
