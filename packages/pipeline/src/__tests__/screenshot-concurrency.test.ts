import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { createSemaphore } from "../concurrency.js"
import {
  _withCaptureLimit,
  _resetCaptureSemaphore,
  resolveScreenshotConcurrency,
  type ScreenshotRenderer,
} from "../screenshot.js"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe("createSemaphore", () => {
  it("never runs more than `limit` tasks at once", async () => {
    const semaphore = createSemaphore(3)
    let active = 0
    let peak = 0

    await Promise.all(
      Array.from({ length: 20 }, () =>
        semaphore.run(async () => {
          active++
          peak = Math.max(peak, active)
          await new Promise((r) => setTimeout(r, 1))
          active--
        })
      )
    )

    expect(peak).toBe(3)
    expect(semaphore.active).toBe(0)
    expect(semaphore.queued).toBe(0)
  })

  it("releases the slot when a task throws", async () => {
    const semaphore = createSemaphore(1)

    await expect(semaphore.run(async () => {
      throw new Error("boom")
    })).rejects.toThrow("boom")

    expect(semaphore.active).toBe(0)
    await expect(semaphore.run(async () => "ok")).resolves.toBe("ok")
  })

  it("runs queued tasks in FIFO order", async () => {
    const semaphore = createSemaphore(1)
    const order: number[] = []

    await Promise.all(
      [1, 2, 3, 4].map((n) =>
        semaphore.run(async () => {
          order.push(n)
          await new Promise((r) => setTimeout(r, 1))
        })
      )
    )

    expect(order).toEqual([1, 2, 3, 4])
  })

  it("coerces invalid limits to at least 1", async () => {
    expect(createSemaphore(0).limit).toBe(1)
    expect(createSemaphore(-5).limit).toBe(1)
    expect(createSemaphore(2.9).limit).toBe(2)
  })
})

describe("resolveScreenshotConcurrency", () => {
  const original = process.env.ADT_SCREENSHOT_CONCURRENCY

  afterEach(() => {
    if (original === undefined) delete process.env.ADT_SCREENSHOT_CONCURRENCY
    else process.env.ADT_SCREENSHOT_CONCURRENCY = original
  })

  it("honours the env override", () => {
    process.env.ADT_SCREENSHOT_CONCURRENCY = "3"
    expect(resolveScreenshotConcurrency()).toBe(3)
  })

  it("ignores a non-numeric or out-of-range override", () => {
    process.env.ADT_SCREENSHOT_CONCURRENCY = "not-a-number"
    const fallback = resolveScreenshotConcurrency()
    expect(fallback).toBeGreaterThanOrEqual(2)
    expect(fallback).toBeLessThanOrEqual(8)

    process.env.ADT_SCREENSHOT_CONCURRENCY = "0"
    expect(resolveScreenshotConcurrency()).toBe(fallback)
  })

  it("stays within the tuned 2-8 band by default", () => {
    delete process.env.ADT_SCREENSHOT_CONCURRENCY
    const n = resolveScreenshotConcurrency()
    expect(n).toBeGreaterThanOrEqual(2)
    expect(n).toBeLessThanOrEqual(8)
  })
})

describe("_withCaptureLimit", () => {
  const original = process.env.ADT_SCREENSHOT_CONCURRENCY

  beforeEach(() => {
    process.env.ADT_SCREENSHOT_CONCURRENCY = "2"
    _resetCaptureSemaphore()
  })

  afterEach(() => {
    if (original === undefined) delete process.env.ADT_SCREENSHOT_CONCURRENCY
    else process.env.ADT_SCREENSHOT_CONCURRENCY = original
    _resetCaptureSemaphore()
  })

  function trackingRenderer() {
    let active = 0
    let peak = 0
    let closed = false
    const renderer: ScreenshotRenderer = {
      async screenshot() {
        active++
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 2))
        active--
        return "base64"
      },
      async close() {
        closed = true
      },
    }
    return {
      renderer,
      peak: () => peak,
      closed: () => closed,
    }
  }

  it("caps concurrent captures regardless of caller concurrency", async () => {
    const tracked = trackingRenderer()
    const limited = _withCaptureLimit(tracked.renderer)

    await Promise.all(Array.from({ length: 30 }, () => limited.screenshot("<p>hi</p>")))

    expect(tracked.peak()).toBe(2)
  })

  it("shares the cap across separate renderer instances", async () => {
    let active = 0
    let peak = 0
    const make = (): ScreenshotRenderer => ({
      async screenshot() {
        active++
        peak = Math.max(peak, active)
        await new Promise((r) => setTimeout(r, 2))
        active--
        return "base64"
      },
      async close() {},
    })

    const a = _withCaptureLimit(make())
    const b = _withCaptureLimit(make())

    await Promise.all([
      ...Array.from({ length: 10 }, () => a.screenshot("<p>a</p>")),
      ...Array.from({ length: 10 }, () => b.screenshot("<p>b</p>")),
    ])

    expect(peak).toBe(2)
  })

  it("forwards html, viewport and options to the underlying renderer", async () => {
    const calls: Array<[string, unknown, unknown]> = []
    const limited = _withCaptureLimit({
      async screenshot(html, viewport, options) {
        calls.push([html, viewport, options])
        return "base64"
      },
      async close() {},
    })

    const controller = new AbortController()
    await limited.screenshot("<p>hi</p>", { width: 390, height: 844 }, { signal: controller.signal })

    expect(calls).toEqual([
      ["<p>hi</p>", { width: 390, height: 844 }, { signal: controller.signal }],
    ])
  })

  it("rejects without consuming a slot when already aborted", async () => {
    const tracked = trackingRenderer()
    const limited = _withCaptureLimit(tracked.renderer)
    const controller = new AbortController()
    controller.abort(new Error("cancelled"))

    await expect(
      limited.screenshot("<p>hi</p>", undefined, { signal: controller.signal })
    ).rejects.toThrow("cancelled")
    expect(tracked.peak()).toBe(0)
  })

  it("immediately removes and rejects a queued capture aborted while waiting", async () => {
    const gate = deferred<void>()
    let started = 0
    const limited = _withCaptureLimit({
      async screenshot() {
        started++
        await gate.promise
        return "base64"
      },
      async close() {},
    })

    const holding = [limited.screenshot("<p>1</p>"), limited.screenshot("<p>2</p>")]
    await new Promise((r) => setTimeout(r, 0))
    expect(started).toBe(2)

    const controller = new AbortController()
    const queued = limited.screenshot("<p>3</p>", undefined, { signal: controller.signal })
    const assertion = expect(queued).rejects.toThrow("cancelled")
    controller.abort(new Error("cancelled"))

    await assertion
    expect(started).toBe(2)

    gate.resolve()
    await Promise.all(holding)
  })

  it("releases the slot when the underlying capture fails", async () => {
    let calls = 0
    const limited = _withCaptureLimit({
      async screenshot() {
        calls++
        if (calls === 1) throw new Error("capture failed")
        return "base64"
      },
      async close() {},
    })

    await expect(limited.screenshot("<p>hi</p>")).rejects.toThrow("capture failed")
    await expect(limited.screenshot("<p>hi</p>")).resolves.toBe("base64")
  })

  it("delegates close to the underlying renderer", async () => {
    const tracked = trackingRenderer()
    await _withCaptureLimit(tracked.renderer).close()
    expect(tracked.closed()).toBe(true)
  })
})
