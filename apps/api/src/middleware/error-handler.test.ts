import { Hono } from "hono"
import { afterEach, describe, expect, it, vi } from "vitest"

import { errorHandler } from "./error-handler.js"

afterEach(() => vi.restoreAllMocks())

describe("errorHandler", () => {
  it("answers an unexpected error generically, with a reference to the logged error", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const app = new Hono()
    app.onError(errorHandler)
    app.get("/boom", () => { throw new Error("secret path /home/someone/books") })

    const res = await app.request("/boom")
    const body = await res.json() as { error: string; reference: string }

    expect(res.status).toBe(500)
    expect(body.reference).toMatch(/^[0-9a-f]{8}$/)
    expect(body.error).toContain("Internal server error")
    expect(body.error).toContain(body.reference)
    expect(body.error).not.toContain("secret path")
    expect(log).toHaveBeenCalledWith(`[error ${body.reference}]`, expect.any(Error))
  })
})
