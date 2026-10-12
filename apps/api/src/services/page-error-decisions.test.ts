import { describe, it, expect, vi, afterEach } from "vitest"
import { createBookEventBus } from "./book-event-bus.js"
import { createPageErrorDecisions } from "./page-error-decisions.js"

const LABEL = "book-1"
const RUN = "run-1"

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
    broker.beginRun(LABEL, RUN)

    const p = broker.requestDecision({ label: LABEL, runId: RUN, step: "web-rendering", pageId: "pg001", error: "x" })
    const pending = broker.getPendingDecisions(LABEL)
    expect(pending).toHaveLength(1)
    expect(broker.resolveDecision(LABEL, { decisionId: pending[0].decisionId, action: "skip" })).toBe(true)
    await expect(p).resolves.toBe("skip")
    expect(broker.getPendingDecisions(LABEL)).toHaveLength(0)
  })

  it("applyToAll auto-resolves subsequent decisions without prompting", async () => {
    const { bus } = withListener()
    const broker = createPageErrorDecisions(bus)
    broker.beginRun(LABEL, RUN)

    const p1 = broker.requestDecision({ label: LABEL, runId: RUN, step: "web-rendering", pageId: "pg001", error: "x" })
    const id1 = broker.getPendingDecisions(LABEL)[0].decisionId
    broker.resolveDecision(LABEL, { decisionId: id1, action: "skip", applyToAll: true })
    await expect(p1).resolves.toBe("skip")

    // No prompt for the next one — resolves immediately from the bulk policy.
    const p2 = broker.requestDecision({ label: LABEL, runId: RUN, step: "web-rendering", pageId: "pg002", error: "y" })
    await expect(p2).resolves.toBe("skip")
    expect(broker.getPendingDecisions(LABEL)).toHaveLength(0)
  })

  it("resolveDecision on an unknown id returns false", () => {
    const { bus } = withListener()
    const broker = createPageErrorDecisions(bus)
    broker.beginRun(LABEL, RUN)
    expect(broker.resolveDecision(LABEL, { decisionId: "nope", action: "stop" })).toBe(false)
  })

  it("clearForRun resolves pending as stop and drops the bulk policy", async () => {
    const { bus } = withListener()
    const broker = createPageErrorDecisions(bus)
    broker.beginRun(LABEL, RUN)

    const p = broker.requestDecision({ label: LABEL, runId: RUN, step: "captions", pageId: "pg001", error: "x" })
    broker.clearForRun(LABEL, "stop")
    await expect(p).resolves.toBe("stop")
    expect(broker.getPendingDecisions(LABEL)).toHaveLength(0)
  })

  it("with no listener, falls back to stop only after the grace period", async () => {
    vi.useFakeTimers()
    const bus = createBookEventBus() // no listener
    const broker = createPageErrorDecisions(bus)
    broker.beginRun(LABEL, RUN)

    const p = broker.requestDecision({ label: LABEL, runId: RUN, step: "web-rendering", pageId: "pg001", error: "x" })
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
    broker.beginRun(LABEL, RUN)

    const p = broker.requestDecision({ label: LABEL, runId: RUN, step: "web-rendering", pageId: "pg001", error: "x" })
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
    broker.beginRun(LABEL, RUN)

    const p = broker.requestDecision({ label: LABEL, runId: RUN, step: "web-rendering", pageId: "pg001", error: "x" })
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    await expect(p).resolves.toBe("stop")
  })
})

describe("run ownership and reconnect", () => {
  it("does not leak bulk policy or accept a late callback from an ended run", async () => {
    const { bus } = withListener()
    const broker = createPageErrorDecisions(bus)
    broker.beginRun(LABEL, "one")
    const one = broker.requestDecision({ label: LABEL, runId: "one", step: "web-rendering", pageId: "pg001", error: "x" })
    broker.resolveDecision(LABEL, { decisionId: broker.getPendingDecisions(LABEL)[0].decisionId, action: "skip", applyToAll: true })
    await expect(one).resolves.toBe("skip")
    broker.clearForRun(LABEL)
    broker.beginRun(LABEL, "two")
    await expect(broker.requestDecision({ label: LABEL, runId: "one", step: "web-rendering", pageId: "pg002", error: "x" })).resolves.toBe("stop")
    const two = broker.requestDecision({ label: LABEL, runId: "two", step: "web-rendering", pageId: "pg001", error: "x" })
    expect(broker.getPendingDecisions(LABEL)).toHaveLength(1)
    broker.clearForRun(LABEL, "stop", "one") // late cleanup must not stop the newer run
    expect(broker.getPendingDecisions(LABEL)).toHaveLength(1)
    broker.clearForRun(LABEL)
    await expect(two).resolves.toBe("stop")
  })
  it("allows a short disconnect but stops after the listener grace expires", async () => {
    vi.useFakeTimers()
    const { bus, unsub } = withListener()
    const broker = createPageErrorDecisions(bus)
    broker.beginRun(LABEL, "run")
    const pending = broker.requestDecision({ label: LABEL, runId: "run", step: "image-meaningfulness", pageId: "pg001", error: "x" })
    const initial = broker.getPendingDecisions(LABEL)
    unsub()
    await vi.advanceTimersByTimeAsync(20_000)
    const disconnect = bus.addListener(LABEL, () => {})
    await vi.advanceTimersByTimeAsync(2_000)
    expect(broker.getPendingDecisions(LABEL)).toEqual(initial)
    disconnect()
    await vi.advanceTimersByTimeAsync(31_000)
    await expect(pending).resolves.toBe("stop")
    expect(broker.getPendingDecisions(LABEL)).toEqual([])
  })
  it("rejects a cancelled run and a decision from a previous process", async () => {
    const { bus } = withListener()
    const broker = createPageErrorDecisions(bus)
    const controller = new AbortController()
    broker.beginRun(LABEL, "run", controller.signal)
    const pending = broker.requestDecision({ label: LABEL, runId: "run", step: "image-meaningfulness", pageId: "pg001", error: "x" })
    const body = { decisionId: broker.getPendingDecisions(LABEL)[0].decisionId, action: "skip" as const }
    controller.abort()
    expect(broker.resolveDecision(LABEL, body)).toBe(false)
    const restarted = createPageErrorDecisions(bus)
    restarted.beginRun(LABEL, "new")
    expect(restarted.resolveDecision(LABEL, body)).toBe(false)
    broker.clearForRun(LABEL)
    await expect(pending).resolves.toBe("stop")
  })
})
