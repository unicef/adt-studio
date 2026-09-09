import { describe, expect, it } from "vitest"
import { Hono } from "hono"
import { createBookEventsRoutes } from "./book-events.js"
import { createBookEventBus } from "../services/book-event-bus.js"

function createApp() {
  const app = new Hono()
  app.route("/api", createBookEventsRoutes(createBookEventBus()))
  app.get("/api/books/:label", (c) => c.json({ label: c.req.param("label") }))
  return app
}

describe("GET /books/events", () => {
  it("opens an SSE stream when the client asks for one", async () => {
    const res = await createApp().request("/api/books/events", {
      headers: { accept: "text/event-stream" },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")
  })

  it("falls through so a book labelled \"events\" is still reachable", async () => {
    const res = await createApp().request("/api/books/events")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ label: "events" })
  })
})
