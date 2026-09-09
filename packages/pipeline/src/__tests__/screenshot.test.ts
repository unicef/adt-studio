import { afterEach, describe, expect, it, vi } from "vitest"
import {
  DEFAULT_SCREENSHOT_TIMEOUT_MS,
  _createElectronScreenshotRenderer,
} from "../screenshot.js"

type Listener = (ev: { data: unknown }) => void

function fakeParentPort() {
  const listeners = new Set<Listener>()
  return {
    posted: [] as unknown[],
    listeners,
    postMessage(message: unknown) {
      this.posted.push(message)
    },
    on(_event: "message", listener: Listener) {
      listeners.add(listener)
    },
    off(_event: "message", listener: Listener) {
      listeners.delete(listener)
    },
    reply(data: unknown) {
      for (const listener of [...listeners]) listener({ data })
    },
  }
}

const proc = process as NodeJS.Process & { type?: string; parentPort?: unknown }
const originalType = proc.type
const originalParentPort = proc.parentPort
const originalElectron = process.versions.electron

function stubUtilityProcess(parentPort: unknown) {
  proc.type = "utility"
  proc.parentPort = parentPort
  Object.defineProperty(process.versions, "electron", {
    value: "41.0.0",
    configurable: true,
    writable: true,
  })
}

afterEach(() => {
  proc.type = originalType
  proc.parentPort = originalParentPort
  Object.defineProperty(process.versions, "electron", {
    value: originalElectron,
    configurable: true,
    writable: true,
  })
  vi.useRealTimers()
})

describe("_createElectronScreenshotRenderer", () => {
  it("rejects when the main process never replies", async () => {
    vi.useFakeTimers()
    const port = fakeParentPort()
    stubUtilityProcess(port)
    const renderer = await _createElectronScreenshotRenderer()

    const pending = renderer.screenshot(
      "<p>hi</p>",
      { width: 800, height: 600 },
      { timeoutMs: 1_000 },
    )
    const assertion = expect(pending).rejects.toThrow(/timed out/i)
    await vi.advanceTimersByTimeAsync(1_000 + 5_000 + 1)
    await assertion

    expect(port.listeners.size).toBe(0)
  })

  it("passes the capture budget to the main process", async () => {
    const port = fakeParentPort()
    stubUtilityProcess(port)
    const renderer = await _createElectronScreenshotRenderer()

    const pending = renderer.screenshot("<p>hi</p>", { width: 800, height: 600 })
    const request = port.posted[0] as { id: string; timeoutMs?: number }
    expect(request.timeoutMs).toBe(DEFAULT_SCREENSHOT_TIMEOUT_MS)

    port.reply({
      type: "screenshot-base64-reply",
      id: request.id,
      base64: "aGVsbG8=",
    })
    await expect(pending).resolves.toBe("aGVsbG8=")
  })

  it("clears the backstop timer once a reply arrives", async () => {
    vi.useFakeTimers()
    const port = fakeParentPort()
    stubUtilityProcess(port)
    const renderer = await _createElectronScreenshotRenderer()

    const pending = renderer.screenshot(
      "<p>hi</p>",
      { width: 800, height: 600 },
      { timeoutMs: 1_000 },
    )
    const request = port.posted[0] as { id: string }
    port.reply({
      type: "screenshot-base64-reply",
      id: request.id,
      base64: "aGVsbG8=",
    })
    await expect(pending).resolves.toBe("aGVsbG8=")

    expect(vi.getTimerCount()).toBe(0)
    expect(port.listeners.size).toBe(0)
  })
})
