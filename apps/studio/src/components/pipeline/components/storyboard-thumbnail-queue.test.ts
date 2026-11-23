import { expect, it, vi } from "vitest"
import { createStoryboardThumbnailQueue } from "./storyboard-thumbnail-queue"
const flush = () => Promise.resolve()
it("waits for the current preview and prioritizes visible work within the concurrency bound", async () => {
  const queue = createStoryboardThumbnailQueue(), scope = {}
  queue.setScope(scope, true)
  const order: string[] = [], finishes: Array<() => void> = []
  for (const [name, priority] of [["overscan", 3], ["visible", 2], ["active", 1]] as const) {
    queue.enqueue(priority, finish => { order.push(name); finishes.push(finish) })
  }
  await flush()
  expect(order).toEqual([])
  queue.ready(scope)
  await flush()
  expect(order).toEqual(["active", "visible"])
  finishes[0]()
  await flush()
  expect(order).toEqual(["active", "visible", "overscan"])
})
it("pauses new work during navigation and ignores old readiness, including return navigation", async () => {
  const queue = createStoryboardThumbnailQueue(1), a = {}, b = {}, aAgain = {}
  const first = vi.fn(), next = vi.fn()
  queue.setScope(a, true); queue.enqueue(1, first); queue.ready(a); await flush()
  queue.enqueue(1, next)
  queue.setScope(b, true)
  first.mock.calls[0][0]()
  queue.ready(a); await flush()
  expect(next).not.toHaveBeenCalled()
  queue.setScope(aAgain, true); queue.ready(a); queue.ready(b); await flush()
  expect(next).not.toHaveBeenCalled()
  queue.ready(aAgain); await flush()
  expect(next).toHaveBeenCalledTimes(1)
})
it("removes obsolete work and allows hovered queued rows to jump ahead", async () => {
  const queue = createStoryboardThumbnailQueue(1), scope = {}, discarded = vi.fn(), hover = vi.fn(), other = vi.fn()
  const cancelled = queue.enqueue(1, discarded), ordinary = queue.enqueue(2, other), hovered = queue.enqueue(3, hover)
  cancelled.cancel(); hovered.prioritize(0); queue.setScope(scope, false); await flush()
  expect(discarded).not.toHaveBeenCalled(); expect(other).not.toHaveBeenCalled(); expect(hover).toHaveBeenCalledTimes(1)
  hovered.cancel(); await flush(); expect(other).toHaveBeenCalledTimes(1)
  // An old load/error callback cannot release a newer active request.
  hover.mock.calls[0][0](); queue.enqueue(3, discarded); await flush(); expect(discarded).not.toHaveBeenCalled()
  ordinary.cancel(); await flush(); expect(discarded).toHaveBeenCalledTimes(1)
})
it("releases empty/error views without a preview or a fixed delay", async () => {
  const queue = createStoryboardThumbnailQueue(), start = vi.fn()
  queue.enqueue(1, start); queue.setScope({}, false); await flush()
  expect(start).toHaveBeenCalledTimes(1)
})
