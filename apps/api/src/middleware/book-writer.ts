import type { MiddlewareHandler } from "hono"
import fs from "node:fs"
import { HTTPException } from "hono/http-exception"
import { resolveBookPaths, withBookWriter, recoverSectioningTransition } from "@adt/storage"

/** Adapted from published SPEC-0010/#886. Reads remain read-only; queued runs
 * and cancellation are admitted by their service when execution starts. */
export function bookWriterMiddleware(booksDir: string): MiddlewareHandler {
  return async (c, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return next()
    const label = c.req.param("label")
    if (!label) return next()
    const suffix = c.req.path.split(`/books/${encodeURIComponent(label)}`)[1] ?? ""
    if (suffix === "" && c.req.method === "POST" && ["import", "preview-import"].includes(label)) return next()
    if (suffix.startsWith("/stages") || suffix.startsWith("/tasks")) return next()
    let bookDir: string
    try { bookDir = resolveBookPaths(label, booksDir).bookDir }
    catch { throw new HTTPException(400, { message: "Invalid book label" }) }
    if (!fs.existsSync(bookDir)) throw new HTTPException(404, { message: "Book not found" })
    return withBookWriter(bookDir, () => {
      recoverSectioningTransition(bookDir)
      return next()
    })
  }
}
