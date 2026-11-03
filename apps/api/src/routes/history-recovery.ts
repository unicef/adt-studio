import fs from "node:fs"
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { HistoryCheckpointRequest, HistoryRepairRequest, parseBookLabel } from "@adt/types"
import { checkpointHistory, inspectHistoryRecovery, repairHistory, readHistoryRecoveryAudit } from "@adt/storage"
import { resolvePathWithin } from "../utils/path-security.js"

/** Mounted behind the existing book writer middleware. The storage entry
 * points also retain admission for non-HTTP callers and coordinated readers. */
export function createHistoryRecoveryRoutes(booksDir: string): Hono {
  const app = new Hono()
  const database = (label: string) => {
    let safe: string
    try { safe = parseBookLabel(label) } catch { throw new HTTPException(400, { message: "Invalid book label" }) }
    const file = resolvePathWithin(booksDir, safe, `${safe}.db`)
    if (!file || !fs.existsSync(file)) throw new HTTPException(404, { message: "Book not found" })
    return file
  }
  app.get("/books/:label/history-recovery", c => c.json(inspectHistoryRecovery(database(c.req.param("label")))))
  app.post("/books/:label/history-recovery/checkpoint", async c => {
    const body = HistoryCheckpointRequest.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ code: "HISTORY_RECOVERY_REQUEST_INVALID", error: "HISTORY_RECOVERY_REQUEST_INVALID" }, 400)
    return c.json(checkpointHistory(database(c.req.param("label")), body.data))
  })
  app.post("/books/:label/history-recovery/repair", async c => {
    const body = HistoryRepairRequest.safeParse(await c.req.json().catch(() => null))
    if (!body.success) return c.json({ code: "HISTORY_RECOVERY_REQUEST_INVALID", error: "HISTORY_RECOVERY_REQUEST_INVALID" }, 400)
    return c.json(repairHistory(database(c.req.param("label")), body.data))
  })
  app.get("/books/:label/history-recovery/audit/:requestId", c => {
    const requestId = z.string().uuid().safeParse(c.req.param("requestId"))
    if (!requestId.success) return c.json({ code: "HISTORY_RECOVERY_REQUEST_INVALID", error: "HISTORY_RECOVERY_REQUEST_INVALID" }, 400)
    return c.json(readHistoryRecoveryAudit(database(c.req.param("label")), requestId.data))
  })
  return app
}
