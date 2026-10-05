import { describe, expect, it } from "vitest"
import { Hono } from "hono"
import { createBookEventsRoutes } from "./book-events.js"
import { createBookEventBus } from "../services/book-event-bus.js"

function createApp(bus = createBookEventBus()) {
  const app = new Hono()
  app.route("/api", createBookEventsRoutes(bus))
  app.get("/api/books/:label", (c) => c.json({ label: c.req.param("label") }))
  return { app, bus }
}

async function collect(bus: ReturnType<typeof createBookEventBus>, emit: () => void) {
  const res = await createApp(bus).app.request("/api/books/events", {
    headers: { accept: "text/event-stream" },
  })
  const reader = res.body!.getReader()
  emit()

  let text = ""
  const deadline = Date.now() + 1_000
  while (Date.now() < deadline) {
    const chunk = await Promise.race([
      reader.read(),
      new Promise<{ value?: Uint8Array }>((r) => setTimeout(() => r({}), 150)),
    ])
    if (!chunk.value) break
    text += new TextDecoder().decode(chunk.value)
  }
  await reader.cancel()
  return text
}

describe("GET /books/events", () => {
  it("opens an SSE stream when the client asks for one", async () => {
    const res = await createApp().app.request("/api/books/events", {
      headers: { accept: "text/event-stream" },
    })

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/event-stream")
  })

  it("falls through so a book labelled \"events\" is still reachable", async () => {
    const res = await createApp().app.request("/api/books/events")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ label: "events" })
  })
})

describe("global stream payload", () => {
  it("forwards terminal run events with their book label", async () => {
    const bus = createBookEventBus()
    const text = await collect(bus, () => {
      bus.emit("my-book", {
        type: "progress",
        data: { type: "stage-complete", stage: "sectioning" },
      })
    })

    expect(text).toContain("event: progress")
    expect(text).toContain('"label":"my-book"')
    expect(text).toContain('"stage":"sectioning"')
  })

  it("drops the progress firehose the notification client never reads", async () => {
    const bus = createBookEventBus()
    const text = await collect(bus, () => {
      bus.emit("my-book", {
        type: "progress",
        data: { type: "llm-log", step: "page-sectioning", entry: { prompt: "x".repeat(50) } },
      } as never)
      bus.emit("my-book", {
        type: "progress",
        data: { type: "step-progress", step: "page-sectioning", message: "half way" },
      } as never)
    })

    expect(text).not.toContain("llm-log")
    expect(text).not.toContain("step-progress")
  })
})
