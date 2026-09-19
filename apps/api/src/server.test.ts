import { afterEach, describe, expect, it, vi } from "vitest"
import { startServer } from "./server.js"

const baseOptions = {
  cleanupFn: () => {},
  booksDirPath: "/tmp/books",
  fetchHandler: (() => new Response()) as typeof globalThis.fetch,
  log: () => {},
}

describe("startServer", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("binds the desktop API to loopback so it is not reachable over the network", () => {
    vi.stubEnv("ADT_ENVIRONMENT", "electron")
    const serveFn = vi.fn(() => ({}))

    startServer({ ...baseOptions, serveFn })

    expect(serveFn.mock.calls[0]?.[0]).toMatchObject({ hostname: "127.0.0.1" })
  })

  it("leaves the hostname unset outside Electron so container networking still works", () => {
    vi.stubEnv("ADT_ENVIRONMENT", "")
    const serveFn = vi.fn(() => ({}))

    startServer({ ...baseOptions, serveFn, port: 3001 })

    expect(serveFn.mock.calls[0]?.[0]).not.toHaveProperty("hostname")
  })

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
