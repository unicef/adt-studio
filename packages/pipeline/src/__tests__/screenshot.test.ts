import { describe, expect, it, vi } from "vitest"
import {
  limitScreenshotConcurrency,
  type ScreenshotRenderer,
} from "../screenshot.js"

describe("limitScreenshotConcurrency", () => {
  it("caps concurrent captures across the shared renderer", async () => {
    let active = 0
    let peak = 0
    const base: ScreenshotRenderer = {
      async screenshot(html) {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
        return html
      },
      close: vi.fn(async () => {}),
    }
    const renderer = limitScreenshotConcurrency(base, 2)

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) => renderer.screenshot(String(index))),
    )

    expect(results).toEqual(["0", "1", "2", "3", "4", "5", "6", "7"])
    expect(peak).toBe(2)
  })

  it("removes an aborted capture while it is waiting for a slot", async () => {
    let releaseFirst!: () => void
    const firstFinished = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const base: ScreenshotRenderer = {
      async screenshot(html) {
        if (html === "first") await firstFinished
        return html
      },
      close: vi.fn(async () => {}),
    }
    const renderer = limitScreenshotConcurrency(base, 1)
    const first = renderer.screenshot("first")
    const controller = new AbortController()
    const queued = renderer.screenshot("queued", undefined, { signal: controller.signal })

    controller.abort(new Error("cancelled"))
    await expect(queued).rejects.toThrow("cancelled")
    releaseFirst()
    await expect(first).resolves.toBe("first")
  })
})
