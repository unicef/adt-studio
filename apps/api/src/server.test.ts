import { describe, expect, it, vi } from "vitest"
import { startServer } from "./server.js"

describe("startServer", () => {
  it("runs cleanup once before starting the server", () => {
    const order: string[] = []
    const cleanupFn = vi.fn(() => {
      order.push("cleanup")
    })
    const serveFn = vi.fn(() => {
      order.push("serve")
      return {}
    })

    startServer({
      cleanupFn,
      serveFn,
      booksDirPath: "/tmp/books",
      fetchHandler: (() => new Response()) as typeof globalThis.fetch,
      port: 3001,
      log: () => {},
    })

    expect(cleanupFn).toHaveBeenCalledTimes(1)
    expect(cleanupFn).toHaveBeenCalledWith("/tmp/books")
    expect(serveFn).toHaveBeenCalledTimes(1)
    expect(order).toEqual(["cleanup", "serve"])
  })
})
