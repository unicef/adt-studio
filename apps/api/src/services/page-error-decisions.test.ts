import { describe, it, expect, vi, afterEach } from "vitest"
import { createBookEventBus } from "./book-event-bus.js"
import { createPageErrorDecisions } from "./page-error-decisions.js"

const LABEL = "book-1"

function withListener() {
  const bus = createBookEventBus()
  const unsub = bus.addListener(LABEL, () => {})
  return { bus, unsub }
}

afterEach(() => {
  vi.useRealTimers()
})

describe("page-error decisions broker", () => {
  it("resolves with the user's choice (skip / stop)", async () => {
    const { bus } = withListener()
    const broker = createPageErrorDecisions(bus)

    const p = broker.requestDecision({ label: LABEL, step: "web-rendering", pageId: "pg001", error: "x" })
    const pending = broker.getPendingDecisions(LABEL)
    expect(pending).toHaveLength(1)
    expect(broker.resolveDecision(pending[0].decisionId, "skip")).toBe(true)
    await expect(p).resolves.toBe("skip")
    expect(broker.getPendingDecisions(LABEL)).toHaveLength(0)
  })

  it("applyToAll auto-resolves subsequent decisions without prompting", async () => {
    const { bus } = withListener()
    const broker = createPageErrorDecisions(bus)

    const p1 = broker.requestDecision({ label: LABEL, step: "web-rendering", pageId: "pg001", error: "x" })
    const id1 = broker.getPendingDecisions(LABEL)[0].decisionId
    broker.resolveDecision(id1, "skip", true)
    await expect(p1).resolves.toBe("skip")

    // No prompt for the next one — resolves immediately from the bulk policy.
    const p2 = broker.requestDecision({ label: LABEL, step: "web-rendering", pageId: "pg002", error: "y" })
    await expect(p2).resolves.toBe("skip")
    expect(broker.getPendingDecisions(LABEL)).toHaveLength(0)
  })

  it("resolveDecision on an unknown id returns false", () => {
    const { bus } = withListener()
    const broker = createPageErrorDecisions(bus)
    expect(broker.resolveDecision("nope", "stop")).toBe(false)
  })

  it("clearForRun resolves pending as stop and drops the bulk policy", async () => {
    const { bus } = withListener()
    const broker = createPageErrorDecisions(bus)

    const p = broker.requestDecision({ label: LABEL, step: "captions", pageId: "pg001", error: "x" })
    broker.clearForRun(LABEL, "stop")
    await expect(p).resolves.toBe("stop")
    expect(broker.getPendingDecisions(LABEL)).toHaveLength(0)
  })

  it("with no listener, falls back to stop only after the grace period", async () => {
    vi.useFakeTimers()
    const bus = createBookEventBus() // no listener
    const broker = createPageErrorDecisions(bus)

    const p = broker.requestDecision({ label: LABEL, step: "web-rendering", pageId: "pg001", error: "x" })
    // Consultable immediately from the start of the grace period.
    expect(broker.getPendingDecisions(LABEL)).toHaveLength(1)

    // Still pending well before the grace period elapses.
    await vi.advanceTimersByTimeAsync(5_000)
    expect(broker.getPendingDecisions(LABEL)).toHaveLength(1)

    // After ~30s with no listener, resolves stop.
    await vi.advanceTimersByTimeAsync(30_000)
    await expect(p).resolves.toBe("stop")
  })

  it("a listener reconnecting within the grace period keeps the decision pending", async () => {
    vi.useFakeTimers()
    const bus = createBookEventBus()
    const broker = createPageErrorDecisions(bus)

    const p = broker.requestDecision({ label: LABEL, step: "web-rendering", pageId: "pg001", error: "x" })
    // Listener appears after 2s (within grace).
    await vi.advanceTimersByTimeAsync(2_000)
    const unsub = bus.addListener(LABEL, () => {})
    await vi.advanceTimersByTimeAsync(2_000)

    // Grace window passing no longer resolves it — it's on the 10-min timeout now.
    await vi.advanceTimersByTimeAsync(60_000)
    expect(broker.getPendingDecisions(LABEL)).toHaveLength(1)

    // The 10-minute safety timeout still resolves stop eventually.
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    await expect(p).resolves.toBe("stop")
    unsub()
  })

  it("resolves stop via the safety timeout when a listener is connected but idle", async () => {
    vi.useFakeTimers()
    const bus = createBookEventBus()
    bus.addListener(LABEL, () => {})
    const broker = createPageErrorDecisions(bus)

    const p = broker.requestDecision({ label: LABEL, step: "web-rendering", pageId: "pg001", error: "x" })
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    await expect(p).resolves.toBe("stop")
  })
})
