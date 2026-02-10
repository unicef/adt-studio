import { describe, it, expect } from "vitest"
import app from "../app.js"

describe("GET /api/health", () => {
  it("returns 200 with status ok", async () => {
    const res = await app.request("/api/health")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ status: "ok" })
  })
})
