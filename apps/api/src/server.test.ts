import net from "node:net"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CONNECTION_ATTEMPT_TIMEOUT_MS } from "@adt/llm"
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

  // Node, Docker and the desktop utility process all start the API here, so
  // this is the one place the connection defaults have to be applied (#1067).
  it("applies the outbound connection defaults before serving", () => {
    const nodeDefault = net.getDefaultAutoSelectFamilyAttemptTimeout()
    let appliedBeforeServe: number | undefined
    const serveFn = vi.fn(() => {
      appliedBeforeServe = net.getDefaultAutoSelectFamilyAttemptTimeout()
      return {}
    })

    try {
      net.setDefaultAutoSelectFamilyAttemptTimeout(250)
      startServer({ ...baseOptions, serveFn, port: 3001 })
      expect(appliedBeforeServe).toBe(CONNECTION_ATTEMPT_TIMEOUT_MS)
    } finally {
      net.setDefaultAutoSelectFamilyAttemptTimeout(nodeDefault)
    }
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
